/**
 * @fileoverview Google Gemini model adapter implementation
 * @module features/model/adapters/google
 *
 * Implements the IModelAdapter interface for Google's Gemini models.
 * Supports streaming responses, function calling, advanced reasoning features,
 * multimodal capabilities, and native image generation.
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  GenerateContentRequest,
  GenerateContentResponse,
  GenerateContentStreamResult,
  Content,
  Part,
  FunctionDeclaration,
  Tool,
  SafetySetting,
  HarmCategory,
  HarmBlockThreshold,
  GenerationConfig,
  SchemaType,
  DynamicRetrievalMode,
} from '@google/generative-ai';

import type {
  Message,
  UniversalToolDefinition,
  ContentBlock,
} from '../../../shared/types/index.js';
import { createToolCallId, createMessageId } from '../../../shared/types/index.js';
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
// =============================================================================
// CONSTANTS
// =============================================================================

/** Default context limits by model */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gemini-3-pro-preview': 1000000,
  'gemini-3-flash-preview': 1000000,
  'gemini-3-pro-image-preview': 1000000,
  'gemini-2-flash-preview': 1000000,
  'gemini-2-flash-thinking-preview': 1000000,
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-flash': 1000000,
  'gemini-1.5-pro-latest': 2000000,
  'gemini-1.5-flash-latest': 1000000,
};

/** Models that support function calling */
const FUNCTION_CALLING_MODELS = new Set([
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2-flash-preview',
  'gemini-2-flash-thinking-preview',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-latest',
]);

/** Models that support thinking levels */
const THINKING_MODELS = new Set([
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2-flash-thinking-preview',
]);

/** Models that support image generation */
const IMAGE_GENERATION_MODELS = new Set([
  'gemini-3-pro-image-preview',
]);

/** Error code mapping from Google errors */
const ERROR_CODE_MAP: Record<string, string> = {
  'PERMISSION_DENIED': 'AUTH_FAILED',
  'UNAUTHENTICATED': 'AUTH_FAILED',
  'RESOURCE_EXHAUSTED': 'RATE_LIMITED',
  'INVALID_ARGUMENT': 'INVALID_REQUEST',
  'FAILED_PRECONDITION': 'INVALID_REQUEST',
  'OUT_OF_RANGE': 'CONTEXT_OVERFLOW',
  'INTERNAL': 'API_ERROR',
  'UNAVAILABLE': 'API_ERROR',
  'DEADLINE_EXCEEDED': 'TIMEOUT',
};

// =============================================================================
// TYPES
// =============================================================================

/** Gemini 3.0 specific configuration */
interface Gemini3Config {
  thinkingLevel?: 'low' | 'medium' | 'high';
  mediaResolution?: 'low' | 'medium' | 'high' | 'ultra_high';
  thoughtSignatures?: boolean;
  imageGeneration?: {
    aspectRatio?: string;
    imageSize?: '1K' | '2K' | '4K';
  };
}

/** Extended model configuration for Google */
interface GoogleModelConfig extends ModelConfig {
  gemini?: Gemini3Config;
}

/** Tool call accumulator for streaming */
interface ToolCallAccumulator {
  id: string;
  name: string;
  args: string;
}

/** Thought signature for reasoning continuity */
interface ThoughtSignature {
  signature: string;
  turnId: string;
}

/** Supported media types for multimodal input */
type MediaType = 'image' | 'video' | 'audio';

/** Media resolution configuration */
interface MediaResolutionConfig {
  type: MediaType;
  resolution: 'low' | 'medium' | 'high' | 'ultra_high';
  maxTokens?: number;
}

/** Multimodal content part */
interface MultimodalPart {
  type: 'text' | 'image' | 'video' | 'audio';
  data?: string; // Base64 encoded data
  mimeType?: string;
  text?: string;
  resolution?: 'low' | 'medium' | 'high' | 'ultra_high';
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
 * Converts multimodal content blocks to Google format.
 */
function convertMultimodalContent(
  content: string | ContentBlock[], 
  _mediaResolution?: 'low' | 'medium' | 'high' | 'ultra_high'
): Part[] {
  if (typeof content === 'string') {
    return [{ _text: content }];
  }

  const parts: Part[] = [];
  
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push({ text: block.text });
        break;
        
      case 'tool_use':
        // Tool use blocks are handled elsewhere
        break;
        
      case 'tool_result':
        // Tool result blocks are handled elsewhere
        break;
        
      default:
        // Handle potential multimodal content with type assertion
        const multimodalBlock = block as any;
        if (multimodalBlock.type === 'image' && multimodalBlock.source?.type === 'base64') {
          parts.push({
            inlineData: {
              mimeType: multimodalBlock.source.media_type || 'image/jpeg',
              data: multimodalBlock.source.data,
            },
          });
        } else if (multimodalBlock.type === 'image' && multimodalBlock.source?.type === 'url') {
          // For URL-based images, we'd need to fetch and convert to base64
          // For now, add as text description
          parts.push({ 
            text: `[Image: ${multimodalBlock.source.url}]` 
          });
        } else if (multimodalBlock.type === 'video' && multimodalBlock.source?.type === 'base64') {
          parts.push({
            inlineData: {
              mimeType: multimodalBlock.source.media_type || 'video/mp4',
              data: multimodalBlock.source.data,
            },
          });
        } else if (multimodalBlock.type === 'audio' && multimodalBlock.source?.type === 'base64') {
          parts.push({
            inlineData: {
              mimeType: multimodalBlock.source.media_type || 'audio/wav',
              data: multimodalBlock.source.data,
            },
          });
        } else {
          // Fallback for unknown content types
          parts.push({ text: `[Unsupported content type: ${multimodalBlock.type}]` });
        }
    }
  }
  
  return parts;
}

/**
 * Gets optimal media resolution based on content type and model capabilities.
 */
