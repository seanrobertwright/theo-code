/**
 * @fileoverview SessionStorage class for low-level session persistence
 * @module features/session/storage
 *
 * Provides the storage abstraction layer for session persistence with:
 * - JSON serialization with compression support
 * - Checksum validation for data integrity
 * - Atomic file operations with backup support
 * - Session index management for fast metadata access
 */

import * as path from 'node:path';
import {
  type Session,
  type SessionId,
  type SessionIndex,
  type SessionMetadata,
  type VersionedSession,
  SessionSchema,
  SessionIndexSchema,
  VersionedSessionSchema,
  SessionMetadataSchema,
} from '../../shared/types/index.js';
import {
  ensureSessionsDirectory,
  atomicWriteFile,
  safeReadFile,
  safeDeleteFile,
  fileExists,
  compressData,
  decompressData,
  calculateChecksum,
  verifyChecksum,
  getSessionFilePath,
  getSessionIndexPath,
  listSessionFiles,
} from './filesystem.js';
import {
  createMigrationFramework,
  type MigrationResult,
  type IMigrationFramework,
} from './migration.js';
import { getAuditLogger, logOperation } from './audit.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Session storage interface for low-level persistence operations.
 */
export interface ISessionStorage {
  // File operations
  writeSession(sessionId: SessionId, session: Session): Promise<void>;
  readSession(sessionId: SessionId): Promise<Session>;
  deleteSession(sessionId: SessionId): Promise<void>;
  sessionExists(sessionId: SessionId): Promise<boolean>;
  
  // Index management
  updateIndex(metadata: SessionMetadata): Promise<void>;
  getIndex(): Promise<SessionIndex>;
  rebuildIndex(): Promise<void>;
  
  // Backup and recovery
  createBackup(sessionId: SessionId): Promise<string>;
  restoreFromBackup(backupPath: string): Promise<SessionId>;
  
  // Cleanup
  cleanupOldSessions(maxCount: number, maxAgeMs: number): Promise<SessionId[]>;
  
  // Migration
  migrateSession(sessionId: SessionId): Promise<MigrationResult>;
  migrateAllSessions(): Promise<MigrationResult[]>;
}

// =============================================================================
// STORAGE OPTIONS
// =============================================================================

/**
 * Configuration options for SessionStorage.
 */
export interface SessionStorageOptions {
  /** Enable compression for session files */
  enableCompression: boolean;
  
  /** Enable checksum validation */
  enableChecksum: boolean;
  
  /** Create backups before risky operations */
  createBackups: boolean;
  
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize: number;
}

/**
 * Default storage options.
 */
const DEFAULT_OPTIONS: SessionStorageOptions = {
  enableCompression: true,
  enableChecksum: true,
  createBackups: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
};

// =============================================================================
// SESSION STORAGE IMPLEMENTATION
// =============================================================================

/**
 * Low-level storage abstraction for session persistence.
 * 
 * Handles file I/O, compression, validation, and index management
 * for session data with atomic operations and backup support.
 */
export class SessionStorage implements ISessionStorage {
  private readonly options: SessionStorageOptions;
  private readonly migrationFramework: IMigrationFramework;
  
  constructor(options: Partial<SessionStorageOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.migrationFramework = createMigrationFramework();
  }
  
  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------
  
