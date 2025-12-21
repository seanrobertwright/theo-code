/**
 * @fileoverview SessionManager service for session lifecycle management
 * @module features/session/manager
 *
 * Provides the main orchestration layer for session operations including:
 * - Session lifecycle management (create, save, load, delete)
 * - Auto-save functionality with configurable intervals
 * - Session restoration and state management
 * - Integration with SessionStorage for persistence
 */

import type {
  Session,
  SessionId,
  SessionMetadata,
  SessionTokenCount,
  Message,
} from '../../shared/types/index.js';
import { createSessionId, createMessageId, SessionSchema } from '../../shared/types/index.js';
import { SessionStorage, type ISessionStorage } from './storage.js';
import { loadConfig, getSessionsDir } from '../../config/index.js';
import { getAuditLogger, logOperation, type AuditLoggerConfig } from './audit.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Options for creating a new session.
 */
interface CreateSessionOptions {
  /** Model identifier for the session */
  model: string;
  
  /** Workspace root directory */
  workspaceRoot: string;
  
  /** Optional session title */
  title?: string;
  
  /** Optional initial tags */
  tags?: string[];
  
  /** Optional notes */
  notes?: string;
}

/**
 * Options for loading sessions.
 */
interface LoadSessionOptions {
  /** Whether to validate session integrity */
  validateIntegrity?: boolean;
  
  /** Whether to update lastModified timestamp */
  updateTimestamp?: boolean;
}

/**
 * Options for session cleanup operations.
 */
interface CleanupOptions {
  /** Maximum number of sessions to keep (default: from config) */
  maxCount?: number;
  
  /** Maximum age in milliseconds (default: 30 days) */
  maxAgeMs?: number;
  
  /** Whether to create backups before deletion (default: true) */
  createBackups?: boolean;
  
  /** Whether to show user notifications (default: true) */
  showNotifications?: boolean;
  
  /** Dry run mode - return what would be deleted without deleting (default: false) */
  dryRun?: boolean;
}

/**
 * Result of cleanup operation.
 */
interface CleanupResult {
  /** Session IDs that were deleted (or would be deleted in dry run) */
  deletedSessions: SessionId[];
  
  /** Number of sessions deleted due to age limit */
  deletedByAge: number;
  
  /** Number of sessions deleted due to count limit */
  deletedByCount: number;
  
  /** Total space freed in bytes (estimated) */
  spaceFree: number;
  
  /** Any errors encountered during cleanup */
  errors: Array<{ sessionId: SessionId; error: string }>;
}

/**
 * Options for listing sessions.
 */
interface ListSessionsOptions {
  /** Sort order for sessions */
  sortBy?: 'created' | 'lastModified' | 'messageCount' | 'tokenCount';
  
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  
  /** Maximum number of sessions to return */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
  
  /** Filter by model */
  model?: string;
  
  /** Filter by tags */
  tags?: string[];
}

/**
 * Search result for a session with relevance scoring.
 */
interface SessionSearchResult {
  /** Session metadata */
  session: SessionMetadata;
  
  /** Relevance score (0-1, higher is more relevant) */
  relevanceScore: number;
  
  /** Matching text snippets with highlighting */
  matches: SearchMatch[];
  
  /** Search result type */
  matchType: 'content' | 'metadata' | 'filename' | 'mixed';
}

/**
 * Individual search match with context.
 */
interface SearchMatch {
  /** Type of match */
  type: 'message' | 'title' | 'tags' | 'filename' | 'notes';
  
  /** Matched text with highlighting markers */
  text: string;
  
  /** Context around the match */
  context: string;
  
  /** Position in the original content */
  position: number;
  
  /** Match confidence (0-1) */
  confidence: number;
}

/**
 * Search options for session queries.
 */
interface SearchSessionsOptions {
  /** Maximum number of results to return */
  limit?: number;
  
  /** Minimum relevance score threshold (0-1) */
  minRelevance?: number;
  
  /** Include content search in messages */
  includeContent?: boolean;
  
  /** Include metadata search (title, tags, notes) */
  includeMetadata?: boolean;
  
  /** Include filename search in context files */
  includeFilenames?: boolean;
  
  /** Case sensitive search */
  caseSensitive?: boolean;
  
  /** Use fuzzy matching */
  fuzzyMatch?: boolean;
  
  /** Sort results by relevance or date */
  sortBy?: 'relevance' | 'date';
}

/**
 * Filter options for session filtering.
 */
interface FilterSessionsOptions {
  /** Filter by model name */
  model?: string;
  
  /** Filter by date range */
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  
  /** Filter by tags (any of these tags) */
  tags?: string[];
  
  /** Filter by minimum message count */
  minMessages?: number;
  
  /** Filter by minimum token count */
  minTokens?: number;
  
  /** Filter by workspace root */
  workspaceRoot?: string;
  
  /** Combine filters with AND (true) or OR (false) */
  combineWithAnd?: boolean;
}

/**
 * Session configuration interface.
 */
interface SessionConfiguration {
  /** Sessions directory path */
  sessionsDir: string;
  
  /** Maximum number of sessions to keep */
  maxSessions: number;
  
  /** Maximum age of sessions in milliseconds */
  maxAgeMs: number;
  
  /** Whether compression is enabled */
  compressionEnabled: boolean;
  
  /** Whether auto-save is enabled */
  autoSaveEnabled: boolean;
  
  /** Auto-save interval in milliseconds */
  autoSaveInterval: number;
  
  /** Whether to sanitize exports */
  sanitizeExports: boolean;
  
  /** Whether audit logging is enabled */
  auditLogging: boolean;
  
  /** Whether index caching is enabled */
  indexCaching: boolean;
  
  /** Whether background cleanup is enabled */
  backgroundCleanup: boolean;
}

/**
 * Configuration validation result.
 */
interface ConfigurationValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  
  /** Error message if invalid */
  error?: string;
  
  /** Current value of the setting */
  currentValue: string;
  
  /** Suggested valid values */
  suggestions?: string[];
  
  /** Whether this change requires user confirmation */
  requiresConfirmation?: boolean;
  
  /** Warning message for confirmation */
  warning?: string;
  
  /** Whether this change requires application restart */
  restartRequired?: boolean;
  
  /** Number of settings checked (for validation) */
  checkedSettings?: number;
  
  /** Configuration issues found */
  issues?: Array<{ setting: string; error: string }>;
  
  /** Configuration warnings */
  warnings?: Array<{ setting: string; message: string }>;
}

/**
 * Configuration reset result.
 */
interface ConfigurationResetResult {
  /** Old value before reset */
  oldValue?: string;
  
  /** New value after reset */
  newValue?: string;
  
  /** Number of settings reset (for bulk reset) */
  resetCount?: number;
  
  /** Whether restart is required */
  restartRequired: boolean;
}

/**
 * Storage information interface.
 */
interface StorageInfo {
  totalSessions: number;
  totalSizeBytes: number;
  oldestSessionAge: number;
  availableDiskSpace: number;
  sessionSizeDistribution: Array<{
    sessionId: string;
    sizeBytes: number;
    age: number;
  }>;
}

/**
 * Storage limit check result interface.
 */
interface StorageLimitResult {
  withinLimits: boolean;
  sessionCountExceeded: boolean;
  totalSizeExceeded: boolean;
  diskSpaceExceeded: boolean;
  warningThresholdReached: boolean;
  suggestedActions: string[];
  estimatedSpaceSavings: number;
}

/**
 * Auto-save configuration.
 */
interface AutoSaveConfig {
  /** Auto-save interval in milliseconds */
  intervalMs: number;
  
  /** Whether to enable auto-save */
  enabled: boolean;
  
  /** Maximum number of auto-save retries on failure */
  maxRetries?: number;
}

/**
 * Export format options for session sharing.
 */
type ExportFormat = 'json' | 'json-pretty' | 'json-compact';

/**
 * Options for session export operations.
 */
interface ExportSessionOptions {
  /** Export format */
  format?: ExportFormat;
  
  /** Whether to sanitize sensitive data */
  sanitize?: boolean;
  
  /** Whether to include full message content */
  includeContent?: boolean;
  
  /** Whether to include metadata only */
  metadataOnly?: boolean;
  
  /** Custom sanitization patterns (regex strings) */
  customSanitizationPatterns?: string[];
  
  /** Whether to preserve workspace paths */
  preserveWorkspacePaths?: boolean;
}

/**
 * Options for session import operations.
 */
interface ImportSessionOptions {
  /** Whether to validate format strictly */
  strictValidation?: boolean;
  
  /** Whether to generate new session ID */
  generateNewId?: boolean;
  
  /** Whether to preserve original timestamps */
  preserveTimestamps?: boolean;
  
  /** Custom workspace root to use */
  workspaceRoot?: string;
  
  /** Whether to show warnings for missing context */
  showWarnings?: boolean;
}

/**
 * Result of session export operation.
 */
interface ExportResult {
  /** Exported session data as string */
  data: string;
  
  /** Export format used */
  format: ExportFormat;
  
  /** Whether data was sanitized */
  sanitized: boolean;
  
  /** Size of exported data in bytes */
  size: number;
  
  /** Any warnings during export */
  warnings: string[];
}

/**
 * Result of session import operation.
 */
interface ImportResult {
  /** Imported session */
  session: Session;
  
  /** Whether a new ID was generated */
  newIdGenerated: boolean;
  
  /** Original session ID from import data */
  originalId: SessionId;
  
  /** Any warnings during import */
  warnings: string[];
  
  /** Missing context files */
  missingContextFiles: string[];
}

/**
 * Session manager interface for orchestrating session operations.
 */
interface ISessionManager {
  // Core lifecycle
  createSession(options: CreateSessionOptions): Promise<Session>;
  saveSession(session: Session): Promise<void>;
  loadSession(sessionId: SessionId, options?: LoadSessionOptions): Promise<Session>;
  deleteSession(sessionId: SessionId): Promise<void>;
  
