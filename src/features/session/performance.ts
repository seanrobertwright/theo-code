/**
 * @fileoverview Performance optimization utilities for session management
 * @module features/session/performance
 *
 * Provides performance enhancements including:
 * - Session metadata caching for fast access
 * - Lazy loading for large session lists
 * - Background processing for non-critical operations
 * - Memory management and cleanup
 */

import type {
  SessionId,
  SessionMetadata,
  SessionIndex,
} from '../../shared/types/index.js';
import { getAuditLogger, logOperation } from './audit.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Cache entry for session metadata with TTL support.
 */
interface CacheEntry<T> {
  /** Cached data */
  data: T;
  
  /** Timestamp when cached */
  timestamp: number;
  
  /** Time-to-live in milliseconds */
  ttl: number;
  
  /** Number of times accessed */
  accessCount: number;
  
  /** Last access timestamp */
  lastAccessed: number;
}

/**
 * Cache statistics for monitoring.
 */
interface CacheStats {
  /** Total number of entries */
  totalEntries: number;
  
  /** Cache hit count */
  hits: number;
  
  /** Cache miss count */
  misses: number;
  
  /** Hit rate (0-1) */
  hitRate: number;
  
  /** Total memory usage estimate in bytes */
  memoryUsage: number;
  
  /** Number of evictions */
  evictions: number;
  
  /** Average access time in milliseconds */
  averageAccessTime: number;
}

/**
 * Lazy loading configuration.
 */
interface LazyLoadConfig {
  /** Page size for pagination */
  pageSize: number;
  
  /** Preload next page threshold (0-1) */
  preloadThreshold: number;
  
  /** Maximum pages to keep in memory */
  maxCachedPages: number;
  
  /** Enable background preloading */
  backgroundPreload: boolean;
}

/**
 * Background task configuration.
 */
interface BackgroundTaskConfig {
  /** Task execution interval in milliseconds */
  interval: number;
  
  /** Maximum concurrent tasks */
  maxConcurrent: number;
  
  /** Task timeout in milliseconds */
  timeout: number;
  
  /** Enable task queue persistence */
  persistQueue: boolean;
}

/**
 * Performance metrics for monitoring.
 */
interface PerformanceMetrics {
  /** Cache performance */
  cache: CacheStats;
  
  /** Average operation times in milliseconds */
  operationTimes: {
    listSessions: number;
    searchSessions: number;
    loadSession: number;
    saveSession: number;
  };
  
  /** Memory usage statistics */
  memory: {
    totalUsage: number;
    cacheUsage: number;
    backgroundTasksUsage: number;
  };
  
  /** Background task statistics */
  backgroundTasks: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
}

// =============================================================================
// SESSION METADATA CACHE
// =============================================================================

/**
 * High-performance cache for session metadata with LRU eviction and TTL support.
 */
export class SessionMetadataCache {
  private readonly cache = new Map<SessionId, CacheEntry<SessionMetadata>>();
  private readonly indexCache = new Map<string, CacheEntry<SessionIndex>>();
  private readonly maxSize: number;
  private readonly defaultTtl: number;
  private stats: CacheStats;
  
  constructor(maxSize: number = 1000, defaultTtl: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
    this.stats = {
      totalEntries: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      memoryUsage: 0,
      evictions: 0,
      averageAccessTime: 0,
    };
  }
  
  /**
   * Gets session metadata from cache.
   * 
   * @param sessionId - Session identifier
   * @returns Cached metadata or null if not found/expired
   */
  get(sessionId: SessionId): SessionMetadata | null {
    const startTime = performance.now();
    
    const entry = this.cache.get(sessionId);
    if (!entry) {
      this.stats.misses++;
      this.updateStats(performance.now() - startTime);
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(sessionId);
      this.stats.misses++;
      this.stats.totalEntries--;
      this.updateStats(performance.now() - startTime);
      return null;
    }
    
    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.stats.hits++;
    this.updateStats(performance.now() - startTime);
    
    return entry.data;
  }
  
  /**
   * Sets session metadata in cache.
   * 
   * @param sessionId - Session identifier
   * @param metadata - Session metadata to cache
   * @param ttl - Optional custom TTL
   */
  set(sessionId: SessionId, metadata: SessionMetadata, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(sessionId)) {
      this.evictLeastRecentlyUsed();
    }
    
    const entry: CacheEntry<SessionMetadata> = {
      data: metadata,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
      accessCount: 1,
      lastAccessed: Date.now(),
    };
    
    const wasNew = !this.cache.has(sessionId);
    this.cache.set(sessionId, entry);
    
