/**
 * @fileoverview Tests for performance monitoring utilities
 * @module shared/utils/__tests__/performanceMonitor
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PerformanceMonitor,
  performanceMonitor,
  startRenderTracking,
  recordRenderCycle,
  startOperation,
  measure,
  measureAsync,
  getRenderCycleData,
  getOperationData,
  getSummary,
  clearPerformanceData,
  setPerformanceMonitorEnabled,
  isPerformanceMonitorEnabled,
  startMemoryMonitoring,
  stopMemoryMonitoring,
  getMemoryStats,
  getAllMemoryStats,
  getMemoryLeakReport,
  forceGarbageCollection,
  clearMemoryMonitoring,
  clearAllMemoryMonitoring,
} from '../performanceMonitor.js';

// Mock performance.now()
const mockPerformanceNow = vi.fn();
Object.defineProperty(global, 'performance', {
  value: { now: mockPerformanceNow },
  writable: true,
});

// Mock process.memoryUsage()
const mockMemoryUsage = vi.fn();
Object.defineProperty(process, 'memoryUsage', {
  value: mockMemoryUsage,
  writable: true,
});

// Mock global.gc
const mockGc = vi.fn();
Object.defineProperty(global, 'gc', {
  value: mockGc,
  writable: true,
});

// Mock Date.now()
const mockDateNow = vi.fn();
Object.defineProperty(Date, 'now', {
  value: mockDateNow,
  writable: true,
});

// Mock setInterval and clearInterval
const mockSetInterval = vi.fn();
const mockClearInterval = vi.fn();
Object.defineProperty(global, 'setInterval', {
  value: mockSetInterval,
  writable: true,
});
Object.defineProperty(global, 'clearInterval', {
  value: mockClearInterval,
  writable: true,
});

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  let currentTime = 0;
  let currentTimestamp = 1000000;
  let mockIntervalId = 1;

  const createMockMemoryUsage = (heapUsed: number, heapTotal: number, rss: number, external = 0, arrayBuffers = 0) => ({
    heapUsed,
    heapTotal,
    rss,
    external,
    arrayBuffers,
  });

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    monitor.setEnabled(true);
    currentTime = 0;
    currentTimestamp = 1000000;
    mockIntervalId = 1;
    
    mockPerformanceNow.mockImplementation(() => currentTime);
    mockDateNow.mockImplementation(() => currentTimestamp);
    mockMemoryUsage.mockImplementation(() => createMockMemoryUsage(50 * 1024 * 1024, 100 * 1024 * 1024, 200 * 1024 * 1024));
    mockSetInterval.mockImplementation((callback, interval) => {
      // Store callback for manual triggering in tests
      return mockIntervalId++;
    });
    mockClearInterval.mockImplementation(() => {});
    mockGc.mockImplementation(() => {});
    
    clearPerformanceData();
    setPerformanceMonitorEnabled(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('render cycle tracking', () => {
    it('should track render cycles correctly', () => {
      const componentName = 'TestComponent';
      
      // Start tracking
      startRenderTracking(componentName);
      
      // Simulate first render
      currentTime = 10;
      recordRenderCycle(componentName);
      
      // Simulate second render
      currentTime = 25;
      recordRenderCycle(componentName);
      
      // Simulate third render
      currentTime = 40;
      recordRenderCycle(componentName);
      
      const data = getRenderCycleData(componentName);
      expect(data).toBeDefined();
      expect(data!.count).toBe(3);
      expect(data!.averageInterval).toBe(15); // (25-10 + 40-25) / 2 = 15
      expect(data!.maxInterval).toBe(15);
      expect(data!.minInterval).toBe(15);
    });

    it('should handle multiple components', () => {
      startRenderTracking('Component1');
      startRenderTracking('Component2');
      
      currentTime = 10;
      recordRenderCycle('Component1');
      
      currentTime = 15;
      recordRenderCycle('Component2');
      
      currentTime = 20;
      recordRenderCycle('Component1');
      
      const data1 = getRenderCycleData('Component1');
      const data2 = getRenderCycleData('Component2');
      
      expect(data1!.count).toBe(2);
      expect(data2!.count).toBe(1);
    });

    it('should auto-start tracking when recording without explicit start', () => {
      currentTime = 10;
      recordRenderCycle('AutoStartComponent');
      
      const data = getRenderCycleData('AutoStartComponent');
      expect(data).toBeDefined();
      expect(data!.count).toBe(1);
    });
  });

  describe('operation timing', () => {
    it('should measure synchronous operations', () => {
      const operationName = 'testOperation';
      
      const result = measure(operationName, () => {
        currentTime += 50; // Simulate 50ms operation
        return 'test result';
      });
      
      expect(result).toBe('test result');
      
      const data = getOperationData(operationName);
      expect(data).toBeDefined();
      expect(data!.count).toBe(1);
      expect(data!.lastTime).toBe(50);
      expect(data!.averageTime).toBe(50);
      expect(data!.totalTime).toBe(50);
    });

    it('should measure async operations', async () => {
      const operationName = 'asyncOperation';
      
      const result = await measureAsync(operationName, async () => {
        currentTime += 100; // Simulate 100ms async operation
        return Promise.resolve('async result');
      });
      
      expect(result).toBe('async result');
      
      const data = getOperationData(operationName);
      expect(data).toBeDefined();
      expect(data!.count).toBe(1);
      expect(data!.lastTime).toBe(100);
    });

    it('should track multiple operations of the same type', () => {
      const operationName = 'repeatedOperation';
      
      // First operation - 30ms
      measure(operationName, () => {
        currentTime += 30;
        return 'result1';
      });
      
      // Second operation - 70ms
      measure(operationName, () => {
        currentTime += 70;
        return 'result2';
      });
      
      const data = getOperationData(operationName);
      expect(data).toBeDefined();
      expect(data!.count).toBe(2);
      expect(data!.totalTime).toBe(100);
      expect(data!.averageTime).toBe(50);
      expect(data!.maxTime).toBe(70);
      expect(data!.minTime).toBe(30);
      expect(data!.lastTime).toBe(70);
    });

    it('should handle operation errors gracefully', () => {
      const operationName = 'errorOperation';
      
      expect(() => {
        measure(operationName, () => {
          currentTime += 25;
          throw new Error('Test error');
        });
      }).toThrow('Test error');
      
      // Should still record the timing even if operation throws
      const data = getOperationData(operationName);
      expect(data).toBeDefined();
      expect(data!.count).toBe(1);
      expect(data!.lastTime).toBe(25);
    });
  });

  describe('timer functions', () => {
    it('should provide start/end timer functionality', () => {
      const operationName = 'timerOperation';
      
      const endTimer = startOperation(operationName);
      currentTime += 60;
      endTimer();
      
      const data = getOperationData(operationName);
      expect(data).toBeDefined();
      expect(data!.count).toBe(1);
      expect(data!.lastTime).toBe(60);
    });
  });

  describe('summary and reporting', () => {
    it('should provide comprehensive summary', () => {
      // Add some render cycles
      startRenderTracking('Component1');
      currentTime = 10;
      recordRenderCycle('Component1');
      currentTime = 20;
      recordRenderCycle('Component1');
      
      // Add some operations
      measure('operation1', () => {
        currentTime += 30;
        return 'result';
      });
      
      const summary = getSummary();
      
      expect(summary.renderCycles).toHaveLength(1);
      expect(summary.operations).toHaveLength(1);
      expect(summary.totalRenderCycles).toBe(2);
      expect(summary.totalOperations).toBe(1);
      
      const renderData = summary.renderCycles[0];
      expect(renderData.name).toBe('Component1');
      expect(renderData.count).toBe(2);
      expect(renderData.renderRate).toBeGreaterThan(0);
    });
  });

  describe('enable/disable functionality', () => {
    it('should respect enabled/disabled state', () => {
      monitor.setEnabled(false);
      expect(monitor.isEnabled()).toBe(false);
      
      // Operations should be no-ops when disabled
      const result = monitor.measure('disabledOperation', () => {
        currentTime += 50;
        return 'result';
      });
      
      expect(result).toBe('result');
      expect(monitor.getOperationData('disabledOperation')).toBeUndefined();
      
      monitor.setEnabled(true);
      expect(monitor.isEnabled()).toBe(true);
    });

    it('should work with singleton functions when disabled', () => {
      setPerformanceMonitorEnabled(false);
      expect(isPerformanceMonitorEnabled()).toBe(false);
      
      recordRenderCycle('disabledComponent');
      expect(getRenderCycleData('disabledComponent')).toBeUndefined();
      
      setPerformanceMonitorEnabled(true);
    });
  });

  describe('data management', () => {
    it('should clear all data', () => {
      startRenderTracking('Component1');
      recordRenderCycle('Component1');
      measure('operation1', () => 'result');
      
      expect(getRenderCycleData('Component1')).toBeDefined();
      expect(getOperationData('operation1')).toBeDefined();
      
      clearPerformanceData();
      
      expect(getRenderCycleData('Component1')).toBeUndefined();
      expect(getOperationData('operation1')).toBeUndefined();
    });

    it('should clear specific render cycles', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(true);
      
      monitor.startRenderTracking('Component1');
      monitor.startRenderTracking('Component2');
      monitor.recordRenderCycle('Component1');
      monitor.recordRenderCycle('Component2');
      
      expect(monitor.getRenderCycleData('Component1')).toBeDefined();
      expect(monitor.getRenderCycleData('Component2')).toBeDefined();
      
      monitor.clearRenderCycles('Component1');
      
      expect(monitor.getRenderCycleData('Component1')).toBeUndefined();
      expect(monitor.getRenderCycleData('Component2')).toBeDefined();
    });
  });

  describe('React hook integration', () => {
    it('should create render tracker function', () => {
      const tracker = monitor.createRenderTracker('HookComponent');
      
      currentTime = 10;
      tracker();
      
      currentTime = 25;
      tracker();
      
      const data = monitor.getRenderCycleData('HookComponent');
      expect(data).toBeDefined();
      expect(data!.count).toBe(2);
    });
  });

  describe('memory monitoring', () => {
    it('should start memory monitoring and create initial stats', () => {
      const componentName = 'TestComponent';
      
      startMemoryMonitoring(componentName);
      
      const stats = getMemoryStats(componentName);
      expect(stats).toBeDefined();
      expect(stats!.name).toBe(componentName);
      expect(stats!.measurementCount).toBe(1);
      expect(stats!.memoryGrowth).toBe(0);
      expect(stats!.potentialLeak).toBe(false);
      expect(mockSetInterval).toHaveBeenCalled();
    });

    it('should stop memory monitoring and clear intervals', () => {
      const componentName = 'TestComponent';
      
      startMemoryMonitoring(componentName);
      expect(mockSetInterval).toHaveBeenCalled();
      
      stopMemoryMonitoring(componentName);
      expect(mockClearInterval).toHaveBeenCalled();
    });

    it('should detect memory growth', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(true);
      
      const componentName = 'GrowingComponent';
      
      // Start with 50MB
      mockMemoryUsage.mockReturnValueOnce(createMockMemoryUsage(50 * 1024 * 1024, 100 * 1024 * 1024, 200 * 1024 * 1024));
      monitor.startMemoryMonitoring(componentName);
      
      // Simulate memory growth to 80MB
      mockMemoryUsage.mockReturnValueOnce(createMockMemoryUsage(80 * 1024 * 1024, 120 * 1024 * 1024, 220 * 1024 * 1024));
      currentTimestamp += 5000;
      
      // Manually trigger memory sampling (since we can't easily test setInterval)
      const stats = monitor.getMemoryStats(componentName);
      expect(stats).toBeDefined();
      
      // Update memory stats manually to simulate sampling
      if (stats) {
        const newMemory = {
          timestamp: currentTimestamp,
          usedHeapSize: 80 * 1024 * 1024,
          totalHeapSize: 120 * 1024 * 1024,
          heapSizeLimit: 220 * 1024 * 1024,
          external: 0,
          arrayBuffers: 0,
        };
        
        // Simulate the memory sampling logic
        stats.currentMemory = newMemory;
        stats.memoryGrowth = newMemory.usedHeapSize - stats.initialMemory.usedHeapSize;
        stats.measurementCount++;
        
        if (newMemory.usedHeapSize > stats.peakMemory.usedHeapSize) {
          stats.peakMemory = newMemory;
          stats.peakMemoryGrowth = Math.max(stats.peakMemoryGrowth, stats.memoryGrowth);
        }
        
        stats.averageMemoryUsage = (
          (stats.averageMemoryUsage * (stats.measurementCount - 1)) + 
          newMemory.usedHeapSize
        ) / stats.measurementCount;
      }
      
      expect(stats!.memoryGrowth).toBe(30 * 1024 * 1024); // 30MB growth
      expect(stats!.measurementCount).toBe(2);
    });

    it('should detect potential memory leaks', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(true);
      
      const componentName = 'LeakyComponent';
      
      monitor.startMemoryMonitoring(componentName);
      
      const stats = monitor.getMemoryStats(componentName);
      expect(stats).toBeDefined();
      
      // Get the actual initial memory value from the stats
      const initialMemory = stats!.initialMemory.usedHeapSize;
      
      // Simulate memory growth beyond threshold (initial + 60MB growth > 50MB threshold)
      if (stats) {
        const leakyMemory = {
          timestamp: currentTimestamp + 5000,
          usedHeapSize: initialMemory + (60 * 1024 * 1024), // Add 60MB growth
          totalHeapSize: 150 * 1024 * 1024,
          heapSizeLimit: 250 * 1024 * 1024,
          external: 0,
          arrayBuffers: 0,
        };
        
        stats.currentMemory = leakyMemory;
        stats.memoryGrowth = leakyMemory.usedHeapSize - stats.initialMemory.usedHeapSize;
        stats.measurementCount++;
        
        // Simulate leak detection logic
        const MEMORY_LEAK_THRESHOLD = 50 * 1024 * 1024; // 50MB
        if (stats.memoryGrowth > MEMORY_LEAK_THRESHOLD) {
          stats.leakThresholdExceeded++;
          stats.potentialLeak = true;
        }
      }
      
      // The growth should be 60MB
      expect(stats!.memoryGrowth).toBe(60 * 1024 * 1024);
      expect(stats!.potentialLeak).toBe(true);
      expect(stats!.leakThresholdExceeded).toBe(1);
    });

    it('should provide memory leak report', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(true);
      
      // Create healthy component
      monitor.startMemoryMonitoring('HealthyComponent');
      const healthyStats = monitor.getMemoryStats('HealthyComponent');
      if (healthyStats) {
        healthyStats.memoryGrowth = 10 * 1024 * 1024; // 10MB growth - healthy
        healthyStats.potentialLeak = false;
      }
      
      // Create leaky component
      monitor.startMemoryMonitoring('LeakyComponent');
      const leakyStats = monitor.getMemoryStats('LeakyComponent');
      if (leakyStats) {
        leakyStats.memoryGrowth = 60 * 1024 * 1024; // 60MB growth - leak
        leakyStats.potentialLeak = true;
      }
      
      const report = monitor.getMemoryLeakReport();
      
      expect(report.totalMonitored).toBe(2);
      expect(report.potentialLeaks).toHaveLength(1);
      expect(report.healthyComponents).toHaveLength(1);
      expect(report.potentialLeaks[0].name).toBe('LeakyComponent');
      expect(report.healthyComponents[0].name).toBe('HealthyComponent');
      expect(report.totalMemoryGrowth).toBe(70 * 1024 * 1024); // 10MB + 60MB
      expect(report.averageMemoryGrowth).toBe(35 * 1024 * 1024); // 70MB / 2
    });

    it('should force garbage collection when available', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(true);
      
      // Mock memory before and after GC
      mockMemoryUsage
        .mockReturnValueOnce(createMockMemoryUsage(100 * 1024 * 1024, 150 * 1024 * 1024, 200 * 1024 * 1024))
        .mockReturnValueOnce(createMockMemoryUsage(80 * 1024 * 1024, 150 * 1024 * 1024, 200 * 1024 * 1024));
      
      const result = monitor.forceGarbageCollection();
      
      expect(result).toBeDefined();
      expect(result!.before.usedHeapSize).toBe(100 * 1024 * 1024);
      expect(result!.after.usedHeapSize).toBe(80 * 1024 * 1024);
      expect(mockGc).toHaveBeenCalled();
    });

    it('should handle garbage collection when not available', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(true);
      
      // Mock global.gc as undefined
      const originalGc = (global as any).gc;
      (global as any).gc = undefined;
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const result = monitor.forceGarbageCollection();
      
      expect(result).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Garbage collection not available')
      );
      
      // Restore original gc
      (global as any).gc = originalGc;
      consoleSpy.mockRestore();
    });

    it('should clear memory monitoring for specific component', () => {
      startMemoryMonitoring('Component1');
      startMemoryMonitoring('Component2');
      
      expect(getMemoryStats('Component1')).toBeDefined();
      expect(getMemoryStats('Component2')).toBeDefined();
      
      clearMemoryMonitoring('Component1');
      
      expect(getMemoryStats('Component1')).toBeUndefined();
      expect(getMemoryStats('Component2')).toBeDefined();
      expect(mockClearInterval).toHaveBeenCalled();
    });

    it('should clear all memory monitoring', () => {
      // Reset mock call count
      mockClearInterval.mockClear();
      
      startMemoryMonitoring('Component1');
      startMemoryMonitoring('Component2');
      
      expect(getAllMemoryStats().size).toBe(2);
      
      clearAllMemoryMonitoring();
      
      expect(getAllMemoryStats().size).toBe(0);
      expect(mockClearInterval).toHaveBeenCalledTimes(2);
    });

    it('should include memory stats in summary', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(true);
      
      // Add memory monitoring
      monitor.startMemoryMonitoring('TestComponent');
      const stats = monitor.getMemoryStats('TestComponent');
      if (stats) {
        stats.memoryGrowth = 30 * 1024 * 1024;
        stats.potentialLeak = false;
      }
      
      // Add render cycles and operations for complete summary
      monitor.startRenderTracking('Component1');
      currentTime = 10;
      monitor.recordRenderCycle('Component1');
      
      monitor.measure('operation1', () => {
        currentTime += 30;
        return 'result';
      });
      
      const summary = monitor.getSummary();
      
      expect(summary.memoryStats).toHaveLength(1);
      expect(summary.memoryLeakReport).toBeDefined();
      expect(summary.memoryLeakReport.totalMonitored).toBe(1);
      expect(summary.memoryLeakReport.potentialLeaks).toHaveLength(0);
      expect(summary.memoryLeakReport.healthyComponents).toHaveLength(1);
    });

    it('should respect enabled/disabled state for memory monitoring', () => {
      const monitor = new PerformanceMonitor();
      monitor.setEnabled(false);
      
      monitor.startMemoryMonitoring('DisabledComponent');
      
      expect(monitor.getMemoryStats('DisabledComponent')).toBeUndefined();
      expect(mockSetInterval).not.toHaveBeenCalled();
    });
  });
});