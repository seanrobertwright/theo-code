/**
 * @fileoverview Retry logic with exponential backoff for model adapters
 * @module features/model/retry-logic
 *
 * Implements configurable retry strategies with exponential backoff, jitter,
 * and provider-specific retry policies for handling transient failures.
 */

import type { ModelProvider } from '../../shared/types/models.js';
import { ExtendedAdapterError, calculateRetryDelay, logError } from './error-handling.js';
// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * Retry strategy types.
 */
export type RetryStrategy = 'exponential' | 'linear' | 'fixed' | 'custom';

/**
 * Retry configuration for different error types.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Retry strategy to use */
  strategy: RetryStrategy;
  /** Jitter factor (0-1) to add randomness */
  jitterFactor: number;
  /** Error codes that should trigger retries */
  retryableErrors: Set<string>;
  /** Custom delay calculation function */
  customDelayFn?: (attempt: number, error: ExtendedAdapterError) => number;
}

/**
 * Default retry configurations by provider.
 */
const DEFAULT_RETRY_CONFIGS: Record<ModelProvider, RetryConfig> = {
  openai: {
    _maxRetries: 3,
    _baseDelayMs: 1000,
    _maxDelayMs: 60000,
    strategy: 'exponential',
    jitterFactor: 0.25,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'MODEL_OVERLOADED',
      'SERVICE_UNAVAILABLE',
    ]),
  },
  anthropic: {
    _maxRetries: 3,
    _baseDelayMs: 1000,
    _maxDelayMs: 60000,
    strategy: 'exponential',
    jitterFactor: 0.25,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'MODEL_OVERLOADED',
      'SERVICE_UNAVAILABLE',
    ]),
  },
  google: {
    _maxRetries: 3,
    _baseDelayMs: 1000,
    _maxDelayMs: 60000,
    strategy: 'exponential',
    jitterFactor: 0.25,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'MODEL_OVERLOADED',
      'SERVICE_UNAVAILABLE',
    ]),
  },
  openrouter: {
    _maxRetries: 2,
    _baseDelayMs: 2000,
    _maxDelayMs: 30000,
    strategy: 'exponential',
    jitterFactor: 0.3,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE',
    ]),
  },
  cohere: {
    _maxRetries: 3,
    _baseDelayMs: 1000,
    _maxDelayMs: 45000,
    strategy: 'exponential',
    jitterFactor: 0.25,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'MODEL_OVERLOADED',
    ]),
  },
  mistral: {
    _maxRetries: 3,
    _baseDelayMs: 1000,
    _maxDelayMs: 45000,
    strategy: 'exponential',
    jitterFactor: 0.25,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'MODEL_OVERLOADED',
    ]),
  },
  together: {
    _maxRetries: 2,
    _baseDelayMs: 1500,
    _maxDelayMs: 30000,
    strategy: 'exponential',
    jitterFactor: 0.3,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE',
    ]),
  },
  perplexity: {
    _maxRetries: 2,
    _baseDelayMs: 2000,
    _maxDelayMs: 30000,
    strategy: 'exponential',
    jitterFactor: 0.3,
    retryableErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
    ]),
  },
  ollama: {
    _maxRetries: 1,
    _baseDelayMs: 5000,
    _maxDelayMs: 15000,
    strategy: 'fixed',
    jitterFactor: 0.1,
    retryableErrors: new Set([
      'NETWORK_ERROR',
      'TIMEOUT',
    ]),
  },
};

// =============================================================================
// RETRY CONTEXT
// =============================================================================

/**
 * Context for retry operations.
 */
export interface RetryContext {
  /** Current attempt number (1-based) */
  attempt: number;
  /** Maximum attempts allowed */
  maxAttempts: number;
  /** Provider being retried */
  provider: ModelProvider;
  /** Original operation name */
  operation: string;
  /** Start time of the retry sequence */
  startTime: number;
  /** Total time spent on retries */
  totalRetryTime: number;
  /** Errors encountered during retries */
  errors: ExtendedAdapterError[];
}

