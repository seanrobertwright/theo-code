/**
 * @fileoverview Unit tests for SessionManager class
 * @module features/session/__tests__/manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import type { CreateSessionOptions, AutoSaveConfig } from '../manager.js';

// Mock the config loader
vi.mock('../../../config/loader.js', async () => {
  const actual = await vi.importActual('../../../config/loader.js');
  return {
    ...actual,
    getSessionsDir: vi.fn(),
    loadConfig: vi.fn().mockReturnValue({
      global: {
        session: {
          autoSaveInterval: 30000,
          maxSessions: 50,
        },
      },
    }),
  };
});

describe('SessionManager', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-manager-test-'));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    // Create storage and manager instances
    storage = new SessionStorage();
    manager = new SessionManager(storage);
  });

  afterEach(async () => {
    // Clean up auto-save and temp directory
    manager.disableAutoSave();
    
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session with all required fields', async () => {
      const options: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        title: 'Test Session',
        tags: ['test', 'unit'],
        notes: 'This is a test session',
      };

      const session = await manager.createSession(options);

      expect(session.id).toBeDefined();
      expect(session.model).toBe(options.model);
      expect(session.workspaceRoot).toBe(options.workspaceRoot);
      expect(session.title).toBe(options.title);
      expect(session.tags).toEqual(options.tags);
      expect(session.notes).toBe(options.notes);
      expect(session.created).toBeGreaterThan(0);
      expect(session.lastModified).toBeGreaterThan(0);
      expect(session.messages).toEqual([]);
      expect(session.contextFiles).toEqual([]);
      expect(session.tokenCount).toEqual({ total: 0, input: 0, output: 0 });
    });

    it('should set the session as current', async () => {
      const options: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      };

      const session = await manager.createSession(options);
      const currentSession = manager.getCurrentSession();

      expect(currentSession).toEqual(session);
    });
  });

  describe('saveSession and loadSession', () => {
    it('should save and load a session correctly', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        title: 'Test Session',
      });

      // Modify the session
      const modifiedSession = {
        ...session,
        title: 'Modified Session',
        notes: 'This session was modified',
      };

      await manager.saveSession(modifiedSession);
      const loadedSession = await manager.loadSession(session.id);

      expect(loadedSession.title).toBe('Modified Session');
      expect(loadedSession.notes).toBe('This session was modified');
      expect(loadedSession.lastModified).toBeGreaterThan(session.lastModified);
    });

    it('should update timestamp when loading with updateTimestamp option', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      });

      const originalLastModified = session.lastModified;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 5));

      const loadedSession = await manager.loadSession(session.id, { updateTimestamp: true });

      expect(loadedSession.lastModified).toBeGreaterThan(originalLastModified);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session and clear current if it matches', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      });

      expect(manager.getCurrentSession()).toEqual(session);
      expect(await manager.sessionExists(session.id)).toBe(true);

      await manager.deleteSession(session.id);

      expect(manager.getCurrentSession()).toBeNull();
      expect(await manager.sessionExists(session.id)).toBe(false);
    });
  });

  describe('auto-save functionality', () => {
    it('should enable and disable auto-save correctly', () => {
      const config: AutoSaveConfig = {
        enabled: true,
        intervalMs: 5000,
        maxRetries: 3,
      };

      expect(manager.isAutoSaveEnabled()).toBe(false);

      manager.enableAutoSave(config);
      expect(manager.isAutoSaveEnabled()).toBe(true);

      const retrievedConfig = manager.getAutoSaveConfig();
      expect(retrievedConfig).toEqual(config);

      manager.disableAutoSave();
      expect(manager.isAutoSaveEnabled()).toBe(false);
      expect(manager.getAutoSaveConfig()).toBeNull();
    });

    it('should validate auto-save configuration', () => {
      expect(() => {
        manager.enableAutoSave({
          enabled: true,
          intervalMs: -1000,
        });
      }).toThrow('Auto-save interval must be positive');

      expect(() => {
        manager.enableAutoSave({
          enabled: true,
          intervalMs: 5000,
          maxRetries: -1,
        });
      }).toThrow('Max retries cannot be negative');
    });

    it('should force auto-save when current session exists', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        title: 'Original Title',
      });

      // Modify the current session
      const modifiedSession = {
        ...session,
        title: 'Force Saved Title',
      };
      manager.setCurrentSession(modifiedSession);

      // Force auto-save
      await manager.forceAutoSave();

      // Verify the session was saved
      const loadedSession = await manager.loadSession(session.id);
      expect(loadedSession.title).toBe('Force Saved Title');
    });

    it('should throw error when forcing auto-save with no current session', async () => {
      manager.setCurrentSession(null);

      await expect(manager.forceAutoSave()).rejects.toThrow('No current session to save');
    });

    it('should perform auto-save at specified intervals', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        title: 'Auto-save Test',
      });

      // Enable auto-save with short interval
      manager.enableAutoSave({
        enabled: true,
        intervalMs: 100, // 100ms for fast testing
      });

      // Modify the session
      const modifiedSession = {
        ...session,
        title: 'Auto-saved Title',
      };
      manager.setCurrentSession(modifiedSession);

      // Wait for auto-save to trigger
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify the session was auto-saved
      const loadedSession = await manager.loadSession(session.id);
      expect(loadedSession.title).toBe('Auto-saved Title');

      manager.disableAutoSave();
    });
  });

  describe('session management', () => {
    it('should track current session correctly', async () => {
      expect(manager.getCurrentSession()).toBeNull();

      const session1 = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace1',
      });

      expect(manager.getCurrentSession()).toEqual(session1);

      const session2 = await manager.createSession({
        model: 'claude-3-sonnet',
        workspaceRoot: '/test/workspace2',
      });

      expect(manager.getCurrentSession()).toEqual(session2);

      manager.setCurrentSession(session1);
      expect(manager.getCurrentSession()).toEqual(session1);

      manager.setCurrentSession(null);
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should check session existence correctly', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      });

      expect(await manager.sessionExists(session.id)).toBe(true);

      await manager.deleteSession(session.id);

      expect(await manager.sessionExists(session.id)).toBe(false);
    });

    it('should restore sessions and set as current', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        title: 'Restoration Test',
      });

      // Clear current session
      manager.setCurrentSession(null);
      expect(manager.getCurrentSession()).toBeNull();

      // Restore session
      const restoredSession = await manager.restoreSession(session.id);

      expect(restoredSession.id).toBe(session.id);
      expect(restoredSession.title).toBe('Restoration Test');
      expect(manager.getCurrentSession()).toEqual(restoredSession);
      
      // Verify timestamp was updated (restoration should update lastModified)
      expect(restoredSession.lastModified).toBeGreaterThan(session.lastModified);
    });

    it('should validate session integrity', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      });

      // Valid session should pass validation
      expect(manager.validateSessionIntegrity(session)).toBe(true);

      // Invalid session should fail validation
      const invalidSession = {
        ...session,
        created: session.lastModified + 1000, // Created after lastModified
      };
      expect(manager.validateSessionIntegrity(invalidSession)).toBe(false);
    });

    it('should restore session with context file status', async () => {
      const session = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      });

      // Add some context files to the session
      const sessionWithContext = {
        ...session,
        contextFiles: ['/path/to/file1.ts', '/path/to/file2.js'],
      };
      await manager.saveSession(sessionWithContext);

      // Restore with context
      const result = await manager.restoreSessionWithContext(session.id);

      expect(result.session.id).toBe(session.id);
      expect(result.session.contextFiles).toEqual(['/path/to/file1.ts', '/path/to/file2.js']);
      
      // Since our mock implementation assumes files exist, all should be found
      expect(result.contextFilesFound).toEqual(['/path/to/file1.ts', '/path/to/file2.js']);
      expect(result.contextFilesMissing).toEqual([]);
    });
  });

  describe('session listing functionality', () => {
    beforeEach(async () => {
      // Clean up any existing sessions
      const existingSessions = await manager.listSessions();
      for (const session of existingSessions) {
        await manager.deleteSession(session.id);
      }
    });

    it('should list sessions with all required metadata fields', async () => {
      // Create test sessions
      const session1 = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace1',
        title: 'First Session',
        tags: ['test', 'first'],
        notes: 'First test session',
      });

      const session2 = await manager.createSession({
        model: 'claude-3-sonnet',
        workspaceRoot: '/test/workspace2',
        title: 'Second Session',
        tags: ['test', 'second'],
        notes: 'Second test session',
      });

      const sessions = await manager.listSessions();

      expect(sessions).toHaveLength(2);

      // Verify all required metadata fields are present
      for (const session of sessions) {
        expect(session.id).toBeDefined();
        expect(session.created).toBeGreaterThan(0);
        expect(session.lastModified).toBeGreaterThan(0);
        expect(session.model).toBeDefined();
        expect(session.tokenCount).toBeDefined();
        expect(session.tokenCount.total).toBeGreaterThanOrEqual(0);
        expect(session.tokenCount.input).toBeGreaterThanOrEqual(0);
        expect(session.tokenCount.output).toBeGreaterThanOrEqual(0);
        expect(session.messageCount).toBeGreaterThanOrEqual(0);
        expect(session.contextFiles).toBeDefined();
        expect(session.tags).toBeDefined();
        expect(Array.isArray(session.contextFiles)).toBe(true);
        expect(Array.isArray(session.tags)).toBe(true);
      }

      // Verify specific session data
      const firstSession = sessions.find(s => s.title === 'First Session');
      const secondSession = sessions.find(s => s.title === 'Second Session');

      expect(firstSession).toBeDefined();
      expect(firstSession?.model).toBe('gpt-4o');
      expect(firstSession?.tags).toEqual(['test', 'first']);

      expect(secondSession).toBeDefined();
      expect(secondSession?.model).toBe('claude-3-sonnet');
      expect(secondSession?.tags).toEqual(['test', 'second']);
    });

    it('should sort sessions by different criteria', async () => {
      // Create sessions with different timestamps
      const session1 = await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace1',
        title: 'Oldest Session',
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 5));

      const session2 = await manager.createSession({
        model: 'claude-3-sonnet',
        workspaceRoot: '/test/workspace2',
        title: 'Newest Session',
      });

      // Test sorting by created date (ascending)
      const sessionsByCreatedAsc = await manager.listSessions({
        sortBy: 'created',
        sortOrder: 'asc',
      });

      expect(sessionsByCreatedAsc[0].title).toBe('Oldest Session');
      expect(sessionsByCreatedAsc[1].title).toBe('Newest Session');

      // Test sorting by created date (descending - default)
      const sessionsByCreatedDesc = await manager.listSessions({
        sortBy: 'created',
        sortOrder: 'desc',
      });

      expect(sessionsByCreatedDesc[0].title).toBe('Newest Session');
      expect(sessionsByCreatedDesc[1].title).toBe('Oldest Session');

      // Test sorting by lastModified (default sort)
      const sessionsByLastModified = await manager.listSessions();
      expect(sessionsByLastModified[0].title).toBe('Newest Session');
      expect(sessionsByLastModified[1].title).toBe('Oldest Session');
    });

    it('should filter sessions by model', async () => {
      // Create sessions with different models
      await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace1',
        title: 'GPT Session',
      });

      await manager.createSession({
        model: 'claude-3-sonnet',
        workspaceRoot: '/test/workspace2',
        title: 'Claude Session',
      });

      await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace3',
        title: 'Another GPT Session',
      });

      // Filter by GPT model
      const gptSessions = await manager.listSessions({
        model: 'gpt-4o',
      });

      expect(gptSessions).toHaveLength(2);
      expect(gptSessions.every(s => s.model === 'gpt-4o')).toBe(true);

      // Filter by Claude model
      const claudeSessions = await manager.listSessions({
        model: 'claude-3-sonnet',
      });

      expect(claudeSessions).toHaveLength(1);
      expect(claudeSessions[0].model).toBe('claude-3-sonnet');
      expect(claudeSessions[0].title).toBe('Claude Session');
    });

    it('should filter sessions by tags', async () => {
      // Create sessions with different tags
      await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace1',
        title: 'Development Session',
        tags: ['development', 'backend'],
      });

      await manager.createSession({
        model: 'claude-3-sonnet',
        workspaceRoot: '/test/workspace2',
        title: 'Testing Session',
        tags: ['testing', 'frontend'],
      });

      await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace3',
        title: 'Mixed Session',
        tags: ['development', 'testing'],
      });

      // Filter by development tag
      const devSessions = await manager.listSessions({
        tags: ['development'],
      });

      expect(devSessions).toHaveLength(2);
      expect(devSessions.every(s => s.tags.includes('development'))).toBe(true);

      // Filter by testing tag
      const testSessions = await manager.listSessions({
        tags: ['testing'],
      });

      expect(testSessions).toHaveLength(2);
      expect(testSessions.every(s => s.tags.includes('testing'))).toBe(true);

      // Filter by backend tag
      const backendSessions = await manager.listSessions({
        tags: ['backend'],
      });

      expect(backendSessions).toHaveLength(1);
      expect(backendSessions[0].title).toBe('Development Session');
    });

    it('should support pagination with offset and limit', async () => {
      // Create multiple sessions
      const sessionTitles = ['Session 1', 'Session 2', 'Session 3', 'Session 4', 'Session 5'];
      
      for (const title of sessionTitles) {
        await manager.createSession({
          model: 'gpt-4o',
          workspaceRoot: `/test/workspace/${title.replace(' ', '-').toLowerCase()}`,
          title,
        });
        // Small delay to ensure different timestamps for consistent ordering
        await new Promise(resolve => setTimeout(resolve, 2));
      }

      // Test limit only
      const limitedSessions = await manager.listSessions({
        limit: 3,
        sortBy: 'created',
        sortOrder: 'asc',
      });

      expect(limitedSessions).toHaveLength(3);
      expect(limitedSessions[0].title).toBe('Session 1');
      expect(limitedSessions[1].title).toBe('Session 2');
      expect(limitedSessions[2].title).toBe('Session 3');

      // Test offset only
      const offsetSessions = await manager.listSessions({
        offset: 2,
        sortBy: 'created',
        sortOrder: 'asc',
      });

      expect(offsetSessions).toHaveLength(3);
      expect(offsetSessions[0].title).toBe('Session 3');
      expect(offsetSessions[1].title).toBe('Session 4');
      expect(offsetSessions[2].title).toBe('Session 5');

      // Test offset and limit together
      const paginatedSessions = await manager.listSessions({
        offset: 1,
        limit: 2,
        sortBy: 'created',
        sortOrder: 'asc',
      });

      expect(paginatedSessions).toHaveLength(2);
      expect(paginatedSessions[0].title).toBe('Session 2');
      expect(paginatedSessions[1].title).toBe('Session 3');
    });

    it('should handle empty session list gracefully', async () => {
      const sessions = await manager.listSessions();
      expect(sessions).toHaveLength(0);
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should handle listing errors gracefully', async () => {
      // Mock storage to throw error
      const originalGetIndex = storage.getIndex;
      storage.getIndex = vi.fn().mockRejectedValue(new Error('Storage error'));

      const sessions = await manager.listSessions();

      expect(sessions).toHaveLength(0);
      expect(Array.isArray(sessions)).toBe(true);

      // Restore original method
      storage.getIndex = originalGetIndex;
    });

    it('should combine multiple filters correctly', async () => {
      // Create sessions with various combinations
      await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace1',
        title: 'GPT Dev Session',
        tags: ['development', 'backend'],
      });

      await manager.createSession({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace2',
        title: 'GPT Test Session',
        tags: ['testing', 'frontend'],
      });

      await manager.createSession({
        model: 'claude-3-sonnet',
        workspaceRoot: '/test/workspace3',
        title: 'Claude Dev Session',
        tags: ['development', 'backend'],
      });

      // Filter by both model and tags
      const filteredSessions = await manager.listSessions({
        model: 'gpt-4o',
        tags: ['development'],
      });

      expect(filteredSessions).toHaveLength(1);
      expect(filteredSessions[0].title).toBe('GPT Dev Session');
      expect(filteredSessions[0].model).toBe('gpt-4o');
      expect(filteredSessions[0].tags).toContain('development');
    });
  });
});