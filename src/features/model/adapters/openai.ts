/**
 * @fileoverview OpenAI model adapter implementation
 * @module features/model/adapters/openai
 *
 * Implements the IModelAdapter interface for OpenAI's GPT models.
 * Supports streaming responses, tool calling, and token counting.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions';
import { encoding_for_model, type TiktokenModel } from 'tiktoken';

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
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'o1': 128000,
  'o1-mini': 128000,
  'o1-preview': 128000,
};

/** Models that support tool calling */
const TOOL_CALLING_MODELS = new Set([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
]);

/** Error code mapping from HTTP status */
const ERROR_STATUS_MAP: Record<number, string> = {
  401: 'AUTH_FAILED',
  429: 'RATE_LIMITED',
  400: 'INVALID_REQUEST',
  413: 'CONTEXT_OVERFLOW',
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
  arguments: string;
}

/**
 * Processes a streaming tool call delta and updates the accumulator.
 */
function processToolCallDelta(
  delta: ChatCompletionChunk.Choice.Delta.ToolCall,
  accumulators: Map<number, ToolCallAccumulator>
): void {
  const index = delta.index;
  let accumulator = accumulators.get(index);

  if (accumulator === undefined) {
    accumulator = {
      id: delta.id ?? '',
      name: delta.function?.name ?? '',
      arguments: '',
    };
    accumulators.set(index, accumulator);
  }

  if (delta.function?.arguments !== undefined) {
    accumulator.arguments += delta.function.arguments;
  }
  if (delta.function?.name !== undefined) {
    accumulator.name = delta.function.name;
  }
  if (delta.id !== undefined) {
    accumulator.id = delta.id;
  }
}

/**
 * Converts accumulated tool calls to StreamChunk format.
 */
function emitToolCalls(accumulators: Map<number, ToolCallAccumulator>): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  for (const [, acc] of accumulators) {
    if (acc.id !== '' && acc.name !== '') {
      chunks.push({
        type: 'tool_call',
        id: acc.id,
        name: acc.name,
        arguments: acc.arguments,
      });
    }
  }
  return chunks;
}

// =============================================================================
// MESSAGE CONVERSION
// =============================================================================

/**
 * Extracts text content from a message.
 */
function getMessageContent(_message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Converts an assistant message to OpenAI format.
 */
function convertAssistantMessage(
  _message: Message,
  _content: string
): ChatCompletionMessageParam {
  if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: content.length > 0 ? content : null,
      tool_calls: message.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    };
  }
  return { role: 'assistant', content };
}

/**
 * Converts tool result messages to OpenAI format.
 */
function convertToolMessage(_message: Message): ChatCompletionMessageParam[] {
  if (message.toolResults === undefined) {
    return [];
  }

  return message.toolResults.map((result) => ({
    role: 'tool' as const,
    tool_call_id: result.toolCallId,
    content: result.content,
  }));
}

/**
 * Converts internal messages to OpenAI format.
 */
function convertMessages(messages: Message[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    const content = getMessageContent(message);

    if (message.role === 'system') {
      result.push({ role: 'system', content });
    } else if (message.role === 'user') {
      result.push({ role: 'user', content });
    } else if (message.role === 'assistant') {
      result.push(convertAssistantMessage(message, content));
    } else if (message.role === 'tool') {
      result.push(...convertToolMessage(message));
    }
  }

  return result;
}

/**
 * Converts universal tool definitions to OpenAI format.
 */
function convertTools(tools: UniversalToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
  }));
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Maps API errors to StreamChunk error format.
 */
