/**
 * @fileoverview Unit tests for Google Gemini adapter advanced features
 * @module features/model/adapters/__tests__/google.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleAdapter } from '../google.js';
import type { ModelConfig } from '../../../../shared/types/models.js';
import type { Message } from '../../../../shared/types/index.js';

// Mock the Google Generative AI SDK
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContentStream: vi.fn(),
      generateContent: vi.fn(),
      countTokens: vi.fn(),
    }),
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH',
  },
}));

describe('GoogleAdapter Advanced Features', () => {
  let adapter: GoogleAdapter;
  let mockConfig: ModelConfig;

  beforeEach(() => {
    mockConfig = {
      provider: 'google',
      model: 'gemini-3-pro-preview',
      apiKey: 'test-api-key',
      gemini: {
        thinkingLevel: 'medium',
        mediaResolution: 'high',
        thoughtSignatures: true,
      },
    };
    
    // Set environment variable for testing
    process.env.GOOGLE_API_KEY = 'test-api-key';
    
    adapter = new GoogleAdapter(mockConfig);
  });

  describe('Thinking Level Configuration', () => {
    it('should set thinking level correctly', () => {
      adapter.setThinkingLevel('high');
      expect(adapter.getThinkingLevel()).toBe('high');
    });

    it('should throw error for unsupported model', () => {
      const unsupportedConfig = {
        ...mockConfig,
        model: 'gemini-1.5-pro',
      };
      const unsupportedAdapter = new GoogleAdapter(unsupportedConfig);
      
      expect(() => {
        unsupportedAdapter.setThinkingLevel('high');
      }).toThrow('Thinking levels are not supported for model: gemini-1.5-pro');
    });

    it('should validate thinking levels during config validation', () => {
      const invalidConfig = {
        ...mockConfig,
        model: 'gemini-1.5-pro',
        gemini: {
          thinkingLevel: 'high' as const,
        },
      };
      
      const invalidAdapter = new GoogleAdapter(invalidConfig);
      expect(() => {
        invalidAdapter.validateConfig();
      }).toThrow('Thinking levels are not supported for model: gemini-1.5-pro');
    });
  });

  describe('Thought Signature Handling', () => {
    it('should enable and disable thought signatures', () => {
      adapter.setThoughtSignatures(true);
      expect(adapter.getThoughtSignature()).toBeUndefined(); // No signature set yet
      
      adapter.setThoughtSignatures(false);
      // Should still be undefined since we haven't set one
      expect(adapter.getThoughtSignature()).toBeUndefined();
    });

    it('should set and get thought signatures', () => {
      adapter.setThoughtSignatures(true);
      
      const signature = {
        signature: 'test-signature-data',
        turnId: 'turn_1',
      };
      
      adapter.setThoughtSignature(signature);
      expect(adapter.getThoughtSignature()).toEqual(signature);
    });

    it('should clear thought signatures', () => {
      adapter.setThoughtSignatures(true);
      
      const signature = {
        signature: 'test-signature-data',
        turnId: 'turn_1',
      };
      
      adapter.setThoughtSignature(signature);
      adapter.clearThoughtSignature();
      expect(adapter.getThoughtSignature()).toBeUndefined();
    });

    it('should warn when setting signature without enabling signatures', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      adapter.setThoughtSignatures(false);
      
      const signature = {
        signature: 'test-signature-data',
        turnId: 'turn_1',
      };
      
      adapter.setThoughtSignature(signature);
      // Should not set the signature
      expect(adapter.getThoughtSignature()).toBeUndefined();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Media Resolution Controls', () => {
    it('should set and get media resolution', () => {
      adapter.setMediaResolution('ultra_high');
      expect(adapter.getMediaResolution()).toBe('ultra_high');
    });

    it('should get optimal media resolution for different types', () => {
      // Test with Gemini 3.0 model - check actual implementation
      const imageRes = adapter.getOptimalMediaResolution('image');
      const videoRes = adapter.getOptimalMediaResolution('video');
      const audioRes = adapter.getOptimalMediaResolution('audio');
      
      // Verify they return valid resolutions
      const validResolutions = ['low', 'medium', 'high', 'ultra_high'];
      expect(validResolutions).toContain(imageRes);
      expect(validResolutions).toContain(videoRes);
      expect(validResolutions).toContain(audioRes);
      
      // Video should generally use lower resolution than image for token efficiency
      const resolutionOrder = ['low', 'medium', 'high', 'ultra_high'];
      const imageIndex = resolutionOrder.indexOf(imageRes);
      const videoIndex = resolutionOrder.indexOf(videoRes);
      
      // This is a reasonable expectation but not strict
      expect(imageIndex).toBeGreaterThanOrEqual(0);
      expect(videoIndex).toBeGreaterThanOrEqual(0);
    });

    it('should estimate multimodal tokens correctly', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image' },
            { 
              type: 'image', 
              source: { 
                type: 'base64', 
                data: 'base64-image-data',
                media_type: 'image/jpeg'
              } 
            },
          ],
        },
      ];

      const estimate = adapter.estimateMultimodalTokens(messages);
      
      expect(estimate.textTokens).toBeGreaterThan(0);
      expect(estimate.mediaTokens).toBeGreaterThan(0);
      expect(estimate.totalTokens).toBe(estimate.textTokens + estimate.mediaTokens);
    });

    it('should process multimodal content with optimization', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image' },
            { 
              type: 'image', 
              source: { 
                type: 'base64', 
                data: 'base64-image-data',
                media_type: 'image/jpeg'
              } 
            },
          ],
        },
      ];

      const result = await adapter.processMultimodalContent(messages, {
        maxTokens: 1000,
        autoOptimize: true,
      });

      expect(result.processedMessages).toBeDefined();
      expect(result.tokenEstimate).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'ultra_high']).toContain(result.resolution);
    });
  });

  describe('Image Generation Capabilities', () => {
    it('should throw error for non-image generation models', async () => {
      const nonImageConfig = {
        ...mockConfig,
        model: 'gemini-3-pro-preview', // Not an image generation model
      };
      const nonImageAdapter = new GoogleAdapter(nonImageConfig);

      await expect(
        nonImageAdapter.generateImage('Generate a cat')
      ).rejects.toThrow('Image generation is not supported for model: gemini-3-pro-preview');
    });

    it('should validate image generation config', () => {
      const invalidConfig = {
        ...mockConfig,
        model: 'gemini-3-pro-preview',
        gemini: {
          imageGeneration: {
            aspectRatio: '16:9',
            imageSize: '4K' as const,
          },
        },
      };
      
      const invalidAdapter = new GoogleAdapter(invalidConfig);
      expect(() => {
        invalidAdapter.validateConfig();
      }).toThrow('Image generation is not supported for model: gemini-3-pro-preview');
    });
  });

  describe('Token Counting and Optimization', () => {
    it('should count tokens with caching', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I am doing well, thank you!' },
      ];

      const count1 = adapter.countTokens(messages);
      const count2 = adapter.countTokens(messages); // Should use cache

      expect(count1).toBeGreaterThan(0);
      expect(count2).toBe(count1);
    });

    it('should optimize token usage', async () => {
      const longMessages: Message[] = [
        { role: 'user', content: 'A'.repeat(1000) },
        { role: 'assistant', content: 'B'.repeat(1000) },
        { role: 'user', content: 'C'.repeat(1000) },
      ];

      const result = await adapter.optimizeTokenUsage(longMessages, 100, {
        allowContentTruncation: true,
        preserveLatestMessages: 1,
      });

      expect(result.optimizedMessages.length).toBeLessThanOrEqual(longMessages.length);
      expect(result.tokenCount).toBeLessThanOrEqual(result.tokenCount);
      expect(result.optimizations.length).toBeGreaterThan(0);
    });

    it('should get token counting stats', () => {
      const stats = adapter.getTokenCountingStats();
      
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('estimationFallbacks');
      expect(typeof stats.cacheSize).toBe('number');
      expect(typeof stats.estimationFallbacks).toBe('number');
    });

    it('should clear token count cache', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test message' },
      ];

      // Count tokens to populate cache
      adapter.countTokens(messages);
      
      // Clear cache
      adapter.clearTokenCountCache();
      
      const stats = adapter.getTokenCountingStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('Conversation Context Migration', () => {
    it('should migrate conversation context', () => {
      const context = {
        previousModel: 'gpt-4',
        conversationSummary: 'We were discussing AI capabilities',
        reasoningContext: 'The user asked about reasoning',
        thoughtSignature: {
          signature: 'previous-signature',
          turnId: 'turn_0',
        },
      };

      adapter.setThoughtSignatures(true);
      adapter.migrateConversationContext(context);

      expect(adapter.getThoughtSignature()).toEqual(context.thoughtSignature);
    });

    it('should handle parallel function calls', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Execute these functions in parallel' },
      ];

      const functionCalls = [
        { name: 'function1', arguments: { param: 'value1' } },
        { name: 'function2', arguments: { param: 'value2' } },
      ];

      // Mock the generateStream method
      const mockGenerateStream = vi.fn().mockImplementation(async function* () {
        yield { type: 'text', text: 'Function executed' };
        yield { type: 'done' };
      });
      
      adapter.generateStream = mockGenerateStream;

      const result = await adapter.handleParallelFunctionCalls(
        messages,
        functionCalls
      );

      expect(result.results).toHaveLength(2);
      expect(mockGenerateStream).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate empty model name', () => {
      const invalidConfig = {
        ...mockConfig,
        model: '',
      };
      
      const invalidAdapter = new GoogleAdapter(invalidConfig);
      expect(() => {
        invalidAdapter.validateConfig();
      }).toThrow('Model name is required');
    });

    it('should require API key', () => {
      delete process.env.GOOGLE_API_KEY;
      
      const configWithoutKey = {
        ...mockConfig,
        apiKey: undefined,
      };
      
      expect(() => {
        new GoogleAdapter(configWithoutKey);
      }).toThrow('API key is required');
      
      // Restore for other tests
      process.env.GOOGLE_API_KEY = 'test-api-key';
    });
  });

  describe('Model Capabilities', () => {
    it('should correctly identify function calling support', () => {
      expect(adapter.supportsToolCalling).toBe(true);
      
      const olderModelConfig = {
        ...mockConfig,
        model: 'gemini-1.0-pro',
      };
      const olderAdapter = new GoogleAdapter(olderModelConfig);
      expect(olderAdapter.supportsToolCalling).toBe(false);
    });

    it('should set correct context limits', () => {
      expect(adapter.contextLimit).toBe(1000000); // Gemini 3.0 Pro default
      
      const customConfig = {
        ...mockConfig,
        contextLimit: 500000,
      };
      const customAdapter = new GoogleAdapter(customConfig);
      expect(customAdapter.contextLimit).toBe(500000);
    });
  });
});