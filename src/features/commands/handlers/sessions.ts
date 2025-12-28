/**
 * @fileoverview /sessions command family handlers
 * @module features/commands/handlers/sessions
 */

import type { 
  CommandHandler, 
  CommandContext,
  SessionListResult,
  SessionSearchResult 
} from '../types.js';
import type { SessionId, SessionMetadata } from '../../../shared/types/index.js';
import { 
  formatSessionList, 
  formatSearchResults, 
  formatFilterResults,
  formatFileSize 
} from '../utils/formatting.js';

// =============================================================================
// SESSIONS COMMAND HANDLER
// =============================================================================

/**
 * Handles the /sessions command family.
 * 
 * Usage:
 * - /sessions - List all sessions
 * - /sessions list [options] - List sessions with options
 * - /sessions delete <session-id> - Delete a session
 * - /sessions export <session-id> [format] - Export a session
 * - /sessions search <query> - Search sessions
 * - /sessions filter [criteria] - Filter sessions
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
export const sessionsCommandHandler: CommandHandler = async (
  args: string[],
  context: CommandContext
): Promise<void> => {
  const { addMessage, setError } = context;
  
  try {
    // If no subcommand provided, default to list
    if (args.length === 0) {
      await handleSessionsList([], context);
      return;
    }
    
    const subcommand = args[0]?.toLowerCase() || '';
    const subArgs = args.slice(1);
    
    switch (subcommand) {
      case 'list':
      case 'ls':
        await handleSessionsList(subArgs, context);
        break;
        
      case 'delete':
      case 'del':
      case 'rm':
        await handleSessionsDelete(subArgs, context);
        break;
        
      case 'export':
        await handleSessionsExport(subArgs, context);
        break;
        
      case 'search':
        await handleSessionsSearch(subArgs, context);
        break;
        
      case 'filter':
        await handleSessionsFilter(subArgs, context);
        break;
        
      case 'cleanup':
        await handleSessionsCleanup(subArgs, context);
        break;
        
      case 'config':
      case 'configure':
        await handleSessionsConfig(subArgs, context);
        break;
        
      case 'help':
        await handleSessionsHelp(context);
        break;
        
      default:
        addMessage({
          role: 'assistant',
          content: `❌ **Unknown Sessions Command**\n\nUnknown subcommand: 
${subcommand}

Use 
/sessions help to see available commands.`,
        });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    setError(`Sessions command failed: ${errorMessage}`);
    addMessage({
      role: 'assistant',
      content: `❌ **Sessions Command Failed**\n\n${errorMessage}`,
    });
  }
};

// =============================================================================
// SUBCOMMAND HANDLERS
// =============================================================================

/**
 * Handles /sessions list command.
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
async function handleSessionsList(
  args: string[],
  context: CommandContext
): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Check storage limits first
    const limitCheckResult = await sessionManager.checkStorageLimits();
    
    // Parse options
    const options = parseListOptions(args);
    
    // Get sessions
    const sessions = await sessionManager.listSessions({
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
      limit: options.limit,
      offset: options.offset,
      model: options.model,
      tags: options.tags,
    });
    
    if (sessions.length === 0) {
      // Check storage limits even when no sessions
      let content = `📭 **No Sessions Found**\n\nNo saved sessions are available.\n\nStart a conversation and it will be automatically saved.`;
      
      // Add storage limit notifications if needed
      if (!limitCheckResult.withinLimits || limitCheckResult.warningThresholdReached) {
        content = formatStorageLimitNotification(limitCheckResult) + '\n\n' + content;
      }
      
      addMessage({
        role: 'assistant',
        content,
      });
      return;
    }
    
    // Format and display sessions
    const formattedList = formatSessionList(sessions, {
      maxSessions: options.limit || 20,
      showDetails: options.showDetails ?? true,
      showPreviews: options.showPreviews ?? true,
      sortBy: options.sortBy || 'lastModified',
      sortOrder: options.sortOrder || 'desc',
    });
    
    // Add storage limit notifications if needed
    let content = formattedList;
    if (!limitCheckResult.withinLimits || limitCheckResult.warningThresholdReached) {
      content = formatStorageLimitNotification(limitCheckResult) + '\n\n' + formattedList;
    }
    
    addMessage({
      role: 'assistant',
      content,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Failed to List Sessions**\n\n${errorMessage}`,
    });
  }
}

/**
 * Handles /sessions delete command.
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
async function handleSessionsDelete(
  args: string[],
  context: CommandContext
): Promise<void> {
  const { addMessage, showConfirmation, sessionActions } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Session ID**\n\nUsage: 
/sessions delete <session-id>

Use 
/sessions list to see available sessions.`,
    });
    return;
  }
  
  const sessionId = args[0] as SessionId;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Check if session exists
    const sessionExists = await sessionManager.sessionExists(sessionId);
    if (!sessionExists) {
      addMessage({
        role: 'assistant',
        content: `❌ **Session Not Found**\n\nSession 
${sessionId}
 does not exist.\n\nUse 
/sessions list to see available sessions.`,
      });
      return;
    }
    
    // Get session metadata for confirmation
    const sessions = await sessionManager.listSessions({ limit: 1000 });
    const sessionMetadata = sessions.find((s: SessionMetadata) => s.id === sessionId);
    
    if (!sessionMetadata) {
      throw new Error(`Session metadata not found for ${sessionId}`);
    }
    
    // Show confirmation
    const confirmationMessage = `Delete session "${sessionMetadata.title || sessionId}"?`;
    const confirmationDetails = `This action cannot be undone.\n\n` +
      `📅 Created: ${new Date(sessionMetadata.created).toLocaleString()}
` +
      `💬 Messages: ${sessionMetadata.messageCount}
` +
      `🤖 Model: ${sessionMetadata.model}`;
    
    const confirmed = await showConfirmation(confirmationMessage, confirmationDetails);
    if (!confirmed) {
      addMessage({
        role: 'assistant',
        content: '⏹️ **Session Deletion Cancelled**',
      });
      return;
    }
    
    // Delete the session
    const success = await sessionManager.deleteSessionWithConfirmation(sessionId, true);
    
    if (success) {
      addMessage({
        role: 'assistant',
        content: `✅ **Session Deleted**\n\nSession 
${sessionId}
 has been permanently deleted.`,
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `❌ **Deletion Failed**\n\nFailed to delete session 
${sessionId}
. Please try again.`,
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Delete Failed**\n\nFailed to delete session 
${sessionId}
:
${errorMessage}`,
    });
  }
}

/**
 * Handles /sessions export command.
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
async function handleSessionsExport(
  args: string[],
  context: CommandContext
): Promise<void> {
  const { addMessage, workspaceRoot, sessionActions } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Session ID**\n\nUsage: 
/sessions export <session-id> [format]

Formats: json, json-pretty (default), json-compact

Use 
/sessions list to see available sessions.`,
    });
    return;
  }
  
  const sessionId = args[0] as SessionId;
  const format = (args[1] || 'json-pretty') as 'json' | 'json-pretty' | 'json-compact';
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Check storage limits for export operations
    const limitCheckResult = await sessionManager.checkStorageLimits();
    
    // Check if session exists
    const sessionExists = await sessionManager.sessionExists(sessionId);
    if (!sessionExists) {
      addMessage({
        role: 'assistant',
        content: `❌ **Session Not Found**\n\nSession 
${sessionId}
 does not exist.\n\nUse 
/sessions list to see available sessions.`,
      });
      return;
    }
    
    // Export the session
    const exportResult = await sessionManager.exportSession(sessionId, {
      format,
      sanitize: true,
      includeContent: true,
      metadataOnly: false,
    });
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-') ;
    const filename = `session-${sessionId}-${timestamp}.json`;
    const filepath = `${workspaceRoot}/${filename}`;
    
    // Prepare export message
    let content = `✅ **Session Exported**\n\n` +
                  `📁 **File:** 
${filename}
` +
                  `📊 **Size:** ${formatFileSize(exportResult.size)}
` +
                  `🔧 **Format:** ${exportResult.format}
` +
                  `🔒 **Sanitized:** ${exportResult.sanitized ? 'Yes' : 'No'}

` +
                  `${exportResult.warnings.length > 0 ? 
                    `⚠️ **Warnings:**\n${exportResult.warnings.map((w: string) => `• ${w}`).join('\n')}\n\n` : 
                    ''
                  }` +
                  `💡 **Tip:** The exported file can be shared or imported into another theo-code instance.`;
    
    // Add storage warnings if disk space is low
    if (limitCheckResult.diskSpaceExceeded) {
      content = '⚠️ **Warning:** Low disk space detected. Export may use additional storage.\n\n' + content;
    }
    
    addMessage({
      role: 'assistant',
      content,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Export Failed**\n\nFailed to export session 
${sessionId}
:
${errorMessage}`,
    });
  }
}

/**
 * Handles /sessions search command.
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
async function handleSessionsSearch(
  args: string[],
  context: CommandContext
): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Search Query**\n\nUsage: 
/sessions search <query>

Example: 
/sessions search "authentication code"`,
    });
    return;
  }
  
  const query = args.join(' ');
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Check storage limits for search operations
    const limitCheckResult = await sessionManager.checkStorageLimits();
    
    // Perform search
    const searchResults = await sessionManager.searchSessions(query, {
      limit: 20,
      minRelevance: 0.1,
      includeContent: true,
      includeMetadata: true,
      includeFilenames: true,
      sortBy: 'relevance',
    });
    
    if (searchResults.length === 0) {
      addMessage({
        role: 'assistant',
        content: `🔍 **No Results Found**\n\nNo sessions found matching "${query}".\n\nTry different search terms or use 
/sessions list to see all sessions.`,
      });
      return;
    }
    
    // Format and display results
    const formattedResults = formatSearchResults(searchResults, query, {
      highlightMatches: true,
      contextLength: 100,
      maxSessions: 20,
      showDetails: true,
    });
    
    // Add storage limit notifications if needed
    let content = formattedResults;
    if (!limitCheckResult.withinLimits || limitCheckResult.warningThresholdReached) {
      content = formatStorageLimitNotification(limitCheckResult) + '\n\n' + formattedResults;
    }
    
    addMessage({
      role: 'assistant',
      content,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Search Failed**\n\nFailed to search sessions:
${errorMessage}`,
    });
  }
}

/**
 * Handles /sessions filter command.
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
async function handleSessionsFilter(
  args: string[],
  context: CommandContext
): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Parse filter options
    const filters = parseFilterOptions(args);
    
    if (Object.keys(filters).length === 0) {
      addMessage({
        role: 'assistant',
        content: `❌ **No Filter Criteria**\n\nUsage: 
/sessions filter [options]

` +
                 `**Options:**
` +
                 `• 
/--model <model>
 - Filter by model
` +
                 `• 
/--date <YYYY-MM>
 - Filter by month
` +
                 `• 
/--min-messages <count>
 - Minimum message count
` +
                 `• 
/--min-tokens <count>
 - Minimum token count

` +
                 `**Example:** 
/sessions filter --model gpt-4o --date 2024-12`,
      });
      return;
    }
    
    // Apply filters
    const filteredSessions = await sessionManager.filterSessions(filters);
    
    if (filteredSessions.length === 0) {
      addMessage({
        role: 'assistant',
        content: `🔧 **No Matching Sessions**\n\nNo sessions match the specified filter criteria.\n\nTry adjusting your filters or use 
/sessions list to see all sessions.`,
      });
      return;
    }
    
    // Format and display results
    const formattedResults = formatFilterResults(filteredSessions, filters, {
      showFilterCriteria: true,
      maxSessions: 20,
      showDetails: true,
      showPreviews: true,
    });
    
    addMessage({
      role: 'assistant',
      content: formattedResults,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Filter Failed**\n\nFailed to filter sessions:
${errorMessage}`,
    });
  }
}

/**
 * Handles /sessions cleanup command.
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
async function handleSessionsCleanup(
  args: string[],
  context: CommandContext
): Promise<void> {
  const { addMessage, showConfirmation, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Check storage limits to show current status
    const limitCheckResult = await sessionManager.checkStorageLimits();
    
    // Parse cleanup options
    const options = parseCleanupOptions(args);
    
    // First, do a dry run to show what would be deleted
    const dryRunResult = await sessionManager.cleanupOldSessions({
      ...options,
      dryRun: true,
    });
    
    if (dryRunResult.deletedSessions.length === 0) {
      let content = `✨ **No Cleanup Needed**\n\nAll sessions are within the configured limits.\n\n` +
                    `Current limits:
` +
                    `• Max sessions: ${options.maxCount || 50}
` +
                    `• Max age: ${Math.round((options.maxAgeMs || 30 * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))} days`;
      
      // Add storage status if there are warnings
      if (limitCheckResult.warningThresholdReached || !limitCheckResult.withinLimits) {
        content += '\n\n' + formatStorageLimitNotification(limitCheckResult);
      }
      
      addMessage({
        role: 'assistant',
        content,
      });
      return;
    }
    
    // Show confirmation with cleanup preview
    const confirmationMessage = `Clean up ${dryRunResult.deletedSessions.length} old sessions?`;
    const confirmationDetails = `This will permanently delete:

` +
      `🗓️ ${dryRunResult.deletedByAge} sessions older than ${Math.round((options.maxAgeMs || 30 * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))} days
` +
      `📊 ${dryRunResult.deletedByCount} sessions exceeding limit of ${options.maxCount || 50}
` +
      `💾 ~${formatFileSize(dryRunResult.spaceFree)} will be freed

` +
      `This action cannot be undone.`;
    
    const confirmed = await showConfirmation(confirmationMessage, confirmationDetails);
    if (!confirmed) {
      addMessage({
        role: 'assistant',
        content: '⏹️ **Cleanup Cancelled**',
      });
      return;
    }
    
    // Perform actual cleanup
    const cleanupResult = await sessionManager.cleanupOldSessions({
      ...options,
      dryRun: false,
    });
    
    if (cleanupResult.errors.length > 0) {
      addMessage({
        role: 'assistant',
        content: `⚠️ **Cleanup Completed with Errors**\n\n` +
                 `✅ Deleted: ${cleanupResult.deletedSessions.length - cleanupResult.errors.length} sessions
` +
                 `❌ Errors: ${cleanupResult.errors.length} sessions
` +
                 `💾 Space freed: ~${formatFileSize(cleanupResult.spaceFree)}

` +
                 `**Errors:**
${cleanupResult.errors.map((e: any) => `• ${e.sessionId}: ${e.error}`).join('\n')}`,
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `✅ **Cleanup Completed**\n\n` +
                 `🗑️ Deleted: ${cleanupResult.deletedSessions.length} sessions
` +
                 `💾 Space freed: ~${formatFileSize(cleanupResult.spaceFree)}

` +
                 `Your session storage has been optimized.`,
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Cleanup Failed**\n\nFailed to cleanup sessions:
${errorMessage}`,
    });
  }
}

/**
 * Handles /sessions config command.
 * 
 * @param args - Command arguments
 * @param context - Command execution context
 */
