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
