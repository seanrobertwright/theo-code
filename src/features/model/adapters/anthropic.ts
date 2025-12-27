/**
 * @fileoverview Anthropic Claude model adapter implementation
 * @module features/model/adapters/anthropic
 *
 * Implements the IModelAdapter interface for Anthropic's Claude models.
 * Supports streaming responses, tool calling, and token counting.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  MessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages';

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
import { logger } from '../../../shared/utils/index.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default context limits by model */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-sonnet-20240620': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
};

/** Models that support tool calling */
const TOOL_CALLING_MODELS = new Set([
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
]);

/** Error code mapping from Anthropic errors */
const ERROR_CODE_MAP: Record<string, string> = {
  'authentication_error': 'AUTH_FAILED',
  'permission_error': 'AUTH_FAILED',
  'rate_limit_error': 'RATE_LIMITED',
  'invalid_request_error': 'INVALID_REQUEST',
  'api_error': 'API_ERROR',
  'overloaded_error': 'API_ERROR',
};

// =============================================================================
// TOOL CALL ACCUMULATOR
// =============================================================================

/**
 * Accumulator for streaming tool call data.
 */
interface ToolCallAccumulator {
  id: string;
  name: string;
  input: string;
}

// =============================================================================
// MESSAGE CONVERSION
// =============================================================================

/**
 * Extracts text content from a message.
 */
function getMessageContent(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Converts internal messages to Anthropic format.
 */
function convertMessages(messages: Message[]): { messages: MessageParam[]; system?: string } {
  const anthropicMessages: MessageParam[] = [];
  let systemMessage: string | undefined;

  for (const message of messages) {
    const content = getMessageContent(message);

    if (message.role === 'system') {
      // Anthropic handles system messages separately
      systemMessage = content;
    } else if (message.role === 'user') {
      anthropicMessages.push({
        role: 'user',
        content: [{ type: 'text', text: content }],
      });
    } else if (message.role === 'assistant') {
      if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
        // Assistant message with tool calls
        const contentBlocks: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: any }> = [];
        
        if (content.length > 0) {
          contentBlocks.push({ type: 'text', text: content });
        }
        
        for (const toolCall of message.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          });
        }
        
        anthropicMessages.push({
          role: 'assistant',
          content: contentBlocks,
        });
      } else {
        // Regular assistant message
        anthropicMessages.push({
          role: 'assistant',
          content: [{ type: 'text', text: content }],
        });
      }
    } else if (message.role === 'tool') {
      // Tool result messages
      if (message.toolResults !== undefined) {
        for (const result of message.toolResults) {
          anthropicMessages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: result.toolCallId,
                content: result.content,
              },
            ],
          });
        }
      }
    }
  }

  const result: { messages: MessageParam[]; system?: string } = { messages: anthropicMessages };
  if (systemMessage !== undefined) {
    result.system = systemMessage;
  }
  return result;
}

/**
 * Converts universal tool definitions to Anthropic format.
 */
function convertTools(tools: UniversalToolDefinition[]): Tool[] {
  return tools.map((tool) => {
    // Validate tool definition
    if (!tool.name || !tool.description) {
      throw new Error(`Invalid tool definition: name and description are required for tool: ${tool.name}`);
    }

    if (!tool.parameters || !tool.parameters.properties) {
      throw new Error(`Invalid tool definition: parameters.properties is required for tool: ${tool.name}`);
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required ?? [],
      },
    };
  });
}

/**
 * Validates and parses tool call arguments.
 */