async function handleSessionsConfig(
  args: string[],
  context: CommandContext
): Promise<void> {
  const { addMessage } = context;
  
  if (args.length === 0) {
    // Show current configuration
    await showCurrentConfig(context);
    return;
  }
  
  const configAction = args[0]?.toLowerCase() || '';
  const configArgs = args.slice(1);
  
  try {
    switch (configAction) {
      case 'show':
      case 'get':
        await showCurrentConfig(context);
        break;
        
      case 'set':
        await setConfigValue(configArgs, context);
        break;
        
      case 'reset':
        await resetConfig(configArgs, context);
        break;
        
      case 'validate':
        await validateConfig(context);
        break;
        
      default:
        addMessage({
          role: 'assistant',
          content: `❌ **Unknown Config Command**\n\nUnknown config action: 
${configAction}

` +
                   `**Available actions:**
` +
                   `• 
/sessions config show
 - Show current configuration
` +
                   `• 
/sessions config set <key> <value>
 - Set configuration value
` +
                   `• 
/sessions config reset [key]
 - Reset configuration to defaults
` +
                   `• 
/sessions config validate
 - Validate current configuration`,
        });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Configuration Failed**\n\nFailed to update configuration:
${errorMessage}`,
    });
  }
}

/**
 * Shows the current session configuration.
 * 
 * @param context - Command execution context
 */
async function showCurrentConfig(context: CommandContext): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    const config = await sessionManager.getConfiguration();
    
    const configMessage = `⚙️ **Session Configuration**\n\n` +
      `**Storage Settings:**
` +
      `• Directory: 
${config.sessionsDir}
` +
      `• Max Sessions: ${config.maxSessions}
` +
      `• Max Age (days): ${Math.round(config.maxAgeMs / (24 * 60 * 60 * 1000))}
` +
      `• Compression: ${config.compressionEnabled ? 'Enabled' : 'Disabled'}

` +
      
      `**Auto-Save Settings:**
` +
      `• Enabled: ${config.autoSaveEnabled ? 'Yes' : 'No'}
` +
      `• Interval: ${config.autoSaveInterval / 1000} seconds

` +
      
      `**Security Settings:**
` +
      `• Sanitize Exports: ${config.sanitizeExports ? 'Yes' : 'No'}
` +
      `• Audit Logging: ${config.auditLogging ? 'Enabled' : 'Disabled'}

` +
      
      `**Performance Settings:**
` +
      `• Index Caching: ${config.indexCaching ? 'Enabled' : 'Disabled'}
` +
      `• Background Cleanup: ${config.backgroundCleanup ? 'Enabled' : 'Disabled'}

` +
      
      `💡 **Tip:** Use 
/sessions config set <key> <value>
 to modify settings.`;
    
    addMessage({
      role: 'assistant',
      content: configMessage,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Failed to Load Configuration**\n\n${errorMessage}`,
    });
  }
}

