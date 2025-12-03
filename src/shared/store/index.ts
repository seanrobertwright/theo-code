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

// =============================================================================
// STATE INTERFACE
// =============================================================================

/**
 * Application state interface.
 */
export interface AppState {
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

  // -------------------------------------------------------------------------
  // Context State
  // -------------------------------------------------------------------------

  /** Files loaded into context (path -> content) */
  contextFiles: Map<string, string>;

  /** Absolute path to workspace root */
  workspaceRoot: string;

  /** Current model identifier */
  currentModel: string;

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

  // General actions
  setWorkspaceRoot: (path: string) => void;
  setCurrentModel: (model: string) => void;
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
  | 'setError'
  | 'reset'
> = {
  session: null,
  messages: [],
  isStreaming: false,
  streamingText: '',
  pendingToolCalls: [],
  error: null,
  contextFiles: new Map(),
  workspaceRoot: process.cwd(),
  currentModel: 'gpt-4o',
};

// =============================================================================
// STORE CREATION
// =============================================================================

/**
 * Main application store.
 *
 * @example
 * ```typescript
 * // In a React component
 * const messages = useAppStore((state) => state.messages);
 * const addMessage = useAppStore((state) => state.addMessage);
 *
 * // Add a user message
 * addMessage({ role: 'user', content: 'Hello!' });
 * ```
 */
export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // -------------------------------------------------------------------------
    // Session Actions
    // -------------------------------------------------------------------------

    setSession: (session): void => {
      set({ session });
    },

    createNewSession: (model): Session => {
      const now = Date.now();
      const session: Session = {
        id: createSessionId(),
        created: now,
        lastModified: now,
        model,
        tokenCount: { total: 0, input: 0, output: 0 },
        filesAccessed: [],
        messages: [],
        contextFiles: [],
        workspaceRoot: get().workspaceRoot,
      };
      set({ session, messages: [], contextFiles: new Map() });
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

      set({
        session: {
          ...session,
          tokenCount: updatedTokenCount,
          lastModified: Date.now(),
        },
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

      set((state) => ({
        messages: [...state.messages, message],
        session: state.session
          ? {
              ...state.session,
              messages: [...state.session.messages, message],
              lastModified: Date.now(),
            }
          : null,
      }));

      return message;
    },

    updateMessage: (id, updates): void => {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, ...updates } : msg
        ),
        session: state.session
          ? {
              ...state.session,
              messages: state.session.messages.map((msg) =>
                msg.id === id ? { ...msg, ...updates } : msg
              ),
              lastModified: Date.now(),
            }
          : null,
      }));
    },

    deleteMessage: (id): void => {
      set((state) => ({
        messages: state.messages.filter((msg) => msg.id !== id),
        session: state.session
          ? {
              ...state.session,
              messages: state.session.messages.filter((msg) => msg.id !== id),
              lastModified: Date.now(),
            }
          : null,
      }));
    },

    clearMessages: (): void => {
      set((state) => ({
        messages: [],
        session: state.session
          ? {
              ...state.session,
              messages: [],
              lastModified: Date.now(),
            }
          : null,
      }));
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

        return {
          contextFiles: newContextFiles,
          session: state.session
            ? {
                ...state.session,
                contextFiles: contextFilesList,
                filesAccessed: [
                  ...new Set([...state.session.filesAccessed, path]),
                ],
                lastModified: Date.now(),
              }
            : null,
        };
      });
    },

    removeContextFile: (path): void => {
      set((state) => {
        const newContextFiles = new Map(state.contextFiles);
        newContextFiles.delete(path);

        return {
          contextFiles: newContextFiles,
          session: state.session
            ? {
                ...state.session,
                contextFiles: Array.from(newContextFiles.keys()),
                lastModified: Date.now(),
              }
            : null,
        };
      });
    },

    clearContextFiles: (): void => {
      set((state) => ({
        contextFiles: new Map(),
        session: state.session
          ? {
              ...state.session,
              contextFiles: [],
              lastModified: Date.now(),
            }
          : null,
      }));
    },

    // -------------------------------------------------------------------------
    // General Actions
    // -------------------------------------------------------------------------

    setWorkspaceRoot: (path): void => {
      set({ workspaceRoot: path });
    },

    setCurrentModel: (model): void => {
      set((state) => ({
        currentModel: model,
        session: state.session
          ? {
              ...state.session,
              model,
              lastModified: Date.now(),
            }
          : null,
      }));
    },

    setError: (error): void => {
      set({ error });
    },

    reset: (): void => {
      set({
        ...initialState,
        contextFiles: new Map(),
      });
    },
  }))
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
