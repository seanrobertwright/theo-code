/**
 * @fileoverview Authentication Manager for handling OAuth and API key authentication priority and fallback
 * @module features/auth/authentication-manager
 */

import type { ModelProvider } from '../../shared/types/models.js';
import type { IOAuthManager, ITokenStore, TokenSet, AuthStatus } from './types.js';
import { logger } from '../../shared/utils/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Authentication method types.
 */
export type AuthMethod = 'oauth' | 'api_key' | 'none';

/**
 * Authentication configuration for a provider.
 */
export interface AuthConfig {
  /** Preferred authentication method */
  preferredMethod: AuthMethod;
  
  /** Whether OAuth is enabled */
  oauthEnabled: boolean;
  
  /** API key (if using API key authentication) */
  apiKey?: string;
  
  /** Whether to automatically fallback to API key if OAuth fails */
  enableFallback: boolean;
}

/**
 * Authentication result.
 */
export interface AuthResult {
  /** Whether authentication was successful */
  success: boolean;
  
  /** Authentication method used */
  method: AuthMethod;
  
  /** Access token (for OAuth) or API key */
  credential?: string;
  
  /** Error message if authentication failed */
  error?: string;
  
  /** Whether fallback was used */
  usedFallback: boolean;
}

/**
 * Provider authentication status.
 */
export interface ProviderAuthStatus {
  /** Provider name */
  provider: ModelProvider;
  
  /** Current authentication method */
  currentMethod: AuthMethod;
  
  /** Whether currently authenticated */
  authenticated: boolean;
  
  /** OAuth status (if OAuth is supported) */
  oauthStatus?: AuthStatus;
  
  /** Whether API key is available */
  hasApiKey: boolean;
  
  /** Whether fallback is available */
  fallbackAvailable: boolean;
  
  /** Token expiration (if OAuth) */
  expiresAt?: Date;
  
  /** Whether tokens need refresh */
  needsRefresh: boolean;
}

// =============================================================================
// AUTHENTICATION MANAGER
// =============================================================================

/**
 * Manages authentication method priority and fallback logic.
 * 
 * Coordinates between OAuth and API key authentication, implementing
 * priority-based selection and automatic fallback when OAuth fails.
 */
export class AuthenticationManager {
  private readonly oauthManager: IOAuthManager;
  private readonly authConfigs = new Map<ModelProvider, AuthConfig>();
  private readonly currentAuthMethods = new Map<ModelProvider, AuthMethod>();

  constructor(oauthManager: IOAuthManager) {
    this.oauthManager = oauthManager;
  }

  // =============================================================================
  // CONFIGURATION MANAGEMENT
  // =============================================================================

  /**
   * Configure authentication for a provider.
   */
  configureProvider(provider: ModelProvider, config: AuthConfig): void {
    this.authConfigs.set(provider, config);
    logger.info(`[AuthManager] Configured authentication for provider: ${provider}`);
    logger.debug(`[AuthManager] Config for ${provider}:`, {
      preferredMethod: config.preferredMethod,
      oauthEnabled: config.oauthEnabled,
      hasApiKey: !!config.apiKey,
      enableFallback: config.enableFallback,
    });
  }

  /**
   * Get authentication configuration for a provider.
   */
  getProviderConfig(provider: ModelProvider): AuthConfig | null {
    return this.authConfigs.get(provider) || null;
  }

  /**
   * Remove authentication configuration for a provider.
   */
  removeProviderConfig(provider: ModelProvider): void {
    this.authConfigs.delete(provider);
    logger.info(`[AuthManager] Removed authentication config for provider: ${provider}`);
  }

  // =============================================================================
  // AUTHENTICATION ORCHESTRATION
  // =============================================================================

