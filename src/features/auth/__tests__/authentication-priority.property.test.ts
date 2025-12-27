/**
 * @fileoverview Property-based tests for authentication method priority
 * @module features/auth/__tests__/authentication-priority.property.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { AuthenticationManager, type AuthConfig, type AuthMethod } from '../authentication-manager.js';
import { OAuthManager } from '../oauth-manager.js';
import { TokenStore } from '../token-store.js';
import { PKCEGenerator } from '../pkce-generator.js';
import { CallbackServer } from '../callback-server.js';
import { BrowserLauncher } from '../browser-launcher.js';
import type { IOAuthManager, TokenSet, AuthStatus } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock keytar for token storage
vi.mock('keytar', () => ({
  setPassword: vi.fn().mockResolvedValue(undefined),
  getPassword: vi.fn().mockResolvedValue(null),
  deletePassword: vi.fn().mockResolvedValue(true),
  findCredentials: vi.fn().mockResolvedValue([]),
}));

// Mock open for browser launcher
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// MOCK OAUTH MANAGER
// =============================================================================

class MockOAuthManager implements IOAuthManager {
  private supportedProviders = new Set<ModelProvider>(['google', 'openrouter']);
  private authenticatedProviders = new Map<ModelProvider, TokenSet>();
  private shouldFailAuth = false;
  private shouldFailRefresh = false;

  async initiateFlow(provider: ModelProvider) {
    if (this.shouldFailAuth) {
      return {
        success: false,
        error: 'OAuth flow failed',
        provider,
      };
    }

    const tokens: TokenSet = {
      accessToken: `oauth_token_${provider}_${Date.now()}`,
      refreshToken: `refresh_token_${provider}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
      scope: 'api:read',
    };

    this.authenticatedProviders.set(provider, tokens);

    return {
      success: true,
      tokens,
      provider,
    };
  }

  async handleCallback(code: string, state: string): Promise<TokenSet> {
    return {
      accessToken: `callback_token_${code}`,
      refreshToken: `callback_refresh_${code}`,
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
      scope: 'api:read',
    };
  }

  async refreshTokens(provider: ModelProvider): Promise<TokenSet> {
    if (this.shouldFailRefresh) {
      throw new Error('Token refresh failed');
    }

    const newTokens: TokenSet = {
      accessToken: `refreshed_token_${provider}_${Date.now()}`,
      refreshToken: `refreshed_refresh_${provider}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
      scope: 'api:read',
    };

    this.authenticatedProviders.set(provider, newTokens);
    return newTokens;
  }

  async revokeTokens(provider: ModelProvider): Promise<void> {
    this.authenticatedProviders.delete(provider);
  }

  async getAuthStatus(provider: ModelProvider): Promise<AuthStatus> {
    const tokens = this.authenticatedProviders.get(provider);
    
    return {
      provider,
      authenticated: !!tokens,
      method: 'oauth',
      expiresAt: tokens?.expiresAt,
      needsRefresh: tokens ? tokens.expiresAt.getTime() - Date.now() < 300000 : false,
    };
  }

  supportsOAuth(provider: ModelProvider): boolean {
    return this.supportedProviders.has(provider);
  }

  async ensureValidTokens(provider: ModelProvider): Promise<TokenSet> {
    const tokens = this.authenticatedProviders.get(provider);
    if (!tokens) {
      throw new Error(`No tokens available for provider: ${provider}`);
    }

    // Check if needs refresh
    if (tokens.expiresAt.getTime() - Date.now() < 300000) {
      return await this.refreshTokens(provider);
    }

    return tokens;
  }

  async needsTokenRefresh(provider: ModelProvider): Promise<boolean> {
    const tokens = this.authenticatedProviders.get(provider);
    if (!tokens) return false;
    return tokens.expiresAt.getTime() - Date.now() < 300000;
  }

  async getTimeUntilExpiration(provider: ModelProvider): Promise<number | null> {
    const tokens = this.authenticatedProviders.get(provider);
    if (!tokens) return null;
    return Math.max(0, tokens.expiresAt.getTime() - Date.now());
  }

  // Test helpers
  setAuthenticationStatus(provider: ModelProvider, authenticated: boolean) {
    if (authenticated) {
      this.authenticatedProviders.set(provider, {
        accessToken: `mock_token_${provider}`,
        refreshToken: `mock_refresh_${provider}`,
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
        scope: 'api:read',
      });
    } else {
      this.authenticatedProviders.delete(provider);
    }
  }

  setShouldFailAuth(shouldFail: boolean) {
    this.shouldFailAuth = shouldFail;
  }

  setShouldFailRefresh(shouldFail: boolean) {
    this.shouldFailRefresh = shouldFail;
  }

  addSupportedProvider(provider: ModelProvider) {
    this.supportedProviders.add(provider);
  }

  removeSupportedProvider(provider: ModelProvider) {
    this.supportedProviders.delete(provider);
  }
}

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generates OAuth-supported providers.
 */
const oauthProviderArb = fc.constantFrom('google', 'openrouter');

