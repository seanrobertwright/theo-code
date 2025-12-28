/**
 * @fileoverview OAuth Manager for orchestrating OAuth flows
 * @module features/auth/oauth-manager
 */

import type { ModelProvider } from '../../shared/types/models.js';
import type {
  IOAuthManager,
  ITokenStore,
  IPKCEGenerator,
  ICallbackServer,
  IBrowserLauncher,
  IOAuthProviderAdapter,
  OAuthResult,
  TokenSet,
  AuthStatus,
  CallbackResult,
  OAuthError,
} from './types.js';
import { logger } from '../../shared/utils/logger.js';

// =============================================================================
// OAUTH MANAGER
// =============================================================================

/**
 * OAuth Manager for orchestrating OAuth flows across multiple providers.
 * 
 * Coordinates PKCE generation, callback server management, browser launching,
 * and token exchange for secure OAuth 2.0 authentication flows.
 */
export class OAuthManager implements IOAuthManager {
  private readonly tokenStore: ITokenStore;
  private readonly pkceGenerator: IPKCEGenerator;
  private readonly callbackServer: ICallbackServer;
  private readonly browserLauncher: IBrowserLauncher;
  private readonly providerAdapters = new Map<ModelProvider, IOAuthProviderAdapter>();
  
  // Active OAuth flow state
  private activeFlow: {
    provider: ModelProvider;
    state: string;
    codeVerifier: string;
    codeChallenge: string;
  } | null = null;

  constructor(
    tokenStore: ITokenStore,
    pkceGenerator: IPKCEGenerator,
    callbackServer: ICallbackServer,
    browserLauncher: IBrowserLauncher
  ) {
    this.tokenStore = tokenStore;
    this.pkceGenerator = pkceGenerator;
    this.callbackServer = callbackServer;
    this.browserLauncher = browserLauncher;
  }

  // =============================================================================
  // PROVIDER REGISTRATION
  // =============================================================================

  /**
   * Register an OAuth provider adapter.
   */
  registerProvider(provider: ModelProvider, adapter: IOAuthProviderAdapter): void {
    this.providerAdapters.set(provider, adapter);
    logger.info(`[OAuthManager] Registered OAuth adapter for provider: ${provider}`);
  }

  /**
   * Unregister an OAuth provider adapter.
   */
  unregisterProvider(provider: ModelProvider): void {
    this.providerAdapters.delete(provider);
    logger.info(`[OAuthManager] Unregistered OAuth adapter for provider: ${provider}`);
  }

  /**
   * Check if a provider supports OAuth.
   */
  supportsOAuth(provider: ModelProvider): boolean {
    return this.providerAdapters.has(provider);
  }

  /**
   * Get all providers that support OAuth.
   */
  getSupportedProviders(): ModelProvider[] {
    return Array.from(this.providerAdapters.keys());
  }

  /**
   * Get OAuth configuration for a provider.
   */
  getProviderOAuthConfig(provider: ModelProvider): any | null {
    const adapter = this.providerAdapters.get(provider);
    return adapter ? adapter.getOAuthConfig() : null;
  }

  // =============================================================================
  // OAUTH FLOW ORCHESTRATION
  // =============================================================================