  /**
   * Get authentication credentials for a provider with priority and fallback logic.
   */
  async authenticate(provider: ModelProvider): Promise<AuthResult> {
    logger.debug(`[AuthManager] Authenticating provider: ${provider}`);

    const config = this.authConfigs.get(provider);
    if (!config) {
      logger.warn(`[AuthManager] No authentication config for provider: ${provider}`);
      return {
        success: false,
        method: 'none',
        error: `No authentication configuration for provider: ${provider}`,
        usedFallback: false,
      };
    }

    // Determine authentication method priority
    const methods = this.getAuthMethodPriority(provider, config);
    
    for (const method of methods) {
      try {
        const result = await this.tryAuthMethod(provider, method, config);
        if (result.success) {
          const usedFallback = method !== config.preferredMethod;
          logger.info(`[AuthManager] Authentication successful for ${provider} using ${method}${usedFallback ? ' (fallback)' : ''}`);
          
          // Track the current authentication method
          this.currentAuthMethods.set(provider, method);
          
          return {
            ...result,
            usedFallback,
          };
        }
      } catch (error) {
        logger.warn(`[AuthManager] Authentication method ${method} failed for ${provider}:`, error);
        continue;
      }
    }

    logger.error(`[AuthManager] All authentication methods failed for provider: ${provider}`);
    this.currentAuthMethods.set(provider, 'none');
    return {
      success: false,
      method: 'none',
      error: `All authentication methods failed for provider: ${provider}`,
      usedFallback: false,
    };
  }

  /**
   * Ensure valid authentication credentials, refreshing if needed.
   */
  async ensureValidAuthentication(provider: ModelProvider): Promise<AuthResult> {
    logger.debug(`[AuthManager] Ensuring valid authentication for provider: ${provider}`);

    const config = this.authConfigs.get(provider);
    if (!config) {
      return {
        success: false,
        method: 'none',
        error: `No authentication configuration for provider: ${provider}`,
        usedFallback: false,
      };
    }

    // Check current authentication status
    const status = await this.getProviderAuthStatus(provider);
    
    // If OAuth is current method and needs refresh, try to refresh
    if (status.currentMethod === 'oauth' && status.needsRefresh) {
      try {
        logger.debug(`[AuthManager] Refreshing OAuth tokens for provider: ${provider}`);
        const tokens = await this.oauthManager.ensureValidTokens(provider);
        
        return {
          success: true,
          method: 'oauth',
          credential: tokens.accessToken,
          usedFallback: false,
        };
      } catch (error) {
        logger.warn(`[AuthManager] OAuth token refresh failed for ${provider}:`, error);
        
        // If refresh fails and fallback is enabled, try API key
        if (config.enableFallback && config.apiKey) {
          logger.info(`[AuthManager] Falling back to API key for provider: ${provider}`);
          this.currentAuthMethods.set(provider, 'api_key');
          return {
            success: true,
            method: 'api_key',
            credential: config.apiKey,
            usedFallback: true,
          };
        }
        
        this.currentAuthMethods.set(provider, 'none');
        return {
          success: false,
          method: 'oauth',
          error: `OAuth refresh failed and no fallback available for provider: ${provider}`,
          usedFallback: false,
        };
      }
    }

    // If already authenticated and valid, return current credentials
    if (status.authenticated) {
      let credential: string | undefined;
      
      if (status.currentMethod === 'oauth') {
        try {
          const tokens = await this.oauthManager.ensureValidTokens(provider);
          credential = tokens.accessToken;
        } catch (error) {
          // If OAuth tokens are not available, fall back to API key if enabled
          if (config.enableFallback && config.apiKey) {
            credential = config.apiKey;
            this.currentAuthMethods.set(provider, 'api_key');
            return {
              success: true,
              method: 'api_key',
              credential,
              usedFallback: true,
            };
          }
          throw error;
        }
      } else {
        credential = config.apiKey;
      }
        
      const result: AuthResult = {
        success: true,
        method: status.currentMethod,
        usedFallback: false,
      };
      
      if (credential) {
        result.credential = credential;
      }
      
      return result;
    }

    // Not authenticated, perform full authentication
    return await this.authenticate(provider);
  }

  // =============================================================================
  // AUTHENTICATION STATUS
  // =============================================================================

