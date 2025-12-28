/**
 * @fileoverview OAuth Error Recovery Manager
 * @module features/auth/error-recovery
 */

import type { ModelProvider } from '../../shared/types/models.js';
import type { IOAuthManager, ITokenStore, OAuthError } from './types.js';
// =============================================================================
// TYPES
// =============================================================================

/**
 * Recovery strategy types.
 */
export type RecoveryStrategy = 
  | 'retry'
  | 'refresh_tokens'
  | 'clear_and_restart'
  | 'fallback_to_api_key'
  | 'user_intervention'
  | 'no_recovery';

/**
 * Recovery action result.
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  
  /** Strategy that was used */
  strategy: RecoveryStrategy;
  
  /** Human-readable message about the recovery attempt */
  message: string;
  
  /** Whether user intervention is required */
  requiresUserIntervention: boolean;
  
  /** Suggested user actions */
  userActions?: string[];
  
  /** Error details if recovery failed */
  error?: string;
}

/**
 * Recovery context information.
 */
export interface RecoveryContext {
  /** Provider that encountered the error */
  provider: ModelProvider;
  
  /** Original operation that failed */
  operation: string;
  
  /** Number of previous recovery attempts */
  attemptCount: number;
  
  /** Whether API key fallback is available */
  hasApiKeyFallback: boolean;
  
  /** Whether this is a critical operation */
  isCritical: boolean;
}

// =============================================================================
// ERROR RECOVERY MANAGER
// =============================================================================

/**
 * Manages error recovery strategies for OAuth operations.
 */
export class OAuthErrorRecoveryManager {
  private readonly oauthManager: IOAuthManager;
  private readonly tokenStore: ITokenStore;
  private readonly recoveryAttempts = new Map<string, number>();
  private readonly maxRetryAttempts = 3;
  private readonly retryDelayMs = 1000;

  constructor(oauthManager: IOAuthManager, _tokenStore: ITokenStore) {
    this.oauthManager = oauthManager;
    this.tokenStore = tokenStore;
  }

  // =============================================================================
  // ERROR ANALYSIS
  // =============================================================================

  /**
   * Analyze an error and determine the best recovery strategy.
   */
  analyzeError(error: any, context: RecoveryContext): RecoveryStrategy {
    const errorType = this.classifyError(error);
    const attemptKey = `${context.provider}-${context.operation}`;
    const attempts = this.recoveryAttempts.get(attemptKey) || 0;

    logger.debug(`[ErrorRecovery] Analyzing error for ${context.provider}:`, {
      errorType,
      attempts,
      operation: context.operation,
      hasApiKeyFallback: context.hasApiKeyFallback,
    });

    // Check if we've exceeded retry limits
    if (attempts >= this.maxRetryAttempts) {
      if (context.hasApiKeyFallback) {
        return 'fallback_to_api_key';
      }
      return 'user_intervention';
    }

    // Determine strategy based on error type
    switch (errorType) {
      case 'network_error':
      case 'timeout_error':
        return attempts < 2 ? 'retry' : 'user_intervention';

      case 'token_expired':
      case 'token_invalid':
        return 'refresh_tokens';

      case 'refresh_token_expired':
      case 'refresh_token_invalid':
        return 'clear_and_restart';

      case 'access_denied':
      case 'authorization_error':
        return 'clear_and_restart';

      case 'configuration_error':
      case 'unsupported_provider':
        return 'no_recovery';

      case 'rate_limit_exceeded':
        return 'retry'; // With exponential backoff

      case 'server_error':
        return attempts < 2 ? 'retry' : 'user_intervention';

      default:
        // Unknown error - try fallback if available, otherwise user intervention
        return context.hasApiKeyFallback ? 'fallback_to_api_key' : 'user_intervention';
    }
  }

  /**
   * Classify error type for recovery strategy selection.
   */
  private classifyError(error: any): string {
    if (!error) {
    return 'unknown_error';
  }

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    const errorType = error.error?.toLowerCase() || '';

    // Network and connectivity errors
    if (code.includes('enotfound') || code.includes('econnrefused') ||
        code.includes('etimedout') || message.includes('network') ||
        message.includes('connection')) {
      return 'network_error';
    }

    // Timeout errors
    if (code === 'timeout' || message.includes('timeout') ||
        message.includes('timed out')) {
      return 'timeout_error';
    }

    // OAuth-specific errors
    if (errorType === 'invalid_grant' || message.includes('invalid_grant')) {
      return 'token_invalid';
    }

    if (errorType === 'access_denied' || message.includes('access_denied')) {
      return 'access_denied';
    }

    if (message.includes('expired') || (message.includes('token') && message.includes('invalid'))) {
      return 'token_expired';
    }

    if (message.includes('refresh') && (message.includes('expired') || message.includes('invalid'))) {
      return 'refresh_token_expired';
    }

    // Configuration errors
    if (errorType === 'invalid_client' || message.includes('client_id') ||
        message.includes('configuration') || message.includes('not supported')) {
      return 'configuration_error';
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests') ||
        code === '429') {
      return 'rate_limit_exceeded';
    }

    // Server errors
    if (code.startsWith('5') || message.includes('server error') ||
        message.includes('internal error')) {
      return 'server_error';
    }

    return 'unknown_error';
  }

