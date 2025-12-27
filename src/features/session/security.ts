/**
 * @fileoverview Security utilities for session data protection
 * @module features/session/security
 *
 * Provides comprehensive security features for session management including:
 * - Sensitive data filtering and sanitization
 * - File permission management
 * - Audit logging for session operations
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { Session, SessionMetadata, Message } from '../../shared/types/index.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration for sensitive data filtering.
 */
export interface SensitiveDataConfig {
  /** Whether to enable sensitive data filtering */
  enabled: boolean;
  
  /** Custom regex patterns for sensitive data detection */
  customPatterns: string[];
  
  /** Whether to preserve workspace paths in exports */
  preserveWorkspacePaths: boolean;
  
  /** Replacement text for redacted content */
  redactionText: string;
  
  /** Whether to log redaction events */
  logRedactions: boolean;
}

/**
 * Configuration for file permissions.
 */
export interface FilePermissionConfig {
  /** File mode for session files (octal) */
  sessionFileMode: number;
  
  /** Directory mode for session directories (octal) */
  directoryMode: number;
  
  /** Whether to validate permissions on read */
  validateOnRead: boolean;
  
  /** Whether to repair permissions automatically */
  autoRepair: boolean;
}

/**
 * Configuration for audit logging.
 */
export interface AuditLogConfig {
  /** Whether audit logging is enabled */
  enabled: boolean;
  
  /** Log file path */
  logFile: string;
  
  /** Log level (error, warn, info, debug) */
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  
  /** Maximum log file size in bytes */
  maxFileSize: number;
  
  /** Number of rotated log files to keep */
  maxFiles: number;
  
  /** Whether to log to console as well */
  logToConsole: boolean;
}

/**
 * Audit log entry structure.
 */
export interface AuditLogEntry {
  /** Timestamp of the event */
  timestamp: number;
  
  /** Event type */
  event: 'session_created' | 'session_loaded' | 'session_saved' | 'session_deleted' | 
         'session_exported' | 'session_imported' | 'sensitive_data_filtered' | 
         'permission_violation' | 'permission_repaired';
  
  /** Session ID involved in the event */
  sessionId?: string;
  
  /** User or process that triggered the event */
  actor: string;
  
  /** Additional event details */
  details: Record<string, any>;
  
  /** Event severity level */
  level: 'error' | 'warn' | 'info' | 'debug';
  
  /** Error message if applicable */
  error?: string;
}

/**
 * Result of sensitive data filtering operation.
 */
export interface FilterResult {
  /** Whether any sensitive data was found and filtered */
  filtered: boolean;
  
  /** Number of patterns that matched */
  matchCount: number;
  
  /** Types of sensitive data found */
  dataTypes: string[];
  
  /** Filtered content */
  content: any;
  
  /** Warnings about the filtering process */
  warnings: string[];
}

/**
 * Result of file permission check.
 */
export interface PermissionCheckResult {
  /** Whether permissions are correct */
  valid: boolean;
  
  /** Current file mode (octal) */
  currentMode: number;
  
  /** Expected file mode (octal) */
  expectedMode: number;
  
  /** Whether the file is readable */
  readable: boolean;
  
  /** Whether the file is writable */
  writable: boolean;
  
  /** Error message if check failed */
  error?: string;
}

// =============================================================================
// SENSITIVE DATA FILTER
// =============================================================================

/**
 * Comprehensive sensitive data filter for session content.
 */
export class SensitiveDataFilter {
  private readonly config: SensitiveDataConfig;
  private readonly auditLogger?: AuditLogger;
  
  constructor(config: SensitiveDataConfig, auditLogger?: AuditLogger) {
    this.config = config;
    if (auditLogger !== undefined) {
      this.auditLogger = auditLogger;
    }
  }
  