function getOptimalMediaResolution(
  _mediaType: MediaType,
  _model: string,
  userPreference?: 'low' | 'medium' | 'high' | 'ultra_high'
): 'low' | 'medium' | 'high' | 'ultra_high' {
  // Use user preference if provided
  if (userPreference) {
    return userPreference;
  }
  
  // Default recommendations based on media type and model
  if (model.includes('gemini-3') {
    // Gemini 3.0 models support ultra_high resolution
    switch (mediaType) {
      case 'image':
        return 'high'; // Good balance of quality and token usage
      case 'video':
        return 'medium'; // Videos consume more tokens
      case 'audio':
        return 'high'; // Audio is generally less token-intensive
      default:
        return 'medium';
    }
  } else {
    // Older models default to medium resolution
    return 'medium';
  }
}

/**
 * Estimates token allocation for different media resolutions.
 */
function estimateMediaTokens(
  _mediaType: MediaType,
  resolution: 'low' | 'medium' | 'high' | 'ultra_high',
  durationOrSize?: number
): number {
  const baseTokens = {
    image: { _low: 85, _medium: 258, _high: 516, _ultra_high: 1032 },
    video: { _low: 150, _medium: 300, _high: 600, _ultra_high: 1200 },
    audio: { _low: 100, _medium: 200, _high: 400, _ultra_high: 800 },
  };
  
  const base = baseTokens[mediaType][resolution];
  
  // Adjust based on duration (for video/audio) or size (for images)
  if (durationOrSize) {
    const multiplier = Math.max(1, Math.ceil(durationOrSize / 10)); // Rough estimation
    return base * multiplier;
  }
  
  return base;
}

/**
 * Converts internal messages to Google Gemini format.
 */
function convertMessages(
  messages: Message[], 
  mediaResolution?: 'low' | 'medium' | 'high' | 'ultra_high'
): Content[] {
  const geminiContents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      // Google handles system messages as the first user message
      const systemText = getMessageContent(message);
      geminiContents.push({
        role: 'user',
        parts: [{ text: `System: ${systemText}` }],
      });
    } else if (message.role === 'user') {
      const parts = convertMultimodalContent(message.content, mediaResolution);
      geminiContents.push({
        role: 'user',
        parts,
      });
    } else if (message.role === 'assistant') {
      const parts: Part[] = [];
      
      // Add text content if present
      const textContent = getMessageContent(message);
      if (textContent.length > 0) {
        parts.push({ _text: textContent });
      }
      
      // Add function calls if present
      if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          // Parse arguments if they're a JSON string
          let parsedArgs;
          try {
            parsedArgs = typeof toolCall.arguments === 'string' 
              ? JSON.parse(toolCall.arguments) 
              : toolCall.arguments;
          } catch {
            parsedArgs = toolCall.arguments;
          }
          
          parts.push({
            functionCall: {
              name: toolCall.name,
              _args: parsedArgs,
            },
          });
        }
      }
      
      geminiContents.push({
        role: 'model',
        parts,
      });
    } else if (message.role === 'tool') {
      // Tool result messages - Google expects function responses
      if (message.toolResults !== undefined) {
        for (const result of message.toolResults) {
          geminiContents.push({
            role: 'function',
            parts: [
              {
                functionResponse: {
                  name: result.toolCallId.split('_')[0] || result.toolCallId, // Extract function name from ID
                  response: { 
                    content: result.content,
                    success: !result.isError,
                  },
                },
              },
            ],
          });
        }
      }
    }
  }

  return geminiContents;
}

/**
 * Converts universal tool definitions to Google format.
 */
function convertTools(tools: UniversalToolDefinition[]): Tool[] {
  const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => {
    // Validate tool definition
    if (!tool.name || !tool.description) {
      throw new Error(`Invalid tool definition: name and description are required for tool: ${tool.name}`);
    }

    if (!tool.parameters || !tool.parameters.properties) {
      throw new Error(`Invalid tool definition: parameters.properties is required for tool: ${tool.name}`);
    }

    // Convert JSON Schema to Google's format
    const convertedProperties: Record<string, any> = {};
    for (const [propName, propSchema] of Object.entries(tool.parameters.properties)) {
      convertedProperties[propName] = convertJsonSchemaToGoogle(propSchema);
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        _properties: convertedProperties,
        required: tool.parameters.required ?? [],
      },
    };
  });

  return [{ functionDeclarations }];
}

/**
 * Converts JSON Schema property to Google's format.
 */
function convertJsonSchemaToGoogle(_schema: any): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const converted: any = {};

  // Map JSON Schema types to Google types
  if (schema.type) {
    switch (schema.type) {
      case 'string':
        converted.type = 'STRING';
        break;
      case 'number':
        converted.type = 'NUMBER';
        break;
      case 'integer':
        converted.type = 'INTEGER';
        break;
      case 'boolean':
        converted.type = 'BOOLEAN';
        break;
      case 'array':
        converted.type = 'ARRAY';
        if (schema.items) {
          converted.items = convertJsonSchemaToGoogle(schema.items);
        }
        break;
      case 'object':
        converted.type = 'OBJECT';
        if (schema.properties) {
          converted.properties = {};
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            converted.properties[propName] = convertJsonSchemaToGoogle(propSchema);
          }
        }
        if (schema.required) {
          converted.required = schema.required;
        }
        break;
      default:
        converted.type = 'STRING'; // Fallback
    }
  }

  // Copy other properties
  if (schema.description) {
    converted.description = schema.description;
  }
  if (schema.enum) {
    converted.enum = schema.enum;
  }
  if (schema.format) {
    converted.format = schema.format;
  }

  return converted;
}

/**
 * Creates built-in Google tools for enhanced capabilities.
 */
function createBuiltInTools(): Tool[] {
  const builtInTools: Tool[] = [];

  // Google Search tool
  builtInTools.push({
    googleSearchRetrieval: {
      dynamicRetrievalConfig: {
        mode: DynamicRetrievalMode.MODE_DYNAMIC,
        dynamicThreshold: 0.7,
      },
    },
  });

  // Code execution tool (if supported)
  builtInTools.push({
    codeExecution: {},
  });

  return builtInTools;
}

/**
 * Merges user-defined tools with built-in tools.
 */
function mergeWithBuiltInTools(userTools: Tool[], includeBuiltIn: boolean = false): Tool[] {
  if (!includeBuiltIn) {
    return userTools;
  }

  const builtInTools = createBuiltInTools();
  return [...userTools, ...builtInTools];
}

/**
 * Validates and parses function call arguments.
 */