    if (wasNew) {
      this.stats.totalEntries++;
    }
    
    this.updateMemoryUsage();
  }
  
  /**
   * Removes session metadata from cache.
   * 
   * @param sessionId - Session identifier
   */
  delete(sessionId: SessionId): void {
    if (this.cache.delete(sessionId)) {
      this.stats.totalEntries--;
      this.updateMemoryUsage();
    }
  }
  
  /**
   * Gets session index from cache.
   * 
   * @param key - Index cache key
   * @returns Cached index or null if not found/expired
   */
  getIndex(key: string = 'default'): SessionIndex | null {
    const entry = this.indexCache.get(key);
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.indexCache.delete(key);
      return null;
    }
    
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    return entry.data;
  }
  
  /**
   * Sets session index in cache.
   * 
   * @param index - Session index to cache
   * @param key - Index cache key
   * @param ttl - Optional custom TTL
   */
  setIndex(index: SessionIndex, key: string = 'default', ttl?: number): void {
    const entry: CacheEntry<SessionIndex> = {
      data: index,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
      accessCount: 1,
      lastAccessed: Date.now(),
    };
    
    this.indexCache.set(key, entry);
    this.updateMemoryUsage();
  }
  
  /**
   * Clears all cached data.
   */
  clear(): void {
    this.cache.clear();
    this.indexCache.clear();
    this.stats.totalEntries = 0;
    this.stats.evictions = 0;
    this.updateMemoryUsage();
  }
  
  /**
   * Gets cache statistics.
   * 
   * @returns Current cache statistics
   */
  getStats(): CacheStats {
    this.updateHitRate();
    return { ...this.stats };
  }
  
  /**
   * Performs cache maintenance (cleanup expired entries).
   */
  maintenance(): void {
    const now = Date.now();
    let evicted = 0;
    
    // Clean up expired session metadata
    for (const [sessionId, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(sessionId);
        evicted++;
      }
    }
    
    // Clean up expired index entries
    for (const [key, entry] of this.indexCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.indexCache.delete(key);
        evicted++;
      }
    }
    
    this.stats.totalEntries -= evicted;
    this.stats.evictions += evicted;
    this.updateMemoryUsage();
  }
  
  /**
   * Evicts the least recently used entry.
   */
  private evictLeastRecentlyUsed(): void {
    let oldestEntry: [SessionId, CacheEntry<SessionMetadata>] | null = null;
    let oldestTime = Date.now();
    
    for (const entry of this.cache.entries()) {
      if (entry[1].lastAccessed < oldestTime) {
        oldestTime = entry[1].lastAccessed;
        oldestEntry = entry;
      }
    }
    
    if (oldestEntry) {
      this.cache.delete(oldestEntry[0]);
      this.stats.totalEntries--;
      this.stats.evictions++;
    }
  }
  
  /**
   * Updates cache statistics.
   * 
   * @param accessTime - Time taken for the access operation
   */
  private updateStats(accessTime: number): void {
    const totalAccesses = this.stats.hits + this.stats.misses;
    this.stats.averageAccessTime = 
      (this.stats.averageAccessTime * (totalAccesses - 1) + accessTime) / totalAccesses;
  }
  
  /**
   * Updates hit rate calculation.
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
  
  /**
   * Updates memory usage estimate.
   */
  private updateMemoryUsage(): void {
    let usage = 0;
    
    // Estimate session metadata cache usage
    for (const entry of this.cache.values()) {
      usage += this.estimateEntrySize(entry);
    }
    
    // Estimate index cache usage
    for (const entry of this.indexCache.values()) {
      usage += this.estimateIndexEntrySize(entry);
    }
    
    this.stats.memoryUsage = usage;
  }
  
  /**
   * Estimates the memory size of a cache entry.
   * 
   * @param entry - Cache entry to estimate
   * @returns Estimated size in bytes
   */
  private estimateEntrySize(entry: CacheEntry<SessionMetadata>): number {
    // Base entry overhead
    let size = 200; // Object overhead
    
    // Session metadata size
    size += JSON.stringify(entry.data).length * 2; // UTF-16 encoding
    
    return size;
  }
  
  /**
   * Estimates the memory size of an index cache entry.
   * 
   * @param entry - Index cache entry to estimate
   * @returns Estimated size in bytes
   */
  private estimateIndexEntrySize(entry: CacheEntry<SessionIndex>): number {
    // Base entry overhead
    let size = 200;
    
    // Index size (larger than individual metadata)
    size += JSON.stringify(entry.data).length * 2;
    
    return size;
  }
}

// =============================================================================
// LAZY LOADING MANAGER
// =============================================================================

