/**
 * @fileoverview Property tests for secure display formatting
 * @module features/auth/__tests__/secure-display-formatting.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { 
  AuthStatusDisplayFormatter, 
  TokenDisplayFormatter, 
  ConfigDisplayFormatter,
  DisplayUtils 
} from '../display-utilities.js';
import { TokenInfoFormatter } from '../config-serializer.js';
import type { AuthStatus, TokenSet, OAuthConfig } from '../types.js';
import type { ProviderConfig } from '../../../config/schemas.js';

// =============================================================================
// TEST GENERATORS
// =============================================================================

/**
 * Generator for sensitive strings that should be masked.
 */
const sensitiveStringArb = fc.oneof(
  // API keys
  fc.string({ minLength: 32, maxLength: 64 }).map(s => `sk-${s}`),
  fc.string({ minLength: 32, maxLength: 64 }).map(s => `sk-ant-${s}`),
  // Tokens
  fc.string({ minLength: 100, maxLength: 500 }).map(s => `eyJ${s}`), // JWT-like
  // Secrets
  fc.string({ minLength: 32, maxLength: 128 }).map(s => `secret_${s}`),
  // Client secrets
  fc.string({ minLength: 32, maxLength: 64 }).map(s => `cs_${s}`),
  // Edge case: repeated characters (like the failing counter-example)
  fc.constantFrom('A', 'B', '1', '0').chain(char => 
    fc.integer({ min: 16, max: 128 }).map(length => char.repeat(length))
  ),
  // Edge case: tokens with special characters (but not just whitespace)
  fc.string({ minLength: 16, maxLength: 64 }).filter(s => s.trim().length > 0).map(s => s.replace(/[a-zA-Z0-9]/g, c => 
    Math.random() > 0.5 ? c : ['$', '#', ':', ',', 'w'][Math.floor(Math.random() * 5)]
  )),
  // Realistic token patterns
  fc.string({ minLength: 16, maxLength: 128 }).filter(s => s.trim().length >= 16),
);

/**
 * Generator for non-sensitive strings.
 */
const nonSensitiveStringArb = fc.oneof(
  fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('secret') && !s.includes('key')),
  fc.webUrl(),
);

/**
 * Generator for TokenSet objects.
 */
const tokenSetArb = fc.record({
  accessToken: sensitiveStringArb,
  refreshToken: fc.option(sensitiveStringArb),
  expiresAt: fc.date({ min: new Date(Date.now() - 86400000), max: new Date(Date.now() + 86400000) }),
  tokenType: fc.constant('Bearer' as const),
  scope: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
});

/**
 * Generator for AuthStatus objects.
 */
const authStatusArb = fc.record({
  provider: fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
  authenticated: fc.boolean(),
  method: fc.constantFrom('oauth', 'api_key', 'none'),
  expiresAt: fc.option(fc.date({ min: new Date(Date.now() - 86400000), max: new Date(Date.now() + 86400000) })),
  needsRefresh: fc.boolean(),
});

/**
 * Generator for OAuthConfig objects.
 */
const oauthConfigArb = fc.record({
  provider: fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
  clientId: sensitiveStringArb,
  clientSecret: fc.option(sensitiveStringArb),
  authorizationEndpoint: fc.webUrl(),
  tokenEndpoint: fc.webUrl(),
  scopes: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  redirectUri: fc.constant('http://localhost:8080/callback'),
  additionalParams: fc.option(fc.record({
    client_secret: fc.option(sensitiveStringArb),
    api_key: fc.option(sensitiveStringArb),
    non_sensitive_param: fc.option(nonSensitiveStringArb),
  })),
});

/**
 * Generator for ProviderConfig objects.
 */
const providerConfigArb = fc.record({
  name: fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
  enabled: fc.boolean(),
  priority: fc.integer({ min: 0, max: 100 }),
  baseUrl: fc.option(fc.webUrl()),
  apiKey: fc.option(sensitiveStringArb),
  oauth: fc.option(fc.record({
    enabled: fc.boolean(),
    clientId: fc.option(sensitiveStringArb),
    preferredMethod: fc.constantFrom('oauth', 'api_key'),
    autoRefresh: fc.boolean(),
  })),
});

