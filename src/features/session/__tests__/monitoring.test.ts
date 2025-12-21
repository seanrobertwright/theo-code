/**
 * @fileoverview Unit tests for session monitoring and metrics
 * @module features/session/__tests__/monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SessionMetricsCollector,
  SystemHealthMonitor,
  DashboardDataProvider,
  SessionMonitoringService,
} from '../index.js';
import type {
  SessionMetadata,
  SessionId,
} from '../../../shared/types/index.js';
import { createSessionId } from '../../../shared/types/index.js';

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Creates mock session metadata for testing.
 */
function createMockSessionMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  const sessionId = createSessionId();
  const now = Date.now();
  
  return {
    id: sessionId,
    created: now - 86400000, // 1 day ago
    lastModified: now - 3600000, // 1 hour ago
    model: 'gpt-4o',
    tokenCount: { total: 1000, input: 500, output: 500 },
    title: 'Test Session',
    workspaceRoot: '/test/workspace',
    messageCount: 5,
    lastMessage: 'Test message',
    contextFiles: ['test.ts'],
    tags: ['test'],
    preview: 'Test preview',
    ...overrides,
  };
}

/**
 * Creates multiple mock sessions for testing.
 */
function createMockSessions(count: number): SessionMetadata[] {
  const sessions: SessionMetadata[] = [];
  const baseTime = Date.now() - (count * 3600000); // Spread over hours
  
  for (let i = 0; i < count; i++) {
    sessions.push(createMockSessionMetadata({
      id: createSessionId(),
      created: baseTime + (i * 3600000),
      lastModified: baseTime + (i * 3600000) + 1800000, // 30 min later
      title: `Test Session ${i + 1}`,
      messageCount: Math.floor(Math.random() * 20) + 1,
      tokenCount: {
        total: Math.floor(Math.random() * 5000) + 500,
        input: Math.floor(Math.random() * 2500) + 250,
        output: Math.floor(Math.random() * 2500) + 250,
      },
    }));
  }
  
  return sessions;
}

