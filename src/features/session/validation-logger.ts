/**
 * @fileoverview Comprehensive logging and monitoring for session validation operations
 * @module features/session/validation-logger
 *
 * Provides structured logging for all validation operations including:
 * - Session file validation with detailed error reporting
 * - Cleanup operation logging with session counts
 * - Warning logs for missing files during validation
 * - Performance monitoring for validation operations
 * - Structured data for monitoring and debugging
 */

import { logger } from '../../shared/utils/logger.js';
import type { SessionId } from '../../shared/types/index.js';
import type { 
  SessionValidationResult, 
  SessionIndexValidationResult, 
  SessionCleanupResult,
  StartupIntegrityResult 
} from './validation.js';

// =============================================================================
// LOGGING INTERFACES
// =============================================================================

/**
 * Structured validation operation context for logging.
 */
export interface ValidationOperationContext {
  /** Operation type being performed */
  operation: 'file-validation' | 'index-validation' | 'cleanup' | 'startup-check' | 'backup-creation';
  /** Session ID being operated on (if applicable) */
  sessionId?: SessionId;
  /** Timestamp when operation started */
  startTime: number;
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Validation metrics for monitoring and performance tracking.
 */
export interface ValidationMetrics {
  /** Total validation operations performed */
  totalOperations: number;
  /** Number of successful validations */
  successfulValidations: number;
  /** Number of failed validations */
  failedValidations: number;
  /** Number of missing files detected */
  missingFilesDetected: number;
  /** Number of corrupted files detected */
  corruptedFilesDetected: number;
  /** Number of cleanup operations performed */
  cleanupOperationsPerformed: number;
  /** Total sessions cleaned up */
  totalSessionsCleaned: number;
  /** Average validation time in milliseconds */
  averageValidationTime: number;
  /** Last operation timestamp */
  lastOperationTime: number;
}

/**
 * Cleanup operation summary for detailed logging.
 */
export interface CleanupOperationSummary {
  /** Number of orphaned entries removed */
  orphanedEntriesRemoved: number;
  /** Number of orphaned files processed */
  orphanedFilesProcessed: number;
  /** Number of corrupted entries removed */
  corruptedEntriesRemoved: number;
  /** Total sessions affected */
  totalSessionsAffected: number;
  /** Operation duration in milliseconds */
  operationDuration: number;
  /** Whether backup was created */
  backupCreated: boolean;
  /** Backup file path (if created) */
  backupPath?: string;
  /** Errors encountered during cleanup */
  errorsEncountered: number;
  /** Warnings generated during cleanup */
  warningsGenerated: number;
}

// =============================================================================
// VALIDATION LOGGER CLASS
// =============================================================================

/**
 * Comprehensive logging system for session validation operations.
 * 
 * Provides structured logging, metrics tracking, and monitoring capabilities
 * for all session validation and cleanup operations.
 */
export class ValidationLogger {
  private metrics: ValidationMetrics;
  private readonly sessionLogger = logger.child('session-validation');

  constructor() {
    this.metrics = {
      totalOperations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      missingFilesDetected: 0,
      corruptedFilesDetected: 0,
      cleanupOperationsPerformed: 0,
      totalSessionsCleaned: 0,
      averageValidationTime: 0,
      lastOperationTime: 0,
    };
  }

  // =============================================================================
  // OPERATION LOGGING METHODS
  // =============================================================================

  /**
   * Logs the start of a validation operation.
   * 
   * @param context - Operation context
   */
  logOperationStart(context: ValidationOperationContext): void {
    this.sessionLogger.info(
      `Starting ${context.operation}${context.sessionId ? ` for session ${context.sessionId}` : ''}`,
      {
        operation: context.operation,
        sessionId: context.sessionId,
        startTime: context.startTime,
        metadata: context.metadata,
      }
    );
  }

  /**
   * Logs the completion of a validation operation.
   * 
   * @param context - Operation context
   * @param success - Whether the operation was successful
   * @param duration - Operation duration in milliseconds
   * @param details - Additional operation details
   */
  logOperationComplete(
    context: ValidationOperationContext,
    success: boolean,
    duration: number,
    details?: Record<string, unknown>
  ): void {
    const level = success ? 'info' : 'warn';
    const status = success ? 'completed' : 'failed';
    
    this.sessionLogger[level](
      `Operation ${context.operation} ${status} in ${duration}ms${context.sessionId ? ` for session ${context.sessionId}` : ''}`,
      {
        operation: context.operation,
        sessionId: context.sessionId,
        success,
        duration,
        details,
      }
    );

    // Update metrics
    this.updateMetrics(context.operation, success, duration);
  }

  // =============================================================================
  // SESSION FILE VALIDATION LOGGING
  // =============================================================================

