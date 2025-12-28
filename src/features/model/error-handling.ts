/**
 * @fileoverview Unified error handling system for model adapters
 * @module features/model/error-handling
 *
 * Provides comprehensive error mapping, recovery strategies, and provider-specific
 * error handling for all AI model adapters.
 */

import type { ModelProvider } from '../../shared/types/models.js';
import { AdapterError, type AdapterErrorCode } from './adapters/types.js';
// =============================================================================
// EXTENDED ERROR TYPES
// =============================================================================

/**
 * Extended error codes for comprehensive error handling.
 */
export type ExtendedAdapterErrorCode = AdapterErrorCode 
  | 'CONTENT_POLICY_VIOLATION'
  | 'MODEL_OVERLOADED'
  | 'MAINTENANCE_MODE'
  | 'QUOTA_EXCEEDED'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'INVALID_MODEL'
  | 'INSUFFICIENT_CREDITS'
  | 'SERVICE_UNAVAILABLE'
  | 'PARSING_ERROR'
  | 'TOOL_EXECUTION_ERROR';

/**
 * Error severity levels for prioritizing error handling.
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error recovery strategy types.
 */
export type RecoveryStrategy = 
  | 'retry'
  | 'fallback'
  | 'truncate'
  | 'skip'
  | 'abort';

/**
 * Extended adapter error with additional metadata.
 */
export class ExtendedAdapterError extends AdapterError {
  readonly severity: ErrorSeverity;
  readonly recoveryStrategy: RecoveryStrategy;
  readonly originalError: unknown;
  readonly context: Record<string, unknown>;

  constructor(
    _code: ExtendedAdapterErrorCode,
    _provider: string,
    _message: string,
    options?: {
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: Error;
      severity?: ErrorSeverity;
      recoveryStrategy?: RecoveryStrategy;
      originalError?: unknown;
      context?: Record<string, unknown>;
    }
  ) {
    super(code as AdapterErrorCode, provider, message, options);
    this.name = 'ExtendedAdapterError';
    this.severity = options?.severity ?? 'medium';
    this.recoveryStrategy = options?.recoveryStrategy ?? 'retry';
    this.originalError = options?.originalError;
    this.context = options?.context ?? {};
  }
}

// =============================================================================
// PROVIDER-SPECIFIC ERROR MAPPINGS
// =============================================================================

/**
 * Provider-specific error pattern for mapping native errors to standard codes.
 */
interface ErrorPattern {
  pattern: RegExp | string;
  code: ExtendedAdapterErrorCode;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * OpenAI error patterns.
 */
const OPENAI_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /rate limit/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /invalid api key/i,
    code: 'AUTH_FAILED',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
  {
    pattern: /context length/i,
    code: 'CONTEXT_LENGTH_EXCEEDED',
    severity: 'medium',
    recoveryStrategy: 'truncate',
    retryable: true,
  },
  {
    pattern: /model not found/i,
    code: 'INVALID_MODEL',
    severity: 'high',
    recoveryStrategy: 'fallback',
    retryable: false,
  },
  {
    pattern: /insufficient quota/i,
    code: 'QUOTA_EXCEEDED',
    severity: 'high',
    recoveryStrategy: 'fallback',
    retryable: false,
  },
];

/**
 * Anthropic error patterns.
 */
const ANTHROPIC_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /rate_limit_error/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /authentication_error/i,
    code: 'AUTH_FAILED',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
  {
    pattern: /invalid_request_error.*max_tokens/i,
    code: 'CONTEXT_LENGTH_EXCEEDED',
    severity: 'medium',
    recoveryStrategy: 'truncate',
    retryable: true,
  },
  {
    pattern: /overloaded_error/i,
    code: 'MODEL_OVERLOADED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 30000,
  },
];

/**
 * Google error patterns.
 */
const GOOGLE_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /RATE_LIMIT_EXCEEDED/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /PERMISSION_DENIED/i,
    code: 'AUTH_FAILED',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
  {
    pattern: /INVALID_ARGUMENT.*context/i,
    code: 'CONTEXT_LENGTH_EXCEEDED',
    severity: 'medium',
    recoveryStrategy: 'truncate',
    retryable: true,
  },
  {
    pattern: /RESOURCE_EXHAUSTED/i,
    code: 'MODEL_OVERLOADED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 30000,
  },
];

/**
 * OpenRouter error patterns.
 */
