/**
 * @fileoverview Caching strategies for model adapters
 * @module features/model/cache
 *
 * Provides caching for token counts, model capabilities, and responses
 * to improve performance and reduce redundant API calls.
 */

import type { ModelProvider } from '../../shared/types/models.js';
import type { Message } from '../../shared/types/index.js';
import { logger } from '../../shared/utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Cache configuration.
 */
export interface CacheConfig {
  /** Maximum number of entries in cache */
  maxEntries: number;
  /** Time-to-live for cache entries in milliseconds */
  ttlMs: number;
  /** Whether to enable cache compression */
  enableCompression: boolean;
  /** Cache eviction strategy */
  evictionStrategy: 'lru' | 'lfu' | 'ttl';
}

/**
 * Cache entry metadata.
 */
interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  expiresAt: Date;
  size: number; // Estimated size in bytes
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Total number of entries */
  entryCount: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Total memory usage in bytes */
  memoryUsage: number;
  /** Average entry size in bytes */
  averageEntrySize: number;
}

/**
 * Token count cache entry.
 */
export interface TokenCountCacheEntry {
  provider: ModelProvider;
  model: string;
  messageHash: string;
  tokenCount: number;
}

/**
 * Model capability cache entry.
 */
export interface ModelCapabilityCacheEntry {
  provider: ModelProvider;
  model: string;
  capabilities: {
    supportsToolCalling: boolean;
    supportsStreaming: boolean;
    supportsMultimodal: boolean;
    supportsImageGeneration: boolean;
    supportsReasoning: boolean;
    contextLimit: number;
    maxOutputTokens: number;
  };
}

/**
 * Response cache entry.
 */
export interface ResponseCacheEntry {
  provider: ModelProvider;
  model: string;
  requestHash: string;
  response: any;
  responseSize: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxEntries: 10000,
  ttlMs: 3600000,        // 1 hour
  enableCompression: false,
  evictionStrategy: 'lru',
};

// =============================================================================
// GENERIC CACHE
// =============================================================================

/**
 * Generic LRU/LFU cache with TTL support.
 *
 * @example
 * ```typescript
 * const cache = new Cache<string>({
 *   _maxEntries: 1000,
 *   _ttlMs: 300000, // 5 minutes
 * });
 *
 * cache.set('key', 'value');
 * const value = cache.get('key');
 * ```
 */
export class Cache<T> {
  private readonly config: CacheConfig;
  private readonly entries = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    
    // Start periodic cleanup
    setInterval(() => {
      this.cleanup();
    }, this.config.ttlMs / 4);

