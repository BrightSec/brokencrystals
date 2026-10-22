import { HttpClientService } from '../httpclient/httpclient.service';
import { OrcaRouterCatalogService } from './orcarouter-catalog.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import { OrcaRouterAuthError } from './orcarouter.errors';
import { OrcaRouterService } from './orcarouter.service';

/**
 * Live wiring test. Runs only when a real credential is present (the
 * verification harness supplies one for the `live` check); never asserts on a
 * key value and never logs it.
 */
const hasCredential = Boolean(process.env.ORCAROUTER_API_KEY?.trim());
const describeLive = hasCredential ? describe : describe.skip;

describeLive('OrcaRouter live wiring', () => {
  jest.setTimeout(120000);

  const httpClient = new HttpClientService();
  const credentials = new OrcaRouterCredentialStore();
  const catalog = new OrcaRouterCatalogService(httpClient, credentials);
  const service = new OrcaRouterService(httpClient, catalog, credentials);

  it('discovers the live catalog from the real relay', async () => {
    const chatCatalog = await catalog.getCatalog('chat');

    expect(chatCatalog.source).toBe('live');
    expect(chatCatalog.degraded).toBe(false);
    expect(chatCatalog.models.length).toBeGreaterThan(0);
    expect(chatCatalog.models.every((model) => model.id.includes('/'))).toBe(
      true
    );
    expect(chatCatalog.models.every((model) => model.verified === false)).toBe(
      true
    );
  });

  it('completes a real chat request through the provider code path', async () => {
    const chatCatalog = await catalog.getCatalog('chat');
    const available = new Set(chatCatalog.models.map((model) => model.id));

    // Cyber models are the documented default but require an unlocked tier.
    const cyberModel = 'orcacyber-ultra-1.0';
    const publicModel = 'deepseek/deepseek-v4.1-flash';
    const model = available.has(cyberModel)
      ? cyberModel
      : available.has(publicModel)
        ? publicModel
        : undefined;

    expect(model).toBeDefined();

    let answer: string;
    try {
      answer = await service.chat(
        [{ role: 'user', content: 'Reply with exactly: orca-ok' }],
        model
      );
    } catch (error) {
      if (error instanceof OrcaRouterAuthError && model === cyberModel) {
        // Key lacks the cyber tier: prove the wiring with a model the key can use.
        answer = await service.chat(
          [{ role: 'user', content: 'Reply with exactly: orca-ok' }],
          publicModel
        );
      } else {
        throw error;
      }
    }

    expect(typeof answer).toBe('string');
    expect(answer.length).toBeGreaterThan(0);
  });
});
