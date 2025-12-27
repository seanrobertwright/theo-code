/**
 * @fileoverview Google OAuth 2.0 adapter implementation
 * @module features/auth/providers/google-oauth
 */

import type { IOAuthProviderAdapter, OAuthConfig, TokenSet } from '../types.js';
import { TokenSetSchema } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';

/**
 * Google OAuth 2.0 configuration constants.
 */
const GOOGLE_OAUTH_CONFIG = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/generative-language.retriever',
    'https://www.googleapis.com/auth/cloud-platform'
  ],
  clientId: 'theo-code-cli.googleusercontent.com', // To be registered with Google
  redirectUri: 'http://localhost:8080/callback',
};

/**
 * Google OAuth token response interface.
 */
interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Google OAuth error response interface.
 */
interface GoogleOAuthError {
  error: string;
  error_description?: string;
}

/**
 * Google OAuth 2.0 adapter for Generative AI API access.
 * 
 * Implements OAuth 2.0 with PKCE for secure authentication with Google's
 * Generative Language API and Cloud Platform services.
 */
export class GoogleOAuthAdapter implements IOAuthProviderAdapter {
  private readonly provider: ModelProvider = 'google';

  /**
   * Get OAuth configuration for Google.
   * 
   * @returns OAuth configuration with Google-specific endpoints and scopes
   */
  getOAuthConfig(): OAuthConfig {
    return {
      provider: this.provider,
      clientId: GOOGLE_OAUTH_CONFIG.clientId,
      authorizationEndpoint: GOOGLE_OAUTH_CONFIG.authorizationEndpoint,
      tokenEndpoint: GOOGLE_OAUTH_CONFIG.tokenEndpoint,
      scopes: GOOGLE_OAUTH_CONFIG.scopes,
      redirectUri: GOOGLE_OAUTH_CONFIG.redirectUri,
      additionalParams: {
        access_type: 'offline', // Required for refresh tokens
        prompt: 'consent', // Force consent screen to get refresh token
      },
    };
  }

  /**
   * Exchange authorization code for OAuth tokens.
   * 
   * @param code - Authorization code from Google
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
        const errorData = await response.json() as GoogleOAuthError;
        throw new Error(`Google OAuth token exchange failed: ${errorData.error_description || errorData.error}`);
      }

      const tokenData = await response.json() as GoogleTokenResponse;
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
        const errorData = await response.json() as GoogleOAuthError;
        throw new Error(`Google OAuth token refresh failed: ${errorData.error_description || errorData.error}`);
      }

      const tokenData = await response.json() as GoogleTokenResponse;
      
      // Google may not return a new refresh token, so preserve the original
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
   * Revoke tokens with Google.
   * 
   * @param tokens - Token set to revoke
   * @returns Promise that resolves when tokens are revoked
   */
  async revokeTokens(tokens: TokenSet): Promise<void> {
    const revokeEndpoint = 'https://oauth2.googleapis.com/revoke';
    
    try {
      // Revoke the refresh token if available, otherwise revoke access token
      const tokenToRevoke = tokens.refreshToken || tokens.accessToken;
      
      const response = await fetch(revokeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: tokenToRevoke,
        }),
      });

      if (!response.ok) {
        // Google returns 200 for successful revocation, but we'll be lenient
        // and not throw for 400 errors (token already revoked/invalid)
        if (response.status !== 400) {
          throw new Error(`Google OAuth token revocation failed with status: ${response.status}`);
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
      
      // Additional Google-specific validation
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
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalize Google token response to standard TokenSet format.
   * 
   * @param tokenData - Raw token response from Google
   * @returns Normalized token set
   */
  private normalizeTokenResponse(tokenData: GoogleTokenResponse): TokenSet {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt,
      tokenType: 'Bearer',
      scope: tokenData.scope || null,
    };
  }
}

/**
 * Create a new Google OAuth adapter instance.
 * 
 * @returns New GoogleOAuthAdapter instance
 */
export function createGoogleOAuthAdapter(): GoogleOAuthAdapter {
  return new GoogleOAuthAdapter();
}