  /**
   * Writes a session to disk with compression and validation.
   * 
   * @param sessionId - Session identifier
   * @param session - Session data to write
   * @throws {Error} If write operation fails
   */
  async writeSession(sessionId: SessionId, session: Session): Promise<void> {
    await logOperation(
      'storage.write',
      async () => {
        await ensureSessionsDirectory();
        
        // Validate session data
        const validatedSession = SessionSchema.parse(session);
        
        // Serialize session data
        const sessionData = JSON.stringify(validatedSession, null, 2);
        
        // Prepare versioned session format
        let finalData = sessionData;
        let compressed = false;
        let checksum: string | undefined;
        
        // Apply compression if enabled
        if (this.options.enableCompression) {
          const compressedData = await compressData(sessionData);
          // Only use compression if it actually reduces size
          if (compressedData.length < sessionData.length) {
            finalData = compressedData;
            compressed = true;
          }
        }
        
        // Calculate checksum if enabled
        if (this.options.enableChecksum) {
          checksum = calculateChecksum(sessionData); // Always checksum original data
        }
        
        // Create versioned session wrapper
        const versionedSession: VersionedSession = {
          version: '1.0.0',
          compressed,
          checksum,
          data: compressed ? finalData : validatedSession, // Store compressed string or original object
        };
        
        const finalContent = JSON.stringify(versionedSession, null, 2);
        
        // Check file size limit
        if (finalContent.length > this.options.maxFileSize) {
          throw new Error(`Session data too large: ${finalContent.length} bytes (max: ${this.options.maxFileSize})`);
        }
        
        // Write to file atomically
        const filePath = getSessionFilePath(sessionId);
        await atomicWriteFile(filePath, finalContent, {
          createBackup: this.options.createBackups,
        });
        
        // Update index
        const metadata = this.createSessionMetadata(validatedSession);
        await this.updateIndex(metadata);
      },
      sessionId,
      {
        compressed: this.options.enableCompression,
        checksum: this.options.enableChecksum,
        messageCount: session.messages.length,
        tokenCount: session.tokenCount.total,
      }
    );
  }
  
  /**
   * Reads a session from disk with decompression and validation.
   * 
   * @param sessionId - Session identifier
   * @returns Promise resolving to session data
   * @throws {Error} If read operation fails or data is invalid
   */
  async readSession(sessionId: SessionId): Promise<Session> {
    const filePath = getSessionFilePath(sessionId);
    
    // Read file content
    const content = await safeReadFile(filePath, {
      maxSize: this.options.maxFileSize,
    });
    
    // Parse versioned session format
    let versionedSession: VersionedSession;
    try {
      const parsed = JSON.parse(content);
      versionedSession = VersionedSessionSchema.parse(parsed);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      throw new Error(`Invalid session file format: ${errorMessage}`);
    }
    
    // Check if migration is needed
    if (this.migrationFramework.needsMigration(versionedSession)) {
      console.log(`Migrating session ${sessionId} from version ${this.migrationFramework.getDataVersion(versionedSession)} to ${this.migrationFramework.getCurrentVersion()}`);
      
      const migrationResult = await this.migrationFramework.migrateSession(sessionId, versionedSession);
      
      if (!migrationResult.success) {
        throw new Error(`Session migration failed: ${migrationResult.error}`);
      }
      
      if (migrationResult.warnings.length > 0) {
        console.warn(`Migration warnings for session ${sessionId}:`, migrationResult.warnings);
      }
      
      // Update the versioned session with migrated data
      versionedSession = {
        version: this.migrationFramework.getCurrentVersion(),
        compressed: versionedSession.compressed,
        checksum: versionedSession.checksum,
        data: versionedSession.data, // Migration framework updates this
      };
      
      // Write migrated session back to disk
      try {
        await this.writeSession(sessionId, versionedSession.data as Session);
        console.log(`Session ${sessionId} migrated successfully`);
      } catch (writeError: any) {
        console.warn(`Failed to write migrated session ${sessionId}: ${writeError.message}`);
      }
    }
    
    // Extract session data
    let sessionData: string;
    
    if (versionedSession.compressed) {
      // Decompress data
      if (typeof versionedSession.data !== 'string') {
        throw new Error('Compressed session data must be a string');
      }
      sessionData = await decompressData(versionedSession.data);
    } else {
      // Use data directly
      if (typeof versionedSession.data === 'string') {
        sessionData = versionedSession.data;
      } else {
        sessionData = JSON.stringify(versionedSession.data);
      }
    }
    
    // Verify checksum if present
    if (versionedSession.checksum && this.options.enableChecksum) {
      if (!verifyChecksum(sessionData, versionedSession.checksum)) {
        throw new Error('Session data checksum verification failed');
      }
    }
    
    // Parse and validate session
    let session: Session;
    try {
      const parsed = JSON.parse(sessionData);
      session = SessionSchema.parse(parsed);
    } catch (error: any) {
      throw new Error(`Invalid session data: ${error.message}`);
    }
    
    return session;
  }
  
