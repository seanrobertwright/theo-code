/**
 * @fileoverview Enhanced SessionManager with performance optimizations
 * @module features/session/enhanced-manager
 *
 * Extends the base SessionManager with:
 * - Session metadata caching for fast access
 * - Lazy loading for large session lists
 * - Background processing for non-critical operations
 * - Performance monitoring and metrics
 */

import type {
  Session,
  SessionId,
  SessionMetadata,
  SessionIndex,
} from '../../shared/types/index.js';
import {
  SessionManager,
  type ISessionManager,
  type CreateSessionOptions,
  type LoadSessionOptions,
  type ListSessionsOptions,
  type SearchSessionsOptions,
  type FilterSessionsOptions,
  type SessionSearchResult,
  type CleanupOptions,
  type CleanupResult,
} from './manager.js';
import type { ISessionStorage } from './storage.js';
import {
  SessionMetadataCache,
  LazyLoadingManager,
  BackgroundTaskManager,
  PerformanceMonitor,
  type LazyLoadConfig,
  type BackgroundTaskConfig,
  type PerformanceMetrics,
} from './performance.js';
import { logOperation } from './audit.js';
// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration for the enhanced session manager.
 */
interface EnhancedSessionManagerConfig {
  /** Cache configuration */
  cache: {
    enabled: boolean;
    maxSize: number;
    defaultTtl: number;
  };
  
  /** Lazy loading configuration */
  lazyLoading: LazyLoadConfig;
  
  /** Background task configuration */
  backgroundTasks: BackgroundTaskConfig;
  
  /** Performance monitoring configuration */
  monitoring: {
    enabled: boolean;
    sampleRate: number;
  };
}

/**
 * Default configuration for enhanced session manager.
 */
const DEFAULT_CONFIG: EnhancedSessionManagerConfig = {
  cache: {
    enabled: true,
    maxSize: 1000,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
  },
  lazyLoading: {
    pageSize: 50,
    preloadThreshold: 0.8,
    maxCachedPages: 10,
    backgroundPreload: true,
  },
  backgroundTasks: {
    interval: 30000, // 30 seconds
    maxConcurrent: 3,
    timeout: 60000, // 1 minute
    persistQueue: false,
  },
  monitoring: {
    enabled: true,
    sampleRate: 1.0, // 100% sampling
  },
};

// =============================================================================
// ENHANCED SESSION MANAGER
// =============================================================================

/**
 * Enhanced SessionManager with performance optimizations.
 * 
 * Provides all the functionality of the base SessionManager plus:
 * - Intelligent caching of session metadata
 * - Lazy loading for large session collections
 * - Background processing for maintenance tasks
 * - Performance monitoring and metrics
 */
export class EnhancedSessionManager extends SessionManager implements ISessionManager {
  private readonly config: EnhancedSessionManagerConfig;
  private readonly cache: SessionMetadataCache;
  private readonly lazyLoader: LazyLoadingManager;
  private readonly backgroundTasks: BackgroundTaskManager;
  private readonly performanceMonitor: PerformanceMonitor;
  private isInitialized = false;
  
  constructor(storage?: ISessionStorage, config?: Partial<EnhancedSessionManagerConfig>) {
    super(storage);
    
    this.config = this.mergeConfig(config);
    this.cache = new SessionMetadataCache(
      this.config.cache.maxSize,
      this.config.cache.defaultTtl
    );
    this.lazyLoader = new LazyLoadingManager(this.config.lazyLoading);
    this.backgroundTasks = new BackgroundTaskManager(this.config.backgroundTasks);
    this.performanceMonitor = new PerformanceMonitor();
    
    this.initialize();
  }
  
  // -------------------------------------------------------------------------
  // Initialization and Lifecycle
  // -------------------------------------------------------------------------
  
  /**
   * Initializes the enhanced session manager.
   */
  private initialize(): void {
    if (this.isInitialized) {
      return;
    }
    
    // Start background task processing
    this.backgroundTasks.start();
    
    // Schedule periodic cache maintenance
    this.scheduleBackgroundMaintenance();
    
    this.isInitialized = true;
  }
  
  /**
   * Shuts down the enhanced session manager.
   */
  shutdown(): void {
    this.backgroundTasks.stop();
    this.cache.clear();
    this.lazyLoader.clearCache();
    this.performanceMonitor.clear();
    this.isInitialized = false;
  }
  
  // -------------------------------------------------------------------------
  // Enhanced Session Operations
  // -------------------------------------------------------------------------
  