const OPENROUTER_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /rate limit/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /insufficient credits/i,
    code: 'INSUFFICIENT_CREDITS',
    severity: 'high',
    recoveryStrategy: 'fallback',
    retryable: false,
  },
  {
    pattern: /model not available/i,
    code: 'SERVICE_UNAVAILABLE',
    severity: 'medium',
    recoveryStrategy: 'fallback',
    retryable: true,
  },
];

/**
 * Cohere error patterns.
 */
const COHERE_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /too_many_requests/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /unauthorized/i,
    code: 'AUTH_FAILED',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
];

/**
 * Mistral error patterns.
 */
const MISTRAL_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /rate limit/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /unauthorized/i,
    code: 'AUTH_FAILED',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
];

/**
 * Together error patterns.
 */
const TOGETHER_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /rate limit/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /invalid api key/i,
    code: 'AUTH_FAILED',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
];

/**
 * Perplexity error patterns.
 */
const PERPLEXITY_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /rate limit/i,
    code: 'RATE_LIMITED',
    severity: 'medium',
    recoveryStrategy: 'retry',
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    pattern: /unauthorized/i,
    code: 'AUTH_FAILED',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
];

/**
 * Ollama error patterns.
 */
const OLLAMA_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /connection refused/i,
    code: 'NETWORK_ERROR',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
  {
    pattern: /model not found/i,
    code: 'INVALID_MODEL',
    severity: 'high',
    recoveryStrategy: 'abort',
    retryable: false,
  },
];

/**
 * Provider error pattern mappings.
 */
const PROVIDER_ERROR_PATTERNS: Record<ModelProvider, ErrorPattern[]> = {
  openai: OPENAI_ERROR_PATTERNS,
  anthropic: ANTHROPIC_ERROR_PATTERNS,
  google: GOOGLE_ERROR_PATTERNS,
  openrouter: OPENROUTER_ERROR_PATTERNS,
  cohere: COHERE_ERROR_PATTERNS,
  mistral: MISTRAL_ERROR_PATTERNS,
  together: TOGETHER_ERROR_PATTERNS,
  perplexity: PERPLEXITY_ERROR_PATTERNS,
  ollama: OLLAMA_ERROR_PATTERNS,
};

// =============================================================================
// ERROR MAPPING UTILITIES
// =============================================================================

/**
 * Map a provider-specific error to a standardized ExtendedAdapterError.
 */
export function mapProviderError(
  provider: ModelProvider,
  error: unknown,
  context?: Record<string, unknown>
): ExtendedAdapterError {
  const errorMessage = extractErrorMessage(error);
  const patterns = PROVIDER_ERROR_PATTERNS[provider] ?? [];

  // Try to match against provider-specific patterns
  for (const pattern of patterns) {
    const matches = typeof pattern.pattern === 'string' 
      ? errorMessage.includes(pattern.pattern)
      : pattern.pattern.test(errorMessage);

    if (matches) {
      return new ExtendedAdapterError(
        pattern.code,
        provider,
        errorMessage,
        {
          retryable: pattern.retryable,
          ...(pattern.retryAfterMs !== undefined && { retryAfterMs: pattern.retryAfterMs }),
          ...(error instanceof Error && { cause: error }),
          severity: pattern.severity,
          recoveryStrategy: pattern.recoveryStrategy,
          originalError: error,
          ...(context !== undefined && { context }),
        }
      );
    }
  }

  // Fallback to generic error mapping
  return mapGenericError(provider, error, context);
}

/**
 * Map generic errors that don't match provider-specific patterns.
 */
function mapGenericError(
  provider: ModelProvider,
  error: unknown,
  context?: Record<string, unknown>
): ExtendedAdapterError {
  const errorMessage = extractErrorMessage(error);

  // Network-related errors
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
    return new ExtendedAdapterError(
      'NETWORK_ERROR',
      provider,
      'Network connection failed',
      {
        retryable: true,
        severity: 'high',
        recoveryStrategy: 'retry',
        originalError: error,
        ...(context !== undefined && { context }),
      }
    );
  }

  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
    return new ExtendedAdapterError(
      'TIMEOUT',
      provider,
      'Request timed out',
      {
        retryable: true,
        severity: 'medium',
        recoveryStrategy: 'retry',
        originalError: error,
        ...(context !== undefined && { context }),
      }
    );
  }

  // JSON parsing errors
  if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
    return new ExtendedAdapterError(
      'PARSING_ERROR',
      provider,
      'Failed to parse response',
      {
        retryable: false,
        severity: 'medium',
        recoveryStrategy: 'abort',
        originalError: error,
        ...(context !== undefined && { context }),
      }
    );
  }

  // Default to generic API error
  return new ExtendedAdapterError(
    'API_ERROR',
    provider,
    errorMessage || 'Unknown API error',
    {
      retryable: false,
      severity: 'medium',
      recoveryStrategy: 'fallback',
      originalError: error,
      ...(context !== undefined && { context }),
    }
  );
}