  /**
   * Deletes a session from disk and removes from index.
   * 
   * @param sessionId - Session identifier
   * @throws {Error} If deletion fails
   */
  async deleteSession(sessionId: SessionId): Promise<void> {
    await logOperation(
      'storage.delete',
      async () => {
        const filePath = getSessionFilePath(sessionId);
        
        // Create backup before deletion if enabled
        if (this.options.createBackups && await fileExists(filePath)) {
          await this.createBackup(sessionId);
        }
        
        // Delete session file
        await safeDeleteFile(filePath);
        
        // Remove from index
        await this.removeFromIndex(sessionId);
      },
      sessionId
    );
  }
  
  /**
   * Checks if a session file exists.
   * 
   * @param sessionId - Session identifier
   * @returns Promise resolving to true if session exists
   */
  async sessionExists(sessionId: SessionId): Promise<boolean> {
    const filePath = getSessionFilePath(sessionId);
    return await fileExists(filePath);
  }
  
  // -------------------------------------------------------------------------
  // Index Management
  // -------------------------------------------------------------------------
  
  /**
   * Updates the session index with metadata for a session.
   * 
   * @param metadata - Session metadata to add/update
   * @throws {Error} If index update fails
   */
  async updateIndex(metadata: SessionMetadata): Promise<void> {
    const indexPath = getSessionIndexPath();
    
    // Load existing index or create new one
    let index: SessionIndex;
    try {
      if (await fileExists(indexPath)) {
        const content = await safeReadFile(indexPath);
        const parsed = JSON.parse(content);
        index = SessionIndexSchema.parse(parsed);
      } else {
        index = {
          version: '1.0.0',
          lastUpdated: Date.now(),
          sessions: {},
        };
      }
    } catch (error: any) {
      // If index is corrupted, rebuild it
      console.warn(`Index corrupted, rebuilding: ${error.message}`);
      await this.rebuildIndex();
      return this.updateIndex(metadata);
    }
    
    // Update metadata
    index.sessions[metadata.id] = metadata;
    index.lastUpdated = Date.now();
    
    // Write updated index
    const content = JSON.stringify(index, null, 2);
    await atomicWriteFile(indexPath, content, {
      createBackup: this.options.createBackups,
    });
  }
  
  /**
   * Gets the current session index.
   * 
   * @returns Promise resolving to session index
   * @throws {Error} If index cannot be loaded
   */
  async getIndex(): Promise<SessionIndex> {
    const indexPath = getSessionIndexPath();
    
    if (!await fileExists(indexPath)) {
      // Index doesn't exist, rebuild it
      await this.rebuildIndex();
    }
    
    try {
      const content = await safeReadFile(indexPath);
      const parsed = JSON.parse(content);
      return SessionIndexSchema.parse(parsed);
    } catch (error: any) {
      // Index is corrupted, rebuild it
      console.warn(`Index corrupted, rebuilding: ${error.message}`);
      await this.rebuildIndex();
      return this.getIndex();
    }
  }
  
  /**
   * Rebuilds the session index by scanning all session files.
   * 
   * @throws {Error} If rebuild fails
   */
  async rebuildIndex(): Promise<void> {
    const indexPath = getSessionIndexPath();
    const sessionFiles = await listSessionFiles();
    
    const index: SessionIndex = {
      version: '1.0.0',
      lastUpdated: Date.now(),
      sessions: {},
    };
    
    // Process each session file
    for (const filePath of sessionFiles) {
      try {
        const sessionId = path.basename(filePath, '.json') as SessionId;
        const session = await this.readSession(sessionId);
        const metadata = this.createSessionMetadata(session);
        index.sessions[sessionId] = metadata;
      } catch (error: any) {
        console.warn(`Failed to process session file ${filePath}: ${error.message}`);
        // Continue with other files
      }
    }
    
    // Write rebuilt index
    const content = JSON.stringify(index, null, 2);
    await atomicWriteFile(indexPath, content, {
      createBackup: false, // Don't backup during rebuild
    });
  }
  
  /**
   * Removes a session from the index.
   * 
   * @param sessionId - Session identifier to remove
   */
  private async removeFromIndex(sessionId: SessionId): Promise<void> {
    const index = await this.getIndex();
    delete index.sessions[sessionId];
    index.lastUpdated = Date.now();
    
    const indexPath = getSessionIndexPath();
    const content = JSON.stringify(index, null, 2);
    await atomicWriteFile(indexPath, content, {
      createBackup: this.options.createBackups,
    });
  }
  
