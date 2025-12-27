/**
 * @fileoverview Command system types and interfaces
 * @module features/commands/types
 */

import type { SessionId, SessionMetadata } from '../../shared/types/index.js';

// =============================================================================
// COMMAND INTERFACES
// =============================================================================

/**
 * Base command context passed to all command handlers.
 */
export interface CommandContext {
  /** Add a message to the conversation */
  addMessage: (message: { role: 'user' | 'assistant' | 'system'; content: string }) => void;
  
  /** Set error state */
  setError: (error: string | null) => void;
  
  /** Show confirmation dialog */
  showConfirmation: (message: string, details?: string) => Promise<boolean>;
  
  /** Get current workspace root */
  workspaceRoot: string;
  
  /** Get current model */
  currentModel: string;
  
  /** Session management actions */
  sessionActions: {
    createNewSession: (model: string) => void;
    restoreSession: (sessionId: SessionId) => Promise<void>;
    saveCurrentSession: () => Promise<void>;
    getSessionManager: () => any; // SessionManager type
  };
}

/**
 * Command handler function signature.
 */
export type CommandHandler = (
  args: string[],
  context: CommandContext
) => Promise<void> | void;

/**
 * Command definition with metadata.
 */
export interface CommandDefinition {
  /** Command name (without slash) */
  name: string;
  
  /** Command description for help */
  description: string;
  
  /** Usage example */
  usage: string;
  
  /** Command handler function */
  handler: CommandHandler;
  
  /** Whether command requires confirmation */
  requiresConfirmation?: boolean;
  
  /** Command aliases */
  aliases?: string[];
}

// =============================================================================
// SESSION COMMAND TYPES
// =============================================================================

/**
 * Options for session listing display.
 */
export interface SessionListDisplayOptions {
  /** Maximum number of sessions to show */
  maxSessions?: number;
  
  /** Whether to show detailed information */
  showDetails?: boolean;
  
  /** Whether to show session previews */
  showPreviews?: boolean;
  
  /** Sort order */
  sortBy?: 'created' | 'lastModified' | 'messageCount';
  
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Options for session search display.
 */
export interface SessionSearchDisplayOptions extends SessionListDisplayOptions {
  /** Whether to highlight search matches */
  highlightMatches?: boolean;
  
  /** Maximum length of match context */
  contextLength?: number;
}

/**
 * Options for session filtering display.
 */
export interface SessionFilterDisplayOptions extends SessionListDisplayOptions {
  /** Filter criteria to display */
  showFilterCriteria?: boolean;
}

// =============================================================================
// COMMAND RESULT TYPES
// =============================================================================

/**
 * Result of a command execution.
 */
export interface CommandResult {
  /** Whether command executed successfully */
  success: boolean;
  
  /** Result message to display */
  message?: string;
  
  /** Error message if failed */
  error?: string;
  
  /** Additional data returned by command */
  data?: any;
}

/**
 * Result of session restoration command.
 */
export interface SessionRestoreResult extends CommandResult {
  /** Restored session metadata */
  session?: SessionMetadata;
  
  /** Missing context files */
  missingFiles?: string[];
  
  /** Warnings during restoration */
  warnings?: string[];
}

/**
 * Result of session list command.
 */
export interface SessionListResult extends CommandResult {
  /** Listed sessions */
  sessions?: SessionMetadata[];
  
  /** Total number of sessions available */
  totalCount?: number;
  
  /** Whether results were truncated */
  truncated?: boolean;
}

/**
 * Result of session search command.
 */
export interface SessionSearchResult extends CommandResult {
  /** Search results with relevance scores */
  results?: Array<{
    session: SessionMetadata;
    relevanceScore: number;
    matches: Array<{
      type: string;
      text: string;
      context: string;
    }>;
  }>;
  
  /** Search query used */
  query?: string;
  
  /** Number of total matches found */
  totalMatches?: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

// All types are already exported inline above