/**
 * @fileoverview OpenRouter OAuth 2.0 adapter implementation
 * @module features/auth/providers/openrouter-oauth
 */

import type { IOAuthProviderAdapter, OAuthConfig, TokenSet } from '../types.js';
import { TokenSetSchema } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';

/**
 * OpenRouter OAuth 2.0 configuration constants.
 */
const OPENROUTER_OAUTH_CONFIG = {
  authorizationEndpoint: 'https://openrouter.ai/auth',
  tokenEndpoint: 'https://openrouter.ai/api/v1/auth/keys',
  scopes: ['api:read'],
  clientId: 'theo-code-cli', // To be registered with OpenRouter
  redirectUri: 'http://localhost:8080/callback',
} as const;

/**
 * OpenRouter OAuth token response interface.
 */
interface OpenRouterTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  api_key?: string; // OpenRouter-specific API key generation
}

/**
 * OpenRouter OAuth error response interface.
 */
interface OpenRouterOAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * OpenRouter OAuth 2.0 adapter with PKCE support.
 * 
 * Implements OAuth 2.0 with PKCE for secure authentication with OpenRouter's
 * API, including custom API key generation functionality.
 */
export class OpenRouterOAuthAdapter implements IOAuthProviderAdapter {
  private readonly provider: ModelProvider = 'openrouter';

  /**
   * Get OAuth configuration for OpenRouter.
   * 
   * @returns OAuth configuration with OpenRouter-specific endpoints and scopes
   */
  getOAuthConfig(): OAuthConfig {
    return {
      provider: this.provider,
      clientId: OPENROUTER_OAUTH_CONFIG.clientId,
      authorizationEndpoint: OPENROUTER_OAUTH_CONFIG.authorizationEndpoint,
      tokenEndpoint: OPENROUTER_OAUTH_CONFIG.tokenEndpoint,
      scopes: [...OPENROUTER_OAUTH_CONFIG.scopes],
      redirectUri: OPENROUTER_OAUTH_CONFIG.redirectUri,
      additionalParams: {
        response_type: 'code',
        code_challenge_method: 'S256',
      },
    };
  }

  /**
   * Exchange authorization code for OAuth tokens.
   * 
   * @param code - Authorization code from OpenRouter
   * @param codeVerifier - PKCE code verifier
   * @returns Promise resolving to token set
   * @throws Error if token exchange fails
   */
  async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenSet> {
    const config = this.getOAuthConfig();
    
    const tokenRequest = {
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: config.redirectUri,
    };

    try {
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams(tokenRequest),
      });

      if (!response.ok) {
        const errorData = await response.json() as OpenRouterOAuthError;
        throw new Error(`OpenRouter OAuth token exchange failed: ${errorData.error_description || errorData.error}`);
      }

      const tokenData = await response.json() as OpenRouterTokenResponse;
      return this.normalizeTokenResponse(tokenData);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to exchange code for tokens: ${error.message}`);
      }
      throw new Error('Failed to exchange code for tokens: Unknown error');
    }
  }

  /**
   * Refresh access token using refresh token.
   * 
   * @param refreshToken - Valid refresh token
   * @returns Promise resolving to new token set
   * @throws Error if token refresh fails
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const config = this.getOAuthConfig();
    
    const refreshRequest = {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    };

    try {
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams(refreshRequest),
      });

      if (!response.ok) {
        const errorData = await response.json() as OpenRouterOAuthError;
        throw new Error(`OpenRouter OAuth token refresh failed: ${errorData.error_description || errorData.error}`);
      }

      const tokenData = await response.json() as OpenRouterTokenResponse;
      
      // OpenRouter may not return a new refresh token, so preserve the original
      const normalizedTokens = this.normalizeTokenResponse(tokenData);
      if (!normalizedTokens.refreshToken) {
        normalizedTokens.refreshToken = refreshToken;
      }
      
      return normalizedTokens;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to refresh access token: ${error.message}`);
      }
      throw new Error('Failed to refresh access token: Unknown error');
    }
  }

  /**
   * Revoke tokens with OpenRouter.
   * 
   * @param tokens - Token set to revoke
   * @returns Promise that resolves when tokens are revoked
   */
  async revokeTokens(tokens: TokenSet): Promise<void> {
    // OpenRouter revocation endpoint (may need to be updated based on actual API)
    const revokeEndpoint = 'https://openrouter.ai/api/v1/auth/revoke';
    
    try {
      // Revoke the refresh token if available, otherwise revoke access token
      const tokenToRevoke = tokens.refreshToken || tokens.accessToken;
      
      const response = await fetch(revokeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${tokens.accessToken}`,
        },
        body: new URLSearchParams({
          token: tokenToRevoke,
          token_type_hint: tokens.refreshToken ? 'refresh_token' : 'access_token',
        }),
      });

      if (!response.ok) {
        // Be lenient with revocation errors - token might already be invalid
        if (response.status !== 400 && response.status !== 401) {
          throw new Error(`OpenRouter OAuth token revocation failed with status: ${response.status}`);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to revoke tokens: ${error.message}`);
      }
      throw new Error('Failed to revoke tokens: Unknown error');
    }
  }

  /**
   * Validate token format and structure.
   * 
   * @param tokens - Token set to validate
   * @returns True if tokens are valid, false otherwise
   */
  validateTokens(tokens: TokenSet): boolean {
    try {
      // Use Zod schema for validation
      TokenSetSchema.parse(tokens);
      
      // Additional OpenRouter-specific validation
      if (!tokens.accessToken || tokens.accessToken.length === 0) {
        return false;
      }
      
      // Check token type
      if (tokens.tokenType !== 'Bearer') {
        return false;
      }
      
      // Check expiration
      if (tokens.expiresAt <= new Date()) {
        return false;
      }
      
      // OpenRouter tokens should have appropriate scope
      if (tokens.scope && !tokens.scope.includes('api:read')) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate API key from OAuth tokens (OpenRouter-specific feature).
   * 
   * @param tokens - Valid OAuth token set
   * @returns Promise resolving to generated API key
   * @throws Error if API key generation fails
   */
  async generateApiKey(tokens: TokenSet): Promise<string> {
    const apiKeyEndpoint = 'https://openrouter.ai/api/v1/auth/key';
    
    try {
      const response = await fetch(apiKeyEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'theo-code-cli-generated',
          scopes: ['api:read'],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API key generation failed with status: ${response.status}`);
      }

      const keyData = await response.json() as { key: string };
      return keyData.key;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate API key: ${error.message}`);
      }
      throw new Error('Failed to generate API key: Unknown error');
    }
  }

  /**
   * Normalize OpenRouter token response to standard TokenSet format.
   * 
   * @param tokenData - Raw token response from OpenRouter
   * @returns Normalized token set
   */
  private normalizeTokenResponse(tokenData: OpenRouterTokenResponse): TokenSet {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt,
      tokenType: 'Bearer',
      scope: tokenData.scope ?? null,
    };
  }
}

/**
 * Create a new OpenRouter OAuth adapter instance.
 * 
 * @returns New OpenRouterOAuthAdapter instance
 */
export function createOpenRouterOAuthAdapter(): OpenRouterOAuthAdapter {
  return new OpenRouterOAuthAdapter();
}