  /**
   * Filters sensitive data from session content.
   * 
   * @param session - Session to filter
   * @returns Filtered session and operation result
   */
  async filterSession(session: Session): Promise<{ session: Session; result: FilterResult }> {
    if (!this.config.enabled) {
      return {
        session,
        result: {
          filtered: false,
          matchCount: 0,
          dataTypes: [],
          content: session,
          warnings: [],
        },
      };
    }
    
    const result: FilterResult = {
      filtered: false,
      matchCount: 0,
      dataTypes: [],
      content: session,
      warnings: [],
    };
    
    // Filter workspace root
    let filteredSession = { ...session };
    if (!this.config.preserveWorkspacePaths) {
      filteredSession.workspaceRoot = this.config.redactionText;
      result.filtered = true;
      result.dataTypes.push('workspace_path');
    }
    
    // Filter context files
    filteredSession.contextFiles = this.config.preserveWorkspacePaths
      ? session.contextFiles
      : session.contextFiles.map(path => this.sanitizeFilePath(path));
    
    // Filter files accessed
    filteredSession.filesAccessed = this.config.preserveWorkspacePaths
      ? session.filesAccessed
      : session.filesAccessed.map(path => this.sanitizeFilePath(path));
    
    // Filter messages
    filteredSession.messages = [];
    for (const message of session.messages) {
      const filteredMessage = await this.filterMessage(message);
      filteredSession.messages.push(filteredMessage.message);
      
      if (filteredMessage.result.filtered) {
        result.filtered = true;
        result.matchCount += filteredMessage.result.matchCount;
        result.dataTypes.push(...filteredMessage.result.dataTypes);
        result.warnings.push(...filteredMessage.result.warnings);
      }
    }
    
    // Filter title and notes
    if (filteredSession.title) {
      const filteredTitle = this.filterText(filteredSession.title);
      if (filteredTitle.filtered) {
        filteredSession.title = filteredTitle.content;
        result.filtered = true;
        result.matchCount += filteredTitle.matchCount;
        result.dataTypes.push(...filteredTitle.dataTypes);
      }
    }
    
    if (filteredSession.notes) {
      const filteredNotes = this.filterText(filteredSession.notes);
      if (filteredNotes.filtered) {
        filteredSession.notes = filteredNotes.content;
        result.filtered = true;
        result.matchCount += filteredNotes.matchCount;
        result.dataTypes.push(...filteredNotes.dataTypes);
      }
    }
    
    result.content = filteredSession;
    
    // Log filtering event if enabled
    if (result.filtered && this.auditLogger) {
      await this.auditLogger.log({
        timestamp: Date.now(),
        event: 'sensitive_data_filtered',
        sessionId: session.id,
        actor: 'system',
        details: {
          matchCount: result.matchCount,
          dataTypes: result.dataTypes,
          preserveWorkspacePaths: this.config.preserveWorkspacePaths,
        },
        level: 'info',
      });
    }
    
    return { session: filteredSession, result };
  }
  
  /**
   * Filters sensitive data from session metadata.
   * 
   * @param metadata - Session metadata to filter
   * @returns Filtered metadata and operation result
   */
  async filterSessionMetadata(metadata: SessionMetadata): Promise<{ metadata: SessionMetadata; result: FilterResult }> {
    if (!this.config.enabled) {
      return {
        metadata,
        result: {
          filtered: false,
          matchCount: 0,
          dataTypes: [],
          content: metadata,
          warnings: [],
        },
      };
    }
    
    const result: FilterResult = {
      filtered: false,
      matchCount: 0,
      dataTypes: [],
      content: metadata,
      warnings: [],
    };
    
    let filteredMetadata = { ...metadata };
    
    // Filter workspace root
    if (!this.config.preserveWorkspacePaths && filteredMetadata.workspaceRoot) {
      filteredMetadata.workspaceRoot = this.config.redactionText;
      result.filtered = true;
      result.dataTypes.push('workspace_path');
    }
    
    // Filter context files
    filteredMetadata.contextFiles = this.config.preserveWorkspacePaths
      ? metadata.contextFiles
      : metadata.contextFiles.map(path => this.sanitizeFilePath(path));
    
    // Filter preview, last message, and title
    if (filteredMetadata.preview) {
      const filteredPreview = this.filterText(filteredMetadata.preview);
      if (filteredPreview.filtered) {
        filteredMetadata.preview = filteredPreview.content;
        result.filtered = true;
        result.matchCount += filteredPreview.matchCount;
        result.dataTypes.push(...filteredPreview.dataTypes);
      }
    }
    
    if (filteredMetadata.lastMessage) {
      const filteredLastMessage = this.filterText(filteredMetadata.lastMessage);
      if (filteredLastMessage.filtered) {
        filteredMetadata.lastMessage = filteredLastMessage.content;
        result.filtered = true;
        result.matchCount += filteredLastMessage.matchCount;
        result.dataTypes.push(...filteredLastMessage.dataTypes);
      }
    }
    
    if (filteredMetadata.title) {
      const filteredTitle = this.filterText(filteredMetadata.title);
      if (filteredTitle.filtered) {
        filteredMetadata.title = filteredTitle.content;
        result.filtered = true;
        result.matchCount += filteredTitle.matchCount;
        result.dataTypes.push(...filteredTitle.dataTypes);
      }
    }
    
    result.content = filteredMetadata;
    
    return { metadata: filteredMetadata, result };
  }
  