function handleApiError(_error: unknown): StreamChunk {
  if (error instanceof Error && 'status' in error) {
    const apiError = error as Error & { status?: number };
    const code = ERROR_STATUS_MAP[apiError.status ?? 0] ?? 'API_ERROR';
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
 * Maps model name to tiktoken model.
 */
function getTiktokenModel(model: string): TiktokenModel {
  if (model.startsWith('gpt-4o') || model.startsWith('o1')) {
    return 'gpt-4o';
  }
  if (model.startsWith('gpt-4') {
    return 'gpt-4';
  }
  if (model.startsWith('gpt-3.5') {
    return 'gpt-3.5-turbo';
  }
  return 'gpt-4o';
}

/**
 * Counts tokens using tiktoken.
 */
function countTokensWithTiktoken(messages: Message[], _model: string): number {
  const tiktokenModel = getTiktokenModel(model);
  const encoding = encoding_for_model(tiktokenModel);

  let totalTokens = 0;
  for (const message of messages) {
    totalTokens += 4; // Message overhead
    totalTokens += encoding.encode(getMessageContent(message)).length;
    totalTokens += encoding.encode(message.role).length;
  }
  totalTokens += 3; // Reply priming

  encoding.free();
  return totalTokens;
}

/**
 * Estimates tokens without tiktoken (fallback).
 */
function estimateTokens(messages: Message[]): number {
  let charCount = 0;
  for (const message of messages) {
    charCount += getMessageContent(message).length;
    charCount += message.role.length;
  }
  return Math.ceil(charCount / 4);
}

// =============================================================================
// OPENAI ADAPTER
// =============================================================================

/**
 * OpenAI model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new OpenAIAdapter({
 *   provider: 'openai',
 *   model: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.warn(chunk);
 * }
 * ```
 */
export class OpenAIAdapter implements IModelAdapter {
  readonly provider = 'openai';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: OpenAI;
  private readonly config: ModelConfig;

  /**
   * Creates a new OpenAI adapter.
   */
  constructor(_config: ModelConfig) {
    this.config = config;
    this.model = config.model;
    this.contextLimit = config.contextLimit ?? MODEL_CONTEXT_LIMITS[config.model] ?? 128000;
    this.supportsToolCalling = TOOL_CALLING_MODELS.has(config.model);

    const apiKey = config.apiKey ?? process.env['OPENAI_API_KEY'];
    if (apiKey === undefined ?? apiKey === '') {
      throw new AdapterError(
        'INVALID_CONFIG',
        'openai',
        'API key is required. Set OPENAI_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
    });
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'openai', 'Model name is required');
    }
  }

  /**
   * Generates a streaming response from OpenAI.
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
   * Counts tokens for messages using tiktoken.
   */
  countTokens(messages: Message[]): number {
    try {
      return countTokensWithTiktoken(messages, this.model);
    } catch {
      return estimateTokens(messages);
    }
  }

  /**
   * Determines if tools should be included in the request.
   */
  private shouldIncludeTools(tools?: UniversalToolDefinition[]): tools is UniversalToolDefinition[] {
    return tools !== undefined && tools.length > 0 && this.supportsToolCalling;
  }

  /**
   * Creates the OpenAI streaming request.
   */
  private async createStream(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
    options?: GenerateOptions
  ): Promise<AsyncIterable<ChatCompletionChunk>> {
    logger.debug('[OpenAI] Creating stream with:', {
      messageCount: messages.length,
      hasTools: !!tools,
      toolsCount: tools?.length ?? 0,
      model: this.model
    });

    const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages,
      _stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? this.config.maxOutputTokens,
      ...(tools !== undefined ? { tools } : {}),
      ...(options?.topP !== undefined ? { top_p: options.topP } : {}),
      ...(options?.stopSequences !== undefined ? { stop: options.stopSequences } : {}),
    };

    logger.debug('[OpenAI] Request params:', {
      model: requestParams.model,
      messageCount: requestParams.messages.length,
      hasTools: 'tools' in requestParams,
      temperature: requestParams.temperature,
      max_tokens: requestParams.max_tokens
    });

    try {
      logger.debug('[OpenAI] Making API call...');
      const stream = await this.client.chat.completions.create(requestParams);
      logger.debug('[OpenAI] Stream created successfully');
      return stream;
    } catch (error) {
      logger.error('[OpenAI] API call failed:', error);
      throw error;
    }
  }

  /**
   * Processes the streaming response and yields chunks.
   */
  private async *processStream(
    stream: AsyncIterable<ChatCompletionChunk>
  ): AsyncGenerator<StreamChunk> {
    const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta === undefined) {
        continue;
      }

      if (delta.content !== undefined && delta.content !== null) {
        yield { type: 'text', text: delta.content };
      }

      if (delta.tool_calls !== undefined) {
        for (const toolCall of delta.tool_calls) {
          processToolCallDelta(toolCall, toolCallAccumulators);
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason !== undefined && finishReason !== null) {
        yield* emitToolCalls(toolCallAccumulators);
        yield this.createDoneChunk(chunk.usage);
      }
    }
  }

  /**
   * Creates the done chunk with usage info.
   */
  private createDoneChunk(usage: ChatCompletionChunk['usage']): StreamChunk {
    return {
      type: 'done',
      usage: usage !== undefined && usage !== null
        ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
        : undefined,
    };
  }
}

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

/**
 * Creates an OpenAI adapter from configuration.
 */
function createOpenAIAdapter(_config: ModelConfig): IModelAdapter {
  return new OpenAIAdapter(config);
}

// Register the OpenAI adapter factory
registerAdapter('openai', createOpenAIAdapter);

export { createOpenAIAdapter };
