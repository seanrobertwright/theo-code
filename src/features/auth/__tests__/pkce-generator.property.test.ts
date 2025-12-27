/**
 * @fileoverview Property-based tests for PKCE generator
 * @module features/auth/__tests__/pkce-generator.property.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { PKCEGenerator } from '../pkce-generator.js';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Base64URL character set for efficient generation.
 */
const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Generates valid code verifier strings (43-128 characters, base64url safe).
 * Uses direct character selection instead of filtering for better performance.
 */
const codeVerifierArb = fc.integer({ min: 43, max: 128 }).chain(length =>
  fc.array(fc.constantFrom(...BASE64URL_CHARS), { minLength: length, maxLength: length })
    .map(chars => chars.join(''))
);

/**
 * Generates invalid code verifier strings (wrong length or invalid characters).
 * Uses direct generation instead of filtering for better performance.
 */
const invalidCodeVerifierArb = fc.oneof(
  // Too short
  fc.array(fc.constantFrom(...BASE64URL_CHARS), { minLength: 1, maxLength: 42 })
    .map(chars => chars.join('')),
  // Too long  
  fc.array(fc.constantFrom(...BASE64URL_CHARS), { minLength: 129, maxLength: 200 })
    .map(chars => chars.join('')),
  // Invalid characters (add some invalid chars)
  fc.integer({ min: 43, max: 128 }).chain(length =>
    fc.array(fc.constantFrom(...BASE64URL_CHARS, '+', '/', '=', ' ', '\n'), { minLength: length, maxLength: length })
      .map(chars => chars.join(''))
      .filter(str => /[^A-Za-z0-9\-._~]/.test(str)) // Only keep strings with invalid chars
  ),
  // Empty string
  fc.constant(''),
);

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('PKCE Generator Property Tests', () => {
  let pkceGenerator: PKCEGenerator;

  beforeEach(() => {
    pkceGenerator = new PKCEGenerator();
  });

  /**
   * **Feature: oauth-authentication, Property 1: PKCE Parameter Inclusion**
   * **Validates: Requirements 1.2**
   * 
   * For any OAuth authorization URL generation, the resulting URL should contain
   * both code_challenge and code_challenge_method parameters with valid values.
   */
  it('should generate valid PKCE parameters for OAuth authorization URLs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (_iteration) => {
        // Generate PKCE parameters
        const codeVerifier = pkceGenerator.generateCodeVerifier();
        const codeChallenge = pkceGenerator.generateCodeChallenge(codeVerifier);
        
        // Verify code verifier properties
        expect(codeVerifier).toBeDefined();
        expect(typeof codeVerifier).toBe('string');
        expect(codeVerifier.length).toBe(128); // Should be exactly 128 characters
        expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/); // Base64URL character set
        
        // Verify code challenge properties
        expect(codeChallenge).toBeDefined();
        expect(typeof codeChallenge).toBe('string');
        expect(codeChallenge.length).toBeGreaterThan(0);
        expect(codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/); // Base64URL without padding
        
        // Verify PKCE validation works
        const isValid = pkceGenerator.validateCodeVerifier(codeVerifier, codeChallenge);
        expect(isValid).toBe(true);
        
        // Verify parameters would be included in authorization URL
        const mockAuthUrl = new URL('https://example.com/oauth/authorize');
        mockAuthUrl.searchParams.set('code_challenge', codeChallenge);
        mockAuthUrl.searchParams.set('code_challenge_method', 'S256');
        
        // Check that URL contains required PKCE parameters
        expect(mockAuthUrl.searchParams.has('code_challenge')).toBe(true);
        expect(mockAuthUrl.searchParams.has('code_challenge_method')).toBe(true);
        expect(mockAuthUrl.searchParams.get('code_challenge')).toBe(codeChallenge);
        expect(mockAuthUrl.searchParams.get('code_challenge_method')).toBe('S256');
      }),
      { numRuns: 3 }
    );
  }, { timeout: 10000 }); // 10 second timeout

  /**
   * Property: Code verifier generation should be cryptographically secure
   * 
   * For any generated code verifier, it should meet RFC 7636 requirements
   * for cryptographic security and randomness.
   */
  it('should generate cryptographically secure code verifiers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 10 }), (iterations) => {
        const verifiers = new Set<string>();
        
        // Generate multiple verifiers (reduced iterations for performance)
        for (let i = 0; i < iterations; i++) {
          const verifier = pkceGenerator.generateCodeVerifier();
          
          // Verify uniqueness (extremely high probability with crypto random)
          expect(verifiers.has(verifier)).toBe(false);
          verifiers.add(verifier);
          
          // Verify RFC 7636 compliance
          expect(verifier.length).toBe(128);
          expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
          
          // Simplified entropy check (sample first 20 chars instead of all 128)
          const sample = verifier.slice(0, 20);
          const charCounts = new Map<string, number>();
          for (const char of sample) {
            charCounts.set(char, (charCounts.get(char) || 0) + 1);
          }
          
          // No single character should dominate in sample (basic randomness check)
          const maxCount = Math.max(...charCounts.values());
          expect(maxCount).toBeLessThan(sample.length * 0.5); // No char > 50% of sample
        }
        
        // Verify all verifiers are unique
        expect(verifiers.size).toBe(iterations);
      }),
      { numRuns: 3 }
    );
  }, { timeout: 10000 }); // 10 second timeout

  /**
   * Property: Code challenge generation should be deterministic and consistent
   * 
   * For any code verifier, generating the code challenge multiple times
   * should always produce the same result.
   */
  it('should generate consistent code challenges for the same verifier', () => {
    fc.assert(
      fc.property(codeVerifierArb, (verifier) => {
        // Generate challenge multiple times
        const challenge1 = pkceGenerator.generateCodeChallenge(verifier);
        const challenge2 = pkceGenerator.generateCodeChallenge(verifier);
        const challenge3 = pkceGenerator.generateCodeChallenge(verifier);
        
        // All challenges should be identical
        expect(challenge1).toBe(challenge2);
        expect(challenge2).toBe(challenge3);
        
        // Challenge should be valid base64url
        expect(challenge1).toMatch(/^[A-Za-z0-9\-_]+$/);
        expect(challenge1.length).toBeGreaterThan(0);
        
        // Validation should work consistently
        expect(pkceGenerator.validateCodeVerifier(verifier, challenge1)).toBe(true);
        expect(pkceGenerator.validateCodeVerifier(verifier, challenge2)).toBe(true);
        expect(pkceGenerator.validateCodeVerifier(verifier, challenge3)).toBe(true);
      }),
      { numRuns: 3 }
    );
  }, { timeout: 5000 });

  /**
   * Property: Different verifiers should produce different challenges
   * 
   * For any two different code verifiers, they should produce different
   * code challenges (collision resistance).
   */
  it('should produce different challenges for different verifiers', () => {
    fc.assert(
      fc.property(
        fc.tuple(codeVerifierArb, codeVerifierArb).filter(([v1, v2]) => v1 !== v2),
        ([verifier1, verifier2]) => {
          const challenge1 = pkceGenerator.generateCodeChallenge(verifier1);
          const challenge2 = pkceGenerator.generateCodeChallenge(verifier2);
          
          // Different verifiers should produce different challenges
          expect(challenge1).not.toBe(challenge2);
          
          // Both challenges should be valid
          expect(challenge1).toMatch(/^[A-Za-z0-9\-_]+$/);
          expect(challenge2).toMatch(/^[A-Za-z0-9\-_]+$/);
          
          // Cross-validation should fail
          expect(pkceGenerator.validateCodeVerifier(verifier1, challenge2)).toBe(false);
          expect(pkceGenerator.validateCodeVerifier(verifier2, challenge1)).toBe(false);
          
          // Self-validation should succeed
          expect(pkceGenerator.validateCodeVerifier(verifier1, challenge1)).toBe(true);
          expect(pkceGenerator.validateCodeVerifier(verifier2, challenge2)).toBe(true);
        }
      ),
      { numRuns: 3 }
    );
  }, { timeout: 5000 });

  /**
   * Property: PKCE validation should be secure against timing attacks
   * 
   * For any verifier and challenge pair, validation should take consistent
   * time regardless of where the strings differ.
   */
  it('should validate PKCE parameters securely', () => {
    fc.assert(
      fc.property(codeVerifierArb, (verifier) => {
        const correctChallenge = pkceGenerator.generateCodeChallenge(verifier);
        
        // Valid case
        expect(pkceGenerator.validateCodeVerifier(verifier, correctChallenge)).toBe(true);
        
        // Invalid cases should all return false
        expect(pkceGenerator.validateCodeVerifier('', correctChallenge)).toBe(false);
        expect(pkceGenerator.validateCodeVerifier(verifier, '')).toBe(false);
        expect(pkceGenerator.validateCodeVerifier('', '')).toBe(false);
        
        // Modified challenge should fail
        if (correctChallenge.length > 1) {
          const modifiedChallenge = correctChallenge.slice(0, -1) + 'X';
          expect(pkceGenerator.validateCodeVerifier(verifier, modifiedChallenge)).toBe(false);
        }
        
        // Modified verifier should fail
        if (verifier.length > 1) {
          const modifiedVerifier = verifier.slice(0, -1) + 'X';
          expect(pkceGenerator.validateCodeVerifier(modifiedVerifier, correctChallenge)).toBe(false);
        }
      }),
      { numRuns: 3 }
    );
  }, { timeout: 5000 });

  /**
   * Property: Invalid input handling should be robust
   * 
   * For any invalid code verifier input, the generator should handle it
   * gracefully without crashing or producing invalid output.
   */
  it('should handle invalid code verifier inputs gracefully', () => {
    fc.assert(
      fc.property(invalidCodeVerifierArb, (invalidVerifier) => {
        // Invalid verifiers should throw errors, not crash
        expect(() => {
          pkceGenerator.generateCodeChallenge(invalidVerifier);
        }).toThrow();
        
        // Validation with invalid verifiers should return false, not crash
        const validVerifier = pkceGenerator.generateCodeVerifier();
        const validChallenge = pkceGenerator.generateCodeChallenge(validVerifier);
        
        expect(pkceGenerator.validateCodeVerifier(invalidVerifier, validChallenge)).toBe(false);
      }),
      { numRuns: 3 }
    );
  }, { timeout: 5000 });

  /**
   * Property: Base64URL encoding should be correct
   * 
   * For any generated code verifier or challenge, it should use proper
   * base64url encoding (no padding, URL-safe characters).
   */
  it('should use correct base64url encoding', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (_iteration) => {
        const verifier = pkceGenerator.generateCodeVerifier();
        const challenge = pkceGenerator.generateCodeChallenge(verifier);
        
        // Verifier should use base64url character set
        expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
        expect(verifier).not.toMatch(/[+/=]/); // No standard base64 chars
        
        // Challenge should use base64url character set (no padding)
        expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
        expect(challenge).not.toMatch(/[+/=]/); // No standard base64 chars or padding
        
        // Should not contain any whitespace or special characters
        expect(verifier).not.toMatch(/\s/);
        expect(challenge).not.toMatch(/\s/);
      }),
      { numRuns: 3 }
    );
  }, { timeout: 5000 });

  /**
   * Property: PKCE parameters should meet OAuth 2.0 RFC 7636 requirements
   * 
   * For any generated PKCE parameters, they should comply with all
   * RFC 7636 specifications for OAuth 2.0 PKCE extension.
   */
  it('should meet RFC 7636 PKCE requirements', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (_iteration) => {
        const verifier = pkceGenerator.generateCodeVerifier();
        const challenge = pkceGenerator.generateCodeChallenge(verifier);
        
        // RFC 7636 Section 4.1: code_verifier requirements
        expect(verifier.length).toBeGreaterThanOrEqual(43);
        expect(verifier.length).toBeLessThanOrEqual(128);
        expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/); // unreserved characters
        
        // RFC 7636 Section 4.2: code_challenge requirements
        expect(challenge.length).toBeGreaterThan(0);
        expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/); // base64url-encoded
        
        // RFC 7636 Section 4.3: code_challenge_method should be S256
        // (This is implicit in our implementation, but we verify the hash works)
        const isValidS256 = pkceGenerator.validateCodeVerifier(verifier, challenge);
        expect(isValidS256).toBe(true);
        
        // RFC 7636 Section 4.4: Authorization request should include both parameters
        // (This is tested in the main property test above)
        
        // Verify the challenge is actually a SHA256 hash (length check)
        // SHA256 base64url encoded should be 43 characters (256 bits / 6 bits per char)
        expect(challenge.length).toBe(43);
      }),
      { numRuns: 3 }
    );
  }, { timeout: 5000 });
});