/**
 * Result of a retry operation.
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result value if successful */
  value?: T;
  /** Final error if unsuccessful */
  error?: ExtendedAdapterError;
  /** Retry context with attempt history */
  context: RetryContext;
}

// =============================================================================
// RETRY EXECUTOR
// =============================================================================

/**
 * Executes operations with retry logic and exponential backoff.
 */
export class RetryExecutor {
  private readonly config: RetryConfig;
  private readonly provider: ModelProvider;

  constructor(provider: ModelProvider, customConfig?: Partial<RetryConfig>) {
    this.provider = provider;
    this.config = {
      ...DEFAULT_RETRY_CONFIGS[provider],
      ...customConfig,
    };
  }

  /**
   * Execute an operation with retry logic.
   */
  async execute<T>(
    operation: () => Promise<T>,
    _operationName: string,
    context?: Partial<RetryContext>
  ): Promise<RetryResult<T>> {
    const retryContext: RetryContext = {
      _attempt: 1,
      maxAttempts: this.config.maxRetries + 1, // +1 for initial attempt
      provider: this.provider,
      _operation: operationName,
      startTime: Date.now(),
      _totalRetryTime: 0,
      errors: [],
      ...context,
    };

    logger.debug(`[RetryExecutor] Starting ${operationName} for ${this.provider} (max attempts: ${retryContext.maxAttempts})`);

    while (retryContext.attempt <= retryContext.maxAttempts) {
      try {
        const result = await operation();
        
        if (retryContext.attempt > 1) {
          logger.info(`[RetryExecutor] ${operationName} succeeded on attempt ${retryContext.attempt}/${retryContext.maxAttempts}`);
        }

        return {
          success: true,
          _value: result,
          _context: retryContext,
        };

      } catch (error) {
        const adaptedError = this.adaptError(error);
        retryContext.errors.push(adaptedError);

        logError(adaptedError, {
          _operation: operationName,
          attempt: retryContext.attempt,
          maxAttempts: retryContext.maxAttempts,
        });

        // Check if we should retry
        if (!this.shouldRetry(adaptedError, retryContext)) {
          logger.warn(`[RetryExecutor] ${operationName} failed permanently after ${retryContext.attempt} attempts`);
          return {
            success: false, error: adaptedError,
            _context: retryContext,
          };
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(adaptedError, retryContext.attempt);
        retryContext.totalRetryTime += delay;

        logger.info(`[RetryExecutor] Retrying ${operationName} in ${delay}ms (attempt ${retryContext.attempt + 1}/${retryContext.maxAttempts})`);
        
        await this.sleep(delay);
        retryContext.attempt++;
      }
    }

    // All attempts exhausted
    const finalError = retryContext.errors[retryContext.errors.length - 1];
    logger.error(`[RetryExecutor] ${operationName} failed after ${retryContext.maxAttempts} attempts`);

    return {
      success: false,
      ...(finalError !== undefined && { error: finalError }),
      _context: retryContext,
    };
  }

  /**
   * Execute multiple operations with retry logic in parallel.
   */
  async executeParallel<T>(
    operations: Array<() => Promise<T>>,
    _operationName: string,
    options?: {
      failFast?: boolean;
      maxConcurrency?: number;
    }
  ): Promise<Array<RetryResult<T>>> {
    const { failFast = false, maxConcurrency = operations.length } = options ?? {};
    
    logger.debug(`[RetryExecutor] Starting parallel ${operationName} (${operations.length} operations, concurrency: ${maxConcurrency})`);

    const results: Array<RetryResult<T>> = [];
    const executing: Array<Promise<void>> = [];

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      if (!operation) {
        continue;
      }
      
      const executePromise = this.execute(operation, `${operationName}[${i}]`)
        .then(result => {
          results[i] = result;
          
          if (failFast && !result.success) {
            throw new Error(`Operation ${i} failed in fail-fast mode`);
          }
        });

      executing.push(executePromise);

      // Limit concurrency
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
        // Remove completed promises
        for (let j = executing.length - 1; j >= 0; j--) {
          if (results[j] !== undefined) {
            executing.splice(j, 1);
          }
        }
      }
    }

