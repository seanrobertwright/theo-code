/**
 * @fileoverview Together AI model adapter implementation
 * @module features/model/adapters/together
 *
 * Implements the IModelAdapter interface for Together AI models.
 * Supports open-source model catalog, custom model deployment, and streaming.
 */

import OpenAI from 'openai';
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
import { logger } from '../../../shared/utils/index.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Together AI API base URL */
const TOGETHER_BASE_URL = 'https://api.together.xyz/v1';

/** Default context limits by model family */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Llama models
  'meta-llama/Llama-2-7b-chat-hf': 4096,
  'meta-llama/Llama-2-13b-chat-hf': 4096,
  'meta-llama/Llama-2-70b-chat-hf': 4096,
  'meta-llama/Meta-Llama-3-8B-Instruct': 8192,
  'meta-llama/Meta-Llama-3-70B-Instruct': 8192,
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': 131072,
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': 131072,
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': 131072,
  
  // Mistral models
  'mistralai/Mistral-7B-Instruct-v0.1': 8192,
  'mistralai/Mistral-7B-Instruct-v0.3': 32768,
  'mistralai/Mixtral-8x7B-Instruct-v0.1': 32768,
  'mistralai/Mixtral-8x22B-Instruct-v0.1': 65536,
  
  // Code models
  'codellama/CodeLlama-7b-Instruct-hf': 16384,
  'codellama/CodeLlama-13b-Instruct-hf': 16384,
  'codellama/CodeLlama-34b-Instruct-hf': 16384,
  'WizardLM/WizardCoder-Python-34B-V1.0': 8192,
  
  // Other popular models
  'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO': 32768,
  'teknium/OpenHermes-2.5-Mistral-7B': 8192,
  'Qwen/Qwen1.5-7B-Chat': 32768,
  'Qwen/Qwen1.5-14B-Chat': 32768,
  'Qwen/Qwen1.5-72B-Chat': 32768,
};

/** Models that support function calling (limited on Together) */
const FUNCTION_CALLING_MODELS = new Set([
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
  'mistralai/Mixtral-8x22B-Instruct-v0.1',
]);

/** Error code mapping from Together/OpenAI errors */
const ERROR_CODE_MAP: Record<string, string> = {
  'invalid_api_key': 'AUTH_FAILED',
  'unauthorized': 'AUTH_FAILED',
  'rate_limit_exceeded': 'RATE_LIMITED',
  'invalid_request_error': 'INVALID_REQUEST',
  'context_length_exceeded': 'CONTEXT_OVERFLOW',
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
 * Converts internal messages to OpenAI format (Together compatible).
 */
function convertMessages(messages: Message[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    const content = getMessageContent(message);

    if (message.role === 'system') {
      openaiMessages.push({
        role: 'system',
        content,
      });
    } else if (message.role === 'user') {
      openaiMessages.push({
        role: 'user',
        content,
      });
    } else if (message.role === 'assistant') {
      if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
        // Assistant message with tool calls
        openaiMessages.push({
          role: 'assistant',
          content: content || null,
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
        openaiMessages.push({
          role: 'assistant',
          content,
        });
      }
    } else if (message.role === 'tool') {
      // Tool result messages
      if (message.toolResults !== undefined) {
        for (const result of message.toolResults) {
          openaiMessages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: result.toolCallId,
          });
        }
      }
    }
  }

  return openaiMessages;
}

/**
 * Converts universal tool definitions to OpenAI format (Together compatible).
 */