/**
 * Generates all providers (including non-OAuth).
 */
const allProviderArb = fc.constantFrom('google', 'openrouter', 'anthropic', 'openai');

/**
 * Generates authentication methods.
 */
const authMethodArb = fc.constantFrom('oauth', 'api_key', 'none');

/**
 * Generates API keys.
 */
const apiKeyArb = fc.string({ 
  minLength: 20, 
  maxLength: 100,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._'.split(''))
});

/**
 * Generates authentication configurations.
 */
const authConfigArb = fc.record({
  preferredMethod: fc.constantFrom('oauth', 'api_key'),
  oauthEnabled: fc.boolean(),
  apiKey: fc.option(apiKeyArb, { nil: undefined }),
  enableFallback: fc.boolean(),
});

/**
 * Generates authentication configurations with both OAuth and API key available.
 */
const dualAuthConfigArb = fc.record({
  preferredMethod: fc.constantFrom('oauth', 'api_key'),
  oauthEnabled: fc.constant(true),
  apiKey: apiKeyArb,
  enableFallback: fc.boolean(),
});

/**
 * Generates authentication configurations with OAuth preferred.
 */
const oauthPreferredConfigArb = fc.record({
  preferredMethod: fc.constant('oauth' as const),
  oauthEnabled: fc.constant(true),
  apiKey: fc.option(apiKeyArb, { nil: undefined }),
  enableFallback: fc.boolean(),
});

/**
 * Generates authentication configurations with API key preferred.
 */
