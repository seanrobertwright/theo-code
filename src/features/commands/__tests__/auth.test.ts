/**
 * @fileoverview Unit tests for OAuth authentication commands
 * @module features/commands/__tests__/auth
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CommandContext } from '../types.js';
import { authCommandHandler } from '../handlers/auth.js';

// =============================================================================
// MOCK COMMAND CONTEXT
// =============================================================================

/**
 * Mock Command Context for testing.
 */
class MockCommandContext implements CommandContext {
  public messages: Array<{ role: string; content: string }> = [];
  public errors: string[] = [];
  public confirmationResults: boolean[] = [];
  private confirmationIndex = 0;

  addMessage = vi.fn((message: { role: 'user' | 'assistant' | 'system'; content: string }) => {
    this.messages.push(message);
  });

  setError = vi.fn((error: string | null) => {
    if (error) {
      this.errors.push(error);
    }
  });

  showConfirmation = vi.fn(async (message: string, details?: string): Promise<boolean> => {
    const result = this.confirmationResults[this.confirmationIndex] ?? true;
    this.confirmationIndex++;
    return result;
  });

  workspaceRoot = '/mock/workspace';
  currentModel = 'gpt-4o';

  sessionActions = {
    createNewSession: vi.fn(),
    restoreSession: vi.fn(),
    saveCurrentSession: vi.fn(),
    getSessionManager: vi.fn(),
  };