  /**
   * Get comprehensive authentication status for a provider.
   */
  async getProviderAuthStatus(provider: ModelProvider): Promise<ProviderAuthStatus> {
    const config = this.authConfigs.get(provider);
    const supportsOAuth = this.oauthManager.supportsOAuth(provider);
    
    let oauthStatus: AuthStatus | undefined;
    if (supportsOAuth && config?.oauthEnabled) {
      try {
        oauthStatus = await this.oauthManager.getAuthStatus(provider);
      } catch (error) {
        logger.warn(`[AuthManager] Failed to get OAuth status for ${provider}:`, error);
      }
    }

    // Determine current authentication method based on what's actually being used
    const trackedMethod = this.currentAuthMethods.get(provider) || 'none';
    let currentMethod: AuthMethod = trackedMethod;
    let authenticated = false;
    let needsRefresh = false;

    if (config) {
      if (trackedMethod === 'oauth' && config.oauthEnabled && oauthStatus?.authenticated) {
        currentMethod = 'oauth';
        authenticated = true;
        needsRefresh = oauthStatus.needsRefresh;
      } else if (trackedMethod === 'api_key' && config.apiKey) {
        currentMethod = 'api_key';
        authenticated = true;
      } else if (trackedMethod === 'none') {
        // No current method tracked, determine based on availability and preference
        const methods = this.getAuthMethodPriority(provider, config);
        
              for (const method of methods) {
                if (method === 'oauth' && config.oauthEnabled && oauthStatus) {
                  const hasTokens = !!oauthStatus.expiresAt;
                  if (hasTokens) {
                    currentMethod = 'oauth';
                    authenticated = oauthStatus.authenticated;
                    needsRefresh = oauthStatus.needsRefresh;
                    break;
                  }
                } else if (method === 'api_key' && config.apiKey) {            currentMethod = 'api_key';
            authenticated = true;
            break;
          }
        }
      }
    }

    const result: ProviderAuthStatus = {
      provider,
      currentMethod,
      authenticated,
      hasApiKey: !!config?.apiKey,
      fallbackAvailable: !!(config?.enableFallback && config?.apiKey && supportsOAuth),
      needsRefresh: needsRefresh || false,
    };

    if (oauthStatus) {
      result.oauthStatus = oauthStatus;
    }

    if (oauthStatus?.expiresAt) {
      result.expiresAt = oauthStatus.expiresAt;
    }

    return result;
  }

  /**
   * Get authentication status for all configured providers.
   */
  async getAllProviderAuthStatus(): Promise<ProviderAuthStatus[]> {
    const providers = Array.from(this.authConfigs.keys());
    const statusPromises = providers.map(provider => this.getProviderAuthStatus(provider));
    return await Promise.all(statusPromises);
  }

  // =============================================================================
  // AUTHENTICATION METHODS
  // =============================================================================

  /**
   * Determine authentication method priority based on configuration.
   */
  private getAuthMethodPriority(provider: ModelProvider, config: AuthConfig): AuthMethod[] {
    const methods: AuthMethod[] = [];
    const supportsOAuth = this.oauthManager.supportsOAuth(provider);

    // Add preferred method first
    if (config.preferredMethod === 'oauth' && config.oauthEnabled && supportsOAuth) {
      methods.push('oauth');
    } else if (config.preferredMethod === 'api_key' && config.apiKey) {
      methods.push('api_key');
    }

    // Add fallback methods if enabled
    if (config.enableFallback) {
      if (config.preferredMethod !== 'oauth' && config.oauthEnabled && supportsOAuth) {
        methods.push('oauth');
      }
      if (config.preferredMethod !== 'api_key' && config.apiKey) {
        methods.push('api_key');
      }
    }

    return methods;
  }

  /**
   * Try a specific authentication method.
   */
  private async tryAuthMethod(
    provider: ModelProvider, 
    method: AuthMethod, 
    config: AuthConfig
  ): Promise<AuthResult> {
    switch (method) {
      case 'oauth':
        return await this.tryOAuthAuthentication(provider);
      
      case 'api_key':
        return await this.tryApiKeyAuthentication(provider, config);
      
      default:
        return {
          success: false,
          method: 'none',
          error: `Unsupported authentication method: ${method}`,
          usedFallback: false,
        };
    }
  }

