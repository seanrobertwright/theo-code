/* eslint-env node */
/* eslint-disable no-undef */
// Debug test for buildProviderChain method
import { ProviderManager } from '../src/features/model/provider-manager.js';

const manager = new ProviderManager({ enableHealthChecking: false });

// Set fallback chain that includes both enabled and disabled providers
manager.setFallbackChain(['openai', 'together']);

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

// Access private method using reflection
const buildProviderChain = manager.buildProviderChain.bind(manager);
const chain = buildProviderChain(testConfig);

console.log('Fallback chain:', ['openai', 'together']);
console.log('Registered providers:', Array.from(manager.providerConfigs.keys()));
console.log('Result chain:', chain);
console.log('Should not contain "together":', !chain.includes('together'));

manager.destroy();