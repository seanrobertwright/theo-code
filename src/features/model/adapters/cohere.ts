/**
 * @fileoverview Cohere model adapter implementation
 * @module features/model/adapters/cohere
 *
 * Implements the IModelAdapter interface for Cohere's Command models.
 * Supports streaming responses, tool calling, and enterprise features.
 */

import { CohereClient } from 'cohere-ai';
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
  'command': 128000,
  'command-light': 4096,
  'command-nightly': 128000,
  'command-r': 128000,
  'command-r-plus': 128000,
};

/** Models that support tool calling */
const TOOL_CALLING_MODELS = new Set([
  'command',
  'command-nightly',
  'command-r',
  'command-r-plus',
]);

/** Error code mapping from Cohere errors */
const ERROR_CODE_MAP: Record<string, string> = {
  'invalid_api_token': 'AUTH_FAILED',
  'unauthorized': 'AUTH_FAILED',
  'too_many_requests': 'RATE_LIMITED',
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
 * Converts internal messages to Cohere format.
 */
function convertMessages(messages: Message[]): { 
  message: string; 
  chatHistory?: Array<{ role: string; _message: string }>;
  preamble?: string;
} {
  const chatHistory: Array<{ role: string; _message: string }> = [];
  let preamble: string | undefined;
  let currentMessage = '';

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) {
    continue;
  }
    
    const content = getMessageContent(message);

    if (message.role === 'system') {
      // Cohere uses preamble for system messages
      preamble = content;
    } else if (message.role === 'user') {
      if (i === messages.length - 1) {
        // Last message becomes the current message
        currentMessage = content;
      } else {
        // Previous user messages go to chat history
        chatHistory.push({
          role: 'USER',
          _message: content,
        });
      }
    } else if (message.role === 'assistant') {
      chatHistory.push({
        role: 'CHATBOT',
        _message: content,
      });
    } else if (message.role === 'tool') {
      // Tool results are handled differently in Cohere
      // For now, we'll append them to the last user message
      if (message.toolResults !== undefined) {
        for (const result of message.toolResults) {
          chatHistory.push({
            role: 'USER',
            message: `Tool result from ${result.toolCallId}: ${result.content}`,
          });
        }
      }
    }
  }

  return {
    _message: currentMessage,
    ...(chatHistory.length > 0 ? { chatHistory } : {}),
    ...(preamble ? { preamble } : {}),
  };
}

/**
 * Converts universal tool definitions to Cohere format.
 */
function convertTools(tools: UniversalToolDefinition[]): Array<{
  name: string;
  description: string;
  parameterDefinitions: Record<string, any>;
}> {
  return tools.map((tool) => {
    // Validate tool definition
    if (!tool.name || !tool.description) {
      throw new Error(`Invalid tool definition: name and description are required for tool: ${tool.name}`);
    }

    if (!tool.parameters?.properties) {
      throw new Error(`Invalid tool definition: parameters.properties is required for tool: ${tool.name}`);
    }

    return {
      name: tool.name,
      description: tool.description,
      parameterDefinitions: Object.entries(tool.parameters.properties).reduce(
        (acc, [key, value]) => {
          acc[key] = {
            description: (value as any).description ?? '',
            type: (value as any).type || 'string',
            required: tool.parameters.required?.includes(key) ?? false,
          };
          return acc;
        },
        {} as Record<string, any>
      ),
    };
  });
}

/**
 * Validates and parses tool call arguments.
 */
