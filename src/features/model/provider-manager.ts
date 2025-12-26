/**
 * @fileoverview Provider Manager for orchestrating multiple AI providers
 * @module features/model/provider-manager
 *
 * Manages provider registration, selection, fallback logic, health monitoring,
 * and rate limiting coordination across multiple AI providers.
 */

import type { ModelConfig, ModelProvider, RateLimitConfig } from '../../shared/types/models.js';
import type { IModelAdapter, AdapterFactory } from './adapters/types.js';
import { AdapterError, adapterFactories, createAdapter } from './adapters/types.js';
import { logger } from '../../shared/utils/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Provider information and status.
 */
export interface ProviderInfo {
  name: ModelProvider;
  enabled: boolean;
  healthy: boolean;
  lastHealthCheck: Date | null;
  rateLimit: RateLimitConfig | null;
  priority: number;
  models: string[];
  features: {
    toolCalling: boolean;
    streaming: boolean;
    multimodal: boolean;
    imageGeneration: boolean;
    reasoning: boolean;
  };
}

/**
 * Provider health status.
 */
export interface ProviderHealth {
  provider: ModelProvider;
  healthy: boolean;
  lastCheck: Date;
  responseTimeMs: number | null;
  error: string | null;
}

/**
 * Rate limiting state for a provider.
 */
interface RateLimitState {
  requestCount: number;
  tokenCount: number;
  windowStart: number;
  concurrentRequests: number;
}

/**
 * Provider manager configuration.
 */
export interface ProviderManagerConfig {
  fallbackChain?: ModelProvider[];
  healthCheckInterval?: number;
  defaultRateLimit?: RateLimitConfig;
  enableHealthChecking?: boolean;
}

// =============================================================================
// PROVIDER MANAGER
// =============================================================================

/**
 * Manages multiple AI providers with fallback, health monitoring, and rate limiting.
 *
 * @example
 * ```typescript
 * const manager = new ProviderManager({
 *   fallbackChain: ['openai', 'anthropic', 'google'],
 *   healthCheckInterval: 300000, // 5 minutes
 * });
 *
 * const adapter = await manager.getAdapter(config);
 * ```
 */
