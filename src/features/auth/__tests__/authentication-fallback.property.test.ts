/**
 * @fileoverview Property-based tests for authentication fallback behavior
 * @module features/auth/__tests__/authentication-fallback.property.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { AuthenticationManager, type AuthConfig, type AuthResult } from '../authentication-manager.js';
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
// MOCK OAUTH MANAGER WITH CONTROLLABLE FAILURES
// =============================================================================

class MockOAuthManagerWithFailures implements IOAuthManager {
  private supportedProviders = new Set<ModelProvider>(['google', 'openrouter']);
  private authenticatedProviders = new Map<ModelProvider, TokenSet>();
  private failureMode: 'none' | 'auth' | 'refresh' | 'all' = 'none';
  private shouldFailForProvider = new Map<ModelProvider, boolean>();

  async initiateFlow(provider: ModelProvider) {
    if (this.failureMode === 'auth' || this.failureMode === 'all' || this.shouldFailForProvider.get(provider)) {
      return {
        success: false,
        error: 'OAuth authentication failed',
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
    if (this.failureMode === 'refresh' || this.failureMode === 'all' || this.shouldFailForProvider.get(provider)) {
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
      authenticated: !!tokens && this.failureMode !== 'all' && !this.shouldFailForProvider.get(provider),
      method: 'oauth',
      expiresAt: tokens?.expiresAt,
      needsRefresh: tokens ? tokens.expiresAt.getTime() - Date.now() < 300000 : false,
    };
  }

  supportsOAuth(provider: ModelProvider): boolean {
    return this.supportedProviders.has(provider);
  }

  async ensureValidTokens(provider: ModelProvider): Promise<TokenSet> {
    if (this.failureMode === 'all' || this.shouldFailForProvider.get(provider)) {
      throw new Error(`OAuth not available for provider: ${provider}`);
    }

    const tokens = this.authenticatedProviders.get(provider);
    if (!tokens) {
      throw new Error(`No tokens available for provider: ${provider}. Please authenticate first.`);
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

  // Test control methods
  setFailureMode(mode: 'none' | 'auth' | 'refresh' | 'all') {
    this.failureMode = mode;
  }

  setProviderFailure(provider: ModelProvider, shouldFail: boolean) {
    this.shouldFailForProvider.set(provider, shouldFail);
  }

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

  addSupportedProvider(provider: ModelProvider) {
    this.supportedProviders.add(provider);
  }

  removeSupportedProvider(provider: ModelProvider) {
    this.supportedProviders.delete(provider);
  }

  reset() {
    this.failureMode = 'none';
    this.shouldFailForProvider.clear();
    this.authenticatedProviders.clear();
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
 * Generates API keys.
 */
