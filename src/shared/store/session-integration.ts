/**
 * @fileoverview Session persistence integration for Zustand store
 * @module shared/store/session-integration
 *
 * This module provides utilities to integrate the SessionManager
 * with the Zustand store, enabling automatic persistence of session state
 * and seamless synchronization between memory and disk.
 */

import type { Session, SessionId } from '../types/index.js';
import { SessionManager, type ISessionManager } from '../../features/session/manager.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration for session persistence integration.
 */
export interface SessionPersistenceConfig {
  /** SessionManager instance to use for persistence */
  sessionManager: ISessionManager;
  
  /** Whether to enable auto-save */
  enableAutoSave?: boolean;
  
  /** Auto-save interval in milliseconds */
  autoSaveIntervalMs?: number;
  
  /** Whether to automatically restore session on startup */
  autoRestore?: boolean;
  
  /** Debounce delay for save operations in milliseconds */
  saveDebounceMs?: number;
}

/**
 * Session persistence actions that can be added to the store.
 */
export interface SessionPersistenceActions {
  // Session persistence actions
  saveCurrentSession: () => Promise<void>;
  loadSession: (sessionId: SessionId) => Promise<void>;
  restoreSession: (sessionId: SessionId) => Promise<void>;
  deletePersistedSession: (sessionId: SessionId) => Promise<void>;
  
  // Auto-save management
  enableAutoSave: (intervalMs?: number) => void;
  disableAutoSave: () => void;
  isAutoSaveEnabled: () => boolean;
  
  // Session manager access
  getSessionManager: () => ISessionManager;
}

/**
 * Middleware options for session persistence.
 */
export interface SessionPersistenceMiddlewareOptions {
  /** SessionManager instance */
  sessionManager: ISessionManager;
  
  /** Debounce delay for save operations */
  saveDebounceMs?: number;
  
  /** Whether to enable crash recovery auto-save */
  enableCrashRecovery?: boolean;
  
  /** Actions that should trigger immediate save (for crash recovery) */
  immediateSaveActions?: string[];
}

// =============================================================================
// SESSION PERSISTENCE MIDDLEWARE
// =============================================================================

/**
 * Creates session persistence middleware for Zustand store.
 * 
 * This middleware ensures that all session state changes are automatically
 * persisted to disk, providing crash recovery capabilities as required by
 * Requirement 1.3.
 * 
 * @param options - Middleware configuration options
 * @returns Zustand middleware function
 */
export function createSessionPersistenceMiddleware(
  options: SessionPersistenceMiddlewareOptions
) {
  const {
    sessionManager,
    saveDebounceMs = 1000,
    enableCrashRecovery = true,
    immediateSaveActions = [
      'addMessage',
      'updateMessage',
      'deleteMessage',
      'clearMessages',
      'addContextFile',
      'removeContextFile',
      'clearContextFiles',
      'setCurrentModel',
      'updateSessionTokens'
    ]
  } = options;

  let saveTimeout: NodeJS.Timeout | null = null;
  
  return (config: any) => (set: any, get: any, api: any) => {
    const originalSet = set;
    
    // Wrap the set function to intercept state changes
    const wrappedSet = (partial: any, replace?: boolean, actionName?: string) => {
      // Call the original set function
      const result = originalSet(partial, replace);
      
      // Get the updated state
      const state = get();
      
      // Always keep SessionManager in sync with store state
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        
        // If crash recovery is enabled, save the session
        if (enableCrashRecovery) {
          // Determine if this action requires immediate save
          const requiresImmediateSave = actionName && immediateSaveActions.includes(actionName);
          
          if (requiresImmediateSave) {
            // Clear any pending debounced save
            if (saveTimeout) {
              clearTimeout(saveTimeout);
              saveTimeout = null;
            }
            
            // Perform immediate save for crash recovery
            sessionManager.saveSession(state.session).catch((error) => {
              console.error('Failed to save session for crash recovery:', error);
              if (state.setError) {
                state.setError(`Failed to save session: ${error.message}`);
              }
            });
          } else {
            // Use debounced save for other changes
            if (saveTimeout) {
              clearTimeout(saveTimeout);
            }
            
            saveTimeout = setTimeout(() => {
              if (state.session) {
                sessionManager.saveSession(state.session).catch((error) => {
                  console.error('Failed to save session:', error);
                  if (state.setError) {
                    state.setError(`Failed to save session: ${error.message}`);
                  }
                });
              }
            }, saveDebounceMs);
          }
        }
      } else {
        // Clear SessionManager's current session if store session is null
        sessionManager.setCurrentSession(null);
      }
      
      return result;
    };
    
    return config(wrappedSet, get, api);
  };
}

// =============================================================================
// SESSION PERSISTENCE HELPER
// =============================================================================

