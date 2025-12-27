/**
 * @fileoverview Property-based tests for authentication validation
 * @module features/model/__tests__/authentication-validation.property
 *
 * Feature: multi-provider-support, Property 3: Authentication validation completeness
 * **Validates: Requirements 1.1, 2.1, 3.1, 5.1**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { ModelProvider } from '../../../shared/types/models.js';
import { validateApiKey } from '../validation.js';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generate valid provider names.
 */
const providerArb = fc.constantFrom(
  'openai',
  'anthropic', 
  'google',
  'openrouter',
  'cohere',
  'mistral',
  'together',
  'perplexity',
  'ollama'
);

/**
 * Generate valid API keys for different providers.
 */
const validApiKeyArb = (provider: ModelProvider) => {
  switch (provider) {
    case 'openai':
      return fc.string({ minLength: 20 }).map(s => `sk-${s}`);
    case 'anthropic':
      return fc.string({ minLength: 20 }).map(s => `sk-ant-${s}`);
    case 'openrouter':
      return fc.string({ minLength: 20 }).map(s => `sk-or-${s}`);
    case 'google':
    case 'cohere':
    case 'mistral':
    case 'together':
    case 'perplexity':
      return fc.string({ minLength: 15 });
    case 'ollama':
      return fc.constant(''); // Ollama doesn't require API keys
    default:
      return fc.string({ minLength: 10 });
  }
};

/**
 * Generate invalid API keys for different providers.
 */
const invalidApiKeyArb = (provider: ModelProvider) => {
  switch (provider) {
    case 'openai':
      return fc.oneof(
        fc.string({ maxLength: 10 }), // Too short
        fc.string({ minLength: 20 }).map(s => `invalid-${s}`), // Wrong prefix
        fc.constant(''), // Empty
      );
    case 'anthropic':
      return fc.oneof(
        fc.string({ maxLength: 10 }), // Too short
        fc.string({ minLength: 20 }).map(s => `sk-${s}`), // Wrong prefix
        fc.constant(''), // Empty
      );
    case 'openrouter':
      return fc.oneof(
        fc.string({ maxLength: 10 }), // Too short
        fc.string({ minLength: 20 }).map(s => `sk-${s}`), // Wrong prefix
        fc.constant(''), // Empty
      );
    case 'google':
    case 'cohere':
    case 'mistral':
    case 'together':
    case 'perplexity':
      return fc.oneof(
        fc.string({ maxLength: 5 }), // Too short
        fc.constant(''), // Empty
      );
    case 'ollama':
      return fc.constant('invalid-key'); // Ollama doesn't use API keys, so any non-empty is "invalid"
    default:
      return fc.string({ maxLength: 5 });
  }
};

/**
 * Generate any valid API key with its provider.
 */
const validApiKeyWithProviderArb = providerArb.chain(provider => 
  validApiKeyArb(provider).map(apiKey => ({ provider, apiKey }))
);

/**
 * Generate any invalid API key with its provider.
 */