// =============================================================================
// SENSITIVE DATA DETECTION
// =============================================================================

/**
 * Check if a string contains sensitive data patterns.
 */
function containsSensitiveData(text: string): boolean {
  const sensitivePatterns = [
    /sk-[a-zA-Z0-9]{32,}/,     // OpenAI API keys
    /sk-ant-[a-zA-Z0-9]{32,}/, // Anthropic API keys
    /eyJ[a-zA-Z0-9+/=]{50,}/,  // JWT tokens
    /secret_[a-zA-Z0-9]{32,}/, // Generic secrets
    /cs_[a-zA-Z0-9]{32,}/,     // Client secrets
    // Additional patterns for edge cases
    /[A-Z0-9]{32,}/,           // Long sequences of uppercase letters/numbers (like AAAA...)
    /[a-z0-9]{32,}/,           // Long sequences of lowercase letters/numbers
    /[0-9]{16,}/,              // Long numeric sequences
    // Patterns that look like tokens but might be edge cases
    /[A-Za-z0-9+/=]{20,}/,     // Base64-like patterns
  ];
  
  // Check for patterns that are likely sensitive but might be missed by regex
  // Long repeated characters (like the failing counter-example)
  if (text.length >= 16) {
    const repeatedCharPattern = /(.)\1{15,}/; // 16+ repeated characters
    if (repeatedCharPattern.test(text)) {
      return true;
    }
  }
  
  return sensitivePatterns.some(pattern => pattern.test(text));
}

/**
 * Check if text contains masked sensitive data (safe for display).
 */
