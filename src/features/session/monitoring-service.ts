/**
 * @fileoverview Integrated monitoring service for session management
 * @module features/session/monitoring-service
 *
 * Provides a unified monitoring service that integrates:
 * - Performance metrics collection
 * - System health monitoring
 * - Storage usage tracking
 * - Alert management
 * - Dashboard data provision
 */

import type {
  SessionId,
  SessionMetadata,
} from '../../shared/types/index.js';
import type {
  PerformanceMetrics,
  SessionMetadataCache,
  BackgroundTaskManager,
} from './performance.js';
import {
  SessionMetricsCollector,
  SystemHealthMonitor,
  DashboardDataProvider,
  type SessionOperationMetrics,
  type StorageUsageMetrics,
  type SystemHealthStatus,
  type SystemAlert,
  type MonitoringConfig,
  type DashboardData,
} from './monitoring.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Monitoring service configuration.
 */
interface MonitoringServiceConfig extends MonitoringConfig {
  /** Enable automatic storage usage tracking */
  autoTrackStorage: boolean;
  
  /** Storage tracking interval in milliseconds */
  storageTrackingInterval: number;
  
  /** Enable performance alerts */
  performanceAlertsEnabled: boolean;
  
  /** Enable storage alerts */
  storageAlertsEnabled: boolean;
}

/**
 * Operation context for tracking.
 */
interface OperationContext {
  /** Operation name */
  operation: string;
  
  /** Session ID if applicable */
  sessionId?: SessionId;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Monitoring service events.
 */
interface MonitoringEvents {
  /** Alert created */
  'alert:created': (_alert: SystemAlert) => void;
  
  /** Health status changed */
  'health:changed': (_status: SystemHealthStatus) => void;
  
  /** Performance threshold exceeded */
  'performance:threshold': (_operation: string, _metrics: SessionOperationMetrics) => void;
  
  /** Storage threshold exceeded */
  'storage:threshold': (_metrics: StorageUsageMetrics) => void;
}

// =============================================================================
// MONITORING SERVICE
// =============================================================================

/**
 * Integrated monitoring service for session management.
 * 
 * Provides comprehensive monitoring capabilities including:
 * - Operation timing and success tracking
 * - System health monitoring with alerts
 * - Storage usage monitoring and alerts
 * - Performance dashboard data
 */
export class SessionMonitoringService {
  private readonly config: MonitoringServiceConfig;
  private readonly metricsCollector: SessionMetricsCollector;
  private readonly healthMonitor: SystemHealthMonitor;
  private readonly dashboardProvider: DashboardDataProvider;
  private readonly eventListeners: Partial<MonitoringEvents> = {};
  
  private storageTrackingInterval: NodeJS.Timeout | null = null;
  private isStarted = false;
  private lastStorageCheck = 0;
  private lastPerformanceCheck = 0;
  
  constructor(config: Partial<MonitoringServiceConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      metricsInterval: config.metricsInterval ?? 60000, // 1 minute
      healthCheckInterval: config.healthCheckInterval ?? 300000, // 5 minutes
      autoTrackStorage: config.autoTrackStorage ?? true,
      storageTrackingInterval: config.storageTrackingInterval ?? 300000, // 5 minutes
      performanceAlertsEnabled: config.performanceAlertsEnabled ?? true,
      storageAlertsEnabled: config.storageAlertsEnabled ?? true,
      storageThresholds: {
        _warningPercentage: 80,
        _criticalPercentage: 95,
        _lowDiskSpaceGB: 1,
        ...config.storageThresholds,
      },
      performanceThresholds: {
        _slowOperationMs: 5000,
        highFailureRate: 0.1,
        lowCacheHitRate: 0.5,
        ...config.performanceThresholds,
      },
      alertRetentionMs: config.alertRetentionMs ?? (7 * 24 * 60 * 60 * 1000), // 7 days
      maxAlerts: config.maxAlerts ?? 1000,
    };
    
