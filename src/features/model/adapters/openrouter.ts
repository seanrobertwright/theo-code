/**
 * @fileoverview OpenRouter model adapter implementation
 * @module features/model/adapters/openrouter
 *
 * Implements the IModelAdapter interface for OpenRouter's unified API.
 * Supports dynamic model catalog, streaming responses, and tool calling.
 */

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
// TYPES
// =============================================================================

/** OpenRouter API response types */
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens?: number;
  };
  per_request_limits?: {
    prompttokens: string;
    completiontokens: string;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

interface OpenRouterUsage {
  prompttokens: number;
  completiontokens: number;
  totaltokens: number;
}

interface OpenRouterChoice {
  index: number;
  message?: {
    role: string;
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  delta?: {
    role?: string;
    content?: string | null;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
  finish_reason?: string | null;
}

interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

interface OpenRouterStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterChatMessage[];
  tools?: OpenRouterTool[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** OpenRouter API base URL */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Default context limit for unknown models */
const DEFAULT_CONTEXT_LIMIT = 4096;

/** Error code mapping from HTTP status */
const ERROR_STATUS_MAP: Record<number, string> = {
  401: 'AUTH_FAILED',
  429: 'RATE_LIMITED',
  400: 'INVALID_REQUEST',
  413: 'CONTEXT_OVERFLOW',
  402: 'RATE_LIMITED', // Payment required (credits exhausted)
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
  delta: OpenRouterChoice['delta'],
  accumulators: Map<number, ToolCallAccumulator>
): void {
  if (!delta?.tool_calls) {
    return;
  }

  for (const toolCall of delta.tool_calls) {
    const index = toolCall.index;
    let accumulator = accumulators.get(index);

    if (accumulator === undefined) {
      accumulator = {
        id: toolCall.id ?? '',
        name: toolCall.function?.name ?? '',
        arguments: '',
      };
      accumulators.set(index, accumulator);
    }

    if (toolCall.function?.arguments !== undefined) {
      accumulator.arguments += toolCall.function.arguments;
    }
    if (toolCall.function?.name !== undefined) {
      accumulator.name = toolCall.function.name;
    }
    if (toolCall.id !== undefined) {
      accumulator.id = toolCall.id;
    }
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
 * Converts an assistant message to OpenRouter format.
 */
function convertAssistantMessage(
  message: Message,
  content: string
): OpenRouterChatMessage {
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
 * Converts tool result messages to OpenRouter format.
 */
function convertToolMessage(message: Message): OpenRouterChatMessage[] {
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
 * Converts internal messages to OpenRouter format.
 */
function convertMessages(messages: Message[]): OpenRouterChatMessage[] {
  const result: OpenRouterChatMessage[] = [];

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
 * Converts universal tool definitions to OpenRouter format.
 */
function convertTools(tools: UniversalToolDefinition[]): OpenRouterTool[] {
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
function handleApiError(error: unknown): StreamChunk {
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
// HTTP CLIENT
// =============================================================================

/**
 * Simple HTTP client for OpenRouter API calls.
 */
class OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly appName: string;

  constructor(apiKey: string, baseUrl?: string, appName = 'theo-code') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? OPENROUTER_BASE_URL;
    this.appName = appName;
  }

  /**
   * Makes a request to the OpenRouter API.
   */
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/your-org/theo-code',
      'X-Title': this.appName,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`OpenRouter API error: ${response.status} ${errorText}`);
      (error as any).status = response.status;
      throw error;
    }

    return response;
  }

  /**
   * Fetches available models from OpenRouter.
   */
  async getModels(): Promise<OpenRouterModel[]> {
    const response = await this.makeRequest('/models');
    const data = await response.json() as OpenRouterModelsResponse;
    return data.data;
  }

  /**
   * Creates a chat completion request.
   */
  async createChatCompletion(request: OpenRouterChatRequest): Promise<OpenRouterResponse> {
    const response = await this.makeRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response.json() as Promise<OpenRouterResponse>;
  }

  /**
   * Creates a streaming chat completion request.
   */
  async createChatCompletionStream(
    request: OpenRouterChatRequest
  ): Promise<AsyncIterable<OpenRouterStreamChunk>> {
    const response = await this.makeRequest('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ ...request, _stream: true }),
    });

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return this.parseStreamResponse(response.body);
  }

  /**
   * Parses Server-Sent Events stream response.
   */
  private async *parseStreamResponse(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<OpenRouterStreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
    break;
  }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed === 'data: [DONE]') {
            continue;
          }
          if (!trimmed.startsWith('data: ')) {
            continue;
          }

          try {
            const jsonStr = trimmed.slice(6);
            const chunk: OpenRouterStreamChunk = JSON.parse(jsonStr);
            yield chunk;
          } catch (error) {
            logger.warn('[OpenRouter] Failed to parse stream chunk:', trimmed);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// =============================================================================
// OPENROUTER ADAPTER
// =============================================================================

/**
 * OpenRouter model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new OpenRouterAdapter({
 *   provider: 'openrouter',
 *   model: 'anthropic/claude-3.5-sonnet',
 *   apiKey: process.env.OPENROUTER_API_KEY,
 * }, authManager);
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.warn(chunk);
 * }
 * ```
 */
export class OpenRouterAdapter implements IModelAdapter {
  readonly provider = 'openrouter';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: OpenRouterClient;
  private readonly config: ModelConfig;
  private readonly authManager?: AuthenticationManager;
  private modelInfo: OpenRouterModel | null = null;

  /**
   * Creates a new OpenRouter adapter.
   */
  constructor(config: ModelConfig, authManager?: AuthenticationManager) {
    this.config = config;
    this.model = config.model;
    this.contextLimit = config.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    this.supportsToolCalling = true; // Most OpenRouter models support tools
    this.authManager = authManager;

    // Get API key from config or environment, but don't require it if auth manager is provided
    const apiKey = config.apiKey ?? process.env['OPENROUTER_API_KEY'];
    if (!apiKey && !authManager) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'openrouter',
        'API key is required when no authentication manager is provided. Set OPENROUTER_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new OpenRouterClient(apiKey || 'placeholder', config.baseUrl); // Use placeholder if auth manager will provide credentials
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'openrouter', 'Model name is required');
    }
  }

  /**
   * Gets authentication credentials using OAuth or API key fallback.
   */
  private async getAuthCredentials(): Promise<string> {
    if (this.authManager) {
      try {
        const authResult = await this.authManager.ensureValidAuthentication('openrouter');
        if (authResult.success && authResult.credential) {
          logger.debug(`[OpenRouter] Using ${authResult.method} authentication${authResult.usedFallback ? ' (fallback)' : ''}`);
          return authResult.credential;
        } else {
          throw new AdapterError(
            'AUTH_FAILED',
            'openrouter',
            authResult.error || 'Authentication failed'
          );
        }
      } catch (error) {
        logger.error('[OpenRouter] Authentication failed:', error);
        throw new AdapterError(
          'AUTH_FAILED',
          'openrouter',
          error instanceof Error ? error.message : 'Authentication failed'
        );
      }
    }

    // Fallback to config/environment API key
    const apiKey = this.config.apiKey ?? process.env['OPENROUTER_API_KEY'];
    if (!apiKey) {
      throw new AdapterError(
        'AUTH_FAILED',
        'openrouter',
        'No authentication available. Configure OAuth or provide API key.'
      );
    }

    return apiKey;
  }

  /**
   * Gets an authenticated OpenRouter client.
   */
  private async getAuthenticatedClient(): Promise<OpenRouterClient> {
    const apiKey = await this.getAuthCredentials();
    return new OpenRouterClient(apiKey, this.config.baseUrl);
  }

  /**
   * Loads model information from OpenRouter catalog.
   */
  async loadModelInfo(): Promise<void> {
    if (this.modelInfo !== null) {
    return;
  }

    try {
      const authenticatedClient = await this.getAuthenticatedClient();
      const models = await authenticatedClient.getModels();
      this.modelInfo = models.find(m => m.id === this.model) ?? null;
      
      if (this.modelInfo) {
        // Update context limit from model info
        (this as any).contextLimit = this.modelInfo.context_length;
        logger.debug('[OpenRouter] Loaded model info:', {
          model: this.model,
          contextLimit: this.contextLimit,
          pricing: this.modelInfo.pricing
        });
      } else {
        logger.warn('[OpenRouter] Model not found in catalog:', this.model);
      }
    } catch (error) {
      logger.warn('[OpenRouter] Failed to load model catalog:', error);
    }
  }

  /**
   * Gets model information, loading it if necessary.
   */
  async getModelInfo(): Promise<OpenRouterModel | null> {
    await this.loadModelInfo();
    return this.modelInfo;
  }

  /**
   * Generates a streaming response from OpenRouter.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const openrouterMessages = convertMessages(messages);
    const openrouterTools = this.shouldIncludeTools(tools) ? convertTools(tools) : undefined;

    try {
      // Get authenticated client
      const authenticatedClient = await this.getAuthenticatedClient();
      
      const stream = await this.createStream(authenticatedClient, openrouterMessages, openrouterTools, options);
      yield* this.processStream(stream);
    } catch (error) {
      yield handleApiError(error);
    }
  }

  /**
   * Counts tokens for messages using estimation.
   * OpenRouter doesn't provide a direct token counting API.
   */
  countTokens(messages: Message[]): number {
    let charCount = 0;
    for (const message of messages) {
      charCount += getMessageContent(message).length;
      charCount += message.role.length;
    }
    // Rough estimation: 4 characters per token
    return Math.ceil(charCount / 4);
  }

  /**
   * Determines if tools should be included in the request.
   */
  private shouldIncludeTools(tools?: UniversalToolDefinition[]): tools is UniversalToolDefinition[] {
    return tools !== undefined && tools.length > 0 && this.supportsToolCalling;
  }

  /**
   * Creates the OpenRouter streaming request.
   */
  private async createStream(
    client: OpenRouterClient,
    messages: OpenRouterChatMessage[],
    tools: OpenRouterTool[] | undefined,
    options?: GenerateOptions
  ): Promise<AsyncIterable<OpenRouterStreamChunk>> {
    logger.debug('[OpenRouter] Creating stream with:', {
      messageCount: messages.length,
      hasTools: !!tools,
      toolsCount: tools?.length ?? 0,
      model: this.model
    });

    const request: OpenRouterChatRequest = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      maxtokens: options?.maxTokens ?? this.config.maxOutputTokens,
      ...(tools !== undefined ? { tools } : {}),
      ...(options?.topP !== undefined ? { top_p: options.topP } : {}),
      ...(options?.stopSequences !== undefined ? { stop: options.stopSequences } : {}),
    };

    logger.debug('[OpenRouter] Request params:', {
      model: request.model,
      messageCount: request.messages.length,
      hasTools: 'tools' in request,
      temperature: request.temperature,
      maxtokens: request.max_tokens
    });

    try {
      logger.debug('[OpenRouter] Making API call...');
      const stream = await client.createChatCompletionStream(request);
      logger.debug('[OpenRouter] Stream created successfully');
      return stream;
    } catch (error) {
      logger.error('[OpenRouter] API call failed:', error);
      throw error;
    }
  }

  /**
   * Processes the streaming response and yields chunks.
   */
  private async *processStream(
    stream: AsyncIterable<OpenRouterStreamChunk>
  ): AsyncGenerator<StreamChunk> {
    const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) {
    continue;
  }

      const delta = choice.delta;
      if (delta?.content !== undefined && delta.content !== null) {
        yield { type: 'text', text: delta.content };
      }

      if (delta?.tool_calls !== undefined) {
        processToolCallDelta(delta, toolCallAccumulators);
      }

      const finishReason = choice.finish_reason;
      if (finishReason !== undefined && finishReason !== null) {
        yield* emitToolCalls(toolCallAccumulators);
        yield this.createDoneChunk(chunk.usage);
      }
    }
  }

  /**
   * Creates the done chunk with usage info.
   */
  private createDoneChunk(usage: OpenRouterUsage | undefined): StreamChunk {
    return {
      type: 'done',
      usage: usage !== undefined
        ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
        : undefined,
    };
  }
}

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

/**
 * Creates an OpenRouter adapter from configuration.
 */
function createOpenRouterAdapter(config: ModelConfig, authManager?: AuthenticationManager): IModelAdapter {
  return new OpenRouterAdapter(config, authManager);
}

// Register the OpenRouter adapter factory
registerAdapter('openrouter', createOpenRouterAdapter);

export { createOpenRouterAdapter };
