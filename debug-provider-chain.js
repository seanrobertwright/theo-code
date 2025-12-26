// Debug the buildProviderChain method
console.log('Starting debug...');

// Mock the ProviderManager class structure
class DebugProviderManager {
  constructor() {
    this.config = { fallbackChain: [] };
    this.providerConfigs = new Map();
  }

  setFallbackChain(providers) {
    this.config.fallbackChain = providers;
    console.log(`Set fallback chain: ${providers.join(' -> ')}`);
  }

  registerProvider(config) {
    if (!config.enabled) {
      console.log(`Skipping disabled provider: ${config.provider}`);
      return;
    }
    this.providerConfigs.set(config.provider, config);
    console.log(`Registered provider: ${config.provider}`);
  }

  buildProviderChain(config) {
    console.log(`\nBuilding chain for primary provider: ${config.provider}`);
    
    const chain = [config.provider];
    console.log(`Initial chain: [${chain.join(', ')}]`);
    
    // Add config-specific fallbacks (avoid duplicates)
    if (config.fallbackProviders) {
      for (const provider of config.fallbackProviders) {
        if (!chain.includes(provider)) {
          chain.push(provider);
        }
      }
      console.log(`After config fallbacks: [${chain.join(', ')}]`);
    }
    
    // Add global fallback chain (avoid duplicates)
    if (this.config.fallbackChain) {
      console.log(`Global fallback chain: [${this.config.fallbackChain.join(', ')}]`);
      for (const provider of this.config.fallbackChain) {
        if (!chain.includes(provider)) {
          chain.push(provider);
          console.log(`Added ${provider} to chain: [${chain.join(', ')}]`);
        }
      }
    }
    
    console.log(`Before filtering: [${chain.join(', ')}]`);
    console.log(`Registered providers: [${Array.from(this.providerConfigs.keys()).join(', ')}]`);
    
    // Filter to only registered and enabled providers
    const filtered = chain.filter(provider => {
      const providerConfig = this.providerConfigs.get(provider);
      const isRegistered = !!providerConfig;
      const isEnabled = providerConfig && providerConfig.enabled;
      console.log(`Provider ${provider}: registered=${isRegistered}, enabled=${isEnabled}`);
      return providerConfig && providerConfig.enabled;
    });
    
    console.log(`After filtering: [${filtered.join(', ')}]`);
    return filtered;
  }
}

// Reproduce the failing test case
const manager = new DebugProviderManager();

// Set fallback chain that includes both enabled and disabled providers
manager.setFallbackChain(['openai', 'google']);

// Register only the enabled provider
manager.registerProvider({
  provider: 'openai',
  model: 'test-model',
  contextLimit: 4000,
  maxOutputTokens: 1000,
  enabled: true,
  priority: 50,
});

// Create test config
const testConfig = {
  provider: 'openai',
  model: 'test-model',
  contextLimit: 4000,
  maxOutputTokens: 1000,
  enabled: true,
  priority: 50,
};

// Build provider chain
const chain = manager.buildProviderChain(testConfig);

console.log(`\nFinal result: [${chain.join(', ')}]`);
console.log(`Should not contain 'google': ${!chain.includes('google')}`);