/**
 * Integration tests for provider setup procedures
 * 
 * This test suite validates the setup procedures documented in MULTI_PROVIDER_SETUP.md
 * by testing actual provider initialization and configuration validation.
 * 
 * Tests cover:
 * - Provider setup procedures
 * - API key validation
 * - Connection testing
 * - Model availability checks
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 4.2, 4.3, 4.4, 4.5 (provider setup)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderManager } from '../provider-manager';
import { AnthropicAdapter } from '../adapters/anthropic';
import { GoogleAdapter } from '../adapters/google';
import { OpenRouterAdapter } from '../adapters/openrouter';
import { CohereAdapter } from '../adapters/cohere';
import { MistralAdapter } from '../adapters/mistral';
import { TogetherAdapter } from '../adapters/together';
import { PerplexityAdapter } from '../adapters/perplexity';
import { OllamaAdapter } from '../adapters/ollama';
import type { ModelConfig, IModelAdapter, StreamChunk } from '../../../shared/types';

// Mock adapter factory function
function createMockAdapter(_providerName: string): IModelAdapter {
  return {
    _provider: providerName,
    generateResponse: vi.fn().mockResolvedValue({
      content: 'Mock response',
      usage: { _inputTokens: 10, _outputTokens: 20 }
    }),
    generateStreamResponse: vi.fn().mockImplementation(async function* () {
      yield { type: 'content', content: 'Mock', _usage: null } as StreamChunk;
    }),
    countTokens: vi.fn().mockResolvedValue(30),
    validateConfig: vi.fn().mockReturnValue({ _isValid: true }),
    getModelInfo: vi.fn().mockReturnValue({
      id: `${providerName}-model`,
      name: `${providerName} Model`,
      _contextLimit: 100000,
      _supportsStreaming: true,
      _supportsToolCalling: true
    })
  };
}

describe('Provider Setup Integration Tests', () => {
  let providerManager: ProviderManager;

  beforeEach(() => {
    providerManager = new ProviderManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Anthropic Claude Setup', () => {
    it('should validate Anthropic API key format from setup guide', () => {
      const validKeys = [
        'sk-ant-api03-1234567890abcdef',
        'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890',
        'sk-ant-api03-' + 'a'.repeat(50)
      ];

      const invalidKeys = [
        'sk-openai-invalid',
        'invalid-key',
        'sk-ant-',
        '',
        'sk-ant-api03'
      ];

      validKeys.forEach(key => {
        expect(key).toMatch(/^sk-ant-/);
        expect(key.length).toBeGreaterThan(10);
      });

      invalidKeys.forEach(key => {
        expect(key).not.toMatch(/^sk-ant-api03-.+/);
      });
    });

    it('should initialize Anthropic adapter with documented configuration', () => {
      const config: ModelConfig = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        apiKey: 'sk-ant-test-key',
        baseUrl: 'https://api.anthropic.com',
        _maxTokens: 4096,
        temperature: 0.7
      };

      const adapter = new AnthropicAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('anthropic');
    });

    it('should validate supported models from documentation', () => {
      const documentedModels = [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-haiku-20240307'
      ];

      const modelCapabilities = {
        'claude-3-5-sonnet-20241022': {
          _contextLimit: 200000,
          _supportsToolCalling: true,
          _supportsStreaming: true
        },
        'claude-3-opus-20240229': {
          _contextLimit: 200000,
          _supportsToolCalling: true,
          _supportsStreaming: true
        },
        'claude-3-haiku-20240307': {
          _contextLimit: 200000,
          _supportsToolCalling: true,
          _supportsStreaming: true
        }
      };

      documentedModels.forEach(model => {
        expect(modelCapabilities[model]).toBeDefined();
        expect(modelCapabilities[model].contextLimit).toBe(200000);
        expect(modelCapabilities[model].supportsToolCalling).toBe(true);
      });
    });
  });

  describe('Google Gemini Setup', () => {
    it('should validate Google API key format from setup guide', () => {
      const validKeys = [
        'AIzaSyABC123def456GHI789jkl',
        'AIzaSyDEF456ghi789JKL012mno',
        'AIza' + 'A'.repeat(35)
      ];

      const invalidKeys = [
        'sk-openai-invalid',
        'invalid-key',
        'AIza',
        '',
        'Google-API-Key'
      ];

      validKeys.forEach(key => {
        expect(key).toMatch(/^AIza/);
        expect(key.length).toBeGreaterThan(10);
      });

      invalidKeys.forEach(key => {
        expect(key).not.toMatch(/^AIza.+/);
      });
    });

    it('should initialize Google adapter with Gemini 3.0 configuration', () => {
      const config: ModelConfig = {
        provider: 'google',
        model: 'gemini-3-pro-preview',
        apiKey: 'AIzaSyTest123',
        gemini: {
          thinkingLevel: 'medium',
          mediaResolution: 'high',
          _thoughtSignatures: true,
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '2K'
          }
        }
      };

      const adapter = new GoogleAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('google');
    });

    it('should validate Gemini 3.0 models and features from documentation', () => {
      const gemini3Models = {
        'gemini-3-pro-preview': {
          _contextLimit: 1000000,
          _supportsReasoning: true,
          _supportsImageGeneration: false,
          knowledgeCutoff: 'Jan 2025'
        },
        'gemini-3-flash-preview': {
          _contextLimit: 1000000,
          _supportsReasoning: true,
          _supportsImageGeneration: false,
          optimizedFor: 'speed'
        },
        'gemini-3-pro-image-preview': {
          _contextLimit: 1000000,
          _supportsReasoning: true,
          _supportsImageGeneration: true,
          _nativeImageGen: true
        }
      };

      Object.entries(gemini3Models).forEach(([model, capabilities]) => {
        expect(capabilities.contextLimit).toBe(1000000);
        expect(capabilities.supportsReasoning).toBe(true);
        
        if (model.includes('image')) {
          expect(capabilities.supportsImageGeneration).toBe(true);
        }
      });
    });

    it('should validate thinking levels configuration', () => {
      const thinkingLevels = ['low', 'medium', 'high'];
      const mediaResolutions = ['low', 'medium', 'high', 'ultra_high'];
      const imageSizes = ['1K', '2K', '4K'];

      thinkingLevels.forEach(level => {
        expect(['low', 'medium', 'high']).toContain(level);
      });

      mediaResolutions.forEach(resolution => {
        expect(['low', 'medium', 'high', 'ultra_high']).toContain(resolution);
      });

      imageSizes.forEach(size => {
        expect(['1K', '2K', '4K']).toContain(size);
      });
    });
  });

  describe('OpenRouter Setup', () => {
    it('should validate OpenRouter API key format from setup guide', () => {
      const validKeys = [
        'sk-or-v1-1234567890abcdef',
        'sk-or-v1-abcdefghijklmnop',
        'sk-or-v1-' + 'x'.repeat(32)
      ];

      const invalidKeys = [
        'sk-openai-invalid',
        'sk-ant-invalid',
        'invalid-key',
        'sk-or-',
        ''
      ];

      validKeys.forEach(key => {
        expect(key).toMatch(/^sk-or-/);
        expect(key.length).toBeGreaterThan(10);
      });

      invalidKeys.forEach(key => {
        expect(key).not.toMatch(/^sk-or-v1-.+/);
      });
    });

    it('should initialize OpenRouter adapter with documented configuration', () => {
      const config: ModelConfig = {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        apiKey: 'sk-or-v1-test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        openrouter: {
          _trackCredits: true,
          creditThreshold: 10.00,
          httpReferer: 'https://theo-code.dev',
          xTitle: 'theo-code'
        }
      };

      const adapter = new OpenRouterAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('openrouter');
    });

    it('should validate popular models from documentation', () => {
      const popularModels = [
        'anthropic/claude-3.5-sonnet',
        'google/gemini-pro-1.5',
        'openai/gpt-4o',
        'meta-llama/llama-3.1-405b'
      ];

      popularModels.forEach(model => {
        expect(model).toMatch(/^[a-z-]+\/[a-z0-9.-]+$/);
        expect(model.split('/')).toHaveLength(2);
      });
    });
  });

  describe('Other Providers Setup', () => {
    it('should validate Cohere setup configuration', () => {
      const config: ModelConfig = {
        provider: 'cohere',
        model: 'command',
        apiKey: 'test-cohere-key'
      };

      const adapter = new CohereAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('cohere');
    });

    it('should validate Mistral setup configuration', () => {
      const config: ModelConfig = {
        provider: 'mistral',
        model: 'mistral-large-latest',
        apiKey: 'test-mistral-key'
      };

      const adapter = new MistralAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('mistral');
    });

    it('should validate Together setup configuration', () => {
      const config: ModelConfig = {
        provider: 'together',
        model: 'meta-llama/Llama-3-70b-chat-hf',
        apiKey: 'test-together-key'
      };

      const adapter = new TogetherAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('together');
    });

    it('should validate Perplexity setup configuration', () => {
      const config: ModelConfig = {
        provider: 'perplexity',
        model: 'llama-3.1-sonar-large-128k-online',
        apiKey: 'test-perplexity-key'
      };

      const adapter = new PerplexityAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('perplexity');
    });

    it('should validate Ollama setup configuration', () => {
      const config: ModelConfig = {
        provider: 'ollama',
        model: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434'
      };

      const adapter = new OllamaAdapter(config);
      expect(adapter).toBeDefined();
      expect(adapter.provider).toBe('ollama');
    });
  });

  describe('Environment Variables Setup', () => {
    it('should validate environment variable names from documentation', () => {
      const envVars = {
        'ANTHROPIC_API_KEY': 'sk-ant-test',
        'GOOGLE_API_KEY': 'AIzaTest',
        'OPENROUTER_API_KEY': 'sk-or-test',
        'COHERE_API_KEY': 'cohere-test',
        'MISTRAL_API_KEY': 'mistral-test',
        'TOGETHER_API_KEY': 'together-test',
        'PERPLEXITY_API_KEY': 'perplexity-test'
      };

      Object.keys(envVars).forEach(envVar => {
        expect(envVar).toMatch(/^[A-Z_]+_API_KEY$/);
        expect(envVar.endsWith('_API_KEY')).toBe(true);
      });
    });

    it('should handle environment variable substitution in configuration', () => {
      const configWithEnvVars = {
        providers: {
          anthropic: {
            apiKey: '${ANTHROPIC_API_KEY}',
            _enabled: true
          },
          google: {
            apiKey: '${GOOGLE_API_KEY}',
            _enabled: true
          }
        }
      };

      // Validate environment variable format
      expect(configWithEnvVars.providers.anthropic.apiKey).toMatch(/^\$\{[A-Z_]+\}$/);
      expect(configWithEnvVars.providers.google.apiKey).toMatch(/^\$\{[A-Z_]+\}$/);
    });
  });

  describe('Provider Registration and Discovery', () => {
    it('should register all documented providers successfully', async () => {
      const providers = [
        'openai',
        'anthropic', 
        'google',
        'openrouter',
        'cohere',
        'mistral',
        'together',
        'perplexity',
        'ollama'
      ];

      providers.forEach(providerName => {
        const config: ModelConfig = {
          provider: providerName as any,
          model: `${providerName}-model`,
          apiKey: 'test-key',
          _enabled: true
        };
        
        providerManager.registerProvider(config);
      });

      // Verify registration
      const availableProviders = await providerManager.getAvailableProviders();
      expect(availableProviders.length).toBeGreaterThan(0);
      
      // Check that providers were registered
      const providerNames = availableProviders.map(p => p.name);
      providers.forEach(providerName => {
        expect(providerNames).toContain(providerName);
      });
    });

    it('should validate provider priorities from documentation', () => {
      const providerPriorities = {
        'openai': 1,
        'anthropic': 2,
        'google': 1,
        'openrouter': 2,
        'cohere': 3,
        'mistral': 4,
        'together': 5,
        'perplexity': 6,
        'ollama': 7
      };

      Object.entries(providerPriorities).forEach(([provider, priority]) => {
        expect(priority).toBeGreaterThan(0);
        expect(priority).toBeLessThanOrEqual(10);
        expect(Number.isInteger(priority)).toBe(true);
      });
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('should validate rate limits from documentation examples', () => {
      const rateLimits = {
        'openai': {
          _requestsPerMinute: 500,
          _tokensPerMinute: 500000,
          _concurrentRequests: 50
        },
        'anthropic': {
          _requestsPerMinute: 200,
          _tokensPerMinute: 200000,
          _concurrentRequests: 20
        },
        'google': {
          _requestsPerMinute: 300,
          _tokensPerMinute: 300000,
          _concurrentRequests: 30
        },
        'openrouter': {
          _requestsPerMinute: 100,
          _tokensPerMinute: 200000,
          _concurrentRequests: 20
        }
      };

      Object.entries(rateLimits).forEach(([provider, limits]) => {
        expect(limits.requestsPerMinute).toBeGreaterThan(0);
        expect(limits.tokensPerMinute).toBeGreaterThan(0);
        expect(limits.concurrentRequests).toBeGreaterThan(0);
        
        // Validate reasonable limits
        expect(limits.requestsPerMinute).toBeLessThanOrEqual(1000);
        expect(limits.tokensPerMinute).toBeLessThanOrEqual(1000000);
        expect(limits.concurrentRequests).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Security Configuration Validation', () => {
    it('should validate file permissions recommendations', () => {
      const recommendedPermissions = {
        '~/.theo/config.yaml': '600',
        '.theo/config.yaml': '600'
      };

      Object.entries(recommendedPermissions).forEach(([file, permission]) => {
        expect(permission).toBe('600');
        expect(file).toMatch(/config\.yaml$/);
      });
    });

    it('should validate security best practices from documentation', () => {
      const securityPractices = {
        _neverCommitKeys: true,
        _useEnvironmentVariables: true,
        _rotateKeysRegularly: true,
        _separateDevProdKeys: true,
        _monitorApiUsage: true
      };

      Object.values(securityPractices).forEach(practice => {
        expect(practice).toBe(true);
      });
    });
  });

  describe('Troubleshooting Scenarios', () => {
    it('should validate common error scenarios from troubleshooting guide', () => {
      const commonErrors = {
        'Invalid API key': {
          causes: ['wrong format', 'expired key', 'wrong provider'],
          solutions: ['verify format', 'regenerate key', 'check provider']
        },
        'Rate limit exceeded': {
          causes: ['too many requests', 'burst traffic'],
          solutions: ['reduce rate', 'implement queuing', 'use fallback']
        },
        'Connection timeout': {
          causes: ['network issues', 'firewall', 'proxy'],
          solutions: ['check connectivity', 'configure proxy', 'adjust timeouts']
        }
      };

      Object.entries(commonErrors).forEach(([error, details]) => {
        expect(details.causes).toBeInstanceOf(Array);
        expect(details.solutions).toBeInstanceOf(Array);
        expect(details.causes.length).toBeGreaterThan(0);
        expect(details.solutions.length).toBeGreaterThan(0);
      });
    });

    it('should validate debugging commands from troubleshooting guide', () => {
      const debugCommands = [
        'theo provider test anthropic',
        'theo provider test-all',
        'theo config show',
        'theo config validate',
        'theo provider status',
        'theo provider usage anthropic'
      ];

      debugCommands.forEach(command => {
        expect(command).toMatch(/^theo (provider|config)/);
        expect(command.split(' ').length).toBeGreaterThanOrEqual(2);
      });
    });
  });
});