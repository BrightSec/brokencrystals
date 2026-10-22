#!/usr/bin/env python3
"""Capture real UI evidence for the OrcaRouter Cyber Inference provider.

Boots the provider module through tools/orca-evidence/server.mjs, drives the
built React client with headless Chromium, and writes orca-evidence/ with
manifest.json plus the screenshots used in the pull request.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_DIR = REPO_ROOT / "orca-evidence"
BASE_URL = "http://127.0.0.1:3000"
CATALOG_URL = "https://api.orcarouter.ai/v1/models?capability=chat"
FAKE_KEY = "sk-orca-evidenceplaceholdervalue01"


def log(message: str) -> None:
    print(f"[orca-evidence] {message}", flush=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_json(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_server(timeout: float = 45.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            fetch_json("/api/orcarouter/providers")
            return
        except Exception:  # noqa: BLE001 - retry until the server is up
            time.sleep(0.5)
    raise RuntimeError("evidence server did not start")


def start_server() -> subprocess.Popen:
    environment = dict(os.environ)
    environment.setdefault("CHAT_MOCK_ENABLED", "false")
    process = subprocess.Popen(
        ["node", str(REPO_ROOT / "tools" / "orca-evidence" / "server.mjs")],
        cwd=str(REPO_ROOT),
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        wait_for_server()
    except Exception:
        process.kill()
        output = process.communicate(timeout=10)[0]
        raise RuntimeError(f"server failed to start:\n{output}") from None
    return process


def rgba_is_opaque(value: str) -> bool:
    value = value.strip().lower()
    if not value:
        return False
    if value.startswith("rgb("):
        return True
    if value.startswith("rgba("):
        parts = value[value.index("(") + 1 : value.index(")")].split(",")
        alpha = float(parts[3]) if len(parts) == 4 else 1.0
        return alpha >= 0.99
    if value.startswith("#"):
        return len(value) in (7, 9) and not value.endswith("00")
    return value != "transparent"


def build_repository() -> None:
    """Build the server and the client this evidence run drives.

    The evidence check is self-contained: the verification harness only installs
    dependencies, so the compiled module and the built client are produced here.
    """
    for argv in (
        ["npm", "run", "build"],
        ["npm", "run", "build", "--prefix=client"],
    ):
        log("build: " + " ".join(argv))
        subprocess.run(argv, cwd=str(REPO_ROOT), check=True)


def main() -> int:
    build_repository()
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    server = start_server()
    try:
        providers = fetch_json("/api/orcarouter/providers")
        chat_catalog = fetch_json("/api/orcarouter/models?capability=chat")
        image_catalog = fetch_json("/api/orcarouter/models?capability=image")
        credential = fetch_json("/api/orcarouter/credentials")

        provider = providers["providers"][0]
        assert provider["name"] == "OrcaRouter Cyber Inference", provider
        assert provider["baseUrl"].startswith("https://api.orcarouter.ai"), provider
        assert [m["id"] for m in provider["authMethods"]] == ["api-key"], provider

        log(
            f"catalog source={chat_catalog['source']} count={chat_catalog['count']} "
            f"degraded={chat_catalog['degraded']}"
        )

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path="/usr/bin/chromium",
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--no-proxy-server",
                    "--proxy-bypass-list=127.0.0.1;localhost",
                ],
            )
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                device_scale_factor=1,
            )
            context.add_init_script(
                "sessionStorage.setItem('email', 'orca-evidence@example.test');"
            )
            page = context.new_page()
            page.route(
                "**/*",
                lambda route: route.abort()
                if "127.0.0.1" not in route.request.url
                and "localhost" not in route.request.url
                else route.continue_(),
            )
            page.goto(f"{BASE_URL}/chat", wait_until="commit", timeout=45000)

            panel = page.get_by_test_id("orca-panel")
            panel.wait_for(state="visible", timeout=20000)

            trigger = page.get_by_test_id("orca-model-trigger")
            page.wait_for_function(
                "() => { const el = document.querySelector('[data-testid=\"orca-model-trigger\"]');"
                " return el && !el.disabled; }",
                timeout=20000,
            )
            page.wait_for_timeout(400)  # let the catalog render settle

            key_input = page.get_by_test_id("orca-api-key-input")
            key_input.fill(FAKE_KEY)

            api_key_visible = key_input.is_visible()
            secret_masked = key_input.get_attribute("type") == "password"
            controls_enabled = trigger.is_enabled()

            assert api_key_visible, "API key input is not visible"
            assert secret_masked, "API key input is not masked"
            assert controls_enabled, "model trigger is disabled"
            assert credential["masked"] is None or credential["masked"].startswith(
                "sk-orca-…"
            ), "credential status leaked the key"

            page.evaluate(
                "() => { const panel = document.querySelector('[data-testid=\"orca-panel\"]');"
                " const top = panel.getBoundingClientRect().top;"
                " window.scrollBy(0, top - 132); }"
            )
            page.wait_for_timeout(300)

            page.screenshot(
                path=str(EVIDENCE_DIR / "auth-methods.png"), full_page=False
            )

            trigger.click()
            menu = page.get_by_test_id("orca-model-menu")
            menu.wait_for(state="visible", timeout=10000)

            item_count = page.get_by_test_id("orca-model-option").count()
            assert item_count > 0, "model dropdown is empty"

            styles = menu.evaluate(
                "el => { const s = getComputedStyle(el);"
                " return { background: s.backgroundColor, borderWidth: s.borderTopWidth,"
                " borderColor: s.borderTopColor }; }"
            )
            rects = page.evaluate(
                "() => { const t = document.querySelector('[data-testid=\"orca-model-trigger\"]');"
                " const m = document.querySelector('[data-testid=\"orca-model-menu\"]');"
                " const tr = t.getBoundingClientRect(); const mr = m.getBoundingClientRect();"
                " return { delta: Math.abs(tr.right - mr.right), top: mr.top, bottom: mr.bottom }; }"
            )

            dropdown_open = menu.is_visible()
            opaque_background = rgba_is_opaque(styles["background"])
            visible_border = float(styles["borderWidth"].replace("px", "")) > 0
            right_delta = round(rects["delta"], 2)

            assert dropdown_open, "dropdown did not open"
            assert opaque_background, f"dropdown background not opaque: {styles}"
            assert visible_border, f"dropdown border not visible: {styles}"
            assert right_delta <= 2, f"dropdown right edge delta {right_delta}px"

            page.screenshot(
                path=str(EVIDENCE_DIR / "text-model-dropdown.png"),
                full_page=False,
            )
            browser.close()

        auth_path = EVIDENCE_DIR / "auth-methods.png"
        dropdown_path = EVIDENCE_DIR / "text-model-dropdown.png"
        for artifact in (auth_path, dropdown_path):
            if artifact.stat().st_size < 10_000:
                raise RuntimeError(f"{artifact.name} looks empty")

        auth_ui = {
            "api_key_visible": api_key_visible,
            "secret_masked": secret_masked,
            "controls_enabled": controls_enabled,
        }
        dropdown_ui = {
            "dropdown_open": dropdown_open,
            "item_count": item_count,
            "opaque_background": opaque_background,
            "visible_border": visible_border,
            "trigger_panel_right_delta": right_delta,
        }
        if item_count != chat_catalog["count"]:
            raise RuntimeError(
                "dropdown does not show the measured chat catalog: "
                f"{item_count} of {chat_catalog['count']}"
            )

        manifest = {
            "automation": {
                "framework": "playwright",
                "passed": True,
                "version": "python-playwright",
                "catalog_source": CATALOG_URL,
                "catalog_source_kind": chat_catalog["source"],
                "catalog_degraded": chat_catalog["degraded"],
                "catalog_model_count": chat_catalog["count"],
                "image_model_count": image_catalog["count"],
            },
            "provider": provider["name"],
            "provider_id": provider["id"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "viewport": {"width": 1280, "height": 800},
            "ui": {**auth_ui, **dropdown_ui},
            "artifacts": [
                {
                    "kind": "auth-methods",
                    "path": "auth-methods.png",
                    "sha256": sha256(auth_path),
                    "width": 1280,
                    "height": 800,
                    "auth_methods": ["api-key"],
                    "ui": auth_ui,
                },
                {
                    "kind": "text-model-dropdown",
                    "path": "text-model-dropdown.png",
                    "sha256": sha256(dropdown_path),
                    "width": 1280,
                    "height": 800,
                    "ui": dropdown_ui,
                },
            ],
        }
        (EVIDENCE_DIR / "manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        log(f"wrote {EVIDENCE_DIR / 'manifest.json'} ({item_count} models)")
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