/**
 * Sets a configuration value.
 * 
 * @param args - Configuration arguments [key, value]
 * @param context - Command execution context
 */
async function setConfigValue(args: string[], context: CommandContext): Promise<void> {
  const { addMessage, showConfirmation, sessionActions } = context;
  
  if (args.length < 2) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Configuration Parameters**\n\nUsage: 
/sessions config set <key> <value>

` +
               `**Available keys:**
` +
               `• 
/max-sessions
 - Maximum number of sessions to keep
` +
               `• 
/max-age-days
 - Maximum age of sessions in days
` +
               `• 
/auto-save-interval
 - Auto-save interval in seconds (5-300)
` +
               `• 
/compression
 - Enable/disable compression (true/false)
` +
               `• 
/sanitize-exports
 - Sanitize exported data (true/false)
` +
               `• 
/audit-logging
 - Enable audit logging (true/false)
` +
               `• 
/sessions-dir
 - Custom sessions directory path`,
    });
    return;
  }
  
  const key = args[0];
  const value = args[1];
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Validate the configuration change
    const validationResult = await sessionManager.validateConfigChange(key, value);
    if (!validationResult.valid) {
      addMessage({
        role: 'assistant',
        content: `❌ **Invalid Configuration Value**\n\n${validationResult.error}\n\n` +
                 `Current value: 
${validationResult.currentValue}
` +
                 `Suggested values: ${validationResult.suggestions?.join(', ') || 'See help for valid options'}`,
      });
      return;
    }
    
    // Show confirmation for potentially disruptive changes
    if (validationResult.requiresConfirmation) {
      const confirmed = await showConfirmation(
        `Change ${key} to "${value}"?`,
        `${validationResult.warning}\n\nThis change will take effect immediately.`
      );
      if (!confirmed) {
        addMessage({
          role: 'assistant',
          content: '⏹️ **Configuration Change Cancelled**',
        });
        return;
      }
    }
    
    // Apply the configuration change
    await sessionManager.setConfiguration(key, value);
    
    addMessage({
      role: 'assistant',
      content: `✅ **Configuration Updated**\n\n` +
               `${key}: 
${validationResult.currentValue}
 → 
${value}

` +
               `${validationResult.restartRequired ? 
                 '⚠️ **Note:** Some changes may require restarting the application.' : 
                 '✨ Change applied immediately.'
               }`,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Configuration Update Failed**\n\nFailed to set ${key}:
${errorMessage}`,
    });
  }
}

