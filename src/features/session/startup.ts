/**
 * @fileoverview Session restoration utilities for app startup
 * @module features/session/startup
 *
 * Provides utilities for detecting and restoring sessions on application startup,
 * enabling seamless continuation of previous work sessions with comprehensive
 * validation, error recovery, and cleanup reporting.
 */

import type { SessionId, SessionMetadata } from '../../shared/types/index.js';
import type { ISessionManager } from './manager.js';
import type { ISafeSessionManager, SafeDetectionResult, SafeRestorationResult } from './safe-session-manager.js';
import { createSafeSessionManager } from './safe-session-manager.js';
import { logger } from '../../shared/utils/logger.js';

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
 * Result of session detection with validation and cleanup information.
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
  
  /** Validation and cleanup information */
  validationInfo?: {
    /** Number of invalid sessions found and cleaned up */
    invalidSessionsRemoved: number;
    /** Whether cleanup was performed during detection */
    cleanupPerformed: boolean;
    /** Warnings generated during validation */
    warnings: string[];
  };
}

/**
 * Result of session restoration with comprehensive error handling.
 */
export interface SessionRestorationResult {
  /** Whether the restoration was successful */
  success: boolean;
  
  /** The restored session, if successful */
  session?: any;
  
  /** Context files that were found */
  contextFilesFound: string[];
  
  /** Context files that were missing */
  contextFilesMissing: string[];
  
  /** Error message if restoration failed */
  error?: string;
  
