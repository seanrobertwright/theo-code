/**
 * @fileoverview Enhanced SessionManager with safe operations for robustness
 * @module features/session/safe-session-manager
 *
 * Extends the base SessionManager with:
 * - Safe session detection that validates files before listing
 * - Safe restoration with comprehensive error handling
 * - Automatic cleanup of invalid session references
 * - Integration with validation and error recovery systems
 */

import type {
  Session,
  SessionId,
  SessionMetadata,
} from '../../shared/types/index.js';
import {
  SessionManager,
  type ISessionManager,
  type CreateSessionOptions,
  type LoadSessionOptions,
  type ListSessionsOptions,
  type SearchSessionsOptions,
  type FilterSessionsOptions,
  type SessionSearchResult,
  type CleanupOptions,
  type CleanupResult,
} from './manager.js';
import type { ISessionStorage } from './storage.js';
import { SessionValidator, type ISessionValidator } from './validation.js';
import { ErrorRecoverySystem, type IErrorRecoverySystem, type RecoveryOption } from './error-recovery.js';
import { logOperation } from './audit.js';
import { logger } from '../../shared/utils/logger.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Result of safe session detection operations.
 */
export interface SafeDetectionResult {
  /** Sessions that passed validation and are safe to use */
  validSessions: SessionMetadata[];
  /** Session IDs that failed validation */
  invalidSessions: SessionId[];
  /** Whether cleanup was performed during detection */
  cleanupPerformed: boolean;
  /** Warnings generated during detection */
  warnings: string[];
}

/**
 * Result of safe session restoration operations.
 */
export interface SafeRestorationResult {
  /** Whether the restoration was successful */
  success: boolean;
  /** The restored session (if successful) */
  session?: Session;
  /** Error that occurred (if unsuccessful) */
  error?: Error;
  /** Available recovery options (if restoration failed) */
  recoveryOptions?: RecoveryOption[];
  /** Status of context files */
  contextFilesStatus?: {
    found: string[];
    missing: string[];
  };
}

/**
 * Enhanced session manager interface with safe operations.
 */
export interface ISafeSessionManager extends ISessionManager {
  /**
   * Detects available sessions safely by validating files before listing.
   * 
   * @param options - Detection options
   * @returns Promise resolving to safe detection result
   */
  detectAvailableSessionsSafely(options?: ListSessionsOptions): Promise<SafeDetectionResult>;

  /**
   * Restores a session safely with comprehensive error handling.
   * 
   * @param sessionId - Session identifier to restore
   * @returns Promise resolving to safe restoration result
   */
  restoreSessionSafely(sessionId: SessionId): Promise<SafeRestorationResult>;

  /**
   * Performs automatic cleanup of invalid session references.
   * 
   * @returns Promise resolving to cleanup result
   */
  cleanupInvalidSessions(): Promise<CleanupResult>;

  /**
   * Gets the validation system instance.
   * 
   * @returns Session validator instance
   */
  getValidator(): ISessionValidator;

  /**
   * Gets the error recovery system instance.
   * 
   * @returns Error recovery system instance
   */
  getErrorRecovery(): IErrorRecoverySystem;

  /**
   * Performs startup initialization with integrity checking.
   * 
   * @returns Promise resolving to true if startup was successful
   */
  performStartupInitialization(): Promise<boolean>;
}

// =============================================================================
// SAFE SESSION MANAGER IMPLEMENTATION
// =============================================================================

/**
 * Enhanced SessionManager with safe operations for robustness.
 * 
 * Provides all the functionality of the base SessionManager plus:
 * - Safe session detection with validation
 * - Safe restoration with error recovery
 * - Automatic cleanup of invalid references
 * - Comprehensive error handling and logging
 */
export class SafeSessionManager extends SessionManager implements ISafeSessionManager {
  private readonly validator: ISessionValidator;
  private readonly errorRecovery: IErrorRecoverySystem;

  constructor(storage?: ISessionStorage) {
    super(storage);
    this.validator = new SessionValidator();
    this.errorRecovery = new ErrorRecoverySystem();
  }

  // -------------------------------------------------------------------------
  // Safe Operations
  // -------------------------------------------------------------------------

