/**
 * @fileoverview Enhanced Ollama model adapter implementation
 * @module features/model/adapters/ollama
 *
 * Implements the IModelAdapter interface for Ollama local models.
 * Supports local model management, installation, updates, and better error handling.
 */

import { Ollama } from 'ollama';
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

/** Default Ollama host */
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

/** Default context limits by model family */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Llama models
  'llama2': 4096,
  'llama2:7b': 4096,
  'llama2:13b': 4096,
  'llama2:70b': 4096,
  'llama3': 8192,
  'llama3:8b': 8192,
  'llama3:70b': 8192,
  'llama3.1': 131072,
  'llama3.1:8b': 131072,
  'llama3.1:70b': 131072,
  'llama3.1:405b': 131072,
  
  // Code models
  'codellama': 16384,
  'codellama:7b': 16384,
  'codellama:13b': 16384,
  'codellama:34b': 16384,
  'codegemma': 8192,
  'codegemma:7b': 8192,
  
  // Mistral models
  'mistral': 8192,
  'mistral:7b': 8192,
  'mixtral': 32768,
  'mixtral:8x7b': 32768,
  'mixtral:8x22b': 65536,
  
  // Other popular models
  'phi3': 128000,
  'phi3:mini': 128000,
  'phi3:medium': 128000,
  'gemma': 8192,
  'gemma:2b': 8192,
  'gemma:7b': 8192,
  'qwen': 32768,
  'qwen:7b': 32768,
  'qwen:14b': 32768,
  'qwen:72b': 32768,
  'deepseek-coder': 16384,
  'deepseek-coder:6.7b': 16384,
  'deepseek-coder:33b': 16384,
  'neural-chat': 8192,
  'neural-chat:7b': 8192,
  'starling-lm': 8192,
  'starling-lm:7b': 8192,
  'orca-mini': 4096,
  'orca-mini:3b': 4096,
  'orca-mini:7b': 4096,
  'orca-mini:13b': 4096,
  'vicuna': 4096,
  'vicuna:7b': 4096,
  'vicuna:13b': 4096,
  'vicuna:33b': 4096,
};

/** Models that support function calling (limited in Ollama) */
const FUNCTION_CALLING_MODELS = new Set([
  'llama3.1',
  'llama3.1:8b',
  'llama3.1:70b',
  'llama3.1:405b',
  'mistral',
  'mistral:7b',
  'mixtral',
  'mixtral:8x7b',
  'qwen',
  'qwen:7b',
  'qwen:14b',
  'qwen:72b',
]);

/** Error code mapping from Ollama errors */
const ERROR_CODE_MAP: Record<string, string> = {
  'model not found': 'INVALID_REQUEST',
  'connection refused': 'NETWORK_ERROR',
  'context length exceeded': 'CONTEXT_OVERFLOW',
  'out of memory': 'API_ERROR',
  'model not loaded': 'INVALID_REQUEST',
  'invalid model': 'INVALID_REQUEST',
  'timeout': 'TIMEOUT',
};

// =============================================================================
// TYPES
// =============================================================================

interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: Date;
}

interface OllamaListResponse {
  models: OllamaModelInfo[];
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
 * Converts internal messages to Ollama format.
 */
function convertMessages(messages: Message[]): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}> {
  const ollamaMessages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> = [];

  for (const message of messages) {
    const content = getMessageContent(message);

    if (message.role === 'system') {
      ollamaMessages.push({
        role: 'system',
        content,
      });
    } else if (message.role === 'user') {
      ollamaMessages.push({
        role: 'user',
        content,
      });
    } else if (message.role === 'assistant') {
      // For tool calls, we'll include them in the content for now
      // since Ollama has limited tool calling support
      let assistantContent = content;
      
      if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
        const toolCallsText = message.toolCalls
          .map(tc => `Tool call: ${tc.name}(${tc.arguments})`)
          .join('\n');
        assistantContent = assistantContent ? `${assistantContent}\n\n${toolCallsText}` : toolCallsText;
      }
      
      ollamaMessages.push({
        role: 'assistant',
        _content: assistantContent,
      });
    } else if (message.role === 'tool') {
      // Convert tool results to user messages
      if (message.toolResults !== undefined) {
        for (const result of message.toolResults) {
          ollamaMessages.push({
            role: 'user',
            content: `Tool result from ${result.toolCallId}: ${result.content}`,
          });
        }
      }
    }
  }

  return ollamaMessages;
}

