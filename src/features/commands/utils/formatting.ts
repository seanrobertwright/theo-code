/**
 * @fileoverview Formatting utilities for command output
 * @module features/commands/utils/formatting
 */

import type { SessionMetadata, SessionTokenCount } from '../../../shared/types/index.js';
import type { 
  SessionListDisplayOptions,
  SessionSearchDisplayOptions,
  SessionFilterDisplayOptions 
} from '../types.js';

// =============================================================================
// SESSION FORMATTING UTILITIES
// =============================================================================

/**
 * Formats a list of sessions for display.
 * 
 * @param sessions - Sessions to format
 * @param options - Display options
 * @returns Formatted session list string
 */
export function formatSessionList(
  sessions: SessionMetadata[],
  options: SessionListDisplayOptions = {}
): string {
  const {
    maxSessions = 20,
    showDetails = true,
    showPreviews = true,
    sortBy = 'lastModified',
    sortOrder = 'desc',
  } = options;
  
  if (sessions.length === 0) {
    return '📭 No sessions found.';
  }
  
  // Sort sessions
  const sortedSessions = [...sessions].sort((a, b) => {
    let aValue: number;
    let bValue: number;
    
    switch (sortBy) {
      case 'created':
        aValue = a.created;
        bValue = b.created;
        break;
      case 'lastModified':
        aValue = a.lastModified;
        bValue = b.lastModified;
        break;
      case 'messageCount':
        aValue = a.messageCount;
        bValue = b.messageCount;
        break;
      default:
        aValue = a.lastModified;
        bValue = b.lastModified;
    }
    
    const result = aValue - bValue;
    return sortOrder === 'asc' ? result : -result;
  });
  
  // Limit sessions
  const displaySessions = sortedSessions.slice(0, maxSessions);
  const truncated = sessions.length > maxSessions;
  
  let output = `📋 **Sessions** (${displaySessions.length}${truncated ? `/${sessions.length}` : ''})\n\n`;
  
  displaySessions.forEach((session, index) => {
    output += formatSingleSession(session, { 
      showDetails, 
      showPreviews,
      index: index + 1 
    });
    output += '\n';
  });
  
  if (truncated) {
    output += `\n... and ${sessions.length - maxSessions} more sessions.\n`;
    output += `Use \`/sessions list --limit ${sessions.length}\` to see all sessions.`;
  }
  
  return output;
}

/**
 * Formats a single session for display.
 * 
 * @param session - Session to format
 * @param options - Display options
 * @returns Formatted session string
 */
export function formatSingleSession(
  _session: SessionMetadata,
  options: {
    showDetails?: boolean;
    showPreviews?: boolean;
    index?: number;
    highlightMatches?: boolean;
  } = {}
): string {
  const { showDetails = true, showPreviews = true, index, highlightMatches = false } = options;
  
  const title = session.title || 'Untitled Session';
  const prefix = index ? `**${index}.** ` : '';
  
  let output = `${prefix}${title}\n`;
  output += `   🆔 \`${session.id}\`\n`;
  
  if (showDetails) {
    const created = new Date(session.created).toLocaleString();
    const lastModified = new Date(session.lastModified).toLocaleString();
    
    output += `   📅 Created: ${created}\n`;
    output += `   🕒 Modified: ${lastModified}\n`;
    output += `   🤖 Model: ${session.model}\n`;
    output += `   💬 Messages: ${session.messageCount}\n`;
    output += `   🔢 Tokens: ${formatTokenCount(session.tokenCount)}\n`;
    
    if (session.contextFiles.length > 0) {
      output += `   📁 Context: ${session.contextFiles.length} files\n`;
    }
    
    if (session.tags.length > 0) {
      output += `   🏷️ Tags: ${session.tags.join(', ')}\n`;
    }
  }
  
  if (showPreviews && session.preview) {
    const preview = session.preview.length > 100 ? 
      session.preview.slice(0, 100) + '...' : 
      session.preview;
    output += `   💭 ${preview}\n`;
  }
  
  return output;
}

/**
 * Formats a session preview for confirmation dialogs.
 * 
 * @param session - Session metadata
 * @returns Formatted preview string
 */
export function formatSessionPreview(session: SessionMetadata): string {
  const created = new Date(session.created).toLocaleString();
  const lastModified = new Date(session.lastModified).toLocaleString();
  
  let preview = `**Session Details:**\n\n`;
  preview += `🆔 ID: \`${session.id}\`\n`;
  preview += `📝 Title: ${session.title || 'Untitled Session'}\n`;
  preview += `📅 Created: ${created}\n`;
  preview += `🕒 Last Modified: ${lastModified}\n`;
  preview += `🤖 Model: ${session.model}\n`;
  preview += `💬 Messages: ${session.messageCount}\n`;
  preview += `🔢 Tokens: ${formatTokenCount(session.tokenCount)}\n`;
  
  if (session.contextFiles.length > 0) {
    preview += `📁 Context Files: ${session.contextFiles.length}\n`;
    if (session.contextFiles.length <= 5) {
      session.contextFiles.forEach(file => {
        preview += `   • ${file}\n`;
      });
    } else {
      session.contextFiles.slice(0, 3).forEach(file => {
        preview += `   • ${file}\n`;
      });
      preview += `   • ... and ${session.contextFiles.length - 3} more\n`;
    }
  }
  
  if (session.tags.length > 0) {
    preview += `🏷️ Tags: ${session.tags.join(', ')}\n`;
  }
  
  if (session.preview) {
    const previewText = session.preview.length > 200 ? 
      session.preview.slice(0, 200) + '...' : 
      session.preview;
    preview += `\n💭 **Preview:**\n${previewText}`;
  }
  
  return preview;
}