  /** Available recovery options if restoration failed */
  recoveryOptions?: Array<{
    type: string;
    description: string;
    sessionId?: SessionId;
  }>;
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
 * Detects available sessions on startup with comprehensive validation and cleanup.
 * 
 * Scans the session storage, validates session integrity, performs cleanup of
 * invalid sessions, and returns information about available sessions that can
 * be restored, sorted by recency.
 * 
 * @param sessionManager - SessionManager instance (will be wrapped in SafeSessionManager if needed)
 * @param options - Detection options
 * @returns Promise resolving to detection result with validation information
 */
export async function detectAvailableSessions(
  sessionManager: ISessionManager | ISafeSessionManager,
  options: SessionDetectionOptions = {}
): Promise<SessionDetectionResult> {
  const {
    maxRecentSessions = 10,
    recentThresholdMs = 7 * 24 * 60 * 60 * 1000, // 7 days
  } = options;
  
  try {
    // Ensure we have a safe session manager
    const safeManager: ISafeSessionManager = 'detectAvailableSessionsSafely' in sessionManager
      ? sessionManager as ISafeSessionManager
      : createSafeSessionManager();

    logger.info('Starting session detection with validation and cleanup');

    // Perform safe detection with validation and cleanup
    const safeDetectionResult: SafeDetectionResult = await safeManager.detectAvailableSessionsSafely();
    
    // Filter for recent sessions
    const now = Date.now();
    const recentSessions = safeDetectionResult.validSessions
      .filter(session => (now - session.lastModified) <= recentThresholdMs)
      .sort((a, b) => b.lastModified - a.lastModified) // Sort by most recent first
      .slice(0, maxRecentSessions);
    
    const result: SessionDetectionResult = {
      hasAvailableSessions: safeDetectionResult.validSessions.length > 0,
      recentSessions,
      mostRecentSession: recentSessions[0] ?? null,
      totalSessionCount: safeDetectionResult.validSessions.length,
      validationInfo: {
        invalidSessionsRemoved: safeDetectionResult.invalidSessions.length,
        cleanupPerformed: safeDetectionResult.cleanupPerformed,
        warnings: safeDetectionResult.warnings,
      },
    };

    logger.info(`Session detection completed: ${result.totalSessionCount} valid sessions, ${result.validationInfo?.invalidSessionsRemoved || 0} invalid sessions removed`);
    
    if (result.validationInfo?.warnings && result.validationInfo.warnings.length > 0) {
      logger.warn(`Session detection warnings: ${result.validationInfo.warnings.join('; ')}`);
    }

    return result;
  } catch (error) {
    logger.error('Failed to detect available sessions:', error);
    return {
      hasAvailableSessions: false,
      recentSessions: [],
      mostRecentSession: null,
      totalSessionCount: 0,
      validationInfo: {
        invalidSessionsRemoved: 0,
        cleanupPerformed: false,
        warnings: [`Detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      },
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
  detectionResult: SessionDetectionResult,
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
 * Restores a session on startup with comprehensive error handling and recovery options.
 * 
 * Loads the specified session with validation, provides detailed information about
 * the restoration including context file status, and offers recovery options if
 * restoration fails.
 * 
 * @param sessionManager - SessionManager instance (will be wrapped in SafeSessionManager if needed)
 * @param sessionId - Session identifier to restore
 * @returns Promise resolving to restoration result with recovery information
 */
export async function restoreSessionOnStartup(
  sessionManager: ISessionManager | ISafeSessionManager,
  sessionId: SessionId
): Promise<SessionRestorationResult> {
  try {
    // Ensure we have a safe session manager
    const safeManager: ISafeSessionManager = 'restoreSessionSafely' in sessionManager
      ? sessionManager as ISafeSessionManager
      : createSafeSessionManager();

    logger.info(`Starting session restoration: ${sessionId}`);

    // Perform safe restoration with error handling
    const safeRestorationResult: SafeRestorationResult = await safeManager.restoreSessionSafely(sessionId);
    
    if (safeRestorationResult.success && safeRestorationResult.session) {
      const result: SessionRestorationResult = {
        success: true,
        session: safeRestorationResult.session,
        contextFilesFound: safeRestorationResult.contextFilesStatus?.found || [],
        contextFilesMissing: safeRestorationResult.contextFilesStatus?.missing || [],
      };

      logger.info(`Session restoration successful: ${sessionId}`);
      
      if (result.contextFilesMissing.length > 0) {
        logger.warn(`Session restored with ${result.contextFilesMissing.length} missing context files: ${result.contextFilesMissing.join(', ')}`);
      }

      return result;
    } else {
      // Restoration failed, provide recovery options
      const recoveryOptions = safeRestorationResult.recoveryOptions?.map(option => ({
        type: option.type,
        description: option.description,
        // sessionId is optional, so we can omit it when undefined
        ...(option.type === 'select-different' ? {} : {})
      })) || [];

      const errorMessage = safeRestorationResult.error?.message || 'Session restoration failed';
      
      logger.error(`Session restoration failed: ${sessionId} - ${errorMessage}`);
      
      const result: SessionRestorationResult = {
        success: false,
        contextFilesFound: [],
        contextFilesMissing: [],
        error: errorMessage,
        recoveryOptions,
      };

      return result;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Session restoration error: ${sessionId} - ${errorMessage}`);
    
    return {
      success: false,
      contextFilesFound: [],
      contextFilesMissing: [],
      error: errorMessage,
      recoveryOptions: [
        {
          type: 'create_new',
          description: 'Create a new session',
        },
        {
          type: 'try_recent',
          description: 'Try restoring a different recent session',
        },
      ],
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
  metadata: SessionMetadata,
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
function formatTimeAgo(timestamp: number): string {
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

// =============================================================================
// STARTUP INITIALIZATION
// =============================================================================

/**
 * Result of startup initialization with comprehensive reporting.
 */
export interface StartupInitializationResult {
  /** Whether initialization was successful */
  success: boolean;
  
  /** Summary message describing the initialization result */
  summary: string;
  
  /** Detailed operation log */
  operationLog: string[];
  
  /** Session system health information */
  systemHealth: {
    /** Whether the session index is healthy */
    indexHealthy: boolean;
    /** Total number of valid sessions */
    validSessions: number;
    /** Number of issues found and resolved */
    issuesResolved: number;
    /** Whether cleanup was performed */
    cleanupPerformed: boolean;
  };
  
  /** Any warnings or non-critical issues */
  warnings: string[];
  
  /** Any errors encountered */
  errors: string[];
}

/**
 * Performs comprehensive session system startup initialization.
 * 
 * This function combines integrity checking, validation, cleanup, and reporting
 * to ensure the session system is in a healthy state at application startup.
 * 
 * @param sessionManager - SessionManager instance (will be wrapped in SafeSessionManager if needed)
 * @returns Promise resolving to initialization result with comprehensive reporting
 */
export async function performStartupInitialization(
  sessionManager?: ISessionManager | ISafeSessionManager
): Promise<StartupInitializationResult> {
  const result: StartupInitializationResult = {
    success: false,
    summary: '',
    operationLog: [],
    systemHealth: {
      indexHealthy: false,
      validSessions: 0,
      issuesResolved: 0,
      cleanupPerformed: false,
    },
    warnings: [],
    errors: [],
  };

  try {
    result.operationLog.push('Starting session system initialization...');
    logger.info('Starting session system startup initialization');

    // Create or use provided safe session manager
    const safeManager: ISafeSessionManager = sessionManager && 'detectAvailableSessionsSafely' in sessionManager
      ? sessionManager as ISafeSessionManager
      : createSafeSessionManager();

    // Perform startup initialization (cast to implementation to access method)
    const initSuccess = await (safeManager as any).performStartupInitialization();
    
    if (!initSuccess) {
      result.errors.push('Safe session manager initialization failed');
      result.operationLog.push('ERROR: Safe session manager initialization failed');
      logger.error('Safe session manager initialization failed');
    } else {
      result.operationLog.push('Safe session manager initialization completed');
      logger.info('Safe session manager initialization completed');
    }

    // Perform session detection to get current system state
    result.operationLog.push('Detecting available sessions...');
    const detectionResult = await detectAvailableSessions(safeManager);
    
    result.systemHealth.validSessions = detectionResult.totalSessionCount;
    result.systemHealth.cleanupPerformed = detectionResult.validationInfo?.cleanupPerformed || false;
    result.systemHealth.issuesResolved = detectionResult.validationInfo?.invalidSessionsRemoved || 0;
    result.systemHealth.indexHealthy = detectionResult.hasAvailableSessions || detectionResult.totalSessionCount === 0;

    // Add validation warnings to result
    if (detectionResult.validationInfo?.warnings) {
      result.warnings.push(...detectionResult.validationInfo.warnings);
    }

    result.operationLog.push(`Session detection completed: ${result.systemHealth.validSessions} valid sessions found`);
    
    if (result.systemHealth.issuesResolved > 0) {
      result.operationLog.push(`Resolved ${result.systemHealth.issuesResolved} session integrity issues`);
      logger.info(`Resolved ${result.systemHealth.issuesResolved} session integrity issues during startup`);
    }

    if (result.systemHealth.cleanupPerformed) {
      result.operationLog.push('Session cleanup was performed during initialization');
      logger.info('Session cleanup was performed during startup initialization');
    }

    // Determine overall success
    result.success = initSuccess && result.errors.length === 0;
    
    // Generate summary
    if (result.success) {
      if (result.systemHealth.issuesResolved > 0) {
        result.summary = `Session system initialized successfully. Found and resolved ${result.systemHealth.issuesResolved} issues. ${result.systemHealth.validSessions} valid sessions available.`;
      } else {
        result.summary = `Session system initialized successfully. ${result.systemHealth.validSessions} valid sessions available.`;
      }
    } else {
      result.summary = `Session system initialization encountered ${result.errors.length} errors. System may not be fully functional.`;
    }

    result.operationLog.push(`Initialization completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    logger.info(`Session system startup initialization completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Initialization failed: ${errorMessage}`);
    result.operationLog.push(`FATAL ERROR: ${errorMessage}`);
    result.summary = `Session system initialization failed: ${errorMessage}`;
    result.success = false;
    
    logger.error(`Session system startup initialization failed: ${errorMessage}`);
  }

  return result;
}