  /**
   * Initiate OAuth flow for a provider.
   */
  async initiateFlow(provider: ModelProvider): Promise<OAuthResult> {
    try {
      logger.info(`[OAuthManager] Initiating OAuth flow for provider: ${provider}`);

      // Check if provider supports OAuth
      const adapter = this.providerAdapters.get(provider);
      if (!adapter) {
        throw new Error(`OAuth not supported for provider: ${provider}`);
      }

      // Generate PKCE parameters
      const codeVerifier = this.pkceGenerator.generateCodeVerifier();
      const codeChallenge = this.pkceGenerator.generateCodeChallenge(codeVerifier);
      const state = this.generateState();

      // Store flow state
      this.activeFlow = {
        provider,
        state,
        codeVerifier,
        codeChallenge,
      };

      // Start callback server
      const callbackPort = await this.callbackServer.start();
      logger.debug(`[OAuthManager] Callback server started on port: ${callbackPort}`);

      // Build authorization URL
      const oauthConfig = adapter.getOAuthConfig();
      const authUrl = this.buildAuthorizationUrl(oauthConfig, {
        state,
        codeChallenge,
        redirectUri: `http://localhost:${callbackPort}/callback`,
      });

      // Launch browser
      await this.browserLauncher.launchBrowser(authUrl);
      logger.debug(`[OAuthManager] Browser launched with authorization URL`);

      // Wait for callback
      const callbackResult = await this.callbackServer.waitForCallback();
      
      // Process callback
      const tokens = await this.processCallback(callbackResult);

      // Store tokens securely
      await this.tokenStore.storeTokens(provider, tokens);

      // Cleanup
      await this.cleanup();

      logger.info(`[OAuthManager] OAuth flow completed successfully for provider: ${provider}`);
      
      return {
        success: true,
        tokens,
        provider,
      };

    } catch (error) {
      logger.error(`[OAuthManager] OAuth flow failed for provider ${provider}:`, error);
      
      // Cleanup on error
      await this.cleanup();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown OAuth error',
        provider,
      };
    }
  }

  /**
   * Handle OAuth callback with authorization code.
   */
  async handleCallback(code: string, state: string): Promise<TokenSet> {
    if (!this.activeFlow) {
      throw new Error('No active OAuth flow');
    }

    // Validate state parameter to prevent CSRF attacks
    if (!this.validateState(state)) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    const adapter = this.providerAdapters.get(this.activeFlow.provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${this.activeFlow.provider}`);
    }

    logger.debug(`[OAuthManager] Processing callback for provider: ${this.activeFlow.provider}`);

    // Exchange authorization code for tokens
    const tokens = await adapter.exchangeCodeForTokens(code, this.activeFlow.codeVerifier);
    
    // Validate tokens
    if (!adapter.validateTokens(tokens)) {
      throw new Error('Invalid token format received from provider');
    }

    logger.info(`[OAuthManager] Token exchange completed successfully for provider: ${this.activeFlow.provider}`);
    return tokens;
  }

  // =============================================================================
  // AUTOMATIC TOKEN REFRESH
  // =============================================================================

  /**
   * Ensure tokens are valid and refresh if needed.
   * This method should be called before making API calls.
   */
  async ensureValidTokens(provider: ModelProvider): Promise<TokenSet> {
    logger.debug(`[OAuthManager] Ensuring valid tokens for provider: ${provider}`);

    const adapter = this.providerAdapters.get(provider);
    if (!adapter) {
      throw new Error(`OAuth not supported for provider: ${provider}`);
    }

    // Get current tokens
    const currentTokens = await this.tokenStore.getTokens(provider);
    if (!currentTokens) {
      throw new Error(`No tokens available for provider: ${provider}. Please authenticate first.`);
    }

    // Check if tokens are still valid (not expired and not expiring soon)
    const isValid = await this.tokenStore.isTokenValid(provider);
    if (isValid) {
      logger.debug(`[OAuthManager] Tokens are still valid for provider: ${provider}`);
      return currentTokens;
    }

    // Tokens are expired or expiring soon, attempt refresh
    logger.info(`[OAuthManager] Tokens expired or expiring soon for provider: ${provider}, attempting refresh`);
    
    if (!currentTokens.refreshToken) {
      throw new Error(`No refresh token available for provider: ${provider}. Please re-authenticate.`);
    }

    try {
      const refreshedTokens = await this.refreshTokens(provider);
      logger.info(`[OAuthManager] Tokens refreshed successfully for provider: ${provider}`);
      return refreshedTokens;
    } catch (error) {
      logger.error(`[OAuthManager] Token refresh failed for provider ${provider}:`, error);
      
      // Check if this is a refresh token expiration error
      if (this.isRefreshTokenExpiredError(error)) {
        // Clear expired tokens and require re-authentication
        await this.tokenStore.clearTokens(provider);
        throw new Error(`Refresh token expired for provider: ${provider}. Please re-authenticate.`);
      }
      
      // For other errors (temporary failures), preserve tokens and re-throw
      throw new Error(`Token refresh failed for provider: ${provider}. Please try again.`);
    }
  }

  /**
   * Check if tokens need refresh (expired or expiring soon).
   */
  async needsTokenRefresh(provider: ModelProvider): Promise<boolean> {
    try {
      const tokens = await this.tokenStore.getTokens(provider);
      if (!tokens) {
        return false; // No tokens to refresh
      }

      // Check if token is expired or expiring within 5 minutes
      const now = Date.now();
      const expiresAt = tokens.expiresAt.getTime();
      const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      return expiresAt <= now + bufferTime;
    } catch (error) {
      logger.error(`[OAuthManager] Error checking refresh need for provider ${provider}:`, error);
      return true; // Assume refresh needed on error
    }
  }

  /**
   * Get time until token expiration in milliseconds.
   */
  async getTimeUntilExpiration(provider: ModelProvider): Promise<number | null> {
    try {
      const tokens = await this.tokenStore.getTokens(provider);
      if (!tokens) {
        return null;
      }

      return Math.max(0, tokens.expiresAt.getTime() - Date.now());
    } catch (error) {
      logger.error(`[OAuthManager] Error getting expiration time for provider ${provider}:`, error);
      return null;
    }
  }

  // =============================================================================
  // TOKEN MANAGEMENT
  // =============================================================================

  /**
   * Refresh expired tokens for a provider.
   */
  async refreshTokens(provider: ModelProvider): Promise<TokenSet> {
    logger.debug(`[OAuthManager] Refreshing tokens for provider: ${provider}`);

    const adapter = this.providerAdapters.get(provider);
    if (!adapter) {
      throw new Error(`OAuth not supported for provider: ${provider}`);
    }

    const currentTokens = await this.tokenStore.getTokens(provider);
    if (!currentTokens || !currentTokens.refreshToken) {
      throw new Error(`No refresh token available for provider: ${provider}`);
    }

    try {
      // Refresh tokens with provider
      const newTokens = await adapter.refreshAccessToken(currentTokens.refreshToken);
      
      // Validate new tokens
      if (!adapter.validateTokens(newTokens)) {
        throw new Error('Invalid refreshed token format');
      }

      // If no new refresh token provided, preserve the existing one
      if (!newTokens.refreshToken && currentTokens.refreshToken) {
        newTokens.refreshToken = currentTokens.refreshToken;
        logger.debug(`[OAuthManager] Preserved existing refresh token for provider: ${provider}`);
      }

      // Store new tokens
      await this.tokenStore.storeTokens(provider, newTokens);

      logger.info(`[OAuthManager] Tokens refreshed successfully for provider: ${provider}`);
      return newTokens;
    } catch (error) {
      logger.error(`[OAuthManager] Token refresh failed for provider ${provider}:`, error);
      
      // Check if this is a refresh token expiration error
      if (this.isRefreshTokenExpiredError(error)) {
        logger.warn(`[OAuthManager] Refresh token expired for provider: ${provider}`);
        // Clear expired tokens to force re-authentication
        await this.tokenStore.clearTokens(provider);
        throw new Error(`Refresh token expired for provider: ${provider}. Please re-authenticate.`);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Check if an error indicates refresh token expiration.
   */
  private isRefreshTokenExpiredError(error: any): boolean {
    if (!error) {
      return false;
    }
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    
    // Common refresh token expiration indicators
    const expiredIndicators = [
      'refresh_token_expired',
      'invalid_grant',
      'token_expired',
      'refresh token expired',
      'invalid refresh token',
    ];
    
    return expiredIndicators.some(indicator => 
      errorMessage.includes(indicator) || errorCode.includes(indicator)
    );
  }

  /**
   * Revoke tokens and clear authentication for a provider.
   */
  async revokeTokens(provider: ModelProvider): Promise<void> {
    logger.info(`[OAuthManager] Revoking tokens for provider: ${provider}`);

    const adapter = this.providerAdapters.get(provider);
    const tokens = await this.tokenStore.getTokens(provider);

    // Revoke with provider if possible
    if (adapter && tokens) {
      try {
        await adapter.revokeTokens(tokens);
        logger.debug(`[OAuthManager] Tokens revoked with provider: ${provider}`);
      } catch (error) {
        logger.warn(`[OAuthManager] Failed to revoke tokens with provider ${provider}:`, error);
        // Continue with local cleanup even if provider revocation fails
      }
    }

    // Clear local storage
    await this.tokenStore.clearTokens(provider);
    logger.info(`[OAuthManager] Local tokens cleared for provider: ${provider}`);
  }

  /**
   * Get authentication status for a provider.
   */
  async getAuthStatus(provider: ModelProvider): Promise<AuthStatus> {
    const supportsOAuth = this.supportsOAuth(provider);
    
    if (!supportsOAuth) {
      return {
        provider,
        authenticated: false,
        method: 'none',
        needsRefresh: false,
      };
    }

    const tokens = await this.tokenStore.getTokens(provider);
    
    if (!tokens) {
      return {
        provider,
        authenticated: false,
        method: 'oauth',
        needsRefresh: false,
      };
    }

    const isValid = await this.tokenStore.isTokenValid(provider);
    const needsRefresh = tokens.expiresAt.getTime() - Date.now() < 300000; // 5 minutes

    return {
      provider,
      authenticated: isValid,
      method: 'oauth',
      expiresAt: tokens.expiresAt,
      needsRefresh,
    };
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================

  /**
   * Build authorization URL with PKCE parameters.
   */
  private buildAuthorizationUrl(
    config: any,
    params: {
      state: string;
      codeChallenge: string;
      redirectUri: string;
    }
  ): string {
    const url = new URL(config.authorizationEndpoint);
    
    // Standard OAuth parameters
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('state', params.state);
    
    // PKCE parameters
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    
    // Additional provider-specific parameters
    if (config.additionalParams) {
      for (const [key, value] of Object.entries(config.additionalParams)) {
        url.searchParams.set(key, value as string);
      }
    }

    return url.toString();
  }

  /**
   * Generate secure state parameter for OAuth flow.
   * 
   * The state parameter is used to prevent CSRF attacks by ensuring
   * the callback matches the initiated flow.
   */
  private generateState(): string {
    // Generate cryptographically secure random state
    // Use the same secure random generation as PKCE for consistency
    const state = this.pkceGenerator.generateCodeVerifier();
    logger.debug(`[OAuthManager] Generated state parameter: ${state.substring(0, 8)}...`);
    return state;
  }

  /**
   * Validate state parameter against active flow.
   */
  private validateState(receivedState: string): boolean {
    if (!this.activeFlow) {
      logger.warn('[OAuthManager] No active flow to validate state against');
      return false;
    }

    const isValid = receivedState === this.activeFlow.state;
    if (!isValid) {
      logger.error('[OAuthManager] State parameter validation failed - possible CSRF attack');
    }

    return isValid;
  }

  /**
   * Process OAuth callback result.
   */
  private async processCallback(result: CallbackResult): Promise<TokenSet> {
    if (result.error) {
      throw new Error(`OAuth error: ${result.error} - ${result.errorDescription || 'Unknown error'}`);
    }

    if (!result.code || !result.state) {
      throw new Error('Missing authorization code or state in callback');
    }

    return await this.handleCallback(result.code, result.state);
  }

  /**
   * Cleanup OAuth flow resources.
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.callbackServer.isRunning()) {
        await this.callbackServer.stop();
      }
      this.activeFlow = null;
    } catch (error) {
      logger.warn('[OAuthManager] Error during cleanup:', error);
    }
  }

  // =============================================================================
  // LIFECYCLE
  // =============================================================================

  /**
   * Cleanup resources and stop any running services.
   */
  async destroy(): Promise<void> {
    logger.info('[OAuthManager] Destroying OAuth manager');
    
    await this.cleanup();
    this.providerAdapters.clear();
    
    logger.info('[OAuthManager] OAuth manager destroyed');
  }
}