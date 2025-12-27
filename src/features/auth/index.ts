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

// Error handling and recovery
export { 
  OAuthErrorRecoveryManager, 
  createOAuthErrorRecoveryManager,
  type RecoveryStrategy,
  type RecoveryResult,
  type RecoveryContext,
} from './error-recovery.js';

// Resource cleanup
export { 
  OAuthResourceCleanupManager, 
  globalResourceCleanupManager,
  createOAuthResourceCleanupManager,
  type CleanupResourceType,
  type CleanupResult,
  type CleanupContext,
  type ManagedResource,
} from './resource-cleanup.js';

// User guidance
export { 
  OAuthUserGuidanceManager, 
  globalUserGuidanceManager,
  createOAuthUserGuidanceManager,
  type GuidanceCategory,
  type GuidanceSeverity,
  type GuidanceItem,
  type ProviderGuidanceConfig,
} from './user-guidance.js';

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