/**
 * @fileoverview Error recovery system for session restoration robustness
 * @module features/session/error-recovery
 *
 * Provides comprehensive error recovery mechanisms for session operations:
 * - Failure tracking for problematic sessions
 * - Retry limit enforcement with exponential backoff
 * - Recovery option generation based on error context
 * - Progressive recovery escalation strategies
 */

import type { SessionId, SessionMetadata } from '../../shared/types/index.js';
import { logger } from '../../shared/utils/logger.js';
import { 
  type IValidationConfigManager, 
  type ValidationRetryConfig,
  createValidationConfigManager 
} from './validation-config.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Individual failure attempt record.
 */
export interface FailureAttempt {
  /** Timestamp when the failure occurred */
  timestamp: number;
  /** Error message or description */
  error: string;
  /** Categorized error type */
  errorType: 'file-not-found' | 'corrupted' | 'permission-denied' | 'unknown';
  /** Whether recovery was attempted for this failure */
  recoveryAttempted: boolean;
}

/**
 * Complete failure record for a session.
 */
export interface SessionFailureRecord {
  /** Session identifier */
  sessionId: SessionId;
  /** Array of all failure attempts */
  failures: FailureAttempt[];
  /** Whether the session is currently blacklisted */
  isBlacklisted: boolean;
  /** Timestamp until which the session is blacklisted (if applicable) */
  blacklistedUntil?: number;
  /** Total number of failures recorded */
  totalFailures: number;
  /** Timestamp of the most recent failure */
  lastFailure: number;
}

/**
 * Context information for recovery option generation.
 */
export interface RecoveryContext {
  /** Session ID that failed */
  failedSessionId: SessionId;
  /** Number of attempts made for this session */
  attemptCount: number;
  /** Total number of failures across all sessions */
  totalFailures: number;
  /** List of available sessions that could be alternatives */
  availableSessions: SessionMetadata[];
  /** The most recent error that occurred */
  lastError: Error;
}

/**
 * Recovery option that can be presented to the user.
 */
export interface RecoveryOption {
  /** Type of recovery action */
  type: 'retry' | 'skip' | 'new-session' | 'select-different';
  /** Human-readable label for the option */
  label: string;
  /** Detailed description of what this option does */
  description: string;
  /** Function to execute when this option is selected */
  action: () => Promise<void>;
  /** Whether this option is recommended for the current context */
  isRecommended: boolean;
}

/**
 * Configuration for the error recovery system.
 */
export interface ErrorRecoveryConfig {
  /** Maximum number of retry attempts per session */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds for exponential backoff */
  maxDelayMs: number;
  /** Duration in milliseconds to blacklist a session after max retries */
  blacklistDurationMs: number;
  /** Whether to enable automatic cleanup of old failure records */
  enableAutoCleanup: boolean;
  /** Age in milliseconds after which failure records are cleaned up */
  cleanupAgeMs: number;
}

/**
 * Error recovery system interface.
 */
export interface IErrorRecoverySystem {
  /**
   * Records a failure for a specific session.
   * 
   * @param sessionId - Session that failed
   * @param error - Error that occurred
   */
  recordFailure(sessionId: SessionId, error: Error): void;

  /**
   * Checks if a session is currently problematic and should be avoided.
   * 
   * @param sessionId - Session to check
   * @returns True if the session should be skipped
   */
  isSessionProblematic(sessionId: SessionId): boolean;

  /**
   * Generates recovery options based on the current context.
   * 
   * @param context - Recovery context information
   * @returns Array of available recovery options
   */
  getRecoveryOptions(context: RecoveryContext): RecoveryOption[];

  /**
   * Determines if a session should be skipped based on failure history.
   * 
   * @param sessionId - Session to check
   * @returns True if the session should be skipped
   */
  shouldSkipSession(sessionId: SessionId): boolean;

  /**
   * Resets all failure tracking data.
   */
  resetFailureTracking(): void;

  /**
   * Gets the failure record for a specific session.
   * 
   * @param sessionId - Session to get record for
   * @returns Failure record or undefined if no failures recorded
   */
  getFailureRecord(sessionId: SessionId): SessionFailureRecord | undefined;

  /**
   * Gets the current configuration.
   * 
   * @returns Current error recovery configuration
   */
  getConfig(): ErrorRecoveryConfig;

