/**
 * Types for the OrcaRouter Cyber Inference provider.
 *
 * The catalog is deliberately modelled on the public `GET /v1/models` payload
 * from https://api.orcarouter.ai/v1 so that live discovery stays authoritative.
 */
export type OrcaCapability =
  | 'chat'
  | 'vision'
  | 'embedding'
  | 'image'
  | 'video'
  | 'rerank';

export interface OrcaModel {
  /** Vendor-scoped identifier, preserved exactly as published (e.g. `deepseek/deepseek-v4.1-flash`). */
  readonly id: string;
  readonly name?: string;
  readonly contextLength?: number;
  readonly inputModalities: readonly string[];
  readonly supportedEndpointTypes: readonly string[];
  readonly reasoning: boolean;
  readonly reasoningEfforts: readonly string[];
  /** True when the record came from a verified source rather than live discovery. */
  readonly verified: boolean;
}

export type OrcaCatalogSource = 'live' | 'cache' | 'fallback';

export interface OrcaCatalog {
  readonly source: OrcaCatalogSource;
  readonly degraded: boolean;
  readonly fetchedAt: string | null;
  readonly models: readonly OrcaModel[];
}

export interface OrcaServiceOptions {
  readonly providerId?: string;
  readonly model?: string;
}
