/**
 * @fileoverview Performance monitoring utilities for tracking render cycles and operations
 * @module shared/utils/performanceMonitor
 */

/**
 * Interface for render cycle tracking data
 */
interface RenderCycleData {
  /** Component or operation name */
  name: string;
  /** Number of render cycles */
  count: number;
  /** Start time of tracking */
  startTime: number;
  /** Last render time */
  lastRenderTime: number;
  /** Total duration of tracking */
  totalDuration: number;
  /** Average time between renders */
  averageInterval: number;
  /** Maximum time between renders */
  maxInterval: number;
  /** Minimum time between renders */
  minInterval: number;
}

/**
 * Interface for operation performance data
 */
interface OperationData {
  /** Operation name */
  name: string;
  /** Number of times operation was executed */
  count: number;
  /** Total time spent in operation */
  totalTime: number;
  /** Average execution time */
  averageTime: number;
  /** Maximum execution time */
  maxTime: number;
  /** Minimum execution time */
  minTime: number;
  /** Last execution time */
  lastTime: number;
}

/**
 * Interface for memory usage data
 */
interface MemoryUsageData {
  /** Timestamp of the measurement */
  timestamp: number;
  /** Used heap size in bytes */
  usedHeapSize: number;
  /** Total heap size in bytes */
  totalHeapSize: number;
  /** Heap size limit in bytes */
  heapSizeLimit: number;
  /** External memory usage in bytes */
  external: number;
  /** Array buffer memory usage in bytes */
  arrayBuffers: number;
}

/**
 * Interface for memory monitoring statistics
 */
interface MemoryStats {
  /** Component or operation name */
  name: string;
  /** Initial memory snapshot */
  initialMemory: MemoryUsageData;
  /** Current memory snapshot */
  currentMemory: MemoryUsageData;
  /** Peak memory usage during monitoring */
  peakMemory: MemoryUsageData;
  /** Memory growth since start (in bytes) */
  memoryGrowth: number;
  /** Peak memory growth (in bytes) */
  peakMemoryGrowth: number;
  /** Number of memory measurements taken */
  measurementCount: number;
  /** Average memory usage (in bytes) */
  averageMemoryUsage: number;
  /** Potential memory leak detected */
  potentialLeak: boolean;
  /** Memory leak threshold exceeded count */
  leakThresholdExceeded: number;
}

/**
 * Performance monitoring class for tracking render cycles and operations
 */
class PerformanceMonitor {
  private renderCycles = new Map<string, RenderCycleData>();
  private operations = new Map<string, OperationData>();
  private memoryStats = new Map<string, MemoryStats>();
  private enabled = process.env['NODE_ENV'] === 'development';
  
  // Memory monitoring configuration
  private readonly MEMORY_LEAK_THRESHOLD = 50 * 1024 * 1024; // 50MB growth threshold
  private readonly MEMORY_SAMPLE_INTERVAL = 5000; // 5 seconds
  private memoryIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if performance monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start tracking render cycles for a component or operation
   */
  startRenderTracking(name: string): void {
    if (!this.enabled) return;

    const now = performance.now();
    
    if (!this.renderCycles.has(name)) {
      this.renderCycles.set(name, {
        name,
        count: 0,
        startTime: now,
        lastRenderTime: now,
        totalDuration: 0,
        averageInterval: 0,
        maxInterval: 0,
        minInterval: Infinity,
      });
    }
  }

  /**
   * Record a render cycle for a component or operation
   */
  recordRenderCycle(name: string): void {
    if (!this.enabled) return;

    const now = performance.now();
    const data = this.renderCycles.get(name);

    if (!data) {
      // Start tracking if not already started
      this.startRenderTracking(name);
      return this.recordRenderCycle(name);
    }

    const interval = now - data.lastRenderTime;
    data.count++;
    data.lastRenderTime = now;
    data.totalDuration = now - data.startTime;

    // Update interval statistics
    if (data.count > 1) {
      data.maxInterval = Math.max(data.maxInterval, interval);
      data.minInterval = Math.min(data.minInterval, interval);
      data.averageInterval = (data.averageInterval * (data.count - 2) + interval) / (data.count - 1);
    }
  }

  /**
   * Get render cycle data for a component or operation
   */
  getRenderCycleData(name: string): RenderCycleData | undefined {
    return this.renderCycles.get(name);
  }

  /**
   * Get all render cycle data
   */
  getAllRenderCycleData(): Map<string, RenderCycleData> {
    return new Map(this.renderCycles);
  }

  /**
   * Start timing an operation
   */
  startOperation(name: string): () => void {
    if (!this.enabled) {
      return () => {}; // No-op function
    }

    const startTime = performance.now();

    return () => {
      this.endOperation(name, startTime);
    };
  }

