/**
 * @fileoverview Property-based tests for fallback provider selection
 * @module features/model/__tests__/fallback-provider-selection.property
 *
 * Feature: multi-provider-support, Property 6: Fallback provider selection
 * **Validates: Requirements 5.3, 7.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { ProviderManager, type ProviderManagerConfig } from '../provider-manager.js';
import type { ModelConfig, ModelProvider } from '../../../shared/types/models.js';
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
 * Generate a valid ModelConfig for testing.
 */
const modelConfigArb = fc.record({
  provider: providerArb,
  model: fc.string({ minLength: 3 }),
  apiKey: fc.option(fc.string({ minLength: 10 })),
  baseUrl: fc.option(fc.webUrl()),
  contextLimit: fc.integer({ min: 1000, max: 200000 }),
  maxOutputTokens: fc.integer({ min: 100, max: 8192 }),
  fallbackProviders: fc.option(fc.array(providerArb, { maxLength: 3 })),
  priority: fc.integer({ min: 0, max: 100 }),
  enabled: fc.boolean(),
}) as fc.Arbitrary<ModelConfig>;

/**
 * Generate a fallback chain of providers.
 */
const fallbackChainArb = fc.array(providerArb, { minLength: 1, maxLength: 5 });

/**
 * Generate provider manager configuration.
 */
const providerManagerConfigArb = fc.record({
  fallbackChain: fc.option(fallbackChainArb),
  healthCheckInterval: fc.option(fc.integer({ min: 1000, max: 300000 })),
  enableHealthChecking: fc.option(fc.boolean()),
}) as fc.Arbitrary<ProviderManagerConfig>;

// =============================================================================
// MOCK ADAPTER FACTORY
// =============================================================================

/**
 * Mock adapter for testing.
 */
class MockAdapter {
  constructor(public config: ModelConfig) {}
  
  validateConfig(): void {
    if (!this.config.enabled) {
      throw new AdapterError('INVALID_CONFIG', this.config.provider, 'Provider disabled');
    }
    // Note: 'failing-provider' is not in our provider union type, so this check is removed
  }
  
  get provider() { return this.config.provider; }
  get model() { return this.config.model; }
  get contextLimit() { return this.config.contextLimit; }
  get supportsToolCalling() { return true; }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Fallback Provider Selection Properties', () => {
  let manager: ProviderManager;

  beforeEach(() => {
    manager = new ProviderManager({ enableHealthChecking: false });
  });

  afterEach(() => {
    manager.destroy();
  });

