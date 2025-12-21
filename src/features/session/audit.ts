/**
 * @fileoverview Audit logging system for session operations
 * @module features/session/audit
 *
 * Provides optional audit logging for all session operations with:
 * - Configurable logging levels (info, warn, error)
 * - Multiple logging destinations (file, console)
 * - Automatic log rotation and cleanup
 * - Structured log format with timestamps and context
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getSessionsDir } from '../../config/index.js';
import type { SessionId } from '../../shared/types/index.js';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Audit log levels.
 */
export type AuditLogLevel = 'info' | 'warn' | 'error';

/**
 * Audit log destinations.
 */
export type AuditLogDestination = 'file' | 'console' | 'both';

/**
 * Audit log entry structure.
 */
export interface AuditLogEntry {
  /** Timestamp of the log entry */
  timestamp: number;
  
  /** Log level */
  level: AuditLogLevel;
  
  /** Operation being performed */
  operation: string;
  
  /** Session ID if applicable */
  sessionId?: SessionId | undefined;
  
  /** User or system identifier */
  actor: string;
  
  /** Additional context data */
  context?: Record<string, any> | undefined;
  
  /** Error message if applicable */
  error?: string | undefined;
  
  /** Operation result (success/failure) */
  result: 'success' | 'failure';
  
  /** Duration in milliseconds */
  duration?: number | undefined;
}

/**
 * Audit logger configuration.
 */
export interface AuditLoggerConfig {
  /** Whether audit logging is enabled */
  enabled: boolean;
  
  /** Minimum log level to record */
  level: AuditLogLevel;
  
  /** Log destination */
  destination: AuditLogDestination;
  
  /** Maximum log file size in bytes (default: 10MB) */
  maxFileSize: number;
  
  /** Maximum number of log files to keep (default: 5) */
  maxFiles: number;
  
  /** Whether to include context data in logs */
  includeContext: boolean;
  
  /** Whether to log to console in addition to file */
  consoleOutput: boolean;
}

/**
 * Log rotation result.
 */
interface RotationResult {
  /** Whether rotation occurred */
  rotated: boolean;
  
  /** Number of old log files deleted */
  filesDeleted: number;
  
  /** New log file path */
  newLogFile?: string;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: AuditLoggerConfig = {
  enabled: false,
  level: 'info',
  destination: 'file',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  includeContext: true,
  consoleOutput: false,
};

// =============================================================================
// AUDIT LOGGER IMPLEMENTATION
// =============================================================================

/**
 * Audit logger for session operations.
 * 
 * Provides structured logging with automatic rotation and cleanup.
 */
export class AuditLogger {
  private config: AuditLoggerConfig;
  private logFilePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  
  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logFilePath = this.getLogFilePath();
  }
  
  /**
   * Updates the audit logger configuration.
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<AuditLoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logFilePath = this.getLogFilePath();
  }
  
  /**
   * Gets the current configuration.
   * 
   * @returns Current audit logger configuration
   */
  getConfig(): AuditLoggerConfig {
    return { ...this.config };
  }
  
  /**
   * Logs a session operation.
   * 
   * @param entry - Audit log entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    // Check if log level meets minimum threshold
    if (!this.shouldLog(entry.level)) {
      return;
    }
    
    // Format log entry
    const formattedEntry = this.formatLogEntry(entry);
    
    // Queue the write operation to ensure sequential writes
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        // Check if rotation is needed
        await this.checkAndRotate();
        
        // Write to destinations
        await this.writeToDestinations(formattedEntry);
      } catch (error) {
        // Don't throw errors from logging to avoid disrupting operations
        console.error('Audit logging failed:', error);
      }
    });
    
    await this.writeQueue;
  }
  
  /**
   * Logs a successful operation.
   * 
   * @param operation - Operation name
   * @param sessionId - Session ID if applicable
   * @param context - Additional context
   * @param duration - Operation duration in ms
   */
  async logSuccess(
    operation: string,
    sessionId?: SessionId,
    context?: Record<string, any>,
    duration?: number
  ): Promise<void> {
    await this.log({
      timestamp: Date.now(),
      level: 'info',
      operation,
      sessionId,
      actor: 'system',
      context: this.config.includeContext ? context : undefined,
      result: 'success',
      duration,
    });
  }
  
