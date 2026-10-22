import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import { OrcaRouterCredentialError } from './orcarouter.errors';

describe('OrcaRouterCredentialStore', () => {
  const OLD_ENV = process.env;
  const ENV_KEY = 'sk-orca-envkey1234567890abcd';

  let store: OrcaRouterCredentialStore;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.ORCAROUTER_API_KEY;
    store = new OrcaRouterCredentialStore();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('reads a key from the environment without exposing it', () => {
    process.env.ORCAROUTER_API_KEY = ENV_KEY;

    expect(store.getKey()).toBe(ENV_KEY);
    const status = store.status();
    expect(status).toEqual({
      configured: true,
      masked: 'sk-orca-…abcd',
      source: 'env'
    });
    expect(JSON.stringify(status)).not.toContain(ENV_KEY);
  });

  it('accepts an API-key adapter value and masks it on read', () => {
    const status = store.setKey('  sk-orca-runtimekey0000000wxyz  ');

    expect(store.getKey()).toBe('sk-orca-runtimekey0000000wxyz');
    expect(status).toEqual({
      configured: true,
      masked: 'sk-orca-…wxyz',
      source: 'runtime'
    });
    expect(JSON.stringify(status)).not.toContain('runtimekey0000000');
  });

  it('lets the runtime key override the environment key', () => {
    process.env.ORCAROUTER_API_KEY = ENV_KEY;
    store.setKey('sk-orca-runtimereplacement0001');

    expect(store.getKey()).toBe('sk-orca-runtimereplacement0001');
    expect(store.status().source).toBe('runtime');
  });

  it('clears both the runtime key and the environment fallback', () => {
    process.env.ORCAROUTER_API_KEY = ENV_KEY;
    store.setKey('sk-orca-runtimekey0000000wxyz');

    expect(store.clear()).toEqual({
      configured: false,
      masked: null,
      source: 'none'
    });
    expect(store.getKey()).toBeUndefined();

    // A new explicit key re-enables the seam.
    store.setKey('sk-orca-afterclear000000abcd');
    expect(store.status().source).toBe('runtime');
  });

  it.each([
    ['wrong prefix', 'sk-ant-notours00000000'],
    ['too short', 'sk-orca-abc'],
    ['whitespace inside', 'sk-orca-abc def1234567890'],
    ['non-string', 42]
  ])('rejects an invalid key (%s) without echoing it', (_label, value) => {
    expect(() => store.setKey(value)).toThrow(OrcaRouterCredentialError);
    try {
      store.setKey(value);
    } catch (error) {
      expect(String(error)).not.toContain('sk-ant-notours00000000');
    }
    expect(store.getKey()).toBeUndefined();
  });

  it('reports no credential when nothing is configured', () => {
    expect(store.status()).toEqual({
      configured: false,
      masked: null,
      source: 'none'
    });
    expect(store.getKey()).toBeUndefined();
  });
});