  /**
   * Try OAuth authentication.
   */
  private async tryOAuthAuthentication(provider: ModelProvider): Promise<AuthResult> {
    try {
      // Check if already authenticated
      const status = await this.oauthManager.getAuthStatus(provider);
      if (status.authenticated) {
        const tokens = await this.oauthManager.ensureValidTokens(provider);
        return {
          success: true,
          method: 'oauth',
          credential: tokens.accessToken,
          usedFallback: false,
        };
      }

      // Not authenticated - trigger OAuth flow
      const result = await this.oauthManager.initiateFlow(provider);
      if (result.success && result.tokens) {
        return {
          success: true,
          method: 'oauth',
          credential: result.tokens.accessToken,
          usedFallback: false,
        };
      }

      return {
        success: false,
        method: 'oauth',
        error: result.error || `OAuth authentication failed for provider: ${provider}`,
        usedFallback: false,
      };
    } catch (error) {
      return {
        success: false,
        method: 'oauth',
        error: error instanceof Error ? error.message : 'OAuth authentication failed',
        usedFallback: false,
      };
    }
  }

  /**
   * Try API key authentication.
   */
  private async tryApiKeyAuthentication(provider: ModelProvider, config: AuthConfig): Promise<AuthResult> {
    if (!config.apiKey) {
      return {
        success: false,
        method: 'api_key',
        error: `No API key configured for provider: ${provider}`,
        usedFallback: false,
      };
    }

    // API key authentication is always successful if key is present
    // Actual validation would happen when making API calls
    return {
      success: true,
      method: 'api_key',
      credential: config.apiKey,
      usedFallback: false,
    };
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Check if a provider has any authentication configured.
   */
  hasAuthentication(provider: ModelProvider): boolean {
    const config = this.authConfigs.get(provider);
    if (!config) return false;

    const supportsOAuth = this.oauthManager.supportsOAuth(provider);
    return (config.oauthEnabled && supportsOAuth) || !!config.apiKey;
  }

  /**
   * Get available authentication methods for a provider.
   */
  getAvailableAuthMethods(provider: ModelProvider): AuthMethod[] {
    const config = this.authConfigs.get(provider);
    if (!config) return ['none'];

    const methods: AuthMethod[] = [];
    const supportsOAuth = this.oauthManager.supportsOAuth(provider);

    if (config.oauthEnabled && supportsOAuth) {
      methods.push('oauth');
    }
    if (config.apiKey) {
      methods.push('api_key');
    }
    if (methods.length === 0) {
      methods.push('none');
    }

    return methods;
  }

  /**
   * Clear authentication for a provider.
   */
  async clearAuthentication(provider: ModelProvider): Promise<void> {
    logger.info(`[AuthManager] Clearing authentication for provider: ${provider}`);

    // Revoke OAuth tokens if present
    if (this.oauthManager.supportsOAuth(provider)) {
      try {
        await this.oauthManager.revokeTokens(provider);
      } catch (error) {
        logger.warn(`[AuthManager] Failed to revoke OAuth tokens for ${provider}:`, error);
      }
    }

    // Clear tracked authentication method
    this.currentAuthMethods.delete(provider);

    // Remove from configuration (but keep the config structure)
    const config = this.authConfigs.get(provider);
    if (config) {
      // Clear sensitive data but keep configuration
      delete config.apiKey;
    }
  }

  // =============================================================================
  // LIFECYCLE
  // =============================================================================

  /**
   * Cleanup resources.
   */
  destroy(): void {
    this.authConfigs.clear();
    this.currentAuthMethods.clear();
    logger.info('[AuthManager] Destroyed');
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new authentication manager instance.
 */
export function createAuthenticationManager(oauthManager: IOAuthManager): AuthenticationManager {
  return new AuthenticationManager(oauthManager);
}