  /**
   * Filters sensitive data from a message.
   * 
   * @param message - Message to filter
   * @returns Filtered message and operation result
   */
  private async filterMessage(message: Message): Promise<{ message: Message; result: FilterResult }> {
    const result: FilterResult = {
      filtered: false,
      matchCount: 0,
      dataTypes: [],
      content: message,
      warnings: [],
    };
    
    let filteredMessage = { ...message };
    
    // Filter content
    if (typeof message.content === 'string') {
      const filteredContent = this.filterText(message.content);
      if (filteredContent.filtered) {
        filteredMessage.content = filteredContent.content;
        result.filtered = true;
        result.matchCount += filteredContent.matchCount;
        result.dataTypes.push(...filteredContent.dataTypes);
      }
    } else {
      filteredMessage.content = [];
      for (const block of message.content) {
        if (block.type === 'text') {
          const filteredText = this.filterText(block.text);
          filteredMessage.content.push({
            ...block,
            text: filteredText.content,
          });
          
          if (filteredText.filtered) {
            result.filtered = true;
            result.matchCount += filteredText.matchCount;
            result.dataTypes.push(...filteredText.dataTypes);
          }
        } else if (block.type === 'tool_result') {
          const filteredContent = this.filterText(block.content);
          filteredMessage.content.push({
            ...block,
            content: filteredContent.content,
          });
          
          if (filteredContent.filtered) {
            result.filtered = true;
            result.matchCount += filteredContent.matchCount;
            result.dataTypes.push(...filteredContent.dataTypes);
          }
        } else {
          filteredMessage.content.push(block);
        }
      }
    }
    
    // Filter tool calls and results
    if (filteredMessage.toolCalls) {
      filteredMessage.toolCalls = filteredMessage.toolCalls.map(call => ({
        ...call,
        arguments: this.filterObject(call.arguments).content,
      }));
    }
    
    if (filteredMessage.toolResults) {
      filteredMessage.toolResults = filteredMessage.toolResults.map(toolResult => {
        const filteredContent = this.filterText(toolResult.content);
        if (filteredContent.filtered) {
          result.filtered = true;
          result.matchCount += filteredContent.matchCount;
          result.dataTypes.push(...filteredContent.dataTypes);
        }
        
        return {
          ...toolResult,
          content: filteredContent.content,
        };
      });
    }
    
    result.content = filteredMessage;
    
    return { message: filteredMessage, result };
  }
  
