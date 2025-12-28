/**
 * @fileoverview Circuit breaker implementation for model adapters
 * @module features/model/circuit-breaker
 *
 * Implements circuit breaker pattern to prevent cascading failures and
 * provide fast failure detection for unhealthy providers.
 */

import type { ModelProvider } from '../../shared/types/models.js';
import { ExtendedAdapterError } from './error-handling.js';
// =============================================================================
// CIRCUIT BREAKER STATES
// =============================================================================

/**
 * Circuit breaker states.
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open the circuit */
  failureThreshold: number;
  /** Success threshold to close the circuit from half-open */
  successThreshold: number;
  /** Time window for failure counting (ms) */
  timeWindowMs: number;
  /** Timeout before transitioning from open to half-open (ms) */
  openTimeoutMs: number;
  /** Maximum number of requests allowed in half-open state */
  halfOpenMaxRequests: number;
  /** Error codes that count as failures */
  failureErrors: Set<string>;
  /** Error codes that should immediately open the circuit */
  criticalErrors: Set<string>;
}

/**
 * Circuit breaker metrics.
 */
export interface CircuitBreakerMetrics {
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successCount: number;
  /** Number of failed requests */
  failureCount: number;
  /** Current failure rate (0-1) */
  failureRate: number;
  /** Time of last failure */
  lastFailureTime: number | null;
  /** Time of last success */
  lastSuccessTime: number | null;
  /** Time when circuit was opened */
  openedTime: number | null;
  /** Number of requests in current time window */
  windowRequests: number;
  /** Number of failures in current time window */
  windowFailures: number;
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

/**
 * Default circuit breaker configurations by provider.
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIGS: Record<ModelProvider, CircuitBreakerConfig> = {
  openai: {
    _failureThreshold: 5,
    _successThreshold: 3,
    _timeWindowMs: 60000, // 1 minute
    _openTimeoutMs: 30000, // 30 seconds
    _halfOpenMaxRequests: 3,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'MODEL_OVERLOADED',
      'SERVICE_UNAVAILABLE',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
      'QUOTA_EXCEEDED',
    ]),
  },
  anthropic: {
    _failureThreshold: 5,
    _successThreshold: 3,
    _timeWindowMs: 60000,
    _openTimeoutMs: 30000,
    _halfOpenMaxRequests: 3,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'MODEL_OVERLOADED',
      'SERVICE_UNAVAILABLE',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
    ]),
  },
  google: {
    _failureThreshold: 5,
    _successThreshold: 3,
    _timeWindowMs: 60000,
    _openTimeoutMs: 30000,
    _halfOpenMaxRequests: 3,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'MODEL_OVERLOADED',
      'SERVICE_UNAVAILABLE',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
    ]),
  },
  openrouter: {
    _failureThreshold: 3,
    _successThreshold: 2,
    _timeWindowMs: 45000,
    _openTimeoutMs: 20000,
    _halfOpenMaxRequests: 2,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'SERVICE_UNAVAILABLE',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
      'INSUFFICIENT_CREDITS',
    ]),
  },
  cohere: {
    _failureThreshold: 4,
    _successThreshold: 3,
    _timeWindowMs: 60000,
    _openTimeoutMs: 25000,
    _halfOpenMaxRequests: 3,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'MODEL_OVERLOADED',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
    ]),
  },
  mistral: {
    _failureThreshold: 4,
    _successThreshold: 3,
    _timeWindowMs: 60000,
    _openTimeoutMs: 25000,
    _halfOpenMaxRequests: 3,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'MODEL_OVERLOADED',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
    ]),
  },
  together: {
    _failureThreshold: 3,
    _successThreshold: 2,
    _timeWindowMs: 45000,
    _openTimeoutMs: 20000,
    _halfOpenMaxRequests: 2,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'SERVICE_UNAVAILABLE',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
    ]),
  },
  perplexity: {
    _failureThreshold: 3,
    _successThreshold: 2,
    _timeWindowMs: 45000,
    _openTimeoutMs: 20000,
    _halfOpenMaxRequests: 2,
    failureErrors: new Set([
      'RATE_LIMITED',
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
    ]),
    criticalErrors: new Set([
      'AUTH_FAILED',
    ]),
  },
  ollama: {
    _failureThreshold: 2,
    _successThreshold: 1,
    _timeWindowMs: 30000,
    _openTimeoutMs: 10000,
    _halfOpenMaxRequests: 1,
    failureErrors: new Set([
      'NETWORK_ERROR',
      'TIMEOUT',
      'API_ERROR',
    ]),
    criticalErrors: new Set([
      'INVALID_MODEL',
    ]),
  },
};

// =============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// =============================================================================

/**
 * Circuit breaker for protecting against cascading failures.
 */
export class CircuitBreaker {
  private readonly provider: ModelProvider;
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState = 'CLOSED';
  private metrics: CircuitBreakerMetrics;
  private halfOpenRequests = 0;
  private halfOpenSuccesses = 0;
  private windowStart = Date.now();

