import { Injectable } from '@nestjs/common';
import { OrcaRouterCredentialError } from './orcarouter.errors';

export type OrcaCredentialSource = 'env' | 'runtime' | 'none';

export interface OrcaCredentialStatus {
  readonly configured: boolean;
  /** Never the key itself: prefix plus the last four characters only. */
  readonly masked: string | null;
  readonly source: OrcaCredentialSource;
}

const KEY_PATTERN = /^sk-orca-[A-Za-z0-9._-]+$/;
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 512;

/**
 * Credential seam for the OrcaRouter provider.
 *
 * OrcaRouter keys come from the environment (the repository's existing secret
 * habit) or from a process-local override entered in the provider settings.
 * Nothing is written to disk, logged, or returned unmasked.
 */
@Injectable()
export class OrcaRouterCredentialStore {
  private runtimeKey: string | undefined;
  private environmentDisabled = false;

  /** The key to use for the next request, whichever adapter supplied it. */
  getKey(): string | undefined {
    if (this.runtimeKey) {
      return this.runtimeKey;
    }
    if (this.environmentDisabled) {
      return undefined;
    }
    const fromEnvironment = process.env.ORCAROUTER_API_KEY?.trim();
    return fromEnvironment && fromEnvironment.length > 0
      ? fromEnvironment
      : undefined;
  }

  /**
   * Validates and installs a user-supplied key. Format checks only: an
   * `sk-orca-` prefix is not proof of validity, and no paid request is made to
   * "verify" a key.
   */
  setKey(rawKey: unknown): OrcaCredentialStatus {
    if (typeof rawKey !== 'string') {
      throw new OrcaRouterCredentialError('API key must be a string');
    }
    const key = rawKey.trim();
    if (
      key.length < MIN_KEY_LENGTH ||
      key.length > MAX_KEY_LENGTH ||
      !KEY_PATTERN.test(key)
    ) {
      throw new OrcaRouterCredentialError(
        'API key must start with "sk-orca-" and contain no whitespace'
      );
    }
    this.runtimeKey = key;
    this.environmentDisabled = false;
    return this.status();
  }

  /** Stops using both the runtime key and any environment key until a new key is set. */
  clear(): OrcaCredentialStatus {
    this.runtimeKey = undefined;
    this.environmentDisabled = true;
    return this.status();
  }

  status(): OrcaCredentialStatus {
    const source: OrcaCredentialSource = this.runtimeKey
      ? 'runtime'
      : !this.environmentDisabled && this.getKey()
        ? 'env'
        : 'none';
    const key = this.getKey();
    return {
      configured: key !== undefined,
      masked: key === undefined ? null : OrcaRouterCredentialStore.mask(key),
      source
    };
  }

  private static mask(key: string): string {
    const tail = key.slice(-4);
    return `sk-orca-…${tail}`;
  }
}