/**
 * Waits for a specified amount of time.
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// SESSION METRICS COLLECTOR TESTS
// =============================================================================

describe('SessionMetricsCollector', () => {
  let collector: SessionMetricsCollector;
  
  beforeEach(() => {
    collector = new SessionMetricsCollector();
  });
  
  afterEach(() => {
    collector.clear();
  });
  
  describe('Operation Tracking', () => {
    it('should track operation start and end', () => {
      const operation = 'testOperation';
      const token = collector.startOperation(operation);
      
      expect(token).toBeTruthy();
      expect(token).toContain(operation);
      
      // End the operation
      collector.endOperation(operation, token, true, 100);
      
      const metrics = collector.getOperationMetrics(operation);
      expect(metrics).toBeTruthy();
      expect(metrics!.operation).toBe(operation);
      expect(metrics!.totalCount).toBe(1);
      expect(metrics!.successCount).toBe(1);
      expect(metrics!.failureCount).toBe(0);
      expect(metrics!.successRate).toBe(1);
      expect(metrics!.averageTime).toBe(100);
    });
    
    it('should track multiple operations', () => {
      const operation = 'multiTest';
      
      // Track multiple successful operations
      for (let i = 0; i < 5; i++) {
        const token = collector.startOperation(operation);
        collector.endOperation(operation, token, true, (i + 1) * 10);
      }
      
      // Track some failed operations
      for (let i = 0; i < 2; i++) {
        const token = collector.startOperation(operation);
        collector.endOperation(operation, token, false, 50);
      }
      
      const metrics = collector.getOperationMetrics(operation);
      expect(metrics).toBeTruthy();
      expect(metrics!.totalCount).toBe(7);
      expect(metrics!.successCount).toBe(5);
      expect(metrics!.failureCount).toBe(2);
      expect(metrics!.successRate).toBeCloseTo(5/7, 2);
      expect(metrics!.averageTime).toBeCloseTo((10+20+30+40+50+50+50)/7, 1);
    });
    
    it('should calculate timing statistics correctly', () => {
      const operation = 'timingTest';
      const times = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      
      for (const time of times) {
        const token = collector.startOperation(operation);
        collector.endOperation(operation, token, true, time);
      }
      
      const metrics = collector.getOperationMetrics(operation);
      expect(metrics).toBeTruthy();
      expect(metrics!.averageTime).toBe(55); // (10+20+...+100)/10
      expect(metrics!.minTime).toBe(10);
      expect(metrics!.maxTime).toBe(100);
      expect(metrics!.p95Time).toBe(100); // 95th percentile of sorted array
    });
    
    it('should return null for non-existent operations', () => {
      const metrics = collector.getOperationMetrics('nonExistent');
      expect(metrics).toBeNull();
    });
    
    it('should get all operation metrics', () => {
      const operations = ['op1', 'op2', 'op3'];
      
      for (const op of operations) {
        const token = collector.startOperation(op);
        collector.endOperation(op, token, true, 100);
      }
      
      const allMetrics = collector.getAllOperationMetrics();
      expect(allMetrics).toHaveLength(3);
      
      const operationNames = allMetrics.map(m => m.operation);
      expect(operationNames).toEqual(expect.arrayContaining(operations));
    });
  });
  
  describe('Storage Usage Tracking', () => {
    it('should record storage usage snapshots', () => {
      collector.recordStorageUsage(100, 1024 * 1024); // 100 sessions, 1MB
      collector.recordStorageUsage(150, 1.5 * 1024 * 1024); // 150 sessions, 1.5MB
      
      const sessions = createMockSessions(150);
      const metrics = collector.getStorageUsageMetrics(sessions);
      
      expect(metrics.totalSessions).toBe(150);
      expect(metrics.totalSize).toBeGreaterThan(0);
      expect(metrics.averageSessionSize).toBeGreaterThan(0);
    });
    
    it('should calculate storage metrics correctly', () => {
      const sessions = createMockSessions(10);
      const metrics = collector.getStorageUsageMetrics(sessions);
      
      expect(metrics.totalSessions).toBe(10);
      expect(metrics.totalSize).toBeGreaterThan(0);
      expect(metrics.averageSessionSize).toBe(metrics.totalSize / 10);
      expect(metrics.largestSessionSize).toBeGreaterThanOrEqual(metrics.averageSessionSize);
      
      // Check age distribution
      const totalAgeDistribution = 
        metrics.ageDistribution.last24Hours +
        metrics.ageDistribution.lastWeek +
        metrics.ageDistribution.lastMonth +
        metrics.ageDistribution.older;
      expect(totalAgeDistribution).toBe(10);
      
      // Check size distribution
      const totalSizeDistribution =
        metrics.sizeDistribution.small +
        metrics.sizeDistribution.medium +
        metrics.sizeDistribution.large +
        metrics.sizeDistribution.extraLarge;
      expect(totalSizeDistribution).toBe(10);
    });
    
    it('should calculate growth rate from history', () => {
      // Record multiple snapshots to establish growth
      collector.recordStorageUsage(10, 100000);
      collector.recordStorageUsage(20, 200000);
      collector.recordStorageUsage(30, 300000);
      
      const sessions = createMockSessions(30);
      const metrics = collector.getStorageUsageMetrics(sessions);
      
      expect(metrics.growthRate).toBeGreaterThanOrEqual(0);
      expect(metrics.daysUntilFull).toBeGreaterThan(0);
    });
  });
  
  describe('Uptime Tracking', () => {
    it('should track uptime', async () => {
      const initialUptime = collector.getUptime();
      expect(initialUptime).toBeGreaterThanOrEqual(0);
      
      await wait(10);
      
      const laterUptime = collector.getUptime();
      expect(laterUptime).toBeGreaterThan(initialUptime);
    });
  });
  
  describe('Data Management', () => {
    it('should clear all data', () => {
      // Add some data
      const token = collector.startOperation('test');
      collector.endOperation('test', token, true, 100);
      collector.recordStorageUsage(10, 1000);
      
      // Verify data exists
      expect(collector.getOperationMetrics('test')).toBeTruthy();
      
      // Clear and verify
      collector.clear();
      expect(collector.getOperationMetrics('test')).toBeNull();
    });
  });
});

// =============================================================================
// SYSTEM HEALTH MONITOR TESTS
// =============================================================================

describe('SystemHealthMonitor', () => {
  let monitor: SystemHealthMonitor;
  let metricsCollector: SessionMetricsCollector;
  
  beforeEach(() => {
    metricsCollector = new SessionMetricsCollector();
    monitor = new SystemHealthMonitor({
      enabled: true,
      healthCheckInterval: 1000, // 1 second for testing
      storageThresholds: {
        warningPercentage: 80,
        criticalPercentage: 95,
        lowDiskSpaceGB: 1,
      },
      performanceThresholds: {
        slowOperationMs: 1000,
        highFailureRate: 0.1,
        lowCacheHitRate: 0.5,
      },
    }, metricsCollector);
  });
  
  afterEach(() => {
    monitor.stop();
  });
  
  describe('Health Checks', () => {
    it('should perform health check', async () => {
      const healthStatus = await monitor.performHealthCheck();
      
      expect(healthStatus).toBeTruthy();
      expect(healthStatus.status).toMatch(/healthy|warning|critical|unknown/);
      expect(healthStatus.score).toBeGreaterThanOrEqual(0);
      expect(healthStatus.score).toBeLessThanOrEqual(100);
      expect(healthStatus.lastCheck).toBeGreaterThan(0);
      expect(healthStatus.components).toBeTruthy();
      expect(healthStatus.components.storage).toBeTruthy();
      expect(healthStatus.components.cache).toBeTruthy();
      expect(healthStatus.components.backgroundTasks).toBeTruthy();
      expect(healthStatus.components.performance).toBeTruthy();
    });
    
    it('should get health status', async () => {
      const healthStatus = await monitor.getHealthStatus();
      
      expect(healthStatus).toBeTruthy();
      expect(typeof healthStatus.uptime).toBe('number');
      expect(Array.isArray(healthStatus.alerts)).toBe(true);
      expect(healthStatus.memory).toBeTruthy();
    });
  });
  
  describe('Alert Management', () => {
    it('should create alerts', () => {
      const alert = {
        severity: 'warning' as const,
        type: 'storage' as const,
        title: 'Test Alert',
        description: 'This is a test alert',
        metadata: { test: true },
      };
      
      monitor.createAlert(alert);
      
      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].title).toBe('Test Alert');
      expect(activeAlerts[0].severity).toBe('warning');
      expect(activeAlerts[0].acknowledged).toBe(false);
    });
    
    it('should acknowledge alerts', () => {
      const alert = {
        severity: 'error' as const,
        type: 'performance' as const,
        title: 'Test Alert',
        description: 'This is a test alert',
        metadata: {},
      };
      
      monitor.createAlert(alert);
      
      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      
      const alertId = activeAlerts[0].id;
      monitor.acknowledgeAlert(alertId);
      
      const activeAlertsAfter = monitor.getActiveAlerts();
      expect(activeAlertsAfter).toHaveLength(0);
      
      const allAlerts = monitor.getAllAlerts();
      expect(allAlerts).toHaveLength(1);
      expect(allAlerts[0].acknowledged).toBe(true);
    });
    
    it('should prevent duplicate alerts', () => {
      const alert = {
        severity: 'warning' as const,
        type: 'storage' as const,
        title: 'Duplicate Alert',
        description: 'This alert should not be duplicated',
        metadata: {},
      };
      
      monitor.createAlert(alert);
      monitor.createAlert(alert); // Same alert
      
      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
    });
    
    it('should cleanup old alerts', () => {
      // Create an alert
      const alert = {
        severity: 'info' as const,
        type: 'system' as const,
        title: 'Old Alert',
        description: 'This alert should be cleaned up',
        metadata: {},
      };
      
      monitor.createAlert(alert);
      expect(monitor.getAllAlerts()).toHaveLength(1);
      
      // Manually cleanup (in real scenario, this would be based on time)
      monitor.cleanupAlerts();
      
      // Alert should still be there since it's recent
      expect(monitor.getAllAlerts()).toHaveLength(1);
    });
  });
  
  describe('Service Lifecycle', () => {
    it('should start and stop monitoring', () => {
      expect(() => monitor.start()).not.toThrow();
      expect(() => monitor.stop()).not.toThrow();
    });
    
    it('should handle multiple start/stop calls', () => {
      monitor.start();
      monitor.start(); // Should not cause issues
      
      monitor.stop();
      monitor.stop(); // Should not cause issues
    });
  });
});

// =============================================================================
// DASHBOARD DATA PROVIDER TESTS
// =============================================================================

describe('DashboardDataProvider', () => {
  let provider: DashboardDataProvider;
  let metricsCollector: SessionMetricsCollector;
  let healthMonitor: SystemHealthMonitor;
  
  beforeEach(() => {
    metricsCollector = new SessionMetricsCollector();
    healthMonitor = new SystemHealthMonitor({}, metricsCollector);
    provider = new DashboardDataProvider(metricsCollector, healthMonitor);
  });
  
  afterEach(() => {
    healthMonitor.stop();
  });
  
  describe('Dashboard Data Generation', () => {
    it('should generate comprehensive dashboard data', async () => {
      const sessions = createMockSessions(10);
      
      // Add some operation metrics
      const token = metricsCollector.startOperation('testOp');
      metricsCollector.endOperation('testOp', token, true, 100);
      
      const performanceMetrics = {
        cache: {
          totalEntries: 10,
          hits: 8,
          misses: 2,
          hitRate: 0.8,
          memoryUsage: 1024,
          evictions: 0,
          averageAccessTime: 5,
        },
        operationTimes: {
          listSessions: 50,
          searchSessions: 100,
          loadSession: 25,
          saveSession: 75,
        },
        memory: {
          totalUsage: 2048,
          cacheUsage: 1024,
          backgroundTasksUsage: 512,
        },
        backgroundTasks: {
          queued: 2,
          running: 1,
          completed: 10,
          failed: 1,
        },
      };
      
      const dashboardData = await provider.getDashboardData(sessions, performanceMetrics);
      
      expect(dashboardData).toBeTruthy();
      expect(dashboardData.overview).toBeTruthy();
      expect(dashboardData.overview.totalSessions).toBe(10);
      expect(dashboardData.overview.systemHealth).toMatch(/healthy|warning|critical|unknown/);
      expect(dashboardData.overview.uptime).toBeTruthy();
      
      expect(dashboardData.recentOperations).toBeTruthy();
      expect(Array.isArray(dashboardData.recentOperations)).toBe(true);
      
      expect(dashboardData.storageUsage).toBeTruthy();
      expect(dashboardData.storageUsage.totalSessions).toBe(10);
      
      expect(dashboardData.performance).toBe(performanceMetrics);
      
      expect(Array.isArray(dashboardData.alerts)).toBe(true);
      expect(dashboardData.resources).toBeTruthy();
      expect(Array.isArray(dashboardData.timeline)).toBe(true);
    });
    
    it('should handle empty data gracefully', async () => {
      const sessions: SessionMetadata[] = [];
      const performanceMetrics = {
        cache: {
          totalEntries: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
          memoryUsage: 0,
          evictions: 0,
          averageAccessTime: 0,
        },
        operationTimes: {
          listSessions: 0,
          searchSessions: 0,
          loadSession: 0,
          saveSession: 0,
        },
        memory: {
          totalUsage: 0,
          cacheUsage: 0,
          backgroundTasksUsage: 0,
        },
        backgroundTasks: {
          queued: 0,
          running: 0,
          completed: 0,
          failed: 0,
        },
      };
      
      const dashboardData = await provider.getDashboardData(sessions, performanceMetrics);
      
      expect(dashboardData.overview.totalSessions).toBe(0);
      expect(dashboardData.storageUsage.totalSessions).toBe(0);
      expect(dashboardData.timeline).toHaveLength(0);
    });
  });
});

// =============================================================================
// SESSION MONITORING SERVICE TESTS
// =============================================================================

describe('SessionMonitoringService', () => {
  let service: SessionMonitoringService;
  
  beforeEach(() => {
    service = new SessionMonitoringService({
      enabled: true,
      metricsInterval: 100, // Fast for testing
      healthCheckInterval: 200,
      autoTrackStorage: false, // Disable for testing
      performanceAlertsEnabled: true,
      storageAlertsEnabled: true,
    });
  });
  
  afterEach(() => {
    service.stop();
  });
  
  describe('Service Lifecycle', () => {
    it('should start and stop service', () => {
      expect(service.isRunning()).toBe(false);
      
      service.start();
      expect(service.isRunning()).toBe(true);
      
      service.stop();
      expect(service.isRunning()).toBe(false);
    });
    
    it('should handle multiple start/stop calls', () => {
      service.start();
      service.start(); // Should not cause issues
      expect(service.isRunning()).toBe(true);
      
      service.stop();
      service.stop(); // Should not cause issues
      expect(service.isRunning()).toBe(false);
    });
  });
  
  describe('Operation Tracking', () => {
    it('should track operations', () => {
      const context = {
        operation: 'testOperation',
        sessionId: createSessionId(),
        metadata: { test: true },
      };
      
      const startTime = performance.now();
      const token = service.startOperation(context);
      
      expect(token).toBeTruthy();
      
      service.endOperation(context, token, true, startTime);
      
      const metrics = service.getOperationMetrics('testOperation');
      expect(metrics).toBeTruthy();
      expect(metrics!.operation).toBe('testOperation');
      expect(metrics!.successCount).toBe(1);
    });
    
    it('should track operations with automatic timing', async () => {
      const context = {
        operation: 'autoTimedOperation',
        metadata: { auto: true },
      };
      
      const result = await service.trackOperation(context, async () => {
        await wait(10);
        return 'success';
      });
      
      expect(result).toBe('success');
      
      const metrics = service.getOperationMetrics('autoTimedOperation');
      expect(metrics).toBeTruthy();
      expect(metrics!.successCount).toBe(1);
      expect(metrics!.averageTime).toBeGreaterThan(0);
    });
    
    it('should handle operation failures', async () => {
      const context = {
        operation: 'failingOperation',
      };
      
      await expect(service.trackOperation(context, async () => {
        throw new Error('Test error');
      })).rejects.toThrow('Test error');
      
      const metrics = service.getOperationMetrics('failingOperation');
      expect(metrics).toBeTruthy();
      expect(metrics!.failureCount).toBe(1);
      expect(metrics!.successCount).toBe(0);
    });
  });
  
  describe('Storage Monitoring', () => {
    it('should record storage usage', () => {
      const sessions = createMockSessions(5);
      
      service.recordStorageUsage(sessions);
      
      const metrics = service.getStorageUsageMetrics(sessions);
      expect(metrics.totalSessions).toBe(5);
      expect(metrics.totalSize).toBeGreaterThan(0);
    });
  });
  
  describe('Health Monitoring', () => {
    it('should get health status', async () => {
      const healthStatus = await service.getHealthStatus();
      
      expect(healthStatus).toBeTruthy();
      expect(healthStatus.status).toMatch(/healthy|warning|critical|unknown/);
    });
    
    it('should manage alerts', () => {
      const alert = {
        severity: 'warning' as const,
        type: 'storage' as const,
        title: 'Test Service Alert',
        description: 'This is a test alert from the service',
        metadata: {},
      };
      
      service.createAlert(alert);
      
      const activeAlerts = service.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].title).toBe('Test Service Alert');
    });
  });
  
  describe('Event Management', () => {
    it('should handle event listeners', () => {
      let alertReceived: any = null;
      
      service.on('alert:created', (alert) => {
        alertReceived = alert;
      });
      
      const alert = {
        severity: 'info' as const,
        type: 'system' as const,
        title: 'Event Test Alert',
        description: 'This alert should trigger an event',
        metadata: {},
      };
      
      service.createAlert(alert);
      
      expect(alertReceived).toBeTruthy();
      expect(alertReceived.title).toBe('Event Test Alert');
      
      // Remove listener
      service.off('alert:created');
    });
  });
  
  describe('Service Statistics', () => {
    it('should provide service statistics', () => {
      const stats = service.getServiceStats();
      
      expect(stats).toBeTruthy();
      expect(typeof stats.uptime).toBe('number');
      expect(typeof stats.operationCount).toBe('number');
      expect(typeof stats.alertCount).toBe('number');
      expect(typeof stats.lastStorageCheck).toBe('number');
      expect(typeof stats.lastPerformanceCheck).toBe('number');
    });
  });
  
  describe('Maintenance', () => {
    it('should perform maintenance', () => {
      expect(() => service.performMaintenance()).not.toThrow();
    });
    
    it('should clear data', () => {
      // Add some data
      const context = { operation: 'clearTest' };
      const token = service.startOperation(context);
      service.endOperation(context, token, true, performance.now());
      
      // Verify data exists
      expect(service.getOperationMetrics('clearTest')).toBeTruthy();
      
      // Clear and verify
      service.clear();
      expect(service.getOperationMetrics('clearTest')).toBeNull();
    });
  });
  
  describe('Configuration', () => {
    it('should respect disabled configuration', () => {
      const disabledService = new SessionMonitoringService({
        enabled: false,
      });
      
      const context = { operation: 'disabledTest' };
      const token = disabledService.startOperation(context);
      
      expect(token).toBe(''); // Should return empty token when disabled
      
      disabledService.stop();
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Monitoring Integration', () => {
  let service: SessionMonitoringService;
  let sessions: SessionMetadata[];
  
  beforeEach(() => {
    service = new SessionMonitoringService({
      enabled: true,
      performanceAlertsEnabled: true,
      storageAlertsEnabled: true,
      performanceThresholds: {
        slowOperationMs: 100, // Low threshold for testing
        highFailureRate: 0.5, // High threshold for testing
        lowCacheHitRate: 0.3,
      },
      storageThresholds: {
        warningPercentage: 50, // Low threshold for testing
        criticalPercentage: 80,
        lowDiskSpaceGB: 1,
      },
    });
    
    sessions = createMockSessions(10);
    service.start();
  });
  
  afterEach(() => {
    service.stop();
  });
  
  it('should integrate all monitoring components', async () => {
    // Track some operations
    await service.trackOperation(
      { operation: 'integrationTest' },
      async () => {
        await wait(10);
        return 'success';
      }
    );
    
    // Record storage usage
    service.recordStorageUsage(sessions);
    
    // Get comprehensive status
    const healthStatus = await service.getHealthStatus();
    const operationMetrics = service.getAllOperationMetrics();
    const storageMetrics = service.getStorageUsageMetrics(sessions);
    
    expect(healthStatus).toBeTruthy();
    expect(operationMetrics).toHaveLength(1);
    expect(operationMetrics[0].operation).toBe('integrationTest');
    expect(storageMetrics.totalSessions).toBe(10);
    
    // Get service statistics
    const stats = service.getServiceStats();
    expect(stats.operationCount).toBe(1);
    expect(stats.uptime).toBeGreaterThan(0);
  });
  
  it('should handle high-load scenarios', async () => {
    const operations = Array.from({ length: 100 }, (_, i) => `operation${i}`);
    
    // Track many operations concurrently
    const promises = operations.map(async (op) => {
      return service.trackOperation(
        { operation: op },
        async () => {
          await wait(Math.random() * 10);
          return 'success';
        }
      );
    });
    
    await Promise.all(promises);
    
    const allMetrics = service.getAllOperationMetrics();
    expect(allMetrics.length).toBeGreaterThan(0);
    
    // Verify all operations were tracked
    const operationNames = allMetrics.map(m => m.operation);
    for (const op of operations) {
      expect(operationNames).toContain(op);
    }
  });
  
  it('should maintain performance under load', async () => {
    const startTime = performance.now();
    
    // Perform many monitoring operations
    for (let i = 0; i < 1000; i++) {
      const context = { operation: `loadTest${i % 10}` };
      const token = service.startOperation(context);
      service.endOperation(context, token, true, performance.now());
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    // Should complete within reasonable time (< 1 second)
    expect(totalTime).toBeLessThan(1000);
    
    // Verify metrics are still accurate
    const metrics = service.getOperationMetrics('loadTest0');
    expect(metrics).toBeTruthy();
    expect(metrics!.totalCount).toBe(100); // 1000 operations / 10 unique names
  });
});