/**
 * @fileoverview Centralized application state management with Zustand
 * @module shared/store
 *
 * This store manages all application state including:
 * - Current session and message history
 * - UI state (streaming, pending operations)
 * - Context files loaded into the conversation
 * - Workspace configuration
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Message,
  MessageId,
  Session,
  SessionId,
  ToolCall,
  SessionTokenCount,
} from '../types/index.js';
import { createMessageId, createSessionId, MessageSchema } from '../types/index.js';
import { 
  createSessionPersistenceActions,
  createDebouncedSave,
  createDefaultSessionManager,
  type SessionPersistenceActions 
} from './session-integration.js';
import { loadConfig } from '../../config/index.js';

// =============================================================================
// STATE INTERFACE
// =============================================================================

/**
 * Application state interface with session persistence.
 */
export interface AppState extends SessionPersistenceActions {
  // -------------------------------------------------------------------------
  // Session State
  // -------------------------------------------------------------------------

  /** Current active session */
  session: Session | null;

  /** Message history for current session */
  messages: Message[];

  // -------------------------------------------------------------------------
  // UI State
  // -------------------------------------------------------------------------

  /** Whether the assistant is currently streaming a response */
  isStreaming: boolean;

  /** Accumulated streaming text (before message is complete) */
  streamingText: string;

  /** Tool calls waiting for execution/confirmation */
  pendingToolCalls: ToolCall[];

  /** Current error message, if any */
  error: string | null;

  /** Confirmation dialog state */
  confirmationDialog: {
    isVisible: boolean;
    message: string;
    details?: string;
    resolve?: (approved: boolean) => void;
  };

  // -------------------------------------------------------------------------
  // Context State
  // -------------------------------------------------------------------------

  /** Files loaded into context (path -> content) */
  contextFiles: Map<string, string>;

  /** Absolute path to workspace root */
  workspaceRoot: string;

  /** Current model identifier */
  currentModel: string;

  /** Current provider identifier */
  currentProvider: string;

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  // Session actions
  setSession: (session: Session | null) => void;
  createNewSession: (model: string) => Session;
  updateSessionTokens: (tokens: Partial<SessionTokenCount>) => void;

  // Message actions
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => Message;
  updateMessage: (id: MessageId, updates: Partial<Message>) => void;
  deleteMessage: (id: MessageId) => void;
  clearMessages: () => void;

  // Streaming actions
  setStreaming: (streaming: boolean) => void;
  appendStreamingText: (text: string) => void;
  clearStreamingText: () => void;

  // Tool actions
  addPendingToolCall: (toolCall: ToolCall) => void;
  removePendingToolCall: (toolCallId: string) => void;
  clearPendingToolCalls: () => void;

  // Context actions
  addContextFile: (path: string, content: string) => void;
  removeContextFile: (path: string) => void;
  clearContextFiles: () => void;

  // Confirmation actions
  showConfirmation: (message: string, details?: string) => Promise<boolean>;
  hideConfirmation: () => void;

