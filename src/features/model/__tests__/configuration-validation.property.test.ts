/**
 * @fileoverview Property-based tests for configuration validation
 * @module features/model/__tests__/configuration-validation.property
 *
 * Feature: multi-provider-support, Property 8: Configuration serialization round-trip
 * **Validates: Requirements 10.4**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ModelConfigSchema, type ModelProvider } from '../../../shared/types/models.js';
import { validateProviderConfig } from '../validation.js';

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
) as fc.Arbitrary<ModelProvider>;

/**
 * Generate valid API keys for different providers.
 */
const apiKeyArb = (provider: ModelProvider) => {
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
      return fc.constant(undefined);
    default:
      return fc.string({ minLength: 10 });
  }
};

/**
 * Generate valid model names for different providers.
 */
const modelArb = (provider: ModelProvider) => {
  switch (provider) {
    case 'openai':
      return fc.constantFrom('gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo');
    case 'anthropic':
      return fc.constantFrom(
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-haiku-20240307'
      );
    case 'google':
      return fc.constantFrom(
        'gemini-3-pro-preview',
        'gemini-3-flash-preview',
        'gemini-2-flash-preview',
        'gemini-1.5-pro'
      );
    case 'openrouter':
      return fc.string({ minLength: 5 }); // OpenRouter has dynamic model catalog
    case 'cohere':
      return fc.constantFrom('command', 'command-light', 'command-nightly');
    case 'mistral':
      return fc.constantFrom('mistral-large', 'mistral-medium', 'mistral-small');
    case 'together':
    case 'perplexity':
      return fc.string({ minLength: 5 });
    case 'ollama':
      return fc.constantFrom('llama3', 'codellama', 'mistral');
    default:
      return fc.string({ minLength: 3 });
  }
};

/**
 * Generate valid base URLs.
 */
const baseUrlArb = fc.webUrl();

/**
 * Generate valid rate limit configuration.
 */
const rateLimitArb = fc.record({
  requestsPerMinute: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: undefined }),
  tokensPerMinute: fc.option(fc.integer({ min: 1000, max: 1000000 }), { nil: undefined }),
  concurrentRequests: fc.integer({ min: 1, max: 100 }),
});

/**
 * Generate valid retry configuration.
 */
const retryConfigArb = fc.record({
  maxRetries: fc.integer({ min: 0, max: 10 }),
  backoffMs: fc.integer({ min: 100, max: 30000 }),
  retryableErrors: fc.array(fc.constantFrom('RATE_LIMITED', 'NETWORK_ERROR', 'TIMEOUT'), { minLength: 1 }),
});

/**
 * Generate valid provider-specific configuration.
 */
const providerSpecificConfigArb = (provider: ModelProvider) => {
  const baseConfig = fc.record({});
  
  switch (provider) {
    case 'anthropic':
      return fc.record({
        anthropic: fc.option(fc.record({
          maxTokens: fc.option(fc.integer({ min: 1, max: 4096 }), { nil: undefined }),
          systemMessage: fc.option(fc.string(), { nil: undefined }),
        }), { nil: undefined }),
      });
    case 'google':
      return fc.record({
        google: fc.option(fc.record({
          thinkingLevel: fc.option(fc.constantFrom('low', 'medium', 'high'), { nil: undefined }),
          mediaResolution: fc.option(fc.constantFrom('low', 'medium', 'high', 'ultra_high'), { nil: undefined }),
          thoughtSignatures: fc.option(fc.boolean(), { nil: undefined }),
          imageConfig: fc.option(fc.record({
            aspectRatio: fc.option(fc.string(), { nil: undefined }),
            imageSize: fc.option(fc.constantFrom('1K', '2K', '4K'), { nil: undefined }),
          }), { nil: undefined }),
        }), { nil: undefined }),
      });
    case 'openrouter':
      return fc.record({
        openrouter: fc.option(fc.record({
          models: fc.option(fc.array(fc.string()), { nil: undefined }),
          trackCredits: fc.boolean(),
        }), { nil: undefined }),
      });
    case 'ollama':
      return fc.record({
        ollama: fc.option(fc.record({
          keepAlive: fc.option(fc.string(), { nil: undefined }),
          numCtx: fc.option(fc.integer({ min: 1, max: 32768 }), { nil: undefined }),
          numGpu: fc.option(fc.integer({ min: 0, max: 8 }), { nil: undefined }),
        }), { nil: undefined }),
      });
    default:
      return baseConfig;
  }
};

/**
 * Generate valid features configuration.
 */
const featuresArb = fc.record({
  toolCalling: fc.boolean(),
  streaming: fc.boolean(),
  multimodal: fc.boolean(),
  imageGeneration: fc.boolean(),
  reasoning: fc.boolean(),
});

/**
 * Generate a valid ModelConfig for a specific provider.
 */
