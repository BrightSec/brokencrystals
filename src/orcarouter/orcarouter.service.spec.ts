import { HttpClientService } from '../httpclient/httpclient.service';
import { OrcaRouterCatalogService } from './orcarouter-catalog.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import { OrcaRouterAuthError, OrcaRouterError } from './orcarouter.errors';
import { OrcaRouterService } from './orcarouter.service';
import type { OrcaCatalog } from './orcarouter.types';

const API_KEY = 'sk-orca-chatkey000000000000';

const catalog = (ids: string[]): OrcaCatalog => ({
  source: 'live',
  degraded: false,
  fetchedAt: '2026-10-22T00:00:00.000Z',
  models: ids.map((id) => ({
    id,
    inputModalities: ['text'],
    supportedEndpointTypes: ['openai'],
    reasoning: false,
    reasoningEfforts: [],
    verified: false
  }))
});

describe('OrcaRouterService', () => {
  const OLD_ENV = process.env;
  let postMock: jest.Mock;
  let catalogMock: jest.Mock;
  let credentials: OrcaRouterCredentialStore;
  let service: OrcaRouterService;

  const messages = [{ role: 'user' as const, content: 'hello' }];

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ORCA_API_BASE_URL;
    delete process.env.ORCA_BASE_URL;
    process.env.ORCAROUTER_API_KEY = API_KEY;

    postMock = jest.fn();
    catalogMock = jest
      .fn()
      .mockResolvedValue(catalog(['vendor/a', 'orcarouter/auto']));
    credentials = new OrcaRouterCredentialStore();
    service = new OrcaRouterService(
      { post: postMock } as unknown as HttpClientService,
      { getCatalog: catalogMock } as unknown as OrcaRouterCatalogService,
      credentials
    );
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('sends the completion to the inference origin with the stored key', async () => {
    postMock.mockResolvedValueOnce({
      choices: [{ message: { content: '  hi there  ' } }]
    });

    const answer = await service.chat(messages, 'vendor/a');

    expect(answer).toBe('hi there');
    const [url, body, config] = postMock.mock.calls[0] as [
      string,
      { model: string; messages: unknown; stream: boolean },
      { headers: Record<string, string> }
    ];
    expect(url).toBe('https://api.orcarouter.ai/v1/chat/completions');
    expect(body.model).toBe('vendor/a');
    expect(body.messages).toEqual(messages);
    expect(body.stream).toBe(false);
    expect(config.headers.Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('uses the catalog default when no model is requested', async () => {
    postMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }]
    });
    catalogMock.mockResolvedValueOnce(catalog(['orcarouter/auto', 'vendor/a']));

    await service.chat(messages);

    expect(postMock.mock.calls[0][1]).toMatchObject({
      model: 'orcarouter/auto'
    });
  });

  it('prefers the documented cyber default when the catalog lists it', async () => {
    postMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }]
    });
    catalogMock.mockResolvedValueOnce(
      catalog(['orcacyber-ultra-1.0', 'orcarouter/auto'])
    );

    await service.chat(messages);

    expect(postMock.mock.calls[0][1]).toMatchObject({
      model: 'orcacyber-ultra-1.0'
    });
  });

  it('uses a runtime-installed key exactly like an environment key', async () => {
    delete process.env.ORCAROUTER_API_KEY;
    const runtimeKey = ['sk', 'orca', 'runtimesource000000zzzz'].join('-');
    credentials.setKey(runtimeKey);
    postMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }]
    });

    await service.chat(messages, 'vendor/a');

    const config = postMock.mock.calls[0][2] as {
      headers: Record<string, string>;
    };
    // Same transport and header path regardless of where the key came from.
    expect(config.headers.Authorization).toBe(`Bearer ${runtimeKey}`);
  });

  it('does not call upstream without a credential', async () => {
    delete process.env.ORCAROUTER_API_KEY;

    await expect(service.chat(messages, 'vendor/a')).rejects.toBeInstanceOf(
      OrcaRouterAuthError
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it('maps 401 to a terminal reauthentication error without the key', async () => {
    postMock.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 401'), {
        response: { status: 401 }
      })
    );

    const error = await service
      .chat(messages, 'vendor/a')
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(OrcaRouterAuthError);
    expect((error as Error).status).toBe(401);
    expect(String(error)).not.toContain(API_KEY);
    expect((error as Error).message).toContain('Update or clear the key');
  });

  it('maps 429 to a rate-limit error', async () => {
    postMock.mockRejectedValueOnce(
      Object.assign(new Error('too many'), { response: { status: 429 } })
    );

    const error = await service
      .chat(messages, 'vendor/a')
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(OrcaRouterError);
    expect((error as OrcaRouterError).status).toBe(429);
    expect((error as Error).message).toContain('rate limit');
  });

  it('maps a transport failure to 502 without leaking the request config', async () => {
    postMock.mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    );

    const error = await service
      .chat(messages, 'vendor/a')
      .catch((e: Error) => e);

    expect((error as OrcaRouterError).status).toBe(502);
    expect(String(error)).not.toContain('Authorization');
  });

  it('returns an empty string for an empty completion', async () => {
    postMock.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] });
    await expect(service.chat(messages, 'vendor/a')).resolves.toBe('');
  });
});