  /**
   * Updates the configuration.
   * 
   * @param config - New configuration to apply
   */
  updateConfig(config: Partial<ErrorRecoveryConfig>): void;

  /**
   * Calculates the next retry delay for a session.
   * 
   * @param sessionId - Session to calculate delay for
   * @returns Delay in milliseconds, or -1 if max retries exceeded
   */
  calculateRetryDelay(sessionId: SessionId): number;

  /**
   * Cleans up old failure records based on configuration.
   * 
   * @returns Number of records cleaned up
   */
  cleanupOldRecords(): number;

  /**
   * Gets the validation configuration manager.
   * 
   * @returns Validation configuration manager
   */
  getValidationConfigManager(): IValidationConfigManager;

  /**
   * Updates the validation configuration manager.
   * 
   * @param configManager - New validation configuration manager
   */
  setValidationConfigManager(configManager: IValidationConfigManager): void;
}

// =============================================================================
// ERROR RECOVERY SYSTEM IMPLEMENTATION
// =============================================================================

/**
 * Comprehensive error recovery system implementation.
 * 
 * Tracks session failures, enforces retry limits with exponential backoff,
 * and provides contextual recovery options to help users handle errors gracefully.
 */
export class ErrorRecoverySystem implements IErrorRecoverySystem {
  private failureRecords: Map<SessionId, SessionFailureRecord> = new Map();
  private config: ErrorRecoveryConfig;
  private validationConfigManager: IValidationConfigManager;

  constructor(config?: Partial<ErrorRecoveryConfig>, validationConfigManager?: IValidationConfigManager) {
    this.validationConfigManager = validationConfigManager || createValidationConfigManager();
    
    // Use validation config to set defaults if no explicit config provided
    const validationRetryConfig = this.validationConfigManager.getRetryConfig();
    
    this.config = {
      maxRetries: validationRetryConfig.maxRetries,
      baseDelayMs: validationRetryConfig.baseDelayMs,
      maxDelayMs: validationRetryConfig.maxDelayMs,
      blacklistDurationMs: 5 * 60 * 1000, // 5 minutes
      enableAutoCleanup: true,
      cleanupAgeMs: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };
  }

  /**
   * Records a failure for a specific session.
   * 
   * @param sessionId - Session that failed
   * @param error - Error that occurred
   */
  recordFailure(sessionId: SessionId, error: Error): void {
    const now = Date.now();
    const errorType = this.categorizeError(error);

    let record = this.failureRecords.get(sessionId);
    if (!record) {
      record = {
        sessionId,
        failures: [],
        isBlacklisted: false,
        totalFailures: 0,
        lastFailure: now,
      };
      this.failureRecords.set(sessionId, record);
    }

    // Add the new failure
    const failure: FailureAttempt = {
      timestamp: now,
      error: error.message,
      errorType,
      recoveryAttempted: false,
    };

    record.failures.push(failure);
    record.totalFailures++;
    record.lastFailure = now;

    // Check if we should blacklist this session
    if (record.totalFailures >= this.config.maxRetries) {
      record.isBlacklisted = true;
      record.blacklistedUntil = now + this.config.blacklistDurationMs;
      logger.warn(`Session ${sessionId} blacklisted after ${record.totalFailures} failures`);
    }

    logger.info(`Recorded failure for session ${sessionId}: ${error.message} (total: ${record.totalFailures})`);

    // Auto-cleanup if enabled
    if (this.config.enableAutoCleanup) {
      this.cleanupOldRecords();
    }
  }

  /**
   * Checks if a session is currently problematic and should be avoided.
   * 
   * @param sessionId - Session to check
   * @returns True if the session should be skipped
   */
  isSessionProblematic(sessionId: SessionId): boolean {
    const record = this.failureRecords.get(sessionId);
    if (!record) {
      return false;
    }

    // Check if blacklisted and still within blacklist period
    if (record.isBlacklisted) {
      if (record.blacklistedUntil && Date.now() < record.blacklistedUntil) {
        return true;
      } else {
        // Blacklist period expired, clear the blacklist
        record.isBlacklisted = false;
        delete record.blacklistedUntil;
        logger.info(`Session ${sessionId} blacklist expired, allowing retry`);
      }
    }

    // Check if we're approaching the retry limit
    return record.totalFailures >= this.config.maxRetries;
  }

