import { HttpClientService } from '../httpclient/httpclient.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import {
  OrcaRouterCatalogService,
  resolveApiBaseUrl
} from './orcarouter-catalog.service';

const API_KEY = 'sk-orca-testkey000000000000';

const livePayload = {
  object: 'list',
  data: [
    {
      id: 'vendor/chat-text',
      supported_endpoint_types: ['openai'],
      architecture: { input_modalities: ['text'] }
    },
    {
      id: 'vendor/chat-vision',
      supported_endpoint_types: ['anthropic'],
      architecture: { input_modalities: ['text', 'image'] }
    },
    {
      id: 'vendor/embed',
      supported_endpoint_types: ['embeddings'],
      architecture: { input_modalities: ['text'] }
    }
  ]
};

describe('OrcaRouterCatalogService', () => {
  const OLD_ENV = process.env;
  let getMock: jest.Mock;
  let httpClient: HttpClientService;
  let credentials: OrcaRouterCredentialStore;
  let service: OrcaRouterCatalogService;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ORCA_API_BASE_URL;
    delete process.env.ORCA_BASE_URL;
    process.env.ORCAROUTER_API_KEY = API_KEY;

    getMock = jest.fn();
    httpClient = { get: getMock } as unknown as HttpClientService;
    credentials = new OrcaRouterCredentialStore();
    service = new OrcaRouterCatalogService(httpClient, credentials);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('fetches the live catalog from the OrcaRouter API origin with the key', async () => {
    getMock.mockResolvedValueOnce(livePayload);

    const catalog = await service.getCatalog('chat');

    expect(getMock).toHaveBeenCalledTimes(1);
    const [url, config] = getMock.mock.calls[0] as [
      string,
      {
        headers: Record<string, string>;
        timeout: number;
        maxContentLength: number;
      }
    ];
    expect(url).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
    expect(config.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(config.timeout).toBeGreaterThan(0);
    expect(config.maxContentLength).toBeGreaterThan(0);
    expect(catalog.source).toBe('live');
    expect(catalog.degraded).toBe(false);
    expect(catalog.models.map((m) => m.id)).toEqual([
      'vendor/chat-text',
      'vendor/chat-vision'
    ]);
  });

  it('requests the embedding capability explicitly', async () => {
    getMock.mockResolvedValueOnce(livePayload);

    const catalog = await service.getCatalog('embedding');

    expect(getMock.mock.calls[0][0]).toBe(
      'https://api.orcarouter.ai/v1/models?capability=embedding'
    );
    expect(catalog.models.map((m) => m.id)).toEqual(['vendor/embed']);
  });

  it('uses the verified seed, marked degraded, when no credential exists', async () => {
    delete process.env.ORCAROUTER_API_KEY;

    const catalog = await service.getCatalog('chat');

    expect(getMock).not.toHaveBeenCalled();
    expect(catalog.source).toBe('fallback');
    expect(catalog.degraded).toBe(true);
    expect(catalog.models.map((m) => m.id)).toContain('openai/gpt-5.5');
  });

  it('falls back to the verified seed when discovery fails', async () => {
    getMock.mockRejectedValueOnce(
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    );

    const catalog = await service.getCatalog('chat');

    expect(catalog.source).toBe('fallback');
    expect(catalog.degraded).toBe(true);
    expect(catalog.models.map((m) => m.id)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash',
      'deepseek/deepseek-v4-pro',
      'orcarouter/auto'
    ]);
  });

  it('reuses a live catalog from cache inside the TTL', async () => {
    getMock.mockResolvedValueOnce(livePayload);
    await service.getCatalog('chat');

    const second = await service.getCatalog('chat');

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('live');
  });

  it('serves last-known-good, marked degraded, after the TTL when discovery breaks', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    getMock.mockResolvedValueOnce(livePayload);
    await service.getCatalog('chat');

    nowSpy.mockReturnValue(1_000 + 10 * 60 * 1000);
    getMock.mockRejectedValueOnce(new Error('catalog down'));
    const catalog = await service.getCatalog('chat');

    expect(catalog.source).toBe('cache');
    expect(catalog.degraded).toBe(true);
    expect(catalog.models.map((m) => m.id)).toEqual([
      'vendor/chat-text',
      'vendor/chat-vision'
    ]);
    nowSpy.mockRestore();
  });

  it('never leaks the key into a logged failure', async () => {
    const warnSpy = jest.spyOn(
      (service as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn'
    );
    getMock.mockRejectedValueOnce(
      Object.assign(new Error('401'), { response: { status: 401 } })
    );

    await service.getCatalog('chat');

    const logged = warnSpy.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).not.toContain(API_KEY);
    expect(logged).toContain('HTTP 401');
    warnSpy.mockRestore();
  });
});

describe('OrcaRouter origin resolution', () => {
  it('defaults to the public inference origin', () => {
    expect(resolveApiBaseUrl({})).toBe('https://api.orcarouter.ai/v1');
  });

  it('honours the shared self-hosted base', () => {
    const env = {
      ORCA_BASE_URL: 'https://orca.internal/'
    } as NodeJS.ProcessEnv;
    expect(resolveApiBaseUrl(env)).toBe('https://orca.internal/v1');
  });

  it('lets an explicit API override win over the shared base', () => {
    const env = {
      ORCA_BASE_URL: 'https://shared.example',
      ORCA_API_BASE_URL: 'https://relay.example/v1/'
    } as NodeJS.ProcessEnv;
    expect(resolveApiBaseUrl(env)).toBe('https://relay.example/v1');
  });
});
