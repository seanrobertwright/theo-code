/* eslint-env node */
/* eslint-disable no-undef */
// Test using the public interface instead of private method
import { ProviderManager } from '../src/features/model/provider-manager.js';

console.log('=== TESTING PUBLIC INTERFACE ===');

const manager = new ProviderManager({ enableHealthChecking: false });

try {
  // Test the exact counterexample: [["openai"],["together"]]
  const enabledProviders = ['openai'];
  const disabledProviders = ['together'];
  
  console.log('Enabled providers:', enabledProviders);
  console.log('Disabled providers:', disabledProviders);
  
  // Ensure no overlap between enabled and disabled providers
  const enabledSet = new Set(enabledProviders);
  const disabledSet = new Set(disabledProviders.filter(p => !enabledSet.has(p)));
  
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
  
  // Test using the public getAdapter method instead of private buildProviderChain
  try {
    const adapter = await manager.getAdapter(testConfig);
    console.log('Successfully created adapter for provider:', adapter.provider);
    
    // The adapter should be for the primary provider since it's the only registered one
    if (adapter.provider === primaryProvider) {
      console.log('✅ Adapter created for correct provider');
    } else {
      console.log('❌ Adapter created for unexpected provider:', adapter.provider);
    }
    
  } catch (error) {
    console.log('❌ Failed to create adapter:', error.message);
  }
  
  // Also test the private method for comparison
  console.log('\n--- Testing private method ---');
  const buildProviderChain = manager.buildProviderChain.bind(manager);
  const chain = buildProviderChain(testConfig);
  console.log('Private method result chain:', chain);
  
  // Check if the chain contains any disabled providers
  for (const provider of disabledSet) {
    const contains = chain.includes(provider);
    console.log(`Chain contains disabled provider '${provider}': ${contains}`);
    if (contains) {
      console.log('❌ PRIVATE METHOD FAILED: Disabled provider found in chain!');
    }
  }

} finally {
  manager.destroy();
}