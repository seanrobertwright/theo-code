/**
 * @fileoverview Property tests for token response normalization
 * @module features/auth/__tests__/token-response-normalization.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TokenSetSchema, type TokenSet } from '../types.js';

// =============================================================================
// TEST GENERATORS
// =============================================================================

/**
 * Generator for valid access tokens.
 * Ensures tokens are properly formatted without excessive whitespace.
 */
const accessTokenArb = fc.string({ _minLength: 20, _maxLength: 200 })
  .filter(token => {
    const trimmed = token.trim();
    // Ensure token has meaningful content (not just whitespace)
    return trimmed.length >= 10 && trimmed === token;
  });

/**
 * Generator for valid refresh tokens.
 * Ensures tokens are properly formatted without excessive whitespace.
 */
const refreshTokenArb = fc.string({ _minLength: 20, _maxLength: 200 })
  .filter(token => {
    const trimmed = token.trim();
    // Ensure token has meaningful content (not just whitespace)
    return trimmed.length >= 10 && trimmed === token;
  });

/**
 * Generator for OAuth scopes.
 */
const scopeArb = fc.array(
  fc.string({ _minLength: 1, _maxLength: 50 }).filter(s => /^[a-zA-Z0-9_:.-]+$/.test(s)),
  { _minLength: 0, _maxLength: 10 }
).map(scopes => scopes.join(' '));

/**
 * Generator for provider-specific token responses.
 * This generates the raw OAuth response format that providers return,
 * with snake_case field names (access_token, refresh_token, etc.)
 */
const providerTokenResponseArb = fc.record({
  // Common OAuth 2.0 fields (snake_case as returned by providers)
  _access_token: accessTokenArb,
  token_type: fc.constantFrom('Bearer', 'bearer', 'BEARER'),
  expires_in: fc.integer({ _min: 60, _max: 86400 }), // 1 minute to 24 hours
  refresh_token: fc.option(refreshTokenArb),
  scope: fc.option(scopeArb),
});

// =============================================================================
// NORMALIZATION FUNCTIONS
// =============================================================================

/**
 * Normalize provider-specific token response to standard TokenSet format.
 */
function normalizeTokenResponse(_providerResponse: any, _provider: string): TokenSet {
  // Extract access token (required)
  const accessToken = providerResponse.access_token;
  if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('Invalid or missing access_token');
  }
  
  // Extract refresh token (optional)
  const refreshToken = providerResponse.refresh_token ?? null;
  
  // Calculate expiration date
  let expiresAt: Date;
  if (providerResponse.expires_in && typeof providerResponse.expires_in === 'number') {
    expiresAt = new Date(Date.now() + providerResponse.expires_in * 1000);
  } else if (providerResponse.expires_at) {
    expiresAt = new Date(providerResponse.expires_at);
  } else {
    // Default to 1 hour if no expiration provided
    expiresAt = new Date(Date.now() + 3600 * 1000);
  }
  
  // Normalize token type
  let tokenType: 'Bearer' = 'Bearer';
  if (providerResponse.token_type) {
    tokenType = 'Bearer'; // Always normalize to 'Bearer'
  }
  
  // Extract scope
  const scope = providerResponse.scope ?? null;
  
  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType,
    scope,
  };
}

/**
 * Validate that a TokenSet contains all required fields.
 */
