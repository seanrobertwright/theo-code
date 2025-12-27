/**
 * @fileoverview OAuth authentication types and interfaces
 * @module features/auth/types
 */

import { z } from 'zod';
import type { ModelProvider } from '../../shared/types/models.js';

// =============================================================================
// OAUTH CONFIGURATION SCHEMAS
// =============================================================================

/**
 * OAuth provider configuration schema.
 */
export const OAuthConfigSchema = z.object({
  /** Provider name */
  provider: z.string().min(1),
  
  /** OAuth client ID */
  clientId: z.string().min(1),
  
  /** OAuth client secret (optional for PKCE flows) */
  clientSecret: z.string().nullish(),
  
  /** Authorization endpoint URL */
  authorizationEndpoint: z.string().url(),
  
  /** Token exchange endpoint URL */
  tokenEndpoint: z.string().url(),
  
  /** OAuth scopes */
  scopes: z.array(z.string().min(1)).min(1),
  
  /** Redirect URI for OAuth callback */
  redirectUri: z.string().url(),
  
  /** Additional OAuth parameters */
  additionalParams: z.record(z.string()).nullish(),
});
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;

/**
 * OAuth token set schema.
 */
export const TokenSetSchema = z.object({
  /** Access token for API calls */
  accessToken: z.string().min(1),
  
  /** Refresh token for token renewal */
  refreshToken: z.string().nullish(),
  
  /** Token expiration timestamp */
  expiresAt: z.date(),
  
  /** Token type (typically 'Bearer') */
  tokenType: z.literal('Bearer').default('Bearer'),
  
  /** Token scope */
  scope: z.string().nullish(),
});
export type TokenSet = z.infer<typeof TokenSetSchema>;

/**
 * OAuth flow result schema.
 */
export const OAuthResultSchema = z.object({
  /** Whether the OAuth flow was successful */
  success: z.boolean(),
  
  /** OAuth tokens (if successful) */
  tokens: TokenSetSchema.nullish(),
  
  /** Error message (if failed) */
  error: z.string().nullish(),
  
  /** Provider name */
  provider: z.string().min(1),
}).refine(
  (data) => {
    // If success is true, tokens should be present and error should be null/undefined
    if (data.success) {
      return data.tokens != null && data.error == null;
    }
    // If success is false, error should be present and tokens should be null/undefined
    return data.error != null && data.tokens == null;
  },
  {
    message: "Success state must be consistent with tokens and error fields",
  }
);
export type OAuthResult = z.infer<typeof OAuthResultSchema>;

/**
 * Authentication status schema.
 */