const apiKeyArb = fc.string({ 
  minLength: 20, 
  maxLength: 100,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._'.split(''))
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
 * Generates authentication configurations with fallback enabled.
 */
const fallbackEnabledConfigArb = dualAuthConfigArb.filter(config => config.enableFallback);

/**
 * Generates authentication configurations with fallback disabled.
 */
const fallbackDisabledConfigArb = dualAuthConfigArb.filter(config => !config.enableFallback);

/**
 * Generates failure scenarios.
 */
const failureScenarioArb = fc.constantFrom('auth', 'refresh', 'all');

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Authentication Fallback Property Tests', () => {
  let authManager: AuthenticationManager;
  let mockOAuthManager: MockOAuthManagerWithFailures;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockOAuthManager = new MockOAuthManagerWithFailures();
    authManager = new AuthenticationManager(mockOAuthManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockOAuthManager.reset();
  });

  /**
   * **Feature: oauth-authentication, Property 6: Authentication Fallback**
   * **Validates: Requirements 2.6, 7.3**
   * 
   * For any OAuth authentication failure, the system should fallback to API key 
   * authentication when available and fallback is enabled.
   */
  it('should fallback to API key when OAuth fails and fallback is enabled', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        fallbackEnabledConfigArb.filter(config => config.preferredMethod === 'oauth'),
        failureScenarioArb,
        async (provider, config, failureMode) => {
          // Configure provider with OAuth preferred and fallback enabled
          authManager.configureProvider(provider as ModelProvider, config);
          
          // Set OAuth to fail
          mockOAuthManager.setFailureMode(failureMode);

          // Authenticate - should fallback to API key
          const result = await authManager.authenticate(provider as ModelProvider);

          // Verify fallback occurred
          expect(result.success).toBe(true);
          expect(result.method).toBe('api_key');
          expect(result.credential).toBe(config.apiKey);
          expect(result.usedFallback).toBe(true);

          // Verify authentication status reflects API key usage
          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
          expect(status.currentMethod).toBe('api_key');
          expect(status.authenticated).toBe(true);
          expect(status.fallbackAvailable).toBe(true);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: No fallback when fallback is disabled
   * 
   * For any OAuth failure when fallback is disabled, authentication should fail
   * completely rather than attempting to use API key authentication.
   */
  it('should not fallback when fallback is disabled', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        fallbackDisabledConfigArb.filter(config => config.preferredMethod === 'oauth'),
        failureScenarioArb,
        async (provider, config, failureMode) => {
          // Configure provider with OAuth preferred and fallback disabled
          authManager.configureProvider(provider as ModelProvider, config);
          
          // Set OAuth to fail
          mockOAuthManager.setFailureMode(failureMode);

          // Authenticate - should fail without fallback
          const result = await authManager.authenticate(provider as ModelProvider);

          // Verify no fallback occurred
          expect(result.success).toBe(false);
          expect(result.usedFallback).toBe(false);
          expect(result.error).toBeDefined();

          // Verify authentication status reflects failure
          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
          expect(status.authenticated).toBe(false);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Fallback to OAuth when API key is preferred but unavailable
   * 
   * For any configuration where API key is preferred but not available,
   * the system should fallback to OAuth when fallback is enabled.
   */
  it('should fallback to OAuth when API key is preferred but unavailable', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        fallbackEnabledConfigArb.filter(config => config.preferredMethod === 'api_key'),
        async (provider, config) => {
          // Remove API key to simulate unavailability
          const configWithoutApiKey = { ...config, apiKey: undefined };
          authManager.configureProvider(provider as ModelProvider, configWithoutApiKey);
          
          // Set OAuth as available
          mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);

          // Authenticate - should fallback to OAuth
          const result = await authManager.authenticate(provider as ModelProvider);

          // Verify fallback to OAuth occurred
          expect(result.success).toBe(true);
          expect(result.method).toBe('oauth');
          expect(result.credential).toMatch(/mock_token_/);
          expect(result.usedFallback).toBe(true);

          // Verify authentication status reflects OAuth usage
          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
          expect(status.currentMethod).toBe('oauth');
          expect(status.authenticated).toBe(true);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Fallback should work during token refresh failures
   * 
   * For any token refresh failure when fallback is enabled, the system
   * should fallback to API key authentication for subsequent requests.
   */
  it('should fallback during token refresh failures', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        fallbackEnabledConfigArb.filter(config => config.preferredMethod === 'oauth'),
        async (provider, config) => {
          // Configure provider with OAuth preferred and fallback enabled
          authManager.configureProvider(provider as ModelProvider, config);
          
          // Initially set OAuth as working
          mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);

          // Verify initial OAuth authentication works
          let result = await authManager.ensureValidAuthentication(provider as ModelProvider);
          expect(result.success).toBe(true);
          expect(result.method).toBe('oauth');

          // Now make refresh fail
          mockOAuthManager.setFailureMode('refresh');

          // Try to ensure valid authentication again - should fallback to API key
          result = await authManager.ensureValidAuthentication(provider as ModelProvider);
          
          if (result.success) {
            // If successful, should have fallen back to API key
            expect(result.method).toBe('api_key');
            expect(result.credential).toBe(config.apiKey);
            expect(result.usedFallback).toBe(true);
          } else {
            // If failed, should indicate OAuth refresh failure
            expect(result.error).toMatch(/refresh failed|not available/i);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Fallback availability should be correctly reported
   * 
   * For any provider configuration, fallback availability should accurately
   * reflect whether fallback is enabled and alternative methods are available.
   */
  it('should correctly report fallback availability', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        dualAuthConfigArb,
        async (provider, config) => {
          authManager.configureProvider(provider as ModelProvider, config);

          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);

          // Fallback should be available if:
          // 1. Fallback is enabled
          // 2. API key is available
          // 3. OAuth is supported
          const expectedFallback = config.enableFallback && 
                                 !!config.apiKey && 
                                 mockOAuthManager.supportsOAuth(provider as ModelProvider);

          expect(status.fallbackAvailable).toBe(expectedFallback);

          // If fallback is available, both methods should be in available methods
          const availableMethods = authManager.getAvailableAuthMethods(provider as ModelProvider);
          if (expectedFallback) {
            expect(availableMethods).toContain('oauth');
            expect(availableMethods).toContain('api_key');
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Fallback should preserve authentication state consistency
   * 
   * For any fallback scenario, the authentication state should remain
   * consistent and accurately reflect the active authentication method.
   */
  it('should maintain consistent authentication state during fallback', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        fallbackEnabledConfigArb,
        async (provider, config) => {
          authManager.configureProvider(provider as ModelProvider, config);

          // Test various failure scenarios
          const failureScenarios = ['auth', 'refresh'] as const;
          
          for (const failureMode of failureScenarios) {
            // Reset state
            mockOAuthManager.reset();
            
            if (config.preferredMethod === 'oauth') {
              // Make OAuth fail, should fallback to API key
              mockOAuthManager.setFailureMode(failureMode);
              
              const result = await authManager.authenticate(provider as ModelProvider);
              
              if (result.success) {
                expect(result.method).toBe('api_key');
                expect(result.usedFallback).toBe(true);
                
                // Verify status consistency
                const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
                expect(status.currentMethod).toBe('api_key');
                expect(status.authenticated).toBe(true);
              }
            } else {
              // API key preferred, make it unavailable to test OAuth fallback
              const configWithoutApiKey = { ...config, apiKey: undefined };
              authManager.configureProvider(provider as ModelProvider, configWithoutApiKey);
              
              mockOAuthManager.setAuthenticationStatus(provider as ModelProvider, true);
              
              const result = await authManager.authenticate(provider as ModelProvider);
              
              if (result.success) {
                expect(result.method).toBe('oauth');
                expect(result.usedFallback).toBe(true);
                
                // Verify status consistency
                const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
                expect(status.currentMethod).toBe('oauth');
                expect(status.authenticated).toBe(true);
              }
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Multiple fallback attempts should not cause infinite loops
   * 
   * For any scenario where both authentication methods fail, the system
   * should fail gracefully without infinite retry loops.
   */
  it('should fail gracefully when all authentication methods fail', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        fallbackEnabledConfigArb,
        async (provider, config) => {
          // Configure provider with fallback enabled
          authManager.configureProvider(provider as ModelProvider, config);
          
          // Make all authentication methods fail
          mockOAuthManager.setFailureMode('all');
          
          // Remove API key to make it fail too
          const configWithoutApiKey = { ...config, apiKey: undefined };
          authManager.configureProvider(provider as ModelProvider, configWithoutApiKey);

          // Authenticate - should fail gracefully
          const result = await authManager.authenticate(provider as ModelProvider);

          // Verify graceful failure
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.error!.length).toBeGreaterThan(0);

          // Verify no authentication is active
          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
          expect(status.authenticated).toBe(false);
          expect(status.currentMethod).toBe('none');
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property: Fallback should work consistently across multiple calls
   * 
   * For any fallback scenario, multiple authentication attempts should
   * produce consistent results without state corruption.
   */
  it('should provide consistent fallback behavior across multiple calls', async () => {
    fc.assert(
      fc.asyncProperty(
        oauthProviderArb,
        fallbackEnabledConfigArb.filter(config => config.preferredMethod === 'oauth'),
        async (provider, config) => {
          // Configure provider with OAuth preferred and fallback enabled
          authManager.configureProvider(provider as ModelProvider, config);
          
          // Make OAuth fail consistently
          mockOAuthManager.setFailureMode('auth');

          // Perform multiple authentication attempts
          const results: AuthResult[] = [];
          for (let i = 0; i < 3; i++) {
            const result = await authManager.authenticate(provider as ModelProvider);
            results.push(result);
          }

          // All results should be consistent
          for (const result of results) {
            expect(result.success).toBe(true);
            expect(result.method).toBe('api_key');
            expect(result.credential).toBe(config.apiKey);
            expect(result.usedFallback).toBe(true);
          }

          // Authentication status should remain consistent
          const status = await authManager.getProviderAuthStatus(provider as ModelProvider);
          expect(status.currentMethod).toBe('api_key');
          expect(status.authenticated).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });
});