  /**
   * End timing an operation
   */
  private endOperation(name: string, startTime: number): void {
    if (!this.enabled) return;

    const endTime = performance.now();
    const duration = endTime - startTime;

    let data = this.operations.get(name);
    
    if (!data) {
      data = {
        name,
        count: 0,
        totalTime: 0,
        averageTime: 0,
        maxTime: 0,
        minTime: Infinity,
        lastTime: 0,
      };
      this.operations.set(name, data);
    }

    data.count++;
    data.totalTime += duration;
    data.lastTime = duration;
    data.averageTime = data.totalTime / data.count;
    data.maxTime = Math.max(data.maxTime, duration);
    data.minTime = Math.min(data.minTime, duration);
  }

  /**
   * Measure an operation and return its result
   */
  measure<T>(name: string, operation: () => T): T {
    if (!this.enabled) {
      return operation();
    }

    const endTimer = this.startOperation(name);
    try {
      return operation();
    } finally {
      endTimer();
    }
  }

  /**
   * Measure an async operation and return its result
   */
  async measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return operation();
    }

    const endTimer = this.startOperation(name);
    try {
      return await operation();
    } finally {
      endTimer();
    }
  }

  /**
   * Get operation performance data
   */
  getOperationData(name: string): OperationData | undefined {
    return this.operations.get(name);
  }

  /**
   * Get all operation performance data
   */
  getAllOperationData(): Map<string, OperationData> {
    return new Map(this.operations);
  }

  /**
   * Clear all performance data
   */
  clear(): void {
    this.renderCycles.clear();
    this.operations.clear();
    this.clearAllMemoryMonitoring();
  }

  /**
   * Get current memory usage snapshot
   */
  private getCurrentMemoryUsage(): MemoryUsageData {
    const memUsage = process.memoryUsage();
    return {
      timestamp: Date.now(),
      usedHeapSize: memUsage.heapUsed,
      totalHeapSize: memUsage.heapTotal,
      heapSizeLimit: memUsage.rss, // Using RSS as approximation for heap limit
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
    };
  }

  /**
   * Start monitoring memory usage for a component or operation
   */
  startMemoryMonitoring(name: string): void {
    if (!this.enabled) return;

    // Stop existing monitoring if any
    this.stopMemoryMonitoring(name);

    const initialMemory = this.getCurrentMemoryUsage();
    
    const memoryStats: MemoryStats = {
      name,
      initialMemory,
      currentMemory: initialMemory,
      peakMemory: initialMemory,
      memoryGrowth: 0,
      peakMemoryGrowth: 0,
      measurementCount: 1,
      averageMemoryUsage: initialMemory.usedHeapSize,
      potentialLeak: false,
      leakThresholdExceeded: 0,
    };

    this.memoryStats.set(name, memoryStats);

    // Set up periodic memory sampling
    const interval = setInterval(() => {
      this.sampleMemoryUsage(name);
    }, this.MEMORY_SAMPLE_INTERVAL);

    this.memoryIntervals.set(name, interval);
  }

  /**
   * Sample memory usage for ongoing monitoring
   */
  private sampleMemoryUsage(name: string): void {
    if (!this.enabled) return;

    const stats = this.memoryStats.get(name);
    if (!stats) return;

    const currentMemory = this.getCurrentMemoryUsage();
    const memoryGrowth = currentMemory.usedHeapSize - stats.initialMemory.usedHeapSize;

    // Update statistics
    stats.currentMemory = currentMemory;
    stats.memoryGrowth = memoryGrowth;
    stats.measurementCount++;

    // Update peak memory if current is higher
    if (currentMemory.usedHeapSize > stats.peakMemory.usedHeapSize) {
      stats.peakMemory = currentMemory;
      stats.peakMemoryGrowth = Math.max(stats.peakMemoryGrowth, memoryGrowth);
    }

    // Update average memory usage
    stats.averageMemoryUsage = (
      (stats.averageMemoryUsage * (stats.measurementCount - 1)) + 
      currentMemory.usedHeapSize
    ) / stats.measurementCount;

    // Check for potential memory leak
    if (memoryGrowth > this.MEMORY_LEAK_THRESHOLD) {
      stats.leakThresholdExceeded++;
      stats.potentialLeak = true;
      
      if (this.enabled) {
        console.warn(`🚨 Potential memory leak detected in "${name}":`, {
          memoryGrowth: `${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
          threshold: `${(this.MEMORY_LEAK_THRESHOLD / 1024 / 1024).toFixed(2)}MB`,
          currentUsage: `${(currentMemory.usedHeapSize / 1024 / 1024).toFixed(2)}MB`,
        });
      }
    }
  }

  /**
   * Stop monitoring memory usage for a component or operation
   */
  stopMemoryMonitoring(name: string): void {
    const interval = this.memoryIntervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.memoryIntervals.delete(name);
    }
  }

  /**
   * Get memory statistics for a component or operation
   */
  getMemoryStats(name: string): MemoryStats | undefined {
    return this.memoryStats.get(name);
  }

  /**
   * Get all memory statistics
   */
  getAllMemoryStats(): Map<string, MemoryStats> {
    return new Map(this.memoryStats);
  }

  /**
   * Clear memory monitoring for a specific component or operation
   */
  clearMemoryMonitoring(name: string): void {
    this.stopMemoryMonitoring(name);
    this.memoryStats.delete(name);
  }

  /**
   * Clear all memory monitoring
   */
  clearAllMemoryMonitoring(): void {
    // Stop all intervals
    for (const [name] of this.memoryIntervals) {
      this.stopMemoryMonitoring(name);
    }
    this.memoryStats.clear();
  }

  /**
   * Get memory leak detection results
   */
  getMemoryLeakReport(): {
    totalMonitored: number;
    potentialLeaks: Array<MemoryStats>;
    healthyComponents: Array<MemoryStats>;
    totalMemoryGrowth: number;
    averageMemoryGrowth: number;
  } {
    const allStats = Array.from(this.memoryStats.values());
    const potentialLeaks = allStats.filter(stats => stats.potentialLeak);
    const healthyComponents = allStats.filter(stats => !stats.potentialLeak);
    
    const totalMemoryGrowth = allStats.reduce((sum, stats) => sum + stats.memoryGrowth, 0);
    const averageMemoryGrowth = allStats.length > 0 ? totalMemoryGrowth / allStats.length : 0;

    return {
      totalMonitored: allStats.length,
      potentialLeaks,
      healthyComponents,
      totalMemoryGrowth,
      averageMemoryGrowth,
    };
  }

  /**
   * Force garbage collection and measure memory before/after (if available)
   */
  forceGarbageCollection(): { before: MemoryUsageData; after: MemoryUsageData } | null {
    if (!this.enabled) return null;

    const before = this.getCurrentMemoryUsage();
    
    // Force garbage collection if available (requires --expose-gc flag)
    if (global.gc) {
      global.gc();
    } else if (this.enabled) {
      console.warn('⚠️ Garbage collection not available. Run with --expose-gc flag to enable.');
    }

    const after = this.getCurrentMemoryUsage();
    
    return { before, after };
  }

  /**
   * Clear render cycle data for a specific component or operation
   */
  clearRenderCycles(name?: string): void {
    if (name) {
      this.renderCycles.delete(name);
    } else {
      this.renderCycles.clear();
    }
  }

  /**
   * Clear operation data for a specific operation
   */
  clearOperations(name?: string): void {
    if (name) {
      this.operations.delete(name);
    } else {
      this.operations.clear();
    }
  }

  /**
   * Get a summary of all performance data
   */
  getSummary(): {
    renderCycles: Array<RenderCycleData & { renderRate: number }>;
    operations: Array<OperationData>;
    memoryStats: Array<MemoryStats>;
    memoryLeakReport: ReturnType<PerformanceMonitor['getMemoryLeakReport']>;
    totalRenderCycles: number;
    totalOperations: number;
  } {
    const renderCycles = Array.from(this.renderCycles.values()).map(data => ({
      ...data,
      renderRate: data.totalDuration > 0 ? (data.count / data.totalDuration) * 1000 : 0, // renders per second
    }));

    const operations = Array.from(this.operations.values());
    const memoryStats = Array.from(this.memoryStats.values());
    const memoryLeakReport = this.getMemoryLeakReport();

    return {
      renderCycles,
      operations,
      memoryStats,
      memoryLeakReport,
      totalRenderCycles: renderCycles.reduce((sum, data) => sum + data.count, 0),
      totalOperations: operations.reduce((sum, data) => sum + data.count, 0),
    };
  }

  /**
   * Log performance summary to console
   */
  logSummary(): void {
    if (!this.enabled) return;

    const summary = this.getSummary();
    
    console.group('🔍 Performance Monitor Summary');
    
    if (summary.renderCycles.length > 0) {
      console.group('📊 Render Cycles');
      summary.renderCycles.forEach(data => {
        console.log(`${data.name}:`, {
          count: data.count,
          averageInterval: `${data.averageInterval.toFixed(2)}ms`,
          renderRate: `${data.renderRate.toFixed(2)}/sec`,
          totalDuration: `${data.totalDuration.toFixed(2)}ms`,
        });
      });
      console.groupEnd();
    }

    if (summary.operations.length > 0) {
      console.group('⚡ Operations');
      summary.operations.forEach(data => {
        console.log(`${data.name}:`, {
          count: data.count,
          averageTime: `${data.averageTime.toFixed(2)}ms`,
          totalTime: `${data.totalTime.toFixed(2)}ms`,
          maxTime: `${data.maxTime.toFixed(2)}ms`,
        });
      });
      console.groupEnd();
    }

    if (summary.memoryStats.length > 0) {
      console.group('🧠 Memory Usage');
      summary.memoryStats.forEach(stats => {
        const memoryGrowthMB = (stats.memoryGrowth / 1024 / 1024).toFixed(2);
        const currentUsageMB = (stats.currentMemory.usedHeapSize / 1024 / 1024).toFixed(2);
        const averageUsageMB = (stats.averageMemoryUsage / 1024 / 1024).toFixed(2);
        
        console.log(`${stats.name}:`, {
          currentUsage: `${currentUsageMB}MB`,
          memoryGrowth: `${memoryGrowthMB}MB`,
          averageUsage: `${averageUsageMB}MB`,
          measurements: stats.measurementCount,
          potentialLeak: stats.potentialLeak ? '🚨 YES' : '✅ NO',
        });
      });
      console.groupEnd();
    }

    // Memory leak report
    if (summary.memoryLeakReport.totalMonitored > 0) {
      console.group('🚨 Memory Leak Report');
      console.log(`Total Monitored: ${summary.memoryLeakReport.totalMonitored}`);
      console.log(`Potential Leaks: ${summary.memoryLeakReport.potentialLeaks.length}`);
      console.log(`Healthy Components: ${summary.memoryLeakReport.healthyComponents.length}`);
      console.log(`Total Memory Growth: ${(summary.memoryLeakReport.totalMemoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Average Memory Growth: ${(summary.memoryLeakReport.averageMemoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      
      if (summary.memoryLeakReport.potentialLeaks.length > 0) {
        console.warn('Components with potential leaks:', 
          summary.memoryLeakReport.potentialLeaks.map(stats => stats.name)
        );
      }
      console.groupEnd();
    }

    console.log(`Total Render Cycles: ${summary.totalRenderCycles}`);
    console.log(`Total Operations: ${summary.totalOperations}`);
    console.groupEnd();
  }

  /**
   * Create a React hook for tracking component render cycles
   */
  createRenderTracker(componentName: string): () => void {
    return () => {
      this.recordRenderCycle(componentName);
    };
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Export singleton instance and class for testing
export { performanceMonitor, PerformanceMonitor };

// Export types
export type { RenderCycleData, OperationData, MemoryUsageData, MemoryStats };

// Convenience functions using the singleton
export const startRenderTracking = (name: string): void => performanceMonitor.startRenderTracking(name);
export const recordRenderCycle = (name: string): void => performanceMonitor.recordRenderCycle(name);
export const startOperation = (name: string): (() => void) => performanceMonitor.startOperation(name);
export const measure = <T>(name: string, operation: () => T): T => performanceMonitor.measure(name, operation);
export const measureAsync = <T>(name: string, operation: () => Promise<T>): Promise<T> => performanceMonitor.measureAsync(name, operation);
export const getRenderCycleData = (name: string): RenderCycleData | undefined => performanceMonitor.getRenderCycleData(name);
export const getOperationData = (name: string): OperationData | undefined => performanceMonitor.getOperationData(name);

// Memory monitoring functions
export const startMemoryMonitoring = (name: string): void => performanceMonitor.startMemoryMonitoring(name);
export const stopMemoryMonitoring = (name: string): void => performanceMonitor.stopMemoryMonitoring(name);
export const getMemoryStats = (name: string): MemoryStats | undefined => performanceMonitor.getMemoryStats(name);
export const getAllMemoryStats = (): Map<string, MemoryStats> => performanceMonitor.getAllMemoryStats();
export const getMemoryLeakReport = () => performanceMonitor.getMemoryLeakReport();
export const forceGarbageCollection = () => performanceMonitor.forceGarbageCollection();
export const clearMemoryMonitoring = (name: string): void => performanceMonitor.clearMemoryMonitoring(name);
export const clearAllMemoryMonitoring = (): void => performanceMonitor.clearAllMemoryMonitoring();

// General functions
export const getSummary = () => performanceMonitor.getSummary();
export const logSummary = (): void => performanceMonitor.logSummary();
export const clearPerformanceData = (): void => performanceMonitor.clear();
export const setPerformanceMonitorEnabled = (enabled: boolean): void => performanceMonitor.setEnabled(enabled);
export const isPerformanceMonitorEnabled = (): boolean => performanceMonitor.isEnabled();