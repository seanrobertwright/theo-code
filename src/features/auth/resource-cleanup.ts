/**
 * @fileoverview OAuth Resource Cleanup Manager
 * @module features/auth/resource-cleanup
 */

import type { ModelProvider } from '../../shared/types/models.js';
// =============================================================================
// TYPES
// =============================================================================

/**
 * Cleanup resource types.
 */
export type CleanupResourceType = 
  | 'callback_server'
  | 'browser_process'
  | 'temporary_tokens'
  | 'oauth_state'
  | 'network_connections'
  | 'timers';

/**
 * Resource cleanup result.
 */
export interface CleanupResult {
  /** Resource type that was cleaned */
  resourceType: CleanupResourceType;
  
  /** Whether cleanup was successful */
  success: boolean;
  
  /** Error message if cleanup failed */
  error?: string;
  
  /** Additional details about the cleanup */
  details?: string;
}

/**
 * Cleanup context information.
 */
export interface CleanupContext {
  /** Provider associated with the resources */
  provider: ModelProvider;
  
  /** Operation that created the resources */
  operation: string;
  
  /** Whether this is an emergency cleanup */
  isEmergency: boolean;
  
  /** Timeout for cleanup operations (ms) */
  timeoutMs?: number;
}

/**
 * Managed resource interface.
 */
export interface ManagedResource {
  /** Unique identifier for the resource */
  id: string;
  
  /** Type of resource */
  type: CleanupResourceType;
  
  /** Provider associated with this resource */
  provider: ModelProvider;
  
  /** Operation that created this resource */
  operation: string;
  
  /** Timestamp when resource was created */
  createdAt: number;
  
  /** Cleanup function for this resource */
  cleanup: () => Promise<void>;
  
  /** Whether resource is critical (should not be force-cleaned) */
  isCritical?: boolean;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

// =============================================================================
// RESOURCE CLEANUP MANAGER
// =============================================================================

/**
 * Manages cleanup of OAuth-related resources.
 */
export class OAuthResourceCleanupManager {
  private readonly managedResources = new Map<string, ManagedResource>();
  private readonly cleanupTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly defaultTimeoutMs = 30000; // 30 seconds
  private isDestroyed = false;

  constructor() {
    // Set up process exit handlers for emergency cleanup
    this.setupExitHandlers();
  }

  // =============================================================================
  // RESOURCE REGISTRATION
  // =============================================================================

  /**
   * Register a resource for managed cleanup.
   */
  registerResource(resource: Omit<ManagedResource, 'id' | 'createdAt'>): string {
    if (this.isDestroyed) {
      throw new Error('Cleanup manager has been destroyed');
    }

    const id = this.generateResourceId(resource.type, resource.provider, resource.operation);
    const managedResource: ManagedResource = {
      ...resource,
      id,
      createdAt: Date.now(),
    };

    this.managedResources.set(id, managedResource);
    
    logger.debug(`[ResourceCleanup] Registered ${resource.type} resource for ${resource.provider}:${resource.operation} (${id})`);

    // Set up automatic cleanup timeout if not critical
    if (!resource.isCritical) {
      this.scheduleAutoCleanup(id, 300000); // 5 minutes default
    }

    return id;
  }

  /**
   * Unregister a resource (usually after successful completion).
   */
  unregisterResource(resourceId: string): boolean {
    const resource = this.managedResources.get(resourceId);
    if (!resource) {
      return false;
    }

    // Cancel any scheduled cleanup
    const timeout = this.cleanupTimeouts.get(resourceId);
    if (timeout) {
      clearTimeout(timeout);
      this.cleanupTimeouts.delete(resourceId);
    }

    this.managedResources.delete(resourceId);
    
    logger.debug(`[ResourceCleanup] Unregistered resource ${resourceId} (${resource.type})`);
    return true;
  }

  /**
   * Register a callback server for cleanup.
   */
  registerCallbackServer(
    _provider: ModelProvider,
    _operation: string,
    server: { close: () => Promise<void> },
    _port: number
  ): string {
    return this.registerResource({
      type: 'callback_server',
      provider,
      operation,
      cleanup: async () => {
        try {
          await server.close();
          logger.debug(`[ResourceCleanup] Closed callback server on port ${port}`);
        } catch (error) {
          logger.warn(`[ResourceCleanup] Failed to close callback server on port ${port}:`, error);
        }
      },
      metadata: { port },
    });
  }

  /**
   * Register a browser process for cleanup.
   */
  registerBrowserProcess(
    _provider: ModelProvider,
    _operation: string,
    process: { kill: () => void },
    pid?: number
  ): string {
    return this.registerResource({
      type: 'browser_process',
      provider,
      operation,
      cleanup: async () => {
        try {
          process.kill();
          logger.debug(`[ResourceCleanup] Killed browser process${pid ? ` (PID: ${pid})` : ''}`);
        } catch (error) {
          logger.warn(`[ResourceCleanup] Failed to kill browser process:`, error);
        }
      },
      metadata: { pid },
    });
  }

