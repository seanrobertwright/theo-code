/**
 * @fileoverview Response format standardization utilities
 * @module features/model/response-format
 *
 * Provides utilities for converting provider-specific responses to standardized
 * StreamChunk format and handling response formatting across different providers.
 */

import type {
  StreamChunk,
  TextStreamChunk,
  ToolCallStreamChunk,
  DoneStreamChunk,
  ErrorStreamChunk,
} from '../../shared/types/models.js';
import type { ToolCall } from '../../shared/types/index.js';
import { createToolCallId } from '../../shared/types/schemas.js';
// =============================================================================
// PROVIDER-SPECIFIC RESPONSE TYPES
// =============================================================================

/**
 * OpenAI streaming response chunk.
 */
export interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Anthropic streaming response event.
 */
export interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop' | 'error';
  index?: number;
  content_block?: {
    type: 'text' | 'tool_use';
    id?: string;
    name?: string;
  };
  delta?: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

/**
 * Google streaming response chunk.
 */
export interface GoogleStreamChunk {
  candidates?: Array<{
    content?: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args?: any;
        };
      }>;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
      blocked?: boolean;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  promptFeedback?: {
    blockReason?: string;
  };
}

/**
 * OpenRouter streaming response chunk (OpenAI-compatible).
 */
export type OpenRouterStreamChunk = OpenAIStreamChunk;

/**
 * Cohere streaming response chunk.
 */
export interface CohereStreamChunk {
  event_type: 'text-generation' | 'stream-end' | 'tool-calls-generation' | 'tool-calls-chunk';
  text?: string;
  tool_calls?: Array<{
    name: string;
    parameters: any;
  }>;
  finish_reason?: string;
  response?: {
    generation_id: string;
    text: string;
    meta?: {
      tokens?: {
        input_tokens: number;
        output_tokens: number;
      };
    };
  };
}

/**
 * Mistral streaming response chunk.
 */
export interface MistralStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Together streaming response chunk.
 */
export interface TogetherStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Perplexity streaming response chunk.
 */
export interface PerplexityStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/**
 * Ollama streaming response chunk.
 */
export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  response?: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// =============================================================================
// TOOL CALL ACCUMULATION
// =============================================================================

/**
 * Accumulator for streaming tool call data across providers.
 */
export interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
  provider: string;
}

/**
 * Manages tool call accumulation across streaming chunks.
 */
export class ToolCallAccumulatorManager {
  private accumulators = new Map<string, ToolCallAccumulator>();

  /**
   * Adds or updates a tool call accumulator.
   */
  addOrUpdate(
    _id: string,
    _name: string,
    _argumentsFragment: string,
    _provider: string
  ): void {
    const existing = this.accumulators.get(id);
    if (existing) {
      existing.arguments += argumentsFragment;
    } else {
      this.accumulators.set(id, {
        id,
        name,
        _arguments: argumentsFragment,
        provider,
      });
    }
  }

