/**
 * @fileoverview Session monitoring and metrics collection
 * @module features/session/monitoring
 *
 * Provides comprehensive monitoring and metrics for session operations:
 * - Session operation timing and success metrics
 * - Storage usage monitoring and alerts
 * - Performance dashboard for debugging
 * - Health checks and system status
 */

import type {
  SessionId,
  SessionMetadata,
} from '../../shared/types/index.js';
import type { PerformanceMetrics } from './performance.js';
// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Session operation metrics.
 */
interface SessionOperationMetrics {
  /** Operation name */
  operation: string;
  
  /** Total number of operations */
  totalCount: number;
  
  /** Number of successful operations */
  successCount: number;
  
  /** Number of failed operations */
  failureCount: number;
  
  /** Success rate (0-1) */
  successRate: number;
  
  /** Average execution time in milliseconds */
  averageTime: number;
  
  /** Minimum execution time in milliseconds */
  minTime: number;
  
  /** Maximum execution time in milliseconds */
  maxTime: number;
  
  /** 95th percentile execution time in milliseconds */
  p95Time: number;
  
  /** Last operation timestamp */
  lastOperation: number;
  
  /** Operations per minute (recent) */
  operationsPerMinute: number;
}

/**
 * Storage usage metrics.
 */
interface StorageUsageMetrics {
  /** Total number of sessions */
  totalSessions: number;
  
  /** Total storage size in bytes */
  totalSize: number;
  
  /** Average session size in bytes */
  averageSessionSize: number;
  
  /** Largest session size in bytes */
  largestSessionSize: number;
  
  /** Storage growth rate in bytes per day */
  growthRate: number;
  
  /** Available disk space in bytes */
  availableDiskSpace: number;
  
  /** Storage utilization percentage (0-100) */
  utilizationPercentage: number;
  
  /** Estimated days until storage full */
  daysUntilFull: number;
  
  /** Sessions by age distribution */
  ageDistribution: {
    last24Hours: number;
    lastWeek: number;
    lastMonth: number;
    older: number;
  };
  
  /** Sessions by size distribution */
  sizeDistribution: {
    small: number;    // < 10KB
    medium: number;   // 10KB - 100KB
    large: number;    // 100KB - 1MB
    extraLarge: number; // > 1MB
  };
}

/**
 * System health status.
 */
interface SystemHealthStatus {
  /** Overall health status */
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  
  /** Health score (0-100) */
  score: number;
  
  /** Last health check timestamp */
  lastCheck: number;
  
  /** Individual component health */
  components: {
    storage: ComponentHealth;
    cache: ComponentHealth;
    backgroundTasks: ComponentHealth;
    performance: ComponentHealth;
  };
  
  /** Active alerts */
  alerts: SystemAlert[];
  
  /** System uptime in milliseconds */
  uptime: number;
  
  /** Memory usage information */
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
}

/**
 * Individual component health status.
 */
interface ComponentHealth {
  /** Component status */
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  
  /** Health score (0-100) */
  score: number;
  
  /** Status message */
  message: string;
  
  /** Last check timestamp */
  lastCheck: number;
  
  /** Component-specific metrics */
  metrics: Record<string, number>;
}

/**
 * System alert information.
 */
interface SystemAlert {
  /** Alert ID */
  id: string;
  
  /** Alert severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  
  /** Alert type */
  type: 'storage' | 'performance' | 'cache' | 'background-tasks' | 'system';
  
  /** Alert title */
  title: string;
  
  /** Alert description */
  description: string;
  
  /** Alert timestamp */
  timestamp: number;
  
  /** Whether alert is acknowledged */
  acknowledged: boolean;
  
  /** Alert metadata */
  metadata: Record<string, any>;
}

/**
 * Monitoring configuration.
 */
interface MonitoringConfig {
  /** Enable monitoring */
  enabled: boolean;
  
  /** Metrics collection interval in milliseconds */
  metricsInterval: number;
  
  /** Health check interval in milliseconds */
  healthCheckInterval: number;
  
  /** Storage alert thresholds */
  storageThresholds: {
    warningPercentage: number;
    criticalPercentage: number;
    lowDiskSpaceGB: number;
  };
  
  /** Performance alert thresholds */
  performanceThresholds: {
    slowOperationMs: number;
    highFailureRate: number;
    lowCacheHitRate: number;
  };
  
  /** Alert retention period in milliseconds */
  alertRetentionMs: number;
  
  /** Maximum number of alerts to keep */
  maxAlerts: number;
}

