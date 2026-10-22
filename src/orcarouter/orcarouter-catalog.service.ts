import { Injectable, Logger } from '@nestjs/common';
import { HttpClientService } from '../httpclient/httpclient.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import {
  capabilityQueryValue,
  filterModelsByCapability,
  parseCatalog,
  VERIFIED_SEED_MODELS
} from './orcarouter.catalog';
import { describeUpstreamFailure } from './orcarouter.errors';
import type {
  OrcaCapability,
  OrcaCatalog,
  OrcaModel
} from './orcarouter.types';

export const ORCA_API_BASE_URL = 'https://api.orcarouter.ai/v1';
export const ORCA_MODELS_PATH = '/models';

/** Bounds so an unexpected catalog response cannot exhaust the process. */
const MAX_MODELS = 500;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  readonly catalog: OrcaCatalog;
  readonly storedAt: number;
}

/**
 * The explicit API override wins, then a shared self-hosted base, then the
 * public default. Origins are never derived from one another.
 */
export function resolveApiBaseUrl(
  environment: NodeJS.ProcessEnv = process.env
): string {
  const explicit = environment.ORCA_API_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const shared = environment.ORCA_BASE_URL?.trim();
  if (shared) {
    return `${shared.replace(/\/+$/, '')}/v1`;
  }
  return ORCA_API_BASE_URL;
}

@Injectable()
export class OrcaRouterCatalogService {
  private readonly logger = new Logger(OrcaRouterCatalogService.name);
  private readonly cache = new Map<OrcaCapability, CacheEntry>();

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly credentials: OrcaRouterCredentialStore
  ) {}

  /** Drops cached catalogs so a credential change is reflected immediately. */
  invalidateCache(): void {
    this.cache.clear();
  }

  async getCatalog(capability: OrcaCapability): Promise<OrcaCatalog> {
    const cached = this.cache.get(capability);
    const now = Date.now();

    if (cached && now - cached.storedAt < CACHE_TTL_MS) {
      return cached.catalog;
    }

    const key = this.credentials.getKey();
    if (!key) {
      // No credential: a degraded seed is still usable and says so.
      return this.fallback(capability, cached);
    }

    try {
      const payload = await this.fetchCatalog(capability, key);
      const filtered = filterModelsByCapability(payload, capability);
      const catalog: OrcaCatalog = {
        source: 'live',
        degraded: false,
        fetchedAt: new Date().toISOString(),
        models: filtered
      };
      this.cache.set(capability, { catalog, storedAt: now });
      return catalog;
    } catch (error) {
      const failure = describeUpstreamFailure(error);
      this.logger.warn(
        `OrcaRouter catalog discovery failed for "${capability}": ${failure.message}`
      );
      return this.fallback(capability, cached);
    }
  }

  /** Last-known-good first, then the small verified seed, always marked degraded. */
  private fallback(
    capability: OrcaCapability,
    cached: CacheEntry | undefined
  ): OrcaCatalog {
    if (cached) {
      return {
        ...cached.catalog,
        source: 'cache',
        degraded: true
      };
    }
    return {
      source: 'fallback',
      degraded: true,
      fetchedAt: null,
      models: filterModelsByCapability(VERIFIED_SEED_MODELS, capability)
    };
  }

  private async fetchCatalog(
    capability: OrcaCapability,
    key: string
  ): Promise<OrcaModel[]> {
    const url =
      `${resolveApiBaseUrl()}${ORCA_MODELS_PATH}` +
      `?capability=${encodeURIComponent(capabilityQueryValue(capability))}`;

    const response = await this.httpClient.get<unknown>(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      },
      timeout: REQUEST_TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES
    });

    return parseCatalog(response, MAX_MODELS);
  }
}