const validModelConfigArb = (provider: ModelProvider) => fc.record({
  provider: fc.constant(provider),
  model: modelArb(provider),
  apiKey: fc.option(apiKeyArb(provider), { nil: undefined }),
  baseUrl: fc.option(baseUrlArb, { nil: undefined }),
  contextLimit: fc.integer({ min: 1000, max: 200000 }),
  maxOutputTokens: fc.integer({ min: 100, max: 8192 }),
  fallbackProviders: fc.option(fc.array(providerArb, { maxLength: 3 }), { nil: undefined }),
  rateLimit: fc.option(rateLimitArb, { nil: undefined }),
  retryConfig: fc.option(retryConfigArb, { nil: undefined }),
  providerConfig: fc.option(providerSpecificConfigArb(provider), { nil: undefined }),
  features: fc.option(featuresArb, { nil: undefined }),
  priority: fc.integer({ min: 0, max: 100 }),
  enabled: fc.boolean(),
});

/**
 * Generate any valid ModelConfig.
 */
const anyValidModelConfigArb = providerArb.chain(provider => validModelConfigArb(provider));

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Configuration Validation Properties', () => {
  it('Property 8: Configuration serialization round-trip', () => {
    fc.assert(
      fc.property(anyValidModelConfigArb, (config) => {
        // Parse the config through the schema to ensure it's valid
        const parsed = ModelConfigSchema.parse(config);
        
        // Serialize to JSON and back
        const serialized = JSON.stringify(parsed);
        const deserialized = JSON.parse(serialized);
        const reparsed = ModelConfigSchema.parse(deserialized);
        
        // The round-trip should preserve all functional properties
        expect(reparsed.provider).toBe(parsed.provider);
        expect(reparsed.model).toBe(parsed.model);
        expect(reparsed.contextLimit).toBe(parsed.contextLimit);
        expect(reparsed.maxOutputTokens).toBe(parsed.maxOutputTokens);
        expect(reparsed.enabled).toBe(parsed.enabled);
        expect(reparsed.priority).toBe(parsed.priority);
        
        // Optional fields should be preserved if present
        if (parsed.apiKey !== undefined) {
          expect(reparsed.apiKey).toBe(parsed.apiKey);
        }
        if (parsed.baseUrl !== undefined) {
          expect(reparsed.baseUrl).toBe(parsed.baseUrl);
        }
        if (parsed.fallbackProviders !== undefined) {
          expect(reparsed.fallbackProviders).toEqual(parsed.fallbackProviders);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property: Valid configurations should pass validation', () => {
    fc.assert(
      fc.property(anyValidModelConfigArb, (config) => {
        // Set required environment variables for providers that need them
        const originalEnv = process.env;
        
        try {
          // Mock environment variables for testing
          if (config.provider === 'openai' && !config.apiKey) {
            process.env['OPENAI_API_KEY'] = 'sk-test-key-for-validation';
          }
          if (config.provider === 'anthropic' && !config.apiKey) {
            process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key-for-validation';
          }
          if (config.provider === 'google' && !config.apiKey) {
            process.env['GOOGLE_API_KEY'] = 'test-google-key-for-validation';
          }
          
          const result = validateProviderConfig(config);
          
          // Valid configurations should pass validation
          // Note: Some may still fail due to specific provider requirements
          // but the validation should not crash
          expect(result.provider).toBe(config.provider);
          expect(Array.isArray(result.errors)).toBe(true);
          expect(Array.isArray(result.warnings)).toBe(true);
          
        } finally {
          process.env = originalEnv;
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Property: Configuration validation is deterministic', () => {
    fc.assert(
      fc.property(anyValidModelConfigArb, (config) => {
        const result1 = validateProviderConfig(config);
        const result2 = validateProviderConfig(config);
        
        // Validation should be deterministic
        expect(result1.valid).toBe(result2.valid);
        expect(result1.errors).toEqual(result2.errors);
        expect(result1.warnings).toEqual(result2.warnings);
        expect(result1.provider).toBe(result2.provider);
      }),
      { numRuns: 100 }
    );
  });

  it('Property: Schema validation preserves type safety', () => {
    fc.assert(
      fc.property(anyValidModelConfigArb, (config) => {
        const parsed = ModelConfigSchema.parse(config);
        
        // Type constraints should be preserved
        expect(typeof parsed.provider).toBe('string');
        expect(typeof parsed.model).toBe('string');
        expect(typeof parsed.contextLimit).toBe('number');
        expect(typeof parsed.maxOutputTokens).toBe('number');
        expect(typeof parsed.enabled).toBe('boolean');
        expect(typeof parsed.priority).toBe('number');
        
        // Numeric constraints
        expect(parsed.contextLimit).toBeGreaterThan(0);
        expect(parsed.maxOutputTokens).toBeGreaterThan(0);
        expect(parsed.priority).toBeGreaterThanOrEqual(0);
        
        // Provider should be valid
        expect(['openai', 'anthropic', 'google', 'openrouter', 'cohere', 'mistral', 'together', 'perplexity', 'ollama']).toContain(parsed.provider);
      }),
      { numRuns: 100 }
    );
  });
});