  /**
   * Detects available sessions safely by validating files before listing.
   * 
   * @param options - Detection options
   * @returns Promise resolving to safe detection result
   */
  async detectAvailableSessionsSafely(options: ListSessionsOptions = {}): Promise<SafeDetectionResult> {
    return await logOperation(
      'session.safe-detection',
      async () => {
        const result: SafeDetectionResult = {
          validSessions: [],
          invalidSessions: [],
          cleanupPerformed: false,
          warnings: [],
        };

        try {
          // First, get all sessions from the index - but catch errors safely
          let allSessions: SessionMetadata[] = [];
          try {
            allSessions = await super.listSessions(options);
          } catch (error: any) {
            logger.warn(`Failed to list sessions from index: ${error.message}`);
            result.warnings.push(`Failed to list sessions from index: ${error.message}`);
            return result; // Return empty result if we can't even read the index
          }
          
          if (allSessions.length === 0) {
            logger.info('No sessions found in index');
            return result;
          }

          logger.info(`Validating ${allSessions.length} sessions from index`);

          // Validate each session file
          const validationPromises = allSessions.map(async (sessionMetadata) => {
            try {
              const validationResult = await this.validator.validateSessionFile(sessionMetadata.id);
              
              if (validationResult.isValid) {
                return { sessionMetadata, isValid: true, error: null };
              } else {
                const errorMessage = validationResult.errors.join('; ');
                logger.warn(`Session ${sessionMetadata.id} failed validation: ${errorMessage}`);
                return { sessionMetadata, isValid: false, error: errorMessage };
              }
            } catch (error: any) {
              logger.error(`Error validating session ${sessionMetadata.id}: ${error.message}`);
              return { sessionMetadata, isValid: false, error: error.message };
            }
          });

          const validationResults = await Promise.allSettled(validationPromises);

          // Process validation results
          for (const promiseResult of validationResults) {
            if (promiseResult.status === 'fulfilled') {
              const { sessionMetadata, isValid, error } = promiseResult.value;
              
              if (isValid) {
                result.validSessions.push(sessionMetadata);
              } else {
                result.invalidSessions.push(sessionMetadata.id);
                if (error) {
                  result.warnings.push(`Session ${sessionMetadata.id}: ${error}`);
                }
              }
            } else {
              result.warnings.push(`Validation failed: ${promiseResult.reason}`);
            }
          }

          // Perform cleanup if invalid sessions were found
          if (result.invalidSessions.length > 0) {
            logger.info(`Found ${result.invalidSessions.length} invalid sessions, performing cleanup`);
            
            try {
              const cleanupResult = await this.validator.cleanupOrphanedEntries();
              result.cleanupPerformed = true;
              
              if (cleanupResult.errors.length > 0) {
                result.warnings.push(`Cleanup encountered ${cleanupResult.errors.length} errors`);
              }
              
              logger.info(`Cleanup completed: ${cleanupResult.orphanedEntriesRemoved} entries removed, ${cleanupResult.orphanedFilesProcessed} files processed`);
            } catch (cleanupError: any) {
              logger.error(`Cleanup failed: ${cleanupError.message}`);
              result.warnings.push(`Cleanup failed: ${cleanupError.message}`);
            }
          }

          logger.info(`Safe detection completed: ${result.validSessions.length} valid sessions, ${result.invalidSessions.length} invalid sessions`);

        } catch (error: any) {
          logger.error(`Safe session detection failed: ${error.message}`);
          result.warnings.push(`Detection failed: ${error.message}`);
        }

        return result;
      },
      undefined,
      {
        totalSessions: 0, // Will be filled by the operation
        validSessions: 0,
        invalidSessions: 0,
      }
    );
  }

