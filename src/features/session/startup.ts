/**
 * @fileoverview Session restoration utilities for app startup
 * @module features/session/startup
 *
 * Provides utilities for detecting and restoring sessions on application startup,
 * enabling seamless continuation of previous work sessions.
 */

import type { SessionId, SessionMetadata } from '../../shared/types/index.js';
import type { ISessionManager } from './manager.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Options for session detection on startup.
 */
export interface SessionDetectionOptions {
  /** Maximum number of recent sessions to show */
  maxRecentSessions?: number;
  
  /** Whether to automatically restore the most recent session */
  autoRestoreMostRecent?: boolean;
  
  /** Minimum age in milliseconds for a session to be considered "recent" */
  recentThresholdMs?: number;
}

/**
 * Result of session detection.
 */
export interface SessionDetectionResult {
  /** Whether any sessions were found */
  hasAvailableSessions: boolean;
  
  /** List of recent sessions sorted by lastModified (newest first) */
  recentSessions: SessionMetadata[];
  
  /** Most recently modified session, if any */
  mostRecentSession: SessionMetadata | null;
  
  /** Total number of available sessions */
  totalSessionCount: number;
}

/**
 * Options for session restoration prompt.
 */
export interface SessionRestorationPromptOptions {
  /** Session metadata to display */
  session: SessionMetadata;
  
  /** Whether to show detailed information */
  showDetails?: boolean;
}

// =============================================================================
// SESSION DETECTION
// =============================================================================

/**
 * Detects available sessions on startup.
 * 
 * Scans the session storage and returns information about available sessions
 * that can be restored, sorted by recency.
 * 
 * @param sessionManager - SessionManager instance
 * @param options - Detection options
 * @returns Promise resolving to detection result
 */
export async function detectAvailableSessions(
  _sessionManager: ISessionManager,
  options: SessionDetectionOptions = {}
): Promise<SessionDetectionResult> {
  const {
    maxRecentSessions = 10,
    recentThresholdMs = 7 * 24 * 60 * 60 * 1000, // 7 days
  } = options;
  
  try {
    // Get all sessions from storage
    const allSessions = await sessionManager.listSessions();
    
    // Filter for recent sessions
    const now = Date.now();
    const recentSessions = allSessions
      .filter(session => (now - session.lastModified) <= recentThresholdMs)
      .sort((a, b) => b.lastModified - a.lastModified) // Sort by most recent first
      .slice(0, maxRecentSessions);
    
    return {
      hasAvailableSessions: allSessions.length > 0,
      recentSessions,
      mostRecentSession: recentSessions[0] ?? null,
      totalSessionCount: allSessions.length,
    };
  } catch (error) {
    console.error('Failed to detect available sessions:', error);
    return {
      _hasAvailableSessions: false,
      recentSessions: [],
      _mostRecentSession: null,
      _totalSessionCount: 0,
    };
  }
}

/**
 * Checks if automatic session restoration should be performed.
 * 
 * @param detectionResult - Result from session detection
 * @param options - Detection options
 * @returns True if auto-restore should be performed
 */
export function shouldAutoRestore(
  _detectionResult: SessionDetectionResult,
  options: SessionDetectionOptions = {}
): boolean {
  const { autoRestoreMostRecent = false } = options;
  
  return (
    autoRestoreMostRecent &&
    detectionResult.hasAvailableSessions &&
    detectionResult.mostRecentSession !== null
  );
}

// =============================================================================
// SESSION RESTORATION
// =============================================================================

/**
 * Restores a session on startup.
 * 
 * Loads the specified session and returns information about the restoration,
 * including any missing context files.
 * 
 * @param sessionManager - SessionManager instance
 * @param sessionId - Session identifier to restore
 * @returns Promise resolving to restoration result
 */
export async function restoreSessionOnStartup(
  _sessionManager: ISessionManager,
  _sessionId: SessionId
): Promise<{
  success: boolean;
  session: any;
  contextFilesFound: string[];
  contextFilesMissing: string[];
  error?: string;
}> {
  try {
    const result = await sessionManager.restoreSessionWithContext(sessionId);
    
    return {
      _success: true,
      session: result.session,
      contextFilesFound: result.contextFilesFound,
      contextFilesMissing: result.contextFilesMissing,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to restore session on startup:', errorMessage);
    
    return {
      _success: false,
      _session: null,
      contextFilesFound: [],
      contextFilesMissing: [],
      _error: errorMessage,
    };
  }
}

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

/**
 * Formats a session metadata for display in the UI.
 * 
 * @param metadata - Session metadata
 * @param options - Formatting options
 * @returns Formatted session information
 */
export function formatSessionForDisplay(
  _metadata: SessionMetadata,
  options: { showDetails?: boolean } = {}
): {
  title: string;
  subtitle: string;
  details?: string[];
} {
  const { showDetails = false } = options;
  
  // Format timestamps
  const lastModified = new Date(metadata.lastModified);
  const created = new Date(metadata.created);
  
  // Calculate time ago
  const timeAgo = formatTimeAgo(metadata.lastModified);
  
  // Create title
  const title = metadata.title ?? `Session ${metadata.id.slice(0, 8)}`;
  
  // Create subtitle with key information
  const subtitle = `${metadata.model} • ${metadata.messageCount} messages • ${timeAgo}`;
  
  // Create detailed information if requested
  const details: string[] = [];
  if (showDetails) {
    details.push(`Created: ${created.toLocaleString()}`);
    details.push(`Last Modified: ${lastModified.toLocaleString()}`);
    details.push(`Workspace: ${metadata.workspaceRoot}`);
    details.push(`Tokens: ${metadata.tokenCount.total.toLocaleString()}`);
    
    if (metadata.contextFiles.length > 0) {
      details.push(`Context Files: ${metadata.contextFiles.length}`);
    }
    
    if (metadata.tags.length > 0) {
      details.push(`Tags: ${metadata.tags.join(', ')}`);
    }
    
    if (metadata.preview) {
      details.push(`Preview: ${metadata.preview}`);
    }
  }
  
  return {
    title,
    subtitle,
    ...(showDetails ? { details } : {}),
  };
}

/**
 * Formats a timestamp as a human-readable "time ago" string.
 * 
 * @param timestamp - Timestamp in milliseconds
 * @returns Formatted time ago string
 */
function formatTimeAgo(_timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''} ago`;
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else if (weeks > 0) {
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'just now';
  }
}

/**
 * Creates a preview text from session messages.
 * 
 * @param messages - Session messages
 * @param maxLength - Maximum preview length
 * @returns Preview text
 */
export function createSessionPreview(
  messages: any[],
  maxLength = 100
): string {
  // Find first user message
  const firstUserMessage = messages.find(m => m.role === 'user');
  
  if (!firstUserMessage) {
    return 'No messages';
  }
  
  // Extract text content
  let text = '';
  if (typeof firstUserMessage.content === 'string') {
    text = firstUserMessage.content;
  } else if (Array.isArray(firstUserMessage.content)) {
    const textBlocks = firstUserMessage.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text);
    text = textBlocks.join(' ');
  }
  
  // Truncate if needed
  if (text.length > maxLength) {
    return text.slice(0, maxLength) + '...';
  }
  
  return text;
}