function parseToolCallArguments(argumentsJson: string, toolName: string): any {
  if (!argumentsJson.trim()) {
    return {};
  }

  try {
    return JSON.parse(argumentsJson);
  } catch (error) {
    logger.warn(`[Anthropic] Failed to parse tool call arguments for ${toolName}:`, error);
    // Return the raw string if JSON parsing fails
    return { raw_input: argumentsJson };
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Maps Anthropic API errors to StreamChunk error format.
 */
function handleApiError(error: unknown): StreamChunk {
  if (error instanceof Anthropic.APIError) {
    // Use status or error code from the API error
    const errorType = (error as any).type || error.status?.toString() || 'unknown_error';
    const code = ERROR_CODE_MAP[errorType] ?? 'API_ERROR';
    return {
      type: 'error',
      error: { code, message: error.message },
    };
  }

  if (error instanceof Error) {
    return {
      type: 'error',
      error: { code: 'API_ERROR', message: error.message },
    };
  }

  return {
    type: 'error',
    error: { code: 'API_ERROR', message: 'Unknown error occurred' },
  };
}

// =============================================================================
// TOKEN COUNTING
// =============================================================================

/**
 * Token count cache to avoid redundant calculations.
 */
const tokenCountCache = new Map<string, number>();

/**
 * Creates a cache key for messages.
 */
function createCacheKey(messages: Message[]): string {
  return JSON.stringify(messages.map(m => ({ role: m.role, content: getMessageContent(m) })));
}

/**
 * Estimates tokens for Anthropic models (fallback method).
 * Anthropic uses a different tokenization than OpenAI.
 * Based on Anthropic's documentation: roughly 3.5 characters per token.
 */
function estimateTokens(messages: Message[]): number {
  let charCount = 0;
  for (const message of messages) {
    const content = getMessageContent(message);
    charCount += content.length;
    charCount += message.role.length;
    
    // Add overhead for message structure
    charCount += 10; // Estimated overhead per message
    
    // Add overhead for tool calls if present
    if (message.toolCalls !== undefined) {
      for (const toolCall of message.toolCalls) {
        charCount += toolCall.name.length;
        charCount += JSON.stringify(toolCall.arguments).length;
        charCount += 20; // Tool call overhead
      }
    }
    
    // Add overhead for tool results if present
    if (message.toolResults !== undefined) {
      for (const result of message.toolResults) {
        charCount += result.content.length;
        charCount += result.toolCallId.length;
        charCount += 15; // Tool result overhead
      }
    }
  }
  
  // Anthropic's tokenization is roughly 3.5 chars per token
  return Math.ceil(charCount / 3.5);
}

/**
 * Counts tokens using Anthropic's API (when available).
 * Currently falls back to estimation as Anthropic doesn't have a public token counting API.
 */
async function countTokensWithAPI(_client: Anthropic, messages: Message[], _model: string): Promise<number> {
  // TODO: Implement when Anthropic provides a token counting API
  // For now, use estimation
  return estimateTokens(messages);
}

// =============================================================================
// ANTHROPIC ADAPTER
// =============================================================================

/**
 * Anthropic Claude model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new AnthropicAdapter({
 *   provider: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * }, authManager);
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class AnthropicAdapter implements IModelAdapter {
  readonly provider = 'anthropic';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: Anthropic;
  private readonly config: ModelConfig;
  private readonly authManager?: AuthenticationManager;

  /**
   * Creates a new Anthropic adapter.
   */
  constructor(config: ModelConfig, authManager?: AuthenticationManager) {
    this.config = config;
    this.model = config.model;
    this.contextLimit = config.contextLimit ?? MODEL_CONTEXT_LIMITS[config.model] ?? 200000;
    this.supportsToolCalling = TOOL_CALLING_MODELS.has(config.model);
    this.authManager = authManager;

    // Get API key from config or environment, but don't require it if auth manager is provided
    const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey && !authManager) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'anthropic',
        'API key is required when no authentication manager is provided. Set ANTHROPIC_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new Anthropic({
      apiKey: apiKey || 'placeholder', // Use placeholder if auth manager will provide credentials
      baseURL: config.baseUrl,
    });
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'anthropic', 'Model name is required');
    }
  }

  /**
   * Gets authentication credentials using OAuth or API key fallback.
   */
  private async getAuthCredentials(): Promise<string> {
    if (this.authManager) {
      try {
        const authResult = await this.authManager.ensureValidAuthentication('anthropic');
        if (authResult.success && authResult.credential) {
          logger.debug(`[Anthropic] Using ${authResult.method} authentication${authResult.usedFallback ? ' (fallback)' : ''}`);
          return authResult.credential;
        } else {
          throw new AdapterError(
            'AUTH_FAILED',
            'anthropic',
            authResult.error || 'Authentication failed'
          );
        }
      } catch (error) {
        logger.error('[Anthropic] Authentication failed:', error);
        throw new AdapterError(
          'AUTH_FAILED',
          'anthropic',
          error instanceof Error ? error.message : 'Authentication failed'
        );
      }
    }

    // Fallback to config/environment API key
    const apiKey = this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new AdapterError(
        'AUTH_FAILED',
        'anthropic',
        'No authentication available. Configure OAuth or provide API key.'
      );
    }

    return apiKey;
  }

  /**
   * Generates a streaming response from Anthropic.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const { messages: anthropicMessages, system } = convertMessages(messages);
    const anthropicTools = this.shouldIncludeTools(tools) ? convertTools(tools) : undefined;

    try {
      // Get authentication credentials (OAuth or API key)
      const apiKey = await this.getAuthCredentials();
      
      // Create a new client instance with the current credentials
      const authenticatedClient = new Anthropic({
        apiKey,
        baseURL: this.config.baseUrl,
      });

      const stream = await this.createStream(authenticatedClient, anthropicMessages, system, anthropicTools, options);
      yield* this.processStream(stream);
    } catch (error) {
      yield handleApiError(error);
    }
  }

  /**
   * Counts tokens for messages using caching and estimation.
   * TODO: Integrate with Anthropic's token counting API when available.
   */
  countTokens(messages: Message[]): number {
    const cacheKey = createCacheKey(messages);
    
    // Check cache first
    const cachedCount = tokenCountCache.get(cacheKey);
    if (cachedCount !== undefined) {
      return cachedCount;
    }
    
    // Calculate token count
    const tokenCount = estimateTokens(messages);
    
    // Cache the result (with a reasonable cache size limit)
    if (tokenCountCache.size < 1000) {
      tokenCountCache.set(cacheKey, tokenCount);
    } else {
      // Clear cache when it gets too large
      tokenCountCache.clear();
      tokenCountCache.set(cacheKey, tokenCount);
    }
    
    return tokenCount;
  }

  /**
   * Determines if tools should be included in the request.
   */
  private shouldIncludeTools(tools?: UniversalToolDefinition[]): tools is UniversalToolDefinition[] {
    return tools !== undefined && tools.length > 0 && this.supportsToolCalling;
  }

  /**
   * Creates the Anthropic streaming request.
   */
  private async createStream(
    client: Anthropic,
    messages: MessageParam[],
    system: string | undefined,
    tools: Tool[] | undefined,
    options?: GenerateOptions
  ): Promise<AsyncIterable<MessageStreamEvent>> {
    logger.debug('[Anthropic] Creating stream with:', {
      messageCount: messages.length,
      hasSystem: !!system,
      hasTools: !!tools,
      toolsCount: tools?.length ?? 0,
      model: this.model
    });

    const requestParams: Anthropic.Messages.MessageCreateParamsStreaming = {
      model: this.model,
      messages,
      stream: true,
      max_tokens: options?.maxTokens ?? this.config.maxOutputTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      ...(system !== undefined ? { system } : {}),
      ...(tools !== undefined ? { tools } : {}),
      ...(options?.topP !== undefined ? { top_p: options.topP } : {}),
      ...(options?.stopSequences !== undefined ? { stop_sequences: options.stopSequences } : {}),
    };

    logger.debug('[Anthropic] Request params:', {
      model: requestParams.model,
      messageCount: requestParams.messages.length,
      hasSystem: 'system' in requestParams,
      hasTools: 'tools' in requestParams,
      temperature: requestParams.temperature,
      max_tokens: requestParams.max_tokens
    });

    try {
      logger.debug('[Anthropic] Making API call...');
      const stream = await client.messages.create(requestParams);
      logger.debug('[Anthropic] Stream created successfully');
      return stream;
    } catch (error) {
      logger.error('[Anthropic] API call failed:', error);
      throw error;
    }
  }

  /**
   * Processes the streaming response and yields chunks.
   */
  private async *processStream(
    stream: AsyncIterable<MessageStreamEvent>
  ): AsyncGenerator<StreamChunk> {
    const toolCallAccumulators = new Map<string, ToolCallAccumulator>();
    let hasStarted = false;
    let hasFinished = false;

    try {
      for await (const event of stream) {
        hasStarted = true;
        
        if (event.type === 'message_start') {
          logger.debug('[Anthropic] Message started');
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            logger.debug('[Anthropic] Text block started');
          } else if (event.content_block.type === 'tool_use') {
            // Start accumulating a new tool call
            logger.debug('[Anthropic] Tool use block started:', event.content_block.name);
            toolCallAccumulators.set(event.index.toString(), {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            // Accumulate tool call input
            const toolCall = toolCallAccumulators.get(event.index.toString());
            if (toolCall !== undefined) {
              toolCall.input += event.delta.partial_json;
            }
          }
        } else if (event.type === 'content_block_stop') {
          logger.debug('[Anthropic] Content block stopped at index:', event.index);
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason !== undefined) {
            logger.debug('[Anthropic] Message finished with reason:', event.delta.stop_reason);
            
            // Emit accumulated tool calls
            for (const [, acc] of toolCallAccumulators) {
              if (acc.id !== '' && acc.name !== '') {
                const parsedArguments = parseToolCallArguments(acc.input, acc.name);
                yield {
                  type: 'tool_call',
                  id: acc.id,
                  name: acc.name,
                  arguments: JSON.stringify(parsedArguments),
                };
              }
            }
            
            // Emit done chunk
            yield {
              type: 'done',
              usage: event.usage !== undefined
                ? { 
                    inputTokens: event.usage.input_tokens ?? 0, 
                    outputTokens: event.usage.output_tokens 
                  }
                : undefined,
            };
            hasFinished = true;
          }
        } else if (event.type === 'message_stop') {
          logger.debug('[Anthropic] Message stopped');
          if (!hasFinished) {
            // Emit any remaining tool calls
            for (const [, acc] of toolCallAccumulators) {
              if (acc.id !== '' && acc.name !== '') {
                const parsedArguments = parseToolCallArguments(acc.input, acc.name);
                yield {
                  type: 'tool_call',
                  id: acc.id,
                  name: acc.name,
                  arguments: JSON.stringify(parsedArguments),
                };
              }
            }
            
            // Emit done chunk without usage info
            yield { type: 'done' };
            hasFinished = true;
          }
        } else if ((event as any).type === 'error') {
          const errorEvent = event as any;
          logger.error('[Anthropic] Stream error:', errorEvent.error);
          yield {
            type: 'error',
            error: {
              code: ERROR_CODE_MAP[errorEvent.error?.type] ?? 'API_ERROR',
              message: errorEvent.error?.message ?? 'Unknown error',
            },
          };
          return;
        }
      }
    } catch (error) {
      logger.error('[Anthropic] Stream processing error:', error);
      
      // Handle stream interruption
      if (hasStarted && !hasFinished) {
        // Emit any accumulated tool calls before error
        for (const [, acc] of toolCallAccumulators) {
          if (acc.id !== '' && acc.name !== '' && acc.input !== '') {
            try {
              const parsedArguments = parseToolCallArguments(acc.input, acc.name);
              yield {
                type: 'tool_call',
                id: acc.id,
                name: acc.name,
                arguments: JSON.stringify(parsedArguments),
              };
            } catch {
              // Ignore errors when yielding partial tool calls
            }
          }
        }
      }
      
      yield handleApiError(error);
    }
  }
}

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

/**
 * Creates an Anthropic adapter from configuration.
 */
function createAnthropicAdapter(config: ModelConfig, authManager?: AuthenticationManager): IModelAdapter {
  return new AnthropicAdapter(config, authManager);
}

// Register the Anthropic adapter factory
registerAdapter('anthropic', createAnthropicAdapter);

export { createAnthropicAdapter };