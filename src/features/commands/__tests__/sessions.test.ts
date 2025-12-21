/**
 * @fileoverview Unit tests for /sessions command family handlers
 * @module features/commands/__tests__/sessions.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sessionsCommandHandler } from '../handlers/sessions.js';
import type { CommandContext } from '../types.js';
import type { SessionMetadata, SessionId } from '../../../shared/types/index.js';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockSessionMetadata: SessionMetadata = {
  id: 'test-session-123' as SessionId,
  created: Date.now() - 86400000, // 1 day ago
  lastModified: Date.now() - 3600000, // 1 hour ago
  model: 'gpt-4o',
  messageCount: 5,
  tokenCount: { total: 1500, input: 800, output: 700 },
  workspaceRoot: '/test/workspace',
  contextFiles: ['src/test.ts', 'README.md'],
  tags: ['test', 'development'],
  title: 'Test Session',
  preview: 'This is a test session for unit testing',
  lastMessage: 'Last message in the session',
};

const mockSessions: SessionMetadata[] = [
  mockSessionMetadata,
  {
    ...mockSessionMetadata,
    id: 'test-session-456' as SessionId,
    title: 'Another Test Session',
    messageCount: 3,
    preview: 'Another session for testing',
    model: 'gpt-3.5-turbo',
    created: Date.now() - 172800000, // 2 days ago
  },
  {
    ...mockSessionMetadata,
    id: 'test-session-789' as SessionId,
    title: 'Old Session',
    messageCount: 10,
    preview: 'An older session',
    created: Date.now() - 2592000000, // 30 days ago
    lastModified: Date.now() - 2592000000,
  },
];

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

const createMockSessionManager = () => ({
  listSessions: vi.fn(),
  sessionExists: vi.fn(),
  deleteSessionWithConfirmation: vi.fn(),
  exportSession: vi.fn(),
  searchSessions: vi.fn(),
  filterSessions: vi.fn(),
  cleanupOldSessions: vi.fn(),
  checkStorageLimits: vi.fn(),
});

const createMockContext = (sessionManager = createMockSessionManager()): CommandContext => ({
  addMessage: vi.fn(),
  setError: vi.fn(),
  showConfirmation: vi.fn(),
  workspaceRoot: '/test/workspace',
  currentModel: 'gpt-4o',
  sessionActions: {
    createNewSession: vi.fn(),
    restoreSession: vi.fn(),
    saveCurrentSession: vi.fn(),
    getSessionManager: () => sessionManager,
  },
});

// =============================================================================
// TESTS
// =============================================================================

describe('Sessions Command Handler', () => {
  let mockContext: CommandContext;
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    mockSessionManager = createMockSessionManager();
    mockContext = createMockContext(mockSessionManager);
    
    // Set up default mock for checkStorageLimits
    mockSessionManager.checkStorageLimits.mockResolvedValue({
      withinLimits: true,
      sessionCountExceeded: false,
      totalSizeExceeded: false,
      diskSpaceExceeded: false,
      warningThresholdReached: false,
      suggestedActions: [],
      estimatedSpaceSavings: 0,
    });
  });

  describe('Sessions List Command', () => {
    it('should list all sessions when no arguments provided', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);

      // Act
      await sessionsCommandHandler([], mockContext);

      // Assert
      expect(mockSessionManager.listSessions).toHaveBeenCalledWith({
        sortBy: 'lastModified',
        sortOrder: 'desc',
        limit: 20,
        offset: undefined,
        model: undefined,
        tags: undefined,
      });

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('📋 **Sessions**'),
      });
    });

    it('should show no sessions message when no sessions available', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue([]);

      // Act
      await sessionsCommandHandler(['list'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('📭 **No Sessions Found**'),
      });
    });

    it('should handle list command with options', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue(mockSessions.slice(0, 1));

      // Act
      await sessionsCommandHandler(['list', '--limit', '1', '--model', 'gpt-4o'], mockContext);

      // Assert
      expect(mockSessionManager.listSessions).toHaveBeenCalledWith({
        sortBy: 'lastModified',
        sortOrder: 'desc',
        limit: 1,
        offset: undefined,
        model: 'gpt-4o',
        tags: undefined,
      });
    });

    it('should handle session listing errors gracefully', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      mockSessionManager.listSessions.mockRejectedValue(error);

      // Act
      await sessionsCommandHandler(['list'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Failed to List Sessions**'),
      });
    });
  });

  describe('Sessions Delete Command', () => {
    it('should delete session with confirmation', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      mockSessionManager.deleteSessionWithConfirmation.mockResolvedValue(true);
      (mockContext.showConfirmation as any).mockResolvedValue(true);

      // Act
      await sessionsCommandHandler(['delete', sessionId], mockContext);

      // Assert
      expect(mockSessionManager.sessionExists).toHaveBeenCalledWith(sessionId);
      expect(mockContext.showConfirmation).toHaveBeenCalledWith(
        'Delete session "Test Session"?',
        expect.stringContaining('This action cannot be undone')
      );
      expect(mockSessionManager.deleteSessionWithConfirmation).toHaveBeenCalledWith(sessionId, true);
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('✅ **Session Deleted**'),
      });
    });

    it('should handle missing session ID', async () => {
      // Act
      await sessionsCommandHandler(['delete'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Missing Session ID**'),
      });
    });

    it('should handle session not found', async () => {
      // Arrange
      const sessionId = 'nonexistent-session' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(false);

      // Act
      await sessionsCommandHandler(['delete', sessionId], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Session Not Found**'),
      });
    });

    it('should handle user cancellation of deletion', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      (mockContext.showConfirmation as any).mockResolvedValue(false);

      // Act
      await sessionsCommandHandler(['delete', sessionId], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: '⏹️ **Session Deletion Cancelled**',
      });
      expect(mockSessionManager.deleteSessionWithConfirmation).not.toHaveBeenCalled();
    });

    it('should handle deletion failure', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      mockSessionManager.deleteSessionWithConfirmation.mockResolvedValue(false);
      (mockContext.showConfirmation as any).mockResolvedValue(true);

      // Act
      await sessionsCommandHandler(['delete', sessionId], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Deletion Failed**'),
      });
    });
  });

  describe('Sessions Export Command', () => {
    it('should export session successfully', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      const exportResult = {
        format: 'json-pretty',
        size: 1024,
        sanitized: true,
        warnings: [],
      };
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.exportSession.mockResolvedValue(exportResult);

      // Act
      await sessionsCommandHandler(['export', sessionId], mockContext);

      // Assert
      expect(mockSessionManager.sessionExists).toHaveBeenCalledWith(sessionId);
      expect(mockSessionManager.exportSession).toHaveBeenCalledWith(sessionId, {
        format: 'json-pretty',
        sanitize: true,
        includeContent: true,
        metadataOnly: false,
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('✅ **Session Exported**'),
      });
    });

    it('should handle missing session ID for export', async () => {
      // Act
      await sessionsCommandHandler(['export'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Missing Session ID**'),
      });
    });

    it('should handle export with custom format', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      const exportResult = {
        format: 'json-compact',
        size: 512,
        sanitized: true,
        warnings: ['Some context files missing'],
      };
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.exportSession.mockResolvedValue(exportResult);

      // Act
      await sessionsCommandHandler(['export', sessionId, 'json-compact'], mockContext);

      // Assert
      expect(mockSessionManager.exportSession).toHaveBeenCalledWith(sessionId, {
        format: 'json-compact',
        sanitize: true,
        includeContent: true,
        metadataOnly: false,
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('⚠️ **Warnings:**'),
      });
    });
  });

  describe('Sessions Search Command', () => {
    it('should search sessions successfully', async () => {
      // Arrange
      const searchResults = [
        {
          session: mockSessionMetadata,
          relevanceScore: 0.85,
          matches: [
            {
              type: 'content',
              text: 'test function implementation',
              context: 'Here is a test function implementation for the feature',
            },
          ],
        },
      ];
      mockSessionManager.searchSessions.mockResolvedValue(searchResults);

      // Act
      await sessionsCommandHandler(['search', 'test', 'function'], mockContext);

      // Assert
      expect(mockSessionManager.searchSessions).toHaveBeenCalledWith('test function', {
        limit: 20,
        minRelevance: 0.1,
        includeContent: true,
        includeMetadata: true,
        includeFilenames: true,
        sortBy: 'relevance',
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('🔍 **Search Results**'),
      });
    });

    it('should handle missing search query', async () => {
      // Act
      await sessionsCommandHandler(['search'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Missing Search Query**'),
      });
    });

    it('should handle no search results', async () => {
      // Arrange
      mockSessionManager.searchSessions.mockResolvedValue([]);

      // Act
      await sessionsCommandHandler(['search', 'nonexistent'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('🔍 **No Results Found**'),
      });
    });
  });

  describe('Sessions Filter Command', () => {
    it('should filter sessions by model', async () => {
      // Arrange
      const filteredSessions = mockSessions.filter(s => s.model === 'gpt-4o');
      mockSessionManager.filterSessions.mockResolvedValue(filteredSessions);

      // Act
      await sessionsCommandHandler(['filter', '--model', 'gpt-4o'], mockContext);

      // Assert
      expect(mockSessionManager.filterSessions).toHaveBeenCalledWith({
        model: 'gpt-4o',
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('🔧 **Filter Results**'),
      });
    });

    it('should filter sessions by date range', async () => {
      // Arrange
      const filteredSessions = [mockSessions[0]];
      mockSessionManager.filterSessions.mockResolvedValue(filteredSessions);

      // Act
      await sessionsCommandHandler(['filter', '--date', '2024-12'], mockContext);

      // Assert
      expect(mockSessionManager.filterSessions).toHaveBeenCalledWith({
        dateRange: {
          start: expect.any(Date),
          end: expect.any(Date),
        },
      });
    });

    it('should handle no filter criteria', async () => {
      // Act
      await sessionsCommandHandler(['filter'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **No Filter Criteria**'),
      });
    });

    it('should handle no matching sessions', async () => {
      // Arrange
      mockSessionManager.filterSessions.mockResolvedValue([]);

      // Act
      await sessionsCommandHandler(['filter', '--model', 'nonexistent'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('🔧 **No Matching Sessions**'),
      });
    });
  });

  describe('Sessions Cleanup Command', () => {
    it('should perform cleanup with confirmation', async () => {
      // Arrange
      const dryRunResult = {
        deletedSessions: ['old-session-1', 'old-session-2'],
        deletedByAge: 1,
        deletedByCount: 1,
        spaceFree: 2048,
        errors: [],
      };
      const cleanupResult = {
        ...dryRunResult,
        errors: [],
      };
      mockSessionManager.cleanupOldSessions
        .mockResolvedValueOnce(dryRunResult) // dry run
        .mockResolvedValueOnce(cleanupResult); // actual cleanup
      (mockContext.showConfirmation as any).mockResolvedValue(true);

      // Act
      await sessionsCommandHandler(['cleanup'], mockContext);

      // Assert
      expect(mockSessionManager.cleanupOldSessions).toHaveBeenCalledWith({
        maxCount: 50,
        maxAgeMs: 30 * 24 * 60 * 60 * 1000,
        createBackups: true,
        dryRun: true,
      });
      expect(mockContext.showConfirmation).toHaveBeenCalled();
      expect(mockSessionManager.cleanupOldSessions).toHaveBeenCalledWith({
        maxCount: 50,
        maxAgeMs: 30 * 24 * 60 * 60 * 1000,
        createBackups: true,
        dryRun: false,
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('✅ **Cleanup Completed**'),
      });
    });

    it('should handle no cleanup needed', async () => {
      // Arrange
      const dryRunResult = {
        deletedSessions: [],
        deletedByAge: 0,
        deletedByCount: 0,
        spaceFree: 0,
        errors: [],
      };
      mockSessionManager.cleanupOldSessions.mockResolvedValue(dryRunResult);

      // Act
      await sessionsCommandHandler(['cleanup'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('✨ **No Cleanup Needed**'),
      });
    });

    it('should handle cleanup cancellation', async () => {
      // Arrange
      const dryRunResult = {
        deletedSessions: ['old-session-1'],
        deletedByAge: 1,
        deletedByCount: 0,
        spaceFree: 1024,
        errors: [],
      };
      mockSessionManager.cleanupOldSessions.mockResolvedValue(dryRunResult);
      (mockContext.showConfirmation as any).mockResolvedValue(false);

      // Act
      await sessionsCommandHandler(['cleanup'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: '⏹️ **Cleanup Cancelled**',
      });
    });

    it('should handle cleanup with errors', async () => {
      // Arrange
      const dryRunResult = {
        deletedSessions: ['session-1', 'session-2'],
        deletedByAge: 2,
        deletedByCount: 0,
        spaceFree: 2048,
        errors: [],
      };
      const cleanupResult = {
        ...dryRunResult,
        errors: [
          { sessionId: 'session-2', error: 'File locked' },
        ],
      };
      mockSessionManager.cleanupOldSessions
        .mockResolvedValueOnce(dryRunResult)
        .mockResolvedValueOnce(cleanupResult);
      (mockContext.showConfirmation as any).mockResolvedValue(true);

      // Act
      await sessionsCommandHandler(['cleanup'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('⚠️ **Cleanup Completed with Errors**'),
      });
    });
  });

  describe('Sessions Help Command', () => {
    it('should display help information', async () => {
      // Act
      await sessionsCommandHandler(['help'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('📚 **Sessions Commands Help**'),
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('/sessions list'),
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('/sessions delete'),
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('/sessions search'),
      });
    });
  });

  describe('Command Aliases', () => {
    it('should handle ls alias for list', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);

      // Act
      await sessionsCommandHandler(['ls'], mockContext);

      // Assert
      expect(mockSessionManager.listSessions).toHaveBeenCalled();
    });

    it('should handle del alias for delete', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(false);

      // Act
      await sessionsCommandHandler(['del', sessionId], mockContext);

      // Assert
      expect(mockSessionManager.sessionExists).toHaveBeenCalledWith(sessionId);
    });

    it('should handle rm alias for delete', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(false);

      // Act
      await sessionsCommandHandler(['rm', sessionId], mockContext);

      // Assert
      expect(mockSessionManager.sessionExists).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown subcommands', async () => {
      // Act
      await sessionsCommandHandler(['unknown'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Unknown Sessions Command**'),
      });
    });

    it('should handle general command errors', async () => {
      // Arrange
      const error = new Error('Unexpected error');
      mockSessionManager.listSessions.mockRejectedValue(error);

      // Act
      await sessionsCommandHandler(['list'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Failed to List Sessions**'),
      });
    });

    it('should handle unknown error types', async () => {
      // Arrange
      mockSessionManager.listSessions.mockRejectedValue('String error');

      // Act
      await sessionsCommandHandler(['list'], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Failed to List Sessions**'),
      });
    });
  });

  describe('Argument Parsing', () => {
    it('should parse list options correctly', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue([]);

      // Act
      await sessionsCommandHandler([
        'list',
        '--limit', '5',
        '--sort', 'created',
        '--order', 'asc',
        '--model', 'gpt-3.5-turbo',
        '--no-details',
        '--no-previews'
      ], mockContext);

      // Assert
      expect(mockSessionManager.listSessions).toHaveBeenCalledWith({
        sortBy: 'created',
        sortOrder: 'asc',
        limit: 5,
        offset: undefined,
        model: 'gpt-3.5-turbo',
        tags: undefined,
      });
    });

    it('should parse filter options correctly', async () => {
      // Arrange
      mockSessionManager.filterSessions.mockResolvedValue([]);

      // Act
      await sessionsCommandHandler([
        'filter',
        '--model', 'gpt-4o',
        '--min-messages', '5',
        '--min-tokens', '1000',
        '--workspace', '/test/path'
      ], mockContext);

      // Assert
      expect(mockSessionManager.filterSessions).toHaveBeenCalledWith({
        model: 'gpt-4o',
        minMessages: 5,
        minTokens: 1000,
        workspaceRoot: '/test/path',
      });
    });

    it('should parse cleanup options correctly', async () => {
      // Arrange
      const dryRunResult = {
        deletedSessions: [],
        deletedByAge: 0,
        deletedByCount: 0,
        spaceFree: 0,
        errors: [],
      };
      mockSessionManager.cleanupOldSessions.mockResolvedValue(dryRunResult);

      // Act
      await sessionsCommandHandler([
        'cleanup',
        '--max-sessions', '25',
        '--max-age-days', '14',
        '--no-backups'
      ], mockContext);

      // Assert
      expect(mockSessionManager.cleanupOldSessions).toHaveBeenCalledWith({
        maxCount: 25,
        maxAgeMs: 14 * 24 * 60 * 60 * 1000,
        createBackups: false,
        dryRun: true,
      });
    });
  });
});