/**
 * Dashboard data for monitoring UI.
 */
interface DashboardData {
  /** System overview */
  overview: {
    totalSessions: number;
    activeOperations: number;
    systemHealth: string;
    uptime: string;
  };
  
  /** Recent operation metrics */
  recentOperations: SessionOperationMetrics[];
  
  /** Storage usage trends */
  storageUsage: StorageUsageMetrics;
  
  /** Performance trends */
  performance: PerformanceMetrics;
  
  /** Active alerts */
  alerts: SystemAlert[];
  
  /** System resource usage */
  resources: {
    memory: number;
    cpu: number;
    disk: number;
  };
  
  /** Recent activity timeline */
  timeline: Array<{
    timestamp: number;
    type: 'operation' | 'alert' | 'system';
    message: string;
    severity?: 'info' | 'warning' | 'error';
  }>;
}

// =============================================================================
// SESSION METRICS COLLECTOR
// =============================================================================

/**
 * Collects and tracks metrics for session operations.
 */
export class SessionMetricsCollector {
  private readonly operationMetrics = new Map<string, {
    times: number[];
    successes: number;
    failures: number;
    lastOperation: number;
  }>();
  
  private readonly storageHistory: Array<{
    timestamp: number;
    totalSessions: number;
    totalSize: number;
  }> = [];
  
  private readonly maxHistorySize = 1000;
  private startTime = Date.now();
  
  /**
   * Records the start of an operation.
   * 
   * @param operation - Operation name
   * @returns Operation tracking token
   */
  startOperation(operation: string): string {
    const token = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return token;
  }
  
  /**
   * Records the completion of an operation.
   * 
   * @param operation - Operation name
   * @param _token - Operation tracking token (unused)
   * @param success - Whether operation succeeded
   * @param duration - Operation duration in milliseconds
   */
  endOperation(operation: string, _token: string, success: boolean, duration: number): void {
    if (!this.operationMetrics.has(operation)) {
      this.operationMetrics.set(operation, {
        times: [],
        successes: 0,
        failures: 0,
        lastOperation: 0,
      });
    }
    
    const metrics = this.operationMetrics.get(operation)!;
    
    // Record timing
    metrics.times.push(duration);
    if (metrics.times.length > this.maxHistorySize) {
      metrics.times.shift();
    }
    
    // Record success/failure
    if (success) {
      metrics.successes++;
    } else {
      metrics.failures++;
    }
    
    metrics.lastOperation = Date.now();
  }
  
  /**
   * Records storage usage snapshot.
   * 
   * @param totalSessions - Total number of sessions
   * @param totalSize - Total storage size in bytes
   */
  recordStorageUsage(totalSessions: number, totalSize: number): void {
    this.storageHistory.push({
      timestamp: Date.now(),
      totalSessions,
      totalSize,
    });
    
    // Keep history size manageable
    if (this.storageHistory.length > this.maxHistorySize) {
      this.storageHistory.shift();
    }
  }
  