export const AuthStatusSchema = z.object({
  /** Provider name */
  provider: z.string().min(1),
  
  /** Whether the provider is authenticated */
  authenticated: z.boolean(),
  
  /** Authentication method used */
  method: z.enum(['oauth', 'api_key', 'none']),
  
  /** Token expiration (if OAuth) */
  expiresAt: z.date().nullish(),
  
  /** Whether tokens need refresh */
  needsRefresh: z.boolean(),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

/**
 * OAuth callback result schema.
 */
export const CallbackResultSchema = z.object({
  /** Authorization code from provider */
  code: z.string().nullish(),
  
  /** State parameter for security */
  state: z.string().nullish(),
  
  /** Error code (if OAuth failed) */
  error: z.string().nullish(),
  
  /** Error description */
  errorDescription: z.string().nullish(),
});
export type CallbackResult = z.infer<typeof CallbackResultSchema>;

/**
 * OAuth error schema.
 */
export const OAuthErrorSchema = z.object({
  /** Error code */
  code: z.string().min(1),
  
  /** Human-readable error message */
  message: z.string().min(1),
  
  /** Provider that generated the error */
  provider: z.string().min(1),
  
  /** Whether the error is recoverable */
  recoverable: z.boolean(),
  
  /** Suggested action for user */
  suggestedAction: z.string().nullish(),
  
  /** Whether fallback authentication is available */
  fallbackAvailable: z.boolean(),
});
export type OAuthError = z.infer<typeof OAuthErrorSchema>;

// =============================================================================
// PROVIDER CONFIGURATION EXTENSIONS
// =============================================================================

/**
 * OAuth provider settings schema.
 */
export const OAuthProviderSettingsSchema = z.object({
  /** Whether OAuth is enabled for this provider */
  enabled: z.boolean().default(false),
  
  /** OAuth client ID */
  clientId: z.string().nullish(),
  
  /** Preferred authentication method */
  preferredMethod: z.enum(['oauth', 'api_key']).default('oauth'),
  
  /** Whether to automatically refresh tokens */
  autoRefresh: z.boolean().default(true),
});
export type OAuthProviderSettings = z.infer<typeof OAuthProviderSettingsSchema>;

/**
 * Extended provider configuration with OAuth support.
 */
export const ExtendedProviderConfigSchema = z.object({
  /** OAuth-specific configuration */
  oauth: OAuthProviderSettingsSchema.nullish(),
});
export type ExtendedProviderConfig = z.infer<typeof ExtendedProviderConfigSchema>;

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * OAuth manager interface for provider-agnostic OAuth operations.
 */
export interface IOAuthManager {
  /**
   * Initiate OAuth flow for a provider.
   */
  initiateFlow(provider: ModelProvider): Promise<OAuthResult>;
  
  /**
   * Handle OAuth callback with authorization code.
   */
  handleCallback(code: string, state: string): Promise<TokenSet>;
  
  /**
   * Refresh expired tokens for a provider.
   */
  refreshTokens(provider: ModelProvider): Promise<TokenSet>;
  
  /**
   * Revoke tokens and clear authentication for a provider.
   */
  revokeTokens(provider: ModelProvider): Promise<void>;
  
  /**
   * Get authentication status for a provider.
   */
  getAuthStatus(provider: ModelProvider): Promise<AuthStatus>;
  
  /**
   * Check if a provider supports OAuth.
   */
  supportsOAuth(provider: ModelProvider): boolean;
}

/**
 * Token store interface for secure token management.
 */
export interface ITokenStore {
  /**
   * Store OAuth tokens securely.
   */
  storeTokens(provider: ModelProvider, tokens: TokenSet): Promise<void>;
  
  /**
   * Retrieve stored tokens.
   */
  getTokens(provider: ModelProvider): Promise<TokenSet | null>;
  
  /**
   * Clear stored tokens.
   */
  clearTokens(provider: ModelProvider): Promise<void>;
  
  /**
   * Check if stored tokens are valid.
   */
  isTokenValid(provider: ModelProvider): Promise<boolean>;
  
  /**
   * Refresh tokens if needed.
   */
  refreshIfNeeded(provider: ModelProvider): Promise<TokenSet | null>;
}

/**
 * OAuth provider adapter interface.
 */
export interface IOAuthProviderAdapter {
  /**
   * Get OAuth configuration for this provider.
   */
  getOAuthConfig(): OAuthConfig;
  
  /**
   * Exchange authorization code for tokens.
   */
  exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenSet>;
  
  /**
   * Refresh access token using refresh token.
   */
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
  
  /**
   * Revoke tokens with the provider.
   */
  revokeTokens(tokens: TokenSet): Promise<void>;
  
  /**
   * Validate token format and structure.
   */
  validateTokens(tokens: TokenSet): boolean;
}

/**
 * PKCE generator interface.
 */
export interface IPKCEGenerator {
  /**
   * Generate cryptographically secure code verifier.
   */
  generateCodeVerifier(): string;
  
  /**
   * Generate code challenge from verifier.
   */
  generateCodeChallenge(verifier: string): string;
  
  /**
   * Validate PKCE code verifier against challenge.
   */
  validateCodeVerifier(verifier: string, challenge: string): boolean;
}

/**
 * OAuth callback server interface.
 */
export interface ICallbackServer {
  /**
   * Start the callback server.
   */
  start(port?: number): Promise<number>;
  
  /**
   * Stop the callback server.
   */
  stop(): Promise<void>;
  
  /**
   * Wait for OAuth callback.
   */
  waitForCallback(): Promise<CallbackResult>;
  
  /**
   * Handle authentication timeout.
   */
  handleTimeout(): void;
  
  /**
   * Check if server is running.
   */
  isRunning(): boolean;
}

/**
 * Browser launcher interface.
 */
export interface IBrowserLauncher {
  /**
   * Launch default browser with URL.
   */
  launchBrowser(url: string): Promise<void>;
  
  /**
   * Check if browser launch is supported.
   */
  isSupported(): boolean;
}