/**
 * @fileoverview Property-based tests for token counting accuracy
 * @module features/model/adapters/__tests__/token-counting-accuracy.property.test
 *
 * **Feature: multi-provider-support, Property 5: Token counting accuracy**
 * **Validates: Requirements 1.5, 2.5, 3.5**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import type { Message } from '../../../../shared/types/index.js';
import type { ModelConfig } from '../../../../shared/types/models.js';
import type { IModelAdapter } from '../types.js';
import { AnthropicAdapter } from '../anthropic.js';
import { GoogleAdapter } from '../google.js';
import { OpenRouterAdapter } from '../openrouter.js';
import { CohereAdapter } from '../cohere.js';
import { MistralAdapter } from '../mistral.js';
import { TogetherAdapter } from '../together.js';
import { PerplexityAdapter } from '../perplexity.js';
import { OllamaAdapter } from '../ollama.js';

// =============================================================================
// MOCKS
// =============================================================================

// Mock external dependencies
vi.mock('@anthropic-ai/sdk');
vi.mock('@google/generative-ai');
vi.mock('openai');
vi.mock('cohere-ai');
vi.mock('@mistralai/mistralai');
vi.mock('ollama');

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generate valid message roles.
 */
const messageRoleArb = fc.constantFrom('system', 'user', 'assistant', 'tool');

/**
 * Generate text content of varying lengths.
 */
const textContentArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }),      // Short text
  fc.string({ minLength: 100, maxLength: 500 }),   // Medium text
  fc.string({ minLength: 1000, maxLength: 2000 })  // Long text
);

/**
 * Generate valid messages with varying content lengths.
 */
const messageArb: fc.Arbitrary<Message> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  role: messageRoleArb,
  content: textContentArb,
  timestamp: fc.date(),
});

/**
 * Generate model configurations for providers that support token counting.
 */
const tokenCountingModelConfigArb = fc.oneof(
  // Anthropic config
  fc.record({
    provider: fc.constant('anthropic' as const),
    model: fc.constantFrom('claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'),
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
  }),
  // Google config
  fc.record({
    provider: fc.constant('google' as const),
    model: fc.constantFrom('gemini-1.5-pro', 'gemini-1.5-flash'),
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
  }),
  // OpenRouter config
  fc.record({
    provider: fc.constant('openrouter' as const),
    model: fc.constantFrom('openai/gpt-4o', 'anthropic/claude-3.5-sonnet'),
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
  }),
  // Cohere config
  fc.record({
    provider: fc.constant('cohere' as const),
    model: fc.constantFrom('command', 'command-r'),
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
  }),
  // Mistral config
  fc.record({
    provider: fc.constant('mistral' as const),
    model: fc.constantFrom('mistral-large-latest', 'mistral-small-latest'),
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
  }),
  // Together config
  fc.record({
    provider: fc.constant('together' as const),
    model: fc.constantFrom('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'),
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
  }),
  // Perplexity config
  fc.record({
    provider: fc.constant('perplexity' as const),
    model: fc.constantFrom('llama-3.1-sonar-large-128k-online', 'llama-3.1-8b-instruct'),
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
  }),
  // Ollama config
  fc.record({
    provider: fc.constant('ollama' as const),
    model: fc.constantFrom('llama3.1:8b', 'mistral:7b'),
    baseUrl: fc.constant('http://localhost:11434'),
  })
);

// =============================================================================
// ADAPTER FACTORY
// =============================================================================

/**
 * Creates an adapter instance from configuration.
 */