    this.metricsCollector = new SessionMetricsCollector();
    this.healthMonitor = new SystemHealthMonitor(this.config, this.metricsCollector);
    this.dashboardProvider = new DashboardDataProvider(this.metricsCollector, this.healthMonitor);
    
    // Set up event forwarding
    this.setupEventForwarding();
  }
  
  // -------------------------------------------------------------------------
  // Service Lifecycle
  // -------------------------------------------------------------------------
  
  /**
   * Starts the monitoring service.
   */
  start(): void {
    if (!this.config.enabled || this.isStarted) {
      return;
    }
    
    // Start health monitoring
    this.healthMonitor.start();
    
    // Start storage tracking if enabled
    if (this.config.autoTrackStorage) {
      this.startStorageTracking();
    }
    
    this.isStarted = true;
    
    console.warn('Session monitoring service started');
  }
  
  /**
   * Stops the monitoring service.
   */
  stop(): void {
    if (!this.isStarted) {
      return;
    }
    
    // Stop health monitoring
    this.healthMonitor.stop();
    
    // Stop storage tracking
    if (this.storageTrackingInterval) {
      clearInterval(this.storageTrackingInterval);
      this.storageTrackingInterval = null;
    }
    
    this.isStarted = false;
    
    console.warn('Session monitoring service stopped');
  }
  
  /**
   * Checks if the monitoring service is running.
   * 
   * @returns True if service is started
   */
  isRunning(): boolean {
    return this.isStarted;
  }
  
  // -------------------------------------------------------------------------
  // Operation Tracking
  // -------------------------------------------------------------------------
  
  /**
   * Starts tracking an operation.
   * 
   * @param context - Operation context
   * @returns Operation tracking token
   */
  startOperation(_context: OperationContext): string {
    if (!this.config.enabled) {
      return '';
    }
    
    const token = this.metricsCollector.startOperation(context.operation);
    
    // Log operation start if audit logging is enabled
    logOperation(
      `monitor.${context.operation}.start`,
      async () => {
        // Operation start logged
      },
      context.sessionId,
      context.metadata
    ).catch(() => {
      // Ignore logging errors
    });
    
    return token;
  }
  
  /**
   * Ends tracking an operation.
   * 
   * @param context - Operation context
   * @param token - Operation tracking token
   * @param success - Whether operation succeeded
   * @param startTime - Operation start time
   */
  endOperation(
    _context: OperationContext,
    _token: string,
    _success: boolean,
    _startTime: number
  ): void {
    if (!this.config.enabled || !token) {
      return;
    }
    
    const duration = performance.now() - startTime;
    this.metricsCollector.endOperation(context.operation, token, success, duration);
    
    // Check for performance alerts
    if (this.config.performanceAlertsEnabled) {
      this.checkPerformanceAlerts(context.operation);
    }
    
    // Log operation end
    logOperation(
      `monitor.${context.operation}.end`,
      async () => {
        // Operation end logged
      },
      context.sessionId,
      {
        ...context.metadata,
        success,
        duration,
      }
    ).catch(() => {
      // Ignore logging errors
    });
  }
  
  /**
   * Tracks an operation with automatic timing.
   * 
   * @param context - Operation context
   * @param operation - Operation function to execute
   * @returns Promise resolving to operation result
   */
  async trackOperation<T>(
    _context: OperationContext,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    const token = this.startOperation(context);
    
    try {
      const result = await operation();
      this.endOperation(context, token, true, startTime);
      return result;
    } catch (error) {
      this.endOperation(context, token, false, startTime);
      throw error;
    }
  }
  
  // -------------------------------------------------------------------------
  // Storage Monitoring
  // -------------------------------------------------------------------------
  
  /**
   * Records storage usage snapshot.
   * 
   * @param sessions - Current session metadata
   */
  recordStorageUsage(sessions: SessionMetadata[]): void {
    if (!this.config.enabled) {
      return;
    }
    
    const totalSessions = sessions.length;
    const totalSize = sessions.reduce((sum, session) => {
      return sum + this.estimateSessionSize(session);
    }, 0);
    
    this.metricsCollector.recordStorageUsage(totalSessions, totalSize);
    
    // Check for storage alerts
    if (this.config.storageAlertsEnabled) {
      this.checkStorageAlerts(sessions);
    }
    
    this.lastStorageCheck = Date.now();
  }
  
