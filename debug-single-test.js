// Run just the failing test case in isolation
import { ProviderManager } from './src/features/model/provider-manager.js';

console.log('Running single test case...');

const manager = new ProviderManager({ enableHealthChecking: false });

try {
  // Exact counterexample from the test failure
  const enabledProviders = ['openai'];
  const disabledProviders = ['google'];

  // Ensure no overlap between enabled and disabled providers
  const enabledSet = new Set(enabledProviders);
  const disabledSet = new Set(disabledProviders.filter(p => !enabledSet.has(p)));
  
  console.log('Enabled providers:', Array.from(enabledSet));
  console.log('Disabled providers:', Array.from(disabledSet));
  
  // Skip if no disabled providers after filtering
  if (disabledSet.size === 0) {
    console.log('No disabled providers, skipping test');
    process.exit(0);
  }
  
  // Create fallback chain that includes both enabled and disabled providers
  const fallbackChain = [...enabledProviders, ...Array.from(disabledSet)];
  console.log('Setting fallback chain:', fallbackChain);
  manager.setFallbackChain(fallbackChain);
  
  // Register only enabled providers
  for (const provider of enabledProviders) {
    console.log(`Registering provider: ${provider}`);
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
  
  console.log('Test config:', testConfig);
  
  // Test: Build provider chain should only include registered (enabled) providers
  const buildProviderChain = manager.buildProviderChain.bind(manager);
  const chain = buildProviderChain(testConfig);
  
  console.log('Result chain:', chain);
  
  // The key test: disabled providers should never appear in the chain
  // because they were never registered
  for (const provider of disabledSet) {
    const contains = chain.includes(provider);
    console.log(`Chain contains disabled provider '${provider}': ${contains}`);
    if (contains) {
      console.log('❌ TEST FAILED: Disabled provider found in chain!');
      throw new Error(`Chain should not contain disabled provider '${provider}'`);
    }
  }
  
  // Additional verification: all providers in chain should be enabled
  for (const provider of chain) {
    const isEnabled = enabledSet.has(provider);
    console.log(`Provider '${provider}' is enabled: ${isEnabled}`);
    if (!isEnabled) {
      console.log('❌ TEST FAILED: Non-enabled provider found in chain!');
      throw new Error(`Chain contains non-enabled provider '${provider}'`);
    }
  }
  
  console.log('✅ TEST PASSED: All providers in chain are enabled');

} finally {
  manager.destroy();
}