/**
 * @fileoverview OAuth Authentication feature exports
 * @module features/auth
 */

// Core OAuth manager
export { OAuthManager } from './oauth-manager.js';

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