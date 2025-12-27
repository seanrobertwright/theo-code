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
import type { AuthenticationManager } from '../auth/authentication-manager.js';
import { loadConfig, getAuthenticationConfig, isOAuthEnabled } from '../../config/index.js';
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
  // OAuth authentication status
  authStatus?: {
    method: 'oauth' | 'api_key' | 'none';
    authenticated: boolean;
    needsRefresh: boolean;
    expiresAt?: Date;
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
  authManager?: AuthenticationManager;
  workspaceRoot?: string; // For OAuth configuration loading
}

// =============================================================================
// PROVIDER MANAGER
// =============================================================================

/**
 * Manages multiple AI providers with fallback, health monitoring, rate limiting, and OAuth authentication.
 *
 * @example
 * ```typescript
 * const manager = new ProviderManager({
 *   fallbackChain: ['openai', 'anthropic', 'google'],
 *   healthCheckInterval: 300000, // 5 minutes
 *   authManager: authenticationManager,
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
  private readonly authManager?: AuthenticationManager;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: ProviderManagerConfig = {}) {
    this.config = {
      fallbackChain: [],
      healthCheckInterval: 300000, // 5 minutes
      enableHealthChecking: true,
      ...config,
    };

    this.authManager = config.authManager;

    if (this.config.enableHealthChecking && this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      this.startHealthChecking();
    }

    // Initialize OAuth configurations from global config if workspace root is provided
    if (config.workspaceRoot && this.authManager) {
      this.initializeOAuthFromConfig(config.workspaceRoot);
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
    
    // Initialize OAuth configuration if available
    if (this.authManager && this.config.workspaceRoot) {
      this.updateProviderOAuthConfig(config.provider, this.config.workspaceRoot);
    }
    
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
  async getAvailableProviders(): Promise<ProviderInfo[]> {
    const providers: ProviderInfo[] = [];

    for (const [provider, config] of this.providerConfigs) {
      const health = this.providerHealth.get(provider);
      
      // Get OAuth authentication status if auth manager is available
      let authStatus;
      if (this.authManager) {
        try {
          const status = await this.authManager.getProviderAuthStatus(provider);
          const config = this.authManager.getProviderConfig(provider);
          authStatus = {
            method: status.currentMethod !== 'none' ? status.currentMethod : (config?.preferredMethod || 'none'),
            authenticated: status.authenticated,
            needsRefresh: status.needsRefresh,
            expiresAt: status.expiresAt,
          };
        } catch (error) {
          logger.warn(`[ProviderManager] Failed to get auth status for ${provider}:`, error);
        }
      }
      
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
        authStatus,
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

        // Enhanced authentication status check with OAuth priority
        if (this.authManager) {
          try {
            const authStatus = await this.authManager.getProviderAuthStatus(provider);
            const supportsOAuth = this.supportsOAuth(provider);
            
            // If no authentication available and no way to authenticate, skip
            if (!authStatus.authenticated && !authStatus.hasApiKey && !supportsOAuth) {
              logger.warn(`[ProviderManager] No authentication method available for provider: ${provider}`);
              continue;
            }
            
            // If OAuth tokens need refresh, try to refresh them
            if (authStatus.needsRefresh && authStatus.currentMethod === 'oauth') {
              try {
                logger.debug(`[ProviderManager] Refreshing OAuth tokens for provider: ${provider}`);
                await this.authManager.ensureValidAuthentication(provider);
              } catch (refreshError) {
                logger.warn(`[ProviderManager] OAuth refresh failed for ${provider}, checking fallback:`, refreshError);
                
                // If refresh fails but API key is available, continue with API key
                if (!authStatus.hasApiKey) {
                  logger.warn(`[ProviderManager] No fallback authentication available for ${provider}`);
                  continue;
                }
              }
            }
            
            // Log authentication method being used
            const finalAuthStatus = await this.authManager.getProviderAuthStatus(provider);
            logger.debug(`[ProviderManager] Using ${finalAuthStatus.currentMethod} authentication for provider: ${provider}`);
            
          } catch (error) {
            logger.warn(`[ProviderManager] Authentication check failed for ${provider}:`, error);
            continue;
          }
        }

        // Create adapter with authentication manager
        const adapter = createAdapter(providerConfig, this.authManager);
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
      // Check authentication if auth manager is available
      if (this.authManager) {
        try {
          const authStatus = await this.authManager.getProviderAuthStatus(provider);
          
          // If OAuth tokens need refresh, try to refresh them
          if (authStatus.needsRefresh && authStatus.currentMethod === 'oauth') {
            try {
              await this.authManager.ensureValidAuthentication(provider);
              logger.debug(`[ProviderManager] OAuth tokens refreshed for provider: ${provider}`);
            } catch (refreshError) {
              logger.warn(`[ProviderManager] OAuth refresh failed for ${provider}:`, refreshError);
              
              // If refresh fails but API key is available, that's still valid
              if (!authStatus.hasApiKey) {
                this.updateProviderHealth(provider, false, 'OAuth refresh failed and no API key fallback');
                return false;
              }
            }
          }
          
          // Check if any authentication is available or possible
          const finalAuthStatus = await this.authManager.getProviderAuthStatus(provider);
          const supportsOAuth = this.supportsOAuth(provider);
          if (!finalAuthStatus.authenticated && !finalAuthStatus.hasApiKey && !supportsOAuth) {
            this.updateProviderHealth(provider, false, 'No authentication available');
            return false;
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Authentication check failed';
          this.updateProviderHealth(provider, false, errorMessage);
          return false;
        }
      }

      // Create adapter with authentication manager to test configuration
      const adapter = createAdapter(config, this.authManager);
      adapter.validateConfig();
      
      // TODO: Add actual connectivity test
      // For now, just validate configuration and authentication
      
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
    
    const healthChecks = providers.map(provider => this.performProviderHealthCheck(provider));
    await Promise.allSettled(healthChecks);
  }

  /**
   * Perform comprehensive health check including OAuth status.
   */
  private async performProviderHealthCheck(provider: ModelProvider): Promise<void> {
    try {
      // Check basic provider validation
      const isValid = await this.validateProvider(provider);
      
      // Check OAuth authentication status if auth manager is available
      if (this.authManager && isValid) {
        try {
          const authStatus = await this.authManager.getProviderAuthStatus(provider);
          
          // If OAuth tokens are expiring soon, try to refresh them
          if (authStatus.needsRefresh && authStatus.currentMethod === 'oauth') {
            logger.info(`[ProviderManager] Refreshing OAuth tokens for provider: ${provider}`);
            await this.authManager.ensureValidAuthentication(provider);
          }
          
          // Update health status based on authentication
          if (!authStatus.authenticated && !authStatus.hasApiKey) {
            this.updateProviderHealth(provider, false, 'No valid authentication available');
            return;
          }
          
          // If we reach here, provider is healthy with valid authentication
          this.updateProviderHealth(provider, true, null);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'OAuth health check failed';
          logger.warn(`[ProviderManager] OAuth health check failed for ${provider}:`, error);
          
          // Don't mark as unhealthy if API key fallback is available
          const config = this.providerConfigs.get(provider);
          if (config?.apiKey) {
            logger.debug(`[ProviderManager] OAuth failed but API key available for ${provider}`);
            this.updateProviderHealth(provider, true, null);
          } else {
            this.updateProviderHealth(provider, false, errorMessage);
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed';
      this.updateProviderHealth(provider, false, errorMessage);
    }
  }

  /**
   * Get health status for all providers.
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  // =============================================================================
  // OAUTH AUTHENTICATION INTEGRATION
  // =============================================================================

  /**
   * Set the authentication manager for OAuth support.
   */
  setAuthenticationManager(authManager: AuthenticationManager): void {
    (this as any).authManager = authManager;
    logger.info('[ProviderManager] Authentication manager configured');
  }

  /**
   * Get the current authentication manager.
   */
  getAuthenticationManager(): AuthenticationManager | undefined {
    return this.authManager;
  }

  /**
   * Get authentication status for all providers.
   */
  async getAuthenticationStatus(): Promise<Array<{
    provider: ModelProvider;
    method: 'oauth' | 'api_key' | 'none';
    authenticated: boolean;
    needsRefresh: boolean;
    expiresAt?: Date;
  }>> {
    if (!this.authManager) {
      return [];
    }

    const providers = Array.from(this.providerConfigs.keys());
    const statusPromises = providers.map(async (provider) => {
      try {
        const status = await this.authManager!.getProviderAuthStatus(provider);
        return {
          provider,
          method: status.currentMethod,
          authenticated: status.authenticated,
          needsRefresh: status.needsRefresh,
          expiresAt: status.expiresAt,
        };
      } catch (error) {
        logger.warn(`[ProviderManager] Failed to get auth status for ${provider}:`, error);
        return {
          provider,
          method: 'none' as const,
          authenticated: false,
          needsRefresh: false,
        };
      }
    });

    return await Promise.all(statusPromises);
  }

  /**
   * Refresh authentication for providers that need it.
   */
  async refreshAuthentication(): Promise<void> {
    if (!this.authManager) {
      logger.warn('[ProviderManager] No authentication manager available for refresh');
      return;
    }

    const providers = Array.from(this.providerConfigs.keys());
    const refreshPromises = providers.map(async (provider) => {
      try {
        const status = await this.authManager!.getProviderAuthStatus(provider);
        if (status.needsRefresh) {
          logger.info(`[ProviderManager] Refreshing authentication for provider: ${provider}`);
          await this.authManager!.ensureValidAuthentication(provider);
        }
      } catch (error) {
        logger.error(`[ProviderManager] Failed to refresh authentication for ${provider}:`, error);
      }
    });

    await Promise.allSettled(refreshPromises);
  }

  /**
   * Check if OAuth is supported for a provider.
   */
  supportsOAuth(provider: ModelProvider): boolean {
    if (!this.authManager) {
      return false;
    }

    const availableMethods = this.authManager.getAvailableAuthMethods(provider);
    return availableMethods.includes('oauth');
  }

  /**
   * Get OAuth support status for all registered providers.
   */
  getOAuthSupportStatus(): Array<{
    provider: ModelProvider;
    supportsOAuth: boolean;
    hasApiKeyFallback: boolean;
    preferredMethod: 'oauth' | 'api_key' | 'none';
  }> {
    if (!this.authManager) {
      return Array.from(this.providerConfigs.keys()).map(provider => ({
        provider,
        supportsOAuth: false,
        hasApiKeyFallback: false,
        preferredMethod: 'none' as const,
      }));
    }

    return Array.from(this.providerConfigs.keys()).map(provider => {
      const availableMethods = this.authManager!.getAvailableAuthMethods(provider);
      const config = this.authManager!.getProviderConfig(provider);
      
      return {
        provider,
        supportsOAuth: availableMethods.includes('oauth'),
        hasApiKeyFallback: availableMethods.includes('api_key'),
        preferredMethod: config?.preferredMethod || 'none',
      };
    });
  }

  // =============================================================================
  // OAUTH CONFIGURATION INTEGRATION
  // =============================================================================

  /**
   * Initialize OAuth configurations from global config.
   */
  initializeOAuthFromConfig(workspaceRoot: string): void {
    if (!this.authManager) {
      logger.warn('[ProviderManager] No authentication manager available for OAuth initialization');
      return;
    }

    try {
      const config = loadConfig(workspaceRoot);
      const providersInConfig = config.global.providers?.providers || [];

      for (const p of providersInConfig) {
        const provider = p.name as ModelProvider;
        const authConfig = getAuthenticationConfig(provider, config);
        
        if (authConfig.hasOAuth || authConfig.hasApiKey) {
          // Configure authentication manager with provider settings
          this.authManager.configureProvider(provider, {
            preferredMethod: authConfig.preferredMethod,
            oauthEnabled: authConfig.oauthEnabled,
            apiKey: authConfig.hasApiKey ? 'configured' : undefined, // Don't expose actual key
            enableFallback: authConfig.hasApiKey && authConfig.hasOAuth, // Enable fallback if both are available
          });

          logger.info(`[ProviderManager] Configured authentication for ${provider}: OAuth=${authConfig.oauthEnabled}, API Key=${authConfig.hasApiKey}, Preferred=${authConfig.preferredMethod}`);
        }
      }
    } catch (error) {
      logger.error('[ProviderManager] Failed to initialize OAuth from config:', error);
    }
  }

  /**
   * Update OAuth configuration for a specific provider.
   */
  updateProviderOAuthConfig(provider: ModelProvider, workspaceRoot: string): void {
    if (!this.authManager) {
      logger.warn(`[ProviderManager] No authentication manager available for ${provider} OAuth update`);
      return;
    }

    try {
      const config = loadConfig(workspaceRoot);
      const authConfig = getAuthenticationConfig(provider, config);
      
      if (authConfig.hasOAuth || authConfig.hasApiKey) {
        this.authManager.configureProvider(provider, {
          preferredMethod: authConfig.preferredMethod,
          oauthEnabled: authConfig.oauthEnabled,
          apiKey: authConfig.hasApiKey ? 'configured' : undefined,
          enableFallback: authConfig.hasApiKey && authConfig.hasOAuth,
        });

        logger.info(`[ProviderManager] Updated authentication config for ${provider}`);
      } else {
        // Remove configuration if no authentication is available
        this.authManager.removeProviderConfig(provider);
        logger.info(`[ProviderManager] Removed authentication config for ${provider} (no auth methods available)`);
      }
    } catch (error) {
      logger.error(`[ProviderManager] Failed to update OAuth config for ${provider}:`, error);
    }
  }

  /**
   * Get OAuth configuration status for all providers.
   */
  getOAuthConfigurationStatus(workspaceRoot: string): Array<{
    provider: ModelProvider;
    oauthEnabled: boolean;
    hasApiKey: boolean;
    preferredMethod: 'oauth' | 'api_key';
    configurationValid: boolean;
  }> {
    try {
      const config = loadConfig(workspaceRoot);
      const providers = Array.from(this.providerConfigs.keys());

      return providers.map(provider => {
        const authConfig = getAuthenticationConfig(provider, config);
        
        return {
          provider,
          oauthEnabled: authConfig.oauthEnabled,
          hasApiKey: authConfig.hasApiKey,
          preferredMethod: authConfig.preferredMethod,
          configurationValid: authConfig.hasApiKey || authConfig.oauthEnabled,
        };
      });
    } catch (error) {
      logger.error('[ProviderManager] Failed to get OAuth configuration status:', error);
      return [];
    }
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
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new provider manager instance.
 */
export function createProviderManager(config?: ProviderManagerConfig): ProviderManager {
  return new ProviderManager(config);
}

/**
 * Create a provider manager with OAuth integration.
 */
export function createProviderManagerWithOAuth(
  authManager: AuthenticationManager,
  workspaceRoot: string,
  config?: Omit<ProviderManagerConfig, 'authManager' | 'workspaceRoot'>
): ProviderManager {
  return new ProviderManager({
    ...config,
    authManager,
    workspaceRoot,
  });
}

/**
 * Global provider manager instance.
 * Note: Use createProviderManager() for instances with authentication manager.
 */
export const providerManager = new ProviderManager();