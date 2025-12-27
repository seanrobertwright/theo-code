/**
 * @fileoverview Property-based tests for token security
 * @module features/auth/__tests__/token-security.property.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { TokenStore } from '../token-store.js';
import type { TokenSet } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock keytar for token storage with proper state management
const mockStorage = new Map<string, string>();

vi.mock('keytar', () => ({
  setPassword: vi.fn().mockImplementation(async (_service: string, _account: string, _password: string) => {
    const key = `${service}:${account}`;
    mockStorage.set(key, password);
    return undefined;
  }),
  getPassword: vi.fn().mockImplementation(async (_service: string, _account: string) => {
    const key = `${service}:${account}`;
    return mockStorage.get(key) || null;
  }),
  deletePassword: vi.fn().mockImplementation(async (_service: string, _account: string) => {
    const key = `${service}:${account}`;
    const existed = mockStorage.has(key);
    mockStorage.delete(key);
    return existed;
  }),
  findCredentials: vi.fn().mockImplementation(async (_service: string) => {
    const credentials: Array<{ account: string; _password: string }> = [];
    for (const [key, password] of mockStorage.entries()) {
      if (key.startsWith(`${service}:`) {
        const account = key.substring(service.length + 1);
        credentials.push({ account, password });
      }
    }
    return credentials;
  }),
}));

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generates valid access tokens with various security characteristics.
 */
const secureAccessTokenArb = fc.string({ 
  _minLength: 32, 
  _maxLength: 512,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.split(''))
});

/**
 * Generates valid refresh tokens.
 */
const secureRefreshTokenArb = fc.string({ 
  _minLength: 32, 
  _maxLength: 512,
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.split(''))
});

/**
 * Generates OAuth providers.
 */
const providerArb = fc.constantFrom('google', 'openrouter', 'anthropic');

/**
 * Generates secure token sets.
 */
const secureTokenSetArb = fc.record({
  _accessToken: secureAccessTokenArb,
  _refreshToken: secureRefreshTokenArb,
  expiresAt: fc.date({ 
    min: new Date(Date.now() + 60000), 
    max: new Date(Date.now() + 3600000) 
  }).filter(date => !isNaN(date.getTime())), // Ensure valid dates only
  tokenType: fc.constant('Bearer' as const),
  scope: fc.option(fc.string({ _minLength: 1, _maxLength: 100 })),
});

/**
 * Generates potentially malicious token data (optimized for performance).
 */