  // General actions
  setWorkspaceRoot: (path: string) => void;
  setCurrentModel: (model: string) => void;
  setCurrentProvider: (provider: string) => void;
  switchProvider: (provider: string, model?: string) => Promise<void>;
  setError: (error: string | null) => void;
  reset: () => void;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: Omit<
  AppState,
  | 'setSession'
  | 'createNewSession'
  | 'updateSessionTokens'
  | 'addMessage'
  | 'updateMessage'
  | 'deleteMessage'
  | 'clearMessages'
  | 'setStreaming'
  | 'appendStreamingText'
  | 'clearStreamingText'
  | 'addPendingToolCall'
  | 'removePendingToolCall'
  | 'clearPendingToolCalls'
  | 'addContextFile'
  | 'removeContextFile'
  | 'clearContextFiles'
  | 'setWorkspaceRoot'
  | 'setCurrentModel'
  | 'setCurrentProvider'
  | 'switchProvider'
  | 'setError'
  | 'showConfirmation'
  | 'hideConfirmation'
  | 'reset'
  | 'saveCurrentSession'
  | 'loadSession'
  | 'restoreSession'
  | 'deletePersistedSession'
  | 'enableAutoSave'
  | 'disableAutoSave'
  | 'isAutoSaveEnabled'
  | 'getSessionManager'
> = {
  session: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  pendingToolCalls: [],
  error: null,
  confirmationDialog: {
    isVisible: false,
    message: '',
  },
  contextFiles: new Map(),
  workspaceRoot: process.cwd(),
  currentModel: 'gpt-4o',
  currentProvider: 'openai',
};

// =============================================================================
// STORE CREATION
// =============================================================================

// Create a single SessionManager instance to be shared across the store
const globalSessionManager = createDefaultSessionManager();

/**
 * Main application store with session persistence.
 *
 * @example
 * ```typescript
 * // In a React component
 * const messages = useAppStore((state) => state.messages);
 * const addMessage = useAppStore((state) => state.addMessage);
 *
 * // Add a user message
 * addMessage({ role: 'user', content: 'Hello!' });
 *
 * // Save current session
 * const saveSession = useAppStore((state) => state.saveCurrentSession);
 * await saveSession();
 * ```
 */
export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => {
    // Use the global SessionManager instance
    const sessionManager = globalSessionManager;
    
    // Create debounced save function
    const debouncedSave = createDebouncedSave(sessionManager, 1000);
    
    // Create session persistence actions
    const persistenceActions = createSessionPersistenceActions(sessionManager)(set, get);
    
    // Initialize auto-save if enabled
    const config = loadConfig(process.cwd());
    const sessionConfig = config.global.session;
    if (sessionConfig?.autoSaveInterval) {
      sessionManager.enableAutoSave({
        enabled: true,
        intervalMs: sessionConfig.autoSaveInterval,
        maxRetries: 3,
      });
    }
    
    return {
    ...initialState,

    // -------------------------------------------------------------------------
    // Session Actions
    // -------------------------------------------------------------------------

    setSession: (session): void => {
      set({ session });
      sessionManager.setCurrentSession(session);
      if (session) {
        // Trigger immediate save for session changes to ensure crash recovery
        debouncedSave(session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    createNewSession: (model): Session => {
      const now = Date.now();
      const currentProvider = get().currentProvider;
      const session: Session = {
        id: createSessionId(),
        version: '1.0.0',
        created: now,
        lastModified: now,
        model,
        provider: currentProvider,
        workspaceRoot: get().workspaceRoot,
        tokenCount: { total: 0, input: 0, output: 0 },
        filesAccessed: [],
        messages: [],
        contextFiles: [],
        tags: [],
      };
      set({ session, messages: [], contextFiles: new Map() });
      
      // Ensure SessionManager is synchronized with the new session
      sessionManager.setCurrentSession(session);
      
      // Trigger save for crash recovery
      debouncedSave(session, (error) => {
        get().setError(`Failed to save session: ${error.message}`);
      });
      
      return session;
    },

    updateSessionTokens: (tokens): void => {
      const { session } = get();
      if (session === null) {
        return;
      }

      const updatedTokenCount: SessionTokenCount = {
        total: tokens.total ?? session.tokenCount.total,
        input: tokens.input ?? session.tokenCount.input,
        output: tokens.output ?? session.tokenCount.output,
      };

      const updatedSession = {
        ...session,
        tokenCount: updatedTokenCount,
        lastModified: Date.now(),
      };

      set({ session: updatedSession });
      sessionManager.setCurrentSession(updatedSession);
      debouncedSave(updatedSession, (error) => {
        get().setError(`Failed to save session: ${error.message}`);
      });
    },

    // -------------------------------------------------------------------------
    // Message Actions
    // -------------------------------------------------------------------------

    addMessage: (messageData): Message => {
      const message = MessageSchema.parse({
        ...messageData,
        id: createMessageId(),
        timestamp: Date.now(),
      });

      const updatedMessages = [...get().messages, message];
      const currentSession = get().session;
      const updatedSession = currentSession ? {
        ...currentSession,
        messages: updatedMessages,
        lastModified: Date.now(),
      } : null;

      set({
        messages: updatedMessages,
        session: updatedSession,
      });

      if (updatedSession) {
        sessionManager.setCurrentSession(updatedSession);
        debouncedSave(updatedSession, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }

      return message;
    },

    updateMessage: (id, updates): void => {
      set((state) => {
        const updatedMessages = state.messages.map((msg) =>
          msg.id === id ? { ...msg, ...updates } : msg
        );
        const updatedSession = state.session
          ? {
              ...state.session,
              messages: updatedMessages,
              lastModified: Date.now(),
            }
          : null;

        return {
          messages: updatedMessages,
          session: updatedSession,
        };
      });

      // Trigger auto-save for message updates to ensure crash recovery
      const state = get();
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        debouncedSave(state.session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    deleteMessage: (id): void => {
      set((state) => {
        const updatedMessages = state.messages.filter((msg) => msg.id !== id);
        const updatedSession = state.session
          ? {
              ...state.session,
              messages: updatedMessages,
              lastModified: Date.now(),
            }
          : null;

        return {
          messages: updatedMessages,
          session: updatedSession,
        };
      });

      // Trigger auto-save for message deletions to ensure crash recovery
      const state = get();
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        debouncedSave(state.session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    clearMessages: (): void => {
      set((state) => {
        const updatedSession = state.session
          ? {
              ...state.session,
              messages: [],
              lastModified: Date.now(),
            }
          : null;

        return {
          messages: [],
          session: updatedSession,
        };
      });

      // Trigger auto-save for message clearing to ensure crash recovery
      const state = get();
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        debouncedSave(state.session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    // -------------------------------------------------------------------------
    // Streaming Actions
    // -------------------------------------------------------------------------

    setStreaming: (streaming): void => {
      set({ isStreaming: streaming });
    },

    appendStreamingText: (text): void => {
      set((state) => ({
        streamingText: state.streamingText + text,
      }));
    },

    clearStreamingText: (): void => {
      set({ streamingText: '' });
    },

    // -------------------------------------------------------------------------
    // Tool Actions
    // -------------------------------------------------------------------------

    addPendingToolCall: (toolCall): void => {
      set((state) => ({
        pendingToolCalls: [...state.pendingToolCalls, toolCall],
      }));
    },

    removePendingToolCall: (toolCallId): void => {
      set((state) => ({
        pendingToolCalls: state.pendingToolCalls.filter((tc) => tc.id !== toolCallId),
      }));
    },

    clearPendingToolCalls: (): void => {
      set({ pendingToolCalls: [] });
    },

    // -------------------------------------------------------------------------
    // Context Actions
    // -------------------------------------------------------------------------

    addContextFile: (path, content): void => {
      set((state) => {
        const newContextFiles = new Map(state.contextFiles);
        newContextFiles.set(path, content);

        const contextFilesList = Array.from(newContextFiles.keys());
        const updatedSession = state.session
          ? {
              ...state.session,
              contextFiles: contextFilesList,
              filesAccessed: [
                ...new Set([...state.session.filesAccessed, path]),
              ],
              lastModified: Date.now(),
            }
          : null;

        return {
          contextFiles: newContextFiles,
          session: updatedSession,
        };
      });

      // Trigger auto-save for context file changes to ensure crash recovery
      const state = get();
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        debouncedSave(state.session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    removeContextFile: (path): void => {
      set((state) => {
        const newContextFiles = new Map(state.contextFiles);
        newContextFiles.delete(path);

        const updatedSession = state.session
          ? {
              ...state.session,
              contextFiles: Array.from(newContextFiles.keys()),
              lastModified: Date.now(),
            }
          : null;

        return {
          contextFiles: newContextFiles,
          session: updatedSession,
        };
      });

      // Trigger auto-save for context file changes to ensure crash recovery
      const state = get();
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        debouncedSave(state.session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    clearContextFiles: (): void => {
      set((state) => {
        const updatedSession = state.session
          ? {
              ...state.session,
              contextFiles: [],
              lastModified: Date.now(),
            }
          : null;

        return {
          contextFiles: new Map(),
          session: updatedSession,
        };
      });

      // Trigger auto-save for context file changes to ensure crash recovery
      const state = get();
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        debouncedSave(state.session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    // -------------------------------------------------------------------------
    // General Actions
    // -------------------------------------------------------------------------

    setWorkspaceRoot: (path): void => {
      set({ workspaceRoot: path });
    },

    setCurrentModel: (model): void => {
      set((state) => {
        const updatedSession = state.session
          ? {
              ...state.session,
              model,
              lastModified: Date.now(),
            }
          : null;

        return {
          currentModel: model,
          session: updatedSession,
        };
      });

      // Trigger auto-save for model changes to ensure crash recovery
      const state = get();
      if (state.session) {
        sessionManager.setCurrentSession(state.session);
        debouncedSave(state.session, (error) => {
          get().setError(`Failed to save session: ${error.message}`);
        });
      }
    },

    setCurrentProvider: (provider): void => {
      set({ currentProvider: provider });
    },

    switchProvider: async (provider, model): Promise<void> => {
      try {
        const state = get();
        
        // Update current provider
        set({ currentProvider: provider });
        
        // If there's a current session, switch its provider
        if (state.session) {
          await sessionManager.switchProvider(provider, model);
          
          // Update the session in the store
          const updatedSession = {
            ...state.session,
            provider,
            model: model || state.session.model,
            lastModified: Date.now(),
          };
          
          set({ 
            session: updatedSession,
            currentModel: model || state.session.model,
          });
        } else if (model) {
          // Update current model if provided
          set({ currentModel: model });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to switch provider';
        get().setError(errorMessage);
      }
    },

    setError: (error): void => {
      set({ error });
    },

    // -------------------------------------------------------------------------
    // Confirmation Actions
    // -------------------------------------------------------------------------

    showConfirmation: (message, details): Promise<boolean> => {
      return new Promise((resolve) => {
        set({
          confirmationDialog: {
            isVisible: true,
            message,
            ...(details && { details }),
            resolve: (approved: boolean) => {
              resolve(approved);
            },
          },
        });
      });
    },

    hideConfirmation: (): void => {
      set({
        confirmationDialog: {
          isVisible: false,
          message: '',
        },
      });
    },

    reset: (): void => {
      set({
        ...initialState,
        contextFiles: new Map(),
      });
      sessionManager.setCurrentSession(null);
    },

    // -------------------------------------------------------------------------
    // Session Persistence Actions
    // -------------------------------------------------------------------------
    
    ...persistenceActions,
  };
  })
);

// =============================================================================
// SELECTORS
// =============================================================================

/**
 * Selector for total token count.
 */
export const selectTotalTokens = (state: AppState): number =>
  state.session?.tokenCount.total ?? 0;

/**
 * Selector for whether there are pending tool calls.
 */
export const selectHasPendingToolCalls = (state: AppState): boolean =>
  state.pendingToolCalls.length > 0;

/**
 * Selector for context file count.
 */
export const selectContextFileCount = (state: AppState): number =>
  state.contextFiles.size;

/**
 * Selector for message count.
 */
export const selectMessageCount = (state: AppState): number =>
  state.messages.length;

// =============================================================================
// EXPORTS
// =============================================================================

export type { SessionId, MessageId };

// UI Layout store
export {
  useUILayoutStore,
  selectContextAreaWidth,
  selectTaskSidebarCollapsed,
  selectColorScheme,
  selectLayoutConfig,
  selectScrollPositions,
  useLayoutDimensions,
  useResponsiveLayout,
  type UILayoutStore,
} from './ui-layout.js';
