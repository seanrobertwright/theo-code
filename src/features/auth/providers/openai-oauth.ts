/**
 * @fileoverview OpenAI OAuth 2.0 adapter placeholder implementation
 * @module features/auth/providers/openai-oauth
 */

import type { IOAuthProviderAdapter, OAuthConfig, TokenSet } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';

/**
 * OpenAI OAuth 2.0 configuration constants (placeholder).
 * 
 * Note: OpenAI does not currently support OAuth 2.0 for public clients.
 * This adapter serves as a placeholder for future OAuth support.
 */
const OPENAI_OAUTH_CONFIG = {
  authorizationEndpoint: 'https://auth.openai.com/oauth/authorize',
  tokenEndpoint: 'https://auth.openai.com/oauth/token',
  scopes: ['api:read', 'api:write'],
  clientId: 'theo-code-cli', // To be registered with OpenAI when available
  redirectUri: 'http://localhost:8080/callback',
} as const;

/**
 * OpenAI OAuth 2.0 adapter placeholder.
 * 
 * This adapter provides the structure for future OAuth support with OpenAI.
 * Currently, all methods throw errors indicating OAuth is not yet supported,
 * with fallback to API key authentication recommended.
 */
export class OpenAIOAuthAdapter implements IOAuthProviderAdapter {
  private readonly provider: ModelProvider = 'openai';

  /**
   * Get OAuth configuration for OpenAI.
   * 
   * @returns OAuth configuration (placeholder for future support)
   */
  getOAuthConfig(): OAuthConfig {
    return {
      provider: this.provider,
      clientId: OPENAI_OAUTH_CONFIG.clientId,
      authorizationEndpoint: OPENAI_OAUTH_CONFIG.authorizationEndpoint,
      tokenEndpoint: OPENAI_OAUTH_CONFIG.tokenEndpoint,
      scopes: OPENAI_OAUTH_CONFIG.scopes,
      redirectUri: OPENAI_OAUTH_CONFIG.redirectUri,
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
      'OpenAI OAuth is not yet supported. Please use API key authentication instead. ' +
      'Visit https://platform.openai.com/api-keys to generate an API key.'
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
      'OpenAI OAuth is not yet supported. Please use API key authentication instead. ' +
      'Visit https://platform.openai.com/api-keys to generate an API key.'
    );
  }

  /**
   * Revoke tokens with OpenAI.
   * 
   * @param _tokens - Token set (unused)
   * @returns Promise that rejects with not supported error
   * @throws Error indicating OAuth is not yet supported
   */
  async revokeTokens(_tokens: TokenSet): Promise<void> {
    throw new Error(
      'OpenAI OAuth is not yet supported. No tokens to revoke. ' +
      'If using API keys, you can revoke them at https://platform.openai.com/api-keys'
    );
  }

  /**
   * Validate token format and structure.
   * 
   * @param _tokens - Token set (unused)
   * @returns Always false since OAuth is not supported
   */
  validateTokens(_tokens: TokenSet): boolean {
    // Always return false since OpenAI OAuth is not yet supported
    return false;
  }

  /**
   * Check if OAuth is supported for OpenAI.
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
        'OpenAI OAuth is not yet supported. Please use API key authentication instead.\n' +
        '1. Visit https://platform.openai.com/api-keys\n' +
        '2. Generate a new API key\n' +
        '3. Configure it using: /provider configure openai --api-key YOUR_KEY'
    };
  }
}

/**
 * Create a new OpenAI OAuth adapter instance.
 * 
 * @returns New OpenAIOAuthAdapter instance
 */
export function createOpenAIOAuthAdapter(): OpenAIOAuthAdapter {
  return new OpenAIOAuthAdapter();
}