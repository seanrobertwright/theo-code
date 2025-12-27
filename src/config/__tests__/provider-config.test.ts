/**
 * @fileoverview Unit tests for provider configuration functionality
 * @module config/__tests__/provider-config
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  validateProviderConfig, 
  getProviderConfig, 
  getAvailableProviders,
  getApiKey,
  type MergedConfig,
  type ProviderConfig 
} from '../index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Provider Configuration', () => {
  let mockConfig: MergedConfig;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    // Create mock configuration
    mockConfig = {
      global: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        providers: {
          providers: [
            {
              name: 'openai',
              enabled: true,
              priority: 100,
              apiKey: 'sk-test-openai-key',
            },
            {
              name: 'anthropic',
              enabled: true,
              priority: 90,
              rateLimit: {
                requestsPerMinute: 60,
                tokensPerMinute: 100000,
                concurrentRequests: 5,
              },
            },
            {
              name: 'google',
              enabled: false,
              priority: 80,
              baseUrl: 'https://custom-google-api.com',
            },
          ],
          fallbackChain: ['openai', 'anthropic'],
          autoSwitchOnFailure: true,
          maxFallbackAttempts: 3,
          healthCheckInterval: 300000,
        },
        session: {
          autoSaveInterval: 30000,
          maxSessions: 50,
        },
        editor: {
          theme: 'dark',
          syntaxHighlighting: true,
        },
      },
      project: undefined,
      policy: {
        allowNet: false,
        allowExec: true,
        blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
        autoApproveRead: true,
        autoApproveWrite: false,
        maxFileSize: 1048576,
        executionTimeout: 30000,
      },
      agentsInstructions: undefined,
    };
  });

  // =============================================================================
  // PROVIDER VALIDATION TESTS
  // =============================================================================

  describe('validateProviderConfig', () => {
    it('should validate a properly configured provider', () => {
      const result = validateProviderConfig('openai', mockConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect missing API key', () => {
      // Remove API key from config
      if (mockConfig.global.providers?.providers) {
        mockConfig.global.providers.providers[0].apiKey = undefined;
      }
      
      const result = validateProviderConfig('openai', mockConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No API key found for provider openai');
    });

    it('should detect disabled provider', () => {
      const result = validateProviderConfig('google', mockConfig);
      
      expect(result.valid).toBe(true); // Still valid, just disabled
      expect(result.warnings).toContain('Provider google is disabled in configuration');
    });

    it('should validate Ollama without API key requirement', () => {
      // Add Ollama provider
      if (mockConfig.global.providers?.providers) {
        mockConfig.global.providers.providers.push({
          name: 'ollama',
          enabled: true,
          priority: 50,
          baseUrl: 'http://localhost:11434',
        });
      }
      
      const result = validateProviderConfig('ollama', mockConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid base URL', () => {
      // Set invalid base URL
      if (mockConfig.global.providers?.providers) {
        mockConfig.global.providers.providers[2].baseUrl = 'not-a-valid-url';
      }
      
      const result = validateProviderConfig('google', mockConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid base URL for provider google');
    });

    it('should detect invalid rate limits', () => {
      // Set invalid rate limits
      if (mockConfig.global.providers?.providers) {
        mockConfig.global.providers.providers[1].rateLimit = {
          requestsPerMinute: -1,
          tokensPerMinute: 0,
          concurrentRequests: 5,
        };
      }
      
      const result = validateProviderConfig('anthropic', mockConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid requests per minute for provider anthropic');
      expect(result.errors).toContain('Invalid tokens per minute for provider anthropic');
    });

    it('should reject unsupported provider', () => {
      const result = validateProviderConfig('unsupported-provider', mockConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unsupported provider: unsupported-provider');
    });
  });

  // =============================================================================
  // PROVIDER CONFIG RETRIEVAL TESTS
  // =============================================================================

  describe('getProviderConfig', () => {
    it('should return configured provider', () => {
      const config = getProviderConfig('openai', mockConfig);
      
      expect(config).toBeDefined();
      expect(config?.name).toBe('openai');
      expect(config?.enabled).toBe(true);
      expect(config?.priority).toBe(100);
      expect(config?.apiKey).toBe('sk-test-openai-key');
    });

    it('should return default config for unconfigured supported provider', () => {
      const config = getProviderConfig('cohere', mockConfig);
      
      expect(config).toBeDefined();
      expect(config?.name).toBe('cohere');
      expect(config?.enabled).toBe(true);
      expect(config?.priority).toBe(0);
    });

    it('should return undefined for unsupported provider', () => {
      const config = getProviderConfig('unsupported', mockConfig);
      
      expect(config).toBeUndefined();
    });

    it('should apply project-level overrides', () => {
      // Add project overrides
      mockConfig.project = {
        providerOverrides: {
          openai: {
            enabled: false,
            priority: 50,
          },
        },
      };
      
      const config = getProviderConfig('openai', mockConfig);
      
      expect(config?.enabled).toBe(false);
      expect(config?.priority).toBe(50);
      expect(config?.apiKey).toBe('sk-test-openai-key'); // Should keep original
    });
  });

  // =============================================================================
  // AVAILABLE PROVIDERS TESTS
  // =============================================================================

  describe('getAvailableProviders', () => {
    it('should return all configured and default providers', () => {
      const providers = getAvailableProviders(mockConfig);
      
      expect(providers).toHaveLength(9); // 3 configured + 6 defaults
      
      // Should include configured providers
      const openaiProvider = providers.find(p => String(p.name) === 'openai');
      expect(openaiProvider).toBeDefined();
      expect(openaiProvider?.priority).toBe(100);
      
      // Should include default providers
      const cohereProvider = providers.find(p => String(p.name) === 'cohere');
      expect(cohereProvider).toBeDefined();
      expect(cohereProvider?.priority).toBe(0);
    });

    it('should sort providers by priority', () => {
      const providers = getAvailableProviders(mockConfig);
      
      // Should be sorted by priority (descending)
      for (let i = 0; i < providers.length - 1; i++) {
        const currentPriority = providers[i].priority || 0;
        const nextPriority = providers[i + 1].priority || 0;
        expect(currentPriority).toBeGreaterThanOrEqual(nextPriority);
      }
    });

    it('should handle empty provider configuration', () => {
      mockConfig.global.providers = undefined;
      
      const providers = getAvailableProviders(mockConfig);
      
      expect(providers).toHaveLength(9); // All default providers
      providers.forEach(provider => {
        expect(provider.enabled).toBe(true);
        expect(provider.priority).toBe(0);
      });
    });
  });

  // =============================================================================
  // API KEY RETRIEVAL TESTS
  // =============================================================================

  describe('getApiKey', () => {
    it('should return API key from environment variable', () => {
      process.env.OPENAI_API_KEY = 'env-openai-key';
      
      const apiKey = getApiKey('openai', mockConfig);
      
      expect(apiKey).toBe('env-openai-key');
    });

    it('should return API key from provider configuration', () => {
      const apiKey = getApiKey('openai', mockConfig);
      
      expect(apiKey).toBe('sk-test-openai-key');
    });

    it('should prioritize environment variable over configuration', () => {
      process.env.OPENAI_API_KEY = 'env-openai-key';
      
      const apiKey = getApiKey('openai', mockConfig);
      
      expect(apiKey).toBe('env-openai-key');
    });

    it('should return undefined for missing API key', () => {
      const apiKey = getApiKey('anthropic', mockConfig);
      
      expect(apiKey).toBeUndefined();
    });

    it('should handle legacy API key configuration', () => {
      // Add legacy API key format
      mockConfig.global.apiKeys = {
        anthropic: 'legacy-anthropic-key',
      };
      
      const apiKey = getApiKey('anthropic', mockConfig);
      
      expect(apiKey).toBe('legacy-anthropic-key');
    });

    it('should handle provider aliases', () => {
      process.env.GOOGLE_API_KEY = 'google-key';
      
      // Test both 'google' and 'gemini' aliases
      expect(getApiKey('google', mockConfig)).toBe('google-key');
      expect(getApiKey('gemini', mockConfig)).toBe('google-key');
    });
  });

  // =============================================================================
  // EDGE CASES AND ERROR HANDLING
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle malformed provider configuration', () => {
      // Set malformed providers array
      if (mockConfig.global.providers) {
        (mockConfig.global.providers as any).providers = 'not-an-array';
      }
      
      const providers = getAvailableProviders(mockConfig);
      
      // Should still return default providers
      expect(providers).toHaveLength(9);
    });

    it('should handle provider with missing name', () => {
      // Add provider with missing name
      if (mockConfig.global.providers?.providers) {
        (mockConfig.global.providers.providers as any).push({
          enabled: true,
          priority: 10,
        });
      }
      
      const providers = getAvailableProviders(mockConfig);
      
      // Should not crash and should filter out invalid provider
      expect(providers.every(p => p.name)).toBe(true);
    });

    it('should handle empty environment variables', () => {
      process.env.OPENAI_API_KEY = '';
      
      const apiKey = getApiKey('openai', mockConfig);
      
      // Empty string should be treated as undefined
      expect(apiKey).toBe('sk-test-openai-key'); // Falls back to config
    });
  });
});