    // Wait for all remaining operations
    await Promise.allSettled(executing);

    logger.debug(`[RetryExecutor] Completed parallel ${operationName} (${results.filter(r => r.success).length}/${results.length} succeeded)`);

    return results;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Determine if an error should trigger a retry.
   */
  private shouldRetry(error: ExtendedAdapterError, _context: RetryContext): boolean {
    // No more attempts left
    if (context.attempt >= context.maxAttempts) {
      return false;
    }

    // Error is not retryable
    if (!error.retryable) {
      return false;
    }

    // Error code is not in retryable set
    if (!this.config.retryableErrors.has(error.code)) {
      return false;
    }

    // Critical errors should not be retried
    if (error.severity === 'critical') {
      return false;
    }

    return true;
  }

  /**
   * Calculate retry delay based on strategy and attempt.
   */
  private calculateDelay(error: ExtendedAdapterError, attempt: number): number {
    // Use error-specific delay if provided
    if (error.retryAfterMs) {
      return error.retryAfterMs;
    }

    // Use custom delay function if provided
    if (this.config.customDelayFn) {
      return this.config.customDelayFn(attempt, error);
    }

    let delay: number;

    switch (this.config.strategy) {
      case 'exponential':
        delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
        break;
      
      case 'linear':
        delay = this.config.baseDelayMs * attempt;
        break;
      
      case 'fixed':
        delay = this.config.baseDelayMs;
        break;
      
      case 'custom':
        // Fallback to exponential if no custom function
        delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
        break;
      
      default:
        delay = this.config.baseDelayMs;
    }

    // Apply maximum delay limit
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    if (this.config.jitterFactor > 0) {
      const jitter = delay * this.config.jitterFactor * (Math.random() - 0.5);
      delay = Math.max(100, delay + jitter); // Minimum 100ms delay
    }

    return Math.round(delay);
  }

  /**
   * Adapt generic errors to ExtendedAdapterError.
   */
  private adaptError(error: unknown): ExtendedAdapterError {
    if (error instanceof ExtendedAdapterError) {
      return error;
    }

    // Import mapProviderError to avoid circular dependency
    const { mapProviderError } = require('./error-handling.js');
    return mapProviderError(this.provider, error);
  }

  /**
   * Sleep for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a retry executor for a specific provider.
 */
export function createRetryExecutor(
  _provider: ModelProvider,
  customConfig?: Partial<RetryConfig>
): RetryExecutor {
  return new RetryExecutor(provider, customConfig);
}

/**
 * Execute a function with retry logic using default configuration.
 */
export async function withRetry<T>(
  _provider: ModelProvider,
  operation: () => Promise<T>,
  _operationName: string,
  customConfig?: Partial<RetryConfig>
): Promise<T> {
  const executor = createRetryExecutor(provider, customConfig);
  const result = await executor.execute(operation, operationName);
  
  if (result.success) {
    return result.value!;
  }
  
  throw result.error;
}

/**
 * Get default retry configuration for a provider.
 */
export function getDefaultRetryConfig(provider: ModelProvider): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIGS[provider] };
}

/**
 * Update default retry configuration for a provider.
 */
export function updateDefaultRetryConfig(
  _provider: ModelProvider,
  updates: Partial<RetryConfig>
): void {
  DEFAULT_RETRY_CONFIGS[provider] = {
    ...DEFAULT_RETRY_CONFIGS[provider],
    ...updates,
  };
}

// =============================================================================
// RETRY DECORATORS
// =============================================================================

/**
 * Decorator for adding retry logic to adapter methods.
 */
export function withRetryDecorator(
  _provider: ModelProvider,
  _operationName: string,
  customConfig?: Partial<RetryConfig>
) {
  return function <T extends (...args: any[]) => Promise<any>>(
    _target: any,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;
    
    descriptor.value = async function (this: any, ...args: any[]) {
      const executor = createRetryExecutor(provider, customConfig);
      const result = await executor.execute(
        () => originalMethod.apply(this, args),
        operationName
      );
      
      if (result.success) {
        return result.value;
      }
      
      throw result.error;
    } as T;
    
    return descriptor;
  };
}