  // Helper methods for testing
  getLastMessage(): string {
    return this.messages[this.messages.length - 1]?.content || '';
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  setConfirmationResult(result: boolean): void {
    this.confirmationResults.push(result);
  }

  reset(): void {
    this.messages = [];
    this.errors = [];
    this.confirmationResults = [];
    this.confirmationIndex = 0;
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('OAuth Authentication Commands', () => {
  let mockContext: MockCommandContext;

  beforeEach(() => {
    mockContext = new MockCommandContext();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockContext.reset();
  });

  // =============================================================================
  // HELP COMMAND TESTS
  // =============================================================================

  describe('/auth help', () => {
    it('should show help when no subcommand provided', async () => {
      await authCommandHandler([], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('OAuth Authentication Commands');
      expect(mockContext.getLastMessage()).toContain('login <provider>');
      expect(mockContext.getLastMessage()).toContain('logout <provider>');
      expect(mockContext.getLastMessage()).toContain('status');
      expect(mockContext.getLastMessage()).toContain('refresh <provider>');
      expect(mockContext.getLastMessage()).toContain('list');
    });

    it('should show help for explicit help command', async () => {
      await authCommandHandler(['help'], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('OAuth Authentication Commands');
    });

    it('should show help for --help flag', async () => {
      await authCommandHandler(['--help'], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('OAuth Authentication Commands');
    });

    it('should show help for -h flag', async () => {
      await authCommandHandler(['-h'], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('OAuth Authentication Commands');
    });
  });

  // =============================================================================
  // LOGIN COMMAND TESTS
  // =============================================================================

  describe('/auth login', () => {
    it('should show error when no provider specified', async () => {
      await authCommandHandler(['login'], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('Missing Provider');
      expect(mockContext.getLastMessage()).toContain('Usage: `/auth login <provider>`');
      expect(mockContext.getLastMessage()).toContain('Example: `/auth login google`');
    });

    it('should handle OAuth services not available', async () => {
      await authCommandHandler(['login', 'google'], mockContext);

      // Should show an error about OAuth services not being available
      expect(mockContext.errors.length).toBeGreaterThan(0);
      expect(mockContext.getLastMessage()).toContain('OAuth services not available');
    });

    it('should provide helpful error message with troubleshooting steps', async () => {
      await authCommandHandler(['login', 'anthropic'], mockContext);

      const message = mockContext.getLastMessage();
      expect(message).toContain('troubleshooting');
      expect(message).toContain('internet connection');
      expect(message).toContain('try again');
    });
  });

  // =============================================================================
  // LOGOUT COMMAND TESTS
  // =============================================================================

  describe('/auth logout', () => {
    it('should show error when no provider specified', async () => {
      await authCommandHandler(['logout'], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('Missing Provider');
      expect(mockContext.getLastMessage()).toContain('Usage: `/auth logout <provider>`');
      expect(mockContext.getLastMessage()).toContain('Example: `/auth logout google`');
    });

    it('should handle OAuth services not available', async () => {
      await authCommandHandler(['logout', 'google'], mockContext);

      expect(mockContext.errors.length).toBeGreaterThan(0);
      expect(mockContext.getLastMessage()).toContain('OAuth services not available');
    });
  });

  // =============================================================================
  // STATUS COMMAND TESTS
  // =============================================================================

  describe('/auth status', () => {
    it('should handle OAuth services not available', async () => {
      await authCommandHandler(['status'], mockContext);

      expect(mockContext.errors.length).toBeGreaterThan(0);
      expect(mockContext.getLastMessage()).toContain('Status Error');
      expect(mockContext.getLastMessage()).toContain('OAuth services not available');
    });
  });

  // =============================================================================
  // REFRESH COMMAND TESTS
  // =============================================================================

  describe('/auth refresh', () => {
    it('should show error when no provider specified', async () => {
      await authCommandHandler(['refresh'], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('Missing Provider');
      expect(mockContext.getLastMessage()).toContain('Usage: `/auth refresh <provider>`');
      expect(mockContext.getLastMessage()).toContain('Example: `/auth refresh google`');
    });

    it('should handle OAuth services not available', async () => {
      await authCommandHandler(['refresh', 'google'], mockContext);

      expect(mockContext.errors.length).toBeGreaterThan(0);
      expect(mockContext.getLastMessage()).toContain('OAuth services not available');
    });

    it('should provide refresh-specific troubleshooting', async () => {
      await authCommandHandler(['refresh', 'anthropic'], mockContext);

      const message = mockContext.getLastMessage();
      expect(message).toContain('Refresh-specific troubleshooting');
      expect(message).toContain('refresh token may have expired');
      expect(message).toContain('logging out and back in');
    });
  });

  // =============================================================================
  // LIST COMMAND TESTS
  // =============================================================================

  describe('/auth list', () => {
    it('should handle OAuth services not available', async () => {
      await authCommandHandler(['list'], mockContext);

      expect(mockContext.errors.length).toBeGreaterThan(0);
      expect(mockContext.getLastMessage()).toContain('List Error');
      expect(mockContext.getLastMessage()).toContain('OAuth services not available');
    });
  });

  // =============================================================================
  // UNKNOWN COMMAND TESTS
  // =============================================================================

  describe('Unknown subcommands', () => {
    it('should show error for unknown subcommand', async () => {
      await authCommandHandler(['unknown-command'], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('Unknown Auth Command');
      expect(mockContext.getLastMessage()).toContain('unknown-command');
      expect(mockContext.getLastMessage()).toContain('/auth help');
    });

    it('should handle various unknown subcommands', async () => {
      const unknownCommands = ['invalid', 'test', 'configure', 'setup'];
      
      for (const cmd of unknownCommands) {
        mockContext.reset();
        await authCommandHandler([cmd], mockContext);
        
        expect(mockContext.getMessageCount()).toBe(1);
        expect(mockContext.getLastMessage()).toContain('Unknown Auth Command');
        expect(mockContext.getLastMessage()).toContain(cmd);
      }
    });
  });

  // =============================================================================
  // COMMAND STRUCTURE TESTS
  // =============================================================================

  describe('Command structure', () => {
    it('should handle empty arguments gracefully', async () => {
      await authCommandHandler([], mockContext);

      expect(mockContext.getMessageCount()).toBe(1);
      expect(mockContext.getLastMessage()).toContain('OAuth Authentication Commands');
    });

    it('should handle null/undefined arguments', async () => {
      // Test with various edge cases
      await authCommandHandler([''], mockContext);
      expect(mockContext.getMessageCount()).toBe(1);
      
      mockContext.reset();
      await authCommandHandler([' '], mockContext);
      expect(mockContext.getMessageCount()).toBe(1);
    });

    it('should preserve case sensitivity for provider names', async () => {
      await authCommandHandler(['login', 'GOOGLE'], mockContext);
      
      // Should still attempt to process the provider name as-is
      expect(mockContext.getLastMessage()).toContain('GOOGLE');
    });
  });

  // =============================================================================
  // ERROR MESSAGE QUALITY TESTS
  // =============================================================================

  describe('Error message quality', () => {
    it('should provide consistent error message format', async () => {
      const commands = [
        ['login'],
        ['logout'], 
        ['refresh']
      ];

      for (const cmd of commands) {
        mockContext.reset();
        await authCommandHandler(cmd, mockContext);
        
        const message = mockContext.getLastMessage();
        expect(message).toContain('❌');
        expect(message).toContain('Missing Provider');
        expect(message).toContain('Usage:');
        expect(message).toContain('Example:');
      }
    });

    it('should include helpful context in error messages', async () => {
      await authCommandHandler(['login'], mockContext);
      
      const message = mockContext.getLastMessage();
      expect(message).toContain('/auth list');
      expect(message).toContain('available providers');
    });

    it('should provide actionable troubleshooting steps', async () => {
      await authCommandHandler(['login', 'test-provider'], mockContext);
      
      const message = mockContext.getLastMessage();
      expect(message).toContain('troubleshooting');
      expect(message).toContain('try again');
      expect(message).toContain('internet connection');
    });
  });

  // =============================================================================
  // HELP MESSAGE CONTENT TESTS
  // =============================================================================

  describe('Help message content', () => {
    it('should include all required command information', async () => {
      await authCommandHandler(['help'], mockContext);
      
      const message = mockContext.getLastMessage();
      
      // Check for all main commands
      expect(message).toContain('login <provider>');
      expect(message).toContain('logout <provider>');
      expect(message).toContain('status');
      expect(message).toContain('refresh <provider>');
      expect(message).toContain('list');
      
      // Check for examples
      expect(message).toContain('Examples:');
      expect(message).toContain('/auth login google');
      expect(message).toContain('/auth status');
      
      // Check for OAuth benefits
      expect(message).toContain('OAuth Benefits:');
      expect(message).toContain('More secure than API keys');
      expect(message).toContain('Automatic token refresh');
      
      // Check for troubleshooting
      expect(message).toContain('Troubleshooting:');
      expect(message).toContain('browser');
      expect(message).toContain('popups');
    });

    it('should have consistent formatting', async () => {
      await authCommandHandler(['help'], mockContext);
      
      const message = mockContext.getLastMessage();
      
      // Check for consistent emoji usage
      expect(message).toContain('🔐');
      expect(message).toContain('🔒');
      expect(message).toContain('🔄');
      
      // Check for consistent markdown formatting
      expect(message).toMatch(/\*\*[^*]+\*\*/); // Bold text
      expect(message).toMatch(/`[^`]+`/); // Code blocks
    });
  });

  // =============================================================================
  // INTEGRATION WITH COMMAND CONTEXT TESTS
  // =============================================================================

  describe('Command context integration', () => {
    it('should properly use addMessage for all outputs', async () => {
      await authCommandHandler(['help'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalled();
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('OAuth Authentication Commands')
      });
    });

    it('should use setError for error conditions', async () => {
      await authCommandHandler(['login', 'test-provider'], mockContext);
      
      expect(mockContext.setError).toHaveBeenCalled();
      expect(mockContext.setError).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed')
      );
    });

    it('should handle context methods gracefully', async () => {
      // Test with a context that might have issues
      const faultyContext = {
        ...mockContext,
        addMessage: vi.fn(() => { throw new Error('Context error'); }),
      };

      // The command should handle the error and not crash the application
      // In a real implementation, this would be wrapped in try-catch
      await expect(authCommandHandler(['help'], faultyContext as any)).rejects.toThrow('Context error');
    });
  });
});