export class ProviderManager {
  private readonly config: ProviderManagerConfig;
  private readonly providerConfigs = new Map<ModelProvider, ModelConfig>();
  private readonly providerHealth = new Map<ModelProvider, ProviderHealth>();
  private readonly rateLimitStates = new Map<ModelProvider, RateLimitState>();
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: ProviderManagerConfig = {}) {
    this.config = {
      fallbackChain: [],
      healthCheckInterval: 300000, // 5 minutes
      enableHealthChecking: true,
      ...config,
    };

    if (this.config.enableHealthChecking && this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      this.startHealthChecking();
    }
  }

  // =============================================================================
  // PROVIDER REGISTRATION
  // =============================================================================

  /**
   * Register a provider configuration.
   */
  registerProvider(config: ModelConfig): void {
    if (!config.enabled) {
      logger.debug(`[ProviderManager] Skipping disabled provider: ${config.provider}`);
      return;
    }

    this.providerConfigs.set(config.provider, config);
    
    // Initialize rate limit state
    if (config.rateLimit) {
      this.rateLimitStates.set(config.provider, {
        requestCount: 0,
        tokenCount: 0,
        windowStart: Date.now(),
        concurrentRequests: 0,
      });
    }

    logger.info(`[ProviderManager] Registered provider: ${config.provider}`);
  }

  /**
   * Unregister a provider.
   */
  unregisterProvider(provider: ModelProvider): void {
    this.providerConfigs.delete(provider);
    this.providerHealth.delete(provider);
    this.rateLimitStates.delete(provider);
    logger.info(`[ProviderManager] Unregistered provider: ${provider}`);
  }

  /**
   * Get all registered providers.
   */
  getAvailableProviders(): ProviderInfo[] {
    const providers: ProviderInfo[] = [];

    for (const [provider, config] of this.providerConfigs) {
      const health = this.providerHealth.get(provider);
      
      providers.push({
        name: provider,
        enabled: config.enabled,
        healthy: health?.healthy ?? true,
        lastHealthCheck: health?.lastCheck ?? null,
        rateLimit: config.rateLimit ?? null,
        priority: config.priority,
        models: [config.model], // TODO: Expand to support multiple models per provider
        features: config.features ?? {
          toolCalling: true,
          streaming: true,
          multimodal: false,
          imageGeneration: false,
          reasoning: false,
        },
      });
    }

    return providers.sort((a, b) => b.priority - a.priority);
  }

  // =============================================================================
  // ADAPTER CREATION
  // =============================================================================

  /**
   * Get an adapter for the specified configuration with fallback support.
   */
  async getAdapter(config: ModelConfig): Promise<IModelAdapter> {
    const providers = this.buildProviderChain(config);
    
    for (const provider of providers) {
      try {
        const providerConfig = this.getProviderConfig(provider, config);
        
        // Check rate limits
        if (!this.checkRateLimit(provider)) {
          logger.warn(`[ProviderManager] Rate limit exceeded for provider: ${provider}`);
          continue;
        }

        // Check health
        if (!this.isProviderHealthy(provider)) {
          logger.warn(`[ProviderManager] Provider unhealthy: ${provider}`);
          continue;
        }

        // Create adapter
        const adapter = createAdapter(providerConfig);
        adapter.validateConfig();

        // Update rate limit state
        this.updateRateLimit(provider, 'request');
        
        logger.info(`[ProviderManager] Created adapter for provider: ${provider}`);
        return adapter;

      } catch (error) {
        logger.error(`[ProviderManager] Failed to create adapter for ${provider}:`, error);
        
        // Update health status on failure
        this.updateProviderHealth(provider, false, error instanceof Error ? error.message : 'Unknown error');
        
        continue;
      }
    }

    throw new AdapterError(
      'INVALID_CONFIG',
      config.provider,
      `No healthy providers available. Tried: ${providers.join(', ')}`
    );
  }

  /**
   * Validate that a provider is properly configured and accessible.
   */
  async validateProvider(provider: ModelProvider): Promise<boolean> {
    const config = this.providerConfigs.get(provider);
    if (!config) {
      return false;
    }

    try {
      const adapter = createAdapter(config);
      adapter.validateConfig();
      
      // TODO: Add actual connectivity test
      // For now, just validate configuration
      
      this.updateProviderHealth(provider, true, null);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateProviderHealth(provider, false, errorMessage);
      return false;
    }
  }

  // =============================================================================
  // FALLBACK LOGIC
  // =============================================================================

  /**
   * Set the fallback provider chain.
   */
  setFallbackChain(providers: ModelProvider[]): void {
    this.config.fallbackChain = providers;
    logger.info(`[ProviderManager] Updated fallback chain: ${providers.join(' -> ')}`);
  }

  /**
   * Build the provider chain for fallback logic.
   */
  private buildProviderChain(config: ModelConfig): ModelProvider[] {
    const chain: ModelProvider[] = [config.provider];
    
    // Add config-specific fallbacks (avoid duplicates)
    if (config.fallbackProviders) {
      for (const provider of config.fallbackProviders) {
        if (!chain.includes(provider)) {
          chain.push(provider);
        }
      }
    }
    
    // Add global fallback chain (avoid duplicates)
    if (this.config.fallbackChain) {
      for (const provider of this.config.fallbackChain) {
        if (!chain.includes(provider)) {
          chain.push(provider);
        }
      }
    }
    
    // Filter to only registered and enabled providers
    return chain.filter(provider => {
      const providerConfig = this.providerConfigs.get(provider);
      return providerConfig && providerConfig.enabled;
    });
  }

  /**
   * Get provider configuration, merging with base config.
   */
  private getProviderConfig(provider: ModelProvider, baseConfig: ModelConfig): ModelConfig {
    const providerConfig = this.providerConfigs.get(provider);
    if (!providerConfig) {
      throw new AdapterError('INVALID_CONFIG', provider, `Provider not registered: ${provider}`);
    }

    return {
      ...baseConfig,
      provider,
      apiKey: providerConfig.apiKey ?? baseConfig.apiKey,
      baseUrl: providerConfig.baseUrl ?? baseConfig.baseUrl,
      rateLimit: providerConfig.rateLimit ?? baseConfig.rateLimit,
      retryConfig: providerConfig.retryConfig ?? baseConfig.retryConfig,
      providerConfig: providerConfig.providerConfig ?? baseConfig.providerConfig,
    };
  }

  // =============================================================================
  // RATE LIMITING
  // =============================================================================

  /**
   * Check if a provider is within rate limits.
   */
  private checkRateLimit(provider: ModelProvider): boolean {
    const config = this.providerConfigs.get(provider);
    const rateLimit = config?.rateLimit ?? this.config.defaultRateLimit;
    
    if (!rateLimit) {
      return true;
    }

    const state = this.rateLimitStates.get(provider);
    if (!state) {
      return true;
    }

    const now = Date.now();
    const windowDuration = 60000; // 1 minute

    // Reset window if needed
    if (now - state.windowStart >= windowDuration) {
      state.requestCount = 0;
      state.tokenCount = 0;
      state.windowStart = now;
    }

    // Check limits
    if (rateLimit.requestsPerMinute && state.requestCount >= rateLimit.requestsPerMinute) {
      return false;
    }

    if (rateLimit.tokensPerMinute && state.tokenCount >= rateLimit.tokensPerMinute) {
      return false;
    }

    if (rateLimit.concurrentRequests && state.concurrentRequests >= rateLimit.concurrentRequests) {
      return false;
    }

    return true;
  }

  /**
   * Update rate limit state.
   */
  private updateRateLimit(provider: ModelProvider, type: 'request' | 'tokens', count = 1): void {
    const state = this.rateLimitStates.get(provider);
    if (!state) {
      return;
    }

    if (type === 'request') {
      state.requestCount += count;
    } else {
      state.tokenCount += count;
    }
  }

  /**
   * Track concurrent request start.
   */
  trackRequestStart(provider: ModelProvider): void {
    const state = this.rateLimitStates.get(provider);
    if (state) {
      state.concurrentRequests++;
    }
  }

  /**
   * Track concurrent request end.
   */
  trackRequestEnd(provider: ModelProvider): void {
    const state = this.rateLimitStates.get(provider);
    if (state && state.concurrentRequests > 0) {
      state.concurrentRequests--;
    }
  }

  // =============================================================================
  // HEALTH MONITORING
  // =============================================================================

  /**
   * Check if a provider is healthy.
   */
  private isProviderHealthy(provider: ModelProvider): boolean {
    const health = this.providerHealth.get(provider);
    return health?.healthy ?? true; // Assume healthy if no health check yet
  }

  /**
   * Update provider health status.
   */
  private updateProviderHealth(provider: ModelProvider, healthy: boolean, error: string | null): void {
    this.providerHealth.set(provider, {
      provider,
      healthy,
      lastCheck: new Date(),
      responseTimeMs: null, // TODO: Track response times
      error,
    });
  }

  /**
   * Start periodic health checking.
   */
  private startHealthChecking(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);

    logger.info(`[ProviderManager] Started health checking every ${this.config.healthCheckInterval}ms`);
  }

  /**
   * Perform health checks on all registered providers.
   */
  private async performHealthChecks(): Promise<void> {
    const providers = Array.from(this.providerConfigs.keys());
    
    logger.debug(`[ProviderManager] Performing health checks for ${providers.length} providers`);
    
    const healthChecks = providers.map(provider => this.validateProvider(provider));
    await Promise.allSettled(healthChecks);
  }

  /**
   * Get health status for all providers.
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  // =============================================================================
  // CLEANUP
  // =============================================================================

  /**
   * Stop health checking and cleanup resources.
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    this.providerConfigs.clear();
    this.providerHealth.clear();
    this.rateLimitStates.clear();
    
    logger.info('[ProviderManager] Destroyed');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Global provider manager instance.
 */
export const providerManager = new ProviderManager();