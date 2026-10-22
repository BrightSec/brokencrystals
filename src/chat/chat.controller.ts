import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import {
  OrcaRouterAuthError,
  OrcaRouterError
} from '../orcarouter/orcarouter.errors';
import { API_DESC_CHAT_QUESTION } from './chat.controller.api.desc';
import { ChatMessage } from './api/ChatMessage';

/** Optional routing for the named OrcaRouter Cyber Inference provider. */
interface ChatQueryRequest {
  readonly messages: ChatMessage[];
  readonly provider?: string;
  readonly model?: string;
}

@Controller('/api/chat')
@ApiTags('Chat controller')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('/query')
  @ApiOperation({ description: API_DESC_CHAT_QUESTION })
  @ApiBody({
    description:
      'A list of messages comprising the conversation so far, or an object carrying the messages plus the optional provider/model selection',
    type: [ChatMessage]
  })
  @ApiOkResponse({
    description: 'Chatbot answer',
    type: String
  })
  async query(@Body() body: ChatMessage[] | ChatQueryRequest): Promise<string> {
    const request = this.parseBody(body);
    try {
      return await this.chatService.query(request.messages, {
        providerId: request.provider,
        model: request.model
      });
    } catch (err) {
      // Provider errors carry a status and an actionable, secret-free message.
      if (
        err instanceof OrcaRouterAuthError ||
        err instanceof OrcaRouterError
      ) {
        throw new HttpException(err.message, err.status);
      }
      throw new HttpException(
        `Chat API response error: ${err}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Accepts both the historical array body and the extended object body. */
  private parseBody(body: ChatMessage[] | ChatQueryRequest): ChatQueryRequest {
    if (Array.isArray(body)) {
      return { messages: body };
    }
    if (
      body !== null &&
      typeof body === 'object' &&
      Array.isArray((body as ChatQueryRequest).messages)
    ) {
      return body as ChatQueryRequest;
    }
    return { messages: [] };
  }
}