function createAdapter(config: ModelConfig): IModelAdapter {
  // Mock the external API calls to prevent actual network requests
  const mockEnv = {
    ANTHROPIC_API_KEY: config.provider === 'anthropic' ? config.apiKey : undefined,
    GOOGLE_API_KEY: config.provider === 'google' ? config.apiKey : undefined,
    OPENROUTER_API_KEY: config.provider === 'openrouter' ? config.apiKey : undefined,
    COHERE_API_KEY: config.provider === 'cohere' ? config.apiKey : undefined,
    MISTRAL_API_KEY: config.provider === 'mistral' ? config.apiKey : undefined,
    TOGETHER_API_KEY: config.provider === 'together' ? config.apiKey : undefined,
    PERPLEXITY_API_KEY: config.provider === 'perplexity' ? config.apiKey : undefined,
  };

  // Temporarily set environment variables
  const originalEnv = { ...process.env };
  Object.assign(process.env, mockEnv);

  try {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicAdapter(config);
      case 'google':
        return new GoogleAdapter(config);
      case 'openrouter':
        return new OpenRouterAdapter(config);
      case 'cohere':
        return new CohereAdapter(config);
      case 'mistral':
        return new MistralAdapter(config);
      case 'together':
        return new TogetherAdapter(config);
      case 'perplexity':
        return new PerplexityAdapter(config);
      case 'ollama':
        return new OllamaAdapter(config);
      default:
        throw new Error(`Unsupported provider: ${(config as any).provider}`);
    }
  } finally {
    // Restore original environment
    process.env = originalEnv;
  }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Token Counting Accuracy Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('**Feature: multi-provider-support, Property 5: Token counting accuracy**', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        fc.array(messageArb, { minLength: 1, maxLength: 3 }),
        (config, messages) => {
          const adapter = createAdapter(config);
          
          // Token counting should be consistent across multiple calls
          const count1 = adapter.countTokens(messages);
          const count2 = adapter.countTokens(messages);
          const count3 = adapter.countTokens(messages);
          
          expect(count1).toBe(count2);
          expect(count2).toBe(count3);
          
          // Token count should be a positive integer
          expect(count1).toBeGreaterThan(0);
          expect(Number.isInteger(count1)).toBe(true);
          
          // Token count should be reasonable (not extremely high or low)
          const totalCharacters = messages.reduce((sum, msg) => {
            const content = typeof msg.content === 'string' ? msg.content : '';
            return sum + content.length + msg.role.length;
          }, 0);
          
          // Token count should be roughly proportional to character count
          // Most tokenizers use 3-5 characters per token
          const minExpectedTokens = Math.max(1, Math.floor(totalCharacters / 10));
          const maxExpectedTokens = Math.ceil(totalCharacters / 2);
          
          expect(count1).toBeGreaterThanOrEqual(minExpectedTokens);
          expect(count1).toBeLessThanOrEqual(maxExpectedTokens);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property: Token counting is monotonic with content length', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.string({ minLength: 200, maxLength: 500 }),
        (config, shortText, longText) => {
          const adapter = createAdapter(config);
          
          const shortMessage: Message = {
            id: 'test-short',
            role: 'user',
            content: shortText,
            timestamp: new Date(),
          };
          
          const longMessage: Message = {
            id: 'test-long',
            role: 'user',
            content: longText,
            timestamp: new Date(),
          };
          
          const shortCount = adapter.countTokens([shortMessage]);
          const longCount = adapter.countTokens([longMessage]);
          
          // Longer content should generally result in more tokens
          expect(longCount).toBeGreaterThanOrEqual(shortCount);
          
          // The difference should be reasonable
          const ratio = longCount / shortCount;
          expect(ratio).toBeGreaterThan(1);
          expect(ratio).toBeLessThan(20); // Shouldn't be extremely different
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property: Token counting is additive for multiple messages', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        messageArb,
        messageArb,
        (config, message1, message2) => {
          const adapter = createAdapter(config);
          
          const count1 = adapter.countTokens([message1]);
          const count2 = adapter.countTokens([message2]);
          const combinedCount = adapter.countTokens([message1, message2]);
          
          // Combined count should be roughly the sum of individual counts
          // Allow for some overhead due to message structure
          const expectedMin = count1 + count2;
          const expectedMax = count1 + count2 + 50; // Allow for message overhead
          
          expect(combinedCount).toBeGreaterThanOrEqual(expectedMin);
          expect(combinedCount).toBeLessThanOrEqual(expectedMax);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property: Empty messages have minimal token count', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        (config) => {
          const adapter = createAdapter(config);
          
          const emptyMessage: Message = {
            id: 'test-empty',
            role: 'user',
            content: '',
            timestamp: new Date(),
          };
          
          const emptyCount = adapter.countTokens([emptyMessage]);
          const noMessagesCount = adapter.countTokens([]);
          
          // Empty message should have minimal tokens (role overhead)
          expect(emptyCount).toBeGreaterThanOrEqual(0);
          expect(emptyCount).toBeLessThanOrEqual(10); // Should be very small
          
          // No messages should have zero or minimal count
          expect(noMessagesCount).toBeGreaterThanOrEqual(0);
          expect(noMessagesCount).toBeLessThanOrEqual(5);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: Token counting handles different message roles consistently', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        fc.string({ minLength: 20, maxLength: 100 }),
        (config, content) => {
          const adapter = createAdapter(config);
          
          const userMessage: Message = {
            id: 'test-user',
            role: 'user',
            content,
            timestamp: new Date(),
          };
          
          const assistantMessage: Message = {
            id: 'test-assistant',
            role: 'assistant',
            content,
            timestamp: new Date(),
          };
          
          const systemMessage: Message = {
            id: 'test-system',
            role: 'system',
            content,
            timestamp: new Date(),
          };
          
          const userCount = adapter.countTokens([userMessage]);
          const assistantCount = adapter.countTokens([assistantMessage]);
          const systemCount = adapter.countTokens([systemMessage]);
          
          // Token counts should be similar for same content, different roles
          // Allow for small differences due to role overhead
          const maxDifference = Math.max(5, Math.floor(userCount * 0.1));
          
          expect(Math.abs(userCount - assistantCount)).toBeLessThanOrEqual(maxDifference);
          expect(Math.abs(userCount - systemCount)).toBeLessThanOrEqual(maxDifference);
          expect(Math.abs(assistantCount - systemCount)).toBeLessThanOrEqual(maxDifference);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: Token counting is stable across adapter instances', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        fc.array(messageArb, { minLength: 1, maxLength: 2 }),
        (config, messages) => {
          const adapter1 = createAdapter(config);
          const adapter2 = createAdapter(config);
          
          const count1 = adapter1.countTokens(messages);
          const count2 = adapter2.countTokens(messages);
          
          // Different adapter instances should give same token count
          expect(count1).toBe(count2);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: Token counting handles special characters appropriately', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        fc.string({ minLength: 20, maxLength: 100 }),
        (config, baseText) => {
          const adapter = createAdapter(config);
          
          // Test with various special characters
          const specialChars = ['🚀', '💻', '🎉', '中文', 'العربية', 'русский'];
          const specialText = baseText + specialChars.join('');
          
          const baseMessage: Message = {
            id: 'test-base',
            role: 'user',
            content: baseText,
            timestamp: new Date(),
          };
          
          const specialMessage: Message = {
            id: 'test-special',
            role: 'user',
            content: specialText,
            timestamp: new Date(),
          };
          
          const baseCount = adapter.countTokens([baseMessage]);
          const specialCount = adapter.countTokens([specialMessage]);
          
          // Special characters should increase token count
          expect(specialCount).toBeGreaterThan(baseCount);
          
          // But not excessively (Unicode should be handled reasonably)
          const ratio = specialCount / baseCount;
          expect(ratio).toBeLessThan(5); // Shouldn't explode the token count
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property: Token counting performance is reasonable', () => {
    fc.assert(
      fc.property(
        tokenCountingModelConfigArb,
        fc.array(messageArb, { minLength: 5, maxLength: 10 }),
        (config, messages) => {
          const adapter = createAdapter(config);
          
          // Measure token counting performance
          const startTime = Date.now();
          const count = adapter.countTokens(messages);
          const endTime = Date.now();
          
          const duration = endTime - startTime;
          
          // Token counting should be fast (under 100ms for reasonable message sets)
          expect(duration).toBeLessThan(100);
          expect(count).toBeGreaterThan(0);
        }
      ),
      { numRuns: 10 }
    );
  });
});