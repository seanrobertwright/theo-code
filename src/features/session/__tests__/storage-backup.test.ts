/**
 * @fileoverview Tests for SessionStorage backup and recovery functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionStorage } from '../storage.js';
import { 
  type Session, 
  createSessionId,
  createMessageId,
} from '../../../shared/types/index.js';

// Mock the config loader
vi.mock('../../../config/loader.js', async () => {
  const actual = await vi.importActual('../../../config/loader.js');
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  };
});

describe('SessionStorage Backup and Recovery', () => {
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-backup-test-'));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    storage = new SessionStorage({ createBackups: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  describe('createBackup', () => {
    it('should create a backup of an existing session', async () => {
      const sessionId = createSessionId();
      const session: Session = {
        id: sessionId,
        version: '1.0.0',
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        tokenCount: { total: 100, input: 50, output: 50 },
        filesAccessed: [],
        messages: [{
          id: createMessageId(),
          role: 'user',
          content: 'Test message',
          timestamp: Date.now(),
        }],
        contextFiles: [],
        tags: [],
      };

      // Write session
      await storage.writeSession(sessionId, session);

      // Create backup
      const backupPath = await storage.createBackup(sessionId);

      // Verify backup file exists
      expect(await fs.access(backupPath).then(() => true).catch(() => false)).toBe(true);

      // Verify backup is a valid versioned session format
      const backupContent = await fs.readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);
      expect(backupData.version).toBe('1.0.0');
      expect(backupData).toHaveProperty('data');
      
      // The backup should be restorable
      const restoredSessionId = await storage.restoreFromBackup(backupPath);
      expect(restoredSessionId).toBe(sessionId);
    });

    it('should throw error when trying to backup non-existent session', async () => {
      const sessionId = createSessionId();
      
      await expect(storage.createBackup(sessionId)).rejects.toThrow('Session file not found');
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore a session from backup', async () => {
      const sessionId = createSessionId();
      const session: Session = {
        id: sessionId,
        version: '1.0.0',
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        tokenCount: { total: 100, input: 50, output: 50 },
        filesAccessed: [],
        messages: [{
          id: createMessageId(),
          role: 'user',
          content: 'Backup test message',
          timestamp: Date.now(),
        }],
        contextFiles: ['test.ts'],
        tags: ['backup-test'],
      };

      // Write session and create backup
      await storage.writeSession(sessionId, session);
      const backupPath = await storage.createBackup(sessionId);

      // Delete the original session
      await storage.deleteSession(sessionId);

      // Verify session is gone
      expect(await storage.sessionExists(sessionId)).toBe(false);

      // Restore from backup
      const restoredSessionId = await storage.restoreFromBackup(backupPath);

      // Verify restored session ID matches original
      expect(restoredSessionId).toBe(sessionId);

      // Verify session exists again
      expect(await storage.sessionExists(sessionId)).toBe(true);

      // Verify restored session data matches original
      const restoredSession = await storage.readSession(sessionId);
      expect(restoredSession).toEqual(session);

      // Verify index is updated
      const index = await storage.getIndex();
      expect(index.sessions[sessionId]).toBeDefined();
      expect(index.sessions[sessionId].messageCount).toBe(1);
      expect(index.sessions[sessionId].contextFiles).toEqual(['test.ts']);
      expect(index.sessions[sessionId].tags).toEqual(['backup-test']);
    });

    it('should throw error when trying to restore from non-existent backup', async () => {
      const nonExistentPath = path.join(tempDir, 'non-existent-backup.json');
      
      await expect(storage.restoreFromBackup(nonExistentPath)).rejects.toThrow('Backup file not found');
    });

    it('should throw error when trying to restore from invalid backup format', async () => {
      const invalidBackupPath = path.join(tempDir, 'invalid-backup.json');
      await fs.writeFile(invalidBackupPath, 'invalid json content');
      
      await expect(storage.restoreFromBackup(invalidBackupPath)).rejects.toThrow('Invalid backup file format');
    });
  });

  describe('automatic backup during deletion', () => {
    it('should create backup before deleting session when backups are enabled', async () => {
      const sessionId = createSessionId();
      const session: Session = {
        id: sessionId,
        version: '1.0.0',
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        tokenCount: { total: 50, input: 25, output: 25 },
        filesAccessed: [],
        messages: [{
          id: createMessageId(),
          role: 'user',
          content: 'Auto backup test',
          timestamp: Date.now(),
        }],
        contextFiles: [],
        tags: [],
      };

      // Write session
      await storage.writeSession(sessionId, session);

      // Delete session (should create backup automatically)
      await storage.deleteSession(sessionId);

      // Check if backup was created
      const files = await fs.readdir(tempDir);
      const backupFiles = files.filter(file => file.includes('.backup.'));
      
      expect(backupFiles.length).toBeGreaterThan(0);

      // Verify backup is a valid versioned session format
      const backupPath = path.join(tempDir, backupFiles[0]);
      const backupContent = await fs.readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);
      expect(backupData.version).toBe('1.0.0');
      expect(backupData).toHaveProperty('data');
    });
  });
});