  /**
   * Generates recovery options based on the current context.
   * 
   * @param context - Recovery context information
   * @returns Array of available recovery options
   */
  getRecoveryOptions(context: RecoveryContext): RecoveryOption[] {
    const options: RecoveryOption[] = [];
    const record = this.failureRecords.get(context.failedSessionId);
    const attemptCount = record?.totalFailures || 0;

    // Option 1: Retry (if under retry limit)
    if (attemptCount < this.config.maxRetries && !this.isSessionProblematic(context.failedSessionId)) {
      const delay = this.calculateRetryDelay(context.failedSessionId);
      options.push({
        type: 'retry',
        label: `Retry Session (${this.config.maxRetries - attemptCount} attempts remaining)`,
        description: delay > 0 
          ? `Wait ${Math.round(delay / 1000)} seconds and try to restore this session again`
          : 'Try to restore this session again immediately',
        action: async () => {
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          // The actual retry logic would be handled by the caller
        },
        isRecommended: attemptCount === 0 && context.totalFailures < 3, // Recommend retry only on first failure and low total failures
      });
    }

    // Option 2: Skip this session and select a different one
    // Always provide this option for consistency, even with no alternatives
    const alternativeSessions = context.availableSessions
      .filter(session => session.id !== context.failedSessionId)
      .filter(session => !this.isSessionProblematic(session.id));

    options.push({
      type: 'select-different',
      label: alternativeSessions.length > 0 
        ? `Select Different Session (${alternativeSessions.length} available)`
        : 'Select Different Session (0 available)',
      description: alternativeSessions.length > 0
        ? `Choose from ${alternativeSessions.length} other available sessions`
        : 'No alternative sessions are currently available',
      action: async () => {
        // The actual session selection would be handled by the caller
      },
      isRecommended: attemptCount >= 2 && alternativeSessions.length > 0, // Recommend after multiple failures if alternatives exist
    });

    // Option 3: Skip session restoration entirely
    options.push({
      type: 'skip',
      label: 'Skip Session Restoration',
      description: 'Continue without restoring any session and start fresh',
      action: async () => {
        // Mark this failure as having recovery attempted
        if (record) {
          const lastFailure = record.failures[record.failures.length - 1];
          if (lastFailure) {
            lastFailure.recoveryAttempted = true;
          }
        }
      },
      isRecommended: attemptCount >= this.config.maxRetries || context.totalFailures >= 4,
    });

    // Option 4: Create new session (always available)
    options.push({
      type: 'new-session',
      label: 'Start New Session',
      description: 'Create a fresh session and begin working immediately',
      action: async () => {
        // Mark this failure as having recovery attempted
        if (record) {
          const lastFailure = record.failures[record.failures.length - 1];
          if (lastFailure) {
            lastFailure.recoveryAttempted = true;
          }
        }
      },
      isRecommended: context.totalFailures >= 3, // Recommend after multiple session failures
    });

    // Ensure at least one option is recommended
    if (!options.some(option => option.isRecommended)) {
      // If no options are recommended, recommend the first available option
      if (options.length > 0 && options[0]) {
        options[0].isRecommended = true;
      }
    }

    return options;
  }

  /**
   * Determines if a session should be skipped based on failure history.
   * 
   * @param sessionId - Session to check
   * @returns True if the session should be skipped
   */
  shouldSkipSession(sessionId: SessionId): boolean {
    return this.isSessionProblematic(sessionId);
  }

  /**
   * Resets all failure tracking data.
   */
  resetFailureTracking(): void {
    this.failureRecords.clear();
    logger.info('All failure tracking data has been reset');
  }

  /**
   * Gets the failure record for a specific session.
   * 
   * @param sessionId - Session to get record for
   * @returns Failure record or undefined if no failures recorded
   */
  getFailureRecord(sessionId: SessionId): SessionFailureRecord | undefined {
    return this.failureRecords.get(sessionId);
  }

  /**
   * Gets the current configuration.
   * 
   * @returns Current error recovery configuration
   */
  getConfig(): ErrorRecoveryConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   * 
   * @param config - New configuration to apply
   */
  updateConfig(config: Partial<ErrorRecoveryConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Error recovery configuration updated', config);
  }