/**
 * Resets configuration to defaults.
 * 
 * @param args - Optional specific key to reset
 * @param context - Command execution context
 */
async function resetConfig(args: string[], context: CommandContext): Promise<void> {
  const { addMessage, showConfirmation, sessionActions } = context;
  
  const key = args[0]; // Optional specific key
  
  try {
    const confirmationMessage = key ? 
      `Reset "${key}" to default value?` : 
      'Reset all session configuration to defaults?';
    
    const confirmationDetails = key ?
      'This will restore the default value for this setting.' :
      'This will restore all session settings to their default values.\n\n' +
      'Current custom settings will be lost.';
    
    const confirmed = await showConfirmation(confirmationMessage, confirmationDetails);
    if (!confirmed) {
      addMessage({
        role: 'assistant',
        content: '⏹️ **Configuration Reset Cancelled**',
      });
      return;
    }
    
    const sessionManager = sessionActions.getSessionManager();
    const resetResult = await sessionManager.resetConfiguration(key);
    
    if (key) {
      addMessage({
        role: 'assistant',
        content: `✅ **Configuration Reset**\n\n` +
                 `${key}: 
${resetResult.oldValue}
 → 
${resetResult.newValue}
 (default)

` +
                 `${resetResult.restartRequired ? 
                   '⚠️ **Note:** Change may require restarting the application.' : 
                   '✨ Change applied immediately.'
                 }`,
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `✅ **All Configuration Reset**\n\n` +
                 `${resetResult.resetCount} settings restored to defaults.\n\n` +
                 `${resetResult.restartRequired ? 
                   '⚠️ **Note:** Some changes may require restarting the application.' : 
                   '✨ Changes applied immediately.'
                 }`,
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Configuration Reset Failed**\n\n${errorMessage}`,
    });
  }
}

/**
 * Validates the current configuration.
 * 
 * @param context - Command execution context
 */
async function validateConfig(context: CommandContext): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    const validationResult = await sessionManager.validateConfiguration();
    
    if (validationResult.valid) {
      addMessage({
        role: 'assistant',
        content: `✅ **Configuration Valid**\n\n` +
                 `All session configuration settings are valid and properly configured.\n\n` +
                 `**Summary:**
` +
                 `• ${validationResult.checkedSettings} settings validated
` +
                 `• Storage directory accessible
` +
                 `• All values within acceptable ranges
` +
                 `• No conflicts detected`,
      });
    } else {
      const issues = validationResult.issues || [];
      const warnings = validationResult.warnings || [];
      
      let message = `⚠️ **Configuration Issues Found**\n\n`;
      
      if (issues.length > 0) {
        message += `**Errors:**\n`;
        issues.forEach((issue: any) => {
          message += `• ${issue.setting}: ${issue.error}\n`;
        });
        message += '\n';
      }
      
      if (warnings.length > 0) {
        message += `**Warnings:**\n`;
        warnings.forEach((warning: any) => {
          message += `• ${warning.setting}: ${warning.message}\n`;
        });
        message += '\n';
      }
      
      message += `💡 **Tip:** Use 
/sessions config set <key> <value>
 to fix issues.`;
      
      addMessage({
        role: 'assistant',
        content: message,
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Configuration Validation Failed**\n\n${errorMessage}`,
    });
  }
}

/**
 * Handles /sessions help command.
 * 
 * @param context - Command execution context
 */
async function handleSessionsHelp(context: CommandContext): Promise<void> {
  const { addMessage } = context;
  
  const helpMessage = `📚 **Sessions Commands Help**\n\n` +
    `**List Sessions:**
` +
    `• 
/sessions
 - List all sessions
` +
    `• 
/sessions list
 - List sessions with options
` +
    `• 
/sessions list --limit 10
 - Limit results
` +
    `• 
/sessions list --model gpt-4o
 - Filter by model

` +
    
    `**Manage Sessions:**
` +
    `• 
/sessions delete <id>
 - Delete a session
` +
    `• 
/sessions export <id>
 - Export session as JSON
` +
    `• 
/sessions cleanup
 - Remove old sessions

` +
    
    `**Search & Filter:**
` +
    `• 
/sessions search <query>
 - Search session content
` +
    `• 
/sessions filter --model <model>
 - Filter by model
` +
    `• 
/sessions filter --date 2024-12
 - Filter by date
` +
    `• 
/sessions filter --min-messages 10
 - Filter by message count

` +
    
    `**Configuration:**
` +
    `• 
/sessions config
 - Show current configuration
` +
    `• 
/sessions config set <key> <value>
 - Update setting
` +
    `• 
/sessions config reset [key]
 - Reset to defaults
` +
    `• 
/sessions config validate
 - Validate configuration

` +
    
    `**Examples:**
` +
    `• 
/sessions search "authentication"
` +
    `• 
/sessions filter --model gpt-4o --min-tokens 1000
` +
    `• 
/sessions export abc123 json-pretty
` +
    `• 
/sessions config set max-sessions 100

` +
    
    `💡 **Tip:** Use 
/resume <id>
 to restore a session from the list.`;
  
  addMessage({
    role: 'assistant',
    content: helpMessage,
  });
}

// =============================================================================
// OPTION PARSING UTILITIES
// =============================================================================

/**
 * Parses list command options.
 * 
 * @param args - Command arguments
 * @returns Parsed options
 */
function parseListOptions(args: string[]): {
  limit?: number;
  offset?: number;
  sortBy?: 'created' | 'lastModified' | 'messageCount';
  sortOrder?: 'asc' | 'desc';
  model?: string;
  tags?: string[];
  showDetails?: boolean;
  showPreviews?: boolean;
} {
  const options: any = {
    limit: 20,
    sortBy: 'lastModified',
    sortOrder: 'desc',
    showDetails: true,
    showPreviews: true,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--limit' && i + 1 < args.length) {
      const limitValue = args[i + 1];
      if (limitValue) {
        options.limit = parseInt(limitValue, 10);
      }
      i++;
    } else if (arg === '--offset' && i + 1 < args.length) {
      const offsetValue = args[i + 1];
      if (offsetValue) {
        options.offset = parseInt(offsetValue, 10);
      }
      i++;
    } else if (arg === '--sort' && i + 1 < args.length) {
      const sortValue = args[i + 1];
      if (sortValue) {
        options.sortBy = sortValue as 'created' | 'lastModified' | 'messageCount';
      }
      i++;
    } else if (arg === '--order' && i + 1 < args.length) {
      const orderValue = args[i + 1];
      if (orderValue) {
        options.sortOrder = orderValue as 'asc' | 'desc';
      }
      i++;
    } else if (arg === '--model' && i + 1 < args.length) {
      const modelValue = args[i + 1];
      if (modelValue) {
        options.model = modelValue;
      }
      i++;
    } else if (arg === '--no-details') {
      options.showDetails = false;
    } else if (arg === '--no-previews') {
      options.showPreviews = false;
    }
  }
  
  return options;
}