/**
 * Manages lazy loading of session lists with pagination and preloading.
 */
export class LazyLoadingManager {
  private readonly config: LazyLoadConfig;
  private readonly pageCache = new Map<number, SessionMetadata[]>();
  private readonly loadingPages = new Set<number>();
  private totalItems = 0;
  private totalPages = 0;
  
  constructor(config: Partial<LazyLoadConfig> = {}) {
    this.config = {
      pageSize: config.pageSize ?? 50,
      preloadThreshold: config.preloadThreshold ?? 0.8,
      maxCachedPages: config.maxCachedPages ?? 10,
      backgroundPreload: config.backgroundPreload ?? true,
    };
  }
  
  /**
   * Initializes lazy loading with total item count.
   * 
   * @param totalItems - Total number of items available
   */
  initialize(totalItems: number): void {
    this.totalItems = totalItems;
    this.totalPages = Math.ceil(totalItems / this.config.pageSize);
    this.pageCache.clear();
    this.loadingPages.clear();
  }
  
  /**
   * Gets a page of sessions with lazy loading.
   * 
   * @param pageNumber - Page number (0-based)
   * @param loader - Function to load the page data
   * @returns Promise resolving to page data
   */
  async getPage(
    pageNumber: number,
    loader: (offset: number, limit: number) => Promise<SessionMetadata[]>
  ): Promise<SessionMetadata[]> {
    // Check if page is already cached
    if (this.pageCache.has(pageNumber)) {
      const page = this.pageCache.get(pageNumber)!;
      
      // Trigger preloading if near threshold
      if (this.config.backgroundPreload) {
        this.maybePreloadNextPage(pageNumber, loader);
      }
      
      return page;
    }
    
    // Check if page is currently loading
    if (this.loadingPages.has(pageNumber)) {
      // Wait for loading to complete
      return this.waitForPageLoad(pageNumber);
    }
    
    // Load the page
    return this.loadPage(pageNumber, loader);
  }
  
  /**
   * Preloads multiple pages in the background.
   * 
   * @param startPage - Starting page number
   * @param count - Number of pages to preload
   * @param loader - Function to load page data
   */
  async preloadPages(
    startPage: number,
    count: number,
    loader: (offset: number, limit: number) => Promise<SessionMetadata[]>
  ): Promise<void> {
    const preloadPromises: Promise<void>[] = [];
    
    for (let i = 0; i < count; i++) {
      const pageNumber = startPage + i;
      if (pageNumber < this.totalPages && !this.pageCache.has(pageNumber) && !this.loadingPages.has(pageNumber)) {
        preloadPromises.push(
          this.loadPage(pageNumber, loader).then(() => {
            // Page loaded successfully
          }).catch((error) => {
            console.warn(`Failed to preload page ${pageNumber}:`, error);
          })
        );
      }
    }
    
    await Promise.allSettled(preloadPromises);
  }
  
  /**
   * Gets the current cache status.
   * 
   * @returns Cache status information
   */
  getCacheStatus(): {
    cachedPages: number;
    totalPages: number;
    loadingPages: number;
    memoryUsage: number;
  } {
    let memoryUsage = 0;
    for (const page of this.pageCache.values()) {
      memoryUsage += JSON.stringify(page).length * 2; // UTF-16 encoding
    }
    
    return {
      cachedPages: this.pageCache.size,
      totalPages: this.totalPages,
      loadingPages: this.loadingPages.size,
      memoryUsage,
    };
  }
  
  /**
   * Clears the page cache.
   */
  clearCache(): void {
    this.pageCache.clear();
    this.loadingPages.clear();
  }
  
  /**
   * Loads a specific page.
   * 
   * @param pageNumber - Page number to load
   * @param loader - Function to load page data
   * @returns Promise resolving to page data
   */
  private async loadPage(
    pageNumber: number,
    loader: (offset: number, limit: number) => Promise<SessionMetadata[]>
  ): Promise<SessionMetadata[]> {
    this.loadingPages.add(pageNumber);
    
    try {
      const offset = pageNumber * this.config.pageSize;
      const page = await loader(offset, this.config.pageSize);
      
      // Cache the page
      this.cachePageWithEviction(pageNumber, page);
      
      return page;
    } finally {
      this.loadingPages.delete(pageNumber);
    }
  }
  
