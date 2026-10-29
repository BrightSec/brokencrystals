/** Shapes returned by the backend OrcaRouter Cyber Inference endpoints. */
export interface OrcaAuthMethod {
  id: string;
  label: string;
  hint: string;
  envVar: string;
}

export interface OrcaProvider {
  id: string;
  name: string;
  baseUrl: string;
  authMethods: OrcaAuthMethod[];
  modelSelection: 'catalog';
  documentation: Record<string, string>;
}

export interface OrcaModel {
  id: string;
  name?: string;
  contextLength?: number;
  inputModalities: string[];
  reasoning: boolean;
  reasoningEfforts: string[];
}

export interface OrcaCatalog {
  providerId: string;
  capability: string;
  source: 'live' | 'cache' | 'fallback';
  degraded: boolean;
  fetchedAt: string | null;
  count: number;
  defaultModel: string | null;
  models: OrcaModel[];
}

export interface OrcaCredentialStatus {
  providerId: string;
  configured: boolean;
  masked: string | null;
  source: 'env' | 'runtime' | 'none';
}

export interface OrcaChatReply {
  content: string;
  model: string;
}
