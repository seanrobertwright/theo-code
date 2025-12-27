/**
 * @fileoverview Property-based tests for automatic token refresh
 * @module features/auth/__tests__/automatic-token-refresh.property.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { OAuthManager } from '../oauth-manager.js';
import { TokenStore } from '../token-store.js';
import { PKCEGenerator } from '../pkce-generator.js';
import { CallbackServer } from '../callback-server.js';
import { BrowserLauncher } from '../browser-launcher.js';
import { GoogleOAuthAdapter } from '../providers/google-oauth.js';
import { OpenRouterOAuthAdapter } from '../providers/openrouter-oauth.js';
import type { TokenSet, IOAuthProviderAdapter } from '../types.js';
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
// GENERATORS
// =============================================================================

/**
 * Generates valid access tokens.
 */
const accessTokenArb = fc.string({ 
  minLength: 20, 
  maxLength: 200,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.split(''))
});

/**
 * Generates valid refresh tokens.
 */
const refreshTokenArb = fc.string({ 
  minLength: 20, 
  maxLength: 200,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.split(''))
});

/**
 * Generates token expiration times.
 */
const nowTs = Date.now();
const expirationArb = fc.oneof(
  // Expired tokens (past)
  fc.integer({ min: -86400000, max: -10000 }).map(offset => new Date(nowTs + offset)),
  // Expiring soon (within 5 minutes)
  fc.integer({ min: 1000, max: 290000 }).map(offset => new Date(nowTs + offset)),
  // Valid tokens (future)
  fc.integer({ min: 600000, max: 3600000 }).map(offset => new Date(nowTs + offset))
).filter(d => !isNaN(d.getTime()));

/**
 * Generates OAuth providers that support token refresh.
 */
const refreshProviderArb = fc.constantFrom('google', 'openrouter');

/**
 * Generates token sets with various expiration states.
 */
const tokenSetArb = fc.record({
  accessToken: accessTokenArb,
  refreshToken: refreshTokenArb,
  expiresAt: expirationArb,
  tokenType: fc.constant('Bearer' as const),
  scope: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
});

/**
 * Generates expired token sets.
 */
const expiredTokenSetArb = fc.record({
  accessToken: accessTokenArb,
  refreshToken: refreshTokenArb,
  expiresAt: fc.date({ min: new Date(Date.now() - 86400000), max: new Date(Date.now() - 1000) }).filter(d => !isNaN(d.getTime())),
  tokenType: fc.constant('Bearer' as const),
  scope: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
});

/**
 * Generates token sets expiring soon (within 5 minutes).
 */
const expiringSoonTokenSetArb = fc.record({
  accessToken: accessTokenArb,
  refreshToken: refreshTokenArb,
  expiresAt: fc.date({ min: new Date(Date.now() + 1000), max: new Date(Date.now() + 300000) }).filter(d => !isNaN(d.getTime())),
  tokenType: fc.constant('Bearer' as const),
  scope: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
});

/**
 * Generates valid (not expired, not expiring soon) token sets.
 */
const validTokenSetArb = fc.record({
  accessToken: accessTokenArb,
  refreshToken: refreshTokenArb,
  expiresAt: fc.date({ min: new Date(Date.now() + 600000), max: new Date(Date.now() + 3600000) }).filter(d => !isNaN(d.getTime())),
  tokenType: fc.constant('Bearer' as const),
  scope: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
});

// =============================================================================
// MOCK PROVIDER ADAPTER
// =============================================================================

class MockOAuthAdapter implements IOAuthProviderAdapter {
  private shouldFailRefresh = false;
  private refreshTokenExpired = false;

  constructor(private provider: string) {}

  getOAuthConfig() {
    return {
      provider: this.provider,
      clientId: `mock-client-${this.provider}`,
      authorizationEndpoint: `https://auth.${this.provider}.com/oauth/authorize`,
      tokenEndpoint: `https://auth.${this.provider}.com/oauth/token`,
      scopes: ['api:read'],
      redirectUri: 'http://localhost:8080/callback',
    };
  }