  /**
   * Logs session file validation results with detailed information.
   * 
   * @param sessionId - Session identifier
   * @param result - Validation result
   * @param duration - Validation duration in milliseconds
   */
  logSessionFileValidation(
    sessionId: SessionId,
    result: SessionValidationResult,
    duration: number
  ): void {
    if (result.isValid) {
      this.sessionLogger.info(
        `Session file validation passed for ${sessionId}`,
        {
          sessionId,
          duration,
          fileExists: result.fileExists,
          isReadable: result.isReadable,
          hasValidStructure: result.hasValidStructure,
        }
      );
      this.metrics.successfulValidations++;
    } else {
      // Log specific validation failures
      if (!result.fileExists) {
        this.sessionLogger.warn(
          `Session file validation failed: ${sessionId} - file not found`,
          {
            sessionId,
            duration,
            reason: 'file-not-found',
            errors: result.errors,
            warnings: result.warnings,
          }
        );
        this.metrics.missingFilesDetected++;
      } else if (!result.isReadable) {
        this.sessionLogger.warn(
          `Session file validation failed: ${sessionId} - file not readable`,
          {
            sessionId,
            duration,
            reason: 'file-not-readable',
            errors: result.errors,
            warnings: result.warnings,
          }
        );
      } else if (!result.hasValidStructure) {
        this.sessionLogger.warn(
          `Session file validation failed: ${sessionId} - invalid structure`,
          {
            sessionId,
            duration,
            reason: 'invalid-structure',
            errors: result.errors,
            warnings: result.warnings,
          }
        );
        this.metrics.corruptedFilesDetected++;
      } else {
        this.sessionLogger.error(
          `Session file validation failed: ${sessionId} - unknown error`,
          {
            sessionId,
            duration,
            reason: 'unknown-error',
            errors: result.errors,
            warnings: result.warnings,
          }
        );
      }
      this.metrics.failedValidations++;
    }
  }

  // =============================================================================
  // INDEX VALIDATION LOGGING
  // =============================================================================

  /**
   * Logs session index validation results with comprehensive details.
   * 
   * @param result - Index validation result
   * @param duration - Validation duration in milliseconds
   */
  logIndexValidation(result: SessionIndexValidationResult, duration: number): void {
    if (result.isValid) {
      this.sessionLogger.info(
        `Session index validation passed: ${result.validSessions}/${result.totalSessions} sessions valid`,
        {
          duration,
          totalSessions: result.totalSessions,
          validSessions: result.validSessions,
          isValid: true,
        }
      );
    } else {
      this.sessionLogger.warn(
        `Session index validation found issues: ${result.orphanedEntries.length} orphaned entries, ${result.orphanedFiles.length} orphaned files, ${result.corruptedEntries.length} corrupted entries`,
        {
          duration,
          totalSessions: result.totalSessions,
          validSessions: result.validSessions,
          orphanedEntries: result.orphanedEntries.length,
          orphanedFiles: result.orphanedFiles.length,
          corruptedEntries: result.corruptedEntries.length,
          isValid: false,
        }
      );

      // Log specific orphaned entries
      if (result.orphanedEntries.length > 0) {
        this.sessionLogger.warn(
          `Found ${result.orphanedEntries.length} orphaned index entries (entries without files)`,
          {
            orphanedEntries: result.orphanedEntries,
            count: result.orphanedEntries.length,
          }
        );
      }

      // Log specific orphaned files
      if (result.orphanedFiles.length > 0) {
        this.sessionLogger.warn(
          `Found ${result.orphanedFiles.length} orphaned session files (files without index entries)`,
          {
            orphanedFiles: result.orphanedFiles,
            count: result.orphanedFiles.length,
          }
        );
      }

      // Log corrupted entries
      if (result.corruptedEntries.length > 0) {
        this.sessionLogger.warn(
          `Found ${result.corruptedEntries.length} corrupted index entries`,
          {
            corruptedEntries: result.corruptedEntries,
            count: result.corruptedEntries.length,
          }
        );
      }
    }
  }

  // =============================================================================
  // CLEANUP OPERATION LOGGING
  // =============================================================================

  /**
   * Logs cleanup operation results with detailed session counts and actions.
   * 
   * @param result - Cleanup operation result
   * @param duration - Cleanup duration in milliseconds
   * @param backupPath - Path to backup file (if created)
   */
  logCleanupOperation(
    result: SessionCleanupResult,
    duration: number,
    backupPath?: string
  ): void {
    const summary: CleanupOperationSummary = {
      orphanedEntriesRemoved: result.orphanedEntriesRemoved,
      orphanedFilesProcessed: result.orphanedFilesProcessed,
      corruptedEntriesRemoved: 0, // This would need to be tracked separately
      totalSessionsAffected: result.cleanedSessions.length,
      operationDuration: duration,
      backupCreated: !!backupPath,
      backupPath: backupPath || '',
      errorsEncountered: result.errors.length,
      warningsGenerated: result.warnings.length,
    };

    if (summary.totalSessionsAffected > 0) {
      this.sessionLogger.info(
        `Session cleanup completed: ${summary.orphanedEntriesRemoved} orphaned entries removed, ${summary.orphanedFilesProcessed} orphaned files processed, ${summary.totalSessionsAffected} sessions affected`,
        {
          duration,
          summary,
          cleanedSessions: result.cleanedSessions,
        }
      );

      // Log individual cleaned sessions
      for (const sessionId of result.cleanedSessions) {
        this.sessionLogger.info(
          `Session cleaned up: ${sessionId}`,
          {
            sessionId,
            operation: 'cleanup',
          }
        );
      }

      this.metrics.cleanupOperationsPerformed++;
      this.metrics.totalSessionsCleaned += summary.totalSessionsAffected;
    } else {
      this.sessionLogger.info(
        'Session cleanup completed: no cleanup actions needed',
        {
          duration,
          summary,
        }
      );
    }

    // Log errors if any occurred
    if (result.errors.length > 0) {
      this.sessionLogger.error(
        `Cleanup operation encountered ${result.errors.length} errors`,
        {
          errors: result.errors,
          errorCount: result.errors.length,
        }
      );
    }

    // Log warnings if any were generated
    if (result.warnings.length > 0) {
      this.sessionLogger.warn(
        `Cleanup operation generated ${result.warnings.length} warnings`,
        {
          warnings: result.warnings,
          warningCount: result.warnings.length,
        }
      );
    }

    // Log backup creation
    if (backupPath) {
      this.sessionLogger.info(
        `Index backup created before cleanup: ${backupPath}`,
        {
          backupPath,
          operation: 'backup-creation',
        }
      );
    }
  }

