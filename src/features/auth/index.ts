/**
 * @fileoverview OAuth Authentication feature exports
 * @module features/auth
 */

// Core OAuth manager
export { OAuthManager } from './oauth-manager.js';

// Authentication manager for priority and fallback
export { 
  AuthenticationManager, 
  createAuthenticationManager,
  type AuthConfig,
  type AuthResult,
  type ProviderAuthStatus,
  type AuthMethod,
} from './authentication-manager.js';

// Token store
export { TokenStore, createTokenStore } from './token-store.js';

// PKCE generator
export { PKCEGenerator, createPKCEGenerator } from './pkce-generator.js';

// Callback server
export { CallbackServer, createCallbackServer } from './callback-server.js';

// Browser launcher
export { BrowserLauncher, createBrowserLauncher } from './browser-launcher.js';

// OAuth provider adapters
export {
  GoogleOAuthAdapter,
  createGoogleOAuthAdapter,
  OpenRouterOAuthAdapter,
  createOpenRouterOAuthAdapter,
  AnthropicOAuthAdapter,
  createAnthropicOAuthAdapter,
  OpenAIOAuthAdapter,
  createOpenAIOAuthAdapter,
  createOAuthAdapter,
  isOAuthSupported,
  getSupportedOAuthProviders,
  getPlaceholderOAuthProviders,
} from './providers/index.js';

// Types and interfaces
export type {
  IOAuthManager,
  ITokenStore,
  IPKCEGenerator,
  ICallbackServer,
  IBrowserLauncher,
  IOAuthProviderAdapter,
  OAuthConfig,
  TokenSet,
  OAuthResult,
  AuthStatus,
  CallbackResult,
  OAuthError,
  OAuthProviderSettings,
  ExtendedProviderConfig,
} from './types.js';

// Schemas
export {
  OAuthConfigSchema,
  TokenSetSchema,
  OAuthResultSchema,
  AuthStatusSchema,
  CallbackResultSchema,
  OAuthErrorSchema,
  OAuthProviderSettingsSchema,
  ExtendedProviderConfigSchema,
} from './types.js';