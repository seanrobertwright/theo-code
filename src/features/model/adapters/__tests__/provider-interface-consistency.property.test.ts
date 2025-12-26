/**
 * @fileoverview Property-based tests for provider interface consistency
 * @module features/model/adapters/__tests__/provider-interface-consistency.property.test
 *
 * **Feature: multi-provider-support, Property 1: Provider interface consistency**
 * **Validates: Requirements 1.2, 2.2, 3.2**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import type { Message, UniversalToolDefinition } from '../../../../shared/types/index.js';
import type { StreamChunk, ModelConfig } from '../../../../shared/types/models.js';
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
 * Generate simple text content.
 */
const textContentArb = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Generate valid messages.
 */
const messageArb: fc.Arbitrary<Message> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  role: messageRoleArb,
  content: textContentArb,
  timestamp: fc.date(),
});

/**
 * Generate valid model configurations for different providers.
 */
const modelConfigArb = fc.oneof(
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

/**
 * Generate valid universal tool definitions.
 */
const universalToolDefinitionArb: fc.Arbitrary<UniversalToolDefinition> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(name => 
    /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)
  ),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  parameters: fc.record({
    type: fc.constant('object' as const),
    properties: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      fc.record({
        type: fc.constantFrom('string', 'number', 'boolean'),
        description: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      }),
      { minKeys: 1, maxKeys: 3 }
    ),
    required: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 2 }), { nil: undefined }),
  }),
});

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

describe('Provider Interface Consistency Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('**Feature: multi-provider-support, Property 1: Provider interface consistency**', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        (config) => {
          const adapter = createAdapter(config);
          
          // All adapters should implement the same interface
          expect(adapter).toHaveProperty('provider');
          expect(adapter).toHaveProperty('model');
          expect(adapter).toHaveProperty('contextLimit');
          expect(adapter).toHaveProperty('supportsToolCalling');
          expect(adapter).toHaveProperty('generateStream');
          expect(adapter).toHaveProperty('countTokens');
          expect(adapter).toHaveProperty('validateConfig');
          
          // Provider should match configuration
          expect(adapter.provider).toBe(config.provider);
          expect(adapter.model).toBe(config.model);
          
          // Context limit should be a positive number
          expect(adapter.contextLimit).toBeGreaterThan(0);
          expect(typeof adapter.contextLimit).toBe('number');
          
          // Tool calling support should be a boolean
          expect(typeof adapter.supportsToolCalling).toBe('boolean');
          
          // Methods should be functions
          expect(typeof adapter.generateStream).toBe('function');
          expect(typeof adapter.countTokens).toBe('function');
          expect(typeof adapter.validateConfig).toBe('function');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property: All adapters have consistent token counting behavior', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        fc.array(messageArb, { minLength: 1, maxLength: 3 }),
        (config, messages) => {
          const adapter = createAdapter(config);
          
          // Token counting should be deterministic
          const count1 = adapter.countTokens(messages);
          const count2 = adapter.countTokens(messages);
          
          expect(count1).toBe(count2);
          expect(count1).toBeGreaterThan(0);
          expect(typeof count1).toBe('number');
          expect(Number.isInteger(count1)).toBe(true);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: All adapters handle empty message arrays consistently', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        (config) => {
          const adapter = createAdapter(config);
          
          // Empty message arrays should return 0 or minimal token count
          const emptyCount = adapter.countTokens([]);
          
          expect(emptyCount).toBeGreaterThanOrEqual(0);
          expect(typeof emptyCount).toBe('number');
          expect(Number.isInteger(emptyCount)).toBe(true);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: All adapters validate configuration consistently', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        (config) => {
          const adapter = createAdapter(config);
          
          // validateConfig should not throw for valid configurations
          expect(() => adapter.validateConfig()).not.toThrow();
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: Tool calling support is consistent with model capabilities', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        (config) => {
          const adapter = createAdapter(config);
          
          // Tool calling support should be consistent for the same model
          const supportsTools1 = adapter.supportsToolCalling;
          const supportsTools2 = adapter.supportsToolCalling;
          
          expect(supportsTools1).toBe(supportsTools2);
          expect(typeof supportsTools1).toBe('boolean');
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: Context limits are reasonable and consistent', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        (config) => {
          const adapter = createAdapter(config);
          
          // Context limits should be reasonable (between 1K and 2M tokens)
          expect(adapter.contextLimit).toBeGreaterThanOrEqual(1000);
          expect(adapter.contextLimit).toBeLessThanOrEqual(2000000);
          
          // Should be consistent across multiple accesses
          const limit1 = adapter.contextLimit;
          const limit2 = adapter.contextLimit;
          expect(limit1).toBe(limit2);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('Property: Token counting scales with message length', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 100, maxLength: 200 }),
        (config, shortText, longText) => {
          const adapter = createAdapter(config);
          
          const shortMessage: Message = {
            id: 'test-1',
            role: 'user',
            content: shortText,
            timestamp: new Date(),
          };
          
          const longMessage: Message = {
            id: 'test-2',
            role: 'user',
            content: longText,
            timestamp: new Date(),
          };
          
          const shortCount = adapter.countTokens([shortMessage]);
          const longCount = adapter.countTokens([longMessage]);
          
          // Longer messages should generally have more tokens
          expect(longCount).toBeGreaterThanOrEqual(shortCount);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property: Provider and model properties are consistent', () => {
    fc.assert(
      fc.property(
        modelConfigArb,
        (config) => {
          const adapter = createAdapter(config);
          
          const originalProvider = adapter.provider;
          const originalModel = adapter.model;
          const originalContextLimit = adapter.contextLimit;
          const originalSupportsToolCalling = adapter.supportsToolCalling;
          
          // Properties should remain the same after multiple accesses
          expect(adapter.provider).toBe(originalProvider);
          expect(adapter.model).toBe(originalModel);
          expect(adapter.contextLimit).toBe(originalContextLimit);
          expect(adapter.supportsToolCalling).toBe(originalSupportsToolCalling);
          
          // Properties should be consistent with configuration
          expect(adapter.provider).toBe(config.provider);
          expect(adapter.model).toBe(config.model);
        }
      ),
      { numRuns: 10 }
    );
  });
});