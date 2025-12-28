/**
 * @fileoverview Anthropic model adapter implementation
 * @module features/model/adapters/anthropic
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  UniversalToolDefinition,
  ContentBlock,
} from '../../../shared/types/index.js';
import type {
  StreamChunk,
  GenerateOptions,
  ModelConfig,
} from '../../../shared/types/models.js';
import {
  type IModelAdapter,
  AdapterError,
  registerAdapter,
} from './types.js';
import type { AuthenticationManager } from '../../auth/authentication-manager.js';
import { logger } from '../../../shared/utils/logger.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default context limit for Anthropic models */
const DEFAULT_CONTEXT_LIMIT = 200000;

/** Error code mapping from Anthropic to internal codes */
const ERROR_CODE_MAP: Record<string, string> = {
  'authentication_error': 'AUTH_FAILED',
  'permission_error': 'AUTH_FAILED',
  'rate_limit_error': 'RATE_LIMITED',
  'invalid_request_error': 'INVALID_REQUEST',
  'overloaded_error': 'RATE_LIMITED',
  'context_length_exceeded_error': 'CONTEXT_OVERFLOW',
};

// =============================================================================
// MESSAGE CONVERSION
// =============================================================================

/**
 * Converts internal message format to Anthropic format.
 */
function convertMessages(messages: Message[]): Anthropic.Messages.MessageParam[] {
  return messages
    .filter(msg => msg.role !== 'system') // System messages handled separately
    .map(msg => {
      if (msg.role === 'tool') {
        // Tool results
        if (!msg.toolResults || msg.toolResults.length === 0) {
          return {
            role: 'user',
            content: [{ type: 'text', text: '[No tool results provided]' }],
          };
        }

        return {
          role: 'user',
          content: msg.toolResults.map(result => ({
            type: 'tool_result',
            tool_use_id: result.toolCallId,
            content: result.content,
            iserror: result.isError,
          })),
        };
      }

      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant with tool calls
        const content: any[] = [];
        
        if (typeof msg.content === 'string' && msg.content) {
          content.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
          content.push(...msg.content.map(block => {
            if (block.type === 'text') {
              return { type: 'text', text: block.text };
            }
            return block;
          }));
        }

        content.push(...msg.toolCalls.map(tc => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        })));

        return { role: 'assistant', content };
      }

      // Standard user/assistant messages
      if (typeof msg.content === 'string') {
        return { role: msg.role as 'user' | 'assistant', content: msg.content };
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content.map(block => {
          if (block.type === 'text') {
            return { type: 'text', text: block.text };
          }
          // Image blocks would need conversion here if supported
          return block;
        }) as Anthropic.Messages.ContentBlockParam[],
      };
    });
}

/**
 * Converts universal tool definitions to Anthropic tool definitions.
 */
function convertTools(tools: UniversalToolDefinition[]): Anthropic.Messages.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  }));
}

// =============================================================================
// ANTHROPIC ADAPTER
// =============================================================================

/**
 * Anthropic model adapter implementation.
 */
export class AnthropicAdapter implements IModelAdapter {
  readonly provider = 'anthropic';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling = true;

  private client: Anthropic;
  private readonly config: ModelConfig;
  private readonly authManager?: AuthenticationManager;

  constructor(config: ModelConfig, authManager?: AuthenticationManager) {
    this.config = config;
    this.model = config.model;
    this.contextLimit = config.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    this.authManager = authManager;

    const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey && !authManager) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'anthropic',
        'API key is required when no authentication manager is provided. Set ANTHROPIC_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new Anthropic({
      apiKey: apiKey || 'placeholder',
      baseURL: config.baseUrl,
    });
  }

  /**
   * Validates adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'anthropic', 'Model name is required');
    }
  }

  /**
   * Gets authentication credentials.
   */
  private async getAuthCredentials(): Promise<string> {
    if (this.authManager) {
      try {
        const authResult = await this.authManager.ensureValidAuthentication('anthropic');
        if (authResult.success && authResult.credential) {
          return authResult.credential;
        } else {
          throw new AdapterError('AUTH_FAILED', 'anthropic', authResult.error || 'Authentication failed');
        }
      } catch (error) {
        throw new AdapterError('AUTH_FAILED', 'anthropic', error instanceof Error ? error.message : 'Authentication failed');
      }
    }

    const apiKey = this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new AdapterError('AUTH_FAILED', 'anthropic', 'No authentication available');
    }

    return apiKey;
  }

  /**
   * Generates a streaming response.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    try {
      const apiKey = await this.getAuthCredentials();
      this.client = new Anthropic({
        apiKey,
        baseURL: this.config.baseUrl,
      });

      const systemMessage = messages.find(m => m.role === 'system');
      const systemPrompt = systemMessage ? 
        (typeof systemMessage.content === 'string' ? systemMessage.content : 
          systemMessage.content.map(b => b.type === 'text' ? b.text : '').join('\n')) : 
        undefined;

      const anthropicMessages = convertMessages(messages);
      const anthropicTools = tools && tools.length > 0 ? convertTools(tools) : undefined;

      const stream = await this.client.messages.create({
        model: this.model,
        messages: anthropicMessages,
        system: systemPrompt,
        tools: anthropicTools,
        maxtokens: options?.maxTokens ?? this.config.maxOutputTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            // Tool call arguments delta
            // Note: Anthropic events don't include the index here directly, 
            // would need to track current block index
            yield {
              type: 'tool_call',
              id: '', // Would need to accumulate from previous events
              name: '',
              arguments: event.delta.partial_json,
            };
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            yield {
              type: 'tool_call',
              id: event.content_block.id,
              name: event.content_block.name,
              arguments: '',
            };
          }
        } else if (event.type === 'message_delta') {
          if (event.usage) {
            yield {
              type: 'done',
              usage: {
                inputTokens: event.usage.input_tokens || 0,
                outputTokens: event.usage.output_tokens || 0,
              },
            };
          }
        } else if (event.type === 'message_stop') {
          // Stream completed
          yield { type: 'done' };
        }
      }
    } catch (error) {
      logger.error('[Anthropic] Stream error:', error);
      
      if (error instanceof Anthropic.APIError) {
        yield {
          type: 'error',
          error: {
            code: ERROR_CODE_MAP[error.type] ?? 'API_ERROR',
            message: error.message,
          },
        };
      } else {
        yield {
          type: 'error',
          error: {
            code: 'API_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        };
      }
    }
  }

  /**
   * Counts tokens for messages.
   */
  countTokens(messages: Message[]): number {
    let charCount = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        charCount += msg.content.length;
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') {
            charCount += block.text.length;
          }
        }
      }
      charCount += msg.role.length;
    }
    // Very rough estimation: 4 chars per token
    return Math.ceil(charCount / 4);
  }
}

// Register adapter factory
registerAdapter('anthropic', (config, authManager) => new AnthropicAdapter(config, authManager));