  /**
   * Waits for a page that's currently loading.
   * 
   * @param pageNumber - Page number to wait for
   * @returns Promise resolving to page data
   */
  private async waitForPageLoad(pageNumber: number): Promise<SessionMetadata[]> {
    // Simple polling approach (in production, you might use events)
    while (this.loadingPages.has(pageNumber)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Page should now be cached
    return this.pageCache.get(pageNumber) || [];
  }
  
  /**
   * Caches a page with LRU eviction if needed.
   * 
   * @param pageNumber - Page number
   * @param page - Page data
   */
  private cachePageWithEviction(pageNumber: number, page: SessionMetadata[]): void {
    // Evict oldest pages if at capacity
    while (this.pageCache.size >= this.config.maxCachedPages) {
      const oldestPage = this.pageCache.keys().next().value;
      if (oldestPage !== undefined) {
        this.pageCache.delete(oldestPage);
      }
    }
    
    this.pageCache.set(pageNumber, page);
  }
  
  /**
   * Maybe preloads the next page if threshold is reached.
   * 
   * @param currentPage - Current page number
   * @param loader - Function to load page data
   */
  private maybePreloadNextPage(
    currentPage: number,
    loader: (offset: number, limit: number) => Promise<SessionMetadata[]>
  ): void {
    const nextPage = currentPage + 1;
    
    if (nextPage < this.totalPages && 
        !this.pageCache.has(nextPage) && 
        !this.loadingPages.has(nextPage)) {
      
      // Preload in background
      this.loadPage(nextPage, loader).catch((error) => {
        console.warn(`Background preload failed for page ${nextPage}:`, error);
      });
    }
  }
}

// =============================================================================
// BACKGROUND TASK MANAGER
// =============================================================================

/**
 * Background task for non-critical operations.
 */
interface BackgroundTask {
  /** Unique task identifier */
  id: string;
  
  /** Task type */
  type: 'cleanup' | 'index-rebuild' | 'cache-maintenance' | 'migration';
  
  /** Task priority (higher = more important) */
  priority: number;
  
  /** Task execution function */
  execute: () => Promise<void>;
  
  /** Task timeout in milliseconds */
  timeout?: number;
  
  /** Number of retry attempts */
  retries?: number;
  
  /** Created timestamp */
  created: number;
}

/**
 * Manages background tasks for non-critical session operations.
 */
export class BackgroundTaskManager {
  private readonly config: BackgroundTaskConfig;
  private readonly taskQueue: BackgroundTask[] = [];
  private readonly runningTasks = new Map<string, Promise<void>>();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  constructor(config: Partial<BackgroundTaskConfig> = {}) {
    this.config = {
      interval: config.interval ?? 30000, // 30 seconds
      maxConcurrent: config.maxConcurrent ?? 3,
      timeout: config.timeout ?? 60000, // 1 minute
      persistQueue: config.persistQueue ?? false,
    };
  }
  
  /**
   * Starts the background task processor.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.processTasks().catch((error) => {
        console.error('Background task processing failed:', error);
      });
    }, this.config.interval);
    
    // Process any queued tasks immediately
    this.processTasks().catch((error) => {
      console.error('Initial background task processing failed:', error);
    });
  }
  
  /**
   * Stops the background task processor.
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Wait for running tasks to complete (with timeout)
    const runningTaskPromises = Array.from(this.runningTasks.values());
    if (runningTaskPromises.length > 0) {
      Promise.allSettled(runningTaskPromises).then(() => {
        console.log('All background tasks completed');
      });
    }
  }
  
  /**
   * Queues a background task.
   * 
   * @param task - Task to queue
   */
  queueTask(task: Omit<BackgroundTask, 'id' | 'created'>): void {
    const fullTask: BackgroundTask = {
      ...task,
      id: this.generateTaskId(),
      created: Date.now(),
    };
    
    // Insert task in priority order
    const insertIndex = this.taskQueue.findIndex(t => t.priority < fullTask.priority);
    if (insertIndex === -1) {
      this.taskQueue.push(fullTask);
    } else {
      this.taskQueue.splice(insertIndex, 0, fullTask);
    }
    
    // If running, process tasks immediately
    if (this.isRunning) {
      this.processTasks().catch((error) => {
        console.error('Task processing failed:', error);
      });
    }
  }
  
  /**
   * Gets the current task queue status.
   * 
   * @returns Task queue status
   */
  getStatus(): {
    queued: number;
    running: number;
    queuedByType: Record<string, number>;
    runningTasks: string[];
  } {
    const queuedByType: Record<string, number> = {};
    for (const task of this.taskQueue) {
      queuedByType[task.type] = (queuedByType[task.type] || 0) + 1;
    }
    
    return {
      queued: this.taskQueue.length,
      running: this.runningTasks.size,
      queuedByType,
      runningTasks: Array.from(this.runningTasks.keys()),
    };
  }
  