  /**
   * Gets all accumulated tool calls as StreamChunks.
   */
  getToolCallChunks(): ToolCallStreamChunk[] {
    const chunks: ToolCallStreamChunk[] = [];
    
    for (const [, acc] of this.accumulators) {
      if (acc.id && acc.name) {
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

  /**
   * Clears all accumulators.
   */
  clear(): void {
    this.accumulators.clear();
  }

  /**
   * Gets the number of active accumulators.
   */
  size(): number {
    return this.accumulators.size;
  }
}

// =============================================================================
// RESPONSE CONVERTERS
// =============================================================================

/**
 * Converts OpenAI streaming response to standardized StreamChunk.
 */
export function convertOpenAIResponse(
  _chunk: OpenAIStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  
  if (!chunk.choices || chunk.choices.length === 0) {
    return chunks;
  }
  
  const choice = chunk.choices[0];
  if (!choice) {
    return chunks;
  }
  
  const delta = choice.delta;
  
  // Handle text content
  if (delta.content && delta.content !== null) {
    chunks.push({
      type: 'text',
      text: delta.content,
    });
  }
  
  // Handle tool calls
  if (delta.tool_calls) {
    for (const toolCall of delta.tool_calls) {
      const id = toolCall.id || `tool_${toolCall.index}`;
      const name = toolCall.function?.name ?? '';
      const args = toolCall.function?.arguments ?? '';
      
      accumulators.addOrUpdate(id, name, args, 'openai');
    }
  }
  
  // Handle completion
  if (choice?.finish_reason) {
    // Emit accumulated tool calls
    chunks.push(...accumulators.getToolCallChunks());
    accumulators.clear();
    
    // Emit done chunk
    chunks.push({
      type: 'done',
      usage: chunk.usage ? {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
      } : undefined,
    });
  }
  
  return chunks;
}

/**
 * Converts Anthropic streaming response to standardized StreamChunk.
 */
export function convertAnthropicResponse(
  _event: AnthropicStreamEvent,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  
  switch (event.type) {
    case 'content_block_delta':
      if (event.delta?.type === 'text_delta' && event.delta.text) {
        chunks.push({
          type: 'text',
          text: event.delta.text,
        });
      } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
        // Accumulate tool call arguments
        const index = event.index?.toString() || '0';
        accumulators.addOrUpdate(index, '', event.delta.partial_json, 'anthropic');
      }
      break;
      
    case 'content_block_start':
      if (event.content_block?.type === 'tool_use') {
        const id = event.content_block.id || event.index?.toString() || '0';
        const name = event.content_block.name ?? '';
        accumulators.addOrUpdate(id, name, '', 'anthropic');
      }
      break;
      
    case 'message_delta':
      if (event.delta?.stop_reason) {
        // Emit accumulated tool calls
        chunks.push(...accumulators.getToolCallChunks());
        accumulators.clear();
        
        // Emit done chunk
        chunks.push({
          type: 'done',
          usage: event.usage ? {
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
          } : undefined,
        });
      }
      break;
      
    case 'message_stop':
      // Emit any remaining tool calls
      chunks.push(...accumulators.getToolCallChunks());
      accumulators.clear();
      
      // Emit done chunk if not already emitted
      chunks.push({
        type: 'done',
      });
      break;
      
    case 'error':
      if (event.error) {
        chunks.push({
          type: 'error',
          error: {
            code: mapAnthropicErrorCode(event.error.type),
            message: event.error.message,
          },
        });
      }
      break;
  }
  
  return chunks;
}

/**
 * Converts Google streaming response to standardized StreamChunk.
 */
export function convertGoogleResponse(
  _chunk: GoogleStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  
  // Handle prompt feedback errors
  if (chunk.promptFeedback?.blockReason) {
    chunks.push({
      type: 'error',
      error: {
        code: 'INVALID_REQUEST',
        message: `Content blocked: ${chunk.promptFeedback.blockReason}`,
      },
    });
    return chunks;
  }
  
  if (!chunk.candidates || chunk.candidates.length === 0) {
    return chunks;
  }
  
  const candidate = chunk.candidates[0];
  if (!candidate) {
    return chunks;
  }
  
  // Handle safety blocks
  if (candidate.safetyRatings) {
    const blockedRating = candidate.safetyRatings.find(rating => rating.blocked);
    if (blockedRating) {
      chunks.push({
        type: 'error',
        error: {
          code: 'INVALID_REQUEST',
          message: `Content blocked by safety filter: ${blockedRating.category}`,
        },
      });
      return chunks;
    }
  }
  
  // Handle content
  if (candidate.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) {
        chunks.push({
          type: 'text',
          text: part.text,
        });
      } else if (part.functionCall) {
        const id = `${part.functionCall.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const args = part.functionCall.args ? JSON.stringify(part.functionCall.args) : '';
        
        chunks.push({
          type: 'tool_call',
          id,
          name: part.functionCall.name,
          _arguments: args,
        });
      }
    }
  }
  
  // Handle completion
  if (candidate.finishReason) {
    // Emit accumulated tool calls
    chunks.push(...accumulators.getToolCallChunks());
    accumulators.clear();
    
    // Emit done chunk
    chunks.push({
      type: 'done',
      usage: chunk.usageMetadata ? {
        inputTokens: chunk.usageMetadata.promptTokenCount || 0,
        outputTokens: chunk.usageMetadata.candidatesTokenCount || 0,
      } : undefined,
    });
  }
  
  return chunks;
}

/**
 * Converts OpenRouter streaming response to standardized StreamChunk.
 * Uses OpenAI format since OpenRouter is OpenAI-compatible.
 */
export function convertOpenRouterResponse(
  _chunk: OpenRouterStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  return convertOpenAIResponse(chunk, accumulators);
}

/**
 * Converts Cohere streaming response to standardized StreamChunk.
 */
export function convertCohereResponse(
  _chunk: CohereStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  
  switch (chunk.event_type) {
    case 'text-generation':
      if (chunk.text) {
        chunks.push({
          type: 'text',
          text: chunk.text,
        });
      }
      break;
      
    case 'tool-calls-generation':
    case 'tool-calls-chunk':
      if (chunk.tool_calls) {
        for (const toolCall of chunk.tool_calls) {
          const id = `cohere_${toolCall.name}_${Date.now()}`;
          chunks.push({
            type: 'tool_call',
            id,
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.parameters),
          });
        }
      }
      break;
      
    case 'stream-end':
      // Emit accumulated tool calls
      chunks.push(...accumulators.getToolCallChunks());
      accumulators.clear();
      
      // Emit done chunk
      chunks.push({
        type: 'done',
        usage: chunk.response?.meta?.tokens ? {
          inputTokens: chunk.response.meta.tokens.input_tokens,
          outputTokens: chunk.response.meta.tokens.output_tokens,
        } : undefined,
      });
      break;
  }
  
  return chunks;
}

/**
 * Converts Mistral streaming response to standardized StreamChunk.
 */
export function convertMistralResponse(
  _chunk: MistralStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  // Mistral uses OpenAI-compatible format
  return convertOpenAIResponse(chunk as OpenAIStreamChunk, accumulators);
}

/**
 * Converts Together streaming response to standardized StreamChunk.
 */
export function convertTogetherResponse(
  _chunk: TogetherStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  // Together uses OpenAI-compatible format
  return convertOpenAIResponse(chunk as OpenAIStreamChunk, accumulators);
}

/**
 * Converts Perplexity streaming response to standardized StreamChunk.
 */
export function convertPerplexityResponse(
  _chunk: PerplexityStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  
  if (!chunk.choices || chunk.choices.length === 0) {
    return chunks;
  }
  
  const choice = chunk.choices[0];
  if (!choice) {
    return chunks;
  }
  
  const delta = choice.delta;
  
  // Handle text content
  if (delta.content) {
    chunks.push({
      type: 'text',
      text: delta.content,
    });
  }
  
  // Handle completion
  if (choice.finish_reason) {
    // Emit accumulated tool calls
    chunks.push(...accumulators.getToolCallChunks());
    accumulators.clear();
    
    // Emit done chunk
    chunks.push({
      type: 'done',
      usage: chunk.usage ? {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
      } : undefined,
    });
  }
  
  return chunks;
}

/**
 * Converts Ollama streaming response to standardized StreamChunk.
 */
export function convertOllamaResponse(
  _chunk: OllamaStreamChunk,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  
  // Handle text content
  if (chunk.response) {
    chunks.push({
      type: 'text',
      text: chunk.response,
    });
  }
  
  // Handle completion
  if (chunk.done) {
    // Emit accumulated tool calls
    chunks.push(...accumulators.getToolCallChunks());
    accumulators.clear();
    
    // Emit done chunk with usage info
    chunks.push({
      type: 'done',
      usage: {
        inputTokens: chunk.prompt_eval_count || 0,
        outputTokens: chunk.eval_count || 0,
      },
    });
  }
  
  return chunks;
}

// =============================================================================
// UNIVERSAL CONVERTER
// =============================================================================

/**
 * Provider-specific response converter function type.
 */
export type ResponseConverter<T = any> = (
  _chunk: T,
  _accumulators: ToolCallAccumulatorManager
) => StreamChunk[];

/**
 * Registry of response converters by provider.
 */
export const responseConverters = new Map<string, ResponseConverter>([
  ['openai', convertOpenAIResponse],
  ['anthropic', convertAnthropicResponse],
  ['google', convertGoogleResponse],
  ['openrouter', convertOpenRouterResponse],
  ['cohere', convertCohereResponse],
  ['mistral', convertMistralResponse],
  ['together', convertTogetherResponse],
  ['perplexity', convertPerplexityResponse],
  ['ollama', convertOllamaResponse],
]);

/**
 * Converts provider-specific response to standardized StreamChunk format.
 */
export function convertProviderResponse(
  _provider: string,
  _chunk: any,
  _accumulators: ToolCallAccumulatorManager
): StreamChunk[] {
  const converter = responseConverters.get(provider);
  
  if (!converter) {
    logger.warn(`[ResponseFormat] No converter found for provider: ${provider}`);
    return [{
      type: 'error',
      error: {
        code: 'API_ERROR',
        message: `Unsupported provider for response conversion: ${provider}`,
      },
    }];
  }
  
  try {
    return converter(chunk, accumulators);
  } catch (error) {
    logger.error(`[ResponseFormat] Conversion failed for provider ${provider}:`, error);
    return [{
      type: 'error',
      error: {
        code: 'API_ERROR',
        message: `Response conversion failed: ${error}`,
      },
    }];
  }
}

// =============================================================================
// TOOL CALL STANDARDIZATION
// =============================================================================

/**
 * Standardizes tool call format across providers.
 */
export function standardizeToolCall(
  _toolCall: any,
  _provider: string
): ToolCall {
  // Helper function to ensure we always have a valid ID
  const ensureValidId = (_id: any, _fallbackName: string): string => {
    if (id && typeof id === 'string' && id.length > 0) {
      return id;
    }
    return `${provider}_${fallbackName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'mistral':
    case 'together':
      const openaiName = toolCall.function?.name || toolCall.name || 'unknown';
      return {
        id: createToolCallId(ensureValidId(toolCall.id, openaiName)),
        _name: openaiName,
        arguments: parseToolCallArguments(toolCall.function?.arguments || toolCall.arguments),
      };
      
    case 'anthropic':
      const anthropicName = toolCall.name || 'unknown';
      return {
        id: createToolCallId(ensureValidId(toolCall.id, anthropicName)),
        _name: anthropicName,
        arguments: parseToolCallArguments(toolCall.input || toolCall.arguments),
      };
      
    case 'google':
      const googleName = toolCall.name || 'unknown';
      return {
        id: createToolCallId(ensureValidId(toolCall.id, googleName)),
        _name: googleName,
        arguments: parseToolCallArguments(toolCall.args || toolCall.arguments),
      };
      
    case 'cohere':
      const cohereName = toolCall.name || 'unknown';
      return {
        id: createToolCallId(ensureValidId(toolCall.id, cohereName)),
        _name: cohereName,
        arguments: parseToolCallArguments(toolCall.parameters || toolCall.arguments),
      };
      
    case 'perplexity':
    case 'ollama':
      const localName = toolCall.name || 'unknown';
      return {
        id: createToolCallId(ensureValidId(toolCall.id, localName)),
        _name: localName,
        arguments: parseToolCallArguments(toolCall.arguments),
      };
      
    default:
      logger.warn(`[ResponseFormat] Unknown provider for tool call standardization: ${provider}`);
      const unknownName = toolCall.name || 'unknown';
      return {
        id: createToolCallId(ensureValidId(toolCall.id, unknownName)),
        _name: unknownName,
        arguments: parseToolCallArguments(toolCall.arguments || {}),
      };
  }
}

/**
 * Parses tool call arguments from various formats.
 */
function parseToolCallArguments(_args: any): any {
  if (args === null ?? args === undefined) {
    return {};
  }
  
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      // Ensure we always return an object, not primitives
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      } else {
        return { _value: parsed };
      }
    } catch (error) {
      logger.warn('[ResponseFormat] Failed to parse tool call arguments as JSON:', error);
      // Preserve the original string as raw_input, even if it's whitespace
      return { _raw_input: args };
    }
  }
  