const apiKeyPreferredConfigArb = fc.record({
  preferredMethod: fc.constant('api_key' as const),
  oauthEnabled: fc.boolean(),
  apiKey: apiKeyArb,
  enableFallback: fc.boolean(),
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Authentication Priority Property Tests', () => {
  let authManager: AuthenticationManager;
  let mockOAuthManager: MockOAuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockOAuthManager = new MockOAuthManager();
    authManager = new AuthenticationManager(mockOAuthManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Feature: oauth-authentication, Property 4: Authentication Method Priority**
   * **Validates: Requirements 2.4, 7.2**
   * 
   * For any provider with both OAuth and API key authentication configured, 
   * OAuth tokens should be used preferentially for API calls when OAuth is the preferred method.
   */
  it('should prioritize OAuth over API key when OAuth is preferred and available', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        oauthPreferredConfigArb,
        async (provider, config) => {
          // Configure provider with OAuth preference
          authManager.configureProvider(provider as ModelProvider, config);
          
          // Set OAuth as authenticated
          mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);

          // Authenticate - should prefer OAuth
          const result = await authManager.authenticate(provider as ModelProvider);

          // Verify OAuth was used
          expect(result.success).toBe(true);
          expect(result.method).toBe('oauth');
          expect(result.credential).toMatch(/oauth_token_/);
          expect(result.usedFallback).toBe(false);

          // Verify OAuth status
          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
          expect(status.currentMethod).toBe('oauth');
          expect(status.authenticated).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: API key should be prioritized when it's the preferred method
   * 
   * For any provider with API key as preferred method, API key authentication
   * should be used even when OAuth is available.
   */
  it('should prioritize API key when it is the preferred method', async () => {
    fc.assert(
      fc.asyncProperty(
        allProviderArb,
        apiKeyPreferredConfigArb,
        async (provider, config) => {
          // Configure provider with API key preference
          authManager.configureProvider(provider as ModelProvider, config);

          // Set OAuth as available but not preferred
          if (mockOAuthManager.supportsOAuth(provider as ModelProvider)) {
            mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);
          }

          // Authenticate - should prefer API key
          const result = await authManager.authenticate(provider as ModelProvider);

          // Verify API key was used
          expect(result.success).toBe(true);
          expect(result.method).toBe('api_key');
          expect(result.credential).toBe(config.apiKey);
          expect(result.usedFallback).toBe(false);

          // Verify authentication status
          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
          expect(status.currentMethod).toBe('api_key');
          expect(status.authenticated).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Fallback should work when preferred method fails
   * 
   * For any provider with fallback enabled, when the preferred authentication
   * method fails, the system should automatically try the fallback method.
   */
  it('should fallback to alternative method when preferred method fails', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        dualAuthConfigArb.filter(config => config.enableFallback),
        async (provider, config) => {
          // Configure provider with both methods and fallback enabled
          authManager.configureProvider(provider as ModelProvider, config);

          if (config.preferredMethod === 'oauth') {
            // Make OAuth fail, should fallback to API key
            mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, false);
            mockOAuthManager.setShouldFailAuth(true);

            const result = await authManager.authenticate(provider as ModelProvider);

            expect(result.success).toBe(true);
            expect(result.method).toBe('api_key');
            expect(result.credential).toBe(config.apiKey);
            expect(result.usedFallback).toBe(true);
          } else {
            // API key is preferred, but if we simulate API key failure by removing it
            const configWithoutApiKey = { ...config, apiKey: undefined };
            authManager.configureProvider(provider as ModelProvider, configWithoutApiKey);
            
            // OAuth should be used as fallback
            mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);

            const result = await authManager.authenticate(provider as ModelProvider);

            expect(result.success).toBe(true);
            expect(result.method).toBe('oauth');
            expect(result.credential).toMatch(/oauth_token_/);
            expect(result.usedFallback).toBe(true);
          }

          // Reset mock state
          mockOAuthManager.setShouldFailAuth(false);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: No fallback when fallback is disabled
   * 
   * For any provider with fallback disabled, when the preferred method fails,
   * authentication should fail rather than trying alternative methods.
   */
  it('should not fallback when fallback is disabled', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        dualAuthConfigArb.filter(config => !config.enableFallback),
        async (provider, config) => {
          // Configure provider with fallback disabled
          authManager.configureProvider(provider as ModelProvider, config);

          if (config.preferredMethod === 'oauth') {
            // Make OAuth fail
            mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, false);
            mockOAuthManager.setShouldFailAuth(true);

            const result = await authManager.authenticate(provider as ModelProvider);

            // Should fail without trying API key fallback
            expect(result.success).toBe(false);
            expect(result.usedFallback).toBe(false);
          } else {
            // Make API key unavailable by removing it
            const configWithoutApiKey = { ...config, apiKey: undefined };
            authManager.configureProvider(provider as ModelProvider, configWithoutApiKey);

            const result = await authManager.authenticate(provider as ModelProvider);

            // Should fail without trying OAuth fallback
            expect(result.success).toBe(false);
            expect(result.usedFallback).toBe(false);
          }

          // Reset mock state
          mockOAuthManager.setShouldFailAuth(false);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Authentication method availability should be correctly reported
   * 
   * For any provider configuration, the available authentication methods
   * should accurately reflect what's actually configured and supported.
   */
  it('should correctly report available authentication methods', async () => {
    fc.assert(
      fc.property(
        allProviderArb,
        authConfigArb,
        (provider, config) => {
          authManager.configureProvider(provider as ModelProvider, config);

          const availableMethods = authManager.getAvailableAuthMethods(provider as ModelProvider);
          const supportsOAuth = mockOAuthManager.supportsOAuth(provider as ModelProvider);

          // Verify OAuth availability
          if (config.oauthEnabled && supportsOAuth) {
            expect(availableMethods).toContain('oauth');
          } else {
            expect(availableMethods).not.toContain('oauth');
          }

          // Verify API key availability
          if (config.apiKey) {
            expect(availableMethods).toContain('api_key');
          } else {
            expect(availableMethods).not.toContain('api_key');
          }

          // Should have at least one method or 'none'
          expect(availableMethods.length).toBeGreaterThan(0);
          if (!config.oauthEnabled && !config.apiKey) {
            expect(availableMethods).toEqual(['none']);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Authentication status should be consistent with configuration
   * 
   * For any provider, the authentication status should accurately reflect
   * the current authentication state and available methods.
   */
  it('should provide consistent authentication status', async () => {
    fc.assert(
      fc.asyncProperty(
        allProviderArb,
        authConfigArb,
        async (provider, config) => {
          authManager.configureProvider(provider as ModelProvider, config);

          // Set up OAuth authentication if supported
          const supportsOAuth = mockOAuthManager.supportsOAuth(provider as ModelProvider);
          if (config.oauthEnabled && supportsOAuth) {
            mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);
          }

          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);

          // Verify provider matches
          expect(status.provider).toBe(provider);

          // Verify OAuth support consistency
          if (supportsOAuth && config.oauthEnabled) {
            expect(status.oauthStatus).toBeDefined();
          }

          // Verify API key availability
          expect(status.hasApiKey).toBe(!!config.apiKey);

          // Verify fallback availability
          const expectedFallback = config.enableFallback && !!config.apiKey && supportsOAuth;
          expect(status.fallbackAvailable).toBe(expectedFallback);

          // Verify authentication consistency
          if (status.authenticated) {
            expect(['oauth', 'api_key']).toContain(status.currentMethod);
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property: Ensure valid authentication should maintain method priority
   * 
   * For any provider, ensuring valid authentication should respect the
   * configured method priority and only fallback when necessary.
   */
  it('should maintain method priority when ensuring valid authentication', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        dualAuthConfigArb,
        async (provider, config) => {
          authManager.configureProvider(provider as ModelProvider, config);

          // Set up initial authentication
          if (config.preferredMethod === 'oauth') {
            mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);
          }

          // Ensure valid authentication
          const result = await authManager.ensureValidAuthentication(provider as ModelProvider);

          if (result.success) {
            // Should use preferred method when available
            if (config.preferredMethod === 'oauth' && mockOAuthManager.supportsOAuth(provider as ModelProvider)) {
              expect(result.method).toBe('oauth');
            } else if (config.preferredMethod === 'api_key' && config.apiKey) {
              expect(result.method).toBe('api_key');
            }

            // Verify credential is provided
            expect(result.credential).toBeDefined();
            expect(typeof result.credential).toBe('string');
            expect(result.credential!.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});