  /**
   * Creates a new session with caching.
   * 
   * @param options - Session creation options
   * @returns Promise resolving to the created session
   */
  async createSession(options: CreateSessionOptions): Promise<Session> {
    const startTime = performance.now();
    
    try {
      const session = await super.createSession(options);
      
      // Cache the session metadata
      if (this.config.cache.enabled) {
        const metadata = this.createSessionMetadataFromSession(session);
        this.cache.set(session.id, metadata);
      }
      
      // Invalidate lazy loading cache since we have a new session
      this.lazyLoader.clearCache();
      
      return session;
    } finally {
      if (this.config.monitoring.enabled) {
        this.performanceMonitor.recordOperation('createSession', performance.now() - startTime);
      }
    }
  }
  
  /**
   * Saves a session with cache updates.
   * 
   * @param session - Session to save
   */
  async saveSession(session: Session): Promise<void> {
    const startTime = performance.now();
    
    try {
      await super.saveSession(session);
      
      // Update cache
      if (this.config.cache.enabled) {
        const metadata = this.createSessionMetadataFromSession(session);
        this.cache.set(session.id, metadata);
      }
      
      // Invalidate lazy loading cache since session data changed
      this.lazyLoader.clearCache();
    } finally {
      if (this.config.monitoring.enabled) {
        this.performanceMonitor.recordOperation('saveSession', performance.now() - startTime);
      }
    }
  }
  
  /**
   * Loads a session with caching.
   * 
   * @param sessionId - Session identifier to load
   * @param options - Load options
   * @returns Promise resolving to the loaded session
   */
  async loadSession(sessionId: SessionId, options?: LoadSessionOptions): Promise<Session> {
    const startTime = performance.now();
    
    try {
      return await super.loadSession(sessionId, options);
    } finally {
      if (this.config.monitoring.enabled) {
        this.performanceMonitor.recordOperation('loadSession', performance.now() - startTime);
      }
    }
  }
  