  /**
   * Gets current storage usage metrics.
   * 
   * @param sessions - Current session metadata
   * @returns Storage usage metrics
   */
  getStorageUsageMetrics(sessions: SessionMetadata[]): StorageUsageMetrics {
    return this.metricsCollector.getStorageUsageMetrics(sessions);
  }
  
  // -------------------------------------------------------------------------
  // Performance Monitoring
  // -------------------------------------------------------------------------
  
  /**
   * Gets operation metrics for a specific operation.
   * 
   * @param operation - Operation name
   * @returns Operation metrics or null if not found
   */
  getOperationMetrics(_operation: string): SessionOperationMetrics | null {
    return this.metricsCollector.getOperationMetrics(operation);
  }
  
  /**
   * Gets all operation metrics.
   * 
   * @returns Array of operation metrics
   */
  getAllOperationMetrics(): SessionOperationMetrics[] {
    return this.metricsCollector.getAllOperationMetrics();
  }
  
  /**
   * Gets performance metrics from cache and background tasks.
   * 
   * @param cache - Session metadata cache
   * @param backgroundTasks - Background task manager
   * @returns Performance metrics
   */
  getPerformanceMetrics(
    _cache: SessionMetadataCache,
    _backgroundTasks: BackgroundTaskManager
  ): PerformanceMetrics {
    // This would typically integrate with the performance monitor
    // For now, return basic metrics
    const cacheStats = cache.getStats();
    const taskStatus = backgroundTasks.getStatus();
    const operationMetrics = this.getAllOperationMetrics();
    
    const operationTimes: Record<string, number> = {};
    for (const metrics of operationMetrics) {
      operationTimes[metrics.operation] = metrics.averageTime;
    }
    
    return {
      _cache: cacheStats,
      operationTimes: {
        listSessions: operationTimes['listSessions'] || 0,
        searchSessions: operationTimes['searchSessions'] || 0,
        loadSession: operationTimes['loadSession'] || 0,
        saveSession: operationTimes['saveSession'] || 0,
      },
      memory: {
        totalUsage: cacheStats.memoryUsage,
        cacheUsage: cacheStats.memoryUsage,
        _backgroundTasksUsage: 0,
      },
      backgroundTasks: {
        queued: taskStatus.queued,
        running: taskStatus.running,
        _completed: 0,
        _failed: 0,
      },
    };
  }
  
  // -------------------------------------------------------------------------
  // Health Monitoring
  // -------------------------------------------------------------------------
  
  /**
   * Gets current system health status.
   * 
   * @returns Promise resolving to health status
   */
  async getHealthStatus(): Promise<SystemHealthStatus> {
    return this.healthMonitor.getHealthStatus();
  }
  
  /**
   * Creates a custom alert.
   * 
   * @param alert - Alert information
   */
  createAlert(alert: Omit<SystemAlert, 'id' | 'timestamp' | 'acknowledged'>): void {
    this.healthMonitor.createAlert(alert);
    
    // Emit alert event
    const createdAlert: SystemAlert = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      _acknowledged: false,
    };
    