  /**
   * Calculates the next retry delay for a session.
   * 
   * @param sessionId - Session to calculate delay for
   * @returns Delay in milliseconds, or -1 if max retries exceeded
   */
  calculateRetryDelay(sessionId: SessionId): number {
    const record = this.failureRecords.get(sessionId);
    if (!record) {
      return 0; // No failures recorded, no delay needed
    }

    if (record.totalFailures >= this.config.maxRetries) {
      return -1; // Max retries exceeded
    }

    // Exponential backoff: baseDelay * 2^(attemptNumber - 1)
    const delay = this.config.baseDelayMs * Math.pow(2, record.totalFailures);
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Cleans up old failure records based on configuration.
   * 
   * @returns Number of records cleaned up
   */
  cleanupOldRecords(): number {
    if (!this.config.enableAutoCleanup) {
      return 0;
    }

    const now = Date.now();
    const cutoffTime = now - this.config.cleanupAgeMs;
    let cleanedCount = 0;

    for (const [sessionId, record] of this.failureRecords.entries()) {
      // Clean up records where the last failure is older than the cutoff
      if (record.lastFailure < cutoffTime) {
        this.failureRecords.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old failure records`);
    }

    return cleanedCount;
  }

  /**
   * Gets the validation configuration manager.
   * 
   * @returns Validation configuration manager
   */
  getValidationConfigManager(): IValidationConfigManager {
    return this.validationConfigManager;
  }

  /**
   * Updates the validation configuration manager.
   * 
   * @param configManager - New validation configuration manager
   */
  setValidationConfigManager(configManager: IValidationConfigManager): void {
    this.validationConfigManager = configManager;
    
    // Update error recovery config to match validation config
    const validationRetryConfig = configManager.getRetryConfig();
    this.config.maxRetries = validationRetryConfig.maxRetries;
    this.config.baseDelayMs = validationRetryConfig.baseDelayMs;
    this.config.maxDelayMs = validationRetryConfig.maxDelayMs;
    
    logger.info('Error recovery system updated with new validation configuration');
  }

  /**
   * Categorizes an error into a specific type for tracking purposes.
   * 
   * @param error - Error to categorize
   * @returns Categorized error type
   */
  private categorizeError(error: Error): FailureAttempt['errorType'] {
    if (!error) return 'unknown';
    const message = (error.message || '').toLowerCase();

    if (message.includes('not found') || message.includes('enoent')) {
      return 'file-not-found';
    }

    if (message.includes('permission') || message.includes('eacces')) {
      return 'permission-denied';
    }

    if (message.includes('corrupt') || message.includes('invalid') || message.includes('parse')) {
      return 'corrupted';
    }

    return 'unknown';
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new ErrorRecoverySystem instance with default configuration.
 * 
 * @param config - Optional configuration overrides
 * @param validationConfigManager - Optional validation configuration manager
 * @returns Configured ErrorRecoverySystem instance
 */
export function createErrorRecoverySystem(
  config?: Partial<ErrorRecoveryConfig>, 
  validationConfigManager?: IValidationConfigManager
): IErrorRecoverySystem {
  return new ErrorRecoverySystem(config, validationConfigManager);
}

/**
 * Creates a new ErrorRecoverySystem instance with strict configuration.
 * Strict configuration has lower retry limits and shorter delays.
 * 
 * @param validationConfigManager - Optional validation configuration manager
 * @returns Configured ErrorRecoverySystem instance with strict settings
 */
export function createStrictErrorRecoverySystem(validationConfigManager?: IValidationConfigManager): IErrorRecoverySystem {
  return new ErrorRecoverySystem({
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    blacklistDurationMs: 2 * 60 * 1000, // 2 minutes
    enableAutoCleanup: true,
    cleanupAgeMs: 12 * 60 * 60 * 1000, // 12 hours
  }, validationConfigManager);
}

/**
 * Creates a new ErrorRecoverySystem instance with lenient configuration.
 * Lenient configuration has higher retry limits and longer delays.
 * 
 * @param validationConfigManager - Optional validation configuration manager
 * @returns Configured ErrorRecoverySystem instance with lenient settings
 */
export function createLenientErrorRecoverySystem(validationConfigManager?: IValidationConfigManager): IErrorRecoverySystem {
  return new ErrorRecoverySystem({
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    blacklistDurationMs: 10 * 60 * 1000, // 10 minutes
    enableAutoCleanup: true,
    cleanupAgeMs: 48 * 60 * 60 * 1000, // 48 hours
  }, validationConfigManager);
}