  /**
   * Deletes a session with cache cleanup.
   * 
   * @param sessionId - Session identifier to delete
   */
  async deleteSession(sessionId: SessionId): Promise<void> {
    const startTime = performance.now();
    
    try {
      await super.deleteSession(sessionId);
      
      // Remove from cache
      if (this.config.cache.enabled) {
        this.cache.delete(sessionId);
      }
      
      // Invalidate lazy loading cache
      this.lazyLoader.clearCache();
    } finally {
      if (this.config.monitoring.enabled) {
        this.performanceMonitor.recordOperation('deleteSession', performance.now() - startTime);
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // Enhanced Listing and Search
  // -------------------------------------------------------------------------
  
  /**
   * Lists sessions with caching and lazy loading support.
   * 
   * @param options - Listing and filtering options
   * @returns Promise resolving to array of session metadata
   */
  async listSessions(options: ListSessionsOptions = {}): Promise<SessionMetadata[]> {
    const startTime = performance.now();
    
    try {
      // Check if we can use cached index
      let index: SessionIndex | null = null;
      if (this.config.cache.enabled) {
        index = this.cache.getIndex();
      }
      
      // Load index if not cached
      if (!index) {
        index = await this.getSessionIndex();
        if (this.config.cache.enabled) {
          this.cache.setIndex(index);
        }
      }
      
      // Apply filtering and sorting using cached index
      let sessions = Object.values(index.sessions).filter((session): session is SessionMetadata => session !== undefined);
      
      // Apply filters
      sessions = this.applyFilters(sessions, options);
      
      // Apply sorting
      sessions = this.applySorting(sessions, options);
      
      // Handle pagination with lazy loading
      if (options.limit || options.offset) {
        const offset = options.offset || 0;
        const limit = options.limit || sessions.length;
        
        // Initialize lazy loader if needed
        const totalPages = Math.ceil(sessions.length / this.config.lazyLoading.pageSize);
        if (totalPages > 1) {
          this.lazyLoader.initialize(sessions.length);
        }
        
        // Use lazy loading for large result sets
        if (sessions.length > this.config.lazyLoading.pageSize) {
          const pageNumber = Math.floor(offset / this.config.lazyLoading.pageSize);
          const pageData = await this.lazyLoader.getPage(pageNumber, async (pageOffset, pageLimit) => {
            return sessions.slice(pageOffset, pageOffset + pageLimit);
          });
          
          const startIndex = offset % this.config.lazyLoading.pageSize;
          return pageData.slice(startIndex, startIndex + limit);
        }
        
        return sessions.slice(offset, offset + limit);
      }
      
      return sessions;
    } finally {
      if (this.config.monitoring.enabled) {
        this.performanceMonitor.recordOperation('listSessions', performance.now() - startTime);
      }
    }
  }
  
  /**
   * Searches sessions with enhanced performance.
   * 
   * @param query - Search query string
   * @param options - Search configuration options
   * @returns Promise resolving to array of search results
   */
  async searchSessions(
    query: string,
    options: SearchSessionsOptions = {}
  ): Promise<SessionSearchResult[]> {
    const startTime = performance.now();
    
    try {
      // Use parent implementation but with cached metadata when possible
      return await super.searchSessions(query, options);
    } finally {
      if (this.config.monitoring.enabled) {
        this.performanceMonitor.recordOperation('searchSessions', performance.now() - startTime);
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // Background Operations
  // -------------------------------------------------------------------------
  
  /**
   * Performs session cleanup in the background.
   * 
   * @param options - Cleanup configuration options
   * @returns Promise resolving to cleanup results
   */
  async cleanupOldSessions(options: CleanupOptions = {}): Promise<CleanupResult> {
    // For immediate cleanup, use parent implementation
    if (!options.dryRun) {
      const result = await super.cleanupOldSessions(options);
      
      // Clear caches after cleanup
      this.cache.clear();
      this.lazyLoader.clearCache();
      
      return result;
    }
    
    // For dry run, use parent implementation
    return super.cleanupOldSessions(options);
  }
  
  /**
   * Schedules a background cleanup operation.
   * 
   * @param options - Cleanup options
   */
  scheduleBackgroundCleanup(options: CleanupOptions = {}): void {
    this.backgroundTasks.queueTask({
      type: 'cleanup',
      priority: 5,
      execute: async () => {
        await logOperation(
          'background.cleanup',
          async () => {
            const result = await this.cleanupOldSessions(options);
            console.warn(`Background cleanup completed: ${result.deletedSessions.length} sessions deleted`);
          }
        );
      },
    });
  }
  
  /**
   * Schedules a background index rebuild operation.
   */
  scheduleIndexRebuild(): void {
    this.backgroundTasks.queueTask({
      type: 'index-rebuild',
      priority: 3,
      execute: async () => {
        await logOperation(
          'background.index-rebuild',
          async () => {
            await this.rebuildSessionIndex();
            
            // Clear cache to force reload
            this.cache.clear();
            
            console.warn('Background index rebuild completed');
          }
        );
      },
    });
  }
  
  // -------------------------------------------------------------------------
  // Performance and Monitoring
  // -------------------------------------------------------------------------
  
  /**
   * Gets comprehensive performance metrics.
   * 
   * @returns Current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getMetrics(this.cache, this.backgroundTasks);
  }
  
  /**
   * Gets cache statistics.
   * 
   * @returns Current cache statistics
   */
  getCacheStats() {
    return {
      metadata: this.cache.getStats(),
      lazyLoading: this.lazyLoader.getCacheStatus(),
      backgroundTasks: this.backgroundTasks.getStatus(),
    };
  }
  
  /**
   * Performs manual cache maintenance.
   */
  performCacheMaintenance(): void {
    this.cache.maintenance();
    
    // Record memory usage
    if (this.config.monitoring.enabled) {
      const stats = this.cache.getStats();
      this.performanceMonitor.recordMemoryUsage(stats.memoryUsage);
    }
  }
  
  /**
   * Preloads session data for improved performance.
   * 
   * @param sessionIds - Optional specific session IDs to preload
   */
  async preloadSessions(sessionIds?: SessionId[]): Promise<void> {
    if (sessionIds) {
      // Preload specific sessions
      const preloadPromises = sessionIds.map(async (sessionId) => {
        try {
          const session = await this.loadSession(sessionId, { validateIntegrity: false });
          const metadata = this.createSessionMetadataFromSession(session);
          this.cache.set(sessionId, metadata);
        } catch (error) {
          console.warn(`Failed to preload session ${sessionId}:`, error);
        }
      });
      
      await Promise.allSettled(preloadPromises);
    } else {
      // Preload session index
      try {
        const index = await this.getSessionIndex();
        this.cache.setIndex(index);
      } catch (error) {
        console.warn('Failed to preload session index:', error);
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------
  
  /**
   * Merges user configuration with defaults.
   * 
   * @param userConfig - User-provided configuration
   * @returns Merged configuration
   */
  private mergeConfig(userConfig?: Partial<EnhancedSessionManagerConfig>): EnhancedSessionManagerConfig {
    if (!userConfig) {
      return DEFAULT_CONFIG;
    }
    
    return {
      cache: { ...DEFAULT_CONFIG.cache, ...userConfig.cache },
      lazyLoading: { ...DEFAULT_CONFIG.lazyLoading, ...userConfig.lazyLoading },
      backgroundTasks: { ...DEFAULT_CONFIG.backgroundTasks, ...userConfig.backgroundTasks },
      monitoring: { ...DEFAULT_CONFIG.monitoring, ...userConfig.monitoring },
    };
  }
  
  /**
   * Creates session metadata from a full session object.
   * 
   * @param session - Full session data
   * @returns Session metadata
   */
  private createSessionMetadataFromSession(session: Session): SessionMetadata {
    // Get preview from first user message
    let preview: string | undefined;
    const firstUserMessage = session.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = typeof firstUserMessage.content === 'string' 
        ? firstUserMessage.content 
        : firstUserMessage.content.find(block => block.type === 'text')?.text ?? '';
      preview = content.slice(0, 100);
    }
    
    // Get last message content
    let lastMessage: string | undefined;
    if (session.messages.length > 0) {
      const last = session.messages[session.messages.length - 1];
      if (last) {
        const content = typeof last.content === 'string'
          ? last.content
          : last.content.find(block => block.type === 'text')?.text ?? '';
        lastMessage = content.slice(0, 50);
      }
    }
    
    return {
      id: session.id,
      created: session.created,
      lastModified: session.lastModified,
      model: session.model,
      tokenCount: session.tokenCount,
      title: session.title,
      workspaceRoot: session.workspaceRoot,
      messageCount: session.messages.length,
      lastMessage,
      contextFiles: session.contextFiles,
      tags: session.tags,
      preview,
    };
  }
  
  /**
   * Gets the session index from storage.
   * 
   * @returns Promise resolving to session index
   */
  private async getSessionIndex(): Promise<SessionIndex> {
    // This would typically call the storage layer
    // For now, we'll use the parent's listSessions method
    const sessions = await super.listSessions();
    
    const index: SessionIndex = {
      version: '1.0.0',
      lastUpdated: Date.now(),
      sessions: {},
    };
    
    for (const session of sessions) {
      index.sessions[session.id] = session;
    }
    
    return index;
  }
  
  /**
   * Rebuilds the session index.
   */
  private async rebuildSessionIndex(): Promise<void> {
    // This would typically call the storage layer's rebuildIndex method
    // For now, we'll just clear the cache to force a reload
    this.cache.clear();
  }
  
  /**
   * Applies filters to session list.
   * 
   * @param sessions - Sessions to filter
   * @param options - Filter options
   * @returns Filtered sessions
   */
  private applyFilters(sessions: SessionMetadata[], options: ListSessionsOptions): SessionMetadata[] {
    let filtered = sessions;
    
    if (options.model) {
      filtered = filtered.filter(session => session.model === options.model);
    }
    
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(session => 
        options.tags!.some(tag => session.tags.includes(tag))
      );
    }
    
    return filtered;
  }
  
  /**
   * Applies sorting to session list.
   * 
   * @param sessions - Sessions to sort
   * @param options - Sort options
   * @returns Sorted sessions
   */
  private applySorting(sessions: SessionMetadata[], options: ListSessionsOptions): SessionMetadata[] {
    const sortBy = options.sortBy || 'lastModified';
    const sortOrder = options.sortOrder || 'desc';
    
    return sessions.sort((a, b) => {
      let aValue: number;
      let bValue: number;
      
      switch (sortBy) {
        case 'created':
          aValue = a.created;
          bValue = b.created;
          break;
        case 'lastModified':
          aValue = a.lastModified;
          bValue = b.lastModified;
          break;
        case 'messageCount':
          aValue = a.messageCount;
          bValue = b.messageCount;
          break;
        case 'tokenCount':
          aValue = a.tokenCount.total;
          bValue = b.tokenCount.total;
          break;
        default:
          aValue = a.lastModified;
          bValue = b.lastModified;
      }
      
      const result = aValue - bValue;
      return sortOrder === 'asc' ? result : -result;
    });
  }
  
  /**
   * Schedules periodic background maintenance tasks.
   */
  private scheduleBackgroundMaintenance(): void {
    // Schedule cache maintenance
    this.backgroundTasks.queueTask({
      type: 'cache-maintenance',
      priority: 1,
      execute: async () => {
        this.performCacheMaintenance();
      },
    });
    
    // Schedule periodic cleanup (low priority)
    this.backgroundTasks.queueTask({
      type: 'cleanup',
      priority: 2,
      execute: async () => {
        await this.cleanupOldSessions({ dryRun: false });
      },
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates an enhanced session manager with performance optimizations.
 * 
 * @param storage - Optional storage implementation
 * @param config - Optional configuration
 * @returns Enhanced session manager instance
 */
export function createEnhancedSessionManager(
  storage?: ISessionStorage,
  config?: Partial<EnhancedSessionManagerConfig>
): EnhancedSessionManager {
  return new EnhancedSessionManager(storage, config);
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  EnhancedSessionManagerConfig,
  PerformanceMetrics,
};