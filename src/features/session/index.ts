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
} from './manager.js';

// Export SessionStorage and related types
export {
  SessionStorage,
  type ISessionStorage,
} from './storage.js';

// Re-export session types from shared
export type {
  Session,
  SessionId,
  SessionMetadata,
  SessionIndex,
  SessionTokenCount,
} from '../../shared/types/index.js';
