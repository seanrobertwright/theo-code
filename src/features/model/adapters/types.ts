/**
 * @fileoverview Model adapter interface definitions
 * @module features/model/adapters/types
 *
 * Defines the universal model adapter interface (UMAL) that all provider
 * adapters must implement. This abstraction enables model-agnostic
 * conversations while supporting provider-specific features.
 */

import type {
  Message,
  UniversalToolDefinition,
  ToolCall,
} from '../../../shared/types/index.js';
import type {
  StreamChunk,
  GenerateOptions,
  ModelConfig,
} from '../../../shared/types/models.js';
import type { AuthenticationManager } from '../auth/authentication-manager.js';

// =============================================================================
// ADAPTER INTERFACE
// =============================================================================

/**
 * Universal Model Adapter Layer (UMAL) interface.
 *
 * All model provider adapters must implement this interface to ensure
 * consistent behavior across different LLM providers.
 *
 * @example
 * ```typescript
 * const adapter = new OpenAIAdapter(config);
 *
 * for await (const chunk of adapter.generateStream(messages, tools)) {
 *   if (chunk.type === 'text') {
 *     process.stdout.write(chunk.text);
 *   }
 * }
 * ```
 */
export interface IModelAdapter {
  /**
   * Provider name for display purposes.
   *
   * @example 'openai', 'anthropic', 'gemini', 'ollama'
   */
  readonly provider: string;

  /**
   * Model identifier.
   *
   * @example 'gpt-4o', 'claude-3-5-sonnet-20241022', 'gemini-1.5-pro'
   */
  readonly model: string;

  /**
   * Maximum context window in tokens.
   *
   * @example 128000 for GPT-4o, 200000 for Claude 3.5
   */
  readonly contextLimit: number;

  /**
   * Whether this model supports native tool/function calling.
   *
   * If false, tools will be injected as system prompt instructions.
   */
  readonly supportsToolCalling: boolean;

  /**
   * Generate a streaming response from the model.
   *
   * @param messages - Conversation history
   * @param tools - Available tools for the model to call
   * @param options - Generation options (temperature, maxTokens, etc.)
   * @yields StreamChunk - Text, tool calls, completion, or errors
   * @throws {AdapterError} If the API call fails
   *
   * @example
   * ```typescript
   * const chunks: StreamChunk[] = [];
   * for await (const chunk of adapter.generateStream(messages, tools)) {
   *   chunks.push(chunk);
   *   if (chunk.type === 'text') {
   *     appendToUI(chunk.text);
   *   }
   * }
   * ```
   */
  generateStream(
    messages: Message[],
    tools?: UniversalToolDefinition[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk>;

  /**
   * Count tokens for a set of messages.
   *
   * Used for context window management and usage tracking.
   *
   * @param messages - Messages to count tokens for
   * @returns Total token count
   */
  countTokens(messages: Message[]): number;

  /**
   * Validate that the adapter is properly configured.
   *
   * @throws {AdapterError} If configuration is invalid
   */
  validateConfig(): void;
}

// =============================================================================
// ADAPTER ERRORS
// =============================================================================

/**
 * Error codes for adapter failures.
 */
export type AdapterErrorCode =
  | 'INVALID_CONFIG'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'CONTEXT_OVERFLOW'
  | 'INVALID_REQUEST'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT';

/**
 * Custom error class for adapter failures.
 *
 * Provides structured error information for better error handling and
 * user-facing error messages.
 */
export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly provider: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(
    code: AdapterErrorCode,
    provider: string,
    message: string,
    options?: {
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: Error;
    }
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'AdapterError';
    this.code = code;
    this.provider = provider;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
    this.cause = options?.cause;
  }
}

// =============================================================================
// ADAPTER FACTORY
// =============================================================================

/**
 * Factory function type for creating model adapters.
 */
export type AdapterFactory = (config: ModelConfig, authManager?: AuthenticationManager) => IModelAdapter;

/**
 * Registry of adapter factories by provider.
 */
export const adapterFactories = new Map<string, AdapterFactory>();

/**
 * Register an adapter factory for a provider.
 *
 * @param provider - Provider identifier
 * @param factory - Factory function
 */
export function registerAdapter(provider: string, factory: AdapterFactory): void {
  adapterFactories.set(provider, factory);
}

/**
 * Create an adapter for the given configuration.
 *
 * @param config - Model configuration
 * @param authManager - Optional authentication manager for OAuth support
 * @returns Configured adapter instance
 * @throws {AdapterError} If provider is not supported
 */
export function createAdapter(config: ModelConfig, authManager?: AuthenticationManager): IModelAdapter {
  const factory = adapterFactories.get(config.provider);
  if (factory === undefined) {
    throw new AdapterError(
      'INVALID_CONFIG',
      config.provider,
      `Unsupported provider: ${config.provider}. Available: ${[...adapterFactories.keys()].join(', ')}`
    );
  }
  return factory(config, authManager);
}

// =============================================================================
// CONVERSATION HELPERS
// =============================================================================

/**
 * Parsed tool calls from a streaming response.
 */
export interface ParsedToolCalls {
  /** Fully parsed tool calls ready for execution */
  toolCalls: ToolCall[];
  /** Raw text content from the response */
  textContent: string;
}

/**
 * Result of a tool execution for injection back into the conversation.
 */
export interface ToolExecutionResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}