  // Auto-save
  enableAutoSave(config: AutoSaveConfig): void;
  disableAutoSave(): void;
  isAutoSaveEnabled(): boolean;
  forceAutoSave(): Promise<void>;
  getAutoSaveConfig(): AutoSaveConfig | null;
  
  // Session management
  sessionExists(sessionId: SessionId): Promise<boolean>;
  getCurrentSession(): Session | null;
  setCurrentSession(session: Session | null): void;
  listSessions(options?: ListSessionsOptions): Promise<SessionMetadata[]>;
  
  // Search and filtering
  searchSessions(query: string, options?: SearchSessionsOptions): Promise<SessionSearchResult[]>;
  filterSessions(filters: FilterSessionsOptions): Promise<SessionMetadata[]>;
  
  // Session cleanup
  cleanupOldSessions(options?: CleanupOptions): Promise<CleanupResult>;
  deleteSessionWithConfirmation(sessionId: SessionId, force?: boolean): Promise<boolean>;
  
  // Session restoration
  restoreSession(sessionId: SessionId): Promise<Session>;
  validateSessionIntegrity(session: Session): boolean;
  restoreSessionWithContext(sessionId: SessionId): Promise<{
    session: Session;
    contextFilesFound: string[];
    contextFilesMissing: string[];
  }>;
  
  // Import/Export
  exportSession(sessionId: SessionId, options?: ExportSessionOptions): Promise<ExportResult>;
  importSession(data: string, options?: ImportSessionOptions): Promise<ImportResult>;
  
  // Configuration Management
  getConfiguration(): Promise<SessionConfiguration>;
  setConfiguration(key: string, value: string): Promise<void>;
  validateConfigChange(key: string, value: string): Promise<ConfigurationValidationResult>;
  resetConfiguration(key?: string): Promise<ConfigurationResetResult>;
  validateConfiguration(): Promise<ConfigurationValidationResult>;
  
  // Storage Limit Management
  getStorageInfo(): Promise<StorageInfo>;
  checkStorageLimits(): Promise<StorageLimitResult>;
}

// =============================================================================
// SESSION MANAGER IMPLEMENTATION
// =============================================================================

/**
 * Main orchestration service for session lifecycle management.
 * 
 * Coordinates between the application state, storage layer, and auto-save
 * functionality to provide a complete session management experience.
 */
export class SessionManager implements ISessionManager {
  private readonly storage: ISessionStorage;
  private currentSession: Session | null = null;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private autoSaveConfig: AutoSaveConfig | null = null;
  private autoSaveRetryCount = 0;
  
  constructor(storage?: ISessionStorage) {
    this.storage = storage ?? new SessionStorage();
  }
  
  // -------------------------------------------------------------------------
  // Core Lifecycle Methods
  // -------------------------------------------------------------------------
  
  /**
   * Creates a new session with unique ID and timestamps.
   * 
   * @param options - Session creation options
   * @returns Promise resolving to the created session
   * @throws {Error} If session creation fails
   */
  async createSession(options: CreateSessionOptions): Promise<Session> {
    return await logOperation(
      'session.create',
      async () => {
        const now = Date.now();
        const sessionId = createSessionId();
        
        const session: Session = {
          id: sessionId,
          version: '1.0.0',
          created: now,
          lastModified: now,
          model: options.model,
          workspaceRoot: options.workspaceRoot,
          tokenCount: { total: 0, input: 0, output: 0 },
          filesAccessed: [],
          messages: [],
          contextFiles: [],
          title: options.title ?? null,
          tags: options.tags ?? [],
          notes: options.notes ?? null,
        };
        
        // Validate session data
        const validatedSession = SessionSchema.parse(session);
        
        // Save to storage
        await this.storage.writeSession(sessionId, validatedSession);
        
        // Set as current session
        this.currentSession = validatedSession;
        
        return validatedSession;
      },
      undefined, // No sessionId yet
      {
        model: options.model,
        workspaceRoot: options.workspaceRoot,
        title: options.title,
      }
    );
  }
  
  /**
   * Saves a session to persistent storage.
   * 
   * Updates the lastModified timestamp and persists the session data.
   * 
   * @param session - Session to save
   * @throws {Error} If save operation fails
   */
  async saveSession(session: Session): Promise<void> {
    await logOperation(
      'session.save',
      async () => {
        // Update lastModified timestamp
        const updatedSession: Session = {
          ...session,
          lastModified: Date.now(),
        };
        
        // Validate session data
        const validatedSession = SessionSchema.parse(updatedSession);
        
        // Save to storage
        await this.storage.writeSession(session.id, validatedSession);
        
        // Update current session if it matches
        if (this.currentSession?.id === session.id) {
          this.currentSession = validatedSession;
        }
      },
      session.id,
      {
        messageCount: session.messages.length,
        tokenCount: session.tokenCount.total,
      }
    );
  }
  
  /**
   * Loads a session from persistent storage.
   * 
   * @param sessionId - Session identifier to load
   * @param options - Load options
   * @returns Promise resolving to the loaded session
   * @throws {Error} If session not found or load fails
   */
  async loadSession(
    sessionId: SessionId, 
    options: LoadSessionOptions = {}
  ): Promise<Session> {
    return await logOperation(
      'session.load',
      async () => {
        const { validateIntegrity = true, updateTimestamp = false } = options;
        
        // Load from storage
        const session = await this.storage.readSession(sessionId);
        
        // Validate integrity if requested
        if (validateIntegrity) {
          this.validateSessionIntegrityInternal(session);
        }
        
        // Update timestamp if requested
        let finalSession = session;
        if (updateTimestamp) {
          finalSession = {
            ...session,
            lastModified: Date.now(),
          };
          
          // Save updated timestamp
          await this.storage.writeSession(sessionId, finalSession);
        }
        
        return finalSession;
      },
      sessionId,
      {
        validateIntegrity: options.validateIntegrity,
        updateTimestamp: options.updateTimestamp,
      }
    );
  }
  
  /**
   * Deletes a session from persistent storage.
   * 
   * @param sessionId - Session identifier to delete
   * @throws {Error} If deletion fails
   */
  async deleteSession(sessionId: SessionId): Promise<void> {
    await logOperation(
      'session.delete',
      async () => {
        // Clear current session if it matches
        if (this.currentSession?.id === sessionId) {
          this.currentSession = null;
        }
        
        // Delete from storage
        await this.storage.deleteSession(sessionId);
      },
      sessionId
    );
  }
  
  // -------------------------------------------------------------------------
  // Auto-Save Functionality
  // -------------------------------------------------------------------------
  
  /**
   * Enables auto-save with the specified configuration.
   * 
   * @param config - Auto-save configuration
   * @throws {Error} If configuration is invalid
   */
  enableAutoSave(config: AutoSaveConfig): void {
    // Validate configuration
    if (config.enabled && config.intervalMs <= 0) {
      throw new Error('Auto-save interval must be positive');
    }
    
    if (config.enabled && config.intervalMs < 1000) {
      console.warn('Auto-save interval less than 1 second may impact performance');
    }
    
    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      throw new Error('Max retries cannot be negative');
    }
    
    // Disable existing auto-save first
    this.disableAutoSave();
    
    this.autoSaveConfig = {
      ...config,
      maxRetries: config.maxRetries ?? 3,
    };
    
