import type { OrcaCapability, OrcaModel } from './orcarouter.types';

/** Endpoint types that can serve an OpenAI-style text chat completion. */
export const TEXT_ENDPOINT_TYPES: readonly string[] = [
  'openai',
  'openai-response',
  'anthropic',
  'gemini'
];

/**
 * Small verified cold-start catalog. Used only when live discovery fails or no
 * credential is configured; live discovery replaces it entirely when it works.
 *
 * Metadata is intentionally conservative: a model is not advertised for a
 * modality the source did not declare (fail closed), and reasoning effort
 * ladders are only listed where verified.
 */
export const VERIFIED_SEED_MODELS: readonly OrcaModel[] = [
  {
    id: 'openai/gpt-5.5',
    name: 'OpenAI: GPT-5.5',
    inputModalities: ['text'],
    supportedEndpointTypes: ['openai', 'openai-response'],
    reasoning: true,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    verified: true
  },
  {
    id: 'anthropic/claude-opus-4.8',
    name: 'Anthropic: Claude Opus 4.8',
    inputModalities: ['text'],
    supportedEndpointTypes: ['anthropic', 'openai'],
    reasoning: false,
    reasoningEfforts: [],
    verified: true
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'Google: Gemini 3.5 Flash',
    inputModalities: ['text'],
    supportedEndpointTypes: ['gemini', 'openai'],
    reasoning: false,
    reasoningEfforts: [],
    verified: true
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek: DeepSeek V4 Pro',
    inputModalities: ['text'],
    supportedEndpointTypes: ['openai', 'openai-response', 'anthropic'],
    reasoning: false,
    reasoningEfforts: [],
    verified: true
  },
  {
    id: 'orcarouter/auto',
    name: 'OrcaRouter: Auto',
    inputModalities: ['text'],
    supportedEndpointTypes: [
      'openai',
      'openai-response',
      'anthropic',
      'gemini'
    ],
    reasoning: false,
    reasoningEfforts: [],
    verified: true
  }
];

/** Documented cyber-tier defaults; they appear in live catalogs once unlocked. */
export const DOCUMENTED_CYBER_DEFAULT = 'orcacyber-ultra-1.0';
export const DOCUMENTED_CYBER_ALTERNATIVE = 'orcacyber-zero-1.5';

const ID_PATTERN = /^[A-Za-z0-9._:/-]+$/;
const MAX_ID_LENGTH = 200;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const asPositiveNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;

/**
 * Converts one record from `GET /v1/models` into a bounded `OrcaModel`, or
 * rejects it. Unknown shapes are dropped rather than guessed at.
 */
export function parseCatalogModel(raw: unknown): OrcaModel | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const id = asString(record.id);
  if (!id || id.length > MAX_ID_LENGTH || !ID_PATTERN.test(id)) {
    return undefined;
  }

  const architecture =
    typeof record.architecture === 'object' && record.architecture !== null
      ? (record.architecture as Record<string, unknown>)
      : undefined;

  const supportedParameters = asStringArray(record.supported_parameters);
  const reasoning =
    supportedParameters.includes('reasoning_effort') ||
    supportedParameters.includes('reasoning') ||
    supportedParameters.includes('include_reasoning');

  return {
    id,
    name: asString(record.name),
    contextLength: asPositiveNumber(record.context_length),
    inputModalities: asStringArray(architecture?.input_modalities).map((item) =>
      item.toLowerCase()
    ),
    supportedEndpointTypes: asStringArray(record.supported_endpoint_types).map(
      (item) => item.toLowerCase()
    ),
    reasoning,
    reasoningEfforts: [],
    verified: false
  };
}

/** Parses a catalog payload, ignoring records that do not fit the contract. */
export function parseCatalog(payload: unknown, limit: number): OrcaModel[] {
  const records: unknown[] = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as Record<string, unknown>).data)
      ? ((payload as Record<string, unknown>).data as unknown[])
      : [];

  const models: OrcaModel[] = [];
  for (const record of records) {
    if (models.length >= limit) {
      break;
    }
    const model = parseCatalogModel(record);
    if (model) {
      models.push(model);
    }
  }
  return models;
}

const servesText = (model: OrcaModel): boolean =>
  model.supportedEndpointTypes.some((type) =>
    TEXT_ENDPOINT_TYPES.includes(type)
  );

const servesEndpoint = (model: OrcaModel, endpointType: string): boolean =>
  model.supportedEndpointTypes.includes(endpointType);

/**
 * Capability filter used for every model selector. Unsupported or undeclared
 * records never reach the UI: vision in particular fails closed when the
 * catalog does not explicitly declare image input.
 */
export function filterModelsByCapability(
  models: readonly OrcaModel[],
  capability: OrcaCapability
): OrcaModel[] {
  switch (capability) {
    case 'chat':
      return models.filter(servesText);
    case 'vision':
      return models.filter(
        (model) => servesText(model) && model.inputModalities.includes('image')
      );
    case 'embedding':
      return models.filter((model) => servesEndpoint(model, 'embeddings'));
    case 'image':
      return models.filter((model) =>
        servesEndpoint(model, 'image-generation')
      );
    case 'video':
      return models.filter((model) => servesEndpoint(model, 'openai-video'));
    case 'rerank':
      return models.filter((model) => servesEndpoint(model, 'jina-rerank'));
  }
}

/**
 * Query parameter sent to the catalog endpoint for a capability. The endpoint
 * narrows server-side; `filterModelsByCapability` still re-checks every record.
 */
export function capabilityQueryValue(capability: OrcaCapability): string {
  switch (capability) {
    case 'vision':
      return 'chat';
    case 'chat':
      return 'chat';
    case 'embedding':
      return 'embedding';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'rerank':
      return 'rerank';
  }
}

/**
 * Picks the model shown first for a provider: the documented cyber default
 * when it is actually present in the catalog, otherwise the router's auto
 * route, otherwise the first compatible entry.
 */
export function pickDefaultModel(
  models: readonly OrcaModel[]
): string | undefined {
  const byId = (id: string): OrcaModel | undefined =>
    models.find((model) => model.id === id);

  return (
    byId(DOCUMENTED_CYBER_DEFAULT)?.id ??
    byId(DOCUMENTED_CYBER_ALTERNATIVE)?.id ??
    byId('orcarouter/auto')?.id ??
    models[0]?.id
  );
}