  /**
   * Register temporary tokens for cleanup.
   */
  registerTemporaryTokens(
    _provider: ModelProvider,
    _operation: string,
    clearFunction: () => Promise<void>
  ): string {
    return this.registerResource({
      type: 'temporary_tokens',
      provider,
      operation,
      _cleanup: clearFunction,
      _isCritical: true, // Don't auto-cleanup tokens
    });
  }

  /**
   * Register OAuth state for cleanup.
   */
  registerOAuthState(
    _provider: ModelProvider,
    _operation: string,
    clearFunction: () => Promise<void>
  ): string {
    return this.registerResource({
      type: 'oauth_state',
      provider,
      operation,
      _cleanup: clearFunction,
    });
  }

  /**
   * Register network connections for cleanup.
   */
  registerNetworkConnection(
    _provider: ModelProvider,
    _operation: string,
    connection: { destroy: () => void }
  ): string {
    return this.registerResource({
      type: 'network_connections',
      provider,
      operation,
      cleanup: async () => {
        try {
          connection.destroy();
          logger.debug(`[ResourceCleanup] Destroyed network connection`);
        } catch (error) {
          logger.warn(`[ResourceCleanup] Failed to destroy network connection:`, error);
        }
      },
    });
  }

  /**
   * Register timers for cleanup.
   */
  registerTimer(
    _provider: ModelProvider,
    _operation: string,
    timer: NodeJS.Timeout
  ): string {
    return this.registerResource({
      type: 'timers',
      provider,
      operation,
      cleanup: async () => {
        try {
          clearTimeout(timer);
          logger.debug(`[ResourceCleanup] Cleared timer`);
        } catch (error) {
          logger.warn(`[ResourceCleanup] Failed to clear timer:`, error);
        }
      },
    });
  }

  // =============================================================================
  // CLEANUP EXECUTION
  // =============================================================================

  /**
   * Clean up all resources for a specific provider and operation.
   */
  async cleanupOperation(
    _provider: ModelProvider,
    _operation: string,
    context?: Partial<CleanupContext>
  ): Promise<CleanupResult[]> {
    const resources = Array.from(this.managedResources.values())
      .filter(r => r.provider === provider && r.operation === operation);

    if (resources.length === 0) {
      logger.debug(`[ResourceCleanup] No resources to cleanup for ${provider}:${operation}`);
      return [];
    }

    logger.info(`[ResourceCleanup] Cleaning up ${resources.length} resources for ${provider}:${operation}`);

    const results: CleanupResult[] = [];
    const timeoutMs = context?.timeoutMs || this.defaultTimeoutMs;

    for (const resource of resources) {
      const result = await this.cleanupResource(resource, timeoutMs);
      results.push(result);

      if (result.success) {
        this.unregisterResource(resource.id);
      }
    }

    return results;
  }

  /**
   * Clean up all resources for a specific provider.
   */
  async cleanupProvider(
    _provider: ModelProvider,
    context?: Partial<CleanupContext>
  ): Promise<CleanupResult[]> {
    const resources = Array.from(this.managedResources.values())
      .filter(r => r.provider === provider);

    if (resources.length === 0) {
      logger.debug(`[ResourceCleanup] No resources to cleanup for provider ${provider}`);
      return [];
    }

    logger.info(`[ResourceCleanup] Cleaning up ${resources.length} resources for provider ${provider}`);

    const results: CleanupResult[] = [];
    const timeoutMs = context?.timeoutMs || this.defaultTimeoutMs;

    for (const resource of resources) {
      const result = await this.cleanupResource(resource, timeoutMs);
      results.push(result);

      if (result.success) {
        this.unregisterResource(resource.id);
      }
    }

    return results;
  }

  /**
   * Clean up resources by type.
   */
  async cleanupByType(
    _resourceType: CleanupResourceType,
    context?: Partial<CleanupContext>
  ): Promise<CleanupResult[]> {
    const resources = Array.from(this.managedResources.values())
      .filter(r => r.type === resourceType);

    if (resources.length === 0) {
      logger.debug(`[ResourceCleanup] No ${resourceType} resources to cleanup`);
      return [];
    }

    logger.info(`[ResourceCleanup] Cleaning up ${resources.length} ${resourceType} resources`);

    const results: CleanupResult[] = [];
    const timeoutMs = context?.timeoutMs || this.defaultTimeoutMs;

    for (const resource of resources) {
      const result = await this.cleanupResource(resource, timeoutMs);
      results.push(result);

      if (result.success) {
        this.unregisterResource(resource.id);
      }
    }

    return results;
  }

  /**
   * Emergency cleanup of all resources.
   */
  async emergencyCleanup(): Promise<CleanupResult[]> {
    logger.warn('[ResourceCleanup] Performing emergency cleanup of all resources');

    const resources = Array.from(this.managedResources.values());
    const results: CleanupResult[] = [];
    const emergencyTimeoutMs = 5000; // 5 seconds for emergency

    // Clean up non-critical resources first
    const nonCritical = resources.filter(r => !r.isCritical);
    const critical = resources.filter(r => r.isCritical);

    // Clean up non-critical resources with short timeout
    for (const resource of nonCritical) {
      const result = await this.cleanupResource(resource, emergencyTimeoutMs);
      results.push(result);
      this.unregisterResource(resource.id);
    }

    // Clean up critical resources with slightly longer timeout
    for (const resource of critical) {
      const result = await this.cleanupResource(resource, emergencyTimeoutMs * 2);
      results.push(result);
      this.unregisterResource(resource.id);
    }

    return results;
  }