    this.emit('alert:created', createdAlert);
  }
  
  /**
   * Acknowledges an alert.
   * 
   * @param alertId - Alert ID to acknowledge
   */
  acknowledgeAlert(_alertId: string): void {
    this.healthMonitor.acknowledgeAlert(alertId);
  }
  
  /**
   * Gets active alerts.
   * 
   * @returns Array of active alerts
   */
  getActiveAlerts(): SystemAlert[] {
    return this.healthMonitor.getActiveAlerts();
  }
  
  /**
   * Gets all alerts.
   * 
   * @returns Array of all alerts
   */
  getAllAlerts(): SystemAlert[] {
    return this.healthMonitor.getAllAlerts();
  }
  
  // -------------------------------------------------------------------------
  // Dashboard Data
  // -------------------------------------------------------------------------
  
  /**
   * Gets comprehensive dashboard data.
   * 
   * @param sessions - Current session metadata
   * @param cache - Session metadata cache
   * @param backgroundTasks - Background task manager
   * @returns Promise resolving to dashboard data
   */
  async getDashboardData(
    sessions: SessionMetadata[],
    _cache: SessionMetadataCache,
    _backgroundTasks: BackgroundTaskManager
  ): Promise<DashboardData> {
    const performanceMetrics = this.getPerformanceMetrics(cache, backgroundTasks);
    return this.dashboardProvider.getDashboardData(sessions, performanceMetrics);
  }
  
  // -------------------------------------------------------------------------
  // Event Management
  // -------------------------------------------------------------------------
  
  /**
   * Adds an event listener.
   * 
   * @param event - Event name
   * @param listener - Event listener function
   */
  on<K extends keyof MonitoringEvents>(_event: K, listener: MonitoringEvents[K]): void {
    this.eventListeners[event] = listener;
  }
  
  /**
   * Removes an event listener.
   * 
   * @param event - Event name
   */
  off<K extends keyof MonitoringEvents>(_event: K): void {
    delete this.eventListeners[event];
  }
  
  /**
   * Emits an event.
   * 
   * @param event - Event name
   * @param args - Event arguments
   */
  private emit<K extends keyof MonitoringEvents>(
    _event: K,
    ...args: Parameters<MonitoringEvents[K]>
  ): void {
    const listener = this.eventListeners[event];
    if (listener) {
      (listener as any)(...args);
    }
  }
  
  // -------------------------------------------------------------------------
  // Maintenance and Cleanup
  // -------------------------------------------------------------------------
  
  /**
   * Performs maintenance tasks.
   */
  performMaintenance(): void {
    if (!this.config.enabled) {
      return;
    }
    
    // Clean up old alerts
    this.healthMonitor.cleanupAlerts();
    
    // Clear old metrics if needed
    // (This would be implemented based on specific requirements)
    
    console.warn('Monitoring service maintenance completed');
  }
  
  /**
   * Clears all collected data.
   */
  clear(): void {
    this.metricsCollector.clear();
    // Note: We don't clear health monitor alerts as they may be important
  }
  
  /**
   * Gets service statistics.
   * 
   * @returns Service statistics
   */
  getServiceStats(): {
    uptime: number;
    operationCount: number;
    alertCount: number;
    lastStorageCheck: number;
    lastPerformanceCheck: number;
  } {
    const operationMetrics = this.getAllOperationMetrics();
    const totalOperations = operationMetrics.reduce((sum, m) => sum + m.totalCount, 0);
    
    return {
      uptime: this.metricsCollector.getUptime(),
      _operationCount: totalOperations,
      alertCount: this.getAllAlerts().length,
      lastStorageCheck: this.lastStorageCheck,
      lastPerformanceCheck: this.lastPerformanceCheck,
    };
  }
  
  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  
  /**
   * Sets up event forwarding from health monitor.
   */
  private setupEventForwarding(): void {
    // This would set up event forwarding from the health monitor
    // For now, it's a placeholder
  }
  
  /**
   * Starts automatic storage tracking.
   */
  private startStorageTracking(): void {
    if (this.storageTrackingInterval) {
      return;
    }
    
    this.storageTrackingInterval = setInterval(() => {
      // This would typically get current sessions and record usage
      // For now, it's a placeholder that would be called by the session manager
      console.warn('Storage tracking interval - would record usage here');
    }, this.config.storageTrackingInterval);
  }
  
  /**
   * Checks for performance-related alerts.
   * 
   * @param operation - Operation name to check
   */
  private checkPerformanceAlerts(_operation: string): void {
    const now = Date.now();
    
    // Throttle performance checks
    if (now - this.lastPerformanceCheck < 60000) { // 1 minute
      return;
    }
    
    const metrics = this.getOperationMetrics(operation);
    if (!metrics) {
      return;
    }
    
    // Check for slow operations
    if (metrics.averageTime > this.config.performanceThresholds.slowOperationMs) {
      this.createAlert({
        severity: 'warning',
        type: 'performance',
        title: 'Slow Operation Detected',
        description: `Operation '${operation}' is averaging ${metrics.averageTime.toFixed(0)}ms`,
        metadata: {
          operation,
          averageTime: metrics.averageTime,
          threshold: this.config.performanceThresholds.slowOperationMs,
        },
      });
    }
    
    // Check for high failure rate
    if (metrics.successRate < (1 - this.config.performanceThresholds.highFailureRate)) {
      this.createAlert({
        severity: 'error',
        type: 'performance',
        title: 'High Failure Rate Detected',
        description: `Operation '${operation}' has a ${((1 - metrics.successRate) * 100).toFixed(1)}% failure rate`,
        metadata: {
          operation,
          successRate: metrics.successRate,
          failureRate: 1 - metrics.successRate,
          threshold: this.config.performanceThresholds.highFailureRate,
        },
      });
    }
    
    this.lastPerformanceCheck = now;
    this.emit('performance:threshold', operation, metrics);
  }
  
  /**
   * Checks for storage-related alerts.
   * 
   * @param sessions - Current session metadata
   */
  private checkStorageAlerts(sessions: SessionMetadata[]): void {
    const storageMetrics = this.getStorageUsageMetrics(sessions);
    
    // Check storage utilization
    if (storageMetrics.utilizationPercentage > this.config.storageThresholds.criticalPercentage) {
      this.createAlert({
        severity: 'critical',
        type: 'storage',
        title: 'Critical Storage Usage',
        description: `Storage utilization is at ${storageMetrics.utilizationPercentage.toFixed(1)}%`,
        metadata: {
          utilizationPercentage: storageMetrics.utilizationPercentage,
          totalSize: storageMetrics.totalSize,
          threshold: this.config.storageThresholds.criticalPercentage,
        },
      });
    } else if (storageMetrics.utilizationPercentage > this.config.storageThresholds.warningPercentage) {
      this.createAlert({
        severity: 'warning',
        type: 'storage',
        title: 'High Storage Usage',
        description: `Storage utilization is at ${storageMetrics.utilizationPercentage.toFixed(1)}%`,
        metadata: {
          utilizationPercentage: storageMetrics.utilizationPercentage,
          totalSize: storageMetrics.totalSize,
          threshold: this.config.storageThresholds.warningPercentage,
        },
      });
    }
    
    // Check days until full
    if (storageMetrics.daysUntilFull < 7 && storageMetrics.daysUntilFull > 0) {
      this.createAlert({
        severity: 'warning',
        type: 'storage',
        title: 'Storage Filling Rapidly',
        description: `Storage will be full in approximately ${Math.ceil(storageMetrics.daysUntilFull)} days`,
        metadata: {
          daysUntilFull: storageMetrics.daysUntilFull,
          growthRate: storageMetrics.growthRate,
        },
      });
    }
    
    this.emit('storage:threshold', storageMetrics);
  }
  
  /**
   * Estimates the size of a session in bytes.
   * 
   * @param session - Session metadata
   * @returns Estimated size in bytes
   */
  private estimateSessionSize(_session: SessionMetadata): number {
    let size = 1000; // Base size
    size += session.messageCount * 500;
    size += session.tokenCount.total * 4;
    size += session.contextFiles.length * 100;
    if (session.title) {
    size += session.title.length * 2;
  }
    if (session.preview) {
    size += session.preview.length * 2;
  }
    return size;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a new session monitoring service.
 * 
 * @param config - Optional configuration
 * @returns Session monitoring service instance
 */
export function createSessionMonitoringService(
  config?: Partial<MonitoringServiceConfig>
): SessionMonitoringService {
  return new SessionMonitoringService(config);
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  MonitoringServiceConfig,
  OperationContext,
  MonitoringEvents,
};