  constructor(provider: ModelProvider, customConfig?: Partial<CircuitBreakerConfig>) {
    this.provider = provider;
    this.config = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIGS[provider],
      ...customConfig,
    };

    this.metrics = {
      _totalRequests: 0,
      _successCount: 0,
      _failureCount: 0,
      _failureRate: 0,
      _lastFailureTime: null,
      _lastSuccessTime: null,
      _openedTime: null,
      _windowRequests: 0,
      _windowFailures: 0,
    };

    logger.debug(`[CircuitBreaker] Initialized for ${provider} with config:`, this.config);
  }

  /**
   * Execute an operation through the circuit breaker.
   */
  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    // Check if circuit allows the request
    if (!this.canExecute()) {
      const error = new ExtendedAdapterError(
        'SERVICE_UNAVAILABLE',
        this.provider,
        `Circuit breaker is ${this.state} for ${this.provider}`,
        {
          _retryable: false,
          severity: 'high',
          recoveryStrategy: 'fallback',
          context: {
            circuitState: this.state,
            metrics: this.getMetrics(),
          },
        }
      );

      logger.warn(`[CircuitBreaker] Request blocked by circuit breaker (${this.state}) for ${this.provider}`);
      throw error;
    }

    const startTime = Date.now();
    
    try {
      logger.debug(`[CircuitBreaker] Executing ${operationName} for ${this.provider} (state: ${this.state})`);
      
      const result = await operation();
      
      this.recordSuccess(Date.now() - startTime);
      logger.debug(`[CircuitBreaker] Operation ${operationName} succeeded for ${this.provider}`);
      
      return result;

    } catch (error) {
      const adaptedError = this.adaptError(error);
      this.recordFailure(adaptedError, Date.now() - startTime);
      
      logger.warn(`[CircuitBreaker] Operation ${operationName} failed for ${this.provider}:`, adaptedError.message);
      throw adaptedError;
    }
  }

  /**
   * Check if the circuit breaker allows execution.
   */
  canExecute(): boolean {
    this.updateTimeWindow();

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if we should transition to half-open
        if (this.shouldTransitionToHalfOpen()) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;

      case 'HALF_OPEN':
        // Allow limited requests in half-open state
        return this.halfOpenRequests < this.config.halfOpenMaxRequests;

      default:
        return false;
    }
  }

  /**
   * Get current circuit breaker state.
   */
  getState(): CircuitBreakerState {
    this.updateTimeWindow();
    return this.state;
  }

  /**
   * Get current metrics.
   */
  getMetrics(): CircuitBreakerMetrics {
    this.updateTimeWindow();
    return { ...this.metrics };
  }

  /**
   * Force the circuit breaker to a specific state.
   */
  forceState(state: CircuitBreakerState): void {
    logger.info(`[CircuitBreaker] Forcing state change from ${this.state} to ${state} for ${this.provider}`);
    
    this.state = state;
    
    if (state === 'OPEN') {
      this.metrics.openedTime = Date.now();
    } else if (state === 'HALF_OPEN') {
      this.halfOpenRequests = 0;
      this.halfOpenSuccesses = 0;
    }
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset(): void {
    logger.info(`[CircuitBreaker] Resetting circuit breaker for ${this.provider}`);
    
    this.state = 'CLOSED';
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
    this.windowStart = Date.now();
    
    this.metrics = {
      _totalRequests: 0,
      _successCount: 0,
      _failureCount: 0,
      _failureRate: 0,
      _lastFailureTime: null,
      _lastSuccessTime: null,
      _openedTime: null,
      _windowRequests: 0,
      _windowFailures: 0,
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Record a successful operation.
   */
  private recordSuccess(responseTimeMs: number): void {
    this.metrics.totalRequests++;
    this.metrics.successCount++;
    this.metrics.lastSuccessTime = Date.now();
    this.metrics.windowRequests++;

    this.updateFailureRate();

    if (this.state === 'HALF_OPEN') {
      this.halfOpenRequests++;
      this.halfOpenSuccesses++;

      // Check if we should close the circuit
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }

    logger.debug(`[CircuitBreaker] Recorded success for ${this.provider} (response time: ${responseTimeMs}ms)`);
  }

  /**
   * Record a failed operation.
   */
  private recordFailure(error: ExtendedAdapterError, responseTimeMs: number): void {
    this.metrics.totalRequests++;
    this.metrics.failureCount++;
    this.metrics.lastFailureTime = Date.now();
    this.metrics.windowRequests++;

    // Only count as window failure if it's a circuit-breaking error
    if (this.isCircuitBreakingError(error)) {
      this.metrics.windowFailures++;
    }

    this.updateFailureRate();

    if (this.state === 'HALF_OPEN') {
      this.halfOpenRequests++;
      // Any failure in half-open state opens the circuit
      this.transitionToOpen();
    } else if (this.state === 'CLOSED') {
      // Check if we should open the circuit
      if (this.shouldTransitionToOpen(error)) {
        this.transitionToOpen();
      }
    }

    logger.debug(`[CircuitBreaker] Recorded failure for ${this.provider} (response time: ${responseTimeMs}ms, error: ${error.code})`);
  }

  /**
   * Check if an error should cause the circuit to break.
   */
  private isCircuitBreakingError(error: ExtendedAdapterError): boolean {
    return this.config.failureErrors.has(error.code) || this.config.criticalErrors.has(error.code);
  }

  /**
   * Check if the circuit should transition to open state.
   */
  private shouldTransitionToOpen(error: ExtendedAdapterError): boolean {
    // Critical errors immediately open the circuit
    if (this.config.criticalErrors.has(error.code)) {
      return true;
    }

    // Check failure threshold
    return this.metrics.windowFailures >= this.config.failureThreshold;
  }

  /**
   * Check if the circuit should transition from open to half-open.
   */
  private shouldTransitionToHalfOpen(): boolean {
    if (!this.metrics.openedTime) {
      return false;
    }

    return Date.now() - this.metrics.openedTime >= this.config.openTimeoutMs;
  }

  /**
   * Transition to closed state.
   */
  private transitionToClosed(): void {
    logger.info(`[CircuitBreaker] Transitioning to CLOSED state for ${this.provider}`);
    
    this.state = 'CLOSED';
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
    this.metrics.openedTime = null;
  }

  /**
   * Transition to open state.
   */
  private transitionToOpen(): void {
    logger.warn(`[CircuitBreaker] Transitioning to OPEN state for ${this.provider} (failures: ${this.metrics.windowFailures}/${this.config.failureThreshold})`);
    
    this.state = 'OPEN';
    this.metrics.openedTime = Date.now();
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
  }

  /**
   * Transition to half-open state.
   */
  private transitionToHalfOpen(): void {
    logger.info(`[CircuitBreaker] Transitioning to HALF_OPEN state for ${this.provider}`);
    
    this.state = 'HALF_OPEN';
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
  }

  /**
   * Update the time window and reset counters if needed.
   */
  private updateTimeWindow(): void {
    const now = Date.now();
    
    if (now - this.windowStart >= this.config.timeWindowMs) {
      // Reset window
      this.windowStart = now;
      this.metrics.windowRequests = 0;
      this.metrics.windowFailures = 0;
      
      logger.debug(`[CircuitBreaker] Reset time window for ${this.provider}`);
    }
  }

  /**
   * Update the failure rate metric.
   */
  private updateFailureRate(): void {
    if (this.metrics.totalRequests === 0) {
      this.metrics.failureRate = 0;
    } else {
      this.metrics.failureRate = this.metrics.failureCount / this.metrics.totalRequests;
    }
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
}

// =============================================================================
// CIRCUIT BREAKER MANAGER
// =============================================================================

/**
 * Manages circuit breakers for multiple providers.
 */
export class CircuitBreakerManager {
  private readonly circuitBreakers = new Map<ModelProvider, CircuitBreaker>();
  private readonly configs = new Map<ModelProvider, CircuitBreakerConfig>();

  /**
   * Get or create a circuit breaker for a provider.
   */
  getCircuitBreaker(provider: ModelProvider, customConfig?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let circuitBreaker = this.circuitBreakers.get(provider);
    
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker(provider, customConfig);
      this.circuitBreakers.set(provider, circuitBreaker);
      
      if (customConfig) {
        this.configs.set(provider, { ...DEFAULT_CIRCUIT_BREAKER_CONFIGS[provider], ...customConfig });
      }
    }
    
    return circuitBreaker;
  }

  /**
   * Execute an operation through the appropriate circuit breaker.
   */
  async execute<T>(
    _provider: ModelProvider,
    operation: () => Promise<T>,
    _operationName: string,
    customConfig?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(provider, customConfig);
    return circuitBreaker.execute(operation, operationName);
  }

  /**
   * Get all circuit breaker states.
   */
  getAllStates(): Record<ModelProvider, CircuitBreakerState> {
    const states: Partial<Record<ModelProvider, CircuitBreakerState>> = {};
    
    for (const [provider, circuitBreaker] of this.circuitBreakers) {
      states[provider] = circuitBreaker.getState();
    }
    
    return states as Record<ModelProvider, CircuitBreakerState>;
  }

  /**
   * Get all circuit breaker metrics.
   */
  getAllMetrics(): Record<ModelProvider, CircuitBreakerMetrics> {
    const metrics: Partial<Record<ModelProvider, CircuitBreakerMetrics>> = {};
    
    for (const [provider, circuitBreaker] of this.circuitBreakers) {
      metrics[provider] = circuitBreaker.getMetrics();
    }
    
    return metrics as Record<ModelProvider, CircuitBreakerMetrics>;
  }

  /**
   * Reset all circuit breakers.
   */
  resetAll(): void {
    logger.info('[CircuitBreakerManager] Resetting all circuit breakers');
    
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
  }

  /**
   * Reset a specific circuit breaker.
   */
  reset(provider: ModelProvider): void {
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (circuitBreaker) {
      circuitBreaker.reset();
    }
  }

  /**
   * Force a specific circuit breaker to a state.
   */
  forceState(provider: ModelProvider, state: CircuitBreakerState): void {
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (circuitBreaker) {
      circuitBreaker.forceState(state);
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Global circuit breaker manager instance.
 */
export const circuitBreakerManager = new CircuitBreakerManager();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Execute an operation with circuit breaker protection.
 */
export async function withCircuitBreaker<T>(
  _provider: ModelProvider,
  operation: () => Promise<T>,
  _operationName: string,
  customConfig?: Partial<CircuitBreakerConfig>
): Promise<T> {
  return circuitBreakerManager.execute(provider, operation, operationName, customConfig);
}

/**
 * Get default circuit breaker configuration for a provider.
 */
export function getDefaultCircuitBreakerConfig(provider: ModelProvider): CircuitBreakerConfig {
  return { ...DEFAULT_CIRCUIT_BREAKER_CONFIGS[provider] };
}