  it('Property 6: Fallback provider selection follows configured order', () => {
    fc.assert(
      fc.property(
        fallbackChainArb,
        fc.array(modelConfigArb, { minLength: 1, maxLength: 5 }),
        (fallbackChain, configs) => {
          // Setup: Register providers and set fallback chain
          manager.setFallbackChain(fallbackChain);
          
          // Only register enabled providers and ensure unique providers
          const enabledConfigs = configs.filter(c => c.enabled);
          const uniqueProviders = new Map<string, ModelConfig>();
          
          for (const config of enabledConfigs) {
            uniqueProviders.set(config.provider, config);
          }
          
          const uniqueEnabledConfigs = Array.from(uniqueProviders.values());
          
          // Skip test if no enabled providers
          if (uniqueEnabledConfigs.length === 0) {
            return true; // Skip this test case
          }
          
          for (const config of uniqueEnabledConfigs) {
            manager.registerProvider(config);
          }
          
          // Test: Build provider chain should follow the configured order
          const testConfig: ModelConfig = {
            provider: uniqueEnabledConfigs[0].provider,
            model: 'test-model',
            contextLimit: 4000,
            maxOutputTokens: 1000,
            enabled: true,
            priority: 50,
          };
          
          // Register the primary provider if not already registered
          manager.registerProvider({...testConfig, priority: 50});
          
          // Use reflection to access private method for testing
          const buildProviderChain = (manager as any).buildProviderChain.bind(manager);
          const chain = buildProviderChain(testConfig);
          
          // The chain should start with the primary provider
          expect(chain[0]).toBe(testConfig.provider);
          
          // Subsequent providers should follow the fallback chain order
          const registeredProviders = new Set(uniqueEnabledConfigs.map(c => c.provider));
          registeredProviders.add(testConfig.provider); // Include primary provider
          
          // Remove duplicates from fallback chain for testing
          const uniqueFallbackChain = Array.from(new Set(fallbackChain));
          const expectedFallbacks = uniqueFallbackChain.filter(p => 
            p !== testConfig.provider && registeredProviders.has(p)
          );
          
          for (let i = 0; i < expectedFallbacks.length; i++) {
            const expectedProvider = expectedFallbacks[i];
            const chainIndex = chain.indexOf(expectedProvider);
            
            if (chainIndex !== -1) {
              // If provider is in chain, it should appear after the primary
              expect(chainIndex).toBeGreaterThan(0);
              
              // And before any later fallback providers
              for (let j = i + 1; j < expectedFallbacks.length; j++) {
                const laterProvider = expectedFallbacks[j];
                const laterIndex = chain.indexOf(laterProvider);
                if (laterIndex !== -1) {
                  expect(chainIndex).toBeLessThan(laterIndex);
                }
              }
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: Fallback chain excludes disabled providers', () => {
    fc.assert(
      fc.property(
        fc.array(providerArb, { minLength: 1, maxLength: 3 }),
        fc.array(providerArb, { minLength: 1, maxLength: 3 }),
        (enabledProviders, disabledProviders) => {
          // Create a fresh manager for each property iteration
          const testManager = new ProviderManager({ enableHealthChecking: false });
          
          try {
            // Ensure no overlap between enabled and disabled providers
            const enabledSet = new Set(enabledProviders);
            const disabledSet = new Set(disabledProviders.filter(p => !enabledSet.has(p)));
            
            // Skip if no disabled providers after filtering
            if (disabledSet.size === 0) {
              return true;
            }
            
            // Create fallback chain that includes both enabled and disabled providers
            const fallbackChain = [...enabledProviders, ...Array.from(disabledSet)];
            testManager.setFallbackChain(fallbackChain);
            
            // Register only enabled providers
            for (const provider of enabledProviders) {
              testManager.registerProvider({
                provider,
                model: 'test-model',
                contextLimit: 4000,
                maxOutputTokens: 1000,
                enabled: true,
                priority: 50,
              });
            }
            
            // Choose primary provider from enabled providers
            const primaryProvider = enabledProviders[0];
            const testConfig: ModelConfig = {
              provider: primaryProvider,
              model: 'test-model',
              contextLimit: 4000,
              maxOutputTokens: 1000,
              enabled: true,
              priority: 50,
            };
            
            // Test: Build provider chain should only include registered (enabled) providers
            const buildProviderChain = (testManager as any).buildProviderChain.bind(testManager);
            const chain = buildProviderChain(testConfig);
            
            // The key test: disabled providers should never appear in the chain
            // because they were never registered
            for (const provider of disabledSet) {
              expect(chain).not.toContain(provider);
            }
            
            // Additional verification: all providers in chain should be enabled
            for (const provider of chain) {
              expect(enabledSet.has(provider)).toBe(true);
            }
          } finally {
            testManager.destroy();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: Fallback chain respects config-specific fallbacks', () => {
    fc.assert(
      fc.property(
        fallbackChainArb,
        modelConfigArb,
        fc.option(fc.array(providerArb, { maxLength: 3 })),
        (globalFallbacks, baseConfig, configFallbacks) => {
          // Skip test if base config is disabled
          if (!baseConfig.enabled) {
            return true;
          }
          
          // Setup
          manager.setFallbackChain(globalFallbacks);
          
          const testConfig: ModelConfig = {
            ...baseConfig,
            fallbackProviders: configFallbacks || undefined,
            enabled: true,
            priority: 50,
          };
          
          // Register the primary provider
          manager.registerProvider({...testConfig, priority: 50});
          
          // Register some fallback providers (only enabled ones)
          const allFallbacks = [
            ...(configFallbacks || []),
            ...globalFallbacks
          ];
          
          for (const provider of allFallbacks) {
            if (provider !== testConfig.provider) {
              manager.registerProvider({
                provider,
                model: 'test-model',
                contextLimit: 4000,
                maxOutputTokens: 1000,
                enabled: true, // Always register as enabled
                priority: 50,
              });
            }
          }
          
          // Test: Build provider chain
          const buildProviderChain = (manager as any).buildProviderChain.bind(manager);
          const chain = buildProviderChain(testConfig);
          
          // Primary provider should be first
          expect(chain[0]).toBe(testConfig.provider);
          
          // Config-specific fallbacks should appear before global fallbacks
          if (configFallbacks && configFallbacks.length > 0) {
            const firstConfigFallback = configFallbacks.find(p => chain.includes(p));
            const firstGlobalFallback = globalFallbacks.find(p => 
              p !== testConfig.provider && 
              !configFallbacks.includes(p) && 
              chain.includes(p)
            );
            
            if (firstConfigFallback && firstGlobalFallback) {
              const configIndex = chain.indexOf(firstConfigFallback);
              const globalIndex = chain.indexOf(firstGlobalFallback);
              expect(configIndex).toBeLessThan(globalIndex);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: Provider chain contains no duplicates', () => {
    fc.assert(
      fc.property(
        fallbackChainArb,
        modelConfigArb,
        fc.option(fc.array(providerArb, { maxLength: 3 })),
        (globalFallbacks, baseConfig, configFallbacks) => {
          // Skip test if base config is disabled
          if (!baseConfig.enabled) {
            return true;
          }
          
          // Setup
          manager.setFallbackChain(globalFallbacks);
          
          const testConfig: ModelConfig = {
            ...baseConfig,
            fallbackProviders: configFallbacks || undefined,
            enabled: true,
            priority: 50,
          };
          
          // Register providers (only enabled ones) - ensure unique providers
          const allProviders = [
            testConfig.provider,
            ...(configFallbacks || []),
            ...globalFallbacks
          ];
          
          const uniqueProviders = new Set(allProviders);
          
          for (const provider of uniqueProviders) {
            manager.registerProvider({
              provider,
              model: 'test-model',
              contextLimit: 4000,
              maxOutputTokens: 1000,
              enabled: true, // Always register as enabled
              priority: 50,
            });
          }
          
          // Test: Build provider chain should have no duplicates
          const buildProviderChain = (manager as any).buildProviderChain.bind(manager);
          const chain = buildProviderChain(testConfig);
          
          const uniqueProvidersInChain = new Set(chain);
          expect(chain.length).toBe(uniqueProvidersInChain.size);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property: Empty fallback chain still includes primary provider', () => {
    fc.assert(
      fc.property(modelConfigArb, (config) => {
        // Skip test if config is disabled
        if (!config.enabled) {
          return true;
        }
        
        // Setup: No fallback chain
        manager.setFallbackChain([]);
        
        const testConfig: ModelConfig = {
          ...config,
          enabled: true,
          priority: 50,
        };
        
        manager.registerProvider({...testConfig, priority: 50});
        
        // Test: Chain should still include primary provider
        const buildProviderChain = (manager as any).buildProviderChain.bind(manager);
        const chain = buildProviderChain(testConfig);
        
        expect(chain).toContain(testConfig.provider);
        expect(chain[0]).toBe(testConfig.provider);
      }),
      { numRuns: 50 }
    );
  });
});