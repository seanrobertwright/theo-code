/**
 * @fileoverview /resume command handler
 * @module features/commands/handlers/resume
 */

import type { 
  CommandHandler, 
  CommandContext, 
  SessionRestoreResult 
} from '../types.js';
import type { SessionMetadata, SessionId } from '../../../shared/types/index.js';
import { formatSessionList, formatSessionPreview } from '../utils/formatting.js';

// =============================================================================
// RESUME COMMAND HANDLER
// =============================================================================

/**
 * Handles the /resume command for interactive session restoration.
 * 
 * Usage:
 * - /resume - Shows interactive list of recent sessions
 * - /resume <session-id> - Directly restores specified session
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
export const resumeCommandHandler: CommandHandler = async (
  args: string[],
  context: CommandContext
): Promise<void> => {
  const { addMessage, setError, showConfirmation, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // If session ID provided directly, restore it
    if (args.length > 0) {
      const sessionId = args[0] as SessionId;
      await restoreSpecificSession(sessionId, context);
      return;
    }
    
    // Otherwise, show interactive session list
    await showInteractiveSessionList(context);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    setError(`Resume command failed: ${errorMessage}`);
    addMessage({
      role: 'assistant',
      content: `❌ **Resume Failed**\n\n${errorMessage}`,
    });
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Restores a specific session by ID.
 * 
 * @param sessionId - Session identifier to restore
 * @param context - Command execution context
 */
async function restoreSpecificSession(
  sessionId: SessionId,
  context: CommandContext
): Promise<void> {
  const { addMessage, setError, showConfirmation, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Check if session exists
    const sessionExists = await sessionManager.sessionExists(sessionId);
    if (!sessionExists) {
      addMessage({
        role: 'assistant',
        content: `❌ **Session Not Found**\n\nSession \`${sessionId}\` does not exist.\n\nUse \`/resume\` without arguments to see available sessions.`,
      });
      return;
    }
    
    // Get session metadata for confirmation
    const sessions = await sessionManager.listSessions({ limit: 1000 });
    const sessionMetadata = sessions.find(s => s.id === sessionId);
    
    if (!sessionMetadata) {
      throw new Error(`Session metadata not found for ${sessionId}`);
    }
    
    // Show confirmation with session details
    const confirmationMessage = `Restore session "${sessionMetadata.title || sessionId}"?`;
    const confirmationDetails = formatSessionPreview(sessionMetadata);
    
    const confirmed = await showConfirmation(confirmationMessage, confirmationDetails);
    if (!confirmed) {
      addMessage({
        role: 'assistant',
        content: '⏹️ **Session Restore Cancelled**',
      });
      return;
    }
    
    // Restore the session
    const result = await sessionManager.restoreSessionWithContext(sessionId);
    
    // Update store state
    await sessionActions.restoreSession(sessionId);
    
    // Show success message
    const successMessage = formatRestoreSuccessMessage(result.session, result.contextFilesMissing);
    addMessage({
      role: 'assistant',
      content: successMessage,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    setError(`Failed to restore session ${sessionId}: ${errorMessage}`);
    addMessage({
      role: 'assistant',
      content: `❌ **Restore Failed**\n\nFailed to restore session \`${sessionId}\`:\n${errorMessage}`,
    });
  }
}

/**
 * Shows an interactive list of recent sessions for selection.
 * 
 * @param context - Command execution context
 */
async function showInteractiveSessionList(
  context: CommandContext
): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Get recent sessions (last 10, sorted by last modified)
    const sessions = await sessionManager.listSessions({
      sortBy: 'lastModified',
      sortOrder: 'desc',
      limit: 10,
    });
    
    if (sessions.length === 0) {
      addMessage({
        role: 'assistant',
        content: `📭 **No Sessions Found**\n\nNo saved sessions are available to restore.\n\nStart a conversation and it will be automatically saved for future restoration.`,
      });
      return;
    }
    
    // Format session list for display
    const sessionListMessage = formatInteractiveSessionList(sessions);
    addMessage({
      role: 'assistant',
      content: sessionListMessage,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Failed to Load Sessions**\n\n${errorMessage}\n\nTry again or check your session storage configuration.`,
    });
  }
}

/**
 * Formats the interactive session list for display.
 * 
 * @param sessions - Sessions to display
 * @returns Formatted message content
 */
function formatInteractiveSessionList(sessions: SessionMetadata[]): string {
  const header = `🔄 **Resume Session**\n\nSelect a session to restore:\n`;
  
  const sessionList = sessions.map((session, index) => {
    const number = index + 1;
    const title = session.title || 'Untitled Session';
    const date = new Date(session.lastModified).toLocaleString();
    const preview = session.preview ? 
      (session.preview.length > 60 ? session.preview.slice(0, 60) + '...' : session.preview) :
      'No preview available';
    
    return `**${number}.** ${title}\n` +
           `   📅 ${date} | 💬 ${session.messageCount} messages | 🤖 ${session.model}\n` +
           `   💭 ${preview}\n` +
           `   \`/resume ${session.id}\`\n`;
  }).join('\n');
  
  const footer = `\n💡 **Tip:** Copy and paste a \`/resume\` command above to restore that session.`;
  
  return header + sessionList + footer;
}

/**
 * Formats a success message for session restoration.
 * 
 * @param session - Restored session metadata
 * @param missingFiles - List of missing context files
 * @returns Formatted success message
 */
function formatRestoreSuccessMessage(
  session: SessionMetadata,
  missingFiles: string[]
): string {
  const title = session.title || 'Session';
  const date = new Date(session.lastModified).toLocaleString();
  
  let message = `✅ **Session Restored Successfully**\n\n` +
                `📝 **${title}**\n` +
                `📅 Last modified: ${date}\n` +
                `💬 Messages: ${session.messageCount}\n` +
                `🔢 Tokens: ${session.tokenCount.total.toLocaleString()}\n` +
                `🤖 Model: ${session.model}\n`;
  
  if (session.contextFiles.length > 0) {
    message += `📁 Context files: ${session.contextFiles.length}\n`;
  }
  
  if (missingFiles.length > 0) {
    message += `\n⚠️ **Warning:** ${missingFiles.length} context file(s) are no longer available:\n`;
    missingFiles.slice(0, 5).forEach(file => {
      message += `   • ${file}\n`;
    });
    if (missingFiles.length > 5) {
      message += `   • ... and ${missingFiles.length - 5} more\n`;
    }
  }
  
  message += `\n🎯 You can now continue your conversation where you left off.`;
  
  return message;
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export is already done inline above