  /**
   * Processes queued tasks up to the concurrency limit.
   */
  private async processTasks(): Promise<void> {
    while (this.taskQueue.length > 0 && this.runningTasks.size < this.config.maxConcurrent) {
      const task = this.taskQueue.shift()!;
      
      const taskPromise = this.executeTask(task);
      this.runningTasks.set(task.id, taskPromise);
      
      // Clean up when task completes
      taskPromise.finally(() => {
        this.runningTasks.delete(task.id);
      });
    }
  }
  
  /**
   * Executes a single background task.
   * 
   * @param task - Task to execute
   */
  private async executeTask(task: BackgroundTask): Promise<void> {
    const timeout = task.timeout ?? this.config.timeout;
    const maxRetries = task.retries ?? 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await logOperation(
          `background.${task.type}`,
          async () => {
            // Execute with timeout
            await Promise.race([
              task.execute(),
              new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Task timeout')), timeout)
              ),
            ]);
          },
          undefined,
          {
            taskId: task.id,
            attempt: attempt + 1,
            priority: task.priority,
          }
        );
        
        // Task succeeded
        return;
        
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isLastAttempt) {
          console.error(`Background task ${task.id} failed after ${maxRetries + 1} attempts:`, error);
        } else {
          console.warn(`Background task ${task.id} failed (attempt ${attempt + 1}), retrying:`, error);
          
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }
  
  /**
   * Generates a unique task ID.
   * 
   * @returns Unique task identifier
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// PERFORMANCE MONITOR
// =============================================================================

/**
 * Monitors and tracks performance metrics for session operations.
 */
export class PerformanceMonitor {
  private readonly operationTimes = new Map<string, number[]>();
  private readonly memorySnapshots: Array<{ timestamp: number; usage: number }> = [];
  private readonly maxSamples = 1000;
  
  /**
   * Records the execution time of an operation.
   * 
   * @param operation - Operation name
   * @param duration - Duration in milliseconds
   */
  recordOperation(operation: string, duration: number): void {
    if (!this.operationTimes.has(operation)) {
      this.operationTimes.set(operation, []);
    }
    
    const times = this.operationTimes.get(operation)!;
    times.push(duration);
    
    // Keep only recent samples
    if (times.length > this.maxSamples) {
      times.shift();
    }
  }
  
  /**
   * Records a memory usage snapshot.
   * 
   * @param usage - Memory usage in bytes
   */
  recordMemoryUsage(usage: number): void {
    this.memorySnapshots.push({
      timestamp: Date.now(),
      usage,
    });
    
    // Keep only recent snapshots
    if (this.memorySnapshots.length > this.maxSamples) {
      this.memorySnapshots.shift();
    }
  }
  
  /**
   * Gets performance metrics.
   * 
   * @param cache - Cache instance for cache stats
   * @param backgroundTasks - Background task manager for task stats
   * @returns Current performance metrics
   */
  getMetrics(
    cache: SessionMetadataCache,
    backgroundTasks: BackgroundTaskManager
  ): PerformanceMetrics {
    const operationTimes: Record<string, number> = {};
    
    // Calculate average operation times
    for (const [operation, times] of this.operationTimes.entries()) {
      if (times.length > 0) {
        operationTimes[operation] = times.reduce((sum, time) => sum + time, 0) / times.length;
      }
    }
    
    // Calculate memory usage
    const lastSnapshot = this.memorySnapshots[this.memorySnapshots.length - 1];
    const currentMemory = lastSnapshot ? lastSnapshot.usage : 0;
    
    const cacheStats = cache.getStats();
    const taskStatus = backgroundTasks.getStatus();
    
    return {
      cache: cacheStats,
      operationTimes: {
        listSessions: operationTimes['listSessions'] || 0,
        searchSessions: operationTimes['searchSessions'] || 0,
        loadSession: operationTimes['loadSession'] || 0,
        saveSession: operationTimes['saveSession'] || 0,
      },
      memory: {
        totalUsage: currentMemory,
        cacheUsage: cacheStats.memoryUsage,
        backgroundTasksUsage: 0, // Placeholder
      },
      backgroundTasks: {
        queued: taskStatus.queued,
        running: taskStatus.running,
        completed: 0, // Would need to track this
        failed: 0, // Would need to track this
      },
    };
  }
  
  /**
   * Clears all recorded metrics.
   */
  clear(): void {
    this.operationTimes.clear();
    this.memorySnapshots.length = 0;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  CacheEntry,
  CacheStats,
  LazyLoadConfig,
  BackgroundTaskConfig,
  PerformanceMetrics,
  BackgroundTask,
};