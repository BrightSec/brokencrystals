/** Errors raised by the OrcaRouter provider, safe to surface to callers. */
export class OrcaRouterError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'OrcaRouterError';
  }
}

export class OrcaRouterAuthError extends OrcaRouterError {
  constructor(status: number) {
    super(
      `OrcaRouter rejected the configured API key (HTTP ${status}). ` +
        'Update or clear the key in the OrcaRouter Cyber Inference settings.',
      status
    );
    this.name = 'OrcaRouterAuthError';
  }
}

export class OrcaRouterCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrcaRouterCredentialError';
  }
}

/**
 * Normalises a transport error without ever copying the request config: axios
 * errors carry `config.headers.Authorization`, so the raw error must not be
 * logged or re-thrown.
 */
export function describeUpstreamFailure(error: unknown): {
  status?: number;
  message: string;
} {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { status?: unknown };
      code?: unknown;
    };
    const status =
      typeof candidate.response?.status === 'number'
        ? candidate.response.status
        : undefined;
    if (status !== undefined) {
      return { status, message: `upstream responded with HTTP ${status}` };
    }
    if (typeof candidate.code === 'string') {
      return { message: `upstream request failed (${candidate.code})` };
    }
  }
  return { message: 'upstream request failed' };
}