/**
 * Parses filter command options.
 * 
 * @param args - Command arguments
 * @returns Parsed filter criteria
 */
function parseFilterOptions(args: string[]): Record<string, any> {
  const filters: any = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--model' && i + 1 < args.length) {
      const modelValue = args[i + 1];
      if (modelValue) {
        filters.model = modelValue;
      }
      i++;
    } else if (arg === '--date' && i + 1 < args.length) {
      const dateStr = args[i + 1];
      // Parse YYYY-MM format
      if (dateStr && /^\d{4}-\d{2}$/.test(dateStr)) {
        const parts = dateStr.split('-');
        const yearStr = parts[0];
        const monthStr = parts[1];
        if (yearStr && monthStr) {
          const year = parseInt(yearStr, 10);
          const month = parseInt(monthStr, 10);
          if (!isNaN(year) && !isNaN(month)) {
            filters.dateRange = {
              start: new Date(year, month - 1, 1),
              end: new Date(year, month, 0, 23, 59, 59, 999),
            };
          }
        }
      }
      i++;
    } else if (arg === '--min-messages' && i + 1 < args.length) {
      const minMessagesValue = args[i + 1];
      if (minMessagesValue) {
        filters.minMessages = parseInt(minMessagesValue, 10);
      }
      i++;
    } else if (arg === '--min-tokens' && i + 1 < args.length) {
      const minTokensValue = args[i + 1];
      if (minTokensValue) {
        filters.minTokens = parseInt(minTokensValue, 10);
      }
      i++;
    } else if (arg === '--workspace' && i + 1 < args.length) {
      const workspaceValue = args[i + 1];
      if (workspaceValue) {
        filters.workspaceRoot = workspaceValue;
      }
      i++;
    }
  }
  
  return filters;
}