/**
 * Extract error message from various error types.
 */
function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    // Handle API response errors
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }

    if ('error' in error && error.error && typeof error.error === 'object' && 'message' in error.error) {
      return String(error.error.message);
    }

    // Handle HTTP errors
    if ('status' in error && 'statusText' in error) {
      return `HTTP ${error.status}: ${error.statusText}`;
    }
  }

  return 'Unknown error';
}

// =============================================================================
// ERROR RECOVERY STRATEGIES
// =============================================================================

/**
 * Error recovery strategy implementation.
 */
export interface ErrorRecoveryContext {
  error: ExtendedAdapterError;
  attemptCount: number;
  maxAttempts: number;
  fallbackProviders: ModelProvider[];
  originalRequest: {
    messages: unknown[];
    tools?: unknown[];
    options?: unknown;
  };
}

/**
 * Determine if an error should trigger a recovery strategy.
 */
export function shouldRecover(error: ExtendedAdapterError, context: ErrorRecoveryContext): boolean {
  // Don't recover from critical errors
  if (error.severity === 'critical') {
    return false;
  }

  // Don't recover if we've exceeded max attempts
  if (context.attemptCount >= context.maxAttempts) {
    return false;
  }

  // Don't recover from non-retryable errors unless we have fallbacks
  if (!error.retryable && context.fallbackProviders.length === 0) {
    return false;
  }

  return true;
}

/**
 * Get the next recovery action based on error and context.
 */
export function getRecoveryAction(
  error: ExtendedAdapterError,
  context: ErrorRecoveryContext
): RecoveryStrategy {
  // For auth failures, try fallback immediately
  if (error.code === 'AUTH_FAILED' && context.fallbackProviders.length > 0) {
    return 'fallback';
  }

  // For context length errors, try truncation first
  if (error instanceof ExtendedAdapterError && error.code === 'CONTEXT_LENGTH_EXCEEDED') {
    return 'truncate';
  }

  // For rate limits, respect the recovery strategy but prefer retry
  if (error.code === 'RATE_LIMITED') {
    return 'retry';
  }

  // For model-specific errors, try fallback
  if (['INVALID_MODEL', 'MODEL_OVERLOADED', 'SERVICE_UNAVAILABLE'].includes(error.code)) {
    return context.fallbackProviders.length > 0 ? 'fallback' : 'retry';
  }

  // Use the error's suggested recovery strategy
  return error.recoveryStrategy;
}

/**
 * Calculate retry delay based on attempt count and error type.
 */
export function calculateRetryDelay(
  error: ExtendedAdapterError,
  attemptCount: number
): number {
  // Use provider-specified retry delay if available
  if (error.retryAfterMs) {
    return error.retryAfterMs;
  }

  // Exponential backoff with jitter
  const baseDelay = 1000; // 1 second
  const maxDelay = 60000; // 1 minute
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);
  
  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
  
  return Math.max(1000, exponentialDelay + jitter);
}

// =============================================================================
// ERROR LOGGING AND MONITORING
// =============================================================================

/**
 * Log error with appropriate level and context.
 */
export function logError(error: ExtendedAdapterError, context?: Record<string, unknown>): void {
  const logContext = {
    provider: error.provider,
    code: error.code,
    severity: error.severity,
    recoveryStrategy: error.recoveryStrategy,
    retryable: error.retryable,
    ...error.context,
    ...context,
  };

  switch (error.severity) {
    case 'critical':
      logger.error(`[ErrorHandler] Critical error: ${error.message}`, logContext);
      break;
    case 'high':
      logger.error(`[ErrorHandler] High severity error: ${error.message}`, logContext);
      break;
    case 'medium':
      logger.warn(`[ErrorHandler] Medium severity error: ${error.message}`, logContext);
      break;
    case 'low':
      logger.info(`[ErrorHandler] Low severity error: ${error.message}`, logContext);
      break;
  }
}

/**
 * Create error summary for monitoring and debugging.
 */
export function createErrorSummary(error: ExtendedAdapterError): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    provider: error.provider,
    code: error.code,
    severity: error.severity,
    recoveryStrategy: error.recoveryStrategy,
    retryable: error.retryable,
    message: error.message,
    context: error.context,
  };
}