  /**
   * Restores a session safely with comprehensive error handling.
   * 
   * @param sessionId - Session identifier to restore
   * @returns Promise resolving to safe restoration result
   */
  async restoreSessionSafely(sessionId: SessionId): Promise<SafeRestorationResult> {
    return await logOperation(
      'session.safe-restoration',
      async () => {
        const result: SafeRestorationResult = {
          success: false,
        };

        try {
          // Check if this session is known to be problematic
          if (this.errorRecovery.isSessionProblematic(sessionId)) {
            const error = new Error(`Session ${sessionId} is marked as problematic and cannot be restored`);
            result.error = error;
            
            // Get recovery options for problematic session
            const availableSessions = await this.detectAvailableSessionsSafely();
            result.recoveryOptions = this.errorRecovery.getRecoveryOptions({
              failedSessionId: sessionId,
              attemptCount: this.errorRecovery.getFailureRecord(sessionId)?.totalFailures || 0,
              totalFailures: this.errorRecovery.getFailureRecord(sessionId)?.totalFailures || 0,
              availableSessions: availableSessions.validSessions,
              lastError: error,
            });

            logger.warn(`Skipping restoration of problematic session: ${sessionId}`);
            return result;
          }

          // First, validate the session file
          const validationResult = await this.validator.validateSessionFile(sessionId);
          
          if (!validationResult.isValid) {
            const error = new Error(`Session validation failed: ${validationResult.errors.join('; ')}`);
            result.error = error;
            
            // Record the failure
            this.errorRecovery.recordFailure(sessionId, error);
            
            // Get recovery options
            const availableSessions = await this.detectAvailableSessionsSafely();
            result.recoveryOptions = this.errorRecovery.getRecoveryOptions({
              failedSessionId: sessionId,
              attemptCount: this.errorRecovery.getFailureRecord(sessionId)?.totalFailures || 1,
              totalFailures: this.errorRecovery.getFailureRecord(sessionId)?.totalFailures || 1,
              availableSessions: availableSessions.validSessions,
              lastError: error,
            });

            logger.error(`Session validation failed for ${sessionId}: ${error.message}`);
            return result;
          }

          // Attempt to load the session - but catch errors safely
          try {
            const session = await super.loadSession(sessionId, {
              validateIntegrity: true,
              updateTimestamp: true,
            });

            // Check context files status
            const contextFilesStatus = {
              found: [] as string[],
              missing: [] as string[],
            };

            // For now, assume all context files are found (this would be enhanced with actual file checking)
            contextFilesStatus.found = [...session.contextFiles];

            result.success = true;
            result.session = session;
            result.contextFilesStatus = contextFilesStatus;

            // Set as current session
            this.setCurrentSession(session);

            logger.info(`Session ${sessionId} restored successfully`);

          } catch (loadError: any) {
            result.error = loadError;
            
            // Record the failure
            this.errorRecovery.recordFailure(sessionId, loadError);
            
            // Get recovery options
            const availableSessions = await this.detectAvailableSessionsSafely();
            result.recoveryOptions = this.errorRecovery.getRecoveryOptions({
              failedSessionId: sessionId,
              attemptCount: this.errorRecovery.getFailureRecord(sessionId)?.totalFailures || 1,
              totalFailures: this.errorRecovery.getFailureRecord(sessionId)?.totalFailures || 1,
              availableSessions: availableSessions.validSessions,
              lastError: loadError,
            });

            logger.error(`Session loading failed for ${sessionId}: ${loadError.message}`);
          }

        } catch (error: any) {
          result.error = error;
          logger.error(`Safe session restoration failed for ${sessionId}: ${error.message}`);
        }

        return result;
      },
      sessionId,
      {
        success: false, // Will be updated by the operation
        hasRecoveryOptions: false,
      }
    );
  }

  /**
   * Performs automatic cleanup of invalid session references.
   * 
   * @returns Promise resolving to cleanup result
   */
  async cleanupInvalidSessions(): Promise<CleanupResult> {
    return await logOperation(
      'session.cleanup-invalid',
      async () => {
        logger.info('Starting automatic cleanup of invalid session references');

        // Perform startup integrity check which includes cleanup
        const integrityResult = await this.validator.performStartupIntegrityCheck();
        
        const result: CleanupResult = {
          deletedSessions: [],
          deletedByAge: 0,
          deletedByCount: 0,
          spaceFree: 0,
          errors: [],
        };

        if (integrityResult.cleanup) {
          // Map validation cleanup result to session cleanup result format
          result.deletedSessions = integrityResult.cleanup.cleanedSessions;
          result.deletedByCount = integrityResult.cleanup.orphanedEntriesRemoved + integrityResult.cleanup.orphanedFilesProcessed;
          
          // Estimate space freed (rough calculation)
          result.spaceFree = result.deletedSessions.length * 50000; // 50KB per session estimate

          // Map errors
          result.errors = integrityResult.cleanup.errors;

          logger.info(`Cleanup completed: ${result.deletedSessions.length} sessions cleaned, ~${Math.round(result.spaceFree / 1024)}KB freed`);
        } else {
          logger.info('No cleanup was needed - session index is healthy');
        }

        return result;
      },
      undefined,
      {
        integrityCheckSuccess: false, // Will be updated by the operation
        issuesFound: false,
        issuesResolved: false,
      }
    );
  }

  // -------------------------------------------------------------------------
  // Enhanced Session Operations
  // -------------------------------------------------------------------------

  /**
   * Lists sessions with automatic validation and cleanup.
   * 
   * @param options - Listing and filtering options
   * @returns Promise resolving to array of validated session metadata
   */
  async listSessions(options: ListSessionsOptions = {}): Promise<SessionMetadata[]> {
    const safeDetectionResult = await this.detectAvailableSessionsSafely(options);
    
    if (safeDetectionResult.warnings.length > 0) {
      logger.warn(`Session listing warnings: ${safeDetectionResult.warnings.join('; ')}`);
    }

    return safeDetectionResult.validSessions;
  }