  /**
   * Filters sensitive data from text content.
   * 
   * @param text - Text to filter
   * @returns Filtering result
   */
  private filterText(text: string): FilterResult {
    let filteredText = text;
    let matchCount = 0;
    const dataTypes: string[] = [];
    
    // Default patterns for comprehensive sensitive data detection
    const patterns = [
      // API keys and tokens (very comprehensive patterns)
      // Match sk- followed by any characters (including spaces) - be very aggressive
      { regex: /sk-[^\n\r]*/g, type: 'api_key' },
      // Match sk- followed by spaces specifically (edge case)
      { regex: /sk-\s+/g, type: 'api_key' },
      // Generic long alphanumeric tokens
      { regex: /\b[A-Za-z0-9]{32,}\b/g, type: 'token' },
      
      // Email addresses (comprehensive patterns for edge cases)
      { regex: /@[A-Za-z0-9.\-\s]*\.[A-Za-z]{2,}/g, type: 'email' },
      { regex: /[A-Za-z0-9._%+\s\-!{}\[\]]*@[A-Za-z0-9.\-\s]*\.[A-Za-z]{2,}/g, type: 'email' },
      { regex: /\s*@\s*/g, type: 'email' },
      
      // URLs with credentials
      { regex: /https?:\/\/[^:]+:[^@]+@[^\s]+/g, type: 'url_with_credentials' },
      
      // File paths (absolute paths)
      { regex: /(?:[A-Z]:\\|\/)[^\s<>"'|?*]+/g, type: 'file_path' },
      
      // Environment variables
      { regex: /\$\{?[A-Z_][A-Z0-9_]*\}?/g, type: 'env_var' },
      
      // Common sensitive assignments
      { regex: /\bpassword\s*[:=]\s*\S+/gi, type: 'password' },
      { regex: /\btoken\s*[:=]\s*\S+/gi, type: 'token' },
      { regex: /\bkey\s*[:=]\s*\S+/gi, type: 'key' },
    ];
    
    // Apply default patterns
    for (const pattern of patterns) {
      const matches = filteredText.match(pattern.regex);
      if (matches) {
        filteredText = filteredText.replace(pattern.regex, this.config.redactionText);
        matchCount += matches.length;
        if (!dataTypes.includes(pattern.type)) {
          dataTypes.push(pattern.type);
        }
      }
    }
    
    // Apply custom patterns
    for (const patternStr of this.config.customPatterns) {
      try {
        // Skip empty patterns
        if (!patternStr || patternStr.trim().length === 0) {
          continue;
        }
        
        const regex = new RegExp(patternStr, 'g');
        const matches = filteredText.match(regex);
        if (matches) {
          filteredText = filteredText.replace(regex, this.config.redactionText);
          matchCount += matches.length;
          if (!dataTypes.includes('custom')) {
            dataTypes.push('custom');
          }
        }
      } catch (error) {
        console.warn(`Invalid custom sanitization pattern: ${patternStr}`);
      }
    }
    
    return {
      filtered: matchCount > 0,
      matchCount,
      dataTypes,
      content: filteredText,
      warnings: [],
    };
  }
  
  /**
   * Filters sensitive data from an object recursively.
   * 
   * @param obj - Object to filter
   * @returns Filtering result
   */
  private filterObject(obj: any): FilterResult {
    if (typeof obj === 'string') {
      return this.filterText(obj);
    } else if (Array.isArray(obj)) {
      const filtered = obj.map(item => this.filterObject(item).content);
      return {
        filtered: false, // Simplified for now
        matchCount: 0,
        dataTypes: [],
        content: filtered,
        warnings: [],
      };
    } else if (obj && typeof obj === 'object') {
      const filtered: any = {};
      for (const [key, value] of Object.entries(obj)) {
        filtered[key] = this.filterObject(value).content;
      }
      return {
        filtered: false, // Simplified for now
        matchCount: 0,
        dataTypes: [],
        content: filtered,
        warnings: [],
      };
    }
    
    return {
      filtered: false,
      matchCount: 0,
      dataTypes: [],
      content: obj,
      warnings: [],
    };
  }
  
  /**
   * Sanitizes a file path by removing sensitive directory information.
   * 
   * @param filePath - File path to sanitize
   * @returns Sanitized file path
   */
  private sanitizeFilePath(filePath: string): string {
    // Keep only the filename and immediate parent directory
    const parts = filePath.split(/[/\\]/);
    if (parts.length <= 2) {
      return filePath;
    }
    return `.../${parts.slice(-2).join('/')}`;
  }
}

// =============================================================================
// FILE PERMISSION MANAGER
// =============================================================================

/**
 * Manages file permissions for session storage security.
 */
export class FilePermissionManager {
  private readonly config: FilePermissionConfig;
  private readonly auditLogger?: AuditLogger;
  
  constructor(config: FilePermissionConfig, auditLogger?: AuditLogger) {
    this.config = config;
    if (auditLogger !== undefined) {
      this.auditLogger = auditLogger;
    }
  }
  
  /**
   * Creates a file with secure permissions.
   * 
   * @param filePath - Path to create
   * @param content - File content
   * @throws {Error} If file creation fails
   */
  async createSecureFile(filePath: string, content: string): Promise<void> {
    try {
      // Ensure directory exists with proper permissions
      const dir = dirname(filePath);
      await this.ensureSecureDirectory(dir);
      
      // Write file with secure permissions
      await fs.writeFile(filePath, content, { mode: this.config.sessionFileMode });
      
      // Verify permissions were set correctly
      if (this.config.validateOnRead) {
        const checkResult = await this.checkFilePermissions(filePath);
        if (!checkResult.valid && this.config.autoRepair) {
          await this.repairFilePermissions(filePath);
        }
      }
      
    } catch (error: any) {
      if (this.auditLogger) {
        await this.auditLogger.log({
          timestamp: Date.now(),
          event: 'permission_violation',
          actor: 'system',
          details: {
            filePath,
            operation: 'create',
            error: error.message,
          },
          level: 'error',
          error: error.message,
        });
      }
      throw new Error(`Failed to create secure file ${filePath}: ${error.message}`);
    }
  }
  
  /**
   * Ensures a directory exists with secure permissions.
   * 
   * @param dirPath - Directory path to create
   */
  async ensureSecureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { 
        recursive: true, 
        mode: this.config.directoryMode 
      });
    } catch (error: any) {
      // Directory might already exist, check permissions
      const stats = await fs.stat(dirPath).catch(() => null);
      if (stats && stats.isDirectory()) {
        // Directory exists, check permissions
        const currentMode = stats.mode & parseInt('777', 8);
        if (currentMode !== this.config.directoryMode && this.config.autoRepair) {
          await fs.chmod(dirPath, this.config.directoryMode);
        }
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Checks file permissions.
   * 
   * @param filePath - File path to check
   * @returns Permission check result
   */
  async checkFilePermissions(filePath: string): Promise<PermissionCheckResult> {
    try {
      const stats = await fs.stat(filePath);
      const currentMode = stats.mode & parseInt('777', 8);
      const expectedMode = this.config.sessionFileMode;
      
      // Check read/write access
      let readable = false;
      let writable = false;
      
      try {
        await fs.access(filePath, fs.constants.R_OK);
        readable = true;
      } catch {
        // Not readable
      }
      
      try {
        await fs.access(filePath, fs.constants.W_OK);
        writable = true;
      } catch {
        // Not writable
      }
      
      return {
        valid: currentMode === expectedMode,
        currentMode,
        expectedMode,
        readable,
        writable,
      };
      
    } catch (error: any) {
      return {
        valid: false,
        currentMode: 0,
        expectedMode: this.config.sessionFileMode,
        readable: false,
        writable: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Repairs file permissions.
   * 
   * @param filePath - File path to repair
   * @throws {Error} If repair fails
   */
  async repairFilePermissions(filePath: string): Promise<void> {
    try {
      await fs.chmod(filePath, this.config.sessionFileMode);
      
      if (this.auditLogger) {
        await this.auditLogger.log({
          timestamp: Date.now(),
          event: 'permission_repaired',
          actor: 'system',
          details: {
            filePath,
            mode: this.config.sessionFileMode.toString(8),
          },
          level: 'info',
        });
      }
      
    } catch (error: any) {
      if (this.auditLogger) {
        await this.auditLogger.log({
          timestamp: Date.now(),
          event: 'permission_violation',
          actor: 'system',
          details: {
            filePath,
            operation: 'repair',
            error: error.message,
          },
          level: 'error',
          error: error.message,
        });
      }
      throw new Error(`Failed to repair permissions for ${filePath}: ${error.message}`);
    }
  }
  
  /**
   * Validates file permissions on read operations.
   * 
   * @param filePath - File path to validate
   * @throws {Error} If validation fails and auto-repair is disabled
   */
  async validateFilePermissions(filePath: string): Promise<void> {
    if (!this.config.validateOnRead) {
      return;
    }
    
    const checkResult = await this.checkFilePermissions(filePath);
    
    if (!checkResult.valid) {
      if (this.config.autoRepair) {
        await this.repairFilePermissions(filePath);
      } else {
        throw new Error(
          `File permissions invalid for ${filePath}: ` +
          `expected ${checkResult.expectedMode.toString(8)}, ` +
          `got ${checkResult.currentMode.toString(8)}`
        );
      }
    }
  }
}

// =============================================================================
// AUDIT LOGGER
// =============================================================================

/**
 * Audit logger for session operations.
 */
export class AuditLogger {
  private readonly config: AuditLogConfig;
  private logBuffer: AuditLogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  
  constructor(config: AuditLogConfig) {
    this.config = config;
    
    // Schedule periodic log flushing
    this.flushTimer = setInterval(() => {
      this.flushLogs().catch(error => {
        console.error('Failed to flush audit logs:', error);
      });
    }, 5000); // Flush every 5 seconds
  }
  
  /**
   * Logs an audit event.
   * 
   * @param entry - Audit log entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    // Check log level
    const levels = ['debug', 'info', 'warn', 'error'];
    const entryLevel = levels.indexOf(entry.level);
    const configLevel = levels.indexOf(this.config.logLevel);
    
    if (entryLevel < configLevel) {
      return; // Entry level is below configured level
    }
    
    // Add to buffer
    this.logBuffer.push(entry);
    
    // Log to console if enabled
    if (this.config.logToConsole) {
      const message = this.formatLogEntry(entry);
      switch (entry.level) {
        case 'error':
          console.error(message);
          break;
        case 'warn':
          console.warn(message);
          break;
        case 'info':
          console.info(message);
          break;
        case 'debug':
          console.debug(message);
          break;
      }
    }
    
    // Flush immediately for error level
    if (entry.level === 'error') {
      await this.flushLogs();
    }
  }
  
  /**
   * Flushes buffered log entries to file.
   */
  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }
    
    try {
      // Ensure log directory exists
      const logDir = dirname(this.config.logFile);
      await fs.mkdir(logDir, { recursive: true });
      
      // Check if log rotation is needed
      await this.rotateLogsIfNeeded();
      
      // Format and write log entries
      const logLines = this.logBuffer.map(entry => this.formatLogEntry(entry));
      const logContent = logLines.join('\n') + '\n';
      
      await fs.appendFile(this.config.logFile, logContent);
      
      // Clear buffer
      this.logBuffer = [];
      
    } catch (error) {
      console.error('Failed to write audit logs:', error);
    }
  }
  
  /**
   * Rotates log files if size limit is exceeded.
   */
  private async rotateLogsIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.config.logFile);
      
      if (stats.size >= this.config.maxFileSize) {
        // Rotate existing files
        for (let i = this.config.maxFiles - 1; i >= 1; i--) {
          const oldFile = `${this.config.logFile}.${i}`;
          const newFile = `${this.config.logFile}.${i + 1}`;
          
          try {
            await fs.rename(oldFile, newFile);
          } catch {
            // File might not exist, continue
          }
        }
        
        // Move current log to .1
        await fs.rename(this.config.logFile, `${this.config.logFile}.1`);
        
        // Remove oldest file if it exists
        const oldestFile = `${this.config.logFile}.${this.config.maxFiles + 1}`;
        try {
          await fs.unlink(oldestFile);
        } catch {
          // File might not exist, ignore
        }
      }
    } catch {
      // Log file might not exist yet, ignore
    }
  }
  
