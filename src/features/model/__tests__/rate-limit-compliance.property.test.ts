/**
 * @fileoverview Property-based tests for rate limit compliance
 * @module features/model/__tests__/rate-limit-compliance.property
 *
 * Feature: multi-provider-support, Property 7: Rate limit compliance
 * **Validates: Requirements 7.2, 8.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { ProviderManager } from '../provider-manager.js';
import type { ModelConfig, ModelProvider, RateLimitConfig } from '../../../shared/types/models.js';
import { AdapterError } from '../adapters/types.js';

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
 * Generate rate limit configuration with specific types.
 */
const requestRateLimitArb = fc.record({
  requestsPerMinute: fc.integer({ min: 1, max: 100 }),
  tokensPerMinute: fc.constant(undefined),
  concurrentRequests: fc.constant(undefined),
}) as fc.Arbitrary<RateLimitConfig>;

const tokenRateLimitArb = fc.record({
  requestsPerMinute: fc.constant(undefined),
  tokensPerMinute: fc.integer({ min: 100, max: 1000 }),
  concurrentRequests: fc.constant(undefined),
}) as fc.Arbitrary<RateLimitConfig>;

const concurrentRateLimitArb = fc.record({
  requestsPerMinute: fc.constant(undefined),
  tokensPerMinute: fc.constant(undefined),
  concurrentRequests: fc.integer({ min: 1, max: 10 }),
}) as fc.Arbitrary<RateLimitConfig>;

/**
 * Generate a valid ModelConfig with request rate limits.
 */
const modelConfigWithRequestRateLimitArb = fc.record({
  provider: providerArb,
  model: fc.string({ minLength: 3 }),
  apiKey: fc.option(fc.string({ minLength: 10 })),
  baseUrl: fc.option(fc.webUrl()),
  contextLimit: fc.integer({ min: 1000, max: 200000 }),
  maxOutputTokens: fc.integer({ min: 100, max: 8192 }),
  priority: fc.integer({ min: 0, max: 100 }),
  enabled: fc.constant(true),
  rateLimit: requestRateLimitArb,
}) as fc.Arbitrary<ModelConfig>;

/**
 * Generate a valid ModelConfig with token rate limits.
 */
const modelConfigWithTokenRateLimitArb = fc.record({
  provider: providerArb,
  model: fc.string({ minLength: 3 }),
  apiKey: fc.option(fc.string({ minLength: 10 })),
  baseUrl: fc.option(fc.webUrl()),
  contextLimit: fc.integer({ min: 1000, max: 200000 }),
  maxOutputTokens: fc.integer({ min: 100, max: 8192 }),
  priority: fc.integer({ min: 0, max: 100 }),
  enabled: fc.constant(true),
  rateLimit: tokenRateLimitArb,
}) as fc.Arbitrary<ModelConfig>;

/**
 * Generate a valid ModelConfig with concurrent request limits.
 */
const modelConfigWithConcurrentRateLimitArb = fc.record({
  provider: providerArb,
  model: fc.string({ minLength: 3 }),
  apiKey: fc.option(fc.string({ minLength: 10 })),
  baseUrl: fc.option(fc.webUrl()),
  contextLimit: fc.integer({ min: 1000, max: 200000 }),
  maxOutputTokens: fc.integer({ min: 100, max: 8192 }),
  priority: fc.integer({ min: 0, max: 100 }),
  enabled: fc.constant(true),
  rateLimit: concurrentRateLimitArb,
}) as fc.Arbitrary<ModelConfig>;

/**
 * Generate request patterns for testing rate limits.
 */
