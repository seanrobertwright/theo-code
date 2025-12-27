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
  _context: CommandContext
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
          content: `❌ **Unknown Sessions Command**\n\nUnknown subcommand: \`${subcommand}\`\n\nUse \`/sessions help\` to see available commands.`,
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
  _context: CommandContext
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
      showDetails: options.showDetails || true,
      showPreviews: options.showPreviews || true,
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
  _context: CommandContext
): Promise<void> {
  const { addMessage, showConfirmation, sessionActions } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Session ID**\n\nUsage: \`/sessions delete <session-id>\`\n\nUse \`/sessions list\` to see available sessions.`,
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
        content: `❌ **Session Not Found**\n\nSession \`${sessionId}\` does not exist.\n\nUse \`/sessions list\` to see available sessions.`,
      });
      return;
    }
    
    // Get session metadata for confirmation
    const sessions = await sessionManager.listSessions({ _limit: 1000 });
    const sessionMetadata = sessions.find((_s: SessionMetadata) => s.id === sessionId);
    
    if (!sessionMetadata) {
      throw new Error(`Session metadata not found for ${sessionId}`);
    }
    
    // Show confirmation
    const confirmationMessage = `Delete session "${sessionMetadata.title || sessionId}"?`;
    const confirmationDetails = `This action cannot be undone.\n\n` +
      `📅 Created: ${new Date(sessionMetadata.created).toLocaleString()}\n` +
      `💬 Messages: ${sessionMetadata.messageCount}\n` +
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
        content: `✅ **Session Deleted**\n\nSession \`${sessionId}\` has been permanently deleted.`,
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `❌ **Deletion Failed**\n\nFailed to delete session \`${sessionId}\`. Please try again.`,
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Delete Failed**\n\nFailed to delete session \`${sessionId}\`:\n${errorMessage}`,
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
  _context: CommandContext
): Promise<void> {
  const { addMessage, workspaceRoot, sessionActions } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Session ID**\n\nUsage: \`/sessions export <session-id> [format]\`\n\_nFormats: json, json-pretty (default), json-compact\n\nUse \`/sessions list\` to see available sessions.`,
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
        content: `❌ **Session Not Found**\n\nSession \`${sessionId}\` does not exist.\n\nUse \`/sessions list\` to see available sessions.`,
      });
      return;
    }
    
    // Export the session
    const exportResult = await sessionManager.exportSession(sessionId, {
      format,
      _sanitize: true,
      _includeContent: true,
      _metadataOnly: false,
    });
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `session-${sessionId}-${timestamp}.json`;
    const filepath = `${workspaceRoot}/${filename}`;
    
    // Prepare export message
    let content = `✅ **Session Exported**\n\n` +
                  `📁 **File:** \`${filename}\`\n` +
                  `📊 **Size:** ${formatFileSize(exportResult.size)}\n` +
                  `🔧 **Format:** ${exportResult.format}\n` +
                  `🔒 **Sanitized:** ${exportResult.sanitized ? 'Yes' : 'No'}\n\n` +
                  `${exportResult.warnings.length > 0 ? 
                    `⚠️ **Warnings:**\n${exportResult.warnings.map((_w: string) => `• ${w}`).join('\n')}\n\n` : 
                    ''
                  }` +
                  `💡 **Tip:** The exported file can be shared or imported into another theo-code instance.`;
    
    // Add storage warnings if disk space is low
    if (limitCheckResult.diskSpaceExceeded) {
      content = '⚠️ **Warning:** Low disk space detected. Export may use additional storage.\n\n' + content;
    }
    
    // Write to file (in a real implementation, you'd use fs.writeFile)
    // For now, we'll just show the export info
    addMessage({
      role: 'assistant',
      content,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Export Failed**\n\nFailed to export session \`${sessionId}\`:\n${errorMessage}`,
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
  _context: CommandContext
): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Search Query**\n\nUsage: \`/sessions search <query>\`\n\nExample: \`/sessions search "authentication code"\``,
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
      _limit: 20,
      minRelevance: 0.1,
      _includeContent: true,
      _includeMetadata: true,
      _includeFilenames: true,
      sortBy: 'relevance',
    });
    
    if (searchResults.length === 0) {
      addMessage({
        role: 'assistant',
        content: `🔍 **No Results Found**\n\nNo sessions found matching "${query}".\n\nTry different search terms or use \`/sessions list\` to see all sessions.`,
      });
      return;
    }
    
    // Format and display results
    const formattedResults = formatSearchResults(searchResults, query, {
      _highlightMatches: true,
      _contextLength: 100,
      _maxSessions: 20,
      _showDetails: true,
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
      content: `❌ **Search Failed**\n\nFailed to search sessions:\n${errorMessage}`,
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
  _context: CommandContext
): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    
    // Parse filter options
    const filters = parseFilterOptions(args);
    
    if (Object.keys(filters).length === 0) {
      addMessage({
        role: 'assistant',
        content: `❌ **No Filter Criteria**\n\nUsage: \`/sessions filter [options]\`\n\n` +
                 `**Options:**\n` +
                 `• \`--model <model>\` - Filter by model\n` +
                 `• \`--date <YYYY-MM>\` - Filter by month\n` +
                 `• \`--min-messages <count>\` - Minimum message count\n` +
                 `• \`--min-tokens <count>\` - Minimum token count\n\n` +
                 `**Example:** \`/sessions filter --model gpt-4o --date 2024-12\``,
      });
      return;
    }
    
    // Apply filters
    const filteredSessions = await sessionManager.filterSessions(filters);
    
    if (filteredSessions.length === 0) {
      addMessage({
        role: 'assistant',
        content: `🔧 **No Matching Sessions**\n\nNo sessions match the specified filter criteria.\n\nTry adjusting your filters or use \`/sessions list\` to see all sessions.`,
      });
      return;
    }
    
    // Format and display results
    const formattedResults = formatFilterResults(filteredSessions, filters, {
      _showFilterCriteria: true,
      _maxSessions: 20,
      _showDetails: true,
      _showPreviews: true,
    });
    
    addMessage({
      role: 'assistant',
      _content: formattedResults,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Filter Failed**\n\nFailed to filter sessions:\n${errorMessage}`,
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
  _context: CommandContext
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
      _dryRun: true,
    });
    
    if (dryRunResult.deletedSessions.length === 0) {
      let content = `✨ **No Cleanup Needed**\n\nAll sessions are within the configured limits.\n\n` +
                    `Current limits:\n` +
                    `• Max sessions: ${options.maxCount || 50}\n` +
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
    const confirmationDetails = `This will permanently delete:\n\n` +
      `🗓️ ${dryRunResult.deletedByAge} sessions older than ${Math.round((options.maxAgeMs || 30 * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))} days\n` +
      `📊 ${dryRunResult.deletedByCount} sessions exceeding limit of ${options.maxCount || 50}\n` +
      `💾 ~${formatFileSize(dryRunResult.spaceFree)} will be freed\n\n` +
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
      _dryRun: false,
    });
    
    if (cleanupResult.errors.length > 0) {
      addMessage({
        role: 'assistant',
        content: `⚠️ **Cleanup Completed with Errors**\n\n` +
                 `✅ Deleted: ${cleanupResult.deletedSessions.length - cleanupResult.errors.length} sessions\n` +
                 `❌ Errors: ${cleanupResult.errors.length} sessions\n` +
                 `💾 Space freed: ~${formatFileSize(cleanupResult.spaceFree)}\n\n` +
                 `**Errors:**\n${cleanupResult.errors.map((_e: any) => `• ${e.sessionId}: ${e.error}`).join('\n')}`,
      });
    } else {
      addMessage({
        role: 'assistant',
        content: `✅ **Cleanup Completed**\n\n` +
                 `🗑️ Deleted: ${cleanupResult.deletedSessions.length} sessions\n` +
                 `💾 Space freed: ~${formatFileSize(cleanupResult.spaceFree)}\n\n` +
                 `Your session storage has been optimized.`,
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Cleanup Failed**\n\nFailed to cleanup sessions:\n${errorMessage}`,
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
  _context: CommandContext
): Promise<void> {
  const { addMessage, showConfirmation, sessionActions } = context;
  
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
          content: `❌ **Unknown Config Command**\n\nUnknown config action: \`${configAction}\`\n\n` +
                   `**Available actions:**\n` +
                   `• \`/sessions config show\` - Show current configuration\n` +
                   `• \`/sessions config set <key> <value>\` - Set configuration value\n` +
                   `• \`/sessions config reset [key]\` - Reset configuration to defaults\n` +
                   `• \`/sessions config validate\` - Validate current configuration`,
        });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Configuration Failed**\n\nFailed to update configuration:\n${errorMessage}`,
    });
  }
}

/**
 * Shows the current session configuration.
 * 
 * @param context - Command execution context
 */
async function showCurrentConfig(_context: CommandContext): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    const config = await sessionManager.getConfiguration();
    
    const configMessage = `⚙️ **Session Configuration**\n\n` +
      `**Storage Settings:**\n` +
      `• Directory: \`${config.sessionsDir}\`\n` +
      `• Max Sessions: ${config.maxSessions}\n` +
      `• Max Age (days): ${Math.round(config.maxAgeMs / (24 * 60 * 60 * 1000))}\n` +
      `• Compression: ${config.compressionEnabled ? 'Enabled' : 'Disabled'}\n\n` +
      
      `**Auto-Save Settings:**\n` +
      `• Enabled: ${config.autoSaveEnabled ? 'Yes' : 'No'}\n` +
      `• Interval: ${config.autoSaveInterval / 1000} seconds\n\n` +
      
      `**Security Settings:**\n` +
      `• Sanitize Exports: ${config.sanitizeExports ? 'Yes' : 'No'}\n` +
      `• Audit Logging: ${config.auditLogging ? 'Enabled' : 'Disabled'}\n\n` +
      
      `**Performance Settings:**\n` +
      `• Index Caching: ${config.indexCaching ? 'Enabled' : 'Disabled'}\n` +
      `• Background Cleanup: ${config.backgroundCleanup ? 'Enabled' : 'Disabled'}\n\n` +
      
      `💡 **Tip:** Use \`/sessions config set <key> <value>\` to modify settings.`;
    
    addMessage({
      role: 'assistant',
      _content: configMessage,
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
async function setConfigValue(args: string[], _context: CommandContext): Promise<void> {
  const { addMessage, showConfirmation, sessionActions } = context;
  
  if (args.length < 2) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Configuration Parameters**\n\nUsage: \`/sessions config set <key> <value>\`\n\n` +
               `**Available keys:**\n` +
               `• \`max-sessions\` - Maximum number of sessions to keep\n` +
               `• \`max-age-days\` - Maximum age of sessions in days\n` +
               `• \`auto-save-interval\` - Auto-save interval in seconds (5-300)\n` +
               `• \`compression\` - Enable/disable compression (true/false)\n` +
               `• \`sanitize-exports\` - Sanitize exported data (true/false)\n` +
               `• \`audit-logging\` - Enable audit logging (true/false)\n` +
               `• \`sessions-dir\` - Custom sessions directory path`,
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
                 `Current value: \`${validationResult.currentValue}\`\n` +
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
               `${key}: \`${validationResult.currentValue}\` → \`${value}\`\n\n` +
               `${validationResult.restartRequired ? 
                 '⚠️ **Note:** Some changes may require restarting the application.' : 
                 '✨ Change applied immediately.'
               }`,
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addMessage({
      role: 'assistant',
      content: `❌ **Configuration Update Failed**\n\nFailed to set ${key}:\n${errorMessage}`,
    });
  }
}

/**
 * Resets configuration to defaults.
 * 
 * @param args - Optional specific key to reset
 * @param context - Command execution context
 */
async function resetConfig(args: string[], _context: CommandContext): Promise<void> {
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
                 `${key}: \`${resetResult.oldValue}\` → \`${resetResult.newValue}\` (default)\n\n` +
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
async function validateConfig(_context: CommandContext): Promise<void> {
  const { addMessage, sessionActions } = context;
  
  try {
    const sessionManager = sessionActions.getSessionManager();
    const validationResult = await sessionManager.validateConfiguration();
    
    if (validationResult.valid) {
      addMessage({
        role: 'assistant',
        content: `✅ **Configuration Valid**\n\n` +
                 `All session configuration settings are valid and properly configured.\n\n` +
                 `**Summary:**\n` +
                 `• ${validationResult.checkedSettings} settings validated\n` +
                 `• Storage directory accessible\n` +
                 `• All values within acceptable ranges\n` +
                 `• No conflicts detected`,
      });
    } else {
      const issues = validationResult.issues || [];
      const warnings = validationResult.warnings || [];
      
      let message = `⚠️ **Configuration Issues Found**\n\n`;
      
      if (issues.length > 0) {
        message += `**Errors:**\n`;
        issues.forEach((_issue: any) => {
          message += `• ${issue.setting}: ${issue.error}\n`;
        });
        message += '\n';
      }
      
      if (warnings.length > 0) {
        message += `**Warnings:**\n`;
        warnings.forEach((_warning: any) => {
          message += `• ${warning.setting}: ${warning.message}\n`;
        });
        message += '\n';
      }
      
      message += `💡 **Tip:** Use \`/sessions config set <key> <value>\` to fix issues.`;
      
      addMessage({
        role: 'assistant',
        _content: message,
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
async function handleSessionsHelp(_context: CommandContext): Promise<void> {
  const { addMessage } = context;
  
  const helpMessage = `📚 **Sessions Commands Help**\n\n` +
    `**List Sessions:**\n` +
    `• \`/sessions\` - List all sessions\n` +
    `• \`/sessions list\` - List sessions with options\n` +
    `• \`/sessions list --limit 10\` - Limit results\n` +
    `• \`/sessions list --model gpt-4o\` - Filter by model\n\n` +
    
    `**Manage Sessions:**\n` +
    `• \`/sessions delete <id>\` - Delete a session\n` +
    `• \`/sessions export <id>\` - Export session as JSON\n` +
    `• \`/sessions cleanup\` - Remove old sessions\n\n` +
    
    `**Search & Filter:**\n` +
    `• \`/sessions search <query>\` - Search session content\n` +
    `• \`/sessions filter --model <model>\` - Filter by model\n` +
    `• \`/sessions filter --date 2024-12\` - Filter by date\n` +
    `• \`/sessions filter --min-messages 10\` - Filter by message count\n\n` +
    
    `**Configuration:**\n` +
    `• \`/sessions config\` - Show current configuration\n` +
    `• \`/sessions config set <key> <value>\` - Update setting\n` +
    `• \`/sessions config reset [key]\` - Reset to defaults\n` +
    `• \`/sessions config validate\` - Validate configuration\n\n` +
    
    `**Examples:**\n` +
    `• \`/sessions search "authentication"\`\n` +
    `• \`/sessions filter --model gpt-4o --min-tokens 1000\`\n` +
    `• \`/sessions export abc123 json-pretty\`\n` +
    `• \`/sessions config set max-sessions 100\`\n\n` +
    
    `💡 **Tip:** Use \`/resume <id>\` to restore a session from the list.`;
  
  addMessage({
    role: 'assistant',
    _content: helpMessage,
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
    _limit: 20,
    sortBy: 'lastModified',
    sortOrder: 'desc',
    _showDetails: true,
    _showPreviews: true,
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
 * Parses cleanup command options.
 * 
 * @param args - Command arguments
 * @returns Parsed cleanup options
 */
function parseCleanupOptions(args: string[]): {
  maxCount?: number;
  maxAgeMs?: number;
  createBackups?: boolean;
} {
  const options: any = {
    _maxCount: 50,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    _createBackups: true,
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

// =============================================================================
// STORAGE LIMIT UTILITIES
// =============================================================================

/**
 * Formats storage limit notifications for display.
 * 
 * @param limitResult - Storage limit check result
 * @returns Formatted notification message
 */
function formatStorageLimitNotification(_limitResult: any): string {
  if (limitResult.withinLimits && !limitResult.warningThresholdReached) {
    return '';
  }
  
  let message = '';
  
  // Error level notifications (limits exceeded)
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
  
  // Warning level notifications (approaching limits but not exceeded)
  if (limitResult.warningThresholdReached && limitResult.withinLimits) {
    message += '⚠️ **Warning** - Approaching storage limits\n';
  }
  
  // Add suggested actions
  if (limitResult.suggestedActions && limitResult.suggestedActions.length > 0) {
    message += '\n**Suggested actions:**\n';
    limitResult.suggestedActions.forEach((_action: string) => {
      message += `• ${action}\n`;
    });
    
    // Add estimated space savings
    if (limitResult.estimatedSpaceSavings > 0) {
      const savings = formatFileSize(limitResult.estimatedSpaceSavings);
      message += `\n💾 **Estimated space savings:** ${savings}\n`;
    }
    
    // Add cleanup command suggestion
    message += '\n💡 **Tip:** Use `/sessions cleanup` to free up space automatically.';
  }
  
  return message.trim();
}

// =============================================================================
// EXPORTS
// =============================================================================

// Export is already done inline above