  // =============================================================================
  // RECOVERY EXECUTION
  // =============================================================================

  /**
   * Execute recovery strategy for an OAuth error.
   */
  async executeRecovery(
    error: any, context: RecoveryContext
  ): Promise<RecoveryResult> {
    const strategy = this.analyzeError(error, context);
    const attemptKey = `${context.provider}-${context.operation}`;
    
    // Increment attempt count
    const currentAttempts = this.recoveryAttempts.get(attemptKey) || 0;
    this.recoveryAttempts.set(attemptKey, currentAttempts + 1);

    logger.info(`[ErrorRecovery] Executing recovery strategy '${strategy}' for ${context.provider} (attempt ${currentAttempts + 1})`);

    try {
      switch (strategy) {
        case 'retry':
          return await this.executeRetryStrategy(context);

        case 'refresh_tokens':
          return await this.executeRefreshStrategy(context);

        case 'clear_and_restart':
          return await this.executeClearAndRestartStrategy(context);

        case 'fallback_to_api_key':
          return await this.executeFallbackStrategy(context);

        case 'user_intervention':
          return this.executeUserInterventionStrategy(error, context);

        case 'no_recovery':
          return this.executeNoRecoveryStrategy(error, context);

        default:
          return {
            success: false,
            strategy,
            message: `Unknown recovery strategy: ${strategy}`,
            _requiresUserIntervention: true,
            error: `Unsupported recovery strategy: ${strategy}`,
          };
      }
    } catch (recoveryError) {
      logger.error(`[ErrorRecovery] Recovery strategy '${strategy}' failed:`, recoveryError);
      
      return {
        success: false,
        strategy,
        message: `Recovery attempt failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`,
        _requiresUserIntervention: true,
        error: recoveryError instanceof Error ? recoveryError.message : 'Recovery failed',
      };
    }
  }

