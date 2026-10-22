import type { ChangeEvent, FC } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  clearOrcaCredential,
  getOrcaCredentials,
  getOrcaModels,
  saveOrcaCredential
} from '../../api/httpClient';
import type {
  OrcaCatalog,
  OrcaCredentialStatus,
  OrcaModel
} from '../../interfaces/OrcaRouter';
import './orcarouter-panel.css';

export const ORCAROUTER_PROVIDER_ID = 'orcarouter-cyber';
export const LEGACY_PROVIDER_ID = 'legacy-chat';

export interface OrcaRouterPanelProps {
  providerId: string;
  modelId: string | undefined;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string | undefined) => void;
  onCatalogChange?: (catalog: OrcaCatalog | null) => void;
}

const describeModel = (model: OrcaModel): string => {
  const parts: string[] = [];
  if (model.contextLength) {
    parts.push(`${Math.round(model.contextLength / 1000)}k ctx`);
  }
  if (model.reasoning) {
    parts.push('reasoning');
  }
  if (model.inputModalities.includes('image')) {
    parts.push('image input');
  }
  return parts.join(' · ');
};

const isOrcaModel = (catalog: OrcaCatalog | null, modelId: string): boolean =>
  Boolean(catalog?.models.some((model) => model.id === modelId));

/**
 * Provider + credential + model controls for OrcaRouter Cyber Inference.
 *
 * The model list always comes from the backend catalog; there is no free-text
 * model field. When the selected model disappears from the catalog it is
 * cleared and the user is told to pick again.
 */