  if (typeof args === 'object' && args !== null) {
    return args;
  }
  
  // For primitives, wrap them in an object
  return { _value: args };
}

// =============================================================================
// ERROR CODE MAPPING
// =============================================================================

/**
 * Maps Anthropic error codes to standard error codes.
 */
function mapAnthropicErrorCode(_errorType: string): string {
  const errorMap: Record<string, string> = {
    'authentication_error': 'AUTH_FAILED',
    'permission_error': 'AUTH_FAILED',
    'rate_limit_error': 'RATE_LIMITED',
    'invalid_request_error': 'INVALID_REQUEST',
    'api_error': 'API_ERROR',
    'overloaded_error': 'API_ERROR',
  };
  
  return errorMap[errorType] || 'API_ERROR';
}

/**
 * Maps Google error codes to standard error codes.
 */
function mapGoogleErrorCode(_status: string): string {
  const errorMap: Record<string, string> = {
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
  
  return errorMap[status] || 'API_ERROR';
}

/**
 * Maps HTTP status codes to standard error codes.
 */
function mapHttpStatusToErrorCode(_status: number): string {
  const statusMap: Record<number, string> = {
    401: 'AUTH_FAILED',
    403: 'AUTH_FAILED',
    429: 'RATE_LIMITED',
    400: 'INVALID_REQUEST',
    413: 'CONTEXT_OVERFLOW',
    408: 'TIMEOUT',
    500: 'API_ERROR',
    502: 'API_ERROR',
    503: 'API_ERROR',
    504: 'TIMEOUT',
  };
  
  return statusMap[status] || 'API_ERROR';
}

/**
 * Maps provider-specific error to standard error code.
 */
export function mapProviderError(
  _error: any,
  _provider: string
): { code: string; _message: string } {
  switch (provider) {
    case 'anthropic':
      return {
        code: mapAnthropicErrorCode(error.type || 'api_error'),
        message: error.message || 'Unknown Anthropic error',
      };
      
    case 'google':
      return {
        code: mapGoogleErrorCode(error.status || 'INTERNAL'),
        message: error.message || 'Unknown Google error',
      };
      
    case 'openai':
    case 'openrouter':
    case 'mistral':
    case 'together':
    case 'perplexity':
      return {
        code: mapHttpStatusToErrorCode(error.status || 500),
        message: error.message || 'Unknown API error',
      };
      
    case 'cohere':
      return {
        code: error.code ? mapHttpStatusToErrorCode(error.code) : 'API_ERROR',
        message: error.message || 'Unknown Cohere error',
      };
      
    case 'ollama':
      return {
        code: 'API_ERROR', // Ollama errors are typically local
        message: error.message || 'Unknown Ollama error',
      };
      
    default:
      return {
        code: 'API_ERROR',
        message: error.message || 'Unknown provider error',
      };
  }
}