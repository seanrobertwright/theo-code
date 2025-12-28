/**
 * @fileoverview Anthropic OAuth 2.0 adapter placeholder implementation
 * @module features/auth/providers/anthropic-oauth
 */

import type { IOAuthProviderAdapter, OAuthConfig, TokenSet } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';

/**
 * Anthropic OAuth 2.0 configuration constants (placeholder).
 * 
 * Note: Anthropic does not currently support OAuth 2.0 for public clients.
 * This adapter serves as a placeholder for future OAuth support.
 */
const ANTHROPIC_OAUTH_CONFIG = {
  authorizationEndpoint: 'https://console.anthropic.com/oauth/authorize',
  tokenEndpoint: 'https://console.anthropic.com/oauth/token',
  scopes: ['api:read', 'api:write'],
  clientId: 'theo-code-cli', // To be registered with Anthropic when available
  redirectUri: 'http://localhost:8080/callback',
} as const;

/**
 * Anthropic OAuth 2.0 adapter placeholder.
 * 
 * This adapter provides the structure for future OAuth support with Anthropic.
 * Currently, all methods throw errors indicating OAuth is not yet supported,
 * with fallback to API key authentication recommended.
 */
export class AnthropicOAuthAdapter implements IOAuthProviderAdapter {
  private readonly provider: ModelProvider = 'anthropic';

  /**
   * Get OAuth configuration for Anthropic.
   * 
   * @returns OAuth configuration (placeholder for future support)
   */
  getOAuthConfig(): OAuthConfig {
    return {
      provider: this.provider,
      clientId: ANTHROPIC_OAUTH_CONFIG.clientId,
      authorizationEndpoint: ANTHROPIC_OAUTH_CONFIG.authorizationEndpoint,
      tokenEndpoint: ANTHROPIC_OAUTH_CONFIG.tokenEndpoint,
      scopes: [...ANTHROPIC_OAUTH_CONFIG.scopes],
      redirectUri: ANTHROPIC_OAUTH_CONFIG.redirectUri,
      additionalParams: {
        response_type: 'code',
        code_challenge_method: 'S256',
      },
    };
  }

  /**
   * Exchange authorization code for OAuth tokens.
   * 
   * @param _code - Authorization code (unused)
   * @param _codeVerifier - PKCE code verifier (unused)
   * @returns Promise that rejects with not supported error
   * @throws Error indicating OAuth is not yet supported
   */
  async exchangeCodeForTokens(_code: string, _codeVerifier: string): Promise<TokenSet> {
    throw new Error(
      'Anthropic OAuth is not yet supported. Please use API key authentication instead. ' +
      'Visit https://console.anthropic.com/settings/keys to generate an API key.'
    );
  }

  /**
   * Refresh access token using refresh token.
   * 
   * @param _refreshToken - Refresh token (unused)
   * @returns Promise that rejects with not supported error
   * @throws Error indicating OAuth is not yet supported
   */
  async refreshAccessToken(_refreshToken: string): Promise<TokenSet> {
    throw new Error(
      'Anthropic OAuth is not yet supported. Please use API key authentication instead. ' +
      'Visit https://console.anthropic.com/settings/keys to generate an API key.'
    );
  }

  /**
   * Revoke tokens with Anthropic.
   * 
   * @param _tokens - Token set (unused)
   * @returns Promise that rejects with not supported error
   * @throws Error indicating OAuth is not yet supported
   */
  async revokeTokens(_tokens: TokenSet): Promise<void> {
    throw new Error(
      'Anthropic OAuth is not yet supported. No tokens to revoke. ' +
      'If using API keys, you can revoke them at https://console.anthropic.com/settings/keys'
    );
  }

  /**
   * Validate token format and structure.
   * 
   * @param _tokens - Token set (unused)
   * @returns Always false since OAuth is not supported
   */
  validateTokens(_tokens: TokenSet): boolean {
    // Always return false since Anthropic OAuth is not yet supported
    return false;
  }

  /**
   * Check if OAuth is supported for Anthropic.
   * 
   * @returns Always false since OAuth is not yet supported
   */
  isOAuthSupported(): boolean {
    return false;
  }

  /**
   * Get fallback authentication method information.
   * 
   * @returns Information about API key authentication fallback
   */
  getFallbackAuthInfo(): { method: string; instructions: string } {
    return {
      method: 'api_key',
      instructions: 
        'Anthropic OAuth is not yet supported. Please use API key authentication instead.\n' +
        '1. Visit https://console.anthropic.com/settings/keys\n' +
        '2. Generate a new API key\n' +
        '3. Configure it using: /provider configure anthropic --api-key YOUR_KEY'
    };
  }
}

/**
 * Create a new Anthropic OAuth adapter instance.
 * 
 * @returns New AnthropicOAuthAdapter instance
 */
export function createAnthropicOAuthAdapter(): AnthropicOAuthAdapter {
  return new AnthropicOAuthAdapter();
}