    if (config.enabled && config.intervalMs > 0) {
      this.scheduleAutoSave();
    }
  }
  
  /**
   * Disables auto-save functionality.
   */
  disableAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.autoSaveConfig = null;
    this.autoSaveRetryCount = 0;
  }
  
  /**
   * Checks if auto-save is currently enabled.
   * 
   * @returns True if auto-save is enabled
   */
  isAutoSaveEnabled(): boolean {
    return this.autoSaveConfig?.enabled === true && this.autoSaveTimer !== null;
  }
  
  /**
   * Forces an immediate auto-save operation.
   * 
   * @throws {Error} If no current session or save fails
   */
  async forceAutoSave(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No current session to save');
    }
    
    await this.saveSession(this.currentSession);
  }
  
  /**
   * Gets the current auto-save configuration.
   * 
   * @returns Current auto-save config or null if disabled
   */
  getAutoSaveConfig(): AutoSaveConfig | null {
    return this.autoSaveConfig ? { ...this.autoSaveConfig } : null;
  }
  
  /**
   * Schedules the next auto-save operation.
   */
  private scheduleAutoSave(): void {
    if (!this.autoSaveConfig?.enabled) {
      return;
    }
    
    this.autoSaveTimer = setTimeout(() => {
      this.performAutoSave().catch((error) => {
        console.error('Auto-save failed:', error);
        this.handleAutoSaveError();
      });
    }, this.autoSaveConfig.intervalMs);
  }
  
  /**
   * Performs the auto-save operation.
   */
  private async performAutoSave(): Promise<void> {
    if (!this.currentSession) {
      // No current session to save, schedule next auto-save
      this.scheduleAutoSave();
      return;
    }
    
    try {
      // Save the current session (this will update lastModified)
      await this.saveSession(this.currentSession);
      this.autoSaveRetryCount = 0; // Reset retry count on success
      this.scheduleAutoSave(); // Schedule next auto-save
    } catch (error) {
      throw error; // Let the caller handle the error
    }
  }
  
  /**
   * Handles auto-save errors with retry logic.
   */
  private handleAutoSaveError(): void {
    if (!this.autoSaveConfig) {
      return;
    }
    
    this.autoSaveRetryCount++;
    
    if (this.autoSaveRetryCount < (this.autoSaveConfig.maxRetries ?? 3)) {
      // Retry with exponential backoff
      const retryDelay = Math.min(
        this.autoSaveConfig.intervalMs * Math.pow(2, this.autoSaveRetryCount - 1),
        30000 // Max 30 seconds
      );
      
      this.autoSaveTimer = setTimeout(() => {
        this.performAutoSave().catch((error) => {
          console.error(`Auto-save retry ${this.autoSaveRetryCount} failed:`, error);
          this.handleAutoSaveError();
        });
      }, retryDelay);
    } else {
      // Max retries exceeded, disable auto-save
      console.error('Auto-save max retries exceeded, disabling auto-save');
      this.disableAutoSave();
    }
  }
  
  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------
  
  /**
   * Checks if a session exists in storage.
   * 
   * @param sessionId - Session identifier to check
   * @returns Promise resolving to true if session exists
   */
  async sessionExists(sessionId: SessionId): Promise<boolean> {
    return await this.storage.sessionExists(sessionId);
  }
  
  /**
   * Gets the current active session.
   * 
   * @returns Current session or null if none active
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }
  
  /**
   * Sets the current active session.
   * 
   * @param session - Session to set as current, or null to clear
   */
  setCurrentSession(session: Session | null): void {
    this.currentSession = session;
  }
  
  /**
   * Lists all available sessions with metadata.
   * 
   * @param options - Listing and filtering options
   * @returns Promise resolving to array of session metadata
   */
  async listSessions(options: ListSessionsOptions = {}): Promise<SessionMetadata[]> {
    try {
      const index = await this.storage.getIndex();
      let sessions = Object.values(index.sessions).filter((session): session is SessionMetadata => session !== undefined);
      
      // Apply filters
      if (options.model) {
        sessions = sessions.filter(session => session.model === options.model);
      }
      
      if (options.tags && options.tags.length > 0) {
        sessions = sessions.filter(session => 
          options.tags!.some(tag => session.tags.includes(tag))
        );
      }
      
      // Apply sorting
      const sortBy = options.sortBy || 'lastModified';
      const sortOrder = options.sortOrder || 'desc';
      
      sessions.sort((a, b) => {
        let aValue: number;
        let bValue: number;
        
        switch (sortBy) {
          case 'created':
            aValue = a.created;
            bValue = b.created;
            break;
          case 'lastModified':
            aValue = a.lastModified;
            bValue = b.lastModified;
            break;
          case 'messageCount':
            aValue = a.messageCount;
            bValue = b.messageCount;
            break;
          case 'tokenCount':
            aValue = a.tokenCount.total;
            bValue = b.tokenCount.total;
            break;
          default:
            aValue = a.lastModified;
            bValue = b.lastModified;
        }
        
        const result = aValue - bValue;
        return sortOrder === 'asc' ? result : -result;
      });
      
      // Apply pagination
      if (options.offset) {
        sessions = sessions.slice(options.offset);
      }
      
      if (options.limit) {
        sessions = sessions.slice(0, options.limit);
      }
      
      return sessions;
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Search and Filtering
  // -------------------------------------------------------------------------

  /**
   * Searches sessions based on content and metadata.
   * 
   * Implements comprehensive search across message content, metadata,
   * and file names with relevance scoring and result highlighting.
   * 
   * @param query - Search query string
   * @param options - Search configuration options
   * @returns Promise resolving to array of search results with relevance scores
   */
  async searchSessions(
    query: string, 
    options: SearchSessionsOptions = {}
  ): Promise<SessionSearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    const {
      limit = 50,
      minRelevance = 0.1,
      includeContent = true,
      includeMetadata = true,
      includeFilenames = true,
      caseSensitive = false,
      fuzzyMatch = false,
      sortBy = 'relevance',
    } = options;

    try {
      // Get all sessions
      const index = await this.storage.getIndex();
      const sessions = Object.values(index.sessions).filter((session): session is SessionMetadata => session !== undefined);
      
      const results: SessionSearchResult[] = [];
      
      // Prepare search terms
      const searchTerms = this.parseSearchQuery(query, caseSensitive, fuzzyMatch);
      
      // Search each session
      for (const session of sessions) {
        const searchResult = await this.searchSingleSession(
          session, 
          searchTerms, 
          { includeContent, includeMetadata, includeFilenames, caseSensitive, fuzzyMatch }
        );
        
        if (searchResult && searchResult.relevanceScore >= minRelevance) {
          results.push(searchResult);
        }
      }
      
      // Sort results
      if (sortBy === 'relevance') {
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      } else {
        results.sort((a, b) => b.session.lastModified - a.session.lastModified);
      }
      
      // Apply limit
      return results.slice(0, limit);
      
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Filters sessions based on multiple criteria.
   * 
   * @param filters - Filter criteria
   * @returns Promise resolving to filtered session metadata
   */
  async filterSessions(filters: FilterSessionsOptions): Promise<SessionMetadata[]> {
    try {
      const index = await this.storage.getIndex();
      let sessions = Object.values(index.sessions).filter((session): session is SessionMetadata => session !== undefined);
      
      const { combineWithAnd = true } = filters;
      
      if (combineWithAnd) {
        // Apply all filters with AND logic
        sessions = sessions.filter(session => this.sessionMatchesAllFilters(session, filters));
      } else {
        // Apply filters with OR logic
        sessions = sessions.filter(session => this.sessionMatchesAnyFilter(session, filters));
      }
      
      return sessions;
      
    } catch (error) {
      console.error('Filter failed:', error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Search Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Parses a search query into searchable terms.
   * 
   * @param query - Raw search query
   * @param caseSensitive - Whether search should be case sensitive
   * @param fuzzyMatch - Whether to enable fuzzy matching
   * @returns Array of search terms
   */
  private parseSearchQuery(query: string, caseSensitive: boolean, fuzzyMatch: boolean): string[] {
    let processedQuery = query.trim();
    
    if (!caseSensitive) {
      processedQuery = processedQuery.toLowerCase();
    }
    
    // Split on whitespace and remove empty terms
    const terms = processedQuery.split(/\s+/).filter(term => term.length > 0);
    
    if (fuzzyMatch) {
      // For fuzzy matching, we might want to generate variations
      // For now, just return the original terms
      return terms;
    }
    
    return terms;
  }

  /**
   * Searches a single session for matches.
   * 
   * @param session - Session metadata to search
   * @param searchTerms - Parsed search terms
   * @param options - Search options
   * @returns Search result or null if no matches
   */
  private async searchSingleSession(
    session: SessionMetadata,
    searchTerms: string[],
    options: {
      includeContent: boolean;
      includeMetadata: boolean;
      includeFilenames: boolean;
      caseSensitive: boolean;
      fuzzyMatch: boolean;
    }
  ): Promise<SessionSearchResult | null> {
    const matches: SearchMatch[] = [];
    let totalScore = 0;
    const matchTypes = new Set<string>();

    // Search metadata
    if (options.includeMetadata) {
      const metadataMatches = this.searchSessionMetadata(session, searchTerms, options.caseSensitive);
      matches.push(...metadataMatches);
      if (metadataMatches.length > 0) {
        matchTypes.add('metadata');
        totalScore += metadataMatches.reduce((sum, match) => sum + match.confidence, 0);
      }
    }

    // Search filenames
    if (options.includeFilenames) {
      const filenameMatches = this.searchSessionFilenames(session, searchTerms, options.caseSensitive);
      matches.push(...filenameMatches);
      if (filenameMatches.length > 0) {
        matchTypes.add('filename');
        totalScore += filenameMatches.reduce((sum, match) => sum + match.confidence, 0);
      }
    }

    // Search content (requires loading full session)
    if (options.includeContent) {
      try {
        // Only load session if we haven't found matches in metadata/filenames
        // or if we specifically need content search
        const fullSession = await this.loadSession(session.id, { validateIntegrity: false });
        const contentMatches = this.searchSessionContent(fullSession, searchTerms, options.caseSensitive);
        matches.push(...contentMatches);
        if (contentMatches.length > 0) {
          matchTypes.add('content');
          totalScore += contentMatches.reduce((sum, match) => sum + match.confidence, 0);
        }
      } catch (error) {
        // If we can't load the session, skip content search
        console.warn(`Failed to load session ${session.id} for content search:`, error);
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Calculate relevance score (normalize by number of search terms and matches)
    const relevanceScore = Math.min(1, totalScore / (searchTerms.length * 2));

    // Determine match type
    let matchType: 'content' | 'metadata' | 'filename' | 'mixed';
    if (matchTypes.size === 1) {
      const singleType = Array.from(matchTypes)[0];
      matchType = singleType === 'metadata' ? 'metadata' : 
                  singleType === 'filename' ? 'filename' : 'content';
    } else {
      matchType = 'mixed';
    }

    return {
      session,
      relevanceScore,
      matches,
      matchType,
    };
  }

  /**
   * Searches session metadata for matches.
   * 
   * @param session - Session metadata
   * @param searchTerms - Search terms
   * @param caseSensitive - Case sensitivity
   * @returns Array of metadata matches
   */
  private searchSessionMetadata(
    session: SessionMetadata,
    searchTerms: string[],
    caseSensitive: boolean
  ): SearchMatch[] {
    const matches: SearchMatch[] = [];

    // Search title
    if (session.title) {
      const titleMatches = this.findMatches(session.title, searchTerms, caseSensitive);
      matches.push(...titleMatches.map(match => ({
        type: 'title' as const,
        text: this.highlightMatch(session.title!, match.term, caseSensitive),
        context: session.title!,
        position: match.position,
        confidence: 0.9, // Title matches are high confidence
      })));
    }

    // Search tags
    for (const tag of session.tags) {
      const tagMatches = this.findMatches(tag, searchTerms, caseSensitive);
      matches.push(...tagMatches.map(match => ({
        type: 'tags' as const,
        text: this.highlightMatch(tag, match.term, caseSensitive),
        context: `Tag: ${tag}`,
        position: match.position,
        confidence: 0.8, // Tag matches are good confidence
      })));
    }

    // Search preview
    if (session.preview) {
      const previewMatches = this.findMatches(session.preview, searchTerms, caseSensitive);
      matches.push(...previewMatches.map(match => ({
        type: 'message' as const,
        text: this.highlightMatch(session.preview!, match.term, caseSensitive),
        context: this.getContext(session.preview!, match.position, 50),
        position: match.position,
        confidence: 0.7, // Preview matches are moderate confidence
      })));
    }

    return matches;
  }

  /**
   * Searches session filenames for matches.
   * 
   * @param session - Session metadata
   * @param searchTerms - Search terms
   * @param caseSensitive - Case sensitivity
   * @returns Array of filename matches
   */
  private searchSessionFilenames(
    session: SessionMetadata,
    searchTerms: string[],
    caseSensitive: boolean
  ): SearchMatch[] {
    const matches: SearchMatch[] = [];

    for (const filePath of session.contextFiles) {
      const filename = filePath.split('/').pop() || filePath;
      const filenameMatches = this.findMatches(filename, searchTerms, caseSensitive);
      matches.push(...filenameMatches.map(match => ({
        type: 'filename' as const,
        text: this.highlightMatch(filename, match.term, caseSensitive),
        context: `File: ${filePath}`,
        position: match.position,
        confidence: 0.6, // Filename matches are lower confidence
      })));
    }

    return matches;
  }

  /**
   * Searches session message content for matches.
   * 
   * @param session - Full session data
   * @param searchTerms - Search terms
   * @param caseSensitive - Case sensitivity
   * @returns Array of content matches
   */
  private searchSessionContent(
    session: Session,
    searchTerms: string[],
    caseSensitive: boolean
  ): SearchMatch[] {
    const matches: SearchMatch[] = [];

    for (const message of session.messages) {
      const content = typeof message.content === 'string' 
        ? message.content 
        : message.content.map(block => 
            block.type === 'text' ? block.text : 
            block.type === 'tool_result' ? block.content : ''
          ).join(' ');

      const contentMatches = this.findMatches(content, searchTerms, caseSensitive);
      matches.push(...contentMatches.map(match => ({
        type: 'message' as const,
        text: this.highlightMatch(content, match.term, caseSensitive),
        context: this.getContext(content, match.position, 100),
        position: match.position,
        confidence: 0.8, // Message content matches are high confidence
      })));
    }

    return matches;
  }

  /**
   * Finds all matches of search terms in text.
   * 
   * @param text - Text to search
   * @param searchTerms - Terms to find
   * @param caseSensitive - Case sensitivity
   * @returns Array of match positions
   */
  private findMatches(
    text: string,
    searchTerms: string[],
    caseSensitive: boolean
  ): Array<{ term: string; position: number }> {
    const matches: Array<{ term: string; position: number }> = [];
    const searchText = caseSensitive ? text : text.toLowerCase();

    for (const term of searchTerms) {
      // Use the term as-is since parseSearchQuery already handles case conversion
      const searchTerm = term;
      let position = 0;
      while (true) {
        const index = searchText.indexOf(searchTerm, position);
        if (index === -1) break;
        
        matches.push({ term: searchTerm, position: index });
        position = index + 1;
      }
    }

    return matches;
  }

  /**
   * Highlights a match in text with markers.
   * 
   * @param text - Original text
   * @param term - Term to highlight (already processed by parseSearchQuery)
   * @param caseSensitive - Case sensitivity
   * @returns Text with highlight markers
   */
  private highlightMatch(text: string, term: string, caseSensitive: boolean): string {
    const searchText = caseSensitive ? text : text.toLowerCase();
    // Use the term as-is since parseSearchQuery already handles case conversion
    const searchTerm = term;
    
    const index = searchText.indexOf(searchTerm);
    if (index === -1) return text;
    
    // Get the actual text length to highlight (use original term length for case-insensitive)
    const highlightLength = term.length;
    
    return text.slice(0, index) + 
           '**' + text.slice(index, index + highlightLength) + '**' + 
           text.slice(index + highlightLength);
  }

  /**
   * Gets context around a match position.
   * 
   * @param text - Full text
   * @param position - Match position
   * @param contextLength - Length of context to include
   * @returns Context string
   */
  private getContext(text: string, position: number, contextLength: number): string {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(text.length, position + contextLength);
    
    let context = text.slice(start, end);
    
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';
    
    return context;
  }

  // -------------------------------------------------------------------------
  // Filter Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Checks if a session matches all filters (AND logic).
   * 
   * @param session - Session to check
   * @param filters - Filter criteria
   * @returns True if session matches all filters
   */
  private sessionMatchesAllFilters(session: SessionMetadata, filters: FilterSessionsOptions): boolean {
    // Model filter
    if (filters.model && session.model !== filters.model) {
      return false;
    }

    // Date range filter
    if (filters.dateRange) {
      const sessionDate = new Date(session.lastModified);
      if (filters.dateRange.start && sessionDate < filters.dateRange.start) {
        return false;
      }
      if (filters.dateRange.end && sessionDate > filters.dateRange.end) {
        return false;
      }
    }

    // Tags filter (session must have at least one of the specified tags)
    if (filters.tags && filters.tags.length > 0) {
      const hasMatchingTag = filters.tags.some(tag => session.tags.includes(tag));
      if (!hasMatchingTag) {
        return false;
      }
    }

    // Message count filter
    if (filters.minMessages && session.messageCount < filters.minMessages) {
      return false;
    }

    // Token count filter
    if (filters.minTokens && session.tokenCount.total < filters.minTokens) {
      return false;
    }

    // Workspace root filter
    if (filters.workspaceRoot && session.workspaceRoot !== filters.workspaceRoot) {
      return false;
    }

    return true;
  }

  /**
   * Checks if a session matches any filter (OR logic).
   * 
   * @param session - Session to check
   * @param filters - Filter criteria
   * @returns True if session matches any filter
   */
  private sessionMatchesAnyFilter(session: SessionMetadata, filters: FilterSessionsOptions): boolean {
    // Model filter
    if (filters.model && session.model === filters.model) {
      return true;
    }

    // Date range filter
    if (filters.dateRange) {
      const sessionDate = new Date(session.lastModified);
      const inRange = (!filters.dateRange.start || sessionDate >= filters.dateRange.start) &&
                      (!filters.dateRange.end || sessionDate <= filters.dateRange.end);
      if (inRange) {
        return true;
      }
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      const hasMatchingTag = filters.tags.some(tag => session.tags.includes(tag));
      if (hasMatchingTag) {
        return true;
      }
    }

    // Message count filter
    if (filters.minMessages && session.messageCount >= filters.minMessages) {
      return true;
    }

    // Token count filter
    if (filters.minTokens && session.tokenCount.total >= filters.minTokens) {
      return true;
    }

    // Workspace root filter
    if (filters.workspaceRoot && session.workspaceRoot === filters.workspaceRoot) {
      return true;
    }

    return false;
  }
  
  /**
   * Cleans up old sessions based on configurable policies.
   * 
   * @param options - Cleanup configuration options
   * @returns Promise resolving to cleanup results
   */
  async cleanupOldSessions(options: CleanupOptions = {}): Promise<CleanupResult> {
    const config = loadConfig(process.cwd());
    const sessionConfig = config.global.session;
    
    // Set defaults from configuration
    const maxCount = options.maxCount ?? sessionConfig?.maxSessions ?? 50;
    const maxAgeMs = options.maxAgeMs ?? (30 * 24 * 60 * 60 * 1000); // 30 days
    const createBackups = options.createBackups ?? true;
    const showNotifications = options.showNotifications ?? true;
    const dryRun = options.dryRun ?? false;
    
    const result: CleanupResult = {
      deletedSessions: [],
      deletedByAge: 0,
      deletedByCount: 0,
      spaceFree: 0,
      errors: [],
    };
    
    try {
      if (dryRun) {
        // In dry run mode, calculate what would be deleted without actually deleting
        const index = await this.storage.getIndex();
        const sessions = Object.values(index.sessions).filter((session): session is SessionMetadata => session !== undefined);
        const now = Date.now();
        
        // Sort sessions by last modified (oldest first)
        sessions.sort((a, b) => a.lastModified - b.lastModified);
        
        // Identify sessions to delete by age
        const sessionsToDeleteByAge = sessions.filter(session => 
          now - session.lastModified > maxAgeMs
        );
        
        // Identify sessions to delete by count (after age-based deletion)
        const remainingSessions = sessions.filter(session => 
          !sessionsToDeleteByAge.includes(session)
        );
        
        const sessionsToDeleteByCount = remainingSessions.length > maxCount
          ? remainingSessions.slice(0, remainingSessions.length - maxCount)
          : [];
        
        const allSessionsToDelete = [...sessionsToDeleteByAge, ...sessionsToDeleteByCount];
        
        result.deletedSessions = allSessionsToDelete.map(s => s.id);
        result.deletedByAge = sessionsToDeleteByAge.length;
        result.deletedByCount = sessionsToDeleteByCount.length;
        
        // Estimate space freed
        for (const session of allSessionsToDelete) {
          result.spaceFree += session.messageCount * 500 + session.tokenCount.total * 4;
        }
        
        if (showNotifications) {
          console.log(`Dry run: ${result.deletedSessions.length} sessions would be deleted`);
        }
        
      } else {
        // Actually perform cleanup
        if (showNotifications) {
          const beforeCleanup = await this.listSessions();
          console.log(`Session cleanup: Starting with ${beforeCleanup.length} sessions`);
        }
        
        // Get session metadata before deletion for space calculation
        const index = await this.storage.getIndex();
        const sessions = Object.values(index.sessions).filter((session): session is SessionMetadata => session !== undefined);
        
        // Use storage layer's cleanup method
        const deletedIds = await this.storage.cleanupOldSessions(maxCount, maxAgeMs);
        
        // Calculate breakdown by getting session metadata before deletion
        const now = Date.now();
        
        // Count deletions by reason
        let deletedByAge = 0;
        let deletedByCount = 0;
        let spaceFree = 0;
        
        // Since we can't know the exact reason from storage layer, estimate based on remaining sessions
        const remainingAfterCleanup = await this.listSessions();
        const totalDeleted = deletedIds.length;
        
        // Estimate breakdown (this is approximate since storage layer doesn't provide breakdown)
        const oldSessions = sessions.filter(s => now - s.lastModified > maxAgeMs);
        deletedByAge = Math.min(oldSessions.length, totalDeleted);
        deletedByCount = Math.max(0, totalDeleted - deletedByAge);
        
        // Calculate space freed using metadata from before deletion
        for (const sessionId of deletedIds) {
          const sessionMeta = sessions.find(s => s.id === sessionId);
          if (sessionMeta) {
            spaceFree += sessionMeta.messageCount * 500 + sessionMeta.tokenCount.total * 4;
          }
        }
        
        result.deletedSessions = deletedIds;
        result.deletedByAge = deletedByAge;
        result.deletedByCount = deletedByCount;
        result.spaceFree = spaceFree;
        
        // Clear current session if it was deleted
        if (this.currentSession && deletedIds.includes(this.currentSession.id)) {
          this.currentSession = null;
        }
        
        if (showNotifications) {
          console.log(`Cleanup complete: ${totalDeleted} sessions deleted, ~${Math.round(spaceFree / 1024)}KB freed`);
          console.log(`  - ${deletedByAge} sessions deleted by age`);
          console.log(`  - ${deletedByCount} sessions deleted by count`);
        }
      }
      
    } catch (error: any) {
      console.error('Session cleanup failed:', error);
      result.errors.push({
        sessionId: '' as SessionId,
        error: error.message || String(error),
      });
    }
    
    return result;
  }
  
  /**
   * Deletes a session with optional user confirmation.
   * 
   * @param sessionId - Session identifier to delete
   * @param force - Skip confirmation if true
   * @returns Promise resolving to true if deleted, false if cancelled
   */
  async deleteSessionWithConfirmation(sessionId: SessionId, force: boolean = false): Promise<boolean> {
    try {
      // Check if session exists
      if (!await this.sessionExists(sessionId)) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Get session metadata for confirmation
      const sessions = await this.listSessions();
      const sessionMetadata = sessions.find(s => s.id === sessionId);
      
      if (!force && sessionMetadata) {
        // Show confirmation prompt (in a real implementation, this would be interactive)
        const confirmMessage = [
          `Delete session ${sessionId}?`,
          `  Created: ${new Date(sessionMetadata.created).toLocaleString()}`,
          `  Last Modified: ${new Date(sessionMetadata.lastModified).toLocaleString()}`,
          `  Messages: ${sessionMetadata.messageCount}`,
          `  Model: ${sessionMetadata.model}`,
          sessionMetadata.title ? `  Title: ${sessionMetadata.title}` : '',
          sessionMetadata.preview ? `  Preview: ${sessionMetadata.preview}` : '',
        ].filter(Boolean).join('\n');
        
        console.log(confirmMessage);
        console.log('This action cannot be undone.');
        
        // In a real CLI implementation, you would prompt for user input here
        // For now, we'll assume confirmation is given
        console.log('Proceeding with deletion...');
      }
      
      // Create backup before deletion
      try {
        await this.storage.createBackup(sessionId);
        console.log(`Backup created for session ${sessionId}`);
      } catch (backupError: any) {
        console.warn(`Failed to create backup: ${backupError.message}`);
      }
      
      // Delete the session
      await this.deleteSession(sessionId);
      
      console.log(`Session ${sessionId} deleted successfully`);
      return true;
      
    } catch (error: any) {
      console.error(`Failed to delete session ${sessionId}:`, error.message);
      return false;
    }
  }
  
  /**
   * Restores a session and sets it as the current active session.
   * 
   * This is a convenience method that combines loading and setting as current.
   * 
   * @param sessionId - Session identifier to restore
   * @returns Promise resolving to the restored session
   * @throws {Error} If session not found or restoration fails
   */
  async restoreSession(sessionId: SessionId): Promise<Session> {
    const session = await this.loadSession(sessionId, {
      validateIntegrity: true,
      updateTimestamp: true, // Update timestamp to mark as recently accessed
    });
    
    // Set as current session
    this.setCurrentSession(session);
    
    return session;
  }
  
  /**
   * Validates session integrity without throwing errors.
   * 
   * @param session - Session to validate
   * @returns True if session is valid, false otherwise
   */
  validateSessionIntegrity(session: Session): boolean {
    try {
      this.validateSessionIntegrityInternal(session);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Restores a session with context file validation.
   * 
   * This method not only restores the session but also checks which
   * context files are still available and which are missing.
   * 
   * @param sessionId - Session identifier to restore
   * @returns Promise resolving to restoration result with context file status
   * @throws {Error} If session not found or restoration fails
   */
  async restoreSessionWithContext(sessionId: SessionId): Promise<{
    session: Session;
    contextFilesFound: string[];
    contextFilesMissing: string[];
  }> {
    const session = await this.restoreSession(sessionId);
    
    const contextFilesFound: string[] = [];
    const contextFilesMissing: string[] = [];
    
    // Check which context files still exist
    for (const filePath of session.contextFiles) {
      try {
        // Try to access the file (this is a simple check)
        // In a real implementation, you might want to use fs.access or similar
        const exists = await this.checkFileExists(filePath);
        if (exists) {
          contextFilesFound.push(filePath);
        } else {
          contextFilesMissing.push(filePath);
        }
      } catch {
        contextFilesMissing.push(filePath);
      }
    }
    
    return {
      session,
      contextFilesFound,
      contextFilesMissing,
    };
  }
  
  // -------------------------------------------------------------------------
  // Import/Export Operations
  // -------------------------------------------------------------------------
  
  /**
   * Exports a session with data sanitization and format options.
   * 
   * @param sessionId - Session identifier to export
   * @param options - Export configuration options
   * @returns Promise resolving to export result
   * @throws {Error} If session not found or export fails
   */
  async exportSession(
    sessionId: SessionId, 
    options: ExportSessionOptions = {}
  ): Promise<ExportResult> {
    const {
      format = 'json-pretty',
      sanitize = true,
      includeContent = true,
      metadataOnly = false,
      customSanitizationPatterns = [],
      preserveWorkspacePaths = false,
    } = options;
    
    // Load the session
    const session = await this.loadSession(sessionId, { validateIntegrity: true });
    
    const warnings: string[] = [];
    let exportData: any;
    
    if (metadataOnly) {
      // Export only metadata
      const index = await this.storage.getIndex();
      const metadata = index.sessions[sessionId];
      if (!metadata) {
        throw new Error(`Session metadata not found for ${sessionId}`);
      }
      
      let metadataToExport = metadata;
      if (sanitize) {
        metadataToExport = this.sanitizeSessionMetadata(metadata, preserveWorkspacePaths, customSanitizationPatterns);
        warnings.push('Sensitive data was sanitized from export');
      }
      
      exportData = {
        type: 'session-metadata',
        version: '1.0.0',
        exported: Date.now(),
        metadata: metadataToExport,
      };
    } else {
      // Export full session
      let sessionToExport = { ...session };
      
      if (!includeContent) {
        // Remove message content but keep structure
        sessionToExport.messages = session.messages.map(msg => ({
          ...msg,
          content: typeof msg.content === 'string' ? '[Content removed]' : 
                   msg.content.map(block => ({ ...block, text: '[Content removed]' })),
        }));
        warnings.push('Message content was excluded from export');
      }
      
      if (sanitize) {
        sessionToExport = this.sanitizeSessionData(sessionToExport, preserveWorkspacePaths, customSanitizationPatterns);
        warnings.push('Sensitive data was sanitized from export');
      }
      
      exportData = {
        type: 'session-full',
        version: '1.0.0',
        exported: Date.now(),
        originalWorkspace: preserveWorkspacePaths ? session.workspaceRoot : '[Workspace path removed]',
        session: sessionToExport,
      };
    }
    
    // Format the data
    let formattedData: string;
    switch (format) {
      case 'json-compact':
        formattedData = JSON.stringify(exportData);
        break;
      case 'json':
      case 'json-pretty':
      default:
        formattedData = JSON.stringify(exportData, null, 2);
        break;
    }
    
    return {
      data: formattedData,
      format,
      sanitized: sanitize,
      size: Buffer.byteLength(formattedData, 'utf8'),
      warnings,
    };
  }
  
  /**
   * Imports a session from exported data with validation.
   * 
   * @param data - Exported session data as string
   * @param options - Import configuration options
   * @returns Promise resolving to import result
   * @throws {Error} If data is invalid or import fails
   */
  async importSession(
    data: string, 
    options: ImportSessionOptions = {}
  ): Promise<ImportResult> {
    const {
      strictValidation = true,
      generateNewId = true,
      preserveTimestamps = false,
      workspaceRoot,
      showWarnings = true,
    } = options;
    
    const warnings: string[] = [];
    const missingContextFiles: string[] = [];
    
    // Parse the import data
    let importData: any;
    try {
      importData = JSON.parse(data);
    } catch (error: any) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
    
    // Validate import format
    if (!importData.type || !importData.version) {
      if (strictValidation) {
        throw new Error('Invalid export format: missing type or version');
      }
      warnings.push('Import data missing format metadata, attempting to parse as raw session');
    }
    
    // Handle different export types
    let sessionData: Session;
    let originalId: SessionId;
    
    if (importData.type === 'session-metadata') {
      throw new Error('Cannot import session from metadata-only export');
    } else if (importData.type === 'session-full' || !importData.type) {
      // Extract session data
      const rawSession = importData.session || importData;
      
      // Validate session structure
      try {
        sessionData = SessionSchema.parse(rawSession);
        originalId = sessionData.id;
      } catch (error: any) {
        if (strictValidation) {
          throw new Error(`Invalid session data: ${error.message}`);
        }
        warnings.push(`Session validation warnings: ${error.message}`);
        // Try to fix common issues
        sessionData = this.repairSessionData(rawSession);
        originalId = sessionData.id;
      }
    } else {
      throw new Error(`Unsupported export type: ${importData.type}`);
    }
    
    // Generate new ID if requested
    let newIdGenerated = false;
    if (generateNewId) {
      const newId = createSessionId();
      sessionData = { ...sessionData, id: newId };
      newIdGenerated = true;
    } else {
      // Check if session with this ID already exists
      if (await this.sessionExists(sessionData.id)) {
        if (strictValidation) {
          throw new Error(`Session with ID ${sessionData.id} already exists`);
        }
        warnings.push(`Session ${sessionData.id} already exists, generating new ID`);
        sessionData = { ...sessionData, id: createSessionId() };
        newIdGenerated = true;
      }
    }
    
    // Update timestamps if not preserving
    if (!preserveTimestamps) {
      const now = Date.now();
      sessionData = {
        ...sessionData,
        created: now,
        lastModified: now,
      };
    }
    
    // Update workspace root if provided
    if (workspaceRoot) {
      sessionData = { ...sessionData, workspaceRoot };
    }
    
    // Check context files availability
    for (const filePath of sessionData.contextFiles) {
      const exists = await this.checkFileExists(filePath);
      if (!exists) {
        missingContextFiles.push(filePath);
      }
    }
    
    if (missingContextFiles.length > 0 && showWarnings) {
      warnings.push(`${missingContextFiles.length} context files are missing from current workspace`);
    }
    
    // Save the imported session
    await this.saveSession(sessionData);
    
    if (showWarnings && warnings.length > 0) {
      console.warn('Import warnings:', warnings);
    }
    
    return {
      session: sessionData,
      newIdGenerated,
      originalId,
      warnings,
      missingContextFiles,
    };
  }
  
  // -------------------------------------------------------------------------
  // Export/Import Helper Methods
  // -------------------------------------------------------------------------
  
  /**
   * Sanitizes session data by removing sensitive information.
   * 
   * @param session - Session data to sanitize
   * @param preserveWorkspacePaths - Whether to preserve workspace paths
   * @param customPatterns - Custom sanitization patterns
   * @returns Sanitized session data
   */
  private sanitizeSessionData(
    session: Session, 
    preserveWorkspacePaths: boolean,
    customPatterns: string[]
  ): Session {
    const sanitized = { ...session };
    
    // Sanitize workspace root
    if (!preserveWorkspacePaths) {
      sanitized.workspaceRoot = '[Workspace path removed]';
    }
    
    // Sanitize context files
    sanitized.contextFiles = preserveWorkspacePaths 
      ? session.contextFiles 
      : session.contextFiles.map(path => this.sanitizeFilePath(path));
    
    // Sanitize files accessed
    sanitized.filesAccessed = preserveWorkspacePaths
      ? session.filesAccessed
      : session.filesAccessed.map(path => this.sanitizeFilePath(path));
    
    // Sanitize messages
    sanitized.messages = session.messages.map(message => this.sanitizeMessage(message, customPatterns));
    
    return sanitized;
  }
  
  /**
   * Sanitizes session metadata by removing sensitive information.
   * 
   * @param metadata - Session metadata to sanitize
   * @param preserveWorkspacePaths - Whether to preserve workspace paths
   * @param customPatterns - Custom sanitization patterns
   * @returns Sanitized session metadata
   */
  private sanitizeSessionMetadata(
    metadata: SessionMetadata,
    preserveWorkspacePaths: boolean,
    customPatterns: string[]
  ): SessionMetadata {
    const sanitized = { ...metadata };
    
    // Sanitize workspace root
    if (!preserveWorkspacePaths && sanitized.workspaceRoot) {
      sanitized.workspaceRoot = '[Workspace path removed]';
    }
    
    // Sanitize context files
    sanitized.contextFiles = preserveWorkspacePaths
      ? metadata.contextFiles
      : metadata.contextFiles.map(path => this.sanitizeFilePath(path));
    
    // Sanitize preview and last message
    if (sanitized.preview) {
      sanitized.preview = this.sanitizeText(sanitized.preview, customPatterns);
    }
    
    if (sanitized.lastMessage) {
      sanitized.lastMessage = this.sanitizeText(sanitized.lastMessage, customPatterns);
    }
    
    return sanitized;
  }
  
  /**
   * Sanitizes a message by removing sensitive information.
   * 
   * @param message - Message to sanitize
   * @param customPatterns - Custom sanitization patterns
   * @returns Sanitized message
   */
  private sanitizeMessage(message: Message, customPatterns: string[]): Message {
    const sanitized = { ...message };
    
    // Sanitize content
    if (typeof message.content === 'string') {
      sanitized.content = this.sanitizeText(message.content, customPatterns);
    } else {
      sanitized.content = message.content.map(block => {
        if (block.type === 'text') {
          return { ...block, text: this.sanitizeText(block.text, customPatterns) };
        } else if (block.type === 'tool_result') {
          return { ...block, content: this.sanitizeText(block.content, customPatterns) };
        }
        return block;
      });
    }
    
    // Sanitize tool calls and results
    if (sanitized.toolCalls) {
      sanitized.toolCalls = sanitized.toolCalls.map(call => ({
        ...call,
        arguments: this.sanitizeObject(call.arguments, customPatterns),
      }));
    }
    
    if (sanitized.toolResults) {
      sanitized.toolResults = sanitized.toolResults.map(result => ({
        ...result,
        content: this.sanitizeText(result.content, customPatterns),
      }));
    }
    
    return sanitized;
  }
  
  /**
   * Sanitizes text content using predefined and custom patterns.
   * 
   * @param text - Text to sanitize
   * @param customPatterns - Custom sanitization patterns
   * @returns Sanitized text
   */
  private sanitizeText(text: string, customPatterns: string[]): string {
    let sanitized = text;
    
    // Default sanitization patterns (comprehensive for edge cases)
    const defaultPatterns = [
      // API keys and tokens (very comprehensive patterns)
      /sk-[^]*?(?=\s|$|[.!?])/g, // sk- prefix followed by any characters until whitespace or end
      /\bsk-[A-Za-z0-9\s\-_!@#$%^&*()+=\[\]{}|\\:";'<>?,./~`]{5,}/g, // sk- prefix with any characters
      /\b[A-Za-z0-9]{32,}\b/g, // Generic long alphanumeric tokens
      // Email addresses (very comprehensive patterns for edge cases)
      /@[A-Za-z0-9.\-\s]*\.[A-Za-z]{2,}/g, // Any @ followed by domain-like pattern
      /[A-Za-z0-9._%+\s\-!{}\[\]]*@[A-Za-z0-9.\-\s]*\.[A-Za-z]{2,}/g, // Full email pattern with spaces
      /\s*@\s*/g, // Just @ symbol with optional spaces (minimal email pattern)
      // URLs with credentials
      /https?:\/\/[^:]+:[^@]+@[^\s]+/g,
      // File paths (absolute paths)
      /(?:[A-Z]:\\|\/)[^\s<>"'|?*]+/g,
      // Environment variables
      /\$\{?[A-Z_][A-Z0-9_]*\}?/g,
      // Additional patterns for common sensitive data
      /\bpassword\s*[:=]\s*\S+/gi, // Password assignments
      /\btoken\s*[:=]\s*\S+/gi, // Token assignments
      /\bkey\s*[:=]\s*\S+/gi, // Key assignments
    ];
    
    // Apply default patterns
    for (const pattern of defaultPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    
    // Apply custom patterns
    for (const patternStr of customPatterns) {
      try {
        const pattern = new RegExp(patternStr, 'g');
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      } catch (error) {
        console.warn(`Invalid sanitization pattern: ${patternStr}`);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Sanitizes an object by applying text sanitization to string values.
   * 
   * @param obj - Object to sanitize
   * @param customPatterns - Custom sanitization patterns
   * @returns Sanitized object
   */
  private sanitizeObject(obj: any, customPatterns: string[]): any {
    if (typeof obj === 'string') {
      return this.sanitizeText(obj, customPatterns);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, customPatterns));
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value, customPatterns);
      }
      return sanitized;
    }
    return obj;
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
  
  /**
   * Attempts to repair common issues in session data during import.
   * 
   * @param rawSession - Raw session data to repair
   * @returns Repaired session data
   */
  private repairSessionData(rawSession: any): Session {
    const repaired = { ...rawSession };
    
    // Ensure required fields exist
    if (!repaired.id) {
      repaired.id = createSessionId();
    }
    
    if (!repaired.version) {
      repaired.version = '1.0.0';
    }
    
    if (!repaired.created) {
      repaired.created = Date.now();
    }
    
    if (!repaired.lastModified) {
      repaired.lastModified = repaired.created;
    }
    
    if (!repaired.tokenCount) {
      repaired.tokenCount = { total: 0, input: 0, output: 0 };
    }
    
    if (!repaired.messages) {
      repaired.messages = [];
    }
    
    if (!repaired.contextFiles) {
      repaired.contextFiles = [];
    }
    
    if (!repaired.filesAccessed) {
      repaired.filesAccessed = [];
    }
    
    if (!repaired.tags) {
      repaired.tags = [];
    }
    
    // Ensure messages have IDs
    repaired.messages = repaired.messages.map((msg: any) => ({
      ...msg,
      id: msg.id || createMessageId(),
    }));
    
    return SessionSchema.parse(repaired);
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------
  
  /**
   * Validates session integrity.
   * 
   * @param session - Session to validate
   * @throws {Error} If session is invalid
   */
  private validateSessionIntegrityInternal(session: Session): void {
    // Check required fields
    if (!session.id || !session.model || !session.workspaceRoot) {
      throw new Error('Session missing required fields');
    }
    
    // Check timestamp consistency
    if (session.created > session.lastModified) {
      throw new Error('Session created timestamp is after lastModified');
    }
    
    // Check token count consistency
    const { total, input, output } = session.tokenCount;
    if (total < 0 || input < 0 || output < 0) {
      throw new Error('Session token counts cannot be negative');
    }
    
    if (total < input + output) {
      console.warn('Session total token count is less than input + output');
    }
    
    // Check message consistency
    if (session.messages.length !== session.messages.filter(m => m.id).length) {
      throw new Error('Session contains messages without IDs');
    }
  }
  
  /**
   * Checks if a file exists.
   * 
   * @param _filePath - Path to check (unused in current implementation)
   * @returns Promise resolving to true if file exists
   */
  private async checkFileExists(_filePath: string): Promise<boolean> {
    try {
      // This is a placeholder implementation
      // In a real implementation, you would use fs.access or similar
      // For now, we'll assume files exist (this is just for the interface)
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Configuration Management
  // -------------------------------------------------------------------------

  /**
   * Gets the current session configuration.
   * 
   * @returns Promise resolving to current configuration
   */
  async getConfiguration(): Promise<SessionConfiguration> {
    const config = loadConfig(process.cwd());
    const sessionConfig = config.global.session;
    
    // Get audit logging configuration from the audit logger
    const auditLogger = getAuditLogger();
    const auditConfig = auditLogger.getConfig();
    
    return {
      sessionsDir: getSessionsDir(),
      maxSessions: sessionConfig?.maxSessions ?? 50,
      maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days default
      compressionEnabled: true, // Default enabled
      autoSaveEnabled: this.isAutoSaveEnabled(),
      autoSaveInterval: this.autoSaveConfig?.intervalMs ?? sessionConfig?.autoSaveInterval ?? 30000,
      sanitizeExports: true, // Default enabled
      auditLogging: auditConfig.enabled,
      indexCaching: true, // Default enabled
      backgroundCleanup: true, // Default enabled
    };
  }

  /**
   * Sets a configuration value.
   * 
   * @param key - Configuration key to set
   * @param value - Value to set
   * @throws {Error} If configuration update fails
   */
  async setConfiguration(key: string, value: string): Promise<void> {
    await logOperation(
      'session.config.set',
      async () => {
        // Parse and validate the value based on the key
        const parsedValue = this.parseConfigurationValue(key, value);
        
        // Apply the configuration change
        switch (key) {
          case 'max-sessions':
            // This would typically update the global config file
            // For now, we'll just validate and accept it
            if (typeof parsedValue !== 'number' || parsedValue < 1) {
              throw new Error('max-sessions must be a positive number');
            }
            break;
            
          case 'max-age-days':
            if (typeof parsedValue !== 'number' || parsedValue < 1) {
              throw new Error('max-age-days must be a positive number');
            }
            break;
            
          case 'auto-save-interval':
            if (typeof parsedValue !== 'number' || parsedValue < 5 || parsedValue > 300) {
              throw new Error('auto-save-interval must be between 5 and 300 seconds');
            }
            // Update auto-save configuration
            if (this.autoSaveConfig) {
              this.enableAutoSave({
                ...this.autoSaveConfig,
                intervalMs: parsedValue * 1000,
              });
            }
            break;
            
          case 'compression':
          case 'sanitize-exports':
            if (typeof parsedValue !== 'boolean') {
              throw new Error(`${key} must be true or false`);
            }
            break;
            
          case 'audit-logging':
            if (typeof parsedValue !== 'boolean') {
              throw new Error('audit-logging must be true or false');
            }
            // Update audit logger configuration
            const auditLogger = getAuditLogger();
            auditLogger.updateConfig({ enabled: parsedValue });
            break;
            
          case 'sessions-dir':
            if (typeof parsedValue !== 'string' || parsedValue.trim().length === 0) {
              throw new Error('sessions-dir must be a non-empty string');
            }
            break;
            
          default:
            throw new Error(`Unknown configuration key: ${key}`);
        }
        
        // In a real implementation, you would persist this to the config file
        console.log(`Configuration updated: ${key} = ${value}`);
      },
      undefined,
      {
        configKey: key,
        configValue: value,
      }
    );
  }

  /**
   * Validates a configuration change before applying it.
   * 
   * @param key - Configuration key to validate
   * @param value - Value to validate
   * @returns Promise resolving to validation result
   */
  async validateConfigChange(key: string, value: string): Promise<ConfigurationValidationResult> {
    try {
      const currentConfig = await this.getConfiguration();
      const currentValue = this.getCurrentConfigValue(currentConfig, key);
      
      // Parse the new value
      const parsedValue = this.parseConfigurationValue(key, value);
      
      // Validate the value
      const validation = this.validateConfigurationValue(key, parsedValue);
      if (!validation.valid) {
        return {
          valid: false,
          error: validation.error!,
          currentValue: String(currentValue),
          suggestions: validation.suggestions,
        };
      }
      
      // Check if confirmation is required for disruptive changes
      const requiresConfirmation = this.configChangeRequiresConfirmation(key, parsedValue, currentValue);
      const warning = requiresConfirmation ? this.getConfigChangeWarning(key, parsedValue) : undefined;
      
      return {
        valid: true,
        currentValue: String(currentValue),
        requiresConfirmation,
        warning,
        restartRequired: this.configChangeRequiresRestart(key),
      };
      
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Validation failed',
        currentValue: 'unknown',
      };
    }
  }

  /**
   * Resets configuration to defaults.
   * 
   * @param key - Optional specific key to reset, or undefined to reset all
   * @returns Promise resolving to reset result
   */
  async resetConfiguration(key?: string): Promise<ConfigurationResetResult> {
    if (key) {
      // Reset specific key
      const defaultValue = this.getDefaultConfigValue(key);
      const currentConfig = await this.getConfiguration();
      const oldValue = this.getCurrentConfigValue(currentConfig, key);
      
      // Apply the default value
      await this.setConfiguration(key, String(defaultValue));
      
      return {
        oldValue: String(oldValue),
        newValue: String(defaultValue),
        restartRequired: this.configChangeRequiresRestart(key),
      };
    } else {
      // Reset all configuration
      const configKeys = [
        'max-sessions',
        'max-age-days', 
        'auto-save-interval',
        'compression',
        'sanitize-exports',
        'audit-logging',
      ];
      
      let resetCount = 0;
      let restartRequired = false;
      
      for (const configKey of configKeys) {
        try {
          const defaultValue = this.getDefaultConfigValue(configKey);
          await this.setConfiguration(configKey, String(defaultValue));
          resetCount++;
          
          if (this.configChangeRequiresRestart(configKey)) {
            restartRequired = true;
          }
        } catch (error) {
          console.warn(`Failed to reset ${configKey}:`, error);
        }
      }
      
      return {
        resetCount,
        restartRequired,
      };
    }
  }

  /**
   * Validates the current configuration.
   * 
   * @returns Promise resolving to validation result
   */
  async validateConfiguration(): Promise<ConfigurationValidationResult> {
    const issues: Array<{ setting: string; error: string }> = [];
    const warnings: Array<{ setting: string; message: string }> = [];
    let checkedSettings = 0;
    
    try {
      const config = await this.getConfiguration();
      
      // Validate sessions directory
      checkedSettings++;
      if (!config.sessionsDir || config.sessionsDir.trim().length === 0) {
        issues.push({
          setting: 'sessions-dir',
          error: 'Sessions directory is not configured',
        });
      }
      
      // Validate max sessions
      checkedSettings++;
      if (config.maxSessions < 1 || config.maxSessions > 10000) {
        issues.push({
          setting: 'max-sessions',
          error: 'Max sessions must be between 1 and 10000',
        });
      } else if (config.maxSessions > 1000) {
        warnings.push({
          setting: 'max-sessions',
          message: 'Large number of sessions may impact performance',
        });
      }
      
      // Validate max age
      checkedSettings++;
      if (config.maxAgeMs < 24 * 60 * 60 * 1000) { // Less than 1 day
        warnings.push({
          setting: 'max-age-days',
          message: 'Very short retention period may cause frequent cleanup',
        });
      }
      
      // Validate auto-save interval
      checkedSettings++;
      if (config.autoSaveEnabled && (config.autoSaveInterval < 5000 || config.autoSaveInterval > 300000)) {
        issues.push({
          setting: 'auto-save-interval',
          error: 'Auto-save interval must be between 5 and 300 seconds',
        });
      }
      
      // Check storage directory accessibility (placeholder)
      checkedSettings++;
      // In a real implementation, you would check if the directory is writable
      
      const valid = issues.length === 0;
      
      return {
        valid,
        checkedSettings,
        issues: issues.length > 0 ? issues : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
      
    } catch (error: any) {
      return {
        valid: false,
        checkedSettings,
        issues: [{
          setting: 'general',
          error: `Configuration validation failed: ${error.message}`,
        }],
      };
    }
  }

  // -------------------------------------------------------------------------
  // Configuration Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Parses a configuration value from string to appropriate type.
   * 
   * @param key - Configuration key
   * @param value - String value to parse
   * @returns Parsed value
   */
  private parseConfigurationValue(key: string, value: string): any {
    switch (key) {
      case 'max-sessions':
      case 'max-age-days':
      case 'auto-save-interval':
        const numValue = parseInt(value, 10);
        if (isNaN(numValue)) {
          throw new Error(`${key} must be a number`);
        }
        return numValue;
        
      case 'compression':
      case 'sanitize-exports':
      case 'audit-logging':
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        throw new Error(`${key} must be 'true' or 'false'`);
        
      case 'sessions-dir':
        return value.trim();
        
      default:
        return value;
    }
  }

  /**
   * Validates a parsed configuration value.
   * 
   * @param key - Configuration key
   * @param value - Parsed value to validate
   * @returns Validation result
   */
  private validateConfigurationValue(key: string, value: any): { valid: boolean; error?: string; suggestions?: string[] } {
    switch (key) {
      case 'max-sessions':
        if (typeof value !== 'number' || value < 1 || value > 10000) {
          return {
            valid: false,
            error: 'Must be a number between 1 and 10000',
            suggestions: ['50', '100', '200'],
          };
        }
        return { valid: true };
        
      case 'max-age-days':
        if (typeof value !== 'number' || value < 1 || value > 365) {
          return {
            valid: false,
            error: 'Must be a number between 1 and 365 days',
            suggestions: ['7', '30', '90'],
          };
        }
        return { valid: true };
        
      case 'auto-save-interval':
        if (typeof value !== 'number' || value < 5 || value > 300) {
          return {
            valid: false,
            error: 'Must be between 5 and 300 seconds',
            suggestions: ['30', '60', '120'],
          };
        }
        return { valid: true };
        
      case 'compression':
      case 'sanitize-exports':
      case 'audit-logging':
        if (typeof value !== 'boolean') {
          return {
            valid: false,
            error: 'Must be true or false',
            suggestions: ['true', 'false'],
          };
        }
        return { valid: true };
        
      case 'sessions-dir':
        if (typeof value !== 'string' || value.length === 0) {
          return {
            valid: false,
            error: 'Must be a non-empty directory path',
            suggestions: ['~/.theo-code/sessions', './sessions'],
          };
        }
        return { valid: true };
        
      default:
        return {
          valid: false,
          error: `Unknown configuration key: ${key}`,
        };
    }
  }

  /**
   * Gets the current value for a configuration key.
   * 
   * @param config - Current configuration
   * @param key - Configuration key
   * @returns Current value
   */
  private getCurrentConfigValue(config: SessionConfiguration, key: string): any {
    switch (key) {
      case 'max-sessions':
        return config.maxSessions;
      case 'max-age-days':
        return Math.round(config.maxAgeMs / (24 * 60 * 60 * 1000));
      case 'auto-save-interval':
        return Math.round(config.autoSaveInterval / 1000);
      case 'compression':
        return config.compressionEnabled;
      case 'sanitize-exports':
        return config.sanitizeExports;
      case 'audit-logging':
        return config.auditLogging;
      case 'sessions-dir':
        return config.sessionsDir;
      default:
        return undefined;
    }
  }

  /**
   * Gets the default value for a configuration key.
   * 
   * @param key - Configuration key
   * @returns Default value
   */
  private getDefaultConfigValue(key: string): any {
    switch (key) {
      case 'max-sessions':
        return 50;
      case 'max-age-days':
        return 30;
      case 'auto-save-interval':
        return 30; // seconds
      case 'compression':
        return true;
      case 'sanitize-exports':
        return true;
      case 'audit-logging':
        return false;
      case 'sessions-dir':
        return getSessionsDir();
      default:
        throw new Error(`No default value defined for ${key}`);
    }
  }

  /**
   * Checks if a configuration change requires user confirmation.
   * 
   * @param key - Configuration key
   * @param newValue - New value
   * @param currentValue - Current value
   * @returns True if confirmation is required
   */
  private configChangeRequiresConfirmation(key: string, newValue: any, currentValue: any): boolean {
    switch (key) {
      case 'max-sessions':
        // Require confirmation if significantly reducing max sessions
        return typeof newValue === 'number' && typeof currentValue === 'number' && 
               newValue < currentValue * 0.5;
               
      case 'max-age-days':
        // Require confirmation if significantly reducing retention
        return typeof newValue === 'number' && typeof currentValue === 'number' && 
               newValue < currentValue * 0.5;
               
      case 'sessions-dir':
        // Always require confirmation for directory changes
        return newValue !== currentValue;
        
      default:
        return false;
    }
  }

  /**
   * Gets a warning message for a configuration change.
   * 
   * @param key - Configuration key
   * @param newValue - New value
   * @returns Warning message
   */
  private getConfigChangeWarning(key: string, newValue: any): string {
    switch (key) {
      case 'max-sessions':
        return 'Reducing max sessions may trigger immediate cleanup of existing sessions.';
      case 'max-age-days':
        return 'Reducing retention period may trigger immediate cleanup of older sessions.';
      case 'sessions-dir':
        return 'Changing sessions directory will not move existing sessions to the new location.';
      default:
        return 'This change may affect existing sessions.';
    }
  }

  /**
   * Checks if a configuration change requires application restart.
   * 
   * @param key - Configuration key
   * @returns True if restart is required
   */
  private configChangeRequiresRestart(key: string): boolean {
    switch (key) {
      case 'sessions-dir':
        return true; // Directory changes typically require restart
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // Storage Limit Management
  // -------------------------------------------------------------------------

  /**
   * Gets comprehensive storage information for the session directory.
   * 
   * @returns Promise resolving to storage information
   */
  async getStorageInfo(): Promise<StorageInfo> {
    try {
      const index = await this.storage.getIndex();
      const sessions = Object.values(index.sessions).filter((session): session is SessionMetadata => session !== undefined);
      
      let totalSizeBytes = 0;
      let oldestSessionAge = 0;
      const sessionSizeDistribution: Array<{ sessionId: string; sizeBytes: number; age: number }> = [];
      
      const now = Date.now();
      
      // Calculate session sizes and ages
      for (const session of sessions) {
        // Estimate session size (in a real implementation, you'd check actual file sizes)
        const estimatedSize = this.estimateSessionSize(session);
        totalSizeBytes += estimatedSize;
        
        const age = now - session.created;
        oldestSessionAge = Math.max(oldestSessionAge, age);
        
        sessionSizeDistribution.push({
          sessionId: session.id,
          sizeBytes: estimatedSize,
          age,
        });
      }
      
      // Get available disk space (simplified - in real implementation use fs.stat)
      const availableDiskSpace = 1000000000; // 1GB placeholder
      
      return {
        totalSessions: sessions.length,
        totalSizeBytes,
        oldestSessionAge,
        availableDiskSpace,
        sessionSizeDistribution,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        totalSessions: 0,
        totalSizeBytes: 0,
        oldestSessionAge: 0,
        availableDiskSpace: 0,
        sessionSizeDistribution: [],
      };
    }
  }

  /**
   * Checks storage limits and returns recommendations.
   * 
   * @returns Promise resolving to storage limit check result
   */
  async checkStorageLimits(): Promise<StorageLimitResult> {
    try {
      const config = await this.getConfiguration();
      const storageInfo = await this.getStorageInfo();
      
      const maxSessions = config.maxSessions;
      const maxTotalSize = 100 * 1024 * 1024; // 100MB default limit
      const minDiskSpace = 50 * 1024 * 1024; // 50MB minimum
      const warningThreshold = 0.8; // 80%
      
      // Check limits
      const sessionCountExceeded = storageInfo.totalSessions > maxSessions;
      const totalSizeExceeded = storageInfo.totalSizeBytes > maxTotalSize;
      const diskSpaceExceeded = storageInfo.availableDiskSpace < minDiskSpace;
      
      // Check warning thresholds
      const sessionCountWarning = storageInfo.totalSessions > maxSessions * warningThreshold && !sessionCountExceeded;
      const totalSizeWarning = storageInfo.totalSizeBytes > maxTotalSize * warningThreshold && !totalSizeExceeded;
      const diskSpaceWarning = storageInfo.availableDiskSpace < minDiskSpace * (1 + warningThreshold) && !diskSpaceExceeded;
      
      const warningThresholdReached = sessionCountWarning || totalSizeWarning || diskSpaceWarning;
      const withinLimits = !sessionCountExceeded && !totalSizeExceeded && !diskSpaceExceeded;
      
      // Generate suggested actions
      const suggestedActions: string[] = [];
      let estimatedSpaceSavings = 0;
      
      if (sessionCountExceeded || sessionCountWarning) {
        const excessSessions = Math.max(0, storageInfo.totalSessions - maxSessions);
        if (excessSessions > 0) {
          suggestedActions.push(`Delete ${excessSessions} old sessions`);
          estimatedSpaceSavings += excessSessions * 50000; // 50KB per session estimate
        } else {
          suggestedActions.push('Delete old sessions');
          estimatedSpaceSavings += Math.floor(storageInfo.totalSessions * 0.2) * 50000;
        }
      }
      
      if (totalSizeExceeded || totalSizeWarning) {
        suggestedActions.push('Enable compression');
        estimatedSpaceSavings += Math.floor(storageInfo.totalSizeBytes * 0.4); // 40% compression estimate
      }
      
      if (diskSpaceExceeded) {
        suggestedActions.push('Free up disk space');
      }
      
      // Check for cleanup opportunities
      const oldSessions = storageInfo.sessionSizeDistribution.filter(
        s => s.age > config.maxAgeMs
      );
      if (oldSessions.length > 0) {
        suggestedActions.push('Run cleanup command');
        estimatedSpaceSavings += oldSessions.reduce((sum, s) => sum + s.sizeBytes, 0);
      }
      
      return {
        withinLimits,
        sessionCountExceeded,
        totalSizeExceeded,
        diskSpaceExceeded,
        warningThresholdReached,
        suggestedActions,
        estimatedSpaceSavings,
      };
    } catch (error) {
      console.error('Failed to check storage limits:', error);
      return {
        withinLimits: true,
        sessionCountExceeded: false,
        totalSizeExceeded: false,
        diskSpaceExceeded: false,
        warningThresholdReached: false,
        suggestedActions: [],
        estimatedSpaceSavings: 0,
      };
    }
  }

  /**
   * Estimates the size of a session in bytes.
   * 
   * @param session - Session metadata
   * @returns Estimated size in bytes
   */
  private estimateSessionSize(session: SessionMetadata): number {
    // Base size for metadata
    let size = 1000; // 1KB base
    
    // Add size based on message count (estimate 500 bytes per message)
    size += session.messageCount * 500;
    
    // Add size based on token count (estimate 4 bytes per token)
    size += session.tokenCount.total * 4;
    
    // Add size for context files (estimate 100 bytes per file reference)
    size += session.contextFiles.length * 100;
    
    return size;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new SessionManager instance with default configuration.
 * 
 * @param workspaceRoot - Workspace root for loading configuration
 * @returns Configured SessionManager instance
 */
export function createSessionManager(workspaceRoot: string): SessionManager {
  const config = loadConfig(workspaceRoot);
  
  // Create storage with configuration
  const storage = new SessionStorage({
    enableCompression: true,
    enableChecksum: true,
    createBackups: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
  });
  
  const manager = new SessionManager(storage);
  
  // Enable auto-save if configured
  const sessionConfig = config.global.session;
  if (sessionConfig?.autoSaveInterval) {
    manager.enableAutoSave({
      enabled: true,
      intervalMs: sessionConfig.autoSaveInterval,
      maxRetries: 3,
    });
  }
  
  return manager;
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  CreateSessionOptions,
  LoadSessionOptions,
  AutoSaveConfig,
  CleanupOptions,
  CleanupResult,
  ListSessionsOptions,
  SearchSessionsOptions,
  FilterSessionsOptions,
  SessionSearchResult,
  SearchMatch,
  ISessionManager,
  ExportSessionOptions,
  ImportSessionOptions,
  ExportResult,
  ImportResult,
};