  /**
   * Execute retry strategy with exponential backoff.
   */
  private async executeRetryStrategy(context: RecoveryContext): Promise<RecoveryResult> {
    const attemptKey = `${context.provider}-${context.operation}`;
    const attempts = this.recoveryAttempts.get(attemptKey) || 0;
    const delay = this.retryDelayMs * Math.pow(2, attempts - 1); // Exponential backoff

    logger.debug(`[ErrorRecovery] Retrying ${context.operation} for ${context.provider} after ${delay}ms delay`);

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));

    return {
      success: true,
      strategy: 'retry',
      message: `Retrying ${context.operation} (attempt ${attempts}) after ${delay}ms delay`,
      _requiresUserIntervention: false,
    };
  }

  /**
   * Execute token refresh strategy.
   */
  private async executeRefreshStrategy(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      logger.debug(`[ErrorRecovery] Attempting token refresh for ${context.provider}`);
      
      const tokens = await this.oauthManager.refreshTokens(context.provider);
      
      return {
        success: true,
        strategy: 'refresh_tokens',
        message: `Successfully refreshed OAuth tokens for ${context.provider}`,
        _requiresUserIntervention: false,
      };
    } catch (refreshError) {
      logger.warn(`[ErrorRecovery] Token refresh failed for ${context.provider}:`, refreshError);
      
      // If refresh fails, try clear and restart
      return await this.executeClearAndRestartStrategy(context);
    }
  }

  /**
   * Execute clear and restart strategy.
   */
  private async executeClearAndRestartStrategy(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      logger.debug(`[ErrorRecovery] Clearing tokens and restarting OAuth for ${context.provider}`);
      
      // Clear stored tokens
      await this.tokenStore.clearTokens(context.provider);
      
      return {
        success: true,
        strategy: 'clear_and_restart',
        message: `Cleared OAuth tokens for ${context.provider}. Re-authentication required.`,
        _requiresUserIntervention: true,
        userActions: [
          `Run '/auth login ${context.provider}' to re-authenticate`,
          'Complete the OAuth flow in your browser',
          'Ensure you have the necessary permissions',
        ],
      };
    } catch (clearError) {
      logger.error(`[ErrorRecovery] Failed to clear tokens for ${context.provider}:`, clearError);
      
      return {
        success: false,
        strategy: 'clear_and_restart',
        message: `Failed to clear OAuth tokens for ${context.provider}`,
        _requiresUserIntervention: true,
        error: clearError instanceof Error ? clearError.message : 'Token clearing failed',
        userActions: [
          'Manually revoke access in your provider account settings',
          `Try '/auth logout ${context.provider}' to force cleanup`,
          'Contact support if the issue persists',
        ],
      };
    }
  }

  /**
   * Execute API key fallback strategy.
   */
  private async executeFallbackStrategy(context: RecoveryContext): Promise<RecoveryResult> {
    logger.debug(`[ErrorRecovery] Falling back to API key authentication for ${context.provider}`);
    
    return {
      success: true,
      strategy: 'fallback_to_api_key',
      message: `OAuth failed for ${context.provider}, falling back to API key authentication`,
      _requiresUserIntervention: false,
    };
  }

  /**
   * Execute user intervention strategy.
   */
  private executeUserInterventionStrategy(error: any, context: RecoveryContext): RecoveryResult {
    const errorMessage = error.message || error.toString() || 'Unknown error';
    
    const userActions = [
      `Check your internet connection`,
      `Verify ${context.provider} service status`,
      `Try '/auth logout ${context.provider}' then '/auth login ${context.provider}'`,
      'Check your account permissions and settings',
    ];

    // Add provider-specific actions
    if (context.hasApiKeyFallback) {
      userActions.push(`Consider using API key authentication as an alternative`);
    }

    return {
      success: false,
      strategy: 'user_intervention',
      message: `OAuth ${context.operation} failed for ${context.provider} after multiple attempts. User intervention required.`,
      _requiresUserIntervention: true,
      userActions, error: errorMessage,
    };
  }

  /**
   * Execute no recovery strategy.
   */
  private executeNoRecoveryStrategy(error: any, context: RecoveryContext): RecoveryResult {
    const errorMessage = error.message || error.toString() || 'Unknown error';
    
    return {
      success: false,
      strategy: 'no_recovery',
      message: `OAuth ${context.operation} failed for ${context.provider} due to configuration issues. No automatic recovery available.`,
      _requiresUserIntervention: true,
      userActions: [
        'Check OAuth configuration for this provider',
        'Verify client ID and endpoints are correct',
        'Contact support for configuration assistance',
        'Consider using API key authentication if available',
      ], error: errorMessage,
    };
  }

  // =============================================================================
  // RESOURCE CLEANUP
  // =============================================================================

  /**
   * Clean up resources after failed OAuth flows.
   */
  async cleanupFailedFlow(provider: ModelProvider, _operation: string): Promise<void> {
    logger.debug(`[ErrorRecovery] Cleaning up failed OAuth flow for ${provider}`);
    
    try {
      // Clear any partial tokens or state
      await this.tokenStore.clearTokens(provider);
      
      // Reset recovery attempt count for this operation
      const attemptKey = `${provider}-${operation}`;
      this.recoveryAttempts.delete(attemptKey);
      
      logger.info(`[ErrorRecovery] Cleaned up failed OAuth flow for ${provider}`);
    } catch (error) {
      logger.error(`[ErrorRecovery] Failed to cleanup OAuth flow for ${provider}:`, error);
    }
  }

  /**
   * Reset recovery attempts for a provider.
   */
  resetRecoveryAttempts(provider: ModelProvider, operation?: string): void {
    if (operation) {
      const attemptKey = `${provider}-${operation}`;
      this.recoveryAttempts.delete(attemptKey);
    } else {
      // Reset all attempts for this provider
      const keysToDelete = Array.from(this.recoveryAttempts.keys())
        .filter(key => key.startsWith(`${provider}-`));
      
      keysToDelete.forEach(key => this.recoveryAttempts.delete(key));
    }
    
    logger.debug(`[ErrorRecovery] Reset recovery attempts for ${provider}${operation ? ` (${operation})` : ''}`);
  }

  /**
   * Get recovery statistics for monitoring.
   */
  getRecoveryStats(): {
    totalAttempts: number;
    providerAttempts: Record<string, number>;
    operationAttempts: Record<string, number>;
  } {
    const stats = {
      _totalAttempts: 0,
      providerAttempts: {} as Record<string, number>,
      operationAttempts: {} as Record<string, number>,
    };

    for (const [key, attempts] of this.recoveryAttempts) {
      const [provider, operation] = key.split('-');
      
      stats.totalAttempts += attempts;
      stats.providerAttempts[provider] = (stats.providerAttempts[provider] || 0) + attempts;
      stats.operationAttempts[operation] = (stats.operationAttempts[operation] || 0) + attempts;
    }

    return stats;
  }

  // =============================================================================
  // LIFECYCLE
  // =============================================================================

  /**
   * Cleanup resources.
   */
  destroy(): void {
    this.recoveryAttempts.clear();
    logger.info('[ErrorRecovery] Destroyed');
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new OAuth error recovery manager.
 */
export function createOAuthErrorRecoveryManager(
  _oauthManager: IOAuthManager,
  _tokenStore: ITokenStore
): OAuthErrorRecoveryManager {
  return new OAuthErrorRecoveryManager(oauthManager, tokenStore);
}