function parseFunctionCallArguments(_args: any, _functionName: string): any {
  if (!args) {
    return {};
  }

  try {
    // Google returns args as an object, not a JSON string
    return typeof args === 'string' ? JSON.parse(args) : args;
  } catch (error) {
    logger.warn(`[Google] Failed to parse function call arguments for ${functionName}:`, error);
    return { _raw_input: args };
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Maps Google API errors to StreamChunk error format.
 */
function handleApiError(_error: unknown): StreamChunk {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as any).status;
    const message = (error as any).message || 'Unknown Google API error';
    const code = ERROR_CODE_MAP[status] ?? 'API_ERROR';
    
    return {
      type: 'error',
      error: { code, message },
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
 * Counts tokens using Google's countTokens API (when available).
 */
async function countTokensWithAPI(
  _model: GenerativeModel, 
  messages: Message[], 
  mediaResolution?: 'low' | 'medium' | 'high' | 'ultra_high'
): Promise<number> {
  try {
    // Convert messages to Google format for token counting
    const contents = convertMessages(messages, mediaResolution);
    
    // Use Google's countTokens API
    const result = await model.countTokens({ contents });
    
    if (result.totalTokens !== undefined) {
      logger.debug('[Google] Token count from API:', result.totalTokens);
      return result.totalTokens;
    }
    
    // Fallback to estimation if API doesn't return token count
    logger.warn('[Google] countTokens API did not return totalTokens, falling back to estimation');
    return estimateTokens(messages);
  } catch (error) {
    logger.warn('[Google] countTokens API failed, falling back to estimation:', error);
    return estimateTokens(messages);
  }
}

/**
 * Enhanced token counting cache with TTL and size limits.
 */
class TokenCountCache {
  private cache = new Map<string, { count: number; _timestamp: number }>();
  private readonly maxSize = 1000;
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  get(_key: string): number | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    
    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.count;
  }

  set(_key: string, _count: number): void {
    // Clean up expired entries if cache is getting large
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    
    this.cache.set(key, {
      count,
      timestamp: Date.now(),
    });
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        expiredKeys.push(key);
      }
    }
    
    // Remove expired entries
    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
    
    // If still too large, remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, Math.floor(this.maxSize * 0.2)); // Remove 20%
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Creates a cache key for messages.
 */
function createCacheKey(messages: Message[]): string {
  return JSON.stringify(messages.map(m => ({ role: m.role, content: getMessageContent(m) })));
}

/**
 * Estimates tokens for Google models (fallback method).
 * Google uses a different tokenization approach.
 * Based on Google's documentation: roughly 4 characters per token.
 */
function estimateTokens(messages: Message[]): number {
  let charCount = 0;
  for (const message of messages) {
    const content = getMessageContent(message);
    charCount += content.length;
    charCount += message.role.length;
    
    // Add overhead for message structure
    charCount += 15; // Estimated overhead per message
    
    // Add overhead for tool calls if present
    if (message.toolCalls !== undefined) {
      for (const toolCall of message.toolCalls) {
        charCount += toolCall.name.length;
        charCount += JSON.stringify(toolCall.arguments).length;
        charCount += 25; // Tool call overhead
      }
    }
    
    // Add overhead for tool results if present
    if (message.toolResults !== undefined) {
      for (const result of message.toolResults) {
        charCount += result.content.length;
        charCount += result.toolCallId.length;
        charCount += 20; // Tool result overhead
      }
    }
  }
  
  // Google's tokenization is roughly 4 chars per token
  return Math.ceil(charCount / 4);
}

// =============================================================================
// GOOGLE ADAPTER
// =============================================================================

/**
 * Google Gemini model adapter implementing the UMAL interface.
 *
 * @example
 * ```typescript
 * const adapter = new GoogleAdapter({
 *   provider: 'google',
 *   model: 'gemini-3-pro-preview',
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   gemini: {
 *     thinkingLevel: 'high',
 *     _thoughtSignatures: true,
 *   },
 * }, authManager);
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   console.warn(chunk);
 * }
 * ```
 */
export class GoogleAdapter implements IModelAdapter {
  readonly provider = 'google';
  readonly model: string;
  readonly contextLimit: number;
  readonly supportsToolCalling: boolean;

  private readonly client: GoogleGenerativeAI;
  private readonly generativeModel: GenerativeModel;
  private readonly config: GoogleModelConfig;
  private readonly tokenCountCache = new TokenCountCache();
  private readonly authManager: AuthenticationManager | undefined;
  private thoughtSignature?: ThoughtSignature;

  /**
   * Creates a new Google adapter.
   */
  constructor(_config: GoogleModelConfig, authManager?: AuthenticationManager) {
    this.config = config;
    this.model = config.model;
    this.contextLimit = config.contextLimit ?? MODEL_CONTEXT_LIMITS[config.model] ?? 1000000;
    this.supportsToolCalling = FUNCTION_CALLING_MODELS.has(config.model);
    this.authManager = authManager;

    // Get API key from config or environment, but don't require it if auth manager is provided
    const apiKey = config.apiKey ?? process.env['GOOGLE_API_KEY'];
    if (!apiKey && !authManager) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'google',
        'API key is required when no authentication manager is provided. Set GOOGLE_API_KEY environment variable or provide in config.'
      );
    }

    this.client = new GoogleGenerativeAI(apiKey || 'placeholder'); // Use placeholder if auth manager will provide credentials
    
    // Configure generation settings
    const generationConfig: GenerationConfig = {
      temperature: 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 8192,
    };

    // Add Gemini 3.0 specific configuration
    if (this.config.gemini?.thinkingLevel && THINKING_MODELS.has(config.model)) {
      (generationConfig as any).thinkingLevel = this.config.gemini.thinkingLevel;
    }

    if (this.config.gemini?.mediaResolution) {
      (generationConfig as any).mediaResolution = this.config.gemini.mediaResolution;
    }

    // Configure safety settings (permissive for coding assistant)
    const safetySettings: SafetySetting[] = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ];

    this.generativeModel = this.client.getGenerativeModel({
      model: config.model,
      generationConfig,
      safetySettings,
    });
  }

  /**
   * Validates the adapter configuration.
   */
  validateConfig(): void {
    if (!this.config.model ?? this.config.model === '') {
      throw new AdapterError('INVALID_CONFIG', 'google', 'Model name is required');
    }

    // Validate Gemini 3.0 specific configuration
    if (this.config.gemini?.thinkingLevel && !THINKING_MODELS.has(this.config.model) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'google',
        `Thinking levels are not supported for model: ${this.config.model}`
      );
    }

    if (this.config.gemini?.imageGeneration && !IMAGE_GENERATION_MODELS.has(this.config.model) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'google',
        `Image generation is not supported for model: ${this.config.model}`
      );
    }
  }

  /**
   * Gets authentication credentials using OAuth or API key fallback.
   */
  private async getAuthCredentials(): Promise<string> {
    if (this.authManager) {
      try {
        const authResult = await this.authManager.ensureValidAuthentication('google');
        if (authResult.success && authResult.credential) {
          logger.debug(`[Google] Using ${authResult.method} authentication${authResult.usedFallback ? ' (fallback)' : ''}`);
          return authResult.credential;
        } else {
          throw new AdapterError(
            'AUTH_FAILED',
            'google',
            authResult.error || 'Authentication failed'
          );
        }
      } catch (error) {
        logger.error('[Google] Authentication failed:', error);
        throw new AdapterError(
          'AUTH_FAILED',
          'google',
          error instanceof Error ? error.message : 'Authentication failed'
        );
      }
    }

    // Fallback to config/environment API key
    const apiKey = this.config.apiKey ?? process.env['GOOGLE_API_KEY'];
    if (!apiKey) {
      throw new AdapterError(
        'AUTH_FAILED',
        'google',
        'No authentication available. Configure OAuth or provide API key.'
      );
    }

    return apiKey;
  }

  /**
   * Gets an authenticated generative model instance.
   */
  private async getAuthenticatedModel(): Promise<GenerativeModel> {
    const apiKey = await this.getAuthCredentials();
    
    // Create a new client with current credentials
    const authenticatedClient = new GoogleGenerativeAI(apiKey);
    
    // Configure generation settings
    const generationConfig: GenerationConfig = {
      temperature: 0.7,
      maxOutputTokens: this.config.maxOutputTokens ?? 8192,
    };

    // Add Gemini 3.0 specific configuration
    if (this.config.gemini?.thinkingLevel && THINKING_MODELS.has(this.config.model) {
      (generationConfig as any).thinkingLevel = this.config.gemini.thinkingLevel;
    }

    if (this.config.gemini?.mediaResolution) {
      (generationConfig as any).mediaResolution = this.config.gemini.mediaResolution;
    }

    // Configure safety settings (permissive for coding assistant)
    const safetySettings: SafetySetting[] = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ];

    return authenticatedClient.getGenerativeModel({
      model: this.config.model,
      generationConfig,
      safetySettings,
    });
  }

  /**
   * Generates a streaming response from Google Gemini.
   */
  async *generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const mediaResolution = this.config.gemini?.mediaResolution || 'medium';
    const geminiContents = convertMessages(messages, mediaResolution);
    const geminiTools = this.shouldIncludeTools(tools) ? convertTools(tools) : undefined;

    try {
      // Get authenticated model instance
      const authenticatedModel = await this.getAuthenticatedModel();
      
      const request = this.createRequest(geminiContents, geminiTools, options);
      const stream = await authenticatedModel.generateContentStream(request);
      yield* this.processStream(stream);
    } catch (error) {
      yield handleApiError(error);
    }
  }

  /**
   * Generates a structured response with JSON schema validation.
   */
  async generateStructured(
    messages: Message[],
    _schema: any,
    options?: GenerateOptions
  ): Promise<any> {
    const mediaResolution = this.config.gemini?.mediaResolution || 'medium';
    const geminiContents = convertMessages(messages, mediaResolution);
    
    try {
      // Add structured output instructions to the last user message
      const lastContent = geminiContents[geminiContents.length - 1];
      if (lastContent && lastContent.role === 'user') {
        const schemaInstruction = `\n\nPlease respond with valid JSON that matches this schema:\n${JSON.stringify(schema, null, 2)}`;
        if (lastContent.parts && lastContent.parts[0] && lastContent.parts[0].text) {
          lastContent.parts[0].text += schemaInstruction;
        }
      }

      const request = this.createRequest(geminiContents, undefined, options);
      const response = await this.generativeModel.generateContent(request);
      
      if (response.response.candidates && response.response.candidates[0]) {
        const candidate = response.response.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
          const text = candidate.content.parts[0].text;
          if (text) {
            try {
              return JSON.parse(text);
            } catch (error) {
              throw new AdapterError(
                'INVALID_REQUEST',
                'google',
                `Failed to parse structured response as JSON: ${error}`
              );
            }
          }
        }
      }
      
      throw new AdapterError(
        'API_ERROR',
        'google',
        'No valid response received for structured generation'
      );
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        'API_ERROR',
        'google',
        `Structured generation failed: ${error}`
      );
    }
  }

  /**
   * Counts tokens for messages using Google's API with fallback to estimation.
   * Includes multimodal content token estimation and enhanced caching.
   */
  countTokens(messages: Message[]): number {
    const cacheKey = this.createTokenCountCacheKey(messages);
    
    // Check cache first
    const cachedCount = this.tokenCountCache.get(cacheKey);
    if (cachedCount !== undefined) {
      return cachedCount;
    }
    
    // For synchronous interface, use estimation
    // The async version countTokensAsync should be used when possible
    const estimate = this.estimateMultimodalTokens(messages);
    const tokenCount = estimate.totalTokens;
    
    // Cache the result
    this.tokenCountCache.set(cacheKey, tokenCount);
    
    return tokenCount;
  }

  /**
   * Asynchronous token counting using Google's countTokens API.
   * This is the preferred method when async operations are possible.
   */
  async countTokensAsync(messages: Message[]): Promise<number> {
    const cacheKey = this.createTokenCountCacheKey(messages);
    
    // Check cache first
    const cachedCount = this.tokenCountCache.get(cacheKey);
    if (cachedCount !== undefined) {
      return cachedCount;
    }
    
    try {
      // Try Google's API first
      const apiCount = await countTokensWithAPI(
        this.generativeModel, 
        messages, 
        this.config.gemini?.mediaResolution
      );
      
      // Cache the result
      this.tokenCountCache.set(cacheKey, apiCount);
      
      return apiCount;
    } catch (error) {
      logger.warn('[Google] Async token counting failed, falling back to estimation:', error);
      
      // Fallback to estimation
      const estimate = this.estimateMultimodalTokens(messages);
      const tokenCount = estimate.totalTokens;
      
      // Cache the result
      this.tokenCountCache.set(cacheKey, tokenCount);
      
      return tokenCount;
    }
  }

  /**
   * Creates a cache key for token counting that includes model and resolution.
   */
  private createTokenCountCacheKey(messages: Message[]): string {
    const messageKey = createCacheKey(messages);
    const modelKey = this.model;
    const resolutionKey = this.config.gemini?.mediaResolution || 'medium';
    
    return `${modelKey}:${resolutionKey}:${messageKey}`;
  }

  /**
   * Optimizes token usage by adjusting message content and resolution.
   */
  async optimizeTokenUsage(
    messages: Message[],
    _maxTokens: number,
    options?: {
      preserveLatestMessages?: number;
      allowResolutionReduction?: boolean;
      allowContentTruncation?: boolean;
    }
  ): Promise<{
    optimizedMessages: Message[];
    tokenCount: number;
    optimizations: string[];
  }> {
    const optimizations: string[] = [];
    let currentMessages = [...messages];
    let currentTokens = await this.countTokensAsync(currentMessages);
    
    if (currentTokens <= maxTokens) {
      return {
        _optimizedMessages: currentMessages,
        _tokenCount: currentTokens,
        optimizations: [],
      };
    }
    
    // Step 1: Reduce media resolution if allowed
    if (options?.allowResolutionReduction && this.config.gemini?.mediaResolution !== 'low') {
      const resolutions: Array<'low' | 'medium' | 'high' | 'ultra_high'> = ['low', 'medium', 'high', 'ultra_high'];
      const currentResIndex = resolutions.indexOf(this.config.gemini?.mediaResolution || 'medium');
      
      for (let i = currentResIndex - 1; i >= 0; i--) {
        const testResolution = resolutions[i];
        if (!testResolution) {
    continue;
  }
        
        const originalResolution = this.config.gemini?.mediaResolution;
        
        // Temporarily change resolution for testing
        this.setMediaResolution(testResolution);
        const testTokens = await this.countTokensAsync(currentMessages);
        
        if (testTokens <= maxTokens) {
          optimizations.push(`Reduced media resolution from ${originalResolution || 'medium'} to ${testResolution}`);
          currentTokens = testTokens;
          break;
        }
        
        // Restore original resolution if this didn't work
        if (originalResolution) {
          this.setMediaResolution(originalResolution);
        }
      }
    }
    
    // Step 2: Remove older messages if still over limit
    if (currentTokens > maxTokens) {
      const preserveCount = options?.preserveLatestMessages || 2;
      const messagesToKeep = Math.max(preserveCount, 1);
      
      while (currentMessages.length > messagesToKeep && currentTokens > maxTokens) {
        // Remove the oldest non-system message
        let removedIndex = -1;
        for (let i = 0; i < currentMessages.length; i++) {
          const message = currentMessages[i];
          if (message && message.role !== 'system') {
            currentMessages.splice(i, 1);
            removedIndex = i;
            break;
          }
        }
        
        if (removedIndex === -1) {
    break;
  } // No more messages to remove
        
        currentTokens = await this.countTokensAsync(currentMessages);
        optimizations.push(`Removed message at index ${removedIndex}`);
      }
    }
    
    // Step 3: Truncate content if allowed and still over limit
    if (options?.allowContentTruncation && currentTokens > maxTokens) {
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        const message = currentMessages[i];
        if (!message || message.role === 'system') {
    continue;
  } // Don't truncate system messages
        
        const content = getMessageContent(message);
        if (content.length > 500) { // Only truncate long messages
          const truncatedContent = content.substring(0, Math.floor(content.length * 0.7)) + '... [truncated]';
          
          if (typeof message.content === 'string') {
            message.content = truncatedContent;
          } else if (Array.isArray(message.content) {
            // Find and truncate text blocks
            for (const block of message.content) {
              if (block.type === 'text') {
                block.text = truncatedContent;
                break;
              }
            }
          }
          
          currentTokens = await this.countTokensAsync(currentMessages);
          optimizations.push(`Truncated content in message ${i}`);
          
          if (currentTokens <= maxTokens) {
    break;
  }
        }
      }
    }
    
    return {
      _optimizedMessages: currentMessages,
      _tokenCount: currentTokens,
      optimizations,
    };
  }

  /**
   * Gets token counting statistics and cache performance.
   */
  getTokenCountingStats(): {
    cacheSize: number;
    cacheHitRate?: number;
    estimationFallbacks: number;
  } {
    return {
      cacheSize: this.tokenCountCache.size(),
      // Note: Hit rate tracking would require additional instrumentation
      _estimationFallbacks: 0, // Would need to track this
    };
  }

  /**
   * Clears the token counting cache.
   */
  clearTokenCountCache(): void {
    this.tokenCountCache.clear();
    logger.debug('[Google] Token count cache cleared');
  }

  /**
   * Sets the media resolution for multimodal content processing.
   */
  setMediaResolution(resolution: 'low' | 'medium' | 'high' | 'ultra_high'): void {
    if (!this.config.gemini) {
      this.config.gemini = {};
    }
    this.config.gemini.mediaResolution = resolution;
    
    logger.debug(`[Google] Media resolution set to: ${resolution}`);
  }

  /**
   * Gets the current media resolution setting.
   */
  getMediaResolution(): 'low' | 'medium' | 'high' | 'ultra_high' | undefined {
    return this.config.gemini?.mediaResolution;
  }

  /**
   * Gets optimal media resolution recommendation for a specific media type.
   */
  getOptimalMediaResolution(_mediaType: MediaType): 'low' | 'medium' | 'high' | 'ultra_high' {
    return getOptimalMediaResolution(mediaType, this.model, this.config.gemini?.mediaResolution);
  }

  /**
   * Estimates token usage for multimodal content.
   */
  estimateMultimodalTokens(
    messages: Message[],
    mediaResolutionOverride?: 'low' | 'medium' | 'high' | 'ultra_high'
  ): { textTokens: number; mediaTokens: number; _totalTokens: number } {
    let textTokens = 0;
    let mediaTokens = 0;
    
    const resolution = mediaResolutionOverride || this.config.gemini?.mediaResolution || 'medium';
    
    for (const message of messages) {
      // Count text tokens
      const textContent = getMessageContent(message);
      textTokens += Math.ceil(textContent.length / 4); // Rough estimation
      
      // Count media tokens
      if (typeof message.content !== 'string') {
        for (const block of message.content) {
          const blockType = (block as any).type;
          if (blockType === 'image') {
            mediaTokens += estimateMediaTokens('image', resolution);
          } else if (blockType === 'video') {
            mediaTokens += estimateMediaTokens('video', resolution);
          } else if (blockType === 'audio') {
            mediaTokens += estimateMediaTokens('audio', resolution);
          }
        }
      }
    }
    
    return {
      textTokens,
      mediaTokens,
      totalTokens: textTokens + mediaTokens,
    };
  }

  /**
   * Processes multimodal content with automatic resolution optimization.
   */
  async processMultimodalContent(
    messages: Message[],
    options?: {
      maxTokens?: number;
      preferredResolution?: 'low' | 'medium' | 'high' | 'ultra_high';
      autoOptimize?: boolean;
    }
  ): Promise<{ 
    processedMessages: Message[]; 
    tokenEstimate: number; 
    resolution: 'low' | 'medium' | 'high' | 'ultra_high' 
  }> {
    const preferredResolution = options?.preferredResolution || this.config.gemini?.mediaResolution || 'medium';
    let currentResolution = preferredResolution;
    
    // Auto-optimize resolution if requested and token limit is specified
    if (options?.autoOptimize && options?.maxTokens) {
      const estimate = this.estimateMultimodalTokens(messages, currentResolution);
      
      if (estimate.totalTokens > options.maxTokens) {
        // Try lower resolutions
        const resolutions: Array<'low' | 'medium' | 'high' | 'ultra_high'> = ['low', 'medium', 'high', 'ultra_high'];
        const currentIndex = resolutions.indexOf(currentResolution);
        
        for (let i = currentIndex - 1; i >= 0; i--) {
          const testResolution = resolutions[i];
          if (!testResolution) {
    continue;
  }
          
          const testEstimate = this.estimateMultimodalTokens(messages, testResolution);
          
          if (testEstimate.totalTokens <= options.maxTokens) {
            currentResolution = testResolution;
            logger.debug(`[Google] Auto-optimized media resolution to ${currentResolution} to fit token limit`);
            break;
          }
        }
      }
    }
    
    // Process messages with the determined resolution
    const processedMessages = messages.map(message => ({
      ...message,
      // Add resolution metadata for internal tracking
      _mediaResolution: currentResolution,
    }));
    
    const finalEstimate = this.estimateMultimodalTokens(processedMessages, currentResolution);
    
    return {
      processedMessages,
      tokenEstimate: finalEstimate.totalTokens,
      _resolution: currentResolution,
    };
  }

  /**
   * Sets the thinking level for reasoning control.
   */
  setThinkingLevel(level: 'low' | 'medium' | 'high'): void {
    if (!THINKING_MODELS.has(this.model) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'google',
        `Thinking levels are not supported for model: ${this.model}`
      );
    }
    
    if (!this.config.gemini) {
      this.config.gemini = {};
    }
    this.config.gemini.thinkingLevel = level;
    
    logger.debug(`[Google] Thinking level set to: ${level}`);
  }

  /**
   * Gets the current thinking level.
   */
  getThinkingLevel(): 'low' | 'medium' | 'high' | undefined {
    return this.config.gemini?.thinkingLevel;
  }

  /**
   * Enables or disables thought signatures for reasoning continuity.
   */
  setThoughtSignatures(_enabled: boolean): void {
    if (!THINKING_MODELS.has(this.model) {
      logger.warn(`[Google] Thought signatures may not be fully supported for model: ${this.model}`);
    }
    
    if (!this.config.gemini) {
      this.config.gemini = {};
    }
    this.config.gemini.thoughtSignatures = enabled;
    
    logger.debug(`[Google] Thought signatures ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Gets the current thought signature for reasoning continuity.
   */
  getThoughtSignature(): ThoughtSignature | undefined {
    return this.thoughtSignature;
  }

  /**
   * Sets a thought signature from a previous conversation turn.
   * Useful for migrating conversations from other models or sessions.
   */
  setThoughtSignature(_signature: ThoughtSignature): void {
    if (!this.config.gemini?.thoughtSignatures) {
      logger.warn('[Google] Thought signatures are not enabled. Enable them first with setThoughtSignatures(true)');
      return;
    }
    
    this.thoughtSignature = signature;
    logger.debug(`[Google] Thought signature set for turn: ${signature.turnId}`);
  }

  /**
   * Clears the current thought signature.
   */
  clearThoughtSignature(): void {
    delete (this as any).thoughtSignature;
    logger.debug('[Google] Thought signature cleared');
  }

  /**
   * Migrates conversation context from another model to preserve reasoning continuity.
   */
  migrateConversationContext(context: {
    previousModel?: string;
    conversationSummary?: string;
    reasoningContext?: string;
    thoughtSignature?: ThoughtSignature;
  }): void {
    logger.debug('[Google] Migrating conversation context:', {
      fromModel: context.previousModel,
      hasSummary: !!context.conversationSummary,
      hasReasoningContext: !!context.reasoningContext,
      hasThoughtSignature: !!context.thoughtSignature
    });

    // Set thought signature if provided and supported
    if (context.thoughtSignature && this.config.gemini?.thoughtSignatures) {
      this.setThoughtSignature(context.thoughtSignature);
    }

    // Store migration context for use in next request
    (this as any).migrationContext = {
      previousModel: context.previousModel,
      conversationSummary: context.conversationSummary,
      reasoningContext: context.reasoningContext,
      migratedAt: new Date().toISOString(),
    };
  }

  /**
   * Handles parallel function calling with signature preservation.
   */
  async handleParallelFunctionCalls(
    messages: Message[],
    functionCalls: Array<{ name: string; _arguments: any }>,
    options?: GenerateOptions
  ): Promise<{ results: any[]; thoughtSignature?: ThoughtSignature }> {
    // Store current thought signature
    const currentSignature = this.thoughtSignature;
    
    try {
      // Execute function calls in parallel while preserving reasoning context
      const results = await Promise.all(
        functionCalls.map(async (call, index) => {
          // Create a temporary signature for this parallel call
          const parallelSignature: ThoughtSignature = {
            signature: currentSignature?.signature ?? '',
            turnId: `${currentSignature?.turnId || 'parallel'}_${index}`,
          };
          
          // Temporarily set the parallel signature
          this.thoughtSignature = parallelSignature;
          
          // Create messages with function call
          const callMessages: Message[] = [
            ...messages,
            {
              id: createMessageId(),
              role: 'assistant',
              content: `Executing function: ${call.name}`,
              timestamp: Date.now(),
              toolCalls: [{
                id: createToolCallId(`call_${index}`),
                name: call.name,
                arguments: call.arguments,
              }],
            },
          ];
          
          // Generate response for this function call
          const chunks: StreamChunk[] = [];
          for await (const chunk of this.generateStream(callMessages, undefined, options)) {
            chunks.push(chunk);
          }
          
          return {
            _callIndex: index,
            functionName: call.name,
            chunks,
            thoughtSignature: this.thoughtSignature,
          };
        })
      );
      
      // Merge thought signatures from parallel calls
      const finalSignature = this.mergeThoughtSignatures(
        results.map(r => r.thoughtSignature).filter(Boolean) as ThoughtSignature[]
      );
      
      const returnValue: { results: any[]; thoughtSignature?: ThoughtSignature } = {
        results,
      };
      
      if (finalSignature !== undefined) {
        returnValue.thoughtSignature = finalSignature;
      }
      
      return returnValue;
    } finally {
      // Restore original signature
      if (currentSignature !== undefined) {
        this.thoughtSignature = currentSignature;
      } else {
        delete (this as any).thoughtSignature;
      }
    }
  }

  /**
   * Generates images using Gemini 3.0 Pro Image model.
   */
  async generateImage(
    _prompt: string,
    options?: {
      aspectRatio?: string;
      imageSize?: '1K' | '2K' | '4K';
      style?: string;
      includeSearchGrounding?: boolean;
      conversationalContext?: Message[];
    }
  ): Promise<{
    imageData: string; // Base64 encoded image
    mimeType: string;
    metadata?: {
      aspectRatio: string;
      imageSize: string;
      generatedAt: string;
    };
  }> {
    if (!IMAGE_GENERATION_MODELS.has(this.model) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'google',
        `Image generation is not supported for model: ${this.model}. Use gemini-3-pro-image-preview.`
      );
    }

    try {
      // Prepare the image generation prompt
      let fullPrompt = prompt;
      
      // Add style instructions if specified
      if (options?.style) {
        fullPrompt += `\n\nStyle: ${options.style}`;
      }
      
      // Add conversational context if provided
      if (options?.conversationalContext && options.conversationalContext.length > 0) {
        const contextSummary = options.conversationalContext
          .slice(-3) // Use last 3 messages for context
          .map(msg => `${msg.role}: ${getMessageContent(msg)}`)
          .join('\n');
        fullPrompt = `Context from conversation:\n${contextSummary}\n\nImage generation request: ${fullPrompt}`;
      }

      // Create generation config with image-specific settings
      const generationConfig: GenerationConfig = {
        temperature: 0.7,
        _maxOutputTokens: 1024, // Images don't need many output tokens
      };

      // Add image generation specific config
      if (options?.aspectRatio) {
        (generationConfig as any).aspectRatio = options.aspectRatio;
      }
      
      if (options?.imageSize) {
        (generationConfig as any).imageSize = options.imageSize;
      }

      // Create the request
      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ _text: fullPrompt }],
        },
      ];

      // Add search grounding if requested
      const tools = options?.includeSearchGrounding ? createBuiltInTools().filter(tool => 'googleSearchRetrieval' in tool) : undefined;

      const request: GenerateContentRequest = {
        contents,
        generationConfig,
        ...(tools ? { tools } : {}),
      };

      logger.debug('[Google] Generating image with prompt:', { 
        promptLength: fullPrompt.length,
        hasStyle: !!options?.style,
        hasContext: !!options?.conversationalContext,
        aspectRatio: options?.aspectRatio,
        imageSize: options?.imageSize
      });

      const response = await this.generativeModel.generateContent(request);
      
      if (response.response.candidates && response.response.candidates[0]) {
        const candidate = response.response.candidates[0];
        
        // Look for image data in the response
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            // Check for inline image data
            if (part.inlineData && part.inlineData.data) {
              return {
                imageData: part.inlineData.data,
                mimeType: part.inlineData.mimeType || 'image/png',
                metadata: {
                  aspectRatio: options?.aspectRatio || 'square',
                  imageSize: options?.imageSize || '2K',
                  generatedAt: new Date().toISOString(),
                },
              };
            }
            
            // Check for text response that might contain image references
            if (part.text && part.text.includes('image') {
              logger.warn('[Google] Image generation returned text response instead of image data:', part.text);
            }
          }
        }
      }
      
      throw new AdapterError(
        'API_ERROR',
        'google',
        'No image data received from image generation request'
      );
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      
      logger.error('[Google] Image generation failed:', error);
      throw new AdapterError(
        'API_ERROR',
        'google',
        `Image generation failed: ${error}`
      );
    }
  }

  /**
   * Edits an existing image using conversational instructions.
   */
  async editImage(
    _imageData: string,
    _mimeType: string,
    _editInstructions: string,
    options?: {
      preserveAspectRatio?: boolean;
      style?: string;
      conversationalContext?: Message[];
    }
  ): Promise<{
    imageData: string;
    mimeType: string;
    metadata?: {
      editedAt: string;
      originalPreserved: boolean;
    };
  }> {
    if (!IMAGE_GENERATION_MODELS.has(this.model) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'google',
        `Image editing is not supported for model: ${this.model}. Use gemini-3-pro-image-preview.`
      );
    }

    try {
      // Prepare the edit prompt
      let fullPrompt = `Please edit this image according to the following instructions: ${editInstructions}`;
      
      if (options?.style) {
        fullPrompt += `\n\nMaintain this style: ${options.style}`;
      }
      
      if (options?.preserveAspectRatio) {
        fullPrompt += '\n\nPlease preserve the original aspect ratio.';
      }
      
      // Add conversational context if provided
      if (options?.conversationalContext && options.conversationalContext.length > 0) {
        const contextSummary = options.conversationalContext
          .slice(-2) // Use last 2 messages for context
          .map(msg => `${msg.role}: ${getMessageContent(msg)}`)
          .join('\n');
        fullPrompt = `Context: ${contextSummary}\n\n${fullPrompt}`;
      }

      // Create the request with the original image and edit instructions
      const contents: Content[] = [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                _data: imageData,
              },
            },
            {
              _text: fullPrompt,
            },
          ],
        },
      ];

      const request: GenerateContentRequest = {
        contents,
        generationConfig: {
          temperature: 0.7,
          _maxOutputTokens: 1024,
        },
      };

      logger.debug('[Google] Editing image with instructions:', { 
        instructionsLength: editInstructions.length,
        hasStyle: !!options?.style,
        preserveAspectRatio: options?.preserveAspectRatio
      });

      const response = await this.generativeModel.generateContent(request);
      
      if (response.response.candidates && response.response.candidates[0]) {
        const candidate = response.response.candidates[0];
        
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              return {
                imageData: part.inlineData.data,
                mimeType: part.inlineData.mimeType || mimeType,
                metadata: {
                  editedAt: new Date().toISOString(),
                  originalPreserved: options?.preserveAspectRatio ?? false,
                },
              };
            }
          }
        }
      }
      
      throw new AdapterError(
        'API_ERROR',
        'google',
        'No edited image data received from image editing request'
      );
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      
      logger.error('[Google] Image editing failed:', error);
      throw new AdapterError(
        'API_ERROR',
        'google',
        `Image editing failed: ${error}`
      );
    }
  }

  /**
   * Generates images with Google Search grounding for enhanced context.
   */
  async generateImageWithGrounding(
    _prompt: string,
    searchQuery?: string,
    options?: {
      aspectRatio?: string;
      imageSize?: '1K' | '2K' | '4K';
      style?: string;
    }
  ): Promise<{
    imageData: string;
    mimeType: string;
    searchContext?: string;
    metadata?: {
      aspectRatio: string;
      imageSize: string;
      searchGrounded: boolean;
      generatedAt: string;
    };
  }> {
    if (!IMAGE_GENERATION_MODELS.has(this.model) {
      throw new AdapterError(
        'INVALID_CONFIG',
        'google',
        `Image generation with grounding is not supported for model: ${this.model}`
      );
    }

    try {
      // Prepare the grounded prompt
      let fullPrompt = prompt;
      if (searchQuery) {
        fullPrompt = `Based on current information about "${searchQuery}": ${prompt}`;
      }

      // Use the regular image generation with search grounding enabled
      const result = await this.generateImage(fullPrompt, {
        ...options,
        _includeSearchGrounding: true,
      });

      const returnValue: {
        imageData: string;
        mimeType: string;
        searchContext?: string;
        metadata?: {
          aspectRatio: string;
          imageSize: string;
          searchGrounded: boolean;
          generatedAt: string;
        };
      } = {
        ...result,
        metadata: {
          ...result.metadata!,
          _searchGrounded: true,
        },
      };
      
      if (searchQuery !== undefined) {
        returnValue.searchContext = searchQuery;
      }
      
      return returnValue;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      
      throw new AdapterError(
        'API_ERROR',
        'google',
        `Grounded image generation failed: ${error}`
      );
    }
  }

  /**
   * Merges multiple thought signatures from parallel reasoning paths.
   */
  private mergeThoughtSignatures(signatures: ThoughtSignature[]): ThoughtSignature | undefined {
    if (signatures.length === 0) {
      return undefined;
    }
    
    if (signatures.length === 1) {
      return signatures[0];
    }
    
    // Combine signatures - this is a simplified approach
    // In practice, Google's API would handle this internally
    const mergedSignature = signatures
      .map(s => s.signature)
      .filter(Boolean)
      .join('|');
    
    return {
      _signature: mergedSignature,
      turnId: `merged_${Date.now()}`,
    };
  }

  /**
   * Determines if tools should be included in the request.
   */
  private shouldIncludeTools(tools?: UniversalToolDefinition[]): tools is UniversalToolDefinition[] {
    return tools !== undefined && tools.length > 0 && this.supportsToolCalling;
  }

  /**
   * Creates the Google Gemini request.
   */
  private createRequest(
    contents: Content[],
    tools: Tool[] | undefined,
    options?: GenerateOptions
  ): GenerateContentRequest {
    logger.debug('[Google] Creating request with:', {
      contentCount: contents.length,
      hasTools: !!tools,
      toolsCount: tools?.[0] && 'functionDeclarations' in tools[0] ? tools[0].functionDeclarations?.length ?? 0 : 0,
      model: this.model
    });

    // Merge with built-in tools if enabled
    const finalTools = tools ? mergeWithBuiltInTools(tools, options?.includeBuiltInTools ?? false) : undefined;

    // Add migration context if available
    const migrationContext = (this as any).migrationContext;
    if (migrationContext && contents.length > 0) {
      const migrationPrompt = this.createMigrationPrompt(migrationContext);
      const firstContent = contents[0];
      if (migrationPrompt && firstContent && firstContent.role === 'user') {
        // Prepend migration context to the first user message
        const firstPart = firstContent.parts[0];
        if (firstPart && firstPart.text) {
          firstPart.text = migrationPrompt + '\n\n' + firstPart.text;
        }
      }
      
      // Clear migration context after use
      delete (this as any).migrationContext;
    }

    const request: GenerateContentRequest = {
      contents,
      ...(finalTools !== undefined ? { _tools: finalTools } : {}),
    };

    // Add generation config overrides from options
    if (options) {
      const generationConfig: GenerationConfig = {};
      
      if (options.temperature !== undefined) {
        generationConfig.temperature = options.temperature;
      }
      
      if (options.maxTokens !== undefined) {
        generationConfig.maxOutputTokens = options.maxTokens;
      }
      
      if (options.topP !== undefined) {
        generationConfig.topP = options.topP;
      }
      
      if (options.stopSequences !== undefined) {
        generationConfig.stopSequences = options.stopSequences;
      }

      // Add Gemini 3.0 specific overrides
      if (this.config.gemini?.thinkingLevel && THINKING_MODELS.has(this.config.model)) {
        (generationConfig as any).thinkingLevel = this.config.gemini.thinkingLevel;
      }

      // Add structured output configuration
      if (options.responseFormat?.type === 'json_object') {
        (generationConfig as any).responseMimeType = 'application/json';
        if (options.responseFormat.schema) {
          (generationConfig as any).responseSchema = convertJsonSchemaToGoogle(options.responseFormat.schema);
        }
      }

      if (Object.keys(generationConfig){
    .length > 0) {
  }
        request.generationConfig = generationConfig;
      }
    }

    // Add thought signature for reasoning continuity
    if (this.config.gemini?.thoughtSignatures && this.thoughtSignature) {
      (request as any).thoughtSignature = this.thoughtSignature;
    }

    logger.debug('[Google] Request created:', {
      hasContents: request.contents.length > 0,
      hasTools: !!request.tools,
      toolCount: request.tools?.length ?? 0,
      hasGenerationConfig: !!request.generationConfig,
      hasThoughtSignature: !!(request as any).thoughtSignature,
      hasMigrationContext: !!migrationContext
    });

    return request;
  }

  /**
   * Creates a migration prompt to help preserve context from other models.
   */
  private createMigrationPrompt(_migrationContext: any): string {
    const parts: string[] = [];
    
    if (migrationContext.previousModel) {
      parts.push(`[Context Migration: Previously using ${migrationContext.previousModel}]`);
    }
    
    if (migrationContext.conversationSummary) {
      parts.push(`Previous conversation summary: ${migrationContext.conversationSummary}`);
    }
    
    if (migrationContext.reasoningContext) {
      parts.push(`Previous reasoning context: ${migrationContext.reasoningContext}`);
    }
    
    if (parts.length > 0) {
      parts.push('[Please maintain continuity with the above context while leveraging your advanced reasoning capabilities]');
      return parts.join('\n');
    }
    
    return '';
  }

  /**
   * Processes the streaming response and yields chunks.
   */
  private async *processStream(
    _stream: GenerateContentStreamResult
  ): AsyncGenerator<StreamChunk> {
    const toolCallAccumulators = new Map<string, ToolCallAccumulator>();
    let hasStarted = false;
    let hasFinished = false;
    let accumulatedThoughtSignature = '';

    try {
      for await (const chunk of stream.stream) {
        hasStarted = true;
        
        // Handle streaming errors
        if (chunk.promptFeedback?.blockReason) {
          logger.warn('[Google] Content blocked:', chunk.promptFeedback.blockReason);
          yield {
            type: 'error',
            error: {
              code: 'INVALID_REQUEST',
              message: `Content blocked: ${chunk.promptFeedback.blockReason}`,
            },
          };
          return;
        }
        
        if (chunk.candidates && chunk.candidates.length > 0) {
          const candidate = chunk.candidates[0];
          
          if (!candidate) {
    continue;
  }
          
          // Handle safety ratings and blocks
          if (candidate.safetyRatings) {
            const blockedRating = candidate.safetyRatings.find(rating => 
              (rating as any).blocked === true
            );
            if (blockedRating) {
              logger.warn('[Google] Content blocked by safety filter:', blockedRating.category);
              yield {
                type: 'error',
                error: {
                  code: 'INVALID_REQUEST',
                  message: `Content blocked by safety filter: ${blockedRating.category}`,
                },
              };
              return;
            }
          }
          
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                yield { type: 'text', text: part.text };
              } else if (part.functionCall) {
                // Handle streaming function calls
                const functionCall = part.functionCall;
                const toolCallId = `${functionCall.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Check if this is a partial function call that needs accumulation
                if (functionCall.args === undefined ?? functionCall.args === null) {
                  // Start accumulating this function call
                  toolCallAccumulators.set(toolCallId, {
                    _id: toolCallId,
                    name: functionCall.name,
                    args: '',
                  });
                } else {
                  // Complete function call or continuation
                  const existing = toolCallAccumulators.get(toolCallId);
                  if (existing) {
                    // Accumulate arguments
                    existing.args += JSON.stringify(functionCall.args);
                  } else {
                    // Complete function call in one chunk
                    const parsedArgs = parseFunctionCallArguments(functionCall.args, functionCall.name);
                    yield {
                      type: 'tool_call',
                      _id: toolCallId,
                      name: functionCall.name,
                      arguments: JSON.stringify(parsedArgs),
                    };
                  }
                }
              }
            }
          }
          
          // Handle thought signature streaming for Gemini 3.0
          if (this.config.gemini?.thoughtSignatures && (candidate as any){
    .thoughtSignature) {
  }
            const newSignature = (candidate as any).thoughtSignature;
            if (newSignature !== accumulatedThoughtSignature) {
              accumulatedThoughtSignature = newSignature;
              logger.debug('[Google] Thought signature updated');
            }
          }
          
          // Check if generation is finished
          if (candidate.finishReason) {
            logger.debug('[Google] Generation finished with reason:', candidate.finishReason);
            
            // Emit any accumulated function calls
            for (const [, acc] of toolCallAccumulators) {
              if (acc.id !== '' && acc.name !== '' && acc.args !== '') {
                try {
                  const parsedArgs = parseFunctionCallArguments(acc.args, acc.name);
                  yield {
                    type: 'tool_call',
                    id: acc.id,
                    name: acc.name,
                    arguments: JSON.stringify(parsedArgs),
                  };
                } catch (error) {
                  logger.warn(`[Google] Failed to parse accumulated function call for ${acc.name}:`, error);
                }
              }
            }
            
            // Store final thought signature for next turn
            if (this.config.gemini?.thoughtSignatures && accumulatedThoughtSignature) {
              this.thoughtSignature = {
                _signature: accumulatedThoughtSignature,
                turnId: `turn_${Date.now()}`,
              };
              logger.debug('[Google] Thought signature stored for next turn');
            }
            
            // Handle different finish reasons
            let finishMessage: string | undefined;
            switch (candidate.finishReason) {
              case 'STOP':
                // Normal completion
                break;
              case 'MAX_TOKENS':
                finishMessage = 'Response truncated due to maximum token limit';
                break;
              case 'SAFETY':
                finishMessage = 'Response stopped due to safety concerns';
                break;
              case 'RECITATION':
                finishMessage = 'Response stopped due to recitation concerns';
                break;
              case 'OTHER':
                finishMessage = 'Response stopped for unknown reason';
                break;
            }
            
            // Emit done chunk
            yield {
              type: 'done',
              usage: chunk.usageMetadata
                ? { 
                    inputTokens: chunk.usageMetadata.promptTokenCount ?? 0, 
                    outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0 
                  }
                : undefined,
              ...(finishMessage ? { _finishReason: finishMessage } : {}),
            };
            hasFinished = true;
            break;
          }
        }
      }
      
      // If we haven't emitted a done chunk yet, emit one now
      if (hasStarted && !hasFinished) {
        // Emit any remaining accumulated function calls
        for (const [, acc] of toolCallAccumulators) {
          if (acc.id !== '' && acc.name !== '' && acc.args !== '') {
            try {
              const parsedArgs = parseFunctionCallArguments(acc.args, acc.name);
              yield {
                type: 'tool_call',
                id: acc.id,
                name: acc.name,
                arguments: JSON.stringify(parsedArgs),
              };
            } catch (error) {
              logger.warn(`[Google] Failed to parse final accumulated function call for ${acc.name}:`, error);
            }
          }
        }
        
        yield { type: 'done' };
      }
    } catch (error) {
      logger.error('[Google] Stream processing error:', error);
      
      // Handle stream interruption gracefully
      if (hasStarted && !hasFinished) {
        // Emit any accumulated function calls before error
        for (const [, acc] of toolCallAccumulators) {
          if (acc.id !== '' && acc.name !== '' && acc.args !== '') {
            try {
              const parsedArgs = parseFunctionCallArguments(acc.args, acc.name);
              yield {
                type: 'tool_call',
                id: acc.id,
                name: acc.name,
                arguments: JSON.stringify(parsedArgs),
              };
            } catch {
              // Ignore errors when yielding partial tool calls during error recovery
            }
          }
        }
      }
      
      // Enhanced error handling for different Google API error types
      if (error && typeof error === 'object') {
        const errorObj = error as any;
        
        // Handle quota exceeded errors
        if (errorObj.status === 'RESOURCE_EXHAUSTED' || errorObj.message?.includes('quota') {
          yield {
            type: 'error',
            error: {
              code: 'RATE_LIMITED',
              message: 'Google API quota exceeded. Please try again later.',
            },
          };
          return;
        }
        
        // Handle authentication errors
        if (errorObj.status === 'UNAUTHENTICATED' || errorObj.status === 'PERMISSION_DENIED') {
          yield {
            type: 'error',
            error: {
              code: 'AUTH_FAILED',
              message: 'Google API authentication failed. Please check your API key.',
            },
          };
          return;
        }
        
        // Handle model not found errors
        if (errorObj.message?.includes('model') {
    && errorObj.message?.includes('not found')) {
  }
          yield {
            type: 'error',
            error: {
              code: 'INVALID_REQUEST',
              message: `Model ${this.model} not found or not accessible.`,
            },
          };
          return;
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
 * Creates a Google adapter from configuration.
 */
function createGoogleAdapter(_config: ModelConfig, authManager?: AuthenticationManager): IModelAdapter {
  return new GoogleAdapter(config as GoogleModelConfig, authManager);
}

// Register the Google adapter factory
registerAdapter('google', createGoogleAdapter);

export { createGoogleAdapter, type Gemini3Config, type GoogleModelConfig };