  async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenSet> {
    return {
      accessToken: `mock_access_${code}`,
      refreshToken: `mock_refresh_${code}`,
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
      scope: 'api:read',
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    if (this.refreshTokenExpired) {
      const error = new Error('Refresh token expired');
      (error as any).code = 'invalid_grant';
      throw error;
    }

    if (this.shouldFailRefresh) {
      throw new Error('Token refresh failed');
    }

    return {
      accessToken: `refreshed_access_${Math.random()}`,
      refreshToken: `refreshed_refresh_${Math.random()}`,
      expiresAt: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
      scope: 'api:read',
    };
  }

  async revokeTokens(tokens: TokenSet): Promise<void> {
    // Mock implementation
  }

  validateTokens(tokens: TokenSet): boolean {
    return !!(tokens.accessToken && tokens.tokenType === 'Bearer' && tokens.expiresAt);
  }

  setRefreshFailure(shouldFail: boolean) {
    this.shouldFailRefresh = shouldFail;
  }

  setRefreshTokenExpired(expired: boolean) {
    this.refreshTokenExpired = expired;
  }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Automatic Token Refresh Property Tests', () => {
  let oauthManager: OAuthManager;
  let tokenStore: TokenStore;
  let mockAdapters: Map<string, MockOAuthAdapter>;
  let mockTokenStorage: Map<string, string>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup mock token storage
    mockTokenStorage = new Map();
    
    // Mock keytar with proper storage simulation using the existing mocks
    const keytar = await import('keytar');
    vi.mocked(keytar.setPassword).mockImplementation(async (service: string, account: string, password: string) => {
      const key = `${service}:${account}`;
      mockTokenStorage.set(key, password);
      return undefined;
    });
    vi.mocked(keytar.getPassword).mockImplementation(async (service: string, account: string) => {
      const key = `${service}:${account}`;
      return mockTokenStorage.get(key) || null;
    });
    vi.mocked(keytar.deletePassword).mockImplementation(async (service: string, account: string) => {
      const key = `${service}:${account}`;
      const existed = mockTokenStorage.has(key);
      mockTokenStorage.delete(key);
      return existed;
    });
    vi.mocked(keytar.findCredentials).mockImplementation(async (service: string) => {
      const credentials: Array<{ account: string; password: string }> = [];
      for (const [key, password] of mockTokenStorage.entries()) {
        if (key.startsWith(`${service}:`)) {
          const account = key.substring(service.length + 1);
          credentials.push({ account, password });
        }
      }
      return credentials;
    });
    
    // Create OAuth manager with mocked dependencies
    tokenStore = new TokenStore();
    const pkceGenerator = new PKCEGenerator();
    const callbackServer = new CallbackServer();
    const browserLauncher = new BrowserLauncher();
    
    oauthManager = new OAuthManager(tokenStore, pkceGenerator, callbackServer, browserLauncher);
    
    // Create and register mock adapters for all test providers
    mockAdapters = new Map();
    const providers = ['google', 'openrouter'];
    
    for (const provider of providers) {
      const mockAdapter = new MockOAuthAdapter(provider);
      mockAdapters.set(provider, mockAdapter);
      oauthManager.registerProvider(provider as ModelProvider, mockAdapter);
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Feature: oauth-authentication, Property 5: Automatic Token Refresh**
   * **Validates: Requirements 2.5, 6.2**
   * 
   * For any expired OAuth token with a valid refresh token, API calls should trigger 
   * automatic token refresh before proceeding.
   */
  it('should automatically refresh expired tokens before API calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        expiredTokenSetArb,
        refreshProviderArb,
        async (expiredTokens, provider) => {
          // Reset token storage for this property run
          mockTokenStorage.clear();

          // Get the mock adapter for this provider
          const mockAdapter = mockAdapters.get(provider);
          if (!mockAdapter) {
            throw new Error(`No mock adapter for provider: ${provider}`);
          }

          // Reset mock adapter state to ensure clean test
          mockAdapter.setRefreshFailure(false);
          mockAdapter.setRefreshTokenExpired(false);

          // Store expired tokens
          await tokenStore.storeTokens(provider as ModelProvider, expiredTokens);

          // Verify tokens were actually stored by checking retrieval
          const storedBeforeRefresh = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedBeforeRefresh).toBeDefined();
          expect(storedBeforeRefresh!.accessToken).toBe(expiredTokens.accessToken);

          // Ensure tokens are expired
          expect(await tokenStore.isTokenValid(provider as ModelProvider)).toBe(false);

          // Call ensureValidTokens - should trigger refresh
          const refreshedTokens = await oauthManager.ensureValidTokens(provider as ModelProvider);

          // Verify tokens were refreshed
          expect(refreshedTokens).toBeDefined();
          expect(refreshedTokens.accessToken).not.toBe(expiredTokens.accessToken);
          expect(refreshedTokens.expiresAt.getTime()).toBeGreaterThan(Date.now());

          // Verify new tokens are stored
          const storedTokens = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedTokens).toBeDefined();
          expect(storedTokens!.accessToken).toBe(refreshedTokens.accessToken);
          expect(await tokenStore.isTokenValid(provider as ModelProvider)).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Tokens expiring soon should be refreshed proactively
   * 
   * For any token expiring within the buffer time (5 minutes), the system
   * should refresh it proactively to prevent API call failures.
   */
  it('should refresh tokens expiring soon proactively', async () => {
    await fc.assert(
      fc.asyncProperty(
        expiringSoonTokenSetArb,
        refreshProviderArb,
        async (expiringSoonTokens, provider) => {
          // Reset token storage for this property run
          mockTokenStorage.clear();

          // Get the mock adapter for this provider
          const mockAdapter = mockAdapters.get(provider);
          if (!mockAdapter) {
            throw new Error(`No mock adapter for provider: ${provider}`);
          }

          // Reset mock adapter state
          mockAdapter.setRefreshFailure(false);
          mockAdapter.setRefreshTokenExpired(false);

          // Store tokens expiring soon
          await tokenStore.storeTokens(provider as ModelProvider, expiringSoonTokens);

          // Verify tokens need refresh
          expect(await oauthManager.needsTokenRefresh(provider as ModelProvider)).toBe(true);

          // Call ensureValidTokens - should trigger refresh
          const refreshedTokens = await oauthManager.ensureValidTokens(provider as ModelProvider);

          // Verify tokens were refreshed
          expect(refreshedTokens).toBeDefined();
          expect(refreshedTokens.accessToken).not.toBe(expiringSoonTokens.accessToken);
          expect(refreshedTokens.expiresAt.getTime()).toBeGreaterThan(Date.now() + 300000); // More than 5 minutes

          // Verify refresh is no longer needed
          expect(await oauthManager.needsTokenRefresh(provider as ModelProvider)).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Valid tokens should not be refreshed unnecessarily
   * 
   * For any valid token (not expired and not expiring soon), the system
   * should return the existing token without triggering a refresh.
   */
  it('should not refresh valid tokens unnecessarily', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokenSetArb,
        refreshProviderArb,
        async (validTokens, provider) => {
          // Reset token storage for this property run
          mockTokenStorage.clear();

          // Get the mock adapter for this provider
          const mockAdapter = mockAdapters.get(provider);
          if (!mockAdapter) {
            throw new Error(`No mock adapter for provider: ${provider}`);
          }

          // Reset mock state to ensure clean test
          mockAdapter.setRefreshFailure(false);
          mockAdapter.setRefreshTokenExpired(false);

          // Store valid tokens
          await tokenStore.storeTokens(provider as ModelProvider, validTokens);

          // Verify tokens are valid
          expect(await tokenStore.isTokenValid(provider as ModelProvider)).toBe(true);
          expect(await oauthManager.needsTokenRefresh(provider as ModelProvider)).toBe(false);

          // Call ensureValidTokens - should return existing tokens
          const returnedTokens = await oauthManager.ensureValidTokens(provider as ModelProvider);

          // Verify same tokens were returned (no refresh occurred)
          expect(returnedTokens.accessToken).toBe(validTokens.accessToken);
          expect(returnedTokens.refreshToken).toBe(validTokens.refreshToken);
          expect(returnedTokens.expiresAt.getTime()).toBe(validTokens.expiresAt.getTime());

          // Verify tokens are still stored unchanged
          const storedTokens = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedTokens).toBeDefined();
          expect(storedTokens!.accessToken).toBe(validTokens.accessToken);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Refresh token expiration should clear tokens and require re-authentication
   * 
   * For any refresh token that has expired, the system should clear all tokens
   * and require the user to re-authenticate rather than failing silently.
   */
  it('should handle refresh token expiration by clearing tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        expiredTokenSetArb,
        refreshProviderArb,
        async (expiredTokens, provider) => {
          // Reset token storage for this property run
          mockTokenStorage.clear();

          // Get the mock adapter for this provider
          const mockAdapter = mockAdapters.get(provider);
          if (!mockAdapter) {
            throw new Error(`No mock adapter for provider: ${provider}`);
          }

          // Configure mock to simulate refresh token expiration
          mockAdapter.setRefreshTokenExpired(true);
          mockAdapter.setRefreshFailure(false);

          // Store expired tokens
          await tokenStore.storeTokens(provider as ModelProvider, expiredTokens);

          // Verify tokens were stored
          const storedBeforeRefresh = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedBeforeRefresh).toBeDefined();

          // Attempt to ensure valid tokens - should fail and clear tokens
          await expect(oauthManager.ensureValidTokens(provider as ModelProvider))
            .rejects.toThrow(/refresh token expired/i);

          // Verify tokens were cleared
          const storedTokens = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedTokens).toBeNull();

          // Reset mock state
          mockAdapter.setRefreshTokenExpired(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Token refresh failures should preserve existing tokens until successful
   * 
   * For any temporary refresh failure (network error, etc.), the system should
   * preserve existing tokens and allow retry rather than clearing them immediately.
   */
  it('should preserve tokens on temporary refresh failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        expiredTokenSetArb,
        refreshProviderArb,
        async (expiredTokens, provider) => {
          // Reset token storage for this property run
          mockTokenStorage.clear();

          // Get the mock adapter for this provider
          const mockAdapter = mockAdapters.get(provider);
          if (!mockAdapter) {
            throw new Error(`No mock adapter for provider: ${provider}`);
          }

          // Configure mock to simulate temporary refresh failure
          mockAdapter.setRefreshFailure(true);
          mockAdapter.setRefreshTokenExpired(false);

          // Store expired tokens
          await tokenStore.storeTokens(provider as ModelProvider, expiredTokens);

          // Attempt to ensure valid tokens - should fail but preserve tokens
          await expect(oauthManager.ensureValidTokens(provider as ModelProvider))
            .rejects.toThrow(/token refresh failed/i);

          // Verify original tokens are still stored (not cleared)
          const storedTokens = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedTokens).toBeDefined();
          expect(storedTokens!.accessToken).toBe(expiredTokens.accessToken);

          // Reset mock state
          mockAdapter.setRefreshFailure(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Time until expiration should be calculated correctly
   * 
   * For any token set, the time until expiration should accurately reflect
   * the difference between the expiration time and current time.
   */
  it('should calculate time until expiration correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenSetArb,
        refreshProviderArb,
        async (tokens, provider) => {
          // Reset token storage for this property run
          mockTokenStorage.clear();

          // Get the mock adapter for this provider
          const mockAdapter = mockAdapters.get(provider);
          if (!mockAdapter) {
            throw new Error(`No mock adapter for provider: ${provider}`);
          }

          // Reset mock state to ensure clean test
          mockAdapter.setRefreshFailure(false);
          mockAdapter.setRefreshTokenExpired(false);

          // Store tokens
          await tokenStore.storeTokens(provider as ModelProvider, tokens);

          // Verify tokens were stored
          const storedTokens = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedTokens).toBeDefined();

          // Get time until expiration
          const timeUntilExpiration = await oauthManager.getTimeUntilExpiration(provider as ModelProvider);

          if (timeUntilExpiration !== null) {
            // Calculate expected time
            const expectedTime = Math.max(0, tokens.expiresAt.getTime() - Date.now());
            
            // Allow small tolerance for test execution time (1 second)
            const tolerance = 1000;
            expect(Math.abs(timeUntilExpiration - expectedTime)).toBeLessThan(tolerance);

            // If token is expired, time should be 0
            if (tokens.expiresAt.getTime() <= Date.now()) {
              expect(timeUntilExpiration).toBe(0);
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Refresh need detection should be consistent with token validity
   * 
   * For any token set, the need for refresh should be consistent with
   * token validity and expiration buffer calculations.
   */
  it('should detect refresh need consistently with token validity', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenSetArb,
        refreshProviderArb,
        async (tokens, provider) => {
          // Reset token storage for this property run
          mockTokenStorage.clear();

          // Get the mock adapter for this provider
          const mockAdapter = mockAdapters.get(provider);
          if (!mockAdapter) {
            throw new Error(`No mock adapter for provider: ${provider}`);
          }

          // Reset mock state to ensure clean test
          mockAdapter.setRefreshFailure(false);
          mockAdapter.setRefreshTokenExpired(false);

          // Store tokens
          await tokenStore.storeTokens(provider as ModelProvider, tokens);

          // Verify tokens were stored
          const storedTokens = await tokenStore.getTokens(provider as ModelProvider);
          expect(storedTokens).toBeDefined();

          // Check refresh need and token validity
          const needsRefresh = await oauthManager.needsTokenRefresh(provider as ModelProvider);
          const isValid = await tokenStore.isTokenValid(provider as ModelProvider);

          // Calculate if token is expired or expiring soon (within 5 minutes)
          const now = Date.now();
          const expiresAt = tokens.expiresAt.getTime();
          const bufferTime = 5 * 60 * 1000; // 5 minutes
          const isExpiredOrExpiringSoon = expiresAt <= now + bufferTime;

          // needsRefresh should be true if token is expired or expiring soon
          // The implementation may have different logic, so we check consistency
          if (isExpiredOrExpiringSoon) {
            // If tokens are expired or expiring soon, needsRefresh should be true
            expect(needsRefresh).toBe(true);
          }

          // If token is expired (not just expiring soon), isValid should be false
          if (expiresAt <= now) {
            expect(isValid).toBe(false);
          }

          // If needs refresh, token should not be considered "valid" for use
          if (needsRefresh) {
            expect(isValid).toBe(false);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});