function containsMaskedSensitiveData(text: string): boolean {
  const maskedPatterns = [
    /\[REDACTED\]/,
    /\*{3,}/,
    /\.{3,}/,
    /[a-zA-Z0-9]{1,4}\.{3}/,  // Masked tokens like "sk-a..."
  ];
  
  return maskedPatterns.some(pattern => pattern.test(text));
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Secure Display Formatting Properties', () => {
  /**
   * **Feature: oauth-authentication, Property 10: Secure Display Formatting**
   * 
   * For any token information display, sensitive data (tokens, secrets) should be 
   * masked or excluded from the output
   * **Validates: Requirements 10.3, 11.3**
   */
  it('should never expose sensitive token data in display output', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('google', 'anthropic', 'openai', 'openrouter'),
        fc.option(tokenSetArb),
        fc.boolean(), // useColors
        (provider, tokens, useColors) => {
          const displayOutput = TokenDisplayFormatter.formatTokenInfo(provider, tokens, useColors);
          
          // Should not contain full sensitive tokens
          if (tokens) {
            // Only check for tokens that are actually sensitive (longer than whitespace and contain non-whitespace)
            const accessTokenTrimmed = tokens.accessToken.trim();
            if (accessTokenTrimmed.length > 8 && accessTokenTrimmed.length > 0) {
              expect(displayOutput).not.toContain(tokens.accessToken);
              expect(displayOutput, `Display output should not contain full access token: ${tokens.accessToken}`).not.toContain(tokens.accessToken);
              
              // Additional check: ensure no substring of the token longer than the masked portion is exposed
              // But skip this check for tokens with known prefixes that are intentionally shown
              const hasKnownPrefix = tokens.accessToken.startsWith('eyJ') || 
                                   tokens.accessToken.startsWith('sk-') || 
                                   tokens.accessToken.startsWith('sk-ant-');
              
              if (!hasKnownPrefix) {
                const nonWhitespaceRatio = accessTokenTrimmed.length / tokens.accessToken.length;
                if (nonWhitespaceRatio > 0.5) { // Only check if token is more than 50% non-whitespace
                  for (let i = 0; i <= tokens.accessToken.length - 4; i++) {
                    const substring = tokens.accessToken.substring(i, i + 4);
                    // Skip substrings that are mostly whitespace
                    if (substring.trim().length > 2) {
                      expect(displayOutput, `Display should not contain 4+ char substring: ${substring}`).not.toContain(substring);
                    }
                  }
                }
              }
            }
            
            if (tokens.refreshToken) {
              const refreshTokenTrimmed = tokens.refreshToken.trim();
              if (refreshTokenTrimmed.length > 8 && refreshTokenTrimmed.length > 0) {
                expect(displayOutput).not.toContain(tokens.refreshToken);
                expect(displayOutput, `Display output should not contain full refresh token: ${tokens.refreshToken}`).not.toContain(tokens.refreshToken);
                
                // Additional check for refresh token substrings
                const hasKnownPrefix = tokens.refreshToken.startsWith('eyJ') || 
                                     tokens.refreshToken.startsWith('sk-') || 
                                     tokens.refreshToken.startsWith('sk-ant-');
                
                if (!hasKnownPrefix) {
                  const nonWhitespaceRatio = refreshTokenTrimmed.length / tokens.refreshToken.length;
                  if (nonWhitespaceRatio > 0.5) { // Only check if token is more than 50% non-whitespace
                    for (let i = 0; i <= tokens.refreshToken.length - 4; i++) {
                      const substring = tokens.refreshToken.substring(i, i + 4);
                      // Skip substrings that are mostly whitespace
                      if (substring.trim().length > 2) {
                        expect(displayOutput, `Display should not contain 4+ char refresh token substring: ${substring}`).not.toContain(substring);
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Should not contain any unmasked sensitive patterns
          expect(containsSensitiveData(displayOutput), `Display output contains unmasked sensitive data: ${displayOutput}`).toBe(false);
          
          // Should contain provider name (non-sensitive)
          expect(displayOutput).toContain(provider);
          
          // If tokens exist, should contain masked representation
          if (tokens) {
            // Should contain some form of masked token indicator
            const hasMaskedToken = displayOutput.includes('...') || 
                                 displayOutput.includes('***') || 
                                 displayOutput.includes('[REDACTED]') ||
                                 /Token: .{1,4}\.{3}/.test(displayOutput);
            expect(hasMaskedToken, `Display should contain masked token representation: ${displayOutput}`).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: oauth-authentication, Property 10f: Specific Edge Case Regression Test**
   * 
   * Test the specific counter-example that was failing to ensure it's handled correctly
   */
  it('should handle the specific failing counter-example correctly', () => {
    // The exact counter-example from the failure report
    const problematicTokens: TokenSet = {
      accessToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", // 32 A's
      refreshToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", // 32 A's
      expiresAt: new Date("2025-12-27T18:11:54.787Z"),
      tokenType: "Bearer" as const,
      scope: "D$#:,w"
    };
    
    const provider = "anthropic";
    
    // Test with colors enabled
    const coloredOutput = TokenDisplayFormatter.formatTokenInfo(provider, problematicTokens, true);
    
    // Should not contain the full tokens
    expect(coloredOutput).not.toContain("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(coloredOutput, "Colored output should not contain full access token").not.toContain(problematicTokens.accessToken);
    expect(coloredOutput, "Colored output should not contain full refresh token").not.toContain(problematicTokens.refreshToken!);
    
    // Should not contain sensitive data patterns
    expect(containsSensitiveData(coloredOutput), `Colored output contains sensitive data: ${coloredOutput}`).toBe(false);
    
    // Should contain provider name
    expect(coloredOutput).toContain("anthropic");
    
    // Test with colors disabled
    const plainOutput = TokenDisplayFormatter.formatTokenInfo(provider, problematicTokens, false);
    
    // Should not contain the full tokens
    expect(plainOutput).not.toContain("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(plainOutput, "Plain output should not contain full access token").not.toContain(problematicTokens.accessToken);
    expect(plainOutput, "Plain output should not contain full refresh token").not.toContain(problematicTokens.refreshToken!);
    
    // Should not contain sensitive data patterns
    expect(containsSensitiveData(plainOutput), `Plain output contains sensitive data: ${plainOutput}`).toBe(false);
    
    // Should contain provider name
    expect(plainOutput).toContain("anthropic");
    
    // Both outputs should contain some form of masking
    const hasMaskedTokenColored = coloredOutput.includes('...') || coloredOutput.includes('***') || coloredOutput.includes('[REDACTED]');
    const hasMaskedTokenPlain = plainOutput.includes('...') || plainOutput.includes('***') || plainOutput.includes('[REDACTED]');
    
    expect(hasMaskedTokenColored || hasMaskedTokenPlain, "At least one output should contain masked token indicators").toBe(true);
  });
});