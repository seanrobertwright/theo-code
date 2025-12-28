/**
 * @fileoverview Mistral AI model adapter implementation
 * @module features/model/adapters/mistral
 *
 * Implements the IModelAdapter interface for Mistral AI models.
 * Supports streaming responses, function calling, and European compliance features.
 */

import { Mistral } from '@mistralai/mistralai';
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
// =============================================================================
// CONSTANTS
// =============================================================================

/** Default context limits by model */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'mistral-large-latest': 128000,
  'mistral-large-2407': 128000,
  'mistral-medium-latest': 32000,
  'mistral-small-latest': 32000,
  'mistral-tiny': 32000,
  'codestral-latest': 32000,
  'codestral-mamba-latest': 256000,
};

/** Models that support function calling */
const FUNCTION_CALLING_MODELS = new Set([
  'mistral-large-latest',
  'mistral-large-2407',
  'mistral-small-latest',
  'codestral-latest',
]);

/** Error code mapping from Mistral errors */
const ERROR_CODE_MAP: Record<string, string> = {
  'invalid_api_key': 'AUTH_FAILED',
  'unauthorized': 'AUTH_FAILED',
  'rate_limit_exceeded': 'RATE_LIMITED',
  'invalid_request': 'INVALID_REQUEST',
  'internal_server_error': 'API_ERROR',
  'service_unavailable': 'API_ERROR',
};

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
 * Converts internal messages to Mistral format.
 */
function convertMessages(messages: Message[]): Array<{
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}> {
  const mistralMessages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
  }> = [];

  for (const message of messages) {
    const content = getMessageContent(message);

    if (message.role === 'system') {
      mistralMessages.push({
        role: 'system',
        content,
      });
    } else if (message.role === 'user') {
      mistralMessages.push({
        role: 'user',
        content,
      });
    } else if (message.role === 'assistant') {
      if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
        // Assistant message with tool calls
        mistralMessages.push({
          role: 'assistant',
          content: content ?? '',
          tool_calls: message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: {
              name: toolCall.name,
              arguments: typeof toolCall.arguments === 'string' 
                ? toolCall.arguments 
                : JSON.stringify(toolCall.arguments),
            },
          })),
        });
      } else {
        // Regular assistant message
        mistralMessages.push({
          role: 'assistant',
          content,
        });
      }
    } else if (message.role === 'tool') {
      // Tool result messages
      if (message.toolResults !== undefined) {
        for (const result of message.toolResults) {
          mistralMessages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: result.toolCallId,
          });
        }
      }
    }
  }

  return mistralMessages;
}

/**
 * Converts universal tool definitions to Mistral format.
 */
function convertTools(tools: UniversalToolDefinition[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}> {
  return tools.map((tool) => {
    // Validate tool definition
    if (!tool.name || !tool.description) {
      throw new Error(`Invalid tool definition: name and description are required for tool: ${tool.name}`);
    }

    if (!tool.parameters || !tool.parameters.properties) {
      throw new Error(`Invalid tool definition: parameters.properties is required for tool: ${tool.name}`);
    }

    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required ?? [],
        },
      },
    };
  });
}

/**
 * Validates and parses tool call arguments.
 */