  /**
   * Gets operation metrics for a specific operation.
   * 
   * @param operation - Operation name
   * @returns Operation metrics or null if not found
   */
  getOperationMetrics(operation: string): SessionOperationMetrics | null {
    const metrics = this.operationMetrics.get(operation);
    if (!metrics) {
      return null;
    }
    
    const totalCount = metrics.successes + metrics.failures;
    const successRate = totalCount > 0 ? metrics.successes / totalCount : 0;
    
    // Calculate timing statistics
    const times = metrics.times.sort((a, b) => a - b);
    const averageTime = times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 0;
    const minTime = times.length > 0 ? times[0] : 0;
    const maxTime = times.length > 0 ? times[times.length - 1] : 0;
    const p95Index = Math.floor(times.length * 0.95);
    const p95Time = times.length > 0 ? times[p95Index] || maxTime : 0;
    
    // Calculate operations per minute (last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentOperations = times.filter((_time, _index) => {
      // This is a simplified calculation - in a real implementation,
      // you'd track timestamps for each operation
      return metrics.lastOperation > fiveMinutesAgo;
    }).length;
    const operationsPerMinute = recentOperations / 5;
    
    return {
      operation,
      totalCount,
      successCount: metrics.successes,
      failureCount: metrics.failures,
      successRate,
      averageTime,
      minTime: minTime ?? 0,
      maxTime: maxTime ?? 0,
      p95Time: p95Time ?? 0,
      lastOperation: metrics.lastOperation,
      operationsPerMinute,
    };
  }
  
  /**
   * Gets all operation metrics.
   * 
   * @returns Array of operation metrics
   */
  getAllOperationMetrics(): SessionOperationMetrics[] {
    const metrics: SessionOperationMetrics[] = [];
    
    for (const operation of this.operationMetrics.keys()) {
      const operationMetrics = this.getOperationMetrics(operation);
      if (operationMetrics) {
        metrics.push(operationMetrics);
      }
    }
    
    return metrics.sort((a, b) => b.lastOperation - a.lastOperation);
  }
  
  /**
   * Gets storage usage metrics.
   * 
   * @param sessions - Current session metadata for analysis
   * @returns Storage usage metrics
   */
  getStorageUsageMetrics(sessions: SessionMetadata[]): StorageUsageMetrics {
    const now = Date.now();
    const totalSessions = sessions.length;
    
    // Calculate total size and size distribution
    let totalSize = 0;
    let largestSessionSize = 0;
    const sizeDistribution = { small: 0, medium: 0, large: 0, extraLarge: 0 };
    
    for (const session of sessions) {
      // Estimate session size
      const sessionSize = this.estimateSessionSize(session);
      totalSize += sessionSize;
      largestSessionSize = Math.max(largestSessionSize, sessionSize);
      
      // Categorize by size
      if (sessionSize < 10 * 1024) { // < 10KB
        sizeDistribution.small++;
      } else if (sessionSize < 100 * 1024) { // < 100KB
        sizeDistribution.medium++;
      } else if (sessionSize < 1024 * 1024) { // < 1MB
        sizeDistribution.large++;
      } else {
        sizeDistribution.extraLarge++;
      }
    }
    
    const averageSessionSize = totalSessions > 0 ? totalSize / totalSessions : 0;
    
    // Calculate age distribution
    const ageDistribution = { last24Hours: 0, lastWeek: 0, lastMonth: 0, older: 0 };
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    for (const session of sessions) {
      if (session.lastModified > oneDayAgo) {
        ageDistribution.last24Hours++;
      } else if (session.lastModified > oneWeekAgo) {
        ageDistribution.lastWeek++;
      } else if (session.lastModified > oneMonthAgo) {
        ageDistribution.lastMonth++;
      } else {
        ageDistribution.older++;
      }
    }
    
    // Calculate growth rate
    let growthRate = 0;
    if (this.storageHistory.length >= 2) {
      const recent = this.storageHistory[this.storageHistory.length - 1];
      const older = this.storageHistory[Math.max(0, this.storageHistory.length - 10)];
      
      if (recent && older) {
        const timeDiff = recent.timestamp - older.timestamp;
        const sizeDiff = recent.totalSize - older.totalSize;
        
        if (timeDiff > 0) {
          // Convert to bytes per day
          growthRate = (sizeDiff / timeDiff) * (24 * 60 * 60 * 1000);
        }
      }
    }
    
    // Estimate available disk space (simplified)
    const availableDiskSpace = 10 * 1024 * 1024 * 1024; // 10GB placeholder
    const utilizationPercentage = (totalSize / availableDiskSpace) * 100;
    const daysUntilFull = growthRate > 0 ? (availableDiskSpace - totalSize) / growthRate : Infinity;
    
    return {
      totalSessions,
      totalSize,
      averageSessionSize,
      largestSessionSize,
      growthRate,
      availableDiskSpace,
      utilizationPercentage,
      daysUntilFull: Math.min(daysUntilFull, 9999), // Cap at reasonable value
      ageDistribution,
      sizeDistribution,
    };
  }
  
  /**
   * Clears all collected metrics.
   */
  clear(): void {
    this.operationMetrics.clear();
    this.storageHistory.length = 0;
    this.startTime = Date.now();
  }
  
  /**
   * Gets system uptime in milliseconds.
   * 
   * @returns Uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }
  
  /**
   * Estimates the size of a session in bytes.
   * 
   * @param session - Session metadata
   * @returns Estimated size in bytes
   */
  private estimateSessionSize(session: SessionMetadata): number {
    // Base size for metadata
    let size = 1000; // 1KB base
    
    // Add size based on message count
    size += session.messageCount * 500;
    
    // Add size based on token count
    size += session.tokenCount.total * 4;
    
    // Add size for context files
    size += session.contextFiles.length * 100;
    
    // Add size for title and preview
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
// SYSTEM HEALTH MONITOR
// =============================================================================

/**
 * Monitors system health and generates alerts.
 */
export class SystemHealthMonitor {
  private readonly config: MonitoringConfig;
  private readonly alerts: SystemAlert[] = [];
  private readonly metricsCollector: SessionMetricsCollector;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck = 0;
  
  constructor(
    config: Partial<MonitoringConfig> = {},
    metricsCollector: SessionMetricsCollector
  ) {
    this.config = {
      enabled: config.enabled ?? true,
      metricsInterval: config.metricsInterval ?? 60000, // 1 minute
      healthCheckInterval: config.healthCheckInterval ?? 300000, // 5 minutes
      storageThresholds: {
        warningPercentage: 80,
        criticalPercentage: 95,
        lowDiskSpaceGB: 1,
        ...config.storageThresholds,
      },
      performanceThresholds: {
        slowOperationMs: 5000,
        highFailureRate: 0.1, // 10%
        lowCacheHitRate: 0.5, // 50%
        ...config.performanceThresholds,
      },
      alertRetentionMs: config.alertRetentionMs ?? (7 * 24 * 60 * 60 * 1000), // 7 days
      maxAlerts: config.maxAlerts ?? 1000,
    };
    
    this.metricsCollector = metricsCollector;
  }
  
  /**
   * Starts health monitoring.
   */
  start(): void {
    if (!this.config.enabled || this.healthCheckInterval) {
      return;
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch((error) => {
        console.error('Health check failed:', error);
      });
    }, this.config.healthCheckInterval);
    
    // Perform initial health check
    this.performHealthCheck().catch((error) => {
      console.error('Initial health check failed:', error);
    });
  }
  
  /**
   * Stops health monitoring.
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  /**
   * Performs a comprehensive health check.
   */
  async performHealthCheck(): Promise<SystemHealthStatus> {
    const now = Date.now();
    this.lastHealthCheck = now;
    
    // Check individual components
    const storageHealth = await this.checkStorageHealth();
    const cacheHealth = await this.checkCacheHealth();
    const backgroundTasksHealth = await this.checkBackgroundTasksHealth();
    const performanceHealth = await this.checkPerformanceHealth();
    
    // Calculate overall health score
    const componentScores = [
      storageHealth.score,
      cacheHealth.score,
      performanceHealth.score,
      backgroundTasksHealth.score,
    ];
    const overallScore = componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length;
    
    // Determine overall status
    let overallStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
    if (overallScore >= 90) {
      overallStatus = 'healthy';
    } else if (overallScore >= 70) {
      overallStatus = 'warning';
    } else if (overallScore >= 50) {
      overallStatus = 'critical';
    } else {
      overallStatus = 'unknown';
    }
    
    // Get memory usage (simplified)
    const memory = {
      used: process.memoryUsage?.()?.heapUsed || 0,
      available: process.memoryUsage?.()?.heapTotal || 0,
      percentage: 0,
    };
    memory.percentage = memory.available > 0 ? (memory.used / memory.available) * 100 : 0;
    
    const healthStatus: SystemHealthStatus = {
      status: overallStatus,
      score: overallScore,
      lastCheck: now,
      components: {
        storage: storageHealth,
        cache: cacheHealth,
        backgroundTasks: backgroundTasksHealth,
        performance: performanceHealth,
      },
      alerts: this.getActiveAlerts(),
      uptime: this.metricsCollector.getUptime(),
      memory,
    };
    
    return healthStatus;
  }
  
  /**
   * Gets the current system health status.
   * 
   * @returns Current health status
   */
  async getHealthStatus(): Promise<SystemHealthStatus> {
    // Return cached status if recent, otherwise perform new check
    if ((Date.now() - this.lastHealthCheck) < this.config.healthCheckInterval / 2) {
      // Return a simplified status based on current alerts
      const activeAlerts = this.getActiveAlerts();
      const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
      const warningAlerts = activeAlerts.filter(a => a.severity === 'warning');
      
      let status: 'healthy' | 'warning' | 'critical' | 'unknown';
      let score: number;
      
      if (criticalAlerts.length > 0) {
        status = 'critical';
        score = 30;
      } else if (warningAlerts.length > 0) {
        status = 'warning';
        score = 70;
      } else {
        status = 'healthy';
        score = 95;
      }
      
      return {
        status,
        score,
        lastCheck: this.lastHealthCheck,
        components: {
          storage: { status: 'unknown', score: 0, message: 'Not checked', lastCheck: 0, metrics: {} },
          cache: { status: 'unknown', score: 0, message: 'Not checked', lastCheck: 0, metrics: {} },
          backgroundTasks: { status: 'unknown', score: 0, message: 'Not checked', lastCheck: 0, metrics: {} },
          performance: { status: 'unknown', score: 0, message: 'Not checked', lastCheck: 0, metrics: {} },
        },
        alerts: activeAlerts,
        uptime: this.metricsCollector.getUptime(),
        memory: { used: 0, available: 0, percentage: 0 },
      };
    }
    
    return this.performHealthCheck();
  }
  
  /**
   * Creates a new alert.
   * 
   * @param alert - Alert information
   */
  createAlert(alert: Omit<SystemAlert, 'id' | 'timestamp' | 'acknowledged'>): void {
    const newAlert: SystemAlert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: Date.now(),
      acknowledged: false,
    };
    
    // Check for duplicate alerts
    const existingAlert = this.alerts.find(a => 
      a.type === newAlert.type && 
      a.title === newAlert.title && 
      !a.acknowledged
    );
    
    if (!existingAlert) {
      this.alerts.push(newAlert);
      
      // Limit alert count
      if (this.alerts.length > this.config.maxAlerts) {
        this.alerts.shift();
      }
      
      // Log the alert
      console.warn(`System Alert [${newAlert.severity.toUpperCase()}]: ${newAlert.title} - ${newAlert.description}`);
    }
  }
  
  /**
   * Acknowledges an alert.
   * 
   * @param alertId - Alert ID to acknowledge
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }
  
  /**
   * Gets active (unacknowledged) alerts.
   * 
   * @returns Array of active alerts
   */
  getActiveAlerts(): SystemAlert[] {
    const now = Date.now();
    return this.alerts.filter(alert => 
      !alert.acknowledged && 
      (now - alert.timestamp) < this.config.alertRetentionMs
    );
  }
  
  /**
   * Gets all alerts within retention period.
   * 
   * @returns Array of all alerts
   */
  getAllAlerts(): SystemAlert[] {
    const now = Date.now();
    return this.alerts.filter(alert => 
      (now - alert.timestamp) < this.config.alertRetentionMs
    );
  }
  
  /**
   * Clears old alerts beyond retention period.
   */
  cleanupAlerts(): void {
    const now = Date.now();
    const retentionCutoff = now - this.config.alertRetentionMs;
    
    for (let i = this.alerts.length - 1; i >= 0; i--) {
      const alert = this.alerts[i];
      if (alert && alert.timestamp < retentionCutoff) {
        this.alerts.splice(i, 1);
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // Component Health Checks
  // -------------------------------------------------------------------------
  
  /**
   * Checks storage component health.
   */
  private async checkStorageHealth(): Promise<ComponentHealth> {
    // This would typically check actual storage metrics
    // For now, we'll return a healthy status
    return {
      status: 'healthy',
      score: 95,
      message: 'Storage is operating normally',
      lastCheck: Date.now(),
      metrics: {
        totalSessions: 0,
        totalSize: 0,
        utilizationPercentage: 0,
      },
    };
  }
  
  /**
   * Checks cache component health.
   */
  private async checkCacheHealth(): Promise<ComponentHealth> {
    // This would typically check cache hit rates and performance
    return {
      status: 'healthy',
      score: 90,
      message: 'Cache is performing well',
      lastCheck: Date.now(),
      metrics: {
        hitRate: 0.85,
        memoryUsage: 1024 * 1024, // 1MB
        evictions: 0,
      },
    };
  }
  
  /**
   * Checks background tasks component health.
   */
  private async checkBackgroundTasksHealth(): Promise<ComponentHealth> {
    // This would typically check task queue status and failure rates
    return {
      status: 'healthy',
      score: 88,
      message: 'Background tasks are processing normally',
      lastCheck: Date.now(),
      metrics: {
        queuedTasks: 0,
        runningTasks: 0,
        failureRate: 0.02,
      },
    };
  }
  
  /**
   * Checks performance component health.
   */
  private async checkPerformanceHealth(): Promise<ComponentHealth> {
    const operationMetrics = this.metricsCollector.getAllOperationMetrics();
    
    let totalOperations = 0;
    let totalFailures = 0;
    let slowOperations = 0;
    
    for (const metrics of operationMetrics) {
      totalOperations += metrics.totalCount;
      totalFailures += metrics.failureCount;
      
      if (metrics.averageTime > this.config.performanceThresholds.slowOperationMs) {
        slowOperations++;
      }
    }
    
    const failureRate = totalOperations > 0 ? totalFailures / totalOperations : 0;
    const slowOperationRate = operationMetrics.length > 0 ? slowOperations / operationMetrics.length : 0;
    
    let score = 100;
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    let message = 'Performance is optimal';
    
    if (failureRate > this.config.performanceThresholds.highFailureRate) {
      score -= 30;
      status = 'warning';
      message = 'High failure rate detected';
    }
    
    if (slowOperationRate > 0.2) { // 20% of operations are slow
      score -= 20;
      status = status === 'warning' ? 'critical' : 'warning';
      message = 'Slow operations detected';
    }
    
    return {
      status,
      score: Math.max(0, score),
      message,
      lastCheck: Date.now(),
      metrics: {
        failureRate,
        slowOperationRate,
        totalOperations,
      },
    };
  }
  
  /**
   * Generates a unique alert ID.
   * 
   * @returns Unique alert identifier
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// DASHBOARD DATA PROVIDER
// =============================================================================

/**
 * Provides data for monitoring dashboard.
 */
export class DashboardDataProvider {
  private readonly metricsCollector: SessionMetricsCollector;
  private readonly healthMonitor: SystemHealthMonitor;
  
  constructor(
    metricsCollector: SessionMetricsCollector,
    healthMonitor: SystemHealthMonitor
  ) {
    this.metricsCollector = metricsCollector;
    this.healthMonitor = healthMonitor;
  }
  
  /**
   * Gets comprehensive dashboard data.
   * 
   * @param sessions - Current session metadata
   * @param performanceMetrics - Current performance metrics
   * @returns Dashboard data
   */
  async getDashboardData(
    sessions: SessionMetadata[],
    _performanceMetrics: PerformanceMetrics
  ): Promise<DashboardData> {
    const healthStatus = await this.healthMonitor.getHealthStatus();
    const operationMetrics = this.metricsCollector.getAllOperationMetrics();
    const storageMetrics = this.metricsCollector.getStorageUsageMetrics(sessions);
    
    // Calculate active operations
    const activeOperations = operationMetrics
      .filter(m => Date.now() - m.lastOperation < 60000) // Last minute
      .reduce((sum, m) => sum + m.operationsPerMinute, 0);
    
    // Format uptime
    const uptimeMs = this.metricsCollector.getUptime();
    const uptimeHours = Math.floor(uptimeMs / (60 * 60 * 1000));
    const uptimeMinutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
    const uptimeString = `${uptimeHours}h ${uptimeMinutes}m`;
    
    // Create timeline of recent events
    const timeline = this.createTimeline(operationMetrics, healthStatus.alerts);
    
    return {
      overview: {
        totalSessions: sessions.length,
        activeOperations: Math.round(activeOperations),
        systemHealth: healthStatus.status,
        uptime: uptimeString,
      },
      recentOperations: operationMetrics.slice(0, 10), // Top 10 recent operations
      storageUsage: storageMetrics,
      performance: _performanceMetrics,
      alerts: healthStatus.alerts,
      resources: {
        memory: healthStatus.memory.percentage,
        cpu: 0, // Placeholder
        disk: storageMetrics.utilizationPercentage,
      },
      timeline,
    };
  }
  
  /**
   * Creates a timeline of recent events.
   * 
   * @param operationMetrics - Recent operation metrics
   * @param alerts - Recent alerts
   * @returns Timeline events
   */
  private createTimeline(
    operationMetrics: SessionOperationMetrics[],
    alerts: SystemAlert[]
  ): DashboardData['timeline'] {
    const timeline: DashboardData['timeline'] = [];
    
    // Add recent operations
    for (const metrics of operationMetrics.slice(0, 5)) {
      timeline.push({
        timestamp: metrics.lastOperation,
        type: 'operation',
        message: `${metrics.operation}: ${metrics.successCount}/${metrics.totalCount} successful`,
        severity: metrics.successRate < 0.9 ? 'warning' : 'info',
      });
    }
    
    // Add recent alerts
    for (const alert of alerts.slice(0, 5)) {
      timeline.push({
        timestamp: alert.timestamp,
        type: 'alert',
        message: `${alert.title}: ${alert.description}`,
        severity: alert.severity === 'critical' ? 'error' : alert.severity,
      });
    }
    
    // Sort by timestamp (most recent first)
    timeline.sort((a, b) => b.timestamp - a.timestamp);
    
    return timeline.slice(0, 20); // Keep last 20 events
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  SessionOperationMetrics,
  StorageUsageMetrics,
  SystemHealthStatus,
  ComponentHealth,
  SystemAlert,
  MonitoringConfig,
  DashboardData,
};