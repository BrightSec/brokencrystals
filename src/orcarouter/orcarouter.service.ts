import { Injectable } from '@nestjs/common';
import { HttpClientService } from '../httpclient/httpclient.service';
import { ChatMessage } from '../chat/api/ChatMessage';
import {
  OrcaRouterCatalogService,
  resolveApiBaseUrl
} from './orcarouter-catalog.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import {
  describeUpstreamFailure,
  OrcaRouterAuthError,
  OrcaRouterError
} from './orcarouter.errors';
import { pickDefaultModel } from './orcarouter.catalog';
import type { OrcaCatalog } from './orcarouter.types';

export const ORCAROUTER_PROVIDER_ID = 'orcarouter-cyber';
export const ORCAROUTER_PROVIDER_NAME = 'OrcaRouter Cyber Inference';
const DEFAULT_MAX_TOKENS = 200;
const CHAT_TIMEOUT_MS = 120000;

interface ChatCompletionPayload {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly stream: false;
  readonly max_tokens: number;
  readonly temperature: number;
}

interface ChatCompletionResponse {
  readonly choices?: {
    readonly message?: {
      readonly content?: unknown;
    };
  }[];
}

@Injectable()
export class OrcaRouterService {
  constructor(
    private readonly httpClient: HttpClientService,
    private readonly catalog: OrcaRouterCatalogService,
    private readonly credentials: OrcaRouterCredentialStore
  ) {}

  /** Chat models available to the configured credential, already filtered. */
  async listChatModels(): Promise<OrcaCatalog> {
    return this.catalog.getCatalog('chat');
  }

  async defaultModel(): Promise<string | undefined> {
    const catalog = await this.listChatModels();
    return pickDefaultModel(catalog.models);
  }

  /**
   * Sends one chat completion through the OrcaRouter relay. The credential is
   * read from the shared credential seam, so callers never handle it.
   */
  async chat(
    messages: readonly ChatMessage[],
    requestedModel?: string
  ): Promise<string> {
    const key = this.credentials.getKey();
    if (!key) {
      throw new OrcaRouterAuthError(401);
    }

    const model = requestedModel ?? (await this.defaultModel());
    if (!model) {
      throw new OrcaRouterError(
        'No OrcaRouter chat model is available for the configured credential',
        503
      );
    }

    const payload: ChatCompletionPayload = {
      model,
      messages,
      stream: false,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0.7
    };

    try {
      const response = await this.httpClient.post<ChatCompletionResponse>(
        `${resolveApiBaseUrl()}/chat/completions`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          timeout: CHAT_TIMEOUT_MS
        }
      );

      const content = response?.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content.trim() : '';
    } catch (error) {
      const failure = describeUpstreamFailure(error);
      if (failure.status === 401 || failure.status === 403) {
        throw new OrcaRouterAuthError(failure.status);
      }
      if (failure.status === 429) {
        throw new OrcaRouterError(
          'OrcaRouter rate limit reached; retry shortly or check the workspace quota',
          429
        );
      }
      throw new OrcaRouterError(
        `OrcaRouter chat completion failed: ${failure.message}`,
        502
      );
    }
  }
}
