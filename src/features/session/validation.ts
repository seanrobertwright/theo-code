/**
 * @fileoverview Session validation infrastructure for robustness improvements
 * @module features/session/validation
 *
 * Provides comprehensive validation for session files and index integrity:
 * - Session file existence and structure validation
 * - Session index integrity checking
 * - Orphaned entry detection and cleanup
 * - Validation result reporting and logging
 */

import type { SessionId, SessionMetadata, SessionIndex, Session } from '../../shared/types/index.js';
import { SessionSchema, SessionIndexSchema } from '../../shared/types/index.js';
import { fileExists, getSessionFilePath, getSessionIndexPath, safeReadFile } from './filesystem.js';
import { logger } from '../../shared/utils/logger.js';
import * as path from 'node:path';
import { validationLogger, type ValidationOperationContext } from './validation-logger.js';
import { 
  type IValidationConfigManager, 
  type SessionValidationConfig,
  createValidationConfigManager 
} from './validation-config.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Result of validating a single session file.
 */
export interface SessionValidationResult {
  /** Whether the session is valid */
  isValid: boolean;
  /** Whether the session file exists on disk */
  fileExists: boolean;
  /** Whether the session file is readable */
  isReadable: boolean;
  /** Whether the session has valid JSON structure */
  hasValidStructure: boolean;
  /** Array of validation errors */
  errors: string[];
  /** Array of validation warnings */
  warnings: string[];
}

/**
 * Result of validating the session index.
 */
export interface SessionIndexValidationResult {
  /** Whether the index is valid */
  isValid: boolean;
  /** Session IDs that exist in index but have no corresponding files */
  orphanedEntries: SessionId[];
  /** File paths that exist but have no index entries */
  orphanedFiles: string[];
  /** Session IDs with corrupted entries in the index */
  corruptedEntries: SessionId[];
  /** Total number of sessions in the index */
  totalSessions: number;
  /** Number of valid sessions */
  validSessions: number;
}

/**
 * Result of cleanup operations.
 */
export interface SessionCleanupResult {
  /** Number of orphaned entries removed from index */
  orphanedEntriesRemoved: number;
  /** Number of orphaned files processed */
  orphanedFilesProcessed: number;
  /** Session IDs that were successfully cleaned up */
  cleanedSessions: SessionId[];
  /** Errors encountered during cleanup */
  errors: Array<{ sessionId: SessionId; error: string }>;
  /** Warnings generated during cleanup */
  warnings: string[];
}

/**
 * Result of startup integrity check operations.
 */
export interface StartupIntegrityResult {
  /** Whether the startup integrity check passed */
  success: boolean;
  /** Index validation result */
  indexValidation: SessionIndexValidationResult;
  /** Cleanup result (if cleanup was performed) */
  cleanup?: SessionCleanupResult;
  /** Path to backup file created (if any) */
  backupPath?: string;
  /** Overall summary message */
  summary: string;
  /** Detailed operation log */
  operationLog: string[];
  /** Whether any issues were found and resolved */
  issuesFound: boolean;
  /** Whether any issues were resolved */
  issuesResolved: boolean;
}

/**
 * Session validator interface for comprehensive validation operations.
 */
export interface ISessionValidator {
  /**
   * Validates a single session file for existence, readability, and structure.
   * 
   * @param sessionId - Session identifier to validate
   * @returns Promise resolving to validation result
   */
  validateSessionFile(sessionId: SessionId): Promise<SessionValidationResult>;

  /**
   * Validates the session index for integrity and consistency.
   * 
   * @returns Promise resolving to index validation result
   */
  validateSessionIndex(): Promise<SessionIndexValidationResult>;

  /**
   * Cleans up orphaned entries from the session index.
   * 
   * @returns Promise resolving to cleanup result
   */
  cleanupOrphanedEntries(): Promise<SessionCleanupResult>;

  /**
   * Creates a backup of the session index before modifications.
   * 
   * @returns Promise resolving to backup file path
   */
  createIndexBackup(): Promise<string>;

