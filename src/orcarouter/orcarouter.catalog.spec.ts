import {
  DOCUMENTED_CYBER_DEFAULT,
  capabilityQueryValue,
  filterModelsByCapability,
  parseCatalog,
  parseCatalogModel,
  pickDefaultModel,
  VERIFIED_SEED_MODELS
} from './orcarouter.catalog';
import type { OrcaModel } from './orcarouter.types';

const model = (overrides: Partial<OrcaModel> & { id: string }): OrcaModel => ({
  inputModalities: ['text'],
  supportedEndpointTypes: ['openai'],
  reasoning: false,
  reasoningEfforts: [],
  verified: false,
  ...overrides
});

describe('OrcaRouter catalog parsing', () => {
  it('preserves the vendor/model namespace and declared metadata', () => {
    const parsed = parseCatalogModel({
      id: 'deepseek/deepseek-v4.1-flash',
      name: 'DeepSeek V4.1 Flash',
      context_length: 1048576,
      supported_endpoint_types: ['openai', 'anthropic'],
      architecture: { input_modalities: ['text', 'Image'] },
      supported_parameters: ['reasoning_effort', 'tools']
    });

    expect(parsed).toEqual({
      id: 'deepseek/deepseek-v4.1-flash',
      name: 'DeepSeek V4.1 Flash',
      contextLength: 1048576,
      inputModalities: ['text', 'image'],
      supportedEndpointTypes: ['openai', 'anthropic'],
      reasoning: true,
      reasoningEfforts: [],
      verified: false
    });
  });

  it.each([
    ['missing id', { name: 'no id' }],
    ['empty id', { id: '   ' }],
    ['control characters', { id: 'evil/model\n<script>' }],
    ['numeric id', { id: 42 }],
    ['null record', null]
  ])('drops malformed records (%s)', (_label, payload) => {
    expect(parseCatalogModel(payload)).toBeUndefined();
  });

  it('caps the number of accepted records', () => {
    const payload = {
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `vendor/model-${index}`
      }))
    };
    expect(parseCatalog(payload, 5)).toHaveLength(5);
  });

  it('accepts a bare array payload as well as the data envelope', () => {
    expect(parseCatalog([{ id: 'a/b' }], 10)).toHaveLength(1);
    expect(parseCatalog({ data: [{ id: 'a/b' }] }, 10)).toHaveLength(1);
  });
});

describe('OrcaRouter capability filtering', () => {
  const fixtures: OrcaModel[] = [
    model({ id: 'vendor/text-only' }),
    model({
      id: 'vendor/vision-chat',
      inputModalities: ['text', 'image']
    }),
    model({
      id: 'vendor/undeclared-chat',
      inputModalities: []
    }),
    model({
      id: 'vendor/embed',
      supportedEndpointTypes: ['embeddings']
    }),
    model({
      id: 'vendor/image-gen',
      supportedEndpointTypes: ['image-generation']
    }),
    model({ id: 'vendor/video-gen', supportedEndpointTypes: ['openai-video'] }),
    model({ id: 'vendor/rerank', supportedEndpointTypes: ['jina-rerank'] })
  ];

  it('keeps only text-capable models in the chat selector', () => {
    const ids = filterModelsByCapability(fixtures, 'chat').map((m) => m.id);
    expect(ids).toEqual([
      'vendor/text-only',
      'vendor/vision-chat',
      'vendor/undeclared-chat'
    ]);
  });

  it('requires an explicit image modality for vision (fail closed)', () => {
    const ids = filterModelsByCapability(fixtures, 'vision').map((m) => m.id);
    expect(ids).toEqual(['vendor/vision-chat']);
    expect(ids).not.toContain('vendor/undeclared-chat');
  });

  it('routes each non-chat capability to its own endpoint type', () => {
    expect(
      filterModelsByCapability(fixtures, 'embedding').map((m) => m.id)
    ).toEqual(['vendor/embed']);
    expect(
      filterModelsByCapability(fixtures, 'image').map((m) => m.id)
    ).toEqual(['vendor/image-gen']);
    expect(
      filterModelsByCapability(fixtures, 'video').map((m) => m.id)
    ).toEqual(['vendor/video-gen']);
    expect(
      filterModelsByCapability(fixtures, 'rerank').map((m) => m.id)
    ).toEqual(['vendor/rerank']);
  });

  it('never infers a capability from the model name', () => {
    const misleading = [model({ id: 'vendor/embedding-but-chat-only' })];
    expect(filterModelsByCapability(misleading, 'embedding')).toHaveLength(0);
    expect(filterModelsByCapability(misleading, 'chat')).toHaveLength(1);
  });

  it('maps vision to the chat catalog query and keeps the others explicit', () => {
    expect(capabilityQueryValue('vision')).toBe('chat');
    expect(capabilityQueryValue('chat')).toBe('chat');
    expect(capabilityQueryValue('embedding')).toBe('embedding');
    expect(capabilityQueryValue('image')).toBe('image');
    expect(capabilityQueryValue('video')).toBe('video');
    expect(capabilityQueryValue('rerank')).toBe('rerank');
  });
});

describe('OrcaRouter verified seed and default selection', () => {
  it('keeps the verified fallback models', () => {
    expect(VERIFIED_SEED_MODELS.map((m) => m.id)).toEqual([
      'openai/gpt-5.5',
      'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash',
      'deepseek/deepseek-v4-pro',
      'orcarouter/auto'
    ]);
  });

  it('preserves the GPT-5.5 reasoning effort ladder', () => {
    const gpt = VERIFIED_SEED_MODELS.find((m) => m.id === 'openai/gpt-5.5');
    expect(gpt?.reasoning).toBe(true);
    expect(gpt?.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('keeps the seed usable for chat discovery', () => {
    expect(
      filterModelsByCapability(VERIFIED_SEED_MODELS, 'chat').map((m) => m.id)
    ).toContain('orcarouter/auto');
  });

  it('prefers the documented cyber default only when the catalog has it', () => {
    expect(pickDefaultModel([model({ id: DOCUMENTED_CYBER_DEFAULT })])).toBe(
      DOCUMENTED_CYBER_DEFAULT
    );
    expect(
      pickDefaultModel([model({ id: 'orcarouter/auto' }), model({ id: 'x/y' })])
    ).toBe('orcarouter/auto');
    expect(pickDefaultModel([model({ id: 'x/y' })])).toBe('x/y');
    expect(pickDefaultModel([])).toBeUndefined();
  });
});