function parseToolCallArguments(parameters: any, _toolName: string): any {
  if (!parameters) {
    return {};
  }

  try {
    // Cohere returns parameters as an object, not JSON string
    return typeof parameters === 'string' ? JSON.parse(parameters) : parameters;
  } catch (error) {
    logger.warn(`[Cohere] Failed to parse tool call arguments for ${toolName}:`, error);
    return { _raw_input: parameters };
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Maps Cohere API errors to StreamChunk error format.
 */
function handleApiError(error: unknown): StreamChunk {
  if (error instanceof Error) {
    // Try to extract error code from message
    const errorMessage = error.message.toLowerCase();
    let code = 'API_ERROR';
    
    for (const [cohereError, mappedCode] of Object.entries(ERROR_CODE_MAP)) {
      if (errorMessage.includes(cohereError)) {
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
 * Estimates tokens for Cohere models.
 * Cohere uses roughly 4 characters per token.
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
  
  // Cohere's tokenization is roughly 4 chars per token
  return Math.ceil(charCount / 4);
}

// =============================================================================
// COHERE ADAPTER
// =============================================================================

/**
 * Cohere model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new CohereAdapter({
 *   provider: 'cohere',
 *   model: 'command',
 *   apiKey: process.env.COHERE_API_KEY,
 * });
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.warn(chunk);
 * }
 * ```
 */
export class CohereAdapter implements IModelAdapter {
  readonly provider = 'cohere';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: CohereClient;
  private readonly config: ModelConfig;

  /**
   * Creates a new Cohere adapter.
   */
  constructor(config: ModelConfig) {
    this.config = config;
    this.model = config.model;
    this.contextLimit = config.contextLimit ?? MODEL_CONTEXT_LIMITS[config.model] ?? 128000;
    this.supportsToolCalling = TOOL_CALLING_MODELS.has(config.model);

    const apiKey = config.apiKey ?? process.env['COHERE_API_KEY'];
    if (apiKey === undefined || apiKey === '') {
      throw new AdapterError(
        'INVALID_CONFIG',
        'cohere',
        'API key is required. Set COHERE_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new CohereClient({
      token: apiKey,
    });
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'cohere', 'Model name is required');
    }
  }

  /**
   * Generates a streaming response from Cohere.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const { message, chatHistory, preamble } = convertMessages(messages);
    const cohereTools = this.shouldIncludeTools(tools) ? convertTools(tools) : undefined;

    try {
      const stream = await this.createStream(message, chatHistory, preamble, cohereTools, options);
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
   * Creates the Cohere streaming request.
   */
  private async createStream(
    _message: string,
    chatHistory: Array<{ role: string; _message: string }> | undefined,
    preamble: string | undefined,
    tools: Array<{ name: string; description: string; parameterDefinitions: Record<string, any> }> | undefined,
    options?: GenerateOptions
  ): Promise<AsyncIterable<any>> {
    logger.debug('[Cohere] Creating stream with:', {
      messageLength: message.length,
      historyCount: chatHistory?.length ?? 0,
      hasPreamble: !!preamble,
      hasTools: !!tools,
      toolsCount: tools?.length ?? 0,
      model: this.model
    });

    const requestParams: any = {
      model: this.model,
      message,
      maxTokens: options?.maxTokens ?? this.config.maxOutputTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      ...(chatHistory !== undefined ? { chatHistory } : {}),
      ...(preamble !== undefined ? { preamble } : {}),
      ...(tools !== undefined ? { tools } : {}),
      ...(options?.topP !== undefined ? { p: options.topP } : {}),
      ...(options?.stopSequences !== undefined ? { stopSequences: options.stopSequences } : {}),
    };

    logger.debug('[Cohere] Request params:', {
      model: requestParams.model,
      messageLength: requestParams.message.length,
      hasHistory: 'chatHistory' in requestParams,
      hasPreamble: 'preamble' in requestParams,
      hasTools: 'tools' in requestParams,
      temperature: requestParams.temperature,
      maxTokens: requestParams.maxTokens
    });

    try {
      logger.debug('[Cohere] Making API call...');
      const stream = await this.client.chatStream(requestParams);
      logger.debug('[Cohere] Stream created successfully');
      return stream;
    } catch (error) {
      logger.error('[Cohere] API call failed:', error);
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

    try {
      for await (const event of stream) {
        hasStarted = true;
        
        if (event.eventType === 'text-generation') {
          if (event.text) {
            yield { type: 'text', text: event.text };
          }
        } else if (event.eventType === 'tool-calls-generation') {
          if (event.toolCalls) {
            for (const toolCall of event.toolCalls) {
              const parsedArguments = parseToolCallArguments(toolCall.parameters, toolCall.name);
              yield {
                type: 'tool_call',
                id: toolCall.name + '_' + Date.now(), // Cohere doesn't provide IDs
                name: toolCall.name,
                arguments: JSON.stringify(parsedArguments),
              };
            }
          }
        } else if (event.eventType === 'stream-end') {
          logger.debug('[Cohere] Stream ended');
          
          // Emit done chunk with usage info if available
          yield {
            type: 'done',
            usage: event.response?.meta?.billedUnits ? {
              inputTokens: event.response.meta.billedUnits.inputTokens ?? 0,
              outputTokens: event.response.meta.billedUnits.outputTokens ?? 0,
            } : undefined,
          };
          hasFinished = true;
        }
      }
    } catch (error) {
      logger.error('[Cohere] Stream processing error:', error);
      
      if (hasStarted && !hasFinished) {
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
 * Creates a Cohere adapter from configuration.
 */
function createCohereAdapter(config: ModelConfig): IModelAdapter {
  return new CohereAdapter(config);
}

// Register the Cohere adapter factory
registerAdapter('cohere', createCohereAdapter);

export { createCohereAdapter };