    logger.debug('[Cache] Initialized with config:', this.config);
  }

  // =============================================================================
  // CACHE OPERATIONS
  // =============================================================================

  /**
   * Gets a value from the cache.
   */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    
    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if entry is expired
    if (entry.expiresAt < new Date()) {
      this.entries.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access metadata
    entry.lastAccessedAt = new Date();
    entry.accessCount++;
    
    this.hits++;
    return entry.value;
  }

  /**
   * Sets a value in the cache.
   */
  set(key: string, value: T): void {
    const now = new Date();
    const size = this.estimateSize(value);
    
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      expiresAt: new Date(now.getTime() + this.config.ttlMs),
      size,
    };

    // Remove existing entry if present
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    // Check if we need to evict entries
    if (this.entries.size >= this.config.maxEntries) {
      this.evictEntries();
    }

    this.entries.set(key, entry);
    logger.debug(`[Cache] Set entry ${key} (size: ${size} bytes)`);
  }

  /**
   * Checks if a key exists in the cache.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Deletes a key from the cache.
   */
  delete(key: string): boolean {
    const deleted = this.entries.delete(key);
    if (deleted) {
      logger.debug(`[Cache] Deleted entry ${key}`);
    }
    return deleted;
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
    logger.debug('[Cache] Cleared all entries');
  }

  /**
   * Gets cache statistics.
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
    
    let totalSize = 0;
    for (const entry of this.entries.values()) {
      totalSize += entry.size;
    }

    return {
      entryCount: this.entries.size,
      hitRate,
      hits: this.hits,
      misses: this.misses,
      memoryUsage: totalSize,
      averageEntrySize: this.entries.size > 0 ? totalSize / this.entries.size : 0,
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Estimates the size of a value in bytes.
   */
  protected estimateSize(value: T): number {
    try {
      const json = JSON.stringify(value);
      return new Blob([json]).size;
    } catch {
      // Fallback estimation
      return 100; // Default size estimate
    }
  }

  /**
   * Evicts entries based on the configured strategy.
   */
  private evictEntries(): void {
    const entriesToEvict = Math.max(1, Math.floor(this.config.maxEntries * 0.1)); // Evict 10%
    
    const sortedEntries = Array.from(this.entries.values()).sort((a, b) => {
      switch (this.config.evictionStrategy) {
        case 'lru':
          return a.lastAccessedAt.getTime() - b.lastAccessedAt.getTime();
        case 'lfu':
          return a.accessCount - b.accessCount;
        case 'ttl':
          return a.expiresAt.getTime() - b.expiresAt.getTime();
        default:
          return a.lastAccessedAt.getTime() - b.lastAccessedAt.getTime();
      }
    });

    for (let i = 0; i < entriesToEvict && i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      if (entry) {
        this.entries.delete(entry.key);
      }
    }

    logger.debug(`[Cache] Evicted ${entriesToEvict} entries using ${this.config.evictionStrategy} strategy`);
  }

  /**
   * Cleans up expired entries.
   */
  private cleanup(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.entries.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug(`[Cache] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }
}

// =============================================================================
// SPECIALIZED CACHES
// =============================================================================

/**
 * Token count cache for storing token counting results.
 */
export class TokenCountCache extends Cache<TokenCountCacheEntry> {
  constructor(config: Partial<CacheConfig> = {}) {
    super({
      maxEntries: 5000,
      ttlMs: 1800000, // 30 minutes
      ...config,
    });
  }

  /**
   * Gets cached token count for messages.
   */
  getTokenCount(provider: ModelProvider, model: string, messages: Message[]): number | undefined {
    const messageHash = this.hashMessages(messages);
    const key = `${provider}:${model}:${messageHash}`;
    
    const entry = this.get(key);
    return entry?.tokenCount;
  }

  /**
   * Caches token count for messages.
   */
  setTokenCount(provider: ModelProvider, model: string, messages: Message[], tokenCount: number): void {
    const messageHash = this.hashMessages(messages);
    const key = `${provider}:${model}:${messageHash}`;
    
    const entry: TokenCountCacheEntry = {
      provider,
      model,
      messageHash,
      tokenCount,
    };
    
    this.set(key, entry);
  }

  /**
   * Creates a hash of messages for caching.
   */
  private hashMessages(messages: Message[]): string {
    const content = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
    
    return this.simpleHash(JSON.stringify(content));
  }

  /**
   * Simple hash function for cache keys.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

/**
 * Model capability cache for storing model feature information.
 */
export class ModelCapabilityCache extends Cache<ModelCapabilityCacheEntry> {
  constructor(config: Partial<CacheConfig> = {}) {
    super({
      maxEntries: 1000,
      ttlMs: 7200000, // 2 hours
      ...config,
    });
  }

  /**
   * Gets cached model capabilities.
   */
  getCapabilities(provider: ModelProvider, model: string): ModelCapabilityCacheEntry['capabilities'] | undefined {
    const key = `${provider}:${model}`;
    const entry = this.get(key);
    return entry?.capabilities;
  }

  /**
   * Caches model capabilities.
   */
  setCapabilities(
    provider: ModelProvider,
    model: string,
    capabilities: ModelCapabilityCacheEntry['capabilities']
  ): void {
    const key = `${provider}:${model}`;
    
    const entry: ModelCapabilityCacheEntry = {
      provider,
      model,
      capabilities,
    };
    
    this.set(key, entry);
  }
}

/**
 * Response cache for storing API responses.
 */
export class ResponseCache extends Cache<ResponseCacheEntry> {
  constructor(config: Partial<CacheConfig> = {}) {
    super({
      maxEntries: 2000,
      ttlMs: 600000, // 10 minutes
      ...config,
    });
  }

  /**
   * Gets cached response for a request.
   */
  getResponse(provider: ModelProvider, model: string, requestData: any): any | undefined {
    const requestHash = this.hashRequest(requestData);
    const key = `${provider}:${model}:${requestHash}`;
    
    const entry = this.get(key);
    return entry?.response;
  }

  /**
   * Caches a response for a request.
   */
  setResponse(provider: ModelProvider, model: string, requestData: any, response: any): void {
    const requestHash = this.hashRequest(requestData);
    const key = `${provider}:${model}:${requestHash}`;
    
    const entry: ResponseCacheEntry = {
      provider,
      model,
      requestHash,
      response,
      responseSize: this.estimateSize(response),
    };
    
    this.set(key, entry);
  }

  /**
   * Creates a hash of request data for caching.
   */
  private hashRequest(requestData: any): string {
    const normalized = this.normalizeRequest(requestData);
    return this.simpleHash(JSON.stringify(normalized));
  }

  /**
   * Normalizes request data for consistent hashing.
   */
  private normalizeRequest(requestData: any): any {
    if (typeof requestData !== 'object' || requestData === null) {
      return requestData;
    }

    // Remove non-deterministic fields
    const { timestamp, requestId, ...normalized } = requestData;
    
    // Sort object keys for consistent hashing
    if (Array.isArray(normalized)) {
      return normalized.map(item => this.normalizeRequest(item));
    }

    const sorted: any = {};
    for (const key of Object.keys(normalized).sort()) {
      sorted[key] = this.normalizeRequest(normalized[key]);
    }

    return sorted;
  }

  /**
   * Simple hash function for cache keys.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

}

// =============================================================================
// CACHE MANAGER
// =============================================================================

/**
 * Manages all caches for the model system.
 */
export class CacheManager {
  private readonly tokenCountCache: TokenCountCache;
  private readonly modelCapabilityCache: ModelCapabilityCache;
  private readonly responseCache: ResponseCache;

  constructor(config: {
    tokenCount?: Partial<CacheConfig>;
    modelCapability?: Partial<CacheConfig>;
    response?: Partial<CacheConfig>;
  } = {}) {
    this.tokenCountCache = new TokenCountCache(config.tokenCount);
    this.modelCapabilityCache = new ModelCapabilityCache(config.modelCapability);
    this.responseCache = new ResponseCache(config.response);

    logger.info('[CacheManager] Initialized with specialized caches');
  }

  // =============================================================================
  // CACHE ACCESS
  // =============================================================================

  /**
   * Gets the token count cache.
   */
  getTokenCountCache(): TokenCountCache {
    return this.tokenCountCache;
  }

  /**
   * Gets the model capability cache.
   */
  getModelCapabilityCache(): ModelCapabilityCache {
    return this.modelCapabilityCache;
  }

  /**
   * Gets the response cache.
   */
  getResponseCache(): ResponseCache {
    return this.responseCache;
  }

  /**
   * Gets combined statistics from all caches.
   */
  getStats(): {
    tokenCount: CacheStats;
    modelCapability: CacheStats;
    response: CacheStats;
    total: {
      entryCount: number;
      memoryUsage: number;
      averageHitRate: number;
    };
  } {
    const tokenCountStats = this.tokenCountCache.getStats();
    const modelCapabilityStats = this.modelCapabilityCache.getStats();
    const responseStats = this.responseCache.getStats();

    return {
      tokenCount: tokenCountStats,
      modelCapability: modelCapabilityStats,
      response: responseStats,
      total: {
        entryCount: tokenCountStats.entryCount + modelCapabilityStats.entryCount + responseStats.entryCount,
        memoryUsage: tokenCountStats.memoryUsage + modelCapabilityStats.memoryUsage + responseStats.memoryUsage,
        averageHitRate: (tokenCountStats.hitRate + modelCapabilityStats.hitRate + responseStats.hitRate) / 3,
      },
    };
  }

  /**
   * Clears all caches.
   */
  clearAll(): void {
    this.tokenCountCache.clear();
    this.modelCapabilityCache.clear();
    this.responseCache.clear();
    logger.info('[CacheManager] Cleared all caches');
  }
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

/**
 * Global cache manager instance.
 */
export const globalCacheManager = new CacheManager();