function parseToolCallArguments(argumentsJson: string, _toolName: string): any {
  if (!argumentsJson.trim()) {
    return {};
  }

  try {
    return JSON.parse(argumentsJson);
  } catch (error) {
    logger.warn(`[Mistral] Failed to parse tool call arguments for ${toolName}:`, error);
    // Return the raw string if JSON parsing fails
    return { _raw_input: argumentsJson };
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Maps Mistral API errors to StreamChunk error format.
 */
function handleApiError(error: unknown): StreamChunk {
  if (error instanceof Error) {
    // Try to extract error code from message
    const errorMessage = error.message.toLowerCase();
    let code = 'API_ERROR';
    
    for (const [mistralError, mappedCode] of Object.entries(ERROR_CODE_MAP)) {
      if (errorMessage.includes(mistralError)) {
        code = mappedCode;
        break;
      }
    }

    return {
      type: 'error',
      error: { code, message: error.message },
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
 * Estimates tokens for Mistral models.
 * Mistral uses roughly 3.5 characters per token (similar to GPT models).
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
  
  // Mistral's tokenization is roughly 3.5 chars per token
  return Math.ceil(charCount / 3.5);
}

// =============================================================================
// MISTRAL ADAPTER
// =============================================================================

/**
 * Mistral AI model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new MistralAdapter({
 *   provider: 'mistral',
 *   model: 'mistral-large-latest',
 *   apiKey: process.env.MISTRAL_API_KEY,
 * });
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.warn(chunk);
 * }
 * ```
 */
export class MistralAdapter implements IModelAdapter {
  readonly provider = 'mistral';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: Mistral;
  private readonly config: ModelConfig;

  /**
   * Creates a new Mistral adapter.
   */
  constructor(config: ModelConfig) {
    this.config = config;
    this.model = config.model;
    this.contextLimit = config.contextLimit ?? MODEL_CONTEXT_LIMITS[config.model] ?? 32000;
    this.supportsToolCalling = FUNCTION_CALLING_MODELS.has(config.model);

    const apiKey = config.apiKey ?? process.env['MISTRAL_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      throw new AdapterError(
        'INVALID_CONFIG',
        'mistral',
        'API key is required. Set MISTRAL_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new Mistral({
      apiKey,
      ...(config.baseUrl ? { serverURL: config.baseUrl } : {}),
    });
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'mistral', 'Model name is required');
    }
  }

  /**
   * Generates a streaming response from Mistral.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const mistralMessages = convertMessages(messages);
    const mistralTools = this.shouldIncludeTools(tools) ? convertTools(tools) : undefined;

    try {
      const stream = await this.createStream(mistralMessages, mistralTools, options);
      yield* this.processStream(stream);
    } catch (error) {
      yield handleApiError(error);
    }
  }

  /**
   * Counts tokens for messages using caching and estimation.
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
   * Creates the Mistral streaming request.
   */
  private async createStream(
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
      tool_call_id?: string;
    }>,
    tools: Array<{
      type: 'function';
      function: {
        name: string;
        description: string;
        parameters: any;
      };
    }> | undefined,
    options?: GenerateOptions
  ): Promise<AsyncIterable<any>> {
    logger.debug('[Mistral] Creating stream with:', {
      messageCount: messages.length,
      hasTools: !!tools,
      toolsCount: tools?.length ?? 0,
      model: this.model
    });

    const requestParams: any = {
      model: this.model,
      messages,
      _stream: true,
      maxTokens: options?.maxTokens ?? this.config.maxOutputTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      ...(tools !== undefined ? { tools } : {}),
      ...(options?.topP !== undefined ? { topP: options.topP } : {}),
      ...(options?.stopSequences !== undefined ? { stop: options.stopSequences } : {}),
    };

    logger.debug('[Mistral] Request params:', {
      model: requestParams.model,
      messageCount: requestParams.messages.length,
      hasTools: 'tools' in requestParams,
      temperature: requestParams.temperature,
      maxTokens: requestParams.maxTokens
    });

    try {
      logger.debug('[Mistral] Making API call...');
      const stream = await this.client.chat.stream(requestParams);
      logger.debug('[Mistral] Stream created successfully');
      return stream;
    } catch (error) {
      logger.error('[Mistral] API call failed:', error);
      throw error;
    }
  }

  /**
   * Processes the streaming response and yields chunks.
   */
  private async *processStream(
    stream: AsyncIterable<any>
  ): AsyncGenerator<StreamChunk> {
    let hasStarted = false;
    let hasFinished = false;
    const toolCallAccumulators = new Map<string, {
      id: string;
      name: string;
      arguments: string;
    }>();

    try {
      for await (const chunk of stream) {
        hasStarted = true;
        
        if (chunk.choices && chunk.choices.length > 0) {
          const choice = chunk.choices[0];
          
          if (choice.delta?.content) {
            yield { type: 'text', text: choice.delta.content };
          }
          
          if (choice.delta?.tool_calls) {
            for (const toolCall of choice.delta.tool_calls) {
              if (toolCall.id && toolCall.function?.name) {
                // Start or update tool call accumulator
                if (!toolCallAccumulators.has(toolCall.id)) {
                  toolCallAccumulators.set(toolCall.id, {
                    id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments ?? '',
                  });
                } else {
                  const acc = toolCallAccumulators.get(toolCall.id)!;
                  if (toolCall.function.arguments) {
                    acc.arguments += toolCall.function.arguments;
                  }
                }
              }
            }
          }
          
          if (choice.finish_reason) {
            logger.debug('[Mistral] Stream finished with reason:', choice.finish_reason);
            
            // Emit accumulated tool calls
            for (const [, acc] of toolCallAccumulators) {
              if (acc.id && acc.name) {
                const parsedArguments = parseToolCallArguments(acc.arguments, acc.name);
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
              usage: chunk.usage ? {
                inputTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
              } : undefined,
            };
            hasFinished = true;
          }
        }
      }
    } catch (error) {
      logger.error('[Mistral] Stream processing error:', error);
      
      if (hasStarted && !hasFinished) {
        // Emit any accumulated tool calls before error
        for (const [, acc] of toolCallAccumulators) {
          if (acc.id && acc.name && acc.arguments) {
            try {
              const parsedArguments = parseToolCallArguments(acc.arguments, acc.name);
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
        
        // Emit done chunk if stream was interrupted
        yield { type: 'done' };
      }
      
      yield handleApiError(error);
    }
  }
}

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

/**
 * Creates a Mistral adapter from configuration.
 */
function createMistralAdapter(config: ModelConfig): IModelAdapter {
  return new MistralAdapter(config);
}

// Register the Mistral adapter factory
registerAdapter('mistral', createMistralAdapter);

export { createMistralAdapter };