function validateTokenSet(_tokenSet: TokenSet): boolean {
  try {
    TokenSetSchema.parse(tokenSet);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Token Response Normalization Properties', () => {
  /**
   * **Feature: oauth-authentication, Property 9: Token Response Normalization**
   * 
   * For any provider-specific token response, the normalized format should contain 
   * all required fields (access_token, expires_at, token_type)
   * **Validates: Requirements 11.2**
   */
  it('should normalize any valid provider token response to standard format', () => {
    fc.assert(
      fc.property(
        providerTokenResponseArb,
        fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
        (providerResponse, provider) => {
          // Normalize the provider response (provider used for context)
          const normalized = normalizeTokenResponse(providerResponse, provider);
          
          // Verify all required fields are present
          expect(normalized).toHaveProperty('accessToken');
          expect(normalized).toHaveProperty('expiresAt');
          expect(normalized).toHaveProperty('tokenType');
          
          // Verify field types and values
          expect(typeof normalized.accessToken).toBe('string');
          expect(normalized.accessToken.length).toBeGreaterThan(0);
          expect(normalized.expiresAt).toBeInstanceOf(Date);
          expect(normalized.tokenType).toBe('Bearer');
          
          // Verify the normalized token passes schema validation
          expect(validateTokenSet(normalized)).toBe(true);
          
          // Verify access token matches original
          expect(normalized.accessToken).toBe(providerResponse.access_token);
          
          // Verify refresh token handling
          if (providerResponse.refresh_token) {
            expect(normalized.refreshToken).toBe(providerResponse.refresh_token);
          } else {
            expect(normalized.refreshToken).toBeNull();
          }
          
          // Verify scope handling
          if (providerResponse.scope) {
            expect(normalized.scope).toBe(providerResponse.scope);
          } else {
            expect(normalized.scope).toBeNull();
          }
        }
      ),
      { _numRuns: 100 }
    );
  });
  
  /**
   * **Feature: oauth-authentication, Property 9a: Token Type Normalization**
   * 
   * For any token response with a token_type field, the normalized token_type 
   * should always be 'Bearer' regardless of input case
   */
  it('should normalize token_type to Bearer regardless of input case', () => {
    fc.assert(
      fc.property(
        fc.record({
          _access_token: accessTokenArb,
          token_type: fc.constantFrom('bearer', 'BEARER', 'Bearer', 'bEaReR'),
          expires_in: fc.integer({ _min: 60, _max: 86400 }),
        }),
        fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
        (tokenResponse, provider) => {
          const normalized = normalizeTokenResponse(tokenResponse, provider);
          
          // Token type should always be normalized to 'Bearer'
          expect(normalized.tokenType).toBe('Bearer');
        }
      ),
      { _numRuns: 100 }
    );
  });
  
  /**
   * **Feature: oauth-authentication, Property 9b: Expiration Calculation**
   * 
   * For any token response with expires_in, the calculated expiresAt should be 
   * a future date within the expected range
   */
  it('should calculate correct expiration date from expires_in', () => {
    fc.assert(
      fc.property(
        fc.record({
          _access_token: accessTokenArb,
          expires_in: fc.integer({ _min: 60, _max: 86400 }), // 1 minute to 24 hours
        }),
        fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
        (tokenResponse, provider) => {
          const beforeNormalization = Date.now();
          const normalized = normalizeTokenResponse(tokenResponse, provider);
          const afterNormalization = Date.now();
          
          // Calculate expected expiration range
          const expectedMinExpiration = beforeNormalization + (tokenResponse.expires_in * 1000);
          const expectedMaxExpiration = afterNormalization + (tokenResponse.expires_in * 1000);
          
          // Verify expiration is within expected range
          expect(normalized.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiration);
          expect(normalized.expiresAt.getTime()).toBeLessThanOrEqual(expectedMaxExpiration);
          
          // Verify expiration is in the future
          expect(normalized.expiresAt.getTime()).toBeGreaterThan(beforeNormalization);
        }
      ),
      { _numRuns: 100 }
    );
  });
  
  /**
   * **Feature: oauth-authentication, Property 9c: Required Field Preservation**
   * 
   * For any valid token response, normalization should preserve the access_token 
   * value exactly as provided by the provider
   */
  it('should preserve access_token value exactly during normalization', () => {
    fc.assert(
      fc.property(
        providerTokenResponseArb,
        fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
        (providerResponse, provider) => {
          const normalized = normalizeTokenResponse(providerResponse, provider);
          
          // Access token should be preserved exactly
          expect(normalized.accessToken).toBe(providerResponse.access_token);
          
          // Access token should not be empty or whitespace-only
          expect(normalized.accessToken.length).toBeGreaterThan(0);
        }
      ),
      { _numRuns: 100 }
    );
  });
  
  /**
   * **Feature: oauth-authentication, Property 9d: Schema Compliance**
   * 
   * For any normalized token set, it should always pass the TokenSet schema validation
   */
  it('should produce schema-compliant TokenSet for any valid input', () => {
    fc.assert(
      fc.property(
        providerTokenResponseArb,
        fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
        (providerResponse, provider) => {
          const normalized = normalizeTokenResponse(providerResponse, provider);
          
          // Normalized token should always pass schema validation
          expect(() => TokenSetSchema.parse(normalized)).not.toThrow();
          
          // Verify specific schema requirements
          expect(normalized.accessToken).toMatch(/^.+$/); // Non-empty string
          expect(normalized.tokenType).toBe('Bearer');
          expect(normalized.expiresAt).toBeInstanceOf(Date);
          
          // Optional fields should be null or valid
          if (normalized.refreshToken !== null && normalized.refreshToken !== undefined) {
            expect(typeof normalized.refreshToken).toBe('string');
            expect(normalized.refreshToken.length).toBeGreaterThan(0);
          }
          
          if (normalized.scope !== null && normalized.scope !== undefined) {
            expect(typeof normalized.scope).toBe('string');
          }
        }
      ),
      { _numRuns: 100 }
    );
  });
  
  /**
   * **Feature: oauth-authentication, Property 9e: Error Handling**
   * 
   * For any token response missing required fields, normalization should throw 
   * an appropriate error
   */
  it('should throw error for invalid token responses', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Intentionally missing access_token or with invalid values
          access_token: fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(''),
            fc.constant('   '), // whitespace only
            fc.constant('\t\n  '), // various whitespace characters
          ),
          expires_in: fc.option(fc.integer({ _min: 60, _max: 86400 })),
        }),
        fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
        (invalidResponse, provider) => {
          // Should throw error for invalid responses
          expect(() => normalizeTokenResponse(invalidResponse, provider)).toThrow('Invalid or missing access_token');
        }
      ),
      { _numRuns: 50 }
    );
  });
});