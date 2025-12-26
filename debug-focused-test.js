// Focused test to reproduce the exact failing scenario
import { ProviderManager } from './src/features/model/provider-manager.js';

console.log('=== FOCUSED TEST REPRODUCTION ===');

// Test the exact counterexample: [["openai"],["together"]]
const enabledProviders = ['openai'];
const disabledProviders = ['together'];

console.log('Enabled providers:', enabledProviders);
console.log('Disabled providers:', disabledProviders);

const manager = new ProviderManager({ enableHealthChecking: false });

try {
  // Ensure no overlap between enabled and disabled providers
  const enabledSet = new Set(enabledProviders);
  const disabledSet = new Set(disabledProviders.filter(p => !enabledSet.has(p)));
  
  console.log('Enabled set:', Array.from(enabledSet));
  console.log('Disabled set:', Array.from(disabledSet));
  
  // Skip if no disabled providers after filtering
  if (disabledSet.size === 0) {
    console.log('No disabled providers after filtering, test would be skipped');
    process.exit(0);
  }
  
  // Create fallback chain that includes both enabled and disabled providers
  const fallbackChain = [...enabledProviders, ...Array.from(disabledSet)];
  console.log('Fallback chain:', fallbackChain);
  manager.setFallbackChain(fallbackChain);
  
  // Register only enabled providers
  for (const provider of enabledProviders) {
    console.log(`Registering enabled provider: ${provider}`);
    manager.registerProvider({
      provider,
      model: 'test-model',
      contextLimit: 4000,
      maxOutputTokens: 1000,
      enabled: true,
      priority: 50,
    });
  }
  
  // Check what's actually registered
  console.log('Registered providers:', Array.from(manager.providerConfigs.keys()));
  
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
  
  console.log('Primary provider:', primaryProvider);
  console.log('Test config:', testConfig);
  
  // Test: Build provider chain should only include registered (enabled) providers
  const buildProviderChain = manager.buildProviderChain.bind(manager);
  const chain = buildProviderChain(testConfig);
  
  console.log('Result chain:', chain);
  
  // Debug: Check each provider in the chain
  for (const provider of chain) {
    const isRegistered = manager.providerConfigs.has(provider);
    const config = manager.providerConfigs.get(provider);
    const isEnabled = config ? config.enabled : false;
    console.log(`Provider '${provider}': registered=${isRegistered}, enabled=${isEnabled}`);
  }
  
  // The key test: disabled providers should never appear in the chain
  let testPassed = true;
  for (const provider of disabledSet) {
    const contains = chain.includes(provider);
    console.log(`Chain contains disabled provider '${provider}': ${contains}`);
    if (contains) {
      console.log('❌ TEST FAILED: Disabled provider found in chain!');
      testPassed = false;
    }
  }
  
  // Additional verification: all providers in chain should be enabled
  for (const provider of chain) {
    const isEnabled = enabledSet.has(provider);
    console.log(`Provider '${provider}' is in enabled set: ${isEnabled}`);
    if (!isEnabled) {
      console.log('❌ TEST FAILED: Non-enabled provider found in chain!');
      testPassed = false;
    }
  }
  
  if (testPassed) {
    console.log('✅ TEST PASSED: All providers in chain are enabled');
  } else {
    console.log('❌ TEST FAILED: Found issues with provider chain');
    process.exit(1);
  }

} finally {
  manager.destroy();
}