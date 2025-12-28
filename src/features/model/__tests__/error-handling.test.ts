/**
 * @fileoverview Unit tests for error handling system
 * @module features/model/__tests__/error-handling
 *
 * Tests error mapping accuracy, retry logic behavior, and circuit breaker functionality.
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  mapProviderError, 
  ExtendedAdapterError, 
  logError, 
  createErrorSummary,
  shouldRecover,
  getRecoveryAction,
  calculateRetryDelay,
  type ErrorRecoveryContext
} from '../error-handling.js';
import { 
  RetryExecutor, 
  createRetryExecutor, 
  withRetry, 
  getDefaultRetryConfig,
  type RetryConfig 
} from '../retry-logic.js';
import { 
  CircuitBreaker, 
  CircuitBreakerManager, 
  withCircuitBreaker, 
  getDefaultCircuitBreakerConfig,
  type CircuitBreakerConfig 
} from '../circuit-breaker.js';
import type { ModelProvider } from '../../../shared/types/models.js';

// =============================================================================
// ERROR MAPPING TESTS
// =============================================================================

describe('Error Mapping', () => {
  it('should map OpenAI rate limit errors correctly', () => {
    const error = new Error('Rate limit exceeded');
    const mappedError = mapProviderError('openai', error);

    expect(mappedError).toBeInstanceOf(ExtendedAdapterError);
    expect(mappedError.code).toBe('RATE_LIMITED');
    expect(mappedError.provider).toBe('openai');
    expect(mappedError.retryable).toBe(true);
    expect(mappedError.severity).toBe('medium');
    expect(mappedError.recoveryStrategy).toBe('retry');
  });

  it('should map Anthropic authentication errors correctly', () => {
    const error = new Error('authenticationerror: Invalid API key');
    const mappedError = mapProviderError('anthropic', error);

    expect(mappedError.code).toBe('AUTH_FAILED');
    expect(mappedError.provider).toBe('anthropic');
    expect(mappedError.retryable).toBe(false);
    expect(mappedError.severity).toBe('high');
    expect(mappedError.recoveryStrategy).toBe('abort');
  });

  it('should map Google context length errors correctly', () => {
    const error = new Error('INVALID_ARGUMENT: context length exceeded');
    const mappedError = mapProviderError('google', error);

    expect(mappedError.code).toBe('CONTEXT_LENGTH_EXCEEDED');
    expect(mappedError.provider).toBe('google');
    expect(mappedError.retryable).toBe(true);
    expect(mappedError.severity).toBe('medium');
    expect(mappedError.recoveryStrategy).toBe('truncate');
  });

  it('should map OpenRouter insufficient credits errors correctly', () => {
    const error = new Error('insufficient credits');
    const mappedError = mapProviderError('openrouter', error);

    expect(mappedError.code).toBe('INSUFFICIENT_CREDITS');
    expect(mappedError.provider).toBe('openrouter');
    expect(mappedError.retryable).toBe(false);
    expect(mappedError.severity).toBe('high');
    expect(mappedError.recoveryStrategy).toBe('fallback');
  });

  it('should map generic network errors correctly', () => {
    const error = new Error('ECONNREFUSED: Connection refused');
    const mappedError = mapProviderError('openai', error);

    expect(mappedError.code).toBe('NETWORK_ERROR');
    expect(mappedError.provider).toBe('openai');
    expect(mappedError.retryable).toBe(true);
    expect(mappedError.severity).toBe('high');
    expect(mappedError.recoveryStrategy).toBe('retry');
  });

  it('should map timeout errors correctly', () => {
    const error = new Error('Request timeout after 30000ms');
    const mappedError = mapProviderError('anthropic', error);

    expect(mappedError.code).toBe('TIMEOUT');
    expect(mappedError.provider).toBe('anthropic');
    expect(mappedError.retryable).toBe(true);
    expect(mappedError.severity).toBe('medium');
    expect(mappedError.recoveryStrategy).toBe('retry');
  });

  it('should handle unknown errors gracefully', () => {
    const error = new Error('Unknown error message');
    const mappedError = mapProviderError('openai', error);

    expect(mappedError.code).toBe('API_ERROR');
    expect(mappedError.provider).toBe('openai');
    expect(mappedError.retryable).toBe(false);
    expect(mappedError.severity).toBe('medium');
    expect(mappedError.recoveryStrategy).toBe('fallback');
  });

  it('should preserve original error context', () => {
    const originalError = new Error('Rate limit exceeded'); // Use a message that matches a pattern
    const context = { requestId: '123', userId: 'user456' };
    const mappedError = mapProviderError('openai', originalError, context);

    expect(mappedError.originalError).toBe(originalError);
    expect(mappedError.context).toEqual(context);
    expect(mappedError.cause).toBe(originalError);
  });
});

// =============================================================================
// ERROR RECOVERY TESTS
// =============================================================================

describe('Error Recovery', () => {
  it('should determine recovery eligibility correctly', () => {
    const retryableError = new ExtendedAdapterError(
      'RATE_LIMITED',
      'openai',
      'Rate limit exceeded',
      { retryable: true, severity: 'medium' }
    );

    const context: ErrorRecoveryContext = {
      error: retryableError,
      attemptCount: 1,
      maxAttempts: 3,
      fallbackProviders: ['anthropic'],
      originalRequest: { messages: [] },
    };

    expect(shouldRecover(retryableError, context)).toBe(true);
  });

  it('should reject recovery for critical errors', () => {
    const criticalError = new ExtendedAdapterError(
      'AUTH_FAILED',
      'openai',
      'Invalid API key',
      { retryable: false, severity: 'critical' }
    );

    const context: ErrorRecoveryContext = {
      error: criticalError,
      attemptCount: 1,
      maxAttempts: 3,
      fallbackProviders: ['anthropic'],
      originalRequest: { messages: [] },
    };

    expect(shouldRecover(criticalError, context)).toBe(false);
  });

  it('should reject recovery when max attempts exceeded', () => {
    const error = new ExtendedAdapterError(
      'RATE_LIMITED',
      'openai',
      'Rate limit exceeded',
      { retryable: true, severity: 'medium' }
    );

    const context: ErrorRecoveryContext = {
      error,
      attemptCount: 3,
      maxAttempts: 3,
      fallbackProviders: [],
      originalRequest: { messages: [] },
    };

    expect(shouldRecover(error, context)).toBe(false);
  });

  it('should suggest appropriate recovery actions', () => {
    const authError = new ExtendedAdapterError(
      'AUTH_FAILED',
      'openai',
      'Invalid API key',
      { retryable: false, severity: 'high' }
    );

    const contextWithFallbacks: ErrorRecoveryContext = {
      error: authError,
      attemptCount: 1,
      maxAttempts: 3,
      fallbackProviders: ['anthropic'],
      originalRequest: { messages: [] },
    };

    expect(getRecoveryAction(authError, contextWithFallbacks)).toBe('fallback');

    const contextLengthError = new ExtendedAdapterError(
      'CONTEXT_LENGTH_EXCEEDED',
      'openai',
      'Context too long',
      { retryable: true, severity: 'medium' }
    );

    expect(getRecoveryAction(contextLengthError, contextWithFallbacks)).toBe('truncate');
  });

  it('should calculate retry delays correctly', () => {
    const error = new ExtendedAdapterError(
      'RATE_LIMITED',
      'openai',
      'Rate limit exceeded',
      { retryable: true, retryAfterMs: 5000 }
    );

    // Should use provider-specified delay
    expect(calculateRetryDelay(error, 1)).toBe(5000);

    const genericError = new ExtendedAdapterError(
      'NETWORK_ERROR',
      'openai',
      'Network error',
      { retryable: true }
    );

    // Should use exponential backoff
    const delay1 = calculateRetryDelay(genericError, 1);
    const delay2 = calculateRetryDelay(genericError, 2);
    
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay2).toBeGreaterThan(delay1);
  });
});

// =============================================================================
// RETRY LOGIC TESTS
// =============================================================================

describe('Retry Logic', () => {
  let mockOperation: vi.Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    mockOperation = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed on first attempt when operation succeeds', async () => {
    mockOperation.mockResolvedValue('success');
    
    const executor = createRetryExecutor('openai');
    const result = await executor.execute(mockOperation, 'test-operation');

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.context.attempt).toBe(1);
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const retryableError = new ExtendedAdapterError(
      'RATE_LIMITED',
      'openai',
      'Rate limit exceeded',
      { retryable: true }
    );

    mockOperation
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('success');

    const executor = createRetryExecutor('openai');
    
    // Start the execution
    const resultPromise = executor.execute(mockOperation, 'test-operation');
    
    // Advance timers to allow retries
    await vi.advanceTimersByTimeAsync(10000);
    
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.value).toBe('success');
    expect(result.context.attempt).toBe(3);
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const nonRetryableError = new ExtendedAdapterError(
      'AUTH_FAILED',
      'openai',
      'Invalid API key',
      { retryable: false }
    );

    mockOperation.mockRejectedValue(nonRetryableError);

    const executor = createRetryExecutor('openai');
    const result = await executor.execute(mockOperation, 'test-operation');

    expect(result.success).toBe(false);
    expect(result.error).toBe(nonRetryableError);
    expect(result.context.attempt).toBe(1);
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should respect max retry attempts', async () => {
    const retryableError = new ExtendedAdapterError(
      'NETWORK_ERROR',
      'openai',
      'Network error',
      { retryable: true }
    );

    mockOperation.mockRejectedValue(retryableError);

    const customConfig: Partial<RetryConfig> = { maxRetries: 2 };
    const executor = createRetryExecutor('openai', customConfig);
    
    const resultPromise = executor.execute(mockOperation, 'test-operation');
    await vi.advanceTimersByTimeAsync(30000);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.context.attempt).toBe(3); // 1 initial + 2 retries
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff by default', async () => {
    const retryableError = new ExtendedAdapterError(
      'RATE_LIMITED',
      'openai',
      'Rate limit exceeded',
      { retryable: true }
    );

    mockOperation.mockRejectedValue(retryableError);

    const executor = createRetryExecutor('openai');
    const startTime = Date.now();
    
    const resultPromise = executor.execute(mockOperation, 'test-operation');
    
    // Advance time to trigger retries
    await vi.advanceTimersByTimeAsync(10000);
    
    await resultPromise;

    // Should have made multiple attempts with increasing delays
    expect(mockOperation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('should work with withRetry utility function', async () => {
    mockOperation.mockResolvedValue('success');

    const result = await withRetry('openai', mockOperation, 'test-operation');

    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// CIRCUIT BREAKER TESTS
// =============================================================================

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: vi.Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    const config: Partial<CircuitBreakerConfig> = {
      failureThreshold: 3,
      successThreshold: 2,
      timeWindowMs: 60000,
      openTimeoutMs: 30000,
    };
    circuitBreaker = new CircuitBreaker('openai', config);
    mockOperation = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start in closed state', () => {
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.canExecute()).toBe(true);
  });

  it('should allow operations in closed state', async () => {
    mockOperation.mockResolvedValue('success');

    const result = await circuitBreaker.execute(mockOperation, 'test-operation');

    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should open circuit after failure threshold', async () => {
    const error = new ExtendedAdapterError(
      'NETWORK_ERROR',
      'openai',
      'Network error',
      { retryable: true }
    );

    mockOperation.mockRejectedValue(error);

    // Trigger failures to open circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(mockOperation, 'test-operation');
      } catch (e) {
        // Expected to fail
      }
    }

    expect(circuitBreaker.getState()).toBe('OPEN');
    expect(circuitBreaker.canExecute()).toBe(false);
  });

  it('should block requests when circuit is open', async () => {
    // Force circuit to open state
    circuitBreaker.forceState('OPEN');

    await expect(
      circuitBreaker.execute(mockOperation, 'test-operation')
    ).rejects.toThrow('Circuit breaker is OPEN');

    expect(mockOperation).not.toHaveBeenCalled();
  });

  it('should transition to half-open after timeout', async () => {
    // Force circuit to open state
    circuitBreaker.forceState('OPEN');
    expect(circuitBreaker.getState()).toBe('OPEN');

    // Advance time past open timeout
    vi.advanceTimersByTime(35000);

    expect(circuitBreaker.canExecute()).toBe(true);
    
    // First execution should transition to half-open
    mockOperation.mockResolvedValue('success');
    await circuitBreaker.execute(mockOperation, 'test-operation');
    
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');
  });

  it('should close circuit after successful operations in half-open', async () => {
    circuitBreaker.forceState('HALF_OPEN');
    mockOperation.mockResolvedValue('success');

    // Execute successful operations to close circuit
    await circuitBreaker.execute(mockOperation, 'test-operation');
    await circuitBreaker.execute(mockOperation, 'test-operation');

    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should reopen circuit on failure in half-open state', async () => {
    circuitBreaker.forceState('HALF_OPEN');
    
    const error = new ExtendedAdapterError(
      'NETWORK_ERROR',
      'openai',
      'Network error',
      { retryable: true }
    );
    mockOperation.mockRejectedValue(error);

    try {
      await circuitBreaker.execute(mockOperation, 'test-operation');
    } catch (e) {
      // Expected to fail
    }

    expect(circuitBreaker.getState()).toBe('OPEN');
  });

  it('should track metrics correctly', async () => {
    mockOperation.mockResolvedValue('success');

    await circuitBreaker.execute(mockOperation, 'test-operation');
    await circuitBreaker.execute(mockOperation, 'test-operation');

    const metrics = circuitBreaker.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.successCount).toBe(2);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.failureRate).toBe(0);
  });

  it('should reset circuit breaker state', () => {
    circuitBreaker.forceState('OPEN');
    expect(circuitBreaker.getState()).toBe('OPEN');

    circuitBreaker.reset();
    expect(circuitBreaker.getState()).toBe('CLOSED');

    const metrics = circuitBreaker.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.successCount).toBe(0);
    expect(metrics.failureCount).toBe(0);
  });
});

// =============================================================================
// CIRCUIT BREAKER MANAGER TESTS
// =============================================================================

describe('Circuit Breaker Manager', () => {
  let manager: CircuitBreakerManager;
  let mockOperation: vi.Mock;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
    mockOperation = vi.fn();
  });

  it('should create circuit breakers for different providers', () => {
    const openaiBreaker = manager.getCircuitBreaker('openai');
    const anthropicBreaker = manager.getCircuitBreaker('anthropic');

    expect(openaiBreaker).toBeDefined();
    expect(anthropicBreaker).toBeDefined();
    expect(openaiBreaker).not.toBe(anthropicBreaker);
  });

  it('should reuse circuit breakers for same provider', () => {
    const breaker1 = manager.getCircuitBreaker('openai');
    const breaker2 = manager.getCircuitBreaker('openai');

    expect(breaker1).toBe(breaker2);
  });

  it('should execute operations through circuit breakers', async () => {
    mockOperation.mockResolvedValue('success');

    const result = await manager.execute('openai', mockOperation, 'test-operation');

    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should get all circuit breaker states', async () => {
    // Create circuit breakers by executing operations
    mockOperation.mockResolvedValue('success');
    await manager.execute('openai', mockOperation, 'test-operation');
    await manager.execute('anthropic', mockOperation, 'test-operation');

    const states = manager.getAllStates();
    expect(states.openai).toBe('CLOSED');
    expect(states.anthropic).toBe('CLOSED');
  });

  it('should reset all circuit breakers', async () => {
    // Create and modify circuit breakers
    const openaiBreaker = manager.getCircuitBreaker('openai');
    openaiBreaker.forceState('OPEN');

    manager.resetAll();

    expect(openaiBreaker.getState()).toBe('CLOSED');
  });

  it('should work with withCircuitBreaker utility', async () => {
    mockOperation.mockResolvedValue('success');

    const result = await withCircuitBreaker('openai', mockOperation, 'test-operation');

    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// ERROR LOGGING TESTS
// =============================================================================

describe('Error Logging', () => {
  let consoleSpy: vi.SpyInstance;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log errors with appropriate severity levels', () => {
    const criticalError = new ExtendedAdapterError(
      'AUTH_FAILED',
      'openai',
      'Critical error',
      { severity: 'critical' }
    );

    logError(criticalError);

    // Should log as error for critical severity
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should create error summaries', () => {
    const error = new ExtendedAdapterError(
      'RATE_LIMITED',
      'openai',
      'Rate limit exceeded',
      { 
        severity: 'medium',
        recoveryStrategy: 'retry',
        context: { requestId: '123' }
      }
    );

    const summary = createErrorSummary(error);

    expect(summary).toMatchObject({
      provider: 'openai',
      code: 'RATE_LIMITED',
      severity: 'medium',
      recoveryStrategy: 'retry',
      message: '[openai] Rate limit exceeded', // Message includes provider prefix
      context: { requestId: '123' },
    });
    expect(summary.timestamp).toBeDefined();
  });
});

// =============================================================================
// CONFIGURATION TESTS
// =============================================================================

describe('Configuration', () => {
  it('should provide default retry configurations', () => {
    const openaiConfig = getDefaultRetryConfig('openai');
    
    expect(openaiConfig.maxRetries).toBeGreaterThan(0);
    expect(openaiConfig.baseDelayMs).toBeGreaterThan(0);
    expect(openaiConfig.strategy).toBeDefined();
    expect(openaiConfig.retryableErrors.size).toBeGreaterThan(0);
  });

  it('should provide default circuit breaker configurations', () => {
    const openaiConfig = getDefaultCircuitBreakerConfig('openai');
    
    expect(openaiConfig.failureThreshold).toBeGreaterThan(0);
    expect(openaiConfig.successThreshold).toBeGreaterThan(0);
    expect(openaiConfig.timeWindowMs).toBeGreaterThan(0);
    expect(openaiConfig.openTimeoutMs).toBeGreaterThan(0);
  });

  it('should have different configurations for different providers', () => {
    const openaiRetryConfig = getDefaultRetryConfig('openai');
    const ollamaRetryConfig = getDefaultRetryConfig('ollama');
    
    // Ollama should have more conservative settings
    expect(ollamaRetryConfig.maxRetries).toBeLessThanOrEqual(openaiRetryConfig.maxRetries);
    
    const openaiCircuitConfig = getDefaultCircuitBreakerConfig('openai');
    const ollamaCircuitConfig = getDefaultCircuitBreakerConfig('ollama');
    
    // Ollama should have lower thresholds
    expect(ollamaCircuitConfig.failureThreshold).toBeLessThanOrEqual(openaiCircuitConfig.failureThreshold);
  });
});