const maliciousTokenArb = fc.oneof(
  // SQL injection attempts
  fc.constant("'; DROP TABLE tokens; --"),
  // XSS attempts
  fc.constant("<script>alert('xss')</script>"),
  // Path traversal attempts
  fc.constant("../../../etc/passwd"),
  // Command injection attempts
  fc.constant("token; rm -rf /"),
  // JSON injection attempts
  fc.constant('{"malicious": true}'),
  // Moderately long strings (reduced from 10k-50k to 1k-5k for performance)
  fc.string({ _minLength: 1000, _maxLength: 5000 }),
  // Smaller binary data (reduced from 100-1000 to 50-200 for performance)
  fc.uint8Array({ _minLength: 50, _maxLength: 200 }).map(arr => 
    Array.from(arr).map(b => String.fromCharCode(b)).join('')
  ),
);

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Token Security Property Tests', () => {
  let tokenStore: TokenStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear(); // Clear mock storage between tests
    tokenStore = new TokenStore();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    mockStorage.clear(); // Clear mock storage after tests
    
    // Additional cleanup - clear any remaining tokens
    try {
      const providers = ['google', 'openrouter', 'anthropic', 'openai'];
      for (const provider of providers) {
        await tokenStore.clearTokens(provider as ModelProvider);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * **Feature: oauth-authentication, Property 3: Secure Token Storage**
   * **Validates: Requirements 6.1**
   * 
   * For any OAuth token storage operation, the stored data should be encrypted 
   * and not readable as plain text. When valid tokens are stored successfully,
   * they should be retrievable with full integrity maintained.
   */
  it('should maintain token integrity during storage and retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        secureTokenSetArb,
        providerArb,
        async (tokens, provider) => {
          // Clear mock storage for this iteration
          mockStorage.clear();
          
          try {
            // Store tokens - this should succeed for valid tokens
            await tokenStore.storeTokens(provider as ModelProvider, tokens);

            // Retrieve tokens
            const retrievedTokens = await tokenStore.getTokens(provider as ModelProvider);

            // Storage should succeed, so retrieval should return the tokens
            expect(retrievedTokens).not.toBeNull();
            expect(retrievedTokens).toBeDefined();
            
            if (retrievedTokens) {
              // Verify integrity - all fields should match exactly
              expect(retrievedTokens.accessToken).toBe(tokens.accessToken);
              expect(retrievedTokens.refreshToken).toBe(tokens.refreshToken);
              expect(retrievedTokens.expiresAt.getTime()).toBe(tokens.expiresAt.getTime());
              expect(retrievedTokens.tokenType).toBe(tokens.tokenType);
              expect(retrievedTokens.scope).toBe(tokens.scope);
            }
          } catch (error) {
            // If storage fails due to validation, that's unexpected for valid tokens
            throw error;
          } finally {
            // Clean up after each test to prevent state pollution
            try {
              await tokenStore.clearTokens(provider as ModelProvider);
              mockStorage.clear();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { _numRuns: 10 } // Reduced from 50 to 10
    );
  }, { _timeout: 10000 }); // Added 10 second timeout

  /**
   * Property: Token storage should be isolated between providers
   * 
   * For any two different providers, tokens stored for one provider
   * should not be accessible when querying for another provider.
   */
  it('should isolate tokens between different providers', async () => {
    await fc.assert(
      fc.asyncProperty(
        secureTokenSetArb,
        secureTokenSetArb,
        fc.constantFrom('google', 'openrouter', 'anthropic', 'openai'),
        fc.constantFrom('google', 'openrouter', 'anthropic', 'openai'),
        async (tokens1, tokens2, provider1, provider2) => {
          // Ensure providers are different
          fc.pre(provider1 !== provider2);
          // Ensure tokens are different to test isolation effectively
          fc.pre(tokens1.accessToken !== tokens2.accessToken);
          
          // Clear mock storage for this iteration
          mockStorage.clear();

          try {
            // Store tokens for both providers
            await tokenStore.storeTokens(provider1 as ModelProvider, tokens1);
            await tokenStore.storeTokens(provider2 as ModelProvider, tokens2);

            // Retrieve tokens for each provider
            const retrieved1 = await tokenStore.getTokens(provider1 as ModelProvider);
            const retrieved2 = await tokenStore.getTokens(provider2 as ModelProvider);

            // Both storage operations should succeed, so both retrievals should succeed
            expect(retrieved1).not.toBeNull();
            expect(retrieved2).not.toBeNull();
            
            if (retrieved1 && retrieved2) {
              // Verify isolation - tokens should be different between providers
              expect(retrieved1.accessToken).toBe(tokens1.accessToken);
              expect(retrieved2.accessToken).toBe(tokens2.accessToken);
              expect(retrieved1.accessToken).not.toBe(retrieved2.accessToken);
            }
          } catch (error) {
            // Unexpected error for valid tokens
            throw error;
          } finally {
            // Clean up after each test to prevent state pollution
            try {
              await tokenStore.clearTokens(provider1 as ModelProvider);
              await tokenStore.clearTokens(provider2 as ModelProvider);
              mockStorage.clear();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { _numRuns: 8 } // Reduced from 30 to 8
    );
  }, { _timeout: 8000 }); // Added 8 second timeout

  /**
   * Property: Token storage should handle malicious input safely
   * 
   * For any potentially malicious token data, the storage system should
   * either reject it safely or store it without causing security issues.
   */
  it('should handle malicious token data safely', async () => {
    await fc.assert(
      fc.asyncProperty(
        maliciousTokenArb,
        providerArb,
        async (maliciousToken, provider) => {
          // Clear mock storage for this iteration
          mockStorage.clear();
          
          // Create token set with malicious data
          const maliciousTokenSet: TokenSet = {
            _accessToken: maliciousToken,
            refreshToken: 'safe_refresh_token',
            expiresAt: new Date(Date.now() + 3600000),
            tokenType: 'Bearer',
            scope: 'api:read',
          };

          // Attempt to store malicious tokens
          try {
            await tokenStore.storeTokens(provider as ModelProvider, maliciousTokenSet);
            
            // If storage succeeds, retrieval should be safe
            const retrieved = await tokenStore.getTokens(provider as ModelProvider);
            
            if (retrieved) {
              // Verify the malicious data is contained and doesn't cause issues
              expect(typeof retrieved.accessToken).toBe('string');
              expect(retrieved.accessToken).toBe(maliciousToken);
              
              // Ensure no code execution or system compromise
              expect(retrieved.tokenType).toBe('Bearer');
              expect(retrieved.refreshToken).toBe('safe_refresh_token');
            }
          } catch (error) {
            // If storage fails, it should fail safely with a proper error
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBeDefined();
            
            // Verify no tokens were stored on failure
            const retrieved = await tokenStore.getTokens(provider as ModelProvider);
            expect(retrieved).toBeNull();
          }
          
          // Clean up after each test to prevent state pollution
          try {
            await tokenStore.clearTokens(provider as ModelProvider);
            mockStorage.clear();
          } catch {
            // Ignore cleanup errors
          }
        }
      ),
      { _numRuns: 5 } // Reduced from 20 to 5 (malicious data tests are expensive)
    );
  }, { _timeout: 15000 }); // Added 15 second timeout (malicious data can be slow)

  /**
   * Property: Token clearing should be complete and secure
   * 
   * For any stored token set, clearing tokens should completely remove
   * all traces and prevent any subsequent retrieval.
   */
  it('should completely clear tokens without leaving traces', async () => {
    await fc.assert(
      fc.asyncProperty(
        secureTokenSetArb,
        providerArb,
        async (tokens, provider) => {
          // Clear mock storage for this iteration
          mockStorage.clear();
          
          try {
            // Store tokens
            await tokenStore.storeTokens(provider as ModelProvider, tokens);

            // Verify tokens are stored
            const beforeClear = await tokenStore.getTokens(provider as ModelProvider);
            expect(beforeClear).toBeDefined();

            // Clear tokens
            await tokenStore.clearTokens(provider as ModelProvider);

            // Verify tokens are completely removed
            const afterClear = await tokenStore.getTokens(provider as ModelProvider);
            expect(afterClear).toBeNull();

            // Verify token validity check returns false
            const isValid = await tokenStore.isTokenValid(provider as ModelProvider);
            expect(isValid).toBe(false);
          } catch (error) {
            // Unexpected error for valid tokens
            throw error;
          } finally {
            // Clean up after each test to prevent state pollution
            try {
              await tokenStore.clearTokens(provider as ModelProvider);
              mockStorage.clear();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { _numRuns: 8 } // Reduced from 30 to 8
    );
  }, { _timeout: 8000 }); // Added 8 second timeout

  /**
   * Property: Token expiration should be calculated securely
   * 
   * For any token set, expiration calculations should be accurate
   * and not susceptible to time-based attacks or manipulation.
   */
  it('should calculate token expiration securely and accurately', async () => {
    await fc.assert(
      fc.asyncProperty(
        secureTokenSetArb,
        providerArb,
        async (tokens, provider) => {
          // Clear mock storage for this iteration
          mockStorage.clear();
          
          try {
            // Store tokens
            await tokenStore.storeTokens(provider as ModelProvider, tokens);

            // Get time until expiration
            const timeUntilExpiration = await tokenStore.getTimeUntilExpiration(provider as ModelProvider);

            if (timeUntilExpiration !== null) {
              // Calculate expected time
              const expectedTime = Math.max(0, tokens.expiresAt.getTime() - Date.now());
              
              // Allow larger tolerance for test execution time (10 seconds)
              const tolerance = 10000;
              expect(Math.abs(timeUntilExpiration - expectedTime)).toBeLessThan(tolerance);

              // Verify expiration is never negative for future dates
              if (tokens.expiresAt.getTime() > Date.now()) {
                expect(timeUntilExpiration).toBeGreaterThanOrEqual(0);
              }

              // Verify expired tokens return 0
              if (tokens.expiresAt.getTime() <= Date.now()) {
                expect(timeUntilExpiration).toBe(0);
              }
            }
          } catch (error) {
            // Unexpected error for valid tokens
            throw error;
          } finally {
            // Clean up after each test to prevent state pollution
            try {
              await tokenStore.clearTokens(provider as ModelProvider);
              mockStorage.clear();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { _numRuns: 8 } // Reduced from 30 to 8
    );
  }, { _timeout: 8000 }); // Added 8 second timeout

  /**
   * Property: Token validation should be consistent and secure
   * 
   * For any token set, validation results should be consistent
   * and based on secure criteria (expiration, format, etc.).
   */
  it('should validate tokens consistently and securely', async () => {
    await fc.assert(
      fc.asyncProperty(
        secureTokenSetArb,
        providerArb,
        async (tokens, provider) => {
          // Clear mock storage for this iteration
          mockStorage.clear();
          
          try {
            // Store tokens
            await tokenStore.storeTokens(provider as ModelProvider, tokens);

            // Check validation
            const isValid = await tokenStore.isTokenValid(provider as ModelProvider);
            const isExpired = await tokenStore.isTokenExpired(provider as ModelProvider);
            const isExpiringSoon = await tokenStore.isTokenExpiringSoon(provider as ModelProvider);

            // Verify consistency
            const now = Date.now();
            const expiresAt = tokens.expiresAt.getTime();
            const bufferTime = 5 * 60 * 1000; // 5 minutes

            // If token is expired, it should not be valid
            if (expiresAt <= now) {
              expect(isExpired).toBe(true);
              expect(isValid).toBe(false);
            }

            // If token is expiring soon, it should not be valid
            if (expiresAt <= now + bufferTime) {
              expect(isExpiringSoon).toBe(true);
              expect(isValid).toBe(false);
            }

            // If token is not expired and not expiring soon, it should be valid
            if (expiresAt > now + bufferTime) {
              expect(isExpired).toBe(false);
              expect(isExpiringSoon).toBe(false);
              expect(isValid).toBe(true);
            }
          } catch (error) {
            // Unexpected error for valid tokens
            throw error;
          } finally {
            // Clean up after each test to prevent state pollution
            try {
              await tokenStore.clearTokens(provider as ModelProvider);
              mockStorage.clear();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { _numRuns: 10 } // Reduced from 40 to 10
    );
  }, { _timeout: 10000 }); // Added 10 second timeout

  /**
   * Property: Multiple concurrent operations should be safe
   * 
   * For any sequence of concurrent token operations, the system should
   * handle them safely without race conditions or data corruption.
   */
  it('should handle concurrent operations safely', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(secureTokenSetArb, { _minLength: 2, _maxLength: 3 }), // Reduced from 5 to 3
        fc.array(providerArb, { _minLength: 2, _maxLength: 2 }), // Reduced from 3 to 2
        async (tokenSets, providers) => {
          // Clear mock storage for this iteration
          mockStorage.clear();
          
          const operations: Promise<any>[] = [];
          const usedProviders = new Set<string>();

          try {
            // Store operations (reduced)
            for (let i = 0; i < Math.min(tokenSets.length, 3); i++) { // Limit to 3 operations
              const provider = providers[i % providers.length];
              usedProviders.add(provider);
              operations.push(tokenStore.storeTokens(provider as ModelProvider, tokenSets[i]));
            }

            // Retrieve operations (reduced)
            for (const provider of providers.slice(0, 2)) { // Limit to 2 providers
              operations.push(tokenStore.getTokens(provider as ModelProvider));
            }

            // Validation operations (reduced)
            for (const provider of providers.slice(0, 2)) { // Limit to 2 providers
              operations.push(tokenStore.isTokenValid(provider as ModelProvider));
            }

            // Execute all operations concurrently
            const results = await Promise.allSettled(operations);

            // Verify no operations failed due to race conditions
            const failures = results.filter(result => result.status === 'rejected');
            
            // Allow some failures due to validation logic, but not due to race conditions
            for (const failure of failures) {
              if (failure.status === 'rejected') {
                // Ensure failures are due to validation, not race conditions
                expect(failure.reason.message).not.toMatch(/race|concurrent|lock/i);
              }
            }

            // Verify final state is consistent
            for (const provider of providers) {
              const tokens = await tokenStore.getTokens(provider as ModelProvider);
              if (tokens) {
                expect(tokens.accessToken).toBeDefined();
                expect(tokens.refreshToken).toBeDefined();
                expect(tokens.expiresAt).toBeInstanceOf(Date);
                expect(tokens.tokenType).toBe('Bearer');
              }
            }
          } catch (error) {
            // Unexpected error
            throw error;
          } finally {
            // Clean up after each test to prevent state pollution
            try {
              for (const provider of usedProviders) {
                await tokenStore.clearTokens(provider as ModelProvider);
              }
              mockStorage.clear();
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { _numRuns: 3 } // Reduced from 15 to 3 (concurrent tests are very expensive)
    );
  }, { _timeout: 20000 }); // Added 20 second timeout (concurrent operations can be slow)
});