/**
 * Converts universal tool definitions to Ollama format (limited support).
 * For now, we'll include tools as system prompt instructions.
 */
function convertToolsToSystemPrompt(tools: UniversalToolDefinition[]): string {
  if (tools.length === 0) {
    return '';
  }

  const toolDescriptions = tools.map((tool) => {
    const params = Object.entries(tool.parameters.properties || {})
      .map(([name, schema]) => `${name}: ${(schema as any).description || (schema as any).type || 'any'}`)
      .join(', ');
    
    return `- ${tool.name}(${params}): ${tool.description}`;
  }).join('\n');

  return `\nYou have access to the following tools:\n${toolDescriptions}\n\nTo use a tool, respond with: Tool call: tool_name({"param": "value"})\n`;
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Maps Ollama API errors to StreamChunk error format.
 */
function handleApiError(error: unknown): StreamChunk {
  if (error instanceof Error) {
    // Try to extract error code from message
    const errorMessage = error.message.toLowerCase();
    let code = 'API_ERROR';
    
    for (const [ollamaError, mappedCode] of Object.entries(ERROR_CODE_MAP)) {
      if (errorMessage.includes(ollamaError)) {
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
 * Estimates tokens for Ollama models.
 * Most Ollama models use similar tokenization to their base models (roughly 3.5-4 chars per token).
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
  
  // Ollama models typically use 3.5-4 chars per token
  return Math.ceil(charCount / 3.75);
}

// =============================================================================
// OLLAMA ADAPTER
// =============================================================================

/**
 * Enhanced Ollama model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new OllamaAdapter({
 *   provider: 'ollama',
 *   model: 'llama3.1:8b',
 *   baseUrl: 'http://localhost:11434',
 * });
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.warn(chunk);
 * }
 * ```
 */
export class OllamaAdapter implements IModelAdapter {
  readonly provider = 'ollama';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: Ollama;
  private readonly config: ModelConfig;

  /**
   * Creates a new enhanced Ollama adapter.
   */
  constructor(config: ModelConfig) {
    this.config = config;
    this.model = config.model;
    const defaultContextLimit = MODEL_CONTEXT_LIMITS[config.model] || 8192;
    this.contextLimit = config.contextLimit ?? defaultContextLimit;
    this.supportsToolCalling = FUNCTION_CALLING_MODELS.has(config.model);

    const host = config.baseUrl ?? DEFAULT_OLLAMA_HOST;
    
    this.client = new Ollama({
      host,
    });
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'ollama', 'Model name is required');
    }
  }

  /**
   * Generates a streaming response from Ollama.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const ollamaMessages = convertMessages(messages);
    
    // Add tools to system prompt if provided
    if (tools && tools.length > 0) {
      const toolsPrompt = convertToolsToSystemPrompt(tools);
      const systemMessage = ollamaMessages.find(m => m.role === 'system');
      
      if (systemMessage) {
        systemMessage.content += toolsPrompt;
      } else {
        ollamaMessages.unshift({
          role: 'system',
          content: toolsPrompt.trim(),
        });
      }
    }

    try {
      // Check if model is available, pull if needed
      await this.ensureModelAvailable();
      
      const stream = await this.createStream(ollamaMessages, options);
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
   * Ensures the model is available locally, pulls it if needed.
   */
  private async ensureModelAvailable(): Promise<void> {
    try {
      // Check if model exists locally
      const models = await this.client.list();
      const modelExists = models.models.some(m => m.name === this.model || m.name.startsWith(this.model + ':'));
      
      if (!modelExists) {
        logger.info(`[Ollama] Model ${this.model} not found locally, pulling...`);
        
        // Pull the model
        await this.client.pull({ model: this.model });
        logger.info(`[Ollama] Successfully pulled model ${this.model}`);
      }
    } catch (error) {
      logger.error(`[Ollama] Failed to ensure model availability:`, error);
      throw new AdapterError(
        'INVALID_REQUEST',
        'ollama',
        `Failed to ensure model ${this.model} is available: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Lists available models locally.
   */
  async listLocalModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await this.client.list();
      return response.models;
    } catch (error) {
      logger.error('[Ollama] Failed to list local models:', error);
      throw new AdapterError(
        'API_ERROR',
        'ollama',
        `Failed to list local models: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Pulls a model from the Ollama registry.
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      logger.info(`[Ollama] Pulling model ${modelName}...`);
      await this.client.pull({ _model: modelName });
      logger.info(`[Ollama] Successfully pulled model ${modelName}`);
    } catch (error) {
      logger.error(`[Ollama] Failed to pull model ${modelName}:`, error);
      throw new AdapterError(
        'API_ERROR',
        'ollama',
        `Failed to pull model ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Removes a model from local storage.
   */
  async removeModel(modelName: string): Promise<void> {
    try {
      logger.info(`[Ollama] Removing model ${modelName}...`);
      await this.client.delete({ _model: modelName });
      logger.info(`[Ollama] Successfully removed model ${modelName}`);
    } catch (error) {
      logger.error(`[Ollama] Failed to remove model ${modelName}:`, error);
      throw new AdapterError(
        'API_ERROR',
        'ollama',
        `Failed to remove model ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Creates the Ollama streaming request.
   */
  private async createStream(
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>,
    options?: GenerateOptions
  ): Promise<AsyncIterable<any>> {
    logger.debug('[Ollama] Creating stream with:', {
      messageCount: messages.length,
      model: this.model
    });

    const requestParams = {
      model: this.model,
      messages,
      stream: true as const,
      options: {
        temperature: options?.temperature ?? 0.7,
        ...(options?.topP !== undefined ? { top_p: options.topP } : {}),
        ...(options?.stopSequences !== undefined ? { stop: options.stopSequences } : {}),
        num_predict: options?.maxTokens ?? this.config.maxOutputTokens ?? 4096,
      },
    };

    logger.debug('[Ollama] Request params:', {
      model: requestParams.model,
      messageCount: requestParams.messages.length,
      temperature: requestParams.options.temperature,
      num_predict: requestParams.options.num_predict
    });

    try {
      logger.debug('[Ollama] Making API call...');
      const stream = await this.client.chat(requestParams);
      logger.debug('[Ollama] Stream created successfully');
      return stream;
    } catch (error) {
      logger.error('[Ollama] API call failed:', error);
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
      for await (const chunk of stream) {
        hasStarted = true;
        
        if (chunk.message?.content) {
          yield { type: 'text', text: chunk.message.content };
        }
        
        if (chunk.done) {
          logger.debug('[Ollama] Stream finished');
          
          // Check for tool calls in the response
          const content = chunk.message?.content ?? '';
          const toolCallMatch = content.match(/Tool call: (\w+)\(([^)]*)\)/);
          
          if (toolCallMatch) {
            const [, toolName, argsStr] = toolCallMatch;
            try {
              const args = JSON.parse(argsStr || '{}');
              yield {
                type: 'tool_call',
                id: `ollama_${Date.now()}`,
                _name: toolName,
                arguments: JSON.stringify(args),
              };
            } catch {
              // Ignore malformed tool calls
            }
          }
          
          // Emit done chunk
          yield {
            type: 'done',
            usage: chunk.prompt_eval_count || chunk.eval_count ? {
              inputTokens: chunk.prompt_eval_count ?? 0,
              outputTokens: chunk.eval_count ?? 0,
            } : undefined,
          };
          hasFinished = true;
        }
      }
    } catch (error) {
      logger.error('[Ollama] Stream processing error:', error);
      
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
 * Creates an enhanced Ollama adapter from configuration.
 */
function createOllamaAdapter(config: ModelConfig): IModelAdapter {
  return new OllamaAdapter(config);
}

// Register the Ollama adapter factory
registerAdapter('ollama', createOllamaAdapter);

export { createOllamaAdapter };