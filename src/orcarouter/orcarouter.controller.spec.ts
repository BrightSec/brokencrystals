import { BadRequestException, HttpException } from '@nestjs/common';
import { OrcaRouterCatalogService } from './orcarouter-catalog.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import { OrcaRouterController } from './orcarouter.controller';
import { OrcaRouterAuthError } from './orcarouter.errors';
import { OrcaRouterService } from './orcarouter.service';

const API_KEY = 'sk-orca-controllerkey000000ab';

describe('OrcaRouterController', () => {
  const OLD_ENV = process.env;
  let chatMock: jest.Mock;
  let catalogMock: jest.Mock;
  let credentials: OrcaRouterCredentialStore;
  let controller: OrcaRouterController;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ORCAROUTER_API_KEY;
    chatMock = jest.fn().mockResolvedValue('answer');
    catalogMock = jest.fn().mockResolvedValue({
      source: 'fallback',
      degraded: true,
      fetchedAt: null,
      models: [
        {
          id: 'openai/gpt-5.5',
          inputModalities: ['text'],
          supportedEndpointTypes: ['openai'],
          reasoning: true,
          reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          verified: true
        }
      ]
    });
    credentials = new OrcaRouterCredentialStore();
    controller = new OrcaRouterController(
      { chat: chatMock } as unknown as OrcaRouterService,
      {
        getCatalog: catalogMock,
        invalidateCache: jest.fn()
      } as unknown as OrcaRouterCatalogService,
      credentials
    );
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('exposes the named provider with its own base URL and API-key method', () => {
    const response = controller.listProviders() as {
      providers: {
        id: string;
        name: string;
        baseUrl: string;
        authMethods: { id: string; envVar: string }[];
        documentation: Record<string, string>;
      }[];
    };
    const provider = response.providers[0];

    expect(provider.id).toBe('orcarouter-cyber');
    expect(provider.name).toBe('OrcaRouter Cyber Inference');
    expect(provider.baseUrl).toBe('https://api.orcarouter.ai/v1');
    expect(provider.authMethods.map((m) => m.id)).toEqual(['api-key']);
    expect(provider.authMethods[0].envVar).toBe('ORCAROUTER_API_KEY');
    expect(provider.documentation.provider).toBe(
      'https://www.orcarouter.ai/cyber'
    );
  });

  it('returns the filtered catalog and its provenance', async () => {
    const response = (await controller.listModels('chat')) as {
      source: string;
      degraded: boolean;
      count: number;
      models: { id: string }[];
    };

    expect(catalogMock).toHaveBeenCalledWith('chat');
    expect(response.source).toBe('fallback');
    expect(response.degraded).toBe(true);
    expect(response.count).toBe(1);
    expect(response.models[0].id).toBe('openai/gpt-5.5');
  });

  it('rejects an unknown capability', async () => {
    await expect(controller.listModels('telepathy')).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('installs, reports and clears a credential without returning it', () => {
    const saved = controller.putCredentials({ apiKey: API_KEY }) as {
      configured: boolean;
      masked: string;
    };

    expect(saved.configured).toBe(true);
    expect(saved.masked).toBe('sk-orca-…00ab');
    expect(JSON.stringify(saved)).not.toContain(API_KEY);

    const status = controller.getCredentials();
    expect(status.configured).toBe(true);

    const cleared = controller.deleteCredentials();
    expect(cleared.configured).toBe(false);
  });

  it('rejects a malformed key with a 400', () => {
    expect(() => controller.putCredentials({ apiKey: 'not-a-key' })).toThrow(
      BadRequestException
    );
  });

  it('validates chat messages before calling upstream', async () => {
    await expect(controller.chat({ messages: 'hello' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      controller.chat({ messages: [{ role: 'tool', content: 'x' }] })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('passes the selected model through and returns the content', async () => {
    const response = await controller.chat({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'vendor/a'
    });

    expect(chatMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hi' }],
      'vendor/a'
    );
    expect(response.content).toBe('answer');
    expect(response.model).toBe('vendor/a');
  });

  it('surfaces an auth failure as 401 with an actionable message', async () => {
    chatMock.mockRejectedValueOnce(new OrcaRouterAuthError(401));

    const error = await controller
      .chat({ messages: [{ role: 'user', content: 'hi' }] })
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(401);
    expect((error as Error).message).toContain('Update or clear the key');
  });
});