  /**
   * Clean up a single resource with timeout.
   */
  private async cleanupResource(resource: ManagedResource, _timeoutMs: number): Promise<CleanupResult> {
    const startTime = Date.now();
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Cleanup timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      // Race between cleanup and timeout
      await Promise.race([
        resource.cleanup(),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;
      
      return {
        resourceType: resource.type,
        success: true,
        details: `Cleaned up in ${duration}ms`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`[ResourceCleanup] Failed to cleanup ${resource.type} resource:`, error);
      
      return {
        resourceType: resource.type,
        success: false,
        error: errorMessage,
        details: `Failed after ${duration}ms`,
      };
    }
  }

  // =============================================================================
  // AUTOMATIC CLEANUP
  // =============================================================================

  /**
   * Schedule automatic cleanup for a resource.
   */
  private scheduleAutoCleanup(resourceId: string, _delayMs: number): void {
    const timeout = setTimeout(async () => {
      const resource = this.managedResources.get(resourceId);
      if (resource) {
        logger.info(`[ResourceCleanup] Auto-cleaning up ${resource.type} resource after ${delayMs}ms`);
        
        const result = await this.cleanupResource(resource, this.defaultTimeoutMs);
        if (result.success) {
          this.unregisterResource(resourceId);
        }
      }
      
      this.cleanupTimeouts.delete(resourceId);
    }, delayMs);

    this.cleanupTimeouts.set(resourceId, timeout);
  }

  // =============================================================================
  // MONITORING AND UTILITIES
  // =============================================================================

  /**
   * Get information about managed resources.
   */
  getResourceInfo(): {
    totalResources: number;
    resourcesByType: Record<CleanupResourceType, number>;
    resourcesByProvider: Record<string, number>;
    oldestResource?: { id: string; type: CleanupResourceType; _ageMs: number };
  } {
    const resources = Array.from(this.managedResources.values());
    const now = Date.now();
    
    const info = {
      totalResources: resources.length,
      resourcesByType: {} as Record<CleanupResourceType, number>,
      resourcesByProvider: {} as Record<string, number>,
      oldestResource: undefined as { id: string; type: CleanupResourceType; _ageMs: number } | undefined,
    };

    let oldestAge = 0;
    
    for (const resource of resources) {
      // Count by type
      info.resourcesByType[resource.type] = (info.resourcesByType[resource.type] || 0) + 1;
      
      // Count by provider
      info.resourcesByProvider[resource.provider] = (info.resourcesByProvider[resource.provider] || 0) + 1;
      
      // Track oldest resource
      const age = now - resource.createdAt;
      if (age > oldestAge) {
        oldestAge = age;
        info.oldestResource = {
          id: resource.id,
          type: resource.type,
          _ageMs: age,
        };
      }
    }

    return info;
  }

  /**
   * Generate a unique resource ID.
   */
  private generateResourceId(type: CleanupResourceType, _provider: ModelProvider, _operation: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${provider}-${operation}-${timestamp}-${random}`;
  }

  /**
   * Set up process exit handlers for emergency cleanup.
   */
  private setupExitHandlers(): void {
    const exitHandler = async (signal: string) => {
      if (this.isDestroyed) {
    return;
  }
      
      logger.warn(`[ResourceCleanup] Process ${signal} received, performing emergency cleanup`);
      
      try {
        await this.emergencyCleanup();
      } catch (error) {
        logger.error('[ResourceCleanup] Emergency cleanup failed:', error);
      }
    };

    // Handle various exit signals
    process.on('SIGINT', () => exitHandler('SIGINT'));
    process.on('SIGTERM', () => exitHandler('SIGTERM'));
    process.on('beforeExit', () => exitHandler('beforeExit'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('[ResourceCleanup] Uncaught exception, performing emergency cleanup:', error);
      exitHandler('uncaughtException').finally(() => {
        process.exit(1);
      });
    });
  }

  // =============================================================================
  // LIFECYCLE
  // =============================================================================

  /**
   * Destroy the cleanup manager and clean up all resources.
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
    return;
  }
    
    logger.info('[ResourceCleanup] Destroying cleanup manager');
    this.isDestroyed = true;

    // Clear all scheduled timeouts
    for (const timeout of this.cleanupTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.cleanupTimeouts.clear();

    // Perform final cleanup
    await this.emergencyCleanup();
    
    logger.info('[ResourceCleanup] Cleanup manager destroyed');
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new OAuth resource cleanup manager.
 */
export function createOAuthResourceCleanupManager(): OAuthResourceCleanupManager {
  return new OAuthResourceCleanupManager();
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

/**
 * Global resource cleanup manager instance.
 * Use this for managing OAuth resources across the application.
 */
export const globalResourceCleanupManager = new OAuthResourceCleanupManager();