/**
 * Creates session persistence actions for the Zustand store.
 * 
 * @param sessionManager - SessionManager instance
 * @returns Session persistence actions
 */
export function createSessionPersistenceActions(
  sessionManager: ISessionManager
): (set: any, get: any) => SessionPersistenceActions {
  return (set, get) => ({
    // -------------------------------------------------------------------------
    // Session Persistence Actions
    // -------------------------------------------------------------------------
    
    saveCurrentSession: async (): Promise<void> => {
      const state = get();
      if (!state.session) {
        throw new Error('No current session to save');
      }
      
      try {
        await sessionManager.saveSession(state.session);
      } catch (error) {
        const errorMessage = `Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`;
        state.setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    
    loadSession: async (sessionId): Promise<void> => {
      try {
        const session = await sessionManager.loadSession(sessionId, {
          validateIntegrity: true,
          updateTimestamp: true,
        });
        
        // Update store state with loaded session (Requirement 2.2)
        set({
          session,
          messages: session.messages,
          contextFiles: new Map(session.contextFiles.map(path => [path, ''])), // Content will be loaded separately
          currentModel: session.model,
          workspaceRoot: session.workspaceRoot,
        });
        
        sessionManager.setCurrentSession(session);
      } catch (error) {
        const errorMessage = `Failed to load session: ${error instanceof Error ? error.message : 'Unknown error'}`;
        get().setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    
    restoreSession: async (sessionId): Promise<void> => {
      try {
        const result = await sessionManager.restoreSessionWithContext(sessionId);
        
        // Update store state with restored session (Requirement 2.2)
        set({
          session: result.session,
          messages: result.session.messages,
          contextFiles: new Map(result.session.contextFiles.map(path => [path, ''])), // Content will be loaded separately
          currentModel: result.session.model,
          workspaceRoot: result.session.workspaceRoot,
        });
        
        // Log context file status
        if (result.contextFilesMissing.length > 0) {
          console.warn('Some context files are missing:', result.contextFilesMissing);
        }
        
        sessionManager.setCurrentSession(result.session);
      } catch (error) {
        const errorMessage = `Failed to restore session: ${error instanceof Error ? error.message : 'Unknown error'}`;
        get().setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    
    deletePersistedSession: async (sessionId): Promise<void> => {
      try {
        await sessionManager.deleteSession(sessionId);
        
        // Clear current session if it was deleted
        const state = get();
        if (state.session?.id === sessionId) {
          set({
            session: null,
            messages: [],
            contextFiles: new Map(),
          });
        }
      } catch (error) {
        const errorMessage = `Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`;
        get().setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    
    // -------------------------------------------------------------------------
    // Auto-Save Management
    // -------------------------------------------------------------------------
    
    enableAutoSave: (intervalMs = 30000): void => {
      sessionManager.enableAutoSave({
        enabled: true,
        intervalMs,
        maxRetries: 3,
      });
    },
    
    disableAutoSave: (): void => {
      sessionManager.disableAutoSave();
    },
    
    isAutoSaveEnabled: (): boolean => {
      return sessionManager.isAutoSaveEnabled();
    },
    
    // -------------------------------------------------------------------------
    // Session Manager Access
    // -------------------------------------------------------------------------
    
    getSessionManager: (): ISessionManager => {
      return sessionManager;
    },
  });
}

/**
 * Creates a debounced save function for automatic persistence.
 * 
 * @param sessionManager - SessionManager instance
 * @param saveDebounceMs - Debounce delay in milliseconds
 * @returns Debounced save function
 */
export function createDebouncedSave(
  sessionManager: ISessionManager,
  saveDebounceMs = 1000
): (session: Session | null, onError?: (error: Error) => void) => void {
  let saveTimeout: NodeJS.Timeout | null = null;
  
  return (session: Session | null, onError?: (error: Error) => void): void => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    if (!session) {
      return;
    }
    
    saveTimeout = setTimeout(async () => {
      try {
        await sessionManager.saveSession(session);
      } catch (error) {
        console.error('Failed to save session:', error);
        if (onError && error instanceof Error) {
          onError(error);
        }
      }
    }, saveDebounceMs);
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a SessionManager instance with default configuration.
 * 
 * @returns Configured SessionManager instance
 */
export function createDefaultSessionManager(): SessionManager {
  return new SessionManager();
}

/**
 * Creates session persistence configuration with sensible defaults.
 * 
 * @param overrides - Configuration overrides
 * @returns Session persistence configuration
 */
export function createSessionPersistenceConfig(
  overrides: Partial<SessionPersistenceConfig> = {}
): SessionPersistenceConfig {
  return {
    sessionManager: createDefaultSessionManager(),
    enableAutoSave: true,
    autoSaveIntervalMs: 30000, // 30 seconds
    autoRestore: true,
    saveDebounceMs: 1000, // 1 second
    ...overrides,
  };
}