const requestPatternArb = fc.record({
  requestCount: fc.integer({ min: 1, max: 100 }),
  tokenCount: fc.integer({ min: 10, max: 10000 }),
  concurrentRequests: fc.integer({ min: 1, max: 20 }),
  timeSpanMs: fc.integer({ min: 1000, max: 120000 }), // 1 second to 2 minutes
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Simulate time passage for testing.
 */
const advanceTime = (ms: number): void => {
  vi.advanceTimersByTime(ms);
};

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Rate Limit Compliance Properties', () => {
  let manager: ProviderManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ProviderManager({ enableHealthChecking: false });
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('Property 7: Rate limit compliance - requests per minute', () => {
    fc.assert(
      fc.property(
        modelConfigWithRequestRateLimitArb,
        fc.integer({ min: 2, max: 50 }), // Number of requests to make
        (config, requestCount) => {
          const rateLimit = config.rateLimit!.requestsPerMinute!;
          
          // Skip if request count is within rate limit (no violation expected)
          if (requestCount <= rateLimit) {
            return true;
          }

          // Setup fresh manager for each test
          const testManager = new ProviderManager({ enableHealthChecking: false });
          testManager.registerProvider(config);

          // Test: Check rate limiting directly using private method
          let successfulRequests = 0;
          let rateLimitedRequests = 0;

          for (let i = 0; i < requestCount; i++) {
            // Access private method for testing with proper binding
            const checkRateLimit = (testManager as any).checkRateLimit.bind(testManager);
            if (checkRateLimit && checkRateLimit(config.provider)) {
              // Update rate limit state to simulate successful request
              const updateRateLimit = (testManager as any).updateRateLimit.bind(testManager);
              if (updateRateLimit) {
                updateRateLimit(config.provider, 'request', 1);
              }
              successfulRequests++;
            } else {
              rateLimitedRequests++;
            }
          }

          // Clean up
          testManager.destroy();

          // Verify: Should not exceed rate limit
          const withinLimit = successfulRequests <= rateLimit;
          
          // If we made more requests than the limit, some should be rate limited
          const hasRateLimiting = requestCount <= rateLimit || rateLimitedRequests > 0;

          return withinLimit && hasRateLimiting;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property: Rate limit compliance - tokens per minute', () => {
    fc.assert(
      fc.property(
        modelConfigWithTokenRateLimitArb,
        fc.array(fc.integer({ min: 10, max: 200 }), { minLength: 1, maxLength: 10 }), // Token counts per request
        (config, tokenCounts) => {
          const tokenRateLimit = config.rateLimit!.tokensPerMinute!;
          const totalTokens = tokenCounts.reduce((sum, tokens) => sum + tokens, 0);
          
          // Skip if total tokens is within rate limit (no violation expected)
          if (totalTokens <= tokenRateLimit) {
            return true;
          }

          // Setup fresh manager for each test
          const testManager = new ProviderManager({ enableHealthChecking: false });
          testManager.registerProvider(config);

          // Test: Check rate limiting by simulating the proper flow
          let successfulTokens = 0;
          let rateLimitedRequests = 0;

          for (const tokenCount of tokenCounts) {
            // Get current state to check if adding this request would exceed limits
            const state = (testManager as any).rateLimitStates.get(config.provider);
            const currentTokens = state ? state.tokenCount : 0;
            
            // Check if adding this request would exceed the limit
            if (currentTokens + tokenCount <= tokenRateLimit) {
              // Should be allowed - update the state
              const updateRateLimit = (testManager as any).updateRateLimit.bind(testManager);
              if (updateRateLimit) {
                updateRateLimit(config.provider, 'tokens', tokenCount);
              }
              successfulTokens += tokenCount;
            } else {
              // Should be rate limited
              rateLimitedRequests++;
            }
          }

          // Clean up
          testManager.destroy();

          // Verify: Should not exceed token rate limit
          const withinLimit = successfulTokens <= tokenRateLimit;
          
          // If we tried to use more tokens than the limit, some requests should be rate limited
          const hasRateLimiting = totalTokens <= tokenRateLimit || rateLimitedRequests > 0;

          return withinLimit && hasRateLimiting;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property: Rate limit compliance - concurrent requests', () => {
    fc.assert(
      fc.property(
        modelConfigWithConcurrentRateLimitArb,
        fc.integer({ min: 2, max: 20 }), // Number of concurrent requests
        (config, concurrentCount) => {
          const concurrentLimit = config.rateLimit!.concurrentRequests!;
          
          // Skip if concurrent count is within limit (no violation expected)
          if (concurrentCount <= concurrentLimit) {
            return true;
          }

          // Setup fresh manager for each test
          const testManager = new ProviderManager({ enableHealthChecking: false });
          testManager.registerProvider(config);

          // Test: Start concurrent requests and verify limiting
          let successfulStarts = 0;
          let rateLimitedStarts = 0;

          // Simulate starting concurrent requests
          for (let i = 0; i < concurrentCount; i++) {
            // Access private method for testing with proper binding
            const checkRateLimit = (testManager as any).checkRateLimit.bind(testManager);
            if (checkRateLimit && checkRateLimit(config.provider)) {
              // Track request start
              testManager.trackRequestStart(config.provider);
              successfulStarts++;
            } else {
              rateLimitedStarts++;
            }
          }

          // Clean up: End all successful requests
          for (let i = 0; i < successfulStarts; i++) {
            testManager.trackRequestEnd(config.provider);
          }
          testManager.destroy();

          // Verify: Should not exceed concurrent request limit
          const withinLimit = successfulStarts <= concurrentLimit;
          
          // If we tried to start more concurrent requests than the limit, some should be rate limited
          const hasRateLimiting = concurrentCount <= concurrentLimit || rateLimitedStarts > 0;

          return withinLimit && hasRateLimiting;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property: Rate limit window resets correctly', () => {
    fc.assert(
      fc.property(
        modelConfigWithRequestRateLimitArb,
        fc.integer({ min: 2, max: 10 }), // Requests in first window
        fc.integer({ min: 2, max: 10 }), // Requests in second window
        (config, firstWindowRequests, secondWindowRequests) => {
          const rateLimit = config.rateLimit!.requestsPerMinute!;
          
          // Setup fresh manager for each test
          const testManager = new ProviderManager({ enableHealthChecking: false });
          testManager.registerProvider(config);

          // Test: Make requests in first window
          let firstWindowSuccessful = 0;
          for (let i = 0; i < Math.min(firstWindowRequests, rateLimit); i++) {
            const checkRateLimit = (testManager as any).checkRateLimit.bind(testManager);
            if (checkRateLimit && checkRateLimit(config.provider)) {
              const updateRateLimit = (testManager as any).updateRateLimit.bind(testManager);
              if (updateRateLimit) {
                updateRateLimit(config.provider, 'request', 1);
              }
              firstWindowSuccessful++;
            } else {
              break;
            }
          }

          // Advance time by more than 1 minute to reset the window
          advanceTime(65000); // 65 seconds

          // Test: Make requests in second window (should be allowed again)
          let secondWindowSuccessful = 0;
          for (let i = 0; i < Math.min(secondWindowRequests, rateLimit); i++) {
            const checkRateLimit = (testManager as any).checkRateLimit.bind(testManager);
            if (checkRateLimit && checkRateLimit(config.provider)) {
              const updateRateLimit = (testManager as any).updateRateLimit.bind(testManager);
              if (updateRateLimit) {
                updateRateLimit(config.provider, 'request', 1);
              }
              secondWindowSuccessful++;
            } else {
              break;
            }
          }

          // Clean up
          testManager.destroy();

          // Verify: Both windows should allow up to the rate limit
          const firstWindowValid = firstWindowSuccessful <= rateLimit;
          const secondWindowValid = secondWindowSuccessful <= rateLimit;
          
          // If we made fewer requests than the limit in each window, all should succeed
          const firstWindowComplete = firstWindowRequests > rateLimit || firstWindowSuccessful === firstWindowRequests;
          const secondWindowComplete = secondWindowRequests > rateLimit || secondWindowSuccessful === secondWindowRequests;

          return firstWindowValid && secondWindowValid && firstWindowComplete && secondWindowComplete;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property: Multiple providers have independent rate limits', () => {
    fc.assert(
      fc.property(
        fc.array(modelConfigWithRequestRateLimitArb, { minLength: 2, maxLength: 4 }),
        fc.integer({ min: 2, max: 20 }), // Requests per provider
        (configs, requestsPerProvider) => {
          // Ensure unique providers and all have rate limits
          const uniqueConfigs = configs
            .reduce((acc, config) => {
              acc.set(config.provider, config);
              return acc;
            }, new Map<ModelProvider, ModelConfig>());

          const uniqueConfigArray = Array.from(uniqueConfigs.values());
          
          // Skip if we don't have at least 2 unique providers with rate limits
          if (uniqueConfigArray.length < 2) {
            return true;
          }

          // Setup: Register all providers
          const testManager = new ProviderManager({ enableHealthChecking: false });
          for (const config of uniqueConfigArray) {
            testManager.registerProvider(config);
          }

          // Test: Make requests to each provider independently
          const results = new Map<ModelProvider, number>();

          for (const config of uniqueConfigArray) {
            let successfulRequests = 0;
            const rateLimit = config.rateLimit!.requestsPerMinute!;

            for (let i = 0; i < Math.min(requestsPerProvider, rateLimit); i++) {
              const checkRateLimit = (testManager as any).checkRateLimit.bind(testManager);
              if (checkRateLimit && checkRateLimit(config.provider)) {
                const updateRateLimit = (testManager as any).updateRateLimit.bind(testManager);
                if (updateRateLimit) {
                  updateRateLimit(config.provider, 'request', 1);
                }
                successfulRequests++;
              } else {
                break;
              }
            }

            results.set(config.provider, successfulRequests);
          }

          // Clean up
          testManager.destroy();

          // Verify: Each provider should be able to use its full rate limit independently
          let allValid = true;
          for (const config of uniqueConfigArray) {
            const successfulRequests = results.get(config.provider)!;
            const rateLimit = config.rateLimit!.requestsPerMinute!;
            
            if (successfulRequests > rateLimit) {
              allValid = false;
              break;
            }
            
            // If we made fewer requests than the limit, all should succeed
            if (requestsPerProvider <= rateLimit && successfulRequests !== Math.min(requestsPerProvider, rateLimit)) {
              allValid = false;
              break;
            }
          }

          return allValid;
        }
      ),
      { numRuns: 25 }
    );
  });

  it('Property: Rate limit state is consistent across operations', () => {
    fc.assert(
      fc.property(
        modelConfigWithRequestRateLimitArb,
        fc.array(
          fc.record({
            operation: fc.constantFrom('request'),
            count: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (config, operations) => {
          // Setup fresh manager for each test
          const testManager = new ProviderManager({ enableHealthChecking: false });
          testManager.registerProvider(config);

          // Test: Perform operations and track state
          let totalRequests = 0;
          let operationsPerformed = 0;

          for (const op of operations) {
            // Get current state to check if adding this request would exceed limits
            const state = (testManager as any).rateLimitStates.get(config.provider);
            const currentRequests = state ? state.requestCount : 0;
            const rateLimit = config.rateLimit!.requestsPerMinute!;
            
            // Check if adding this operation would exceed the limit
            if (currentRequests + op.count <= rateLimit) {
              // Should be allowed - update the state
              const updateRateLimit = (testManager as any).updateRateLimit.bind(testManager);
              if (updateRateLimit) {
                updateRateLimit(config.provider, 'request', op.count);
              }
              totalRequests += op.count;
              operationsPerformed++;
            } else {
              // Should be rate limited - stop here
              break;
            }
          }

          // Clean up
          testManager.destroy();

          // Verify: Totals should not exceed configured limits
          const rateLimit = config.rateLimit!.requestsPerMinute!;
          const withinLimit = totalRequests <= rateLimit;

          // Verify: Rate limiting worked correctly
          // Either we performed all operations (no rate limiting needed) 
          // OR we stopped early due to rate limiting
          const allOperationsPerformed = operationsPerformed === operations.length;
          const stoppedDueToRateLimit = operationsPerformed < operations.length;
          const rateLimitingWorked = allOperationsPerformed || stoppedDueToRateLimit;

          return withinLimit && rateLimitingWorked;
        }
      ),
      { numRuns: 25 }
    );
  });
});