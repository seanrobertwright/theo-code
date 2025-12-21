/**
 * @fileoverview Tests for session startup functionality
 * @module features/session/__tests__/startup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectAvailableSessions, formatSessionForDisplay, createSessionPreview } from '../startup.js';
import type { SessionMetadata, ISessionManager } from '../manager.js';

describe('Session Startup', () => {
  let mockSessionManager: ISessionManager;

  beforeEach(() => {
    mockSessionManager = {
      listSessions: vi.fn(),
      createSession: vi.fn(),
      saveSession: vi.fn(),
      loadSession: vi.fn(),
      deleteSession: vi.fn(),
      enableAutoSave: vi.fn(),
      disableAutoSave: vi.fn(),
      isAutoSaveEnabled: vi.fn(),
      forceAutoSave: vi.fn(),
      getAutoSaveConfig: vi.fn(),
      sessionExists: vi.fn(),
      getCurrentSession: vi.fn(),
      setCurrentSession: vi.fn(),
      restoreSession: vi.fn(),
      validateSessionIntegrity: vi.fn(),
      restoreSessionWithContext: vi.fn(),
    };
  });

  describe('detectAvailableSessions', () => {
    it('should detect available sessions', async () => {
      const mockSessions: SessionMetadata[] = [
        {
          id: 'session-1' as any,
          created: Date.now() - 1000 * 60 * 60, // 1 hour ago
          lastModified: Date.now() - 1000 * 60 * 30, // 30 minutes ago
          model: 'gpt-4o',
          messageCount: 5,
          tokenCount: { total: 1000, input: 500, output: 500 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['file1.ts'],
          tags: ['test'],
          preview: 'Test session',
        },
      ];

      vi.mocked(mockSessionManager.listSessions).mockResolvedValue(mockSessions);

      const result = await detectAvailableSessions(mockSessionManager);

      expect(result.hasAvailableSessions).toBe(true);
      expect(result.recentSessions).toHaveLength(1);
      expect(result.mostRecentSession).toEqual(mockSessions[0]);
      expect(result.totalSessionCount).toBe(1);
    });

    it('should handle no available sessions', async () => {
      vi.mocked(mockSessionManager.listSessions).mockResolvedValue([]);

      const result = await detectAvailableSessions(mockSessionManager);

      expect(result.hasAvailableSessions).toBe(false);
      expect(result.recentSessions).toHaveLength(0);
      expect(result.mostRecentSession).toBeNull();
      expect(result.totalSessionCount).toBe(0);
    });

    it('should filter old sessions', async () => {
      const oldSession: SessionMetadata = {
        id: 'old-session' as any,
        created: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
        lastModified: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
        model: 'gpt-4o',
        messageCount: 3,
        tokenCount: { total: 500, input: 250, output: 250 },
        workspaceRoot: '/test/workspace',
        contextFiles: [],
        tags: [],
        preview: 'Old session',
      };

      vi.mocked(mockSessionManager.listSessions).mockResolvedValue([oldSession]);

      const result = await detectAvailableSessions(mockSessionManager, {
        recentThresholdMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      expect(result.hasAvailableSessions).toBe(true);
      expect(result.recentSessions).toHaveLength(0); // Filtered out as too old
      expect(result.mostRecentSession).toBeNull();
      expect(result.totalSessionCount).toBe(1);
    });
  });

  describe('formatSessionForDisplay', () => {
    it('should format session metadata for display', () => {
      const session: SessionMetadata = {
        id: 'session-1' as any,
        created: Date.now() - 1000 * 60 * 60,
        lastModified: Date.now() - 1000 * 60 * 30,
        model: 'gpt-4o',
        messageCount: 5,
        tokenCount: { total: 1000, input: 500, output: 500 },
        workspaceRoot: '/test/workspace',
        contextFiles: ['file1.ts'],
        tags: ['test'],
        preview: 'Test session',
        title: 'My Test Session',
      };

      const result = formatSessionForDisplay(session);

      expect(result.title).toBe('My Test Session');
      expect(result.subtitle).toContain('gpt-4o');
      expect(result.subtitle).toContain('5 messages');
      expect(result.details).toBeUndefined();
    });

    it('should include details when requested', () => {
      const session: SessionMetadata = {
        id: 'session-1' as any,
        created: Date.now() - 1000 * 60 * 60,
        lastModified: Date.now() - 1000 * 60 * 30,
        model: 'gpt-4o',
        messageCount: 5,
        tokenCount: { total: 1000, input: 500, output: 500 },
        workspaceRoot: '/test/workspace',
        contextFiles: ['file1.ts'],
        tags: ['test'],
        preview: 'Test session',
      };

      const result = formatSessionForDisplay(session, { showDetails: true });

      expect(result.details).toBeDefined();
      expect(result.details).toContain('Workspace: /test/workspace');
      expect(result.details).toContain('Tokens: 1,000');
    });
  });

  describe('createSessionPreview', () => {
    it('should create preview from first user message', () => {
      const messages = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I am fine, thank you!' },
      ];

      const preview = createSessionPreview(messages);

      expect(preview).toBe('Hello, how are you?');
    });

    it('should handle no user messages', () => {
      const messages = [
        { role: 'system', content: 'System message' },
        { role: 'assistant', content: 'Assistant message' },
      ];

      const preview = createSessionPreview(messages);

      expect(preview).toBe('No messages');
    });

    it('should truncate long messages', () => {
      const longMessage = 'A'.repeat(200);
      const messages = [
        { role: 'user', content: longMessage },
      ];

      const preview = createSessionPreview(messages, 50);

      expect(preview).toBe('A'.repeat(50) + '...');
    });
  });
});