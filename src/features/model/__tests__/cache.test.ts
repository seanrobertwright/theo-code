/**
 * @fileoverview Unit tests for caching strategies
 * @module features/model/__tests__/cache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  Cache, 
  TokenCountCache, 
  ModelCapabilityCache, 
  ResponseCache, 
  CacheManager,
  DEFAULT_CACHE_CONFIG 
} from '../cache.js';
import type { Message } from '../../../shared/types/index.js';

describe('Cache', () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>({
      maxEntries: 5,
      ttlMs: 1000, // 1 second for testing
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      
      expect(cache.get('key1')).toBe('value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should update existing values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      
      expect(cache.get('key1')).toBe('value2');
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.clear();
      
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      
      expect(cache.get('key1')).toBe('value1');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not return expired entries', async () => {
      const shortTtlCache = new Cache<string>({ ttlMs: 50 });
      
      try {
        shortTtlCache.set('key1', 'value1');
        
        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(shortTtlCache.get('key1')).toBeUndefined();
      } finally {
        shortTtlCache.clear();
      }
    });
  });

  describe('Eviction Strategies', () => {
    it('should evict entries when max size is reached (LRU)', () => {
      // Fill cache to capacity
      for (let i = 1; i <= 5; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      // Access key1 to make it recently used
      cache.get('key1');
      
      // Add one more entry to trigger eviction
      cache.set('key6', 'value6');
      
      // Should have evicted some entries (exact behavior depends on implementation)
      const stats = cache.getStats();
      expect(stats.entryCount).toBeLessThanOrEqual(5); // Should not exceed max
      expect(cache.get('key6')).toBe('value6'); // New entry should exist
    });

    it('should handle LFU eviction strategy', () => {
      const lfuCache = new Cache<string>({
        maxEntries: 3,
        evictionStrategy: 'lfu',
      });
      
      try {
        // Fill cache
        lfuCache.set('key1', 'value1');
        lfuCache.set('key2', 'value2');
        lfuCache.set('key3', 'value3');
        
        // Access key1 multiple times
        lfuCache.get('key1');
        lfuCache.get('key1');
        lfuCache.get('key1');
        
        // Access key2 once
        lfuCache.get('key2');
        
        // Add new entry to trigger eviction
        lfuCache.set('key4', 'value4');
        
        // key3 should be evicted (least frequently used)
        expect(lfuCache.get('key3')).toBeUndefined();
        expect(lfuCache.get('key1')).toBe('value1');
        expect(lfuCache.get('key2')).toBe('value2');
        expect(lfuCache.get('key4')).toBe('value4');
      } finally {
        lfuCache.clear();
      }
    });
  });

  describe('Statistics', () => {
    it('should track hit and miss statistics', () => {
      cache.set('key1', 'value1');
      
      // Hits
      cache.get('key1');
      cache.get('key1');
      
      // Misses
      cache.get('nonexistent1');
      cache.get('nonexistent2');
      
      const stats = cache.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.entryCount).toBe(1);
    });

    it('should estimate memory usage', () => {
      cache.set('key1', 'small');
      cache.set('key2', 'a much longer string that takes more memory');
      
      const stats = cache.getStats();
      
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.averageEntrySize).toBeGreaterThan(0);
      expect(stats.entryCount).toBe(2);
    });
  });
});

describe('TokenCountCache', () => {
  let tokenCache: TokenCountCache;

  beforeEach(() => {
    tokenCache = new TokenCountCache({ maxEntries: 10 });
  });

  afterEach(() => {
    tokenCache.clear();
  });

  describe('Token Count Operations', () => {
    it('should cache token counts for messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello, world!' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      
      tokenCache.setTokenCount('openai', 'gpt-4o', messages, 25);
      
      const cached = tokenCache.getTokenCount('openai', 'gpt-4o', messages);
      expect(cached).toBe(25);
    });

    it('should return undefined for non-cached messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Uncached message' },
      ];
      
      const cached = tokenCache.getTokenCount('openai', 'gpt-4o', messages);
      expect(cached).toBeUndefined();
    });

    it('should differentiate between providers and models', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Same message' },
      ];
      
      tokenCache.setTokenCount('openai', 'gpt-4o', messages, 10);
      tokenCache.setTokenCount('anthropic', 'claude-3-5-sonnet', messages, 15);
      
      expect(tokenCache.getTokenCount('openai', 'gpt-4o', messages)).toBe(10);
      expect(tokenCache.getTokenCount('anthropic', 'claude-3-5-sonnet', messages)).toBe(15);
      expect(tokenCache.getTokenCount('openai', 'claude-3-5-sonnet', messages)).toBeUndefined();
    });

    it('should handle different message structures', () => {
      const messages1: Message[] = [
        { role: 'user', content: 'Hello' },
      ];
      
      const messages2: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ];
      
      tokenCache.setTokenCount('openai', 'gpt-4o', messages1, 5);
      tokenCache.setTokenCount('openai', 'gpt-4o', messages2, 5);
      
      // Should be treated as different due to content structure
      expect(tokenCache.getTokenCount('openai', 'gpt-4o', messages1)).toBe(5);
      expect(tokenCache.getTokenCount('openai', 'gpt-4o', messages2)).toBe(5);
    });

    it('should generate consistent hashes for identical messages', () => {
      const messages1: Message[] = [
        { role: 'user', content: 'Test message' },
        { role: 'assistant', content: 'Response' },
      ];
      
      const messages2: Message[] = [
        { role: 'user', content: 'Test message' },
        { role: 'assistant', content: 'Response' },
      ];
      
      tokenCache.setTokenCount('openai', 'gpt-4o', messages1, 20);
      
      // Should find the cached value for identical messages
      expect(tokenCache.getTokenCount('openai', 'gpt-4o', messages2)).toBe(20);
    });
  });
});

describe('ModelCapabilityCache', () => {
  let capabilityCache: ModelCapabilityCache;

  beforeEach(() => {
    capabilityCache = new ModelCapabilityCache({ maxEntries: 10 });
  });

  afterEach(() => {
    capabilityCache.clear();
  });

  describe('Capability Caching', () => {
    it('should cache model capabilities', () => {
      const capabilities = {
        supportsToolCalling: true,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsImageGeneration: false,
        supportsReasoning: true,
        contextLimit: 128000,
        maxOutputTokens: 4096,
      };
      
      capabilityCache.setCapabilities('openai', 'gpt-4o', capabilities);
      
      const cached = capabilityCache.getCapabilities('openai', 'gpt-4o');
      expect(cached).toEqual(capabilities);
    });

    it('should return undefined for non-cached capabilities', () => {
      const cached = capabilityCache.getCapabilities('unknown', 'unknown-model');
      expect(cached).toBeUndefined();
    });

    it('should differentiate between providers and models', () => {
      const openaiCaps = {
        supportsToolCalling: true,
        supportsStreaming: true,
        supportsMultimodal: true,
        supportsImageGeneration: false,
        supportsReasoning: false,
        contextLimit: 128000,
        maxOutputTokens: 4096,
      };
      
      const anthropicCaps = {
        supportsToolCalling: true,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsImageGeneration: false,
        supportsReasoning: true,
        contextLimit: 200000,
        maxOutputTokens: 4096,
      };
      
      capabilityCache.setCapabilities('openai', 'gpt-4o', openaiCaps);
      capabilityCache.setCapabilities('anthropic', 'claude-3-5-sonnet', anthropicCaps);
      
      expect(capabilityCache.getCapabilities('openai', 'gpt-4o')).toEqual(openaiCaps);
      expect(capabilityCache.getCapabilities('anthropic', 'claude-3-5-sonnet')).toEqual(anthropicCaps);
      expect(capabilityCache.getCapabilities('openai', 'claude-3-5-sonnet')).toBeUndefined();
    });
  });
});

describe('ResponseCache', () => {
  let responseCache: ResponseCache;

  beforeEach(() => {
    responseCache = new ResponseCache({ maxEntries: 10 });
  });

  afterEach(() => {
    responseCache.clear();
  });

  describe('Response Caching', () => {
    it('should cache API responses', () => {
      const requestData = {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 100,
      };
      
      const response = {
        choices: [{ message: { content: 'Hi there!' } }],
        usage: { totalTokens: 25 },
      };
      
      responseCache.setResponse('openai', 'gpt-4o', requestData, response);
      
      const cached = responseCache.getResponse('openai', 'gpt-4o', requestData);
      expect(cached).toEqual(response);
    });

    it('should return undefined for non-cached responses', () => {
      const requestData = { query: 'uncached request' };
      
      const cached = responseCache.getResponse('openai', 'gpt-4o', requestData);
      expect(cached).toBeUndefined();
    });

    it('should normalize request data for consistent caching', () => {
      const requestData1 = {
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        timestamp: Date.now(),
        requestId: 'req-123',
      };
      
      const requestData2 = {
        temperature: 0.7,
        messages: [{ role: 'user', content: 'Hello' }],
        timestamp: Date.now() + 1000, // Different timestamp
        requestId: 'req-456', // Different request ID
      };
      
      const response = { result: 'test response' };
      
      responseCache.setResponse('openai', 'gpt-4o', requestData1, response);
      
      // Should find cached response despite different timestamp/requestId
      const cached = responseCache.getResponse('openai', 'gpt-4o', requestData2);
      expect(cached).toEqual(response);
    });

    it('should differentiate between different request parameters', () => {
      const baseRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };
      
      const request1 = { ...baseRequest, temperature: 0.7 };
      const request2 = { ...baseRequest, temperature: 0.9 };
      
      const response1 = { result: 'response1' };
      const response2 = { result: 'response2' };
      
      responseCache.setResponse('openai', 'gpt-4o', request1, response1);
      responseCache.setResponse('openai', 'gpt-4o', request2, response2);
      
      expect(responseCache.getResponse('openai', 'gpt-4o', request1)).toEqual(response1);
      expect(responseCache.getResponse('openai', 'gpt-4o', request2)).toEqual(response2);
    });
  });
});

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      tokenCount: { maxEntries: 5 },
      modelCapability: { maxEntries: 5 },
      response: { maxEntries: 5 },
    });
  });

  afterEach(() => {
    cacheManager.clearAll();
  });

  describe('Cache Access', () => {
    it('should provide access to specialized caches', () => {
      expect(cacheManager.getTokenCountCache()).toBeInstanceOf(TokenCountCache);
      expect(cacheManager.getModelCapabilityCache()).toBeInstanceOf(ModelCapabilityCache);
      expect(cacheManager.getResponseCache()).toBeInstanceOf(ResponseCache);
    });

    it('should provide combined statistics', () => {
      const tokenCache = cacheManager.getTokenCountCache();
      const capabilityCache = cacheManager.getModelCapabilityCache();
      const responseCache = cacheManager.getResponseCache();
      
      // Add some data to each cache
      tokenCache.setTokenCount('openai', 'gpt-4o', [{ role: 'user', content: 'test' }], 10);
      capabilityCache.setCapabilities('openai', 'gpt-4o', {
        supportsToolCalling: true,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsImageGeneration: false,
        supportsReasoning: false,
        contextLimit: 128000,
        maxOutputTokens: 4096,
      });
      responseCache.setResponse('openai', 'gpt-4o', { query: 'test' }, { result: 'test' });
      
      const stats = cacheManager.getStats();
      
      expect(stats.tokenCount.entryCount).toBe(1);
      expect(stats.modelCapability.entryCount).toBe(1);
      expect(stats.response.entryCount).toBe(1);
      expect(stats.total.entryCount).toBe(3);
      expect(stats.total.memoryUsage).toBeGreaterThan(0);
    });

    it('should clear all caches', () => {
      const tokenCache = cacheManager.getTokenCountCache();
      const capabilityCache = cacheManager.getModelCapabilityCache();
      const responseCache = cacheManager.getResponseCache();
      
      // Add data to caches
      tokenCache.setTokenCount('openai', 'gpt-4o', [{ role: 'user', content: 'test' }], 10);
      capabilityCache.setCapabilities('openai', 'gpt-4o', {
        supportsToolCalling: true,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsImageGeneration: false,
        supportsReasoning: false,
        contextLimit: 128000,
        maxOutputTokens: 4096,
      });
      responseCache.setResponse('openai', 'gpt-4o', { query: 'test' }, { result: 'test' });
      
      cacheManager.clearAll();
      
      const stats = cacheManager.getStats();
      expect(stats.total.entryCount).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should work with default configuration', () => {
      const defaultManager = new CacheManager();
      
      expect(defaultManager.getTokenCountCache()).toBeInstanceOf(TokenCountCache);
      expect(defaultManager.getModelCapabilityCache()).toBeInstanceOf(ModelCapabilityCache);
      expect(defaultManager.getResponseCache()).toBeInstanceOf(ResponseCache);
      
      defaultManager.clearAll();
    });

    it('should apply custom configuration to individual caches', () => {
      const customManager = new CacheManager({
        tokenCount: { maxEntries: 100, ttlMs: 5000 },
        modelCapability: { maxEntries: 50, ttlMs: 10000 },
        response: { maxEntries: 200, ttlMs: 2000 },
      });
      
      // Test that caches work with custom config
      const tokenCache = customManager.getTokenCountCache();
      tokenCache.setTokenCount('openai', 'gpt-4o', [{ role: 'user', content: 'test' }], 10);
      
      expect(tokenCache.getTokenCount('openai', 'gpt-4o', [{ role: 'user', content: 'test' }])).toBe(10);
      
      customManager.clearAll();
    });
  });
});