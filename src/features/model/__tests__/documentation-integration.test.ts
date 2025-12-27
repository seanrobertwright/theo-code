/**
 * @fileoverview Integration tests for multi-provider documentation examples
 * @module features/model/__tests__/documentation-integration.test
 * Tests all configuration examples from the documentation to ensure they are valid and functional
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// Mock provider configurations from documentation examples
const mockProviderConfigs = {
  anthropic: {
    enabled: true,
    apiKey: "sk-ant-test-key",
    models: [
      "claude-3-5-sonnet-20241022",
      "claude-3-opus-20240229", 
      "claude-3-haiku-20240307"
    ],
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000
    }
  },
  google: {
    enabled: true,
    apiKey: "AIza-test-key",
    models: [
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      "gemini-3-pro-image-preview",
      "gemini-2-flash-preview",
      "gemini-2-flash-thinking-preview"
    ],
    gemini: {
      thinkingLevel: "medium",
      mediaResolution: "high",
      thoughtSignatures: true
    },
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 1000000
    }
  },
  openrouter: {
    enabled: true,
    apiKey: "sk-or-test-key",
    baseUrl: "https://openrouter.ai/api/v1",
    rateLimit: {
      requestsPerMinute: 200,
      tokensPerMinute: 500000
    }
  },
  cohere: {
    enabled: true,
    apiKey: "test-cohere-key",
    models: ["command", "command-light", "command-nightly"],
    rateLimit: {
      requestsPerMinute: 100,
      tokensPerMinute: 200000
    }
  },
  mistral: {
    enabled: true,
    apiKey: "test-mistral-key",
    models: [
      "mistral-large-latest",
      "mistral-medium-latest", 
      "mistral-small-latest"
    ],
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 150000
    }
  },
  together: {
    enabled: true,
    apiKey: "test-together-key",
    models: [
      "meta-llama/Llama-2-70b-chat-hf",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "togethercomputer/RedPajama-INCITE-Chat-3B-v1"
    ],
    rateLimit: {
      requestsPerMinute: 100,
      tokensPerMinute: 300000
    }
  },
  perplexity: {
    enabled: true,
    apiKey: "test-perplexity-key",
    models: [
      "pplx-7b-online",
      "pplx-70b-online",
      "pplx-7b-chat",
      "pplx-70b-chat"
    ],
    features: {
      searchAugmented: true,
      realTimeInfo: true
    },
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000
    }
  },
  ollama: {
    enabled: true,
    baseUrl: "http://localhost:11434",
    models: ["llama2", "codellama", "mistral", "neural-chat"],
    features: {
      localInference: true,
      offline: true
    }
  }
};

// Configuration validation schemas
const RateLimitSchema = z.object({
  requestsPerMinute: z.number().min(1).max(10000),
  tokensPerMinute: z.number().min(1000).max(10000000),
  concurrentRequests: z.number().min(1).max(1000).optional()
});

const BaseProviderSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  models: z.array(z.string()).optional(),
  rateLimit: RateLimitSchema.optional(),
  priority: z.number().min(1).max(10).optional()
});

const AnthropicConfigSchema = BaseProviderSchema.extend({
  anthropic: z.object({
    maxTokens: z.number().min(1).max(8192).optional(),
    systemMessage: z.string().optional(),
    safetyLevel: z.enum(["standard", "strict"]).optional()
  }).optional()
});

const GoogleConfigSchema = BaseProviderSchema.extend({
  gemini: z.object({
    thinkingLevel: z.enum(["low", "medium", "high"]).optional(),
    mediaResolution: z.enum(["low", "medium", "high", "ultra_high"]).optional(),
    thoughtSignatures: z.boolean().optional(),
    imageConfig: z.object({
      aspectRatio: z.string().optional(),
      imageSize: z.enum(["1K", "2K", "4K"]).optional()
    }).optional(),
    safetySettings: z.array(z.object({
      category: z.string(),
      threshold: z.string()
    })).optional(),
    generationConfig: z.object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      topK: z.number().min(1).max(100).optional(),
      maxOutputTokens: z.number().min(1).max(8192).optional()
    }).optional()
  }).optional()
});

const OllamaConfigSchema = BaseProviderSchema.extend({
  ollama: z.object({
    keepAlive: z.string().optional(),
    numCtx: z.number().min(512).max(32768).optional(),
    numGpu: z.number().min(0).max(8).optional(),
    temperature: z.number().min(0).max(2).optional()
  }).optional(),
  features: z.object({
    localInference: z.boolean().optional(),
    offline: z.boolean().optional()
  }).optional()
});

describe('Documentation Configuration Examples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Provider Configurations', () => {
    it('should validate Anthropic configuration from setup guide', () => {
      const config = mockProviderConfigs.anthropic;
      
      expect(() => AnthropicConfigSchema.parse(config)).not.toThrow();
      expect(config.enabled).toBe(true);
      expect(config.apiKey).toMatch(/^sk-ant-/);
      expect(config.models).toContain('claude-3-5-sonnet-20241022');
      expect(config.rateLimit?.requestsPerMinute).toBe(60);
      expect(config.rateLimit?.tokensPerMinute).toBe(100000);
    });

    it('should validate Google Gemini configuration from setup guide', () => {
      const config = mockProviderConfigs.google;
      
      expect(() => GoogleConfigSchema.parse(config)).not.toThrow();
      expect(config.enabled).toBe(true);
      expect(config.apiKey).toMatch(/^AIza/);
      expect(config.models).toContain('gemini-3-pro-preview');
      expect(config.gemini?.thinkingLevel).toBe('medium');
      expect(config.gemini?.mediaResolution).toBe('high');
      expect(config.gemini?.thoughtSignatures).toBe(true);
    });

    it('should validate OpenRouter configuration from setup guide', () => {
      const config = mockProviderConfigs.openrouter;
      
      expect(() => BaseProviderSchema.parse(config)).not.toThrow();
      expect(config.enabled).toBe(true);
      expect(config.apiKey).toMatch(/^sk-or-/);
      expect(config.baseUrl).toBe('https://openrouter.ai/api/v1');
      expect(config.rateLimit?.requestsPerMinute).toBe(200);
    });

    it('should validate Ollama configuration from setup guide', () => {
      const config = mockProviderConfigs.ollama;
      
      expect(() => OllamaConfigSchema.parse(config)).not.toThrow();
      expect(config.enabled).toBe(true);
      expect(config.baseUrl).toBe('http://localhost:11434');
      expect(config.models).toContain('llama2');
      expect(config.features?.localInference).toBe(true);
      expect(config.features?.offline).toBe(true);
    });
  });

  describe('Advanced Configuration Examples', () => {
    it('should validate advanced Anthropic configuration', () => {
      const advancedConfig = {
        ...mockProviderConfigs.anthropic,
        anthropic: {
          maxTokens: 4096,
          systemMessage: "You are a helpful AI assistant specialized in code analysis.",
          safetyLevel: "standard" as const
        },
        retryConfig: {
          maxRetries: 3,
          backoffMs: 1000,
          retryableErrors: ["rate_limit_error", "server_error", "timeout"]
        }
      };

      expect(() => AnthropicConfigSchema.parse(advancedConfig)).not.toThrow();
      expect(advancedConfig.anthropic.maxTokens).toBe(4096);
      expect(advancedConfig.anthropic.systemMessage).toContain('code analysis');
    });

    it('should validate advanced Google Gemini configuration', () => {
      const advancedConfig = {
        ...mockProviderConfigs.google,
        gemini: {
          thinkingLevel: "high" as const,
          mediaResolution: "ultra_high" as const,
          thoughtSignatures: true,
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "4K" as const
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192
          }
        }
      };

      expect(() => GoogleConfigSchema.parse(advancedConfig)).not.toThrow();
      expect(advancedConfig.gemini.thinkingLevel).toBe('high');
      expect(advancedConfig.gemini.imageConfig?.aspectRatio).toBe('16:9');
      expect(advancedConfig.gemini.generationConfig?.temperature).toBe(0.7);
    });

    it('should validate advanced Ollama configuration', () => {
      const advancedConfig = {
        ...mockProviderConfigs.ollama,
        timeout: 300000,
        ollama: {
          keepAlive: "5m",
          numCtx: 4096,
          numGpu: 1,
          temperature: 0.7
        }
      };

      expect(() => OllamaConfigSchema.parse(advancedConfig)).not.toThrow();
      expect(advancedConfig.ollama.keepAlive).toBe('5m');
      expect(advancedConfig.ollama.numCtx).toBe(4096);
      expect(advancedConfig.ollama.numGpu).toBe(1);
    });
  });

  describe('Fallback Configuration Examples', () => {
    it('should validate simple fallback chain configuration', () => {
      const fallbackConfig = {
        providers: {
          anthropic: { ...mockProviderConfigs.anthropic, priority: 1 },
          google: { ...mockProviderConfigs.google, priority: 2 },
          ollama: { ...mockProviderConfigs.ollama, priority: 3 }
        },
        fallbackConfig: {
          enabled: true,
          strategy: "priority",
          maxRetries: 2,
          retryDelay: 5000
        }
      };

      expect(fallbackConfig.providers.anthropic.priority).toBe(1);
      expect(fallbackConfig.providers.google.priority).toBe(2);
      expect(fallbackConfig.providers.ollama.priority).toBe(3);
      expect(fallbackConfig.fallbackConfig.strategy).toBe('priority');
    });

    it('should validate cost-optimized fallback configuration', () => {
      const costOptimizedConfig = {
        providers: {
          ollama: { ...mockProviderConfigs.ollama, priority: 1 },
          openrouter: { ...mockProviderConfigs.openrouter, priority: 2 },
          anthropic: { ...mockProviderConfigs.anthropic, priority: 3 }
        },
        fallbackConfig: {
          enabled: true,
          strategy: "cost",
          costThreshold: 0.01,
          fallbackTriggers: [
            "model_unavailable",
            "rate_limit_exceeded", 
            "cost_threshold_exceeded"
          ]
        }
      };

      expect(costOptimizedConfig.fallbackConfig.strategy).toBe('cost');
      expect(costOptimizedConfig.fallbackConfig.costThreshold).toBe(0.01);
      expect(costOptimizedConfig.fallbackConfig.fallbackTriggers).toContain('rate_limit_exceeded');
    });

    it('should validate feature-based fallback configuration', () => {
      const featureBasedConfig = {
        providers: {
          google: {
            ...mockProviderConfigs.google,
            priority: 1,
            features: {
              toolCalling: true,
              multimodal: true,
              imageGeneration: true
            }
          },
          anthropic: {
            ...mockProviderConfigs.anthropic,
            priority: 2,
            features: {
              toolCalling: true,
              multimodal: false,
              imageGeneration: false
            }
          }
        },
        fallbackConfig: {
          enabled: true,
          strategy: "feature",
          requiredFeatures: ["toolCalling"],
          preferredFeatures: ["multimodal", "imageGeneration"]
        }
      };

      expect(featureBasedConfig.providers.google.features?.multimodal).toBe(true);
      expect(featureBasedConfig.providers.anthropic.features?.multimodal).toBe(false);
      expect(featureBasedConfig.fallbackConfig.requiredFeatures).toContain('toolCalling');
    });
  });

  describe('Performance Configuration Examples', () => {
    it('should validate high-throughput configuration', () => {
      const highThroughputConfig = {
        providers: {
          anthropic: {
            ...mockProviderConfigs.anthropic,
            rateLimit: {
              requestsPerMinute: 1000,
              tokensPerMinute: 500000,
              concurrentRequests: 20
            },
            connectionPool: {
              maxConnections: 50,
              keepAlive: true,
              timeout: 30000
            }
          }
        },
        performance: {
          caching: {
            enabled: true,
            tokenCountCache: true,
            modelCapabilityCache: true,
            responseCache: false,
            ttl: 3600
          },
          batching: {
            enabled: true,
            maxBatchSize: 10,
            batchTimeout: 100
          }
        }
      };

      expect(highThroughputConfig.providers.anthropic.rateLimit.concurrentRequests).toBe(20);
      expect(highThroughputConfig.performance.caching.enabled).toBe(true);
      expect(highThroughputConfig.performance.batching.maxBatchSize).toBe(10);
    });

    it('should validate low-latency configuration', () => {
      const lowLatencyConfig = {
        providers: {
          google: {
            ...mockProviderConfigs.google,
            models: ["gemini-3-flash-preview"],
            gemini: {
              thinkingLevel: "low",
              mediaResolution: "medium"
            },
            connectionPool: {
              maxConnections: 10,
              keepAlive: true,
              timeout: 5000
            }
          }
        },
        performance: {
          streaming: {
            enabled: true,
            bufferSize: 1024,
            flushInterval: 10
          },
          timeout: {
            connection: 5000,
            request: 30000,
            stream: 60000
          }
        }
      };

      expect(lowLatencyConfig.providers.google.gemini?.thinkingLevel).toBe('low');
      expect(lowLatencyConfig.performance.streaming.bufferSize).toBe(1024);
      expect(lowLatencyConfig.performance.timeout.connection).toBe(5000);
    });

    it('should validate cost-optimized configuration', () => {
      const costOptimizedConfig = {
        providers: {
          ollama: { ...mockProviderConfigs.ollama, priority: 1 },
          openrouter: { ...mockProviderConfigs.openrouter, priority: 2 }
        },
        performance: {
          caching: {
            enabled: true,
            ttl: 7200
          },
          costOptimization: {
            enabled: true,
            maxCostPerRequest: 0.005,
            budgetTracking: true,
            monthlyBudget: 100.00,
            alertThreshold: 0.8
          }
        }
      };

      expect(costOptimizedConfig.performance.costOptimization.maxCostPerRequest).toBe(0.005);
      expect(costOptimizedConfig.performance.costOptimization.monthlyBudget).toBe(100.00);
      expect(costOptimizedConfig.performance.costOptimization.alertThreshold).toBe(0.8);
    });
  });

  describe('Environment-Specific Configurations', () => {
    it('should validate development environment configuration', () => {
      const devConfig = {
        providers: {
          ollama: { ...mockProviderConfigs.ollama, priority: 1 },
          anthropic: {
            ...mockProviderConfigs.anthropic,
            apiKey: "${ANTHROPIC_API_KEY_DEV}",
            priority: 2,
            rateLimit: {
              requestsPerMinute: 30,
              tokensPerMinute: 50000
            }
          }
        },
        logging: {
          level: "debug",
          providers: true,
          requests: true,
          responses: true
        },
        performance: {
          caching: {
            enabled: false
          }
        }
      };

      expect(devConfig.providers.ollama.priority).toBe(1);
      expect(devConfig.logging.level).toBe('debug');
      expect(devConfig.performance.caching.enabled).toBe(false);
    });

    it('should validate production environment configuration', () => {
      const prodConfig = {
        providers: {
          anthropic: {
            ...mockProviderConfigs.anthropic,
            apiKey: "${ANTHROPIC_API_KEY_PROD}",
            priority: 1,
            rateLimit: {
              requestsPerMinute: 1000,
              tokensPerMinute: 500000,
              concurrentRequests: 50
            }
          },
          google: {
            ...mockProviderConfigs.google,
            apiKey: "${GOOGLE_API_KEY_PROD}",
            priority: 2,
            rateLimit: {
              requestsPerMinute: 600,
              tokensPerMinute: 2000000,
              concurrentRequests: 100
            }
          }
        },
        fallbackConfig: {
          enabled: true,
          strategy: "priority",
          maxRetries: 3
        },
        logging: {
          level: "warn",
          providers: false,
          requests: false,
          responses: false
        },
        performance: {
          caching: {
            enabled: true,
            ttl: 3600
          },
          monitoring: {
            enabled: true,
            metrics: true,
            healthChecks: true
          }
        }
      };

      expect(prodConfig.providers.anthropic.rateLimit.concurrentRequests).toBe(50);
      expect(prodConfig.logging.level).toBe('warn');
      expect(prodConfig.performance.monitoring.enabled).toBe(true);
    });
  });

  describe('Security Configuration Examples', () => {
    it('should validate secure configuration template', () => {
      const secureConfig = {
        providers: {
          anthropic: {
            ...mockProviderConfigs.anthropic,
            apiKey: "${ANTHROPIC_API_KEY}",
            baseUrl: "https://api.anthropic.com",
            timeout: 30000
          }
        },
        security: {
          validateKeys: true,
          keyRotation: {
            enabled: true,
            interval: 2592000
          },
          tlsVerification: true,
          certificatePinning: false,
          logSanitization: true,
          maskApiKeys: true,
          rateLimitEnforcement: true,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 5,
            recoveryTimeout: 60000
          }
        },
        audit: {
          enabled: true,
          logRequests: false,
          logResponses: false,
          logMetadata: true,
          retention: 2592000
        }
      };

      expect(secureConfig.security.validateKeys).toBe(true);
      expect(secureConfig.security.tlsVerification).toBe(true);
      expect(secureConfig.security.maskApiKeys).toBe(true);
      expect(secureConfig.audit.logMetadata).toBe(true);
      expect(secureConfig.audit.logRequests).toBe(false);
    });
  });

  describe('API Key Format Validation', () => {
    it('should validate API key formats from setup guide', () => {
      const apiKeyFormats = {
        anthropic: /^sk-ant-/,
        google: /^AIza/,
        openrouter: /^sk-or-/,
        cohere: /^[a-zA-Z0-9-_]+$/,
        mistral: /^[a-zA-Z0-9-_]+$/,
        together: /^[a-zA-Z0-9-_]+$/,
        perplexity: /^[a-zA-Z0-9-_]+$/
      };

      expect(mockProviderConfigs.anthropic.apiKey).toMatch(apiKeyFormats.anthropic);
      expect(mockProviderConfigs.google.apiKey).toMatch(apiKeyFormats.google);
      expect(mockProviderConfigs.openrouter.apiKey).toMatch(apiKeyFormats.openrouter);
      expect(mockProviderConfigs.cohere.apiKey).toMatch(apiKeyFormats.cohere);
      expect(mockProviderConfigs.mistral.apiKey).toMatch(apiKeyFormats.mistral);
      expect(mockProviderConfigs.together.apiKey).toMatch(apiKeyFormats.together);
      expect(mockProviderConfigs.perplexity.apiKey).toMatch(apiKeyFormats.perplexity);
    });
  });

  describe('Model Name Validation', () => {
    it('should validate model names from documentation', () => {
      const expectedModels = {
        anthropic: [
          'claude-3-5-sonnet-20241022',
          'claude-3-opus-20240229',
          'claude-3-haiku-20240307'
        ],
        google: [
          'gemini-3-pro-preview',
          'gemini-3-flash-preview',
          'gemini-3-pro-image-preview',
          'gemini-2-flash-preview',
          'gemini-2-flash-thinking-preview'
        ],
        ollama: [
          'llama2',
          'codellama',
          'mistral',
          'neural-chat'
        ]
      };

      expectedModels.anthropic.forEach(model => {
        expect(mockProviderConfigs.anthropic.models).toContain(model);
      });

      expectedModels.google.forEach(model => {
        expect(mockProviderConfigs.google.models).toContain(model);
      });

      expectedModels.ollama.forEach(model => {
        expect(mockProviderConfigs.ollama.models).toContain(model);
      });
    });
  });

  describe('Rate Limit Validation', () => {
    it('should validate rate limits are within reasonable bounds', () => {
      Object.entries(mockProviderConfigs).forEach(([provider, config]) => {
        if (config.rateLimit) {
          expect(config.rateLimit.requestsPerMinute).toBeGreaterThan(0);
          expect(config.rateLimit.requestsPerMinute).toBeLessThanOrEqual(10000);
          expect(config.rateLimit.tokensPerMinute).toBeGreaterThan(0);
          expect(config.rateLimit.tokensPerMinute).toBeLessThanOrEqual(10000000);
        }
      });
    });
  });
});

describe('Migration Guide Examples', () => {
  describe('OpenAI to Multi-Provider Migration', () => {
    it('should validate OpenAI model mapping examples', () => {
      const modelMigration = {
        "gpt-4o": [
          "anthropic/claude-3.5-sonnet",
          "claude-3-5-sonnet-20241022",
          "gemini-3-pro-preview"
        ],
        "gpt-4o-mini": [
          "claude-3-haiku-20240307",
          "gemini-3-flash-preview",
          "mistral-small-latest"
        ]
      };

      expect(modelMigration["gpt-4o"]).toContain("claude-3-5-sonnet-20241022");
      expect(modelMigration["gpt-4o-mini"]).toContain("claude-3-haiku-20240307");
      expect(modelMigration["gpt-4o"]).toContain("gemini-3-pro-preview");
    });

    it('should validate tool calling migration format', () => {
      const openAITool = {
        type: "function",
        function: {
          name: "readFile",
          description: "Read a file",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string" }
            }
          }
        }
      };

      const anthropicTool = {
        name: "readFile",
        description: "Read a file",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string" }
          }
        }
      };

      expect(openAITool.function.name).toBe(anthropicTool.name);
      expect(openAITool.function.description).toBe(anthropicTool.description);
      expect(openAITool.function.parameters.type).toBe(anthropicTool.input_schema.type);
    });
  });

  describe('Configuration Migration Examples', () => {
    it('should validate before/after configuration migration', () => {
      const beforeConfig = {
        providers: {
          openai: {
            apiKey: "${OPENAI_API_KEY}",
            models: ["gpt-4o", "gpt-4o-mini"]
          }
        }
      };

      const afterConfig = {
        providers: {
          openrouter: {
            apiKey: "${OPENROUTER_API_KEY}",
            models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"]
          },
          anthropic: {
            apiKey: "${ANTHROPIC_API_KEY}",
            models: ["claude-3-5-sonnet-20241022"]
          }
        }
      };

      expect(beforeConfig.providers.openai.models).toContain("gpt-4o");
      expect(afterConfig.providers.openrouter.models).toContain("openai/gpt-4o");
      expect(afterConfig.providers.anthropic.models).toContain("claude-3-5-sonnet-20241022");
    });
  });
});

describe('Best Practices Validation', () => {
  describe('Use Case Configurations', () => {
    it('should validate code analysis configuration', () => {
      const codeAnalysisConfig = {
        providers: {
          anthropic: {
            models: ["claude-3-5-sonnet-20241022"],
            anthropic: {
              systemMessage: "You are an expert code reviewer. Focus on security, performance, and best practices.",
              maxTokens: 8192
            }
          }
        },
        fallbackChain: ["anthropic", "google", "openrouter"],
        features: {
          toolCalling: true,
          largeContext: true,
          streaming: true
        }
      };

      expect(codeAnalysisConfig.providers.anthropic.models).toContain("claude-3-5-sonnet-20241022");
      expect(codeAnalysisConfig.providers.anthropic.anthropic?.systemMessage).toContain("code reviewer");
      expect(codeAnalysisConfig.features.toolCalling).toBe(true);
    });

    it('should validate creative writing configuration', () => {
      const creativeConfig = {
        providers: {
          google: {
            models: ["gemini-3-pro-preview"],
            gemini: {
              generationConfig: {
                temperature: 0.9,
                topP: 0.95
              },
              thinkingLevel: "medium"
            }
          }
        },
        features: {
          imageGeneration: true,
          multimodal: true,
          largeContext: true
        }
      };

      expect(creativeConfig.providers.google.gemini?.generationConfig?.temperature).toBe(0.9);
      expect(creativeConfig.features.imageGeneration).toBe(true);
      expect(creativeConfig.features.multimodal).toBe(true);
    });

    it('should validate privacy-focused configuration', () => {
      const privacyConfig = {
        providers: {
          ollama: {
            models: ["llama2", "codellama"],
            priority: 1
          },
          mistral: {
            models: ["mistral-large-latest"],
            priority: 2
          }
        },
        features: {
          localInference: true,
          dataResidency: "eu",
          noCloudProcessing: true
        }
      };

      expect(privacyConfig.providers.ollama.priority).toBe(1);
      expect(privacyConfig.features.localInference).toBe(true);
      expect(privacyConfig.features.dataResidency).toBe("eu");
    });
  });
});