  /**
   * Restores a session with enhanced error handling.
   * 
   * @param sessionId - Session identifier to restore
   * @returns Promise resolving to the restored session
   * @throws {Error} If restoration fails and no recovery options are available
   */
  async restoreSession(sessionId: SessionId): Promise<Session> {
    const safeResult = await this.restoreSessionSafely(sessionId);
    
    if (safeResult.success && safeResult.session) {
      return safeResult.session;
    }

    // If restoration failed, throw an error with recovery information
    const errorMessage = safeResult.error?.message || 'Session restoration failed';
    const recoveryInfo = safeResult.recoveryOptions 
      ? `Available recovery options: ${safeResult.recoveryOptions.map(opt => opt.type).join(', ')}`
      : 'No recovery options available';
    
    throw new Error(`${errorMessage}. ${recoveryInfo}`);
  }

  /**
   * Checks if a session exists and is valid.
   * 
   * @param sessionId - Session identifier to check
   * @returns Promise resolving to true if session exists and is valid
   */
  async sessionExists(sessionId: SessionId): Promise<boolean> {
    try {
      const validationResult = await this.validator.validateSessionFile(sessionId);
      return validationResult.isValid;
    } catch (error) {
      logger.warn(`Error checking session existence for ${sessionId}: ${error}`);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // System Access Methods
  // -------------------------------------------------------------------------

  /**
   * Gets the validation system instance.
   * 
   * @returns Session validator instance
   */
  getValidator(): ISessionValidator {
    return this.validator;
  }

  /**
   * Gets the error recovery system instance.
   * 
   * @returns Error recovery system instance
   */
  getErrorRecovery(): IErrorRecoverySystem {
    return this.errorRecovery;
  }

  // -------------------------------------------------------------------------
  // Startup and Maintenance Operations
  // -------------------------------------------------------------------------

  /**
   * Performs startup initialization with integrity checking.
   * 
   * @returns Promise resolving to true if startup was successful
   */
  async performStartupInitialization(): Promise<boolean> {
    try {
      logger.info('Performing session system startup initialization');

      // Perform integrity check
      const integrityResult = await this.validator.performStartupIntegrityCheck();
      
      if (!integrityResult.success) {
        logger.error(`Startup integrity check failed: ${integrityResult.summary}`);
        return false;
      }

      if (integrityResult.issuesFound && integrityResult.issuesResolved) {
        logger.info(`Startup integrity check resolved issues: ${integrityResult.summary}`);
      } else {
        logger.info(`Startup integrity check passed: ${integrityResult.summary}`);
      }

      // Reset error recovery tracking for a fresh start
      this.errorRecovery.resetFailureTracking();

      logger.info('Session system startup initialization completed successfully');
      return true;

    } catch (error: any) {
      logger.error(`Startup initialization failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Performs periodic maintenance operations.
   * 
   * @returns Promise resolving to maintenance summary
   */
  async performMaintenance(): Promise<{
    cleanupPerformed: boolean;
    sessionsProcessed: number;
    errorsEncountered: number;
    summary: string;
  }> {
    try {
      logger.info('Performing periodic session maintenance');

      // Clean up old failure records
      const cleanedRecords = this.errorRecovery.cleanupOldRecords();
      
      // Perform session cleanup
      const cleanupResult = await this.cleanupInvalidSessions();
      
      const summary = `Maintenance completed: ${cleanupResult.deletedSessions.length} sessions cleaned, ${cleanedRecords} old failure records removed, ${cleanupResult.errors.length} errors encountered`;
      
      logger.info(summary);

      return {
        cleanupPerformed: cleanupResult.deletedSessions.length > 0,
        sessionsProcessed: cleanupResult.deletedSessions.length,
        errorsEncountered: cleanupResult.errors.length,
        summary,
      };

    } catch (error: any) {
      const errorSummary = `Maintenance failed: ${error.message}`;
      logger.error(errorSummary);
      
      return {
        cleanupPerformed: false,
        sessionsProcessed: 0,
        errorsEncountered: 1,
        summary: errorSummary,
      };
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new SafeSessionManager instance with default configuration.
 * 
 * @param storage - Optional storage implementation
 * @returns Configured SafeSessionManager instance
 */
export function createSafeSessionManager(storage?: ISessionStorage): ISafeSessionManager {
  return new SafeSessionManager(storage);
}