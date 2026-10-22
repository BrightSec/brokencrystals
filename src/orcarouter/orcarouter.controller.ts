import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Put,
  Post,
  Query
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ChatMessage } from '../chat/api/ChatMessage';
import {
  OrcaRouterCatalogService,
  resolveApiBaseUrl
} from './orcarouter-catalog.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import {
  OrcaRouterAuthError,
  OrcaRouterCredentialError,
  OrcaRouterError
} from './orcarouter.errors';
import {
  DOCUMENTED_CYBER_ALTERNATIVE,
  DOCUMENTED_CYBER_DEFAULT,
  pickDefaultModel
} from './orcarouter.catalog';
import {
  ORCAROUTER_PROVIDER_ID,
  ORCAROUTER_PROVIDER_NAME,
  OrcaRouterService
} from './orcarouter.service';
import type { OrcaCapability } from './orcarouter.types';

const CAPABILITIES: readonly OrcaCapability[] = [
  'chat',
  'vision',
  'embedding',
  'image',
  'video',
  'rerank'
];

const ROLES = ['user', 'assistant', 'system'];

interface OrcaCredentialBody {
  readonly apiKey?: unknown;
}

interface OrcaChatBody {
  readonly messages?: unknown;
  readonly model?: unknown;
}

@Controller('/api/orcarouter')
@ApiTags('OrcaRouter Cyber Inference')
export class OrcaRouterController {
  private readonly logger = new Logger(OrcaRouterController.name);

  constructor(
    private readonly orca: OrcaRouterService,
    private readonly catalog: OrcaRouterCatalogService,
    private readonly credentials: OrcaRouterCredentialStore
  ) {}

  @Get('/providers')
  @ApiOperation({
    description:
      'Named providers understood by the chat UI. OrcaRouter Cyber Inference is a first-class entry with its own base URL and credential.'
  })
  listProviders(): Record<string, unknown> {
    return {
      providers: [
        {
          id: ORCAROUTER_PROVIDER_ID,
          name: ORCAROUTER_PROVIDER_NAME,
          baseUrl: resolveApiBaseUrl(),
          modelsPath: '/models',
          authMethods: [
            {
              id: 'api-key',
              label: 'API Key',
              hint: 'Paste an sk-orca- key from the OrcaRouter console',
              envVar: 'ORCAROUTER_API_KEY'
            }
          ],
          modelSelection: 'catalog',
          documentedDefaults: {
            preferred: DOCUMENTED_CYBER_DEFAULT,
            alternative: DOCUMENTED_CYBER_ALTERNATIVE,
            note: 'Cyber-tier models require an account unlocked for the cyber layer; until then the live catalog lists the public models available to the key.'
          },
          documentation: {
            provider: 'https://www.orcarouter.ai/cyber',
            cyberModels: 'https://www.orcarouter.ai/models?tier=cyber',
            console: 'https://www.orcarouter.ai/console/authorized-apps'
          }
        }
      ]
    };
  }

  @Get('/models')
  @ApiOperation({
    description:
      'Model catalog discovered from the OrcaRouter relay and filtered for the requested capability.'
  })
  @ApiQuery({ name: 'capability', required: false, enum: CAPABILITIES })
  async listModels(
    @Query('capability') capability?: string
  ): Promise<Record<string, unknown>> {
    const requested = this.parseCapability(capability);
    const catalog = await this.catalog.getCatalog(requested);
    return {
      providerId: ORCAROUTER_PROVIDER_ID,
      capability: requested,
      source: catalog.source,
      degraded: catalog.degraded,
      fetchedAt: catalog.fetchedAt,
      count: catalog.models.length,
      defaultModel: pickDefaultModel(catalog.models) ?? null,
      models: catalog.models
    };
  }

  @Get('/credentials')
  @ApiOperation({
    description:
      'Masked status of the OrcaRouter credential. The key itself is never returned.'
  })
  getCredentials(): Record<string, unknown> {
    return {
      providerId: ORCAROUTER_PROVIDER_ID,
      ...this.credentials.status(),
      authMethods: ['api-key']
    };
  }

  @Put('/credentials')
  @ApiOperation({
    description: 'Installs an OrcaRouter API key for this process.'
  })
  @ApiBody({
    description: 'The API key to use',
    schema: { type: 'object', properties: { apiKey: { type: 'string' } } }
  })
  putCredentials(@Body() body: OrcaCredentialBody): Record<string, unknown> {
    try {
      const status = this.credentials.setKey(body?.apiKey);
      this.catalog.invalidateCache();
      return {
        providerId: ORCAROUTER_PROVIDER_ID,
        ...status
      };
    } catch (error) {
      if (error instanceof OrcaRouterCredentialError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete('/credentials')
  @ApiOperation({
    description:
      'Stops using the configured OrcaRouter credential (env or runtime).'
  })
  deleteCredentials(): Record<string, unknown> {
    const status = this.credentials.clear();
    this.catalog.invalidateCache();
    return {
      providerId: ORCAROUTER_PROVIDER_ID,
      ...status
    };
  }

  @Post('/chat')
  @ApiOperation({
    description: 'Chat completion routed through OrcaRouter Cyber Inference.'
  })
  @ApiBody({
    description: 'Chat messages and the catalog model to use',
    schema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: { $ref: '#/components/schemas/ChatMessage' }
        },
        model: { type: 'string' }
      }
    }
  })
  async chat(
    @Body() body: OrcaChatBody
  ): Promise<{ content: string; model: string }> {
    const messages = this.parseMessages(body?.messages);
    const model =
      typeof body?.model === 'string' && body.model.trim().length > 0
        ? body.model.trim()
        : undefined;

    try {
      const content = await this.orca.chat(messages, model);
      return {
        content,
        model: model ?? (await this.orca.defaultModel()) ?? ''
      };
    } catch (error) {
      if (error instanceof OrcaRouterAuthError) {
        throw new HttpException(error.message, error.status);
      }
      if (error instanceof OrcaRouterError) {
        throw new HttpException(error.message, error.status);
      }
      this.logger.warn('OrcaRouter chat request failed');
      throw new HttpException('OrcaRouter chat request failed', 502);
    }
  }

  private parseCapability(raw?: string): OrcaCapability {
    if (raw === undefined || raw.trim() === '') {
      return 'chat';
    }
    const value = raw.trim().toLowerCase();
    const match = CAPABILITIES.find((capability) => capability === value);
    if (!match) {
      throw new BadRequestException(
        `Unsupported capability "${raw}". Expected one of: ${CAPABILITIES.join(', ')}`
      );
    }
    return match;
  }

  private parseMessages(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('messages must be a non-empty array');
    }
    return raw.map((item) => {
      if (typeof item !== 'object' || item === null) {
        throw new BadRequestException('each message must be an object');
      }
      const message = item as Record<string, unknown>;
      if (
        typeof message.role !== 'string' ||
        !ROLES.includes(message.role) ||
        typeof message.content !== 'string'
      ) {
        throw new BadRequestException(
          'each message needs a role (user|assistant|system) and string content'
        );
      }
      return {
        role: message.role as ChatMessage['role'],
        content: message.content
      };
    });
  }
}