const invalidApiKeyWithProviderArb = providerArb.chain(provider => 
  invalidApiKeyArb(provider).map(apiKey => ({ provider, apiKey }))
);

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Authentication Validation Properties', () => {
  it('Property 3: Authentication validation completeness - valid keys pass', () => {
    fc.assert(
      fc.property(validApiKeyWithProviderArb, ({ provider, apiKey }) => {
        const result = validateApiKey(provider, apiKey);
        
        // Valid API keys should pass validation
        expect(result.provider).toBe(provider);
        
        // Ollama is special case - it doesn't require API keys
        if (provider === 'ollama') {
          expect(result.valid).toBe(true);
          expect(result.error).toBeNull();
        } else if (apiKey.length > 0) {
          // Non-empty keys for providers that need them should be valid
          expect(result.valid).toBe(true);
          expect(result.error).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property 3: Authentication validation completeness - invalid keys fail', () => {
    fc.assert(
      fc.property(invalidApiKeyWithProviderArb, ({ provider, apiKey }) => {
        const result = validateApiKey(provider, apiKey);
        
        // Invalid API keys should fail validation
        expect(result.provider).toBe(provider);
        
        // Ollama is special case - it accepts any key (even invalid ones)
        if (provider === 'ollama') {
          expect(result.valid).toBe(true);
        } else {
          // For other providers, invalid keys should fail
          expect(result.valid).toBe(false);
          expect(result.error).not.toBeNull();
          expect(typeof result.error).toBe('string');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property: API key validation is deterministic', () => {
    fc.assert(
      fc.property(
        providerArb,
        fc.string(),
        (provider, apiKey) => {
          const result1 = validateApiKey(provider, apiKey);
          const result2 = validateApiKey(provider, apiKey);
          
          // Validation should be deterministic
          expect(result1.valid).toBe(result2.valid);
          expect(result1.error).toBe(result2.error);
          expect(result1.provider).toBe(result2.provider);
          expect(result1.hasPermissions).toBe(result2.hasPermissions);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Provider-specific validation rules are consistent', () => {
    fc.assert(
      fc.property(providerArb, (provider) => {
        // Test with empty key
        const emptyResult = validateApiKey(provider, '');
        
        // Test with very short key
        const shortResult = validateApiKey(provider, 'abc');
        
        // Test with long key with correct format
        let correctFormatKey: string;
        switch (provider) {
          case 'openai':
            correctFormatKey = 'sk-' + 'a'.repeat(20);
            break;
          case 'anthropic':
            correctFormatKey = 'sk-ant-' + 'a'.repeat(20);
            break;
          case 'openrouter':
            correctFormatKey = 'sk-or-' + 'a'.repeat(20);
            break;
          case 'ollama':
            correctFormatKey = ''; // Ollama doesn't need keys
            break;
          default:
            correctFormatKey = 'a'.repeat(15);
        }
        
        const correctResult = validateApiKey(provider, correctFormatKey);
        
        // Validation results should be consistent with provider rules
        expect(emptyResult.provider).toBe(provider);
        expect(shortResult.provider).toBe(provider);
        expect(correctResult.provider).toBe(provider);
        
        // Ollama should always pass
        if (provider === 'ollama') {
          expect(emptyResult.valid).toBe(true);
          expect(shortResult.valid).toBe(true);
          expect(correctResult.valid).toBe(true);
        } else {
          // Other providers should have consistent validation
          expect(emptyResult.valid).toBe(false);
          expect(shortResult.valid).toBe(false);
          expect(correctResult.valid).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });

  it('Property: Error messages are informative for invalid keys', () => {
    fc.assert(
      fc.property(invalidApiKeyWithProviderArb, ({ provider, apiKey }) => {
        const result = validateApiKey(provider, apiKey);
        
        // Skip Ollama since it doesn't validate API keys
        if (provider === 'ollama') {
          return;
        }
        
        if (!result.valid) {
          // Error message should be informative
          expect(result.error).not.toBeNull();
          expect(result.error!.length).toBeGreaterThan(0);
          
          // Error message should mention the provider or key format
          const errorLower = result.error!.toLowerCase();
          const providerMentioned = errorLower.includes(provider) || 
                                   errorLower.includes('api key') ||
                                   errorLower.includes('key');
          expect(providerMentioned).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property: Validation handles edge cases gracefully', () => {
    fc.assert(
      fc.property(providerArb, (provider) => {
        // Test edge cases
        const edgeCases = [
          '', // Empty string
          ' ', // Whitespace
          '\n', // Newline
          '\t', // Tab
          'null', // String "null"
          'undefined', // String "undefined"
          '0', // String "0"
          'false', // String "false"
        ];
        
        for (const edgeCase of edgeCases) {
          const result = validateApiKey(provider, edgeCase);
          
          // Should not throw and should return valid result structure
          expect(result).toBeDefined();
          expect(result.provider).toBe(provider);
          expect(typeof result.valid).toBe('boolean');
          expect(typeof result.hasPermissions).toBe('boolean');
          
          if (result.error !== null) {
            expect(typeof result.error).toBe('string');
          }
        }
      }),
      { numRuns: 50 }
    );
  });

  it('Property: Validation preserves provider identity', () => {
    fc.assert(
      fc.property(
        providerArb,
        fc.string(),
        (provider, apiKey) => {
          const result = validateApiKey(provider, apiKey);
          
          // Provider should always be preserved in result
          expect(result.provider).toBe(provider);
        }
      ),
      { numRuns: 100 }
    );
  });
});