/**
 * Parses cleanup options.
 */
function parseCleanupOptions(args: string[]): any {
  const options: any = {
    maxCount: 50,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    createBackups: true,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--max-sessions' && i + 1 < args.length) {
      const maxSessionsValue = args[i + 1];
      if (maxSessionsValue) {
        options.maxCount = parseInt(maxSessionsValue, 10);
      }
      i++;
    } else if (arg === '--max-age-days' && i + 1 < args.length) {
      const maxAgeDaysValue = args[i + 1];
      if (maxAgeDaysValue) {
        options.maxAgeMs = parseInt(maxAgeDaysValue, 10) * 24 * 60 * 60 * 1000;
      }
      i++;
    } else if (arg === '--no-backups') {
      options.createBackups = false;
    }
  }
  
  return options;
}

/**
 * Formats storage limit notification.
 */
function formatStorageLimitNotification(limitResult: any): string {
  if (limitResult.withinLimits && !limitResult.warningThresholdReached) {
    return '';
  }
  
  let message = '';
  
  if (!limitResult.withinLimits) {
    if (limitResult.sessionCountExceeded) {
      message += '❌ **Session limit exceeded** - Too many sessions stored\n';
    }
    if (limitResult.totalSizeExceeded) {
      message += '❌ **Storage limit exceeded** - Session storage is full\n';
    }
    if (limitResult.diskSpaceExceeded) {
      message += '❌ **Disk space low** - Insufficient disk space available\n';
    }
  }
  
  if (limitResult.warningThresholdReached && limitResult.withinLimits) {
    message += '⚠️ **Warning** - Approaching storage limits\n';
  }
  
  if (limitResult.suggestedActions && limitResult.suggestedActions.length > 0) {
    message += '\n**Suggested actions:**\n';
    limitResult.suggestedActions.forEach((action: string) => {
      message += `• ${action}\n`;
    });
    
    if (limitResult.estimatedSpaceSavings > 0) {
      const savings = formatFileSize(limitResult.estimatedSpaceSavings);
      message += `\n💾 **Estimated space savings:** ${savings}\n`;
    }
    
    message += '\n💡 **Tip:** Use /sessions cleanup to free up space automatically.';
  }
  
  return message.trim();
}