  // -------------------------------------------------------------------------
  // Backup and Recovery
  // -------------------------------------------------------------------------
  
  /**
   * Creates a backup of a session file.
   * 
   * @param sessionId - Session identifier
   * @returns Promise resolving to backup file path
   * @throws {Error} If backup creation fails
   */
  async createBackup(sessionId: SessionId): Promise<string> {
    const filePath = getSessionFilePath(sessionId);
    const backupPath = `${filePath}.backup.${Date.now()}`;
    
    if (!await fileExists(filePath)) {
      throw new Error(`Session file not found: ${filePath}`);
    }
    
    // Read original file
    const content = await safeReadFile(filePath);
    
    // Write backup
    await atomicWriteFile(backupPath, content, {
      createBackup: false, // Don't create backup of backup
    });
    
    return backupPath;
  }
  
  /**
   * Restores a session from a backup file.
   * 
   * @param backupPath - Path to backup file
   * @returns Promise resolving to restored session ID
   * @throws {Error} If restore fails
   */
  async restoreFromBackup(backupPath: string): Promise<SessionId> {
    if (!await fileExists(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }
    
    // Read backup content
    const content = await safeReadFile(backupPath);
    
    // Parse to get session ID
    let sessionId: SessionId;
    try {
      const parsed = JSON.parse(content);
      const versionedSession = VersionedSessionSchema.parse(parsed);
      
      let sessionData: any;
      if (versionedSession.compressed && typeof versionedSession.data === 'string') {
        const decompressed = await decompressData(versionedSession.data);
        sessionData = JSON.parse(decompressed);
      } else {
        sessionData = versionedSession.data;
      }
      
      const session = SessionSchema.parse(sessionData);
      sessionId = session.id;
    } catch (error: any) {
      throw new Error(`Invalid backup file format: ${error.message}`);
    }
    
    // Restore to original location
    const filePath = getSessionFilePath(sessionId);
    await atomicWriteFile(filePath, content, {
      createBackup: false, // Don't backup during restore
    });
    
    // Update index
    const session = await this.readSession(sessionId);
    const metadata = this.createSessionMetadata(session);
    await this.updateIndex(metadata);
    
    return sessionId;
  }
  
  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  
  /**
   * Cleans up old sessions based on count and age limits.
   * 
   * @param maxCount - Maximum number of sessions to keep
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns Promise resolving to array of deleted session IDs
   * @throws {Error} If cleanup fails
   */
  async cleanupOldSessions(maxCount: number, maxAgeMs: number): Promise<SessionId[]> {
    const index = await this.getIndex();
    const sessions = Object.values(index.sessions);
    const now = Date.now();
    const deletedIds: SessionId[] = [];
    
    // Sort sessions by last modified (oldest first)
    sessions.sort((a, b) => (a?.lastModified || 0) - (b?.lastModified || 0));
    
    // Delete sessions that are too old
    for (const session of sessions) {
      if (session && now - session.lastModified > maxAgeMs) {
        try {
          await this.deleteSession(session.id);
          deletedIds.push(session.id);
        } catch (error: any) {
          console.warn(`Failed to delete old session ${session.id}: ${error.message}`);
        }
      }
    }
    
    // Get updated session list after age-based deletions
    const updatedIndex = await this.getIndex();
    const remainingSessions = Object.values(updatedIndex.sessions).filter(s => s !== undefined);
    
    // Delete excess sessions if we still have too many
    if (remainingSessions.length > maxCount) {
      // Sort remaining sessions by last modified (oldest first) for consistent deletion order
      remainingSessions.sort((a, b) => (a?.lastModified || 0) - (b?.lastModified || 0));
      
      const excessCount = remainingSessions.length - maxCount;
      const sessionsToDelete = remainingSessions.slice(0, excessCount);
      
      for (const session of sessionsToDelete) {
        if (session) {
          try {
            await this.deleteSession(session.id);
            deletedIds.push(session.id);
          } catch (error: any) {
            console.warn(`Failed to delete excess session ${session.id}: ${error.message}`);
          }
        }
      }
    }
    
    return deletedIds;
  }
  
  // -------------------------------------------------------------------------
  // Migration Operations
  // -------------------------------------------------------------------------
  
  /**
   * Migrates a single session to the current schema version.
   * 
   * @param sessionId - Session identifier to migrate
   * @returns Promise resolving to migration result
   */
  async migrateSession(sessionId: SessionId): Promise<MigrationResult> {
    const filePath = getSessionFilePath(sessionId);
    
    if (!await fileExists(filePath)) {
      throw new Error(`Session file not found: ${filePath}`);
    }
    
    // Read session file
    const content = await safeReadFile(filePath, {
      maxSize: this.options.maxFileSize,
    });
    
    let sessionData: any;
    try {
      sessionData = JSON.parse(content);
    } catch (error: any) {
      throw new Error(`Invalid JSON in session file: ${error.message}`);
    }
    
    // Check if migration is needed
    if (!this.migrationFramework.needsMigration(sessionData)) {
      return {
        success: true,
        fromVersion: this.migrationFramework.getDataVersion(sessionData),
        toVersion: this.migrationFramework.getCurrentVersion(),
        migrationPath: [this.migrationFramework.getDataVersion(sessionData)],
        warnings: [],
      };
    }
    
    // Perform migration
    const result = await this.migrationFramework.migrateSession(sessionId, sessionData);
    
    if (result.success) {
      // Write migrated data back to file
      try {
        // Extract the migrated session data
        let migratedSession: Session;
        if (sessionData.data) {
          migratedSession = sessionData.data;
        } else {
          migratedSession = sessionData;
        }
        
        await this.writeSession(sessionId, migratedSession);
      } catch (writeError: any) {
        result.warnings.push(`Failed to write migrated session: ${writeError.message}`);
      }
    }
    
    return result;
  }
  
  /**
   * Migrates all sessions in the storage to the current schema version.
   * 
   * @returns Promise resolving to array of migration results
   */
  async migrateAllSessions(): Promise<MigrationResult[]> {
    const sessionFiles = await listSessionFiles();
    const results: MigrationResult[] = [];
    
    for (const filePath of sessionFiles) {
      try {
        const sessionId = path.basename(filePath, '.json') as SessionId;
        const result = await this.migrateSession(sessionId);
        results.push(result);
        
        if (result.success && result.fromVersion !== result.toVersion) {
          console.log(`Migrated session ${sessionId}: ${result.fromVersion} -> ${result.toVersion}`);
        }
      } catch (error: any) {
        console.error(`Failed to migrate session from ${filePath}:`, error.message);
        results.push({
          success: false,
          fromVersion: 'unknown',
          toVersion: this.migrationFramework.getCurrentVersion(),
          migrationPath: [],
          error: error.message,
          warnings: [],
        });
      }
    }
    
    return results;
  }
  
  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------
  
  /**
   * Creates session metadata from a full session object.
   * 
   * @param session - Full session data
   * @returns Session metadata
   */
  private createSessionMetadata(session: Session): SessionMetadata {
    // Get preview from first user message or first message
    let preview: string | undefined;
    const firstUserMessage = session.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = typeof firstUserMessage.content === 'string' 
        ? firstUserMessage.content 
        : firstUserMessage.content.find(block => block.type === 'text')?.text || '';
      preview = content.slice(0, 100);
    }
    
    // Get last message content
    let lastMessage: string | undefined;
    if (session.messages.length > 0) {
      const last = session.messages[session.messages.length - 1];
      if (last) {
        const content = typeof last.content === 'string'
          ? last.content
          : last.content.find(block => block.type === 'text')?.text || '';
        lastMessage = content.slice(0, 50);
      }
    }
    
    return SessionMetadataSchema.parse({
      id: session.id,
      created: session.created,
      lastModified: session.lastModified,
      model: session.model,
      tokenCount: session.tokenCount,
      title: session.title,
      workspaceRoot: session.workspaceRoot,
      messageCount: session.messages.length,
      lastMessage,
      contextFiles: session.contextFiles,
      tags: session.tags,
      preview,
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================