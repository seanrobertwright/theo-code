/**
 * @fileoverview Session feature public API
 * @module features/session
 */

// Export SessionManager and related types
export {
  SessionManager,
  createSessionManager,
  type ISessionManager,
  type CreateSessionOptions,
  type LoadSessionOptions,
  type AutoSaveConfig,
  type ExportSessionOptions,
  type ImportSessionOptions,
  type ExportResult,
  type ImportResult,
} from './manager.js';

// Export Enhanced SessionManager with performance optimizations
export {
  EnhancedSessionManager,
  createEnhancedSessionManager,
  type EnhancedSessionManagerConfig,
} from './enhanced-manager.js';

// Export performance optimization utilities
export {
  SessionMetadataCache,
  LazyLoadingManager,
  BackgroundTaskManager,
  PerformanceMonitor,
  type CacheStats,
  type LazyLoadConfig,
  type BackgroundTaskConfig,
  type PerformanceMetrics,
  type BackgroundTask,
} from './performance.js';

// Export monitoring and metrics utilities
export {
  SessionMetricsCollector,
  SystemHealthMonitor,
  DashboardDataProvider,
  type SessionOperationMetrics,
  type StorageUsageMetrics,
  type SystemHealthStatus,
  type ComponentHealth,
  type SystemAlert,
  type MonitoringConfig,
  type DashboardData,
} from './monitoring.js';

// Export integrated monitoring service
export {
  SessionMonitoringService,
  createSessionMonitoringService,
  type MonitoringServiceConfig,
  type OperationContext,
  type MonitoringEvents,
} from './monitoring-service.js';

// Export SessionStorage and related types
export {
  SessionStorage,
  type ISessionStorage,
} from './storage.js';

// Export audit logging functionality
export {
  AuditLogger,
  getAuditLogger,
  resetAuditLogger,
  logOperation,
  type AuditLogLevel,
  type AuditLogDestination,
  type AuditLogEntry,
  type AuditLoggerConfig,
} from './audit.js';

// Re-export session types from shared
export type {
  Session,
  SessionId,
  SessionMetadata,
  SessionIndex,
  SessionTokenCount,
} from '../../shared/types/index.js';
