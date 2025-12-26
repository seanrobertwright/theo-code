// Test multiple iterations to see if there's a state issue
import { ProviderManager } from './src/features/model/provider-manager.js';

console.log('=== TESTING MULTIPLE ITERATIONS ===');

// Test the exact counterexample multiple times
const enabledProviders = ['openai'];
const disabledProviders = ['together'];

for (let i = 0; i < 10; i++) {
  console.log(`\n--- Iteration ${i + 1} ---`);
  
  const manager = new ProviderManager({ enableHealthChecking: false });
  
  try {
    // Ensure no overlap between enabled and disabled providers
    const enabledSet = new Set(enabledProviders);
    const disabledSet = new Set(disabledProviders.filter(p => !enabledSet.has(p)));
    
    // Create fallback chain that includes both enabled and disabled providers
    const fallbackChain = [...enabledProviders, ...Array.from(disabledSet)];
    manager.setFallbackChain(fallbackChain);
    
    // Register only enabled providers
    for (const provider of enabledProviders) {
      manager.registerProvider({
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
    const testConfig = {
      provider: primaryProvider,
      model: 'test-model',
      contextLimit: 4000,
      maxOutputTokens: 1000,
      enabled: true,
      priority: 50,
    };
    
    // Test: Build provider chain should only include registered (enabled) providers
    const buildProviderChain = manager.buildProviderChain.bind(manager);
    const chain = buildProviderChain(testConfig);
    
    console.log(`Chain: [${chain.join(', ')}]`);
    
    // The key test: disabled providers should never appear in the chain
    let iterationPassed = true;
    for (const provider of disabledSet) {
      const contains = chain.includes(provider);
      if (contains) {
        console.log(`❌ ITERATION ${i + 1} FAILED: Chain contains disabled provider '${provider}'`);
        iterationPassed = false;
      }
    }
    
    // Additional verification: all providers in chain should be enabled
    for (const provider of chain) {
      const isEnabled = enabledSet.has(provider);
      if (!isEnabled) {
        console.log(`❌ ITERATION ${i + 1} FAILED: Chain contains non-enabled provider '${provider}'`);
        iterationPassed = false;
      }
    }
    
    if (iterationPassed) {
      console.log(`✅ Iteration ${i + 1} passed`);
    }
    
  } finally {
    manager.destroy();
  }
}

console.log('\n=== ALL ITERATIONS COMPLETED ===');