  /**
   * Performs a comprehensive startup integrity check.
   * 
   * This method combines index validation and cleanup operations
   * to ensure the session system is in a consistent state at startup.
   * 
   * @returns Promise resolving to startup integrity check result
   */
  performStartupIntegrityCheck(): Promise<StartupIntegrityResult>;

  /**
   * Gets the current validation configuration.
   * 
   * @returns Current validation configuration
   */
  getConfig(): SessionValidationConfig;

  /**
   * Updates the validation configuration.
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<SessionValidationConfig>): void;
}

// =============================================================================
// SESSION VALIDATOR IMPLEMENTATION
// =============================================================================

/**
 * Comprehensive session validator implementation.
 * 
 * Provides validation for session files and index integrity with
 * detailed error reporting and cleanup capabilities.
 */
export class SessionValidator implements ISessionValidator {
  private configManager: IValidationConfigManager;
  
  constructor(configManager?: IValidationConfigManager) {
    this.configManager = configManager || createValidationConfigManager();
  }
  
  /**
   * Validates a single session file for existence, readability, and structure.
   * 
   * @param sessionId - Session identifier to validate
   * @returns Promise resolving to validation result
   */
  async validateSessionFile(sessionId: SessionId): Promise<SessionValidationResult> {
    const context = validationLogger.createOperationContext('file-validation', sessionId);
    validationLogger.logOperationStart(context);

    const config = this.configManager.getConfig();
    
    // Check if validation is enabled
    if (!config.enabled) {
      const result: SessionValidationResult = {
        isValid: true,
        fileExists: true,
        isReadable: true,
        hasValidStructure: true,
        errors: [],
        warnings: ['Validation is disabled'],
      };
      
      const duration = validationLogger.calculateDuration(context);
      validationLogger.logSessionFileValidation(sessionId, result, duration);
      validationLogger.logOperationComplete(context, true, duration, { reason: 'validation-disabled' });
      return result;
    }

    const result: SessionValidationResult = {
      isValid: false,
      fileExists: false,
      isReadable: false,
      hasValidStructure: false,
      errors: [],
      warnings: [],
    };

    try {
      const filePath = getSessionFilePath(sessionId);
      
      // Check if file exists with timeout
      const timeoutConfig = this.configManager.getTimeoutConfig();
      result.fileExists = await Promise.race([
        fileExists(filePath),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('File existence check timeout')), timeoutConfig.fileExistenceTimeoutMs)
        )
      ]);
      
      if (!result.fileExists) {
        result.errors.push(`Session file does not exist: ${filePath}`);
        logger.warn(`Session file validation failed: ${sessionId} - file not found`);
        
        const duration = validationLogger.calculateDuration(context);
        validationLogger.logSessionFileValidation(sessionId, result, duration);
        validationLogger.logOperationComplete(context, false, duration, { reason: 'file-not-found' });
        return result;
      }

