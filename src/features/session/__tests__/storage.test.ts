/**
 * @fileoverview Unit tests for SessionStorage class
 * @module features/session/__tests__/storage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionStorage } from '../storage.js';
import { 
  createSessionId, 
  createMessageId,
  type Session,
  type SessionId,
} from '../../../shared/types/index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

let testDir: string;
let storage: SessionStorage;

beforeEach(async () => {
  // Create a temporary directory for each test
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-storage-test-'));
  
  // Mock getSessionsDir to use our test directory
  const originalGetSessionsDir = (await import('../../../config/loader.js')).getSessionsDir;
  vi.mock('../../../config/loader.js', () => ({
    getSessionsDir: () => testDir,
  }));
  
  storage = new SessionStorage();
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  
  vi.restoreAllMocks();
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a test session with minimal required data
 */
function createTestSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  const sessionId = createSessionId();
  
  return {
    id: sessionId,
    version: '1.0.0',
    created: now,
    lastModified: now,
    model: 'gpt-4o',
    workspaceRoot: '/test/workspace',
    tokenCount: {
      total: 100,
      input: 50,
      output: 50,
    },
    filesAccessed: [],
    messages: [
      {
        id: createMessageId(),
        role: 'user',
        content: 'Hello, world!',
        timestamp: now,
      },
    ],
    contextFiles: [],
    title: 'Test Session',
    tags: [],
    notes: null,
    ...overrides,
  };
}

// =============================================================================
// UNIT TESTS
// =============================================================================

describe('SessionStorage', () => {
  describe('writeSession and readSession', () => {
    it('should write and read a session successfully', async () => {
      const session = createTestSession();
      
      // Write session
      await storage.writeSession(session.id, session);
      
      // Read session back
      const readSession = await storage.readSession(session.id);
      
      // Verify data integrity
      expect(readSession).toEqual(session);
    });

    it('should handle compression when enabled', async () => {
      const storageWithCompression = new SessionStorage({ enableCompression: true });
      const session = createTestSession({
        messages: Array(100).fill(null).map((_, i) => ({
          id: createMessageId(),
          role: 'user' as const,
          content: `This is a long message ${i} that should compress well when repeated many times. `.repeat(10),
          timestamp: Date.now(),
        })),
      });
      
      // Write session
      await storageWithCompression.writeSession(session.id, session);
      
      // Read session back
      const readSession = await storageWithCompression.readSession(session.id);
      
      // Verify data integrity
      expect(readSession).toEqual(session);
    });

    it('should validate checksums when enabled', async () => {
      const storageWithChecksum = new SessionStorage({ enableChecksum: true });
      const session = createTestSession();
      
      // Write session
      await storageWithChecksum.writeSession(session.id, session);
      
      // Read session back
      const readSession = await storageWithChecksum.readSession(session.id);
      
      // Verify data integrity
      expect(readSession).toEqual(session);
    });
  });

  describe('sessionExists', () => {
    it('should return true for existing sessions', async () => {
      const session = createTestSession();
      
      // Initially should not exist
      expect(await storage.sessionExists(session.id)).toBe(false);
      
      // Write session
      await storage.writeSession(session.id, session);
      
      // Now should exist
      expect(await storage.sessionExists(session.id)).toBe(true);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session successfully', async () => {
      const session = createTestSession();
      
      // Write session
      await storage.writeSession(session.id, session);
      expect(await storage.sessionExists(session.id)).toBe(true);
      
      // Delete session
      await storage.deleteSession(session.id);
      expect(await storage.sessionExists(session.id)).toBe(false);
    });
  });

  describe('index management', () => {
    it('should update index when writing sessions', async () => {
      const session = createTestSession();
      
      // Write session
      await storage.writeSession(session.id, session);
      
      // Get index
      const index = await storage.getIndex();
      
      // Verify session is in index
      expect(index.sessions[session.id]).toBeDefined();
      expect(index.sessions[session.id].id).toBe(session.id);
      expect(index.sessions[session.id].model).toBe(session.model);
      expect(index.sessions[session.id].messageCount).toBe(session.messages.length);
    });

    it('should rebuild index when corrupted', async () => {
      const session1 = createTestSession();
      const session2 = createTestSession();
      
      // Write sessions
      await storage.writeSession(session1.id, session1);
      await storage.writeSession(session2.id, session2);
      
      // Corrupt index by writing invalid JSON
      const indexPath = path.join(testDir, 'index.json');
      await fs.writeFile(indexPath, 'invalid json');
      
      // Getting index should trigger rebuild
      const index = await storage.getIndex();
      
      // Verify both sessions are in rebuilt index
      expect(index.sessions[session1.id]).toBeDefined();
      expect(index.sessions[session2.id]).toBeDefined();
    });
  });

  describe('backup and recovery', () => {
    it('should create and restore backups', async () => {
      const session = createTestSession();
      
      // Write session
      await storage.writeSession(session.id, session);
      
      // Create backup
      const backupPath = await storage.createBackup(session.id);
      expect(backupPath).toContain('.backup.');
      
      // Verify backup file exists
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
      
      // Delete original session
      await storage.deleteSession(session.id);
      expect(await storage.sessionExists(session.id)).toBe(false);
      
      // Restore from backup
      const restoredId = await storage.restoreFromBackup(backupPath);
      expect(restoredId).toBe(session.id);
      
      // Verify session is restored
      expect(await storage.sessionExists(session.id)).toBe(true);
      const restoredSession = await storage.readSession(session.id);
      expect(restoredSession).toEqual(session);
    });
  });

  describe('cleanup', () => {
    it('should cleanup old sessions by count', async () => {
      const sessions = Array(5).fill(null).map(() => createTestSession());
      
      // Write all sessions with different timestamps
      for (let i = 0; i < sessions.length; i++) {
        sessions[i].lastModified = Date.now() - (i * 1000); // Each session 1 second older
        await storage.writeSession(sessions[i].id, sessions[i]);
      }
      
      // Cleanup to keep only 3 sessions
      const deletedIds = await storage.cleanupOldSessions(3, Number.MAX_SAFE_INTEGER);
      
      // Should have deleted 2 oldest sessions
      expect(deletedIds).toHaveLength(2);
      
      // Verify correct sessions were deleted (oldest ones)
      expect(deletedIds).toContain(sessions[3].id);
      expect(deletedIds).toContain(sessions[4].id);
      
      // Verify remaining sessions still exist
      expect(await storage.sessionExists(sessions[0].id)).toBe(true);
      expect(await storage.sessionExists(sessions[1].id)).toBe(true);
      expect(await storage.sessionExists(sessions[2].id)).toBe(true);
    });

    it('should cleanup old sessions by age', async () => {
      const oldSession = createTestSession();
      const newSession = createTestSession();
      
      // Make one session old
      oldSession.lastModified = Date.now() - 10000; // 10 seconds ago
      newSession.lastModified = Date.now() - 1000;  // 1 second ago
      
      await storage.writeSession(oldSession.id, oldSession);
      await storage.writeSession(newSession.id, newSession);
      
      // Cleanup sessions older than 5 seconds
      const deletedIds = await storage.cleanupOldSessions(Number.MAX_SAFE_INTEGER, 5000);
      
      // Should have deleted only the old session
      expect(deletedIds).toHaveLength(1);
      expect(deletedIds[0]).toBe(oldSession.id);
      
      // Verify new session still exists
      expect(await storage.sessionExists(newSession.id)).toBe(true);
      expect(await storage.sessionExists(oldSession.id)).toBe(false);
    });
  });
});