function convertTools(tools: UniversalToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
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

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Maps Together/OpenAI API errors to StreamChunk error format.
 */
function handleApiError(error: unknown): StreamChunk {
  if (error instanceof OpenAI.APIError) {
    const errorType = error.type || 'unknown';
    const code = ERROR_CODE_MAP[errorType] || 'API_ERROR';
    return {
      type: 'error',
      error: { code, message: error.message },
    };
  }

  if (error instanceof Error) {
    // Try to extract error code from message
    const errorMessage = error.message.toLowerCase();
    let code = 'API_ERROR';
    
    for (const [togetherError, mappedCode] of Object.entries(ERROR_CODE_MAP)) {
      if (errorMessage.includes(togetherError)) {
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
 * Estimates tokens for Together models.
 * Most Together models use similar tokenization to Llama/Mistral (roughly 3.5-4 chars per token).
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
  
  // Together models typically use 3.5-4 chars per token
  return Math.ceil(charCount / 3.75);
}

// =============================================================================
// TOGETHER ADAPTER
// =============================================================================

/**
 * Together AI model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new TogetherAdapter({
 *   provider: 'together',
 *   model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
 *   apiKey: process.env.TOGETHER_API_KEY,
 * });
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class TogetherAdapter implements IModelAdapter {
  readonly provider = 'together';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: OpenAI;
  private readonly config: ModelConfig;

  /**
   * Creates a new Together adapter.
   */
  constructor(config: ModelConfig) {
    this.config = config;
    this.model = config.model;
    const defaultContextLimit = MODEL_CONTEXT_LIMITS[config.model] || 8192;
    this.contextLimit = config.contextLimit ?? defaultContextLimit;
    this.supportsToolCalling = FUNCTION_CALLING_MODELS.has(config.model);

    const apiKey = config.apiKey ?? process.env['TOGETHER_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      throw new AdapterError(
        'INVALID_CONFIG',
        'together',
        'API key is required. Set TOGETHER_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl ?? TOGETHER_BASE_URL,
    });
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'together', 'Model name is required');
    }
  }

  /**
   * Generates a streaming response from Together.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const openaiMessages = convertMessages(messages);
    const openaiTools = this.shouldIncludeTools(tools) ? convertTools(tools) : undefined;

    try {
      const stream = await this.createStream(openaiMessages, openaiTools, options);
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
   * Creates the Together streaming request.
   */
  private async createStream(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    options?: GenerateOptions
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    logger.debug('[Together] Creating stream with:', {
      messageCount: messages.length,
      hasTools: !!tools,
      toolsCount: tools?.length ?? 0,
      model: this.model
    });

    const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages,
      stream: true,
      max_tokens: options?.maxTokens ?? this.config.maxOutputTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      ...(tools !== undefined ? { tools } : {}),
      ...(options?.topP !== undefined ? { top_p: options.topP } : {}),
      ...(options?.stopSequences !== undefined ? { stop: options.stopSequences } : {}),
    };

    logger.debug('[Together] Request params:', {
      model: requestParams.model,
      messageCount: requestParams.messages.length,
      hasTools: 'tools' in requestParams,
      temperature: requestParams.temperature,
      max_tokens: requestParams.max_tokens
    });

    try {
      logger.debug('[Together] Making API call...');
      const stream = await this.client.chat.completions.create(requestParams);
      logger.debug('[Together] Stream created successfully');
      return stream;
    } catch (error) {
      logger.error('[Together] API call failed:', error);
      throw error;
    }
  }

  /**
   * Processes the streaming response and yields chunks.
   */
  private async *processStream(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
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
          if (!choice) continue;
          
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
                    arguments: toolCall.function.arguments || '',
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
            logger.debug('[Together] Stream finished with reason:', choice.finish_reason);
            
            // Emit accumulated tool calls
            for (const [, acc] of toolCallAccumulators) {
              if (acc.id && acc.name) {
                yield {
                  type: 'tool_call',
                  id: acc.id,
                  name: acc.name,
                  arguments: acc.arguments,
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
      logger.error('[Together] Stream processing error:', error);
      
      if (hasStarted && !hasFinished) {
        // Emit any accumulated tool calls before error
        for (const [, acc] of toolCallAccumulators) {
          if (acc.id && acc.name && acc.arguments) {
            try {
              yield {
                type: 'tool_call',
                id: acc.id,
                name: acc.name,
                arguments: acc.arguments,
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
 * Creates a Together adapter from configuration.
 */
function createTogetherAdapter(config: ModelConfig): IModelAdapter {
  return new TogetherAdapter(config);
}

// Register the Together adapter factory
registerAdapter('together', createTogetherAdapter);

export { createTogetherAdapter };