/**
 * Formats search results for display.
 * 
 * @param results - Search results
 * @param query - Original search query
 * @param options - Display options
 * @returns Formatted search results string
 */
export function formatSearchResults(
  results: Array<{
    session: SessionMetadata;
    relevanceScore: number;
    matches: Array<{
      type: string;
      text: string;
      context: string;
    }>;
  }>,
  _query: string,
  options: SessionSearchDisplayOptions = {}
): string {
  const { highlightMatches = true, contextLength = 100 } = options;
  
  if (results.length === 0) {
    return `🔍 **Search Results**\n\nNo sessions found matching "${query}".`;
  }
  
  let output = `🔍 **Search Results** for "${query}" (${results.length} found)\n\n`;
  
  results.forEach((result, index) => {
    const { session, relevanceScore, matches } = result;
    
    output += `**${index + 1}.** ${session.title || 'Untitled Session'} `;
    output += `(${Math.round(relevanceScore * 100)}% match)\n`;
    output += `   🆔 \`${session.id}\`\n`;
    output += `   📅 ${new Date(session.lastModified).toLocaleString()}\n`;
    output += `   🤖 ${session.model} | 💬 ${session.messageCount} messages\n`;
    
    if (matches.length > 0) {
      output += `   🎯 **Matches:**\n`;
      matches.slice(0, 3).forEach(match => {
        const matchText = highlightMatches ? 
          highlightSearchTerms(match.text, query) : 
          match.text;
        output += `      ${match.type}: ${matchText}\n`;
        
        if (match.context && match.context !== match.text) {
          const context = match.context.length > contextLength ?
            match.context.slice(0, contextLength) + '...' :
            match.context;
          output += `      Context: ${context}\n`;
        }
      });
      
      if (matches.length > 3) {
        output += `      ... and ${matches.length - 3} more matches\n`;
      }
    }
    
    output += '\n';
  });
  
  return output;
}

/**
 * Formats filter results for display.
 * 
 * @param sessions - Filtered sessions
 * @param filters - Applied filters
 * @param options - Display options
 * @returns Formatted filter results string
 */
export function formatFilterResults(
  sessions: SessionMetadata[],
  filters: Record<string, any>,
  options: SessionFilterDisplayOptions = {}
): string {
  const { showFilterCriteria = true } = options;
  
  let output = `🔧 **Filter Results**`;
  
  if (showFilterCriteria) {
    const criteriaList = Object.entries(filters)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        if (key === 'dateRange' && value.start && value.end) {
          return `Date: ${new Date(value.start).toLocaleDateString()} - ${new Date(value.end).toLocaleDateString()}`;
        }
        if (Array.isArray(value)) {
          return `${key}: ${value.join(', ')}`;
        }
        return `${key}: ${value}`;
      });
    
    if (criteriaList.length > 0) {
      output += ` (${criteriaList.join(', ')})`;
    }
  }
  
  output += `\n\n`;
  
  if (sessions.length === 0) {
    output += 'No sessions match the specified criteria.';
    return output;
  }
  
  output += formatSessionList(sessions, options);
  
  return output;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Formats token count for display.
 * 
 * @param tokenCount - Token count object
 * @returns Formatted token count string
 */
export function formatTokenCount(tokenCount: SessionTokenCount): string {
  const { total, input, output } = tokenCount;
  
  if (input === 0 && output === 0) {
    return total.toLocaleString();
  }
  
  return `${total.toLocaleString()} (${input.toLocaleString()} in, ${output.toLocaleString()} out)`;
}

/**
 * Highlights search terms in text.
 * 
 * @param text - Text to highlight
 * @param query - Search query
 * @returns Text with highlighted terms
 */
export function highlightSearchTerms(text: string, query: string): string {
  if (!query.trim()) {
    return text;
  }
  
  // Split query into terms and escape regex special characters
  const terms = query.trim().split(/\s+/).map(term => 
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  
  let highlightedText = text;
  
  terms.forEach(term => {
    const regex = new RegExp(`(${term})`, 'gi');
    highlightedText = highlightedText.replace(regex, '**$1**');
  });
  
  return highlightedText;
}

/**
 * Formats file size in human-readable format.
 * 
 * @param bytes - Size in bytes
 * @returns Formatted size string
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Formats duration in human-readable format.
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// All exports are already done inline above