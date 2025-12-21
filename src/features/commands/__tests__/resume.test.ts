/**
 * @fileoverview Unit tests for /resume command handler
 * @module features/commands/__tests__/resume.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resumeCommandHandler } from '../handlers/resume.js';
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
  },
];

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

const createMockSessionManager = () => ({
  sessionExists: vi.fn(),
  listSessions: vi.fn(),
  restoreSessionWithContext: vi.fn(),
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

describe('Resume Command Handler', () => {
  let mockContext: CommandContext;
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    mockSessionManager = createMockSessionManager();
    mockContext = createMockContext(mockSessionManager);
  });

  describe('Interactive Session List Display', () => {
    it('should display interactive session list when no arguments provided', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);

      // Act
      await resumeCommandHandler([], mockContext);

      // Assert
      expect(mockSessionManager.listSessions).toHaveBeenCalledWith({
        sortBy: 'lastModified',
        sortOrder: 'desc',
        limit: 10,
      });

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('🔄 **Resume Session**'),
      });

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Test Session'),
      });

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('/resume test-session-123'),
      });
    });

    it('should show no sessions message when no sessions available', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue([]);

      // Act
      await resumeCommandHandler([], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('📭 **No Sessions Found**'),
      });
    });

    it('should handle session listing errors gracefully', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      mockSessionManager.listSessions.mockRejectedValue(error);

      // Act
      await resumeCommandHandler([], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Failed to Load Sessions**'),
      });

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Database connection failed'),
      });
    });
  });

  describe('Direct Session Restoration', () => {
    it('should restore specific session when session ID provided', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      mockSessionManager.restoreSessionWithContext.mockResolvedValue({
        session: mockSessionMetadata,
        contextFilesFound: ['src/test.ts'],
        contextFilesMissing: ['README.md'],
      });
      (mockContext.showConfirmation as any).mockResolvedValue(true);

      // Act
      await resumeCommandHandler([sessionId], mockContext);

      // Assert
      expect(mockSessionManager.sessionExists).toHaveBeenCalledWith(sessionId);
      expect(mockContext.showConfirmation).toHaveBeenCalledWith(
        'Restore session "Test Session"?',
        expect.stringContaining('**Session Details:**')
      );
      expect(mockSessionManager.restoreSessionWithContext).toHaveBeenCalledWith(sessionId);
      expect(mockContext.sessionActions.restoreSession).toHaveBeenCalledWith(sessionId);
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('✅ **Session Restored Successfully**'),
      });
    });

    it('should show warning for missing context files', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      mockSessionManager.restoreSessionWithContext.mockResolvedValue({
        session: mockSessionMetadata,
        contextFilesFound: [],
        contextFilesMissing: ['src/test.ts', 'README.md'],
      });
      (mockContext.showConfirmation as any).mockResolvedValue(true);

      // Act
      await resumeCommandHandler([sessionId], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('⚠️ **Warning:** 2 context file(s) are no longer available'),
      });
    });

    it('should handle session not found error', async () => {
      // Arrange
      const sessionId = 'nonexistent-session' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(false);

      // Act
      await resumeCommandHandler([sessionId], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Session Not Found**'),
      });

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('nonexistent-session'),
      });
    });

    it('should handle user cancellation of restoration', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      (mockContext.showConfirmation as any).mockResolvedValue(false);

      // Act
      await resumeCommandHandler([sessionId], mockContext);

      // Assert
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: '⏹️ **Session Restore Cancelled**',
      });

      expect(mockSessionManager.restoreSessionWithContext).not.toHaveBeenCalled();
    });

    it('should handle restoration errors gracefully', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      const error = new Error('Restoration failed');
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      mockSessionManager.restoreSessionWithContext.mockRejectedValue(error);
      (mockContext.showConfirmation as any).mockResolvedValue(true);

      // Act
      await resumeCommandHandler([sessionId], mockContext);

      // Assert
      expect(mockContext.setError).toHaveBeenCalledWith(
        'Failed to restore session test-session-123: Restoration failed'
      );

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Restore Failed**'),
      });
    });
  });

  describe('Session Restoration Confirmation Flow', () => {
    it('should show detailed session information in confirmation dialog', async () => {
      // Arrange
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);
      (mockContext.showConfirmation as any).mockResolvedValue(false); // User cancels

      // Act
      await resumeCommandHandler([sessionId], mockContext);

      // Assert
      expect(mockContext.showConfirmation).toHaveBeenCalledWith(
        'Restore session "Test Session"?',
        expect.stringMatching(/\*\*Session Details:\*\*/)
      );

      const confirmationDetails = (mockContext.showConfirmation as any).mock.calls[0][1];
      expect(confirmationDetails).toContain('🆔 ID: `test-session-123`');
      expect(confirmationDetails).toContain('📝 Title: Test Session');
      expect(confirmationDetails).toContain('🤖 Model: gpt-4o');
      expect(confirmationDetails).toContain('💬 Messages: 5');
      expect(confirmationDetails).toContain('📁 Context Files: 2');
      expect(confirmationDetails).toContain('🏷️ Tags: test, development');
    });

    it('should handle sessions without titles gracefully', async () => {
      // Arrange
      const sessionWithoutTitle = { ...mockSessionMetadata, title: null };
      const sessionId = 'test-session-123' as SessionId;
      mockSessionManager.sessionExists.mockResolvedValue(true);
      mockSessionManager.listSessions.mockResolvedValue([sessionWithoutTitle]);
      (mockContext.showConfirmation as any).mockResolvedValue(false);

      // Act
      await resumeCommandHandler([sessionId], mockContext);

      // Assert
      expect(mockContext.showConfirmation).toHaveBeenCalledWith(
        'Restore session "test-session-123"?',
        expect.stringContaining('📝 Title: Untitled Session')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle general command errors', async () => {
      // Arrange
      const error = new Error('Unexpected error');
      mockSessionManager.listSessions.mockRejectedValue(error);

      // Act
      await resumeCommandHandler([], mockContext);

      // Assert
      // Error is handled internally by showInteractiveSessionList
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Failed to Load Sessions**'),
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Unexpected error'),
      });
    });

    it('should handle unknown error types', async () => {
      // Arrange
      mockSessionManager.listSessions.mockRejectedValue('String error');

      // Act
      await resumeCommandHandler([], mockContext);

      // Assert
      // Error is handled internally by showInteractiveSessionList
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('❌ **Failed to Load Sessions**'),
      });
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Unknown error'),
      });
    });
  });

  describe('Session List Formatting', () => {
    it('should format session list with proper structure', async () => {
      // Arrange
      mockSessionManager.listSessions.mockResolvedValue(mockSessions);

      // Act
      await resumeCommandHandler([], mockContext);

      // Assert
      const messageCall = (mockContext.addMessage as any).mock.calls[0][0];
      const content = messageCall.content;

      // Check for proper formatting elements
      expect(content).toContain('🔄 **Resume Session**');
      expect(content).toContain('**1.** Test Session');
      expect(content).toContain('**2.** Another Test Session');
      expect(content).toContain('📅'); // Date emoji
      expect(content).toContain('💬'); // Message count emoji
      expect(content).toContain('🤖'); // Model emoji
      expect(content).toContain('💭'); // Preview emoji
      expect(content).toContain('`/resume test-session-123`');
      expect(content).toContain('💡 **Tip:**');
    });

    it('should truncate long previews in session list', async () => {
      // Arrange
      const longPreviewSession = {
        ...mockSessionMetadata,
        preview: 'This is a very long preview that should be truncated because it exceeds the maximum length limit for display in the session list',
      };
      mockSessionManager.listSessions.mockResolvedValue([longPreviewSession]);

      // Act
      await resumeCommandHandler([], mockContext);

      // Assert
      const messageCall = (mockContext.addMessage as any).mock.calls[0][0];
      const content = messageCall.content;

      expect(content).toContain('...');
      expect(content).not.toContain('display in the session list');
    });
  });
});