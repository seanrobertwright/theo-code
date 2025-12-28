/**
 * @fileoverview Performance monitoring for model adapters
 * @module features/model/performance-monitor
 *
 * Provides performance monitoring, metrics collection, and dashboards
 * for tracking AI provider performance and system health.
 */

import type { ModelProvider } from '../../shared/types/models.js';

// Add logger import
const logger = {
  debug: (message: string, ...args: any[]) => console.debug(message, ...args),
  info: (message: string, ...args: any[]) => console.info(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * Performance monitoring configuration.
 */
export interface PerformanceMonitorConfig {
  /** Whether to enable performance monitoring */
  enabled: boolean;
  /** Sampling rate for metrics (0-1) */
  samplingRate: number;
  /** Maximum number of metrics to store */
  maxMetrics: number;
  /** Time window for aggregating metrics (ms) */
  aggregationWindowMs: number;
  /** Whether to enable detailed tracing */
  enableTracing: boolean;
}

/**
 * Request performance metrics.
 */
export interface RequestMetrics {
  /** Unique request ID */
  requestId: string;
  /** Provider used for the request */
  provider: ModelProvider;
  /** Model used for the request */
  model: string;
  /** Request start time */
  startTime: Date;
  /** Request end time */
  endTime: Date;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Time to first byte (TTFB) in milliseconds */
  ttfbMs?: number;
  /** Input token count */
  inputTokens?: number;
  /** Output token count */
  outputTokens?: number;
  /** Total tokens processed */
  totalTokens?: number;
  /** Tokens per second */
  tokensPerSecond?: number;
  /** Whether the request was successful */
  success: boolean;
  /** Error code if request failed */
  errorCode?: string;
  /** Whether connection was reused */
  connectionReused?: boolean;
  /** Whether response was cached */
  cached?: boolean;
  /** Request size in bytes */
  requestSize?: number;
  /** Response size in bytes */
  responseSize?: number;
}

/**
 * Aggregated performance metrics.
 */
export interface AggregatedMetrics {
  /** Provider name */
  provider: ModelProvider;
  /** Time window start */
  windowStart: Date;
  /** Time window end */
  windowEnd: Date;
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average response time in milliseconds */
  averageResponseTimeMs: number;
  /** Median response time in milliseconds */
  medianResponseTimeMs: number;
  /** 95th percentile response time in milliseconds */
  p95ResponseTimeMs: number;
  /** 99th percentile response time in milliseconds */
  p99ResponseTimeMs: number;
  /** Average TTFB in milliseconds */
  averageTtfbMs?: number;
  /** Total tokens processed */
  totalTokens: number;
  /** Average tokens per second */
  averageTokensPerSecond: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  /** Connection reuse rate (0-1) */
  connectionReuseRate: number;
  /** Error distribution */
  errorDistribution: Record<string, number>;
}

/**
 * System performance metrics.
 */
export interface SystemMetrics {
  /** Timestamp */
  timestamp: Date;
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Memory usage in bytes */
  memoryUsage?: number;
  /** Memory usage percentage */
  memoryUsagePercent?: number;
  /** Active connections count */
  activeConnections: number;
  /** Queue size */
  queueSize: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Requests per second */
  requestsPerSecond: number;
}

/**
 * Performance alert configuration.
 */
export interface AlertConfig {
  /** Alert name */
  name: string;
  /** Alert condition */
  condition: (metrics: AggregatedMetrics | SystemMetrics) => boolean;
  /** Alert message template */
  message: string;
  /** Cooldown period in milliseconds */
  cooldownMs: number;
  /** Whether alert is enabled */
  enabled: boolean;
}

/**
 * Performance alert.
 */
export interface PerformanceAlert {
  /** Alert ID */
  id: string;
  /** Alert name */
  name: string;
  /** Alert message */
  message: string;
  /** Alert severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Timestamp when alert was triggered */
  timestamp: Date;
  /** Related metrics */
  metrics: AggregatedMetrics | SystemMetrics;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default performance monitoring configuration.
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceMonitorConfig = {
  enabled: true,
  samplingRate: 1.0,
  maxMetrics: 10000,
  aggregationWindowMs: 60000, // 1 minute
  enableTracing: false,
};

// =============================================================================
// PERFORMANCE MONITOR
// =============================================================================

/**
 * Performance monitor for tracking AI provider performance and system health.
 *
 * @example
 * ```typescript
 * const monitor = new PerformanceMonitor({
 *   samplingRate: 0.1, // Sample 10% of requests
 *   _maxMetrics: 5000,
 * });
 *
 * // Start tracking a request
 * const requestId = monitor.startRequest('openai', 'gpt-4o');
 * 
 * // Record TTFB
 * monitor.recordTtfb(requestId, 150);
 * 
 * // End tracking
 * monitor.endRequest(requestId, {
 *   success: true,
 *   _inputTokens: 100,
 *   _outputTokens: 50,
 * });
 * ```
 */
export class PerformanceMonitor {
  private readonly config: PerformanceMonitorConfig;
  private readonly requestMetrics = new Map<string, RequestMetrics>();
  private readonly historicalMetrics: RequestMetrics[] = [];
  private readonly aggregatedMetrics = new Map<string, AggregatedMetrics>();
  private readonly systemMetrics: SystemMetrics[] = [];
  private readonly alerts: PerformanceAlert[] = [];
  private readonly alertConfigs: AlertConfig[] = [];
  private readonly alertCooldowns = new Map<string, Date>();
  
  private requestIdCounter = 0;
  private alertIdCounter = 0;
  private aggregationTimer: NodeJS.Timeout | null = null;
  private systemMetricsTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<PerformanceMonitorConfig> = {}) {
    this.config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
    
    if (this.config.enabled) {
      this.startAggregation();
      this.startSystemMetricsCollection();
      this.setupDefaultAlerts();
    }

    logger.info('[PerformanceMonitor] Initialized with config:', this.config);
  }

  // =============================================================================
  // REQUEST TRACKING
  // =============================================================================

  /**
   * Starts tracking a request.
   */
  startRequest(provider: ModelProvider, model: string): string {
    if (!this.config.enabled || Math.random() > this.config.samplingRate) {
      return ''; // Skip tracking
    }

    const requestId = `req_${++this.requestIdCounter}`;
    const startTime = new Date();

    const metrics: RequestMetrics = {
      requestId,
      provider,
      model,
      startTime,
      endTime: startTime, // Will be updated when request ends
      durationMs: 0,
      success: false,
    };

    this.requestMetrics.set(requestId, metrics);
    logger.debug(`[PerformanceMonitor] Started tracking request ${requestId} for ${provider}/${model}`);
    
    return requestId;
  }

  /**
   * Records time to first byte for a request.
   */
  recordTtfb(requestId: string, ttfbMs: number): void {
    if (!requestId || !this.config.enabled) {
      return;
    }

    const metrics = this.requestMetrics.get(requestId);
    if (metrics) {
      metrics.ttfbMs = ttfbMs;
      logger.debug(`[PerformanceMonitor] Recorded TTFB ${ttfbMs}ms for request ${requestId}`);
    }
  }

  /**
   * Records token usage for a request.
   */
  recordTokenUsage(requestId: string, inputTokens: number, outputTokens: number): void {
    if (!requestId || !this.config.enabled) {
      return;
    }

    const metrics = this.requestMetrics.get(requestId);
    if (metrics) {
      metrics.inputTokens = inputTokens;
      metrics.outputTokens = outputTokens;
      metrics.totalTokens = inputTokens + outputTokens;
      
      if (metrics.durationMs > 0) {
        metrics.tokensPerSecond = metrics.totalTokens / (metrics.durationMs / 1000);
      }
      
      logger.debug(`[PerformanceMonitor] Recorded token usage for request ${requestId}: ${inputTokens}+${outputTokens}=${metrics.totalTokens}`);
    }
  }

  /**
   * Records request and response sizes.
   */
  recordSizes(requestId: string, requestSize: number, responseSize: number): void {
    if (!requestId || !this.config.enabled) {
      return;
    }

    const metrics = this.requestMetrics.get(requestId);
    if (metrics) {
      metrics.requestSize = requestSize;
      metrics.responseSize = responseSize;
      logger.debug(`[PerformanceMonitor] Recorded sizes for request ${requestId}: req=${requestSize}B, res=${responseSize}B`);
    }
  }

  /**
   * Records cache and connection metadata.
   */
  recordMetadata(requestId: string, cached: boolean, connectionReused: boolean): void {
    if (!requestId || !this.config.enabled) {
      return;
    }

    const metrics = this.requestMetrics.get(requestId);
    if (metrics) {
      metrics.cached = cached;
      metrics.connectionReused = connectionReused;
      logger.debug(`[PerformanceMonitor] Recorded metadata for request ${requestId}: cached=${cached}, connReused=${connectionReused}`);
    }
  }

  /**
   * Ends tracking a request.
   */
  endRequest(requestId: string, result: {
    success: boolean;
    errorCode?: string;
  }): void {
    if (!requestId || !this.config.enabled) {
      return;
    }

    const metrics = this.requestMetrics.get(requestId);
    if (!metrics) {
      return;
    }

    const endTime = new Date();
    metrics.endTime = endTime;
    metrics.durationMs = endTime.getTime() - metrics.startTime.getTime();
    metrics.success = result.success;
    if (result.errorCode !== undefined) {
      metrics.errorCode = result.errorCode;
    }

    // Calculate tokens per second if we have token data
    if (metrics.totalTokens && metrics.durationMs > 0) {
      metrics.tokensPerSecond = metrics.totalTokens / (metrics.durationMs / 1000);
    }

    // Move to historical metrics
    this.historicalMetrics.push(metrics);
    this.requestMetrics.delete(requestId);

    // Trim historical metrics if needed
    if (this.historicalMetrics.length > this.config.maxMetrics) {
      this.historicalMetrics.splice(0, this.historicalMetrics.length - this.config.maxMetrics);
    }

    logger.debug(`[PerformanceMonitor] Completed tracking request ${requestId}: ${metrics.durationMs}ms, success=${result.success}`);
  }

  // =============================================================================
  // METRICS AGGREGATION
  // =============================================================================

  /**
   * Gets aggregated metrics for a provider within a time window.
   */
  getAggregatedMetrics(provider: ModelProvider, windowMs?: number): AggregatedMetrics | null {
    const window = windowMs ?? this.config.aggregationWindowMs;
    const now = new Date();
    const windowStart = new Date(now.getTime() - window);

    const providerMetrics = this.historicalMetrics.filter(
      m => m.provider === provider && m.endTime >= windowStart
    );

    if (providerMetrics.length === 0) {
      return null;
    }

    const successfulRequests = providerMetrics.filter(m => m.success).length;
    const responseTimes = providerMetrics.map(m => m.durationMs).sort((a, b) => a - b);
    const ttfbTimes = providerMetrics.filter(m => m.ttfbMs).map(m => m.ttfbMs!);
    const totalTokens = providerMetrics.reduce((sum, m) => sum + (m.totalTokens ?? 0), 0);
    const cachedRequests = providerMetrics.filter(m => m.cached).length;
    const reusedConnections = providerMetrics.filter(m => m.connectionReused).length;

    // Calculate percentiles
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    const medianIndex = Math.floor(responseTimes.length * 0.5);

    // Error distribution
    const errorDistribution: Record<string, number> = {};
    for (const metric of providerMetrics) {
      if (!metric.success && metric.errorCode) {
        errorDistribution[metric.errorCode] = (errorDistribution[metric.errorCode] ?? 0) + 1;
      }
    }

    const aggregated: AggregatedMetrics = {
      provider,
      windowStart,
      windowEnd: now,
      totalRequests: providerMetrics.length,
      successfulRequests,
      successRate: successfulRequests / providerMetrics.length,
      averageResponseTimeMs: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      medianResponseTimeMs: responseTimes[medianIndex] ?? 0,
      p95ResponseTimeMs: responseTimes[p95Index] ?? 0,
      p99ResponseTimeMs: responseTimes[p99Index] ?? 0,
      ...(ttfbTimes.length > 0 && { 
        averageTtfbMs: ttfbTimes.reduce((sum, time) => sum + time, 0) / ttfbTimes.length 
      }),
      totalTokens,
      averageTokensPerSecond: providerMetrics.reduce((sum, m) => sum + (m.tokensPerSecond ?? 0), 0) / providerMetrics.length,
      cacheHitRate: cachedRequests / providerMetrics.length,
      connectionReuseRate: reusedConnections / providerMetrics.length,
      errorDistribution,
    };

    return aggregated;
  }

  /**
   * Gets system performance metrics.
   */
  getSystemMetrics(): SystemMetrics {
    const now = new Date();
    const recentRequests = this.historicalMetrics.filter(
      m => now.getTime() - m.endTime.getTime() < 60000 // Last minute
    );

    return {
      timestamp: now,
      activeConnections: this.requestMetrics.size,
      queueSize: 0, // Would be populated by request queue
      cacheHitRate: recentRequests.length > 0 
        ? recentRequests.filter(m => m.cached).length / recentRequests.length 
        : 0,
      requestsPerSecond: recentRequests.length / 60,
    };
  }

  /**
   * Gets all available metrics.
   */
  getAllMetrics(): {
    aggregated: Record<string, AggregatedMetrics>;
    system: SystemMetrics;
    recent: RequestMetrics[];
  } {
    const aggregated: Record<string, AggregatedMetrics> = {};
    
    // Get unique providers
    const providers = new Set(this.historicalMetrics.map(m => m.provider));
    
    for (const provider of providers) {
      const metrics = this.getAggregatedMetrics(provider);
      if (metrics) {
        aggregated[provider] = metrics;
      }
    }

    return {
      aggregated,
      system: this.getSystemMetrics(),
      recent: this.historicalMetrics.slice(-100), // Last 100 requests
    };
  }

  // =============================================================================
  // ALERTING
  // =============================================================================

  /**
   * Adds an alert configuration.
   */
  addAlert(config: AlertConfig): void {
    this.alertConfigs.push(config);
    logger.debug(`[PerformanceMonitor] Added alert: ${config.name}`);
  }

  /**
   * Gets all active alerts.
   */
  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Clears all alerts.
   */
  clearAlerts(): void {
    this.alerts.length = 0;
    logger.debug('[PerformanceMonitor] Cleared all alerts');
  }

  // =============================================================================
  // LIFECYCLE
  // =============================================================================

  /**
   * Destroys the performance monitor.
   */
  destroy(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
    }
    if (this.systemMetricsTimer) {
      clearInterval(this.systemMetricsTimer);
    }
    
    this.requestMetrics.clear();
    this.historicalMetrics.length = 0;
    this.aggregatedMetrics.clear();
    this.systemMetrics.length = 0;
    this.alerts.length = 0;
    
    logger.info('[PerformanceMonitor] Destroyed');
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Starts periodic metrics aggregation.
   */
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.aggregateMetrics();
      this.checkAlerts();
    }, this.config.aggregationWindowMs);
  }

  /**
   * Starts system metrics collection.
   */
  private startSystemMetricsCollection(): void {
    this.systemMetricsTimer = setInterval(() => {
      const metrics = this.getSystemMetrics();
      this.systemMetrics.push(metrics);
      
      // Keep only recent system metrics
      if (this.systemMetrics.length > 1000) {
        this.systemMetrics.splice(0, this.systemMetrics.length - 1000);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Aggregates metrics for all providers.
   */
  private aggregateMetrics(): void {
    const providers = new Set(this.historicalMetrics.map(m => m.provider));
    
    for (const provider of providers) {
      const metrics = this.getAggregatedMetrics(provider);
      if (metrics) {
        this.aggregatedMetrics.set(provider, metrics);
      }
    }
  }

  /**
   * Checks alert conditions and triggers alerts.
   */
  private checkAlerts(): void {
    const now = new Date();
    
    for (const alertConfig of this.alertConfigs) {
      if (!alertConfig.enabled) {
        continue;
      }
      
      // Check cooldown
      const lastAlert = this.alertCooldowns.get(alertConfig.name);
      if (lastAlert && (now.getTime() - lastAlert.getTime() < alertConfig.cooldownMs)) {
        continue;
      }
      
      // Check aggregated metrics
      for (const metrics of this.aggregatedMetrics.values()) {
        if (alertConfig.condition(metrics)) {
          this.triggerAlert(alertConfig, metrics);
          this.alertCooldowns.set(alertConfig.name, now);
          break;
        }
      }
      
      // Check system metrics
      if (this.systemMetrics.length > 0) {
        const latestSystemMetrics = this.systemMetrics[this.systemMetrics.length - 1];
        if (latestSystemMetrics && alertConfig.condition(latestSystemMetrics)) {
          this.triggerAlert(alertConfig, latestSystemMetrics);
          this.alertCooldowns.set(alertConfig.name, now);
        }
      }
    }
  }

  /**
   * Triggers an alert.
   */
  private triggerAlert(config: AlertConfig, metrics: AggregatedMetrics | SystemMetrics): void {
    const alert: PerformanceAlert = {
      id: `alert_${++this.alertIdCounter}`,
      name: config.name,
      message: config.message,
      severity: this.determineSeverity(config, metrics),
      timestamp: new Date(),
      metrics,
    };
    
    this.alerts.push(alert);
    
    // Keep only recent alerts
    if (this.alerts.length > 100) {
      this.alerts.splice(0, this.alerts.length - 100);
    }
    
    logger.warn(`[PerformanceMonitor] Alert triggered: ${alert.name} - ${alert.message}`);
  }

  /**
   * Determines alert severity based on metrics.
   */
  private determineSeverity(_config: AlertConfig, metrics: AggregatedMetrics | SystemMetrics): PerformanceAlert['severity'] {
    // Simple severity determination - could be made more sophisticated
    if ('successRate' in metrics) {
      if (metrics.successRate < 0.5) {
        return 'critical';
      }
      if (metrics.successRate < 0.8) {
        return 'high';
      }
      if (metrics.successRate < 0.95) {
        return 'medium';
      }
    }
    
    if ('averageResponseTimeMs' in metrics) {
      if (metrics.averageResponseTimeMs > 10000) {
        return 'critical';
      }
      if (metrics.averageResponseTimeMs > 5000) {
        return 'high';
      }
      if (metrics.averageResponseTimeMs > 2000) {
        return 'medium';
      }
    }
    
    return 'low';
  }

  /**
   * Sets up default alert configurations.
   */
  private setupDefaultAlerts(): void {
    this.addAlert({
      name: 'High Error Rate',
      condition: (metrics) => 'successRate' in metrics && metrics.successRate < 0.9,
      message: 'Error rate is above 10%',
      cooldownMs: 300000, // 5 minutes
      enabled: true,
    });
    
    this.addAlert({
      name: 'Slow Response Time',
      condition: (metrics) => 'averageResponseTimeMs' in metrics && metrics.averageResponseTimeMs > 5000,
      message: 'Average response time is above 5 seconds',
      cooldownMs: 300000, // 5 minutes
      enabled: true,
    });
    
    this.addAlert({
      name: 'Low Cache Hit Rate',
      condition: (metrics) => 'cacheHitRate' in metrics && metrics.cacheHitRate < 0.1,
      message: 'Cache hit rate is below 10%',
      cooldownMs: 600000, // 10 minutes
      enabled: true,
    });
  }
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

/**
 * Global performance monitor instance.
 */
export const globalPerformanceMonitor = new PerformanceMonitor();