      // Try to read the file with timeout
      try {
        const performanceConfig = this.configManager.getPerformanceConfig();
        const content = await Promise.race([
          safeReadFile(filePath, {
            maxSize: performanceConfig.maxFileSizeBytes,
          }),
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('File read timeout')), timeoutConfig.fileReadTimeoutMs)
          )
        ]);
        
        result.isReadable = true;

        // Try to parse and validate the JSON structure
        try {
          const parsed = JSON.parse(content);
          
          // Check if it's a versioned session format
          if (parsed.version && parsed.data !== undefined) {
            // Versioned format - handle compression if needed
            let sessionData: any;
            
            if (parsed.compressed && typeof parsed.data === 'string') {
              // Data is compressed - decompress it first
              const { decompressData } = await import('./filesystem.js');
              const decompressedData = await decompressData(parsed.data);
              sessionData = JSON.parse(decompressedData);
            } else if (typeof parsed.data === 'string') {
              // Data is a JSON string but not compressed
              sessionData = JSON.parse(parsed.data);
            } else {
              // Data is already an object
              sessionData = parsed.data;
            }
            
            SessionSchema.parse(sessionData);
          } else {
            // Direct session format
            SessionSchema.parse(parsed);
          }
          
          result.hasValidStructure = true;
          result.isValid = true;
          
        } catch (parseError: any) {
          result.errors.push(`Invalid session structure: ${parseError.message}`);
          if (config.logging.enableDetailedLogging) {
            logger.warn(`Session structure validation failed: ${sessionId} - ${parseError.message}`);
          }
        }
        
      } catch (readError: any) {
        result.errors.push(`Cannot read session file: ${readError.message}`);
        if (config.logging.enableDetailedLogging) {
          logger.warn(`Session file read failed: ${sessionId} - ${readError.message}`);
        }
      }

    } catch (error: any) {
      result.errors.push(`Validation error: ${error.message}`);
      logger.error(`Session validation error: ${sessionId} - ${error.message}`);
    }

    const duration = validationLogger.calculateDuration(context);
    
    // Log successful validations only if configured to do so
    if (result.isValid && !config.logging.logSuccessfulValidations) {
      // Skip logging successful validations if disabled
    } else {
      validationLogger.logSessionFileValidation(sessionId, result, duration);
    }
    
    validationLogger.logOperationComplete(context, result.isValid, duration, {
      fileExists: result.fileExists,
      isReadable: result.isReadable,
      hasValidStructure: result.hasValidStructure,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
    });

    return result;
  }

  /**
   * Validates the session index for integrity and consistency.
   * 
   * @returns Promise resolving to index validation result
   */
  async validateSessionIndex(): Promise<SessionIndexValidationResult> {
    const context = validationLogger.createOperationContext('index-validation');
    validationLogger.logOperationStart(context);

    const result: SessionIndexValidationResult = {
      isValid: true,
      orphanedEntries: [],
      orphanedFiles: [],
      corruptedEntries: [],
      totalSessions: 0,
      validSessions: 0,
    };

    try {
      const indexPath = getSessionIndexPath();
      
      // Check if index exists
      if (!await fileExists(indexPath)) {
        logger.warn('Session index does not exist, will be rebuilt');
        const duration = validationLogger.calculateDuration(context);
        validationLogger.logIndexValidation(result, duration);
        validationLogger.logOperationComplete(context, true, duration, { reason: 'index-missing' });
        return result;
      }

      // Read and parse the index
      let index: SessionIndex;
      try {
        const content = await safeReadFile(indexPath);
        const parsed = JSON.parse(content);
        index = SessionIndexSchema.parse(parsed);
      } catch (error: any) {
        logger.error(`Failed to parse session index: ${error.message}`);
        result.isValid = false;
        const duration = validationLogger.calculateDuration(context);
        validationLogger.logIndexValidation(result, duration);
        validationLogger.logOperationComplete(context, false, duration, { reason: 'index-parse-error', error: error.message });
        return result;
      }

      const sessionEntries = Object.entries(index.sessions);
      result.totalSessions = sessionEntries.length;

      // Validate each session entry
      for (const [sessionId, metadata] of sessionEntries) {
        if (!metadata) {
          result.corruptedEntries.push(sessionId as SessionId);
          logger.warn(`Corrupted index entry found: ${sessionId} - missing metadata`);
          continue;
        }

        // Check if corresponding file exists
        const filePath = getSessionFilePath(sessionId);
        const exists = await fileExists(filePath);
        
        if (!exists) {
          result.orphanedEntries.push(sessionId as SessionId);
          logger.warn(`Orphaned index entry found: ${sessionId} - file missing`);
        } else {
          result.validSessions++;
        }
      }

      // Check for orphaned files (files without index entries)
      try {
        const { listSessionFiles } = await import('./filesystem.js');
        const sessionFiles = await listSessionFiles();
        
        for (const filePath of sessionFiles) {
          // Use path.basename to properly extract filename on all platforms
          const fileName = path.basename(filePath);
          const sessionId = fileName.replace('.json', '') as SessionId;
          
          if (!index.sessions[sessionId]) {
            result.orphanedFiles.push(filePath);
            logger.warn(`Orphaned session file found: ${filePath} - no index entry`);
          }
        }
      } catch (error: any) {
        logger.warn(`Failed to check for orphaned files: ${error.message}`);
      }

      // Determine overall validity
      result.isValid = result.orphanedEntries.length === 0 && 
                      result.orphanedFiles.length === 0 && 
                      result.corruptedEntries.length === 0;

      if (!result.isValid) {
        logger.warn(`Session index validation found issues: ${result.orphanedEntries.length} orphaned entries, ${result.orphanedFiles.length} orphaned files, ${result.corruptedEntries.length} corrupted entries`);
      }

    } catch (error: any) {
      logger.error(`Session index validation failed: ${error.message}`);
      result.isValid = false;
    }

    const duration = validationLogger.calculateDuration(context);
    validationLogger.logIndexValidation(result, duration);
    validationLogger.logOperationComplete(context, result.isValid, duration, {
      totalSessions: result.totalSessions,
      validSessions: result.validSessions,
      orphanedEntries: result.orphanedEntries.length,
      orphanedFiles: result.orphanedFiles.length,
      corruptedEntries: result.corruptedEntries.length,
    });

    return result;
  }

  /**
   * Cleans up orphaned entries from the session index.
   * 
   * @returns Promise resolving to cleanup result
   */
  async cleanupOrphanedEntries(): Promise<SessionCleanupResult> {
    const context = validationLogger.createOperationContext('cleanup');
    validationLogger.logOperationStart(context);

    const config = this.configManager.getConfig();
    const cleanupConfig = this.configManager.getCleanupConfig();

    const result: SessionCleanupResult = {
      orphanedEntriesRemoved: 0,
      orphanedFilesProcessed: 0,
      cleanedSessions: [],
      errors: [],
      warnings: [],
    };

    // Check if automatic cleanup is enabled
    if (!cleanupConfig.enableAutomaticCleanup) {
      result.warnings.push('Automatic cleanup is disabled');
      logger.info('Session cleanup skipped - automatic cleanup is disabled');
      
      const duration = validationLogger.calculateDuration(context);
      validationLogger.logCleanupOperation(result, duration);
      validationLogger.logOperationComplete(context, true, duration, { reason: 'cleanup-disabled' });
      return result;
    }

    let backupPath: string | undefined;

    try {
      // Create a backup if configured to do so
      if (cleanupConfig.createBackups) {
        backupPath = await this.createIndexBackup();
        result.warnings.push(`Index backup created: ${backupPath}`);
      }

      // Validate the index to find issues
      const validation = await this.validateSessionIndex();
      
      if (validation.isValid) {
        logger.info('Session index is already valid, no cleanup needed');
        const duration = validationLogger.calculateDuration(context);
        validationLogger.logCleanupOperation(result, duration, backupPath);
        validationLogger.logOperationComplete(context, true, duration, { reason: 'no-cleanup-needed' });
        return result;
      }

      // Read the current index
      const indexPath = getSessionIndexPath();
      let index: SessionIndex;
      
      try {
        const content = await safeReadFile(indexPath);
        index = SessionIndexSchema.parse(JSON.parse(content));
      } catch (error: any) {
        result.errors.push({ sessionId: '' as SessionId, error: `Failed to read index: ${error.message}` });
        const duration = validationLogger.calculateDuration(context);
        validationLogger.logCleanupOperation(result, duration, backupPath);
        validationLogger.logOperationComplete(context, false, duration, { reason: 'index-read-error' });
        return result;
      }

      // Remove orphaned entries (entries without corresponding files)
      for (const sessionId of validation.orphanedEntries) {
        delete index.sessions[sessionId];
        result.orphanedEntriesRemoved++;
        result.cleanedSessions.push(sessionId);
        if (config.logging.logCleanupOperations) {
          logger.info(`Removed orphaned index entry: ${sessionId}`);
        }
      }

      // Handle orphaned files (files without index entries)
      for (const filePath of validation.orphanedFiles) {
        try {
          const fileName = path.basename(filePath);
          const sessionId = fileName.replace('.json', '') as SessionId;
          
          // Check if we should clean up orphaned files
          if (cleanupConfig.cleanupOrphanedFiles) {
            // Delete the orphaned file
            const { safeDeleteFile } = await import('./filesystem.js');
            await safeDeleteFile(filePath);
            result.orphanedFilesProcessed++;
            if (config.logging.logCleanupOperations) {
              logger.info(`Deleted orphaned session file: ${filePath}`);
            }
          } else {
            // Try to read the session file and recreate the index entry
            const sessionValidation = await this.validateSessionFile(sessionId);
            
            if (sessionValidation.isValid && sessionValidation.isReadable) {
              // Read the session to create metadata
              const content = await safeReadFile(filePath);
              const parsed = JSON.parse(content);
              
              let sessionData: Session;
              if (parsed.version && parsed.data !== undefined) {
                // Versioned format - handle compression if needed
                if (parsed.compressed && typeof parsed.data === 'string') {
                  // Data is compressed - decompress it first
                  const { decompressData } = await import('./filesystem.js');
                  const decompressedData = await decompressData(parsed.data);
                  sessionData = JSON.parse(decompressedData);
                } else if (typeof parsed.data === 'string') {
                  // Data is a JSON string but not compressed
                  sessionData = JSON.parse(parsed.data);
                } else {
                  // Data is already an object
                  sessionData = parsed.data;
                }
              } else {
                // Direct format
                sessionData = parsed;
              }

              // Create metadata for the session
              const metadata: SessionMetadata = {
                id: sessionData.id,
                created: sessionData.created,
                lastModified: sessionData.lastModified,
                model: sessionData.model,
                provider: sessionData.provider,
                tokenCount: sessionData.tokenCount,
                title: sessionData.title,
                workspaceRoot: sessionData.workspaceRoot,
                messageCount: sessionData.messages.length,
                lastMessage: sessionData.messages.length > 0 
                  ? (() => {
                      const lastMessage = sessionData.messages[sessionData.messages.length - 1];
                      return lastMessage ? this.extractMessageText(lastMessage.content).slice(0, 50) : undefined;
                    })()
                  : undefined,
                contextFiles: sessionData.contextFiles,
                tags: sessionData.tags,
                preview: sessionData.messages.find(m => m.role === 'user')
                  ? (() => {
                      const userMessage = sessionData.messages.find(m => m.role === 'user');
                      return userMessage ? this.extractMessageText(userMessage.content).slice(0, 100) : undefined;
                    })()
                  : undefined,
              };

              index.sessions[sessionId] = metadata;
              result.orphanedFilesProcessed++;
              result.cleanedSessions.push(sessionId);
              if (config.logging.logCleanupOperations) {
                logger.info(`Recreated index entry for orphaned file: ${sessionId}`);
              }
              
            } else {
              // File is corrupted, log warning but don't delete
              result.warnings.push(`Orphaned file ${filePath} appears corrupted, manual review needed`);
              if (config.logging.enableDetailedLogging) {
                logger.warn(`Orphaned file appears corrupted: ${filePath}`);
              }
            }
          }
          
        } catch (error: any) {
          result.errors.push({ 
            sessionId: '' as SessionId, 
            error: `Failed to process orphaned file ${filePath}: ${error.message}` 
          });
        }
      }

      // Remove corrupted entries
      for (const sessionId of validation.corruptedEntries) {
        delete index.sessions[sessionId];
        result.cleanedSessions.push(sessionId);
        if (config.logging.logCleanupOperations) {
          logger.info(`Removed corrupted index entry: ${sessionId}`);
        }
      }

      // Update the index timestamp
      index.lastUpdated = Date.now();

      // Write the cleaned index back to disk
      const { atomicWriteFile } = await import('./filesystem.js');
      await atomicWriteFile(indexPath, JSON.stringify(index, null, 2), {
        createBackup: false, // We already created a backup if configured
      });

      if (config.logging.logCleanupOperations) {
        logger.info(`Session index cleanup completed: ${result.orphanedEntriesRemoved} orphaned entries removed, ${result.orphanedFilesProcessed} orphaned files processed`);
      }

    } catch (error: any) {
      result.errors.push({ 
        sessionId: '' as SessionId, 
        error: `Cleanup operation failed: ${error.message}` 
      });
      logger.error(`Session index cleanup failed: ${error.message}`);
    }

    const duration = validationLogger.calculateDuration(context);
    validationLogger.logCleanupOperation(result, duration, backupPath);
    validationLogger.logOperationComplete(context, result.errors.length === 0, duration, {
      orphanedEntriesRemoved: result.orphanedEntriesRemoved,
      orphanedFilesProcessed: result.orphanedFilesProcessed,
      totalSessionsCleaned: result.cleanedSessions.length,
      errorsEncountered: result.errors.length,
      warningsGenerated: result.warnings.length,
    });

    return result;
  }

  /**
   * Creates a backup of the session index before modifications.
   * 
   * @returns Promise resolving to backup file path
   */
  async createIndexBackup(): Promise<string> {
    const context = validationLogger.createOperationContext('backup-creation');
    validationLogger.logOperationStart(context);

    const indexPath = getSessionIndexPath();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${indexPath}.backup.${timestamp}`;

    try {
      if (await fileExists(indexPath)) {
        const content = await safeReadFile(indexPath);
        const { atomicWriteFile } = await import('./filesystem.js');
        await atomicWriteFile(backupPath, content, {
          createBackup: false, // Don't create backup of backup
        });
        logger.info(`Session index backup created: ${backupPath}`);
        
        const duration = validationLogger.calculateDuration(context);
        validationLogger.logOperationComplete(context, true, duration, { backupPath });
      } else {
        logger.warn('Session index does not exist, no backup created');
        const duration = validationLogger.calculateDuration(context);
        validationLogger.logOperationComplete(context, true, duration, { reason: 'index-not-found' });
      }
    } catch (error: any) {
      logger.error(`Failed to create index backup: ${error.message}`);
      const duration = validationLogger.calculateDuration(context);
      validationLogger.logOperationComplete(context, false, duration, { error: error.message });
      throw new Error(`Failed to create index backup: ${error.message}`);
    }

    return backupPath;
  }

  /**
   * Performs a comprehensive startup integrity check.
   * 
   * This method combines index validation and cleanup operations
   * to ensure the session system is in a consistent state at startup.
   * 
   * @returns Promise resolving to startup integrity check result
   */
  async performStartupIntegrityCheck(): Promise<StartupIntegrityResult> {
    const context = validationLogger.createOperationContext('startup-check');
    validationLogger.logOperationStart(context);

    const result: StartupIntegrityResult = {
      success: false,
      indexValidation: {
        isValid: false,
        orphanedEntries: [],
        orphanedFiles: [],
        corruptedEntries: [],
        totalSessions: 0,
        validSessions: 0,
      },
      summary: '',
      operationLog: [],
      issuesFound: false,
      issuesResolved: false,
    };

    try {
      result.operationLog.push('Starting session system integrity check...');
      logger.info('Starting session system integrity check');

      // Step 1: Validate the session index
      result.operationLog.push('Validating session index...');
      result.indexValidation = await this.validateSessionIndex();

      const totalIssues = result.indexValidation.orphanedEntries.length + 
                         result.indexValidation.orphanedFiles.length + 
                         result.indexValidation.corruptedEntries.length;

      result.issuesFound = totalIssues > 0;

      if (result.indexValidation.isValid) {
        result.operationLog.push(`Index validation passed: ${result.indexValidation.validSessions} valid sessions found`);
        result.summary = `Session index is healthy with ${result.indexValidation.validSessions} valid sessions`;
        result.success = true;
        logger.info(`Session index validation passed: ${result.indexValidation.validSessions} valid sessions`);
      } else {
        result.operationLog.push(`Index validation found issues: ${result.indexValidation.orphanedEntries.length} orphaned entries, ${result.indexValidation.orphanedFiles.length} orphaned files, ${result.indexValidation.corruptedEntries.length} corrupted entries`);
        logger.warn(`Session index validation found ${totalIssues} issues`);

        // Step 2: Create backup before cleanup
        if (totalIssues > 0) {
          try {
            result.operationLog.push('Creating index backup before cleanup...');
            result.backupPath = await this.createIndexBackup();
            result.operationLog.push(`Backup created: ${result.backupPath}`);
            logger.info(`Index backup created: ${result.backupPath}`);
          } catch (backupError: any) {
            result.operationLog.push(`Warning: Failed to create backup: ${backupError.message}`);
            logger.warn(`Failed to create index backup: ${backupError.message}`);
          }

          // Step 3: Perform cleanup
          result.operationLog.push('Performing cleanup of orphaned entries...');
          result.cleanup = await this.cleanupOrphanedEntries();

          const cleanupSuccessful = result.cleanup.errors.length === 0;
          const entriesFixed = result.cleanup.orphanedEntriesRemoved + result.cleanup.orphanedFilesProcessed;

          if (cleanupSuccessful && entriesFixed > 0) {
            result.issuesResolved = true;
            result.operationLog.push(`Cleanup completed successfully: ${result.cleanup.orphanedEntriesRemoved} orphaned entries removed, ${result.cleanup.orphanedFilesProcessed} orphaned files processed`);
            result.summary = `Session index repaired: ${entriesFixed} issues resolved, ${result.indexValidation.validSessions} valid sessions preserved`;
            result.success = true;
            logger.info(`Session index cleanup completed: ${entriesFixed} issues resolved`);
          } else if (result.cleanup.errors.length > 0) {
            result.operationLog.push(`Cleanup encountered errors: ${result.cleanup.errors.length} errors`);
            result.summary = `Session index cleanup partially failed: ${result.cleanup.errors.length} errors encountered`;
            logger.error(`Session index cleanup failed with ${result.cleanup.errors.length} errors`);
          } else {
            result.operationLog.push('No cleanup actions were needed');
            result.summary = 'Session index validation completed, no cleanup required';
            result.success = true;
          }
        }
      }

      // Step 4: Final validation to confirm system state
      if (result.success && result.issuesFound) {
        result.operationLog.push('Performing final validation check...');
        const finalValidation = await this.validateSessionIndex();
        if (finalValidation.isValid) {
          result.operationLog.push('Final validation passed - session system is now healthy');
          logger.info('Session system integrity check completed successfully');
        } else {
          result.operationLog.push('Warning: Final validation still shows issues');
          result.summary += ' (some issues may remain)';
          logger.warn('Session system integrity check completed with remaining issues');
        }
      }

    } catch (error: any) {
      result.operationLog.push(`Integrity check failed: ${error.message}`);
      result.summary = `Session system integrity check failed: ${error.message}`;
      result.success = false;
      logger.error(`Session system integrity check failed: ${error.message}`);
    }

    const duration = validationLogger.calculateDuration(context);
    validationLogger.logStartupIntegrityCheck(result, duration);
    validationLogger.logOperationComplete(context, result.success, duration, {
      issuesFound: result.issuesFound,
      issuesResolved: result.issuesResolved,
      validSessions: result.indexValidation.validSessions,
      totalSessions: result.indexValidation.totalSessions,
      backupCreated: !!result.backupPath,
    });

    return result;
  }

  /**
   * Gets the current validation configuration.
   * 
   * @returns Current validation configuration
   */
  getConfig(): SessionValidationConfig {
    return this.configManager.getConfig();
  }

  /**
   * Updates the validation configuration.
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<SessionValidationConfig>): void {
    this.configManager.updateConfig(config);
  }

  /**
   * Extracts text content from a message content field.
   * 
   * @param content - Message content (string or array of content blocks)
   * @returns Extracted text string
   */
  private extractMessageText(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      // Extract text from content blocks
      const textBlocks = content
        .filter(block => block && typeof block === 'object' && block.type === 'text')
        .map(block => block.text)
        .filter(text => typeof text === 'string');
      
      return textBlocks.length > 0 ? textBlocks.join(' ') : 'Complex message';
    }
    
    return 'Complex message';
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new SessionValidator instance.
 * 
 * @param configManager - Optional configuration manager for validation behavior
 * @returns Configured SessionValidator instance
 */
export function createSessionValidator(configManager?: IValidationConfigManager): ISessionValidator {
  return new SessionValidator(configManager);
}