export const OrcaRouterPanel: FC<OrcaRouterPanelProps> = ({
  providerId,
  modelId,
  onProviderChange,
  onModelChange,
  onCatalogChange
}) => {
  const [catalog, setCatalog] = useState<OrcaCatalog | null>(null);
  const [credential, setCredential] = useState<OrcaCredentialStatus | null>(
    null
  );
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonId = useId();
  const currentModelRef = useRef(modelId);
  currentModelRef.current = modelId;

  const isOrcaRouter = providerId === ORCAROUTER_PROVIDER_ID;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getOrcaModels('chat');
      if (!next || !Array.isArray(next.models)) {
        throw new Error('catalog unavailable');
      }
      setCatalog(next);
      onCatalogChange?.(next);

      if (next.models.length === 0) {
        onModelChange(undefined);
        return;
      }
      const selected = currentModelRef.current;
      if (!selected || !isOrcaModel(next, selected)) {
        if (selected) {
          setNotice(
            'The previously selected model is not available for this credential. Choose another model.'
          );
        }
        onModelChange(next.defaultModel ?? next.models[0]?.id);
      }
    } catch {
      setCatalog(null);
      onCatalogChange?.(null);
      setError(
        'Could not load the OrcaRouter model catalog. Check the API key and retry.'
      );
    } finally {
      setLoading(false);
    }
  }, [onCatalogChange, onModelChange]);

  const loadCredential = useCallback(async () => {
    try {
      const status = await getOrcaCredentials();
      if (status && typeof status.configured === 'boolean') {
        setCredential(status);
      }
    } catch {
      setCredential(null);
    }
  }, []);

  useEffect(() => {
    if (!isOrcaRouter) {
      setCatalog(null);
      onCatalogChange?.(null);
      return;
    }
    void loadCredential();
    void loadCatalog();
  }, [isOrcaRouter, loadCatalog, loadCredential, onCatalogChange]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocumentClick = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [menuOpen]);

  const handleProviderChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setMenuOpen(false);
    setNotice(null);
    setError(null);
    onProviderChange(event.target.value);
  };

  const handleSaveKey = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const status = await saveOrcaCredential(apiKeyInput);
      setCredential(status);
      setApiKeyInput('');
      setNotice('API key saved for this process. Reloading the model catalog…');
      await loadCatalog();
    } catch {
      setError(
        'The API key was rejected. It must start with "sk-orca-" and contain no spaces.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const status = await clearOrcaCredential();
      setCredential(status);
      setNotice('OrcaRouter credential cleared.');
      await loadCatalog();
    } catch {
      setError('Could not clear the OrcaRouter credential.');
    } finally {
      setSaving(false);
    }
  };

  const selectedModel = catalog?.models.find((model) => model.id === modelId);
  const availableModels = catalog?.models ?? [];

  return (
    <div className="orca-panel" data-testid="orca-panel">
      <div className="orca-panel__row">
        <div className="orca-field">
          <label htmlFor="orca-provider">Provider</label>
          <select
            id="orca-provider"
            className="orca-input"
            data-testid="orca-provider-select"
            value={providerId}
            onChange={handleProviderChange}
          >
            <option value={ORCAROUTER_PROVIDER_ID}>
              OrcaRouter Cyber Inference
            </option>
            <option value={LEGACY_PROVIDER_ID}>
              Built-in chat (mock / CHAT_API_*)
            </option>
          </select>
        </div>

        {isOrcaRouter && (
          <div className="orca-field orca-field--grow">
            <label htmlFor="orca-model-trigger">Model</label>
            <div className="orca-model" ref={menuRef}>
              <button
                id="orca-model-trigger"
                type="button"
                className="orca-model__trigger"
                data-testid="orca-model-trigger"
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-controls={modelButtonId}
                disabled={loading || availableModels.length === 0}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span>{modelId ?? 'No model available'}</span>
                <span aria-hidden="true">▾</span>
              </button>
              {menuOpen && (
                <ul
                  id={modelButtonId}
                  role="listbox"
                  className="orca-model__menu"
                  data-testid="orca-model-menu"
                >
                  {availableModels.map((model) => (
                    <li key={model.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={model.id === modelId}
                        className={`orca-model__option${
                          model.id === modelId
                            ? ' orca-model__option--selected'
                            : ''
                        }`}
                        data-testid="orca-model-option"
                        onClick={() => {
                          onModelChange(model.id);
                          setMenuOpen(false);
                          setNotice(null);
                        }}
                      >
                        <span className="orca-model__id">{model.id}</span>
                        <span className="orca-model__meta">
                          {describeModel(model)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {isOrcaRouter && (
        <div className="orca-credential">
          <div className="orca-credential__status">
            {credential?.configured ? (
              <span data-testid="orca-credential-status">
                Connected · <code>{credential.masked}</code> (
                {credential.source === 'env' ? 'environment' : 'this session'})
              </span>
            ) : (
              <span data-testid="orca-credential-status">
                No OrcaRouter key configured
              </span>
            )}
          </div>

          <div className="orca-credential__form">
            <label htmlFor="orca-api-key" className="orca-credential__label">
              API Key
            </label>
            <input
              id="orca-api-key"
              type="password"
              autoComplete="off"
              className="orca-input"
              data-testid="orca-api-key-input"
              placeholder="sk-orca-…"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
            />
            <button
              type="button"
              className="au-btn au-btn--green"
              data-testid="orca-save-key"
              disabled={saving || apiKeyInput.trim().length === 0}
              onClick={() => void handleSaveKey()}
            >
              Save key
            </button>
            <button
              type="button"
              className="au-btn orca-btn--secondary"
              data-testid="orca-clear-key"
              disabled={saving || !credential?.configured}
              onClick={() => void handleClearKey()}
            >
              Clear
            </button>
          </div>

          <a
            className="orca-credential__link"
            href="https://www.orcarouter.ai/cyber"
            target="_blank"
            rel="noreferrer noopener"
          >
            OrcaRouter Cyber Inference
          </a>
          {' · '}
          <a
            className="orca-credential__link"
            href="https://www.orcarouter.ai/models?tier=cyber"
            target="_blank"
            rel="noreferrer noopener"
          >
            Cyber model catalog
          </a>
        </div>
      )}

      {isOrcaRouter && catalog && (
        <p className="orca-panel__hint" data-testid="orca-catalog-status">
          {catalog.source === 'live'
            ? `${catalog.count} models from the live OrcaRouter catalog`
            : `${catalog.count} verified fallback models — live catalog unavailable${catalog.degraded ? ' (degraded)' : ''}`}
          {selectedModel?.reasoning && selectedModel.reasoningEfforts.length > 0
            ? ` · reasoning efforts: ${selectedModel.reasoningEfforts.join(', ')}`
            : ''}
        </p>
      )}

      {error && (
        <p className="orca-panel__error" role="alert" data-testid="orca-error">
          {error}
        </p>
      )}
      {notice && <p className="orca-panel__notice">{notice}</p>}
    </div>
  );
};

export default OrcaRouterPanel;