  /**
   * Formats a log entry for output.
   * 
   * @param entry - Log entry to format
   * @returns Formatted log string
   */
  private formatLogEntry(entry: AuditLogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const details = JSON.stringify(entry.details);
    
    let message = `[${timestamp}] ${entry.level.toUpperCase()} ${entry.event} actor=${entry.actor}`;
    
    if (entry.sessionId) {
      message += ` session=${entry.sessionId}`;
    }
    
    message += ` details=${details}`;
    
    if (entry.error) {
      message += ` error="${entry.error}"`;
    }
    
    return message;
  }
  
  /**
   * Closes the audit logger and flushes remaining logs.
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      delete (this as any).flushTimer;
    }
    
    await this.flushLogs();
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a default sensitive data filter configuration.
 * 
 * @returns Default configuration
 */
export function createDefaultSensitiveDataConfig(): SensitiveDataConfig {
  return {
    enabled: true,
    customPatterns: [],
    preserveWorkspacePaths: false,
    redactionText: '[REDACTED]',
    logRedactions: true,
  };
}

/**
 * Creates a default file permission configuration.
 * 
 * @returns Default configuration
 */
export function createDefaultFilePermissionConfig(): FilePermissionConfig {
  return {
    sessionFileMode: 0o600, // Read/write for owner only
    directoryMode: 0o700,   // Read/write/execute for owner only
    validateOnRead: true,
    autoRepair: true,
  };
}

/**
 * Creates a default audit log configuration.
 * 
 * @param logFile - Path to log file
 * @returns Default configuration
 */
export function createDefaultAuditLogConfig(logFile: string): AuditLogConfig {
  return {
    enabled: false, // Disabled by default
    logFile,
    logLevel: 'info',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    logToConsole: false,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

// All types are already exported inline above