  // =============================================================================
  // STARTUP INTEGRITY CHECK LOGGING
  // =============================================================================

  /**
   * Logs startup integrity check results with comprehensive operation details.
   * 
   * @param result - Startup integrity check result
   * @param duration - Total check duration in milliseconds
   */
  logStartupIntegrityCheck(result: StartupIntegrityResult, duration: number): void {
    if (result.success) {
      this.sessionLogger.info(
        `Startup integrity check completed successfully: ${result.summary}`,
        {
          duration,
          success: true,
          issuesFound: result.issuesFound,
          issuesResolved: result.issuesResolved,
          validSessions: result.indexValidation.validSessions,
          totalSessions: result.indexValidation.totalSessions,
          backupCreated: !!result.backupPath,
        }
      );
    } else {
      this.sessionLogger.error(
        `Startup integrity check failed: ${result.summary}`,
        {
          duration,
          success: false,
          issuesFound: result.issuesFound,
          issuesResolved: result.issuesResolved,
          validSessions: result.indexValidation.validSessions,
          totalSessions: result.indexValidation.totalSessions,
        }
      );
    }

    // Log detailed operation log
    for (const logEntry of result.operationLog) {
      this.sessionLogger.debug(
        `Startup check: ${logEntry}`,
        {
          operation: 'startup-integrity-check',
          logEntry,
        }
      );
    }

    // Log cleanup details if cleanup was performed
    if (result.cleanup) {
      this.logCleanupOperation(result.cleanup, 0, result.backupPath);
    }
  }

  // =============================================================================
  // METRICS AND MONITORING
  // =============================================================================

  /**
   * Updates internal metrics based on operation results.
   * 
   * @param operation - Type of operation performed
   * @param success - Whether the operation was successful
   * @param duration - Operation duration in milliseconds
   */
  private updateMetrics(
    _operation: ValidationOperationContext['operation'],
    _success: boolean,
    duration: number
  ): void {
    this.metrics.totalOperations++;
    this.metrics.lastOperationTime = Date.now();

    // Update average validation time
    const totalTime = this.metrics.averageValidationTime * (this.metrics.totalOperations - 1) + duration;
    this.metrics.averageValidationTime = totalTime / this.metrics.totalOperations;
  }

  /**
   * Gets current validation metrics for monitoring.
   * 
   * @returns Current validation metrics
   */
  getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }

  /**
   * Logs current validation metrics summary.
   */
  logMetricsSummary(): void {
    this.sessionLogger.info(
      'Validation metrics summary',
      {
        metrics: this.metrics,
        successRate: this.metrics.totalOperations > 0 
          ? (this.metrics.successfulValidations / this.metrics.totalOperations * 100).toFixed(2) + '%'
          : '0%',
      }
    );
  }

  /**
   * Resets all metrics (useful for testing or periodic resets).
   */
  resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      missingFilesDetected: 0,
      corruptedFilesDetected: 0,
      cleanupOperationsPerformed: 0,
      totalSessionsCleaned: 0,
      averageValidationTime: 0,
      lastOperationTime: 0,
    };

    this.sessionLogger.info('Validation metrics reset');
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Creates a validation operation context for logging.
   * 
   * @param operation - Operation type
   * @param sessionId - Session ID (if applicable)
   * @param metadata - Additional metadata
   * @returns Validation operation context
   */
  createOperationContext(
    operation: ValidationOperationContext['operation'],
    sessionId?: SessionId,
    metadata?: Record<string, unknown>
  ): ValidationOperationContext {
    return {
      operation,
      sessionId: sessionId!,
      startTime: Date.now(),
      metadata: metadata || {},
    };
  }

  /**
   * Calculates operation duration from context.
   * 
   * @param context - Operation context
   * @returns Duration in milliseconds
   */
  calculateDuration(context: ValidationOperationContext): number {
    return Date.now() - context.startTime;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * Default validation logger instance.
 */
export const validationLogger = new ValidationLogger();