  /**
   * Logs a failed operation.
   * 
   * @param operation - Operation name
   * @param error - Error message or object
   * @param sessionId - Session ID if applicable
   * @param context - Additional context
   */
  async logFailure(
    operation: string,
    error: string | Error,
    sessionId?: SessionId,
    context?: Record<string, any>
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    
    await this.log({
      timestamp: Date.now(),
      level: 'error',
      operation,
      sessionId,
      actor: 'system',
      context: this.config.includeContext ? context : undefined,
      error: errorMessage,
      result: 'failure',
    });
  }
  
  /**
   * Logs a warning.
   * 
   * @param operation - Operation name
   * @param message - Warning message
   * @param sessionId - Session ID if applicable
   * @param context - Additional context
   */
  async logWarning(
    operation: string,
    message: string,
    sessionId?: SessionId,
    context?: Record<string, any>
  ): Promise<void> {
    await this.log({
      timestamp: Date.now(),
      level: 'warn',
      operation,
      sessionId,
      actor: 'system',
      context: this.config.includeContext ? context : undefined,
      error: message,
      result: 'success', // Warnings don't indicate failure
    });
  }
  
  /**
   * Retrieves recent log entries.
   * 
   * @param limit - Maximum number of entries to retrieve
   * @param level - Filter by log level
   * @returns Array of log entries
   */
  async getRecentLogs(
    limit: number = 100,
    level?: AuditLogLevel
  ): Promise<AuditLogEntry[]> {
    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      const entries: AuditLogEntry[] = [];
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditLogEntry;
          
          // Filter by level if specified
          if (level && entry.level !== level) {
            continue;
          }
          
          entries.push(entry);
        } catch {
          // Skip invalid lines
          continue;
        }
      }
      
      // Return most recent entries
      return entries.slice(-limit);
    } catch (error) {
      // If log file doesn't exist or can't be read, return empty array
      return [];
    }
  }
  
  /**
   * Clears all log files.
   * 
   * @returns Number of files deleted
   */
  async clearLogs(): Promise<number> {
    try {
      const logsDir = this.getLogsDirectory();
      const files = await fs.readdir(logsDir);
      
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.startsWith('audit-') && file.endsWith('.log')) {
          try {
            await fs.unlink(path.join(logsDir, file));
            deletedCount++;
          } catch {
            // Continue with other files
          }
        }
      }
      
      return deletedCount;
    } catch {
      return 0;
    }
  }
  
  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------
  
  /**
   * Checks if a log level should be recorded based on configuration.
   * 
   * @param level - Log level to check
   * @returns True if level should be logged
   */
  private shouldLog(level: AuditLogLevel): boolean {
    const levels: AuditLogLevel[] = ['info', 'warn', 'error'];
    const configLevelIndex = levels.indexOf(this.config.level);
    const entryLevelIndex = levels.indexOf(level);
    
    return entryLevelIndex >= configLevelIndex;
  }
  
  /**
   * Formats a log entry as a JSON string.
   * 
   * @param entry - Log entry to format
   * @returns Formatted log string
   */
  private formatLogEntry(entry: AuditLogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    
    const formattedEntry = {
      timestamp,
      level: entry.level,
      operation: entry.operation,
      sessionId: entry.sessionId,
      actor: entry.actor,
      result: entry.result,
      duration: entry.duration,
      context: entry.context,
      error: entry.error,
    };
    
    return JSON.stringify(formattedEntry);
  }
  
  /**
   * Writes a log entry to configured destinations.
   * 
   * @param formattedEntry - Formatted log entry string
   */
  private async writeToDestinations(formattedEntry: string): Promise<void> {
    const promises: Promise<void>[] = [];
    
    // Write to file
    if (this.config.destination === 'file' || this.config.destination === 'both') {
      promises.push(this.writeToFile(formattedEntry));
    }
    
    // Write to console
    if (this.config.destination === 'console' || this.config.destination === 'both' || this.config.consoleOutput) {
      this.writeToConsole(formattedEntry);
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Writes a log entry to the log file.
   * 
   * @param formattedEntry - Formatted log entry string
   */
  private async writeToFile(formattedEntry: string): Promise<void> {
    try {
      // Ensure logs directory exists
      const logsDir = this.getLogsDirectory();
      await fs.mkdir(logsDir, { recursive: true });
      
      // Append to log file
      await fs.appendFile(this.logFilePath, formattedEntry + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to write to audit log file:', error);
    }
  }
  
  /**
   * Writes a log entry to the console.
   * 
   * @param formattedEntry - Formatted log entry string
   */
  private writeToConsole(formattedEntry: string): void {
    try {
      const entry = JSON.parse(formattedEntry) as AuditLogEntry;
      const prefix = `[AUDIT ${entry.level.toUpperCase()}]`;
      const message = `${prefix} ${entry.operation} - ${entry.result}`;
      
      switch (entry.level) {
        case 'error':
          console.error(message, entry.error || '');
          break;
        case 'warn':
          console.warn(message, entry.error || '');
          break;
        default:
          console.log(message);
      }
    } catch {
      // Fallback to raw output
      console.log(formattedEntry);
    }
  }
  
  /**
   * Checks if log rotation is needed and performs it.
   */
  private async checkAndRotate(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFilePath);
      
      if (stats.size >= this.config.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error: any) {
      // If file doesn't exist, no rotation needed
      if (error.code !== 'ENOENT') {
        console.error('Failed to check log file size:', error);
      }
    }
  }
  
  /**
   * Rotates the current log file and cleans up old files.
   * 
   * @returns Rotation result
   */
  private async rotateLogFile(): Promise<RotationResult> {
    try {
      const logsDir = this.getLogsDirectory();
      const timestamp = Date.now();
      const rotatedPath = path.join(logsDir, `audit-${timestamp}.log`);
      
      // Rename current log file
      try {
        await fs.rename(this.logFilePath, rotatedPath);
      } catch (error: any) {
        // If current log doesn't exist, no rotation needed
        if (error.code === 'ENOENT') {
          return { rotated: false, filesDeleted: 0 };
        }
        throw error;
      }
      
      // Clean up old log files
      const filesDeleted = await this.cleanupOldLogFiles();
      
      return {
        rotated: true,
        filesDeleted,
        newLogFile: rotatedPath,
      };
    } catch (error) {
      console.error('Failed to rotate log file:', error);
      return { rotated: false, filesDeleted: 0 };
    }
  }
  
  /**
   * Cleans up old log files beyond the configured limit.
   * 
   * @returns Number of files deleted
   */
  private async cleanupOldLogFiles(): Promise<number> {
    try {
      const logsDir = this.getLogsDirectory();
      const files = await fs.readdir(logsDir);
      
      // Filter and sort log files by timestamp
      const logFiles = files
        .filter(file => file.startsWith('audit-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(logsDir, file),
          timestamp: this.extractTimestampFromFilename(file),
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // Newest first
      
      // Keep only the configured number of files
      const filesToDelete = logFiles.slice(this.config.maxFiles);
      
      let deletedCount = 0;
      
      for (const file of filesToDelete) {
        try {
          await fs.unlink(file.path);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete old log file ${file.name}:`, error);
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old log files:', error);
      return 0;
    }
  }
  
  /**
   * Extracts timestamp from a log filename.
   * 
   * @param filename - Log filename
   * @returns Timestamp or 0 if not found
   */
  private extractTimestampFromFilename(filename: string): number {
    const match = filename.match(/audit-(\d+)\.log/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  }
  
  /**
   * Gets the path to the current log file.
   * 
   * @returns Log file path
   */
  private getLogFilePath(): string {
    return path.join(this.getLogsDirectory(), 'audit.log');
  }
  
  /**
   * Gets the logs directory path.
   * 
   * @returns Logs directory path
   */
  private getLogsDirectory(): string {
    const sessionsDir = getSessionsDir();
    return path.join(sessionsDir, 'logs');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let auditLoggerInstance: AuditLogger | null = null;

/**
 * Gets the singleton audit logger instance.
 * 
 * @param config - Optional configuration for initialization
 * @returns Audit logger instance
 */
export function getAuditLogger(config?: Partial<AuditLoggerConfig>): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(config);
  } else if (config) {
    auditLoggerInstance.updateConfig(config);
  }
  
  return auditLoggerInstance;
}

/**
 * Resets the audit logger instance (mainly for testing).
 */
export function resetAuditLogger(): void {
  auditLoggerInstance = null;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Logs a session operation with automatic timing.
 * 
 * @param operation - Operation name
 * @param fn - Function to execute
 * @param sessionId - Session ID if applicable
 * @param context - Additional context
 * @returns Result of the function
 */
export async function logOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  sessionId?: SessionId,
  context?: Record<string, any>
): Promise<T> {
  const logger = getAuditLogger();
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    await logger.logSuccess(operation, sessionId, context, duration);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    await logger.logFailure(
      operation,
      error instanceof Error ? error : String(error),
      sessionId,
      { ...context, duration }
    );
    
    throw error;
  }
}
