/**
 * @fileoverview Secure token and configuration display utilities
 * @module features/auth/display-utilities
 */

import type { AuthStatus, TokenSet, OAuthConfig } from './types.js';
import type { ProviderConfig } from '../../config/schemas.js';
import { TokenInfoFormatter, type MaskedTokenInfo } from './config-serializer.js';

// =============================================================================
// DISPLAY FORMATTING CONSTANTS
// =============================================================================

/**
 * ANSI color codes for terminal output.
 */
const Colors = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
} as const;

/**
 * Status indicators for authentication states.
 */
const StatusIndicators = {
  AUTHENTICATED: '✓',
  NOT_AUTHENTICATED: '✗',
  EXPIRED: '⚠',
  NEEDS_REFRESH: '↻',
  UNKNOWN: '?',
} as const;

// =============================================================================
// AUTHENTICATION STATUS DISPLAY
// =============================================================================

/**
 * Authentication status display formatter.
 */
export class AuthStatusDisplayFormatter {
  /**
   * Format authentication status for console display.
   */
  static formatAuthStatus(status: AuthStatus, useColors: boolean = true): string {
    const color = useColors ? this.getStatusColor(status) : '';
    const reset = useColors ? Colors.RESET : '';
    const indicator = this.getStatusIndicator(status);
    
    const parts = [
      `${color}${indicator} ${status.provider}${reset}`,
      `Method: ${status.method}`,
    ];
    
    if (status.authenticated) {
      if (status.expiresAt) {
        const expirationInfo = this.formatExpirationInfo(status.expiresAt, status.needsRefresh, useColors);
        parts.push(`Expires: ${expirationInfo}`);
      }
      
      if (status.needsRefresh) {
        const refreshColor = useColors ? Colors.YELLOW : '';
        parts.push(`${refreshColor}Status: Needs Refresh${reset}`);
      } else {
        const validColor = useColors ? Colors.GREEN : '';
        parts.push(`${validColor}Status: Valid${reset}`);
      }
    } else {
      const notAuthColor = useColors ? Colors.RED : '';
      parts.push(`${notAuthColor}Status: Not Authenticated${reset}`);
    }
    
    return parts.join(' | ');
  }
  
  /**
   * Format multiple authentication statuses in a table format.
   */
  static formatAuthStatusTable(statuses: AuthStatus[], useColors: boolean = true): string {
    if (statuses.length === 0) {
      return 'No providers configured';
    }
    
    const headers = ['Provider', 'Method', 'Status', 'Expires'];
    const rows = statuses.map(status => [
      status.provider,
      status.method,
      this.getStatusText(status, useColors),
      status.expiresAt ? this.formatExpirationInfo(status.expiresAt, status.needsRefresh, useColors) : 'N/A',
    ]);
    
    return this.formatTable(headers, rows, useColors);
  }
  
  /**
   * Get color for authentication status.
   */
  private static getStatusColor(status: AuthStatus): string {
    if (!status.authenticated) return Colors.RED;
    if (status.needsRefresh) return Colors.YELLOW;
    return Colors.GREEN;
  }
  
  /**
   * Get status indicator symbol.
   */
  private static getStatusIndicator(status: AuthStatus): string {
    if (!status.authenticated) return StatusIndicators.NOT_AUTHENTICATED;
    if (status.needsRefresh) return StatusIndicators.NEEDS_REFRESH;
    return StatusIndicators.AUTHENTICATED;
  }
  
  /**
   * Get status text description.
   */
  private static getStatusText(status: AuthStatus, useColors: boolean): string {
    const color = useColors ? this.getStatusColor(status) : '';
    const reset = useColors ? Colors.RESET : '';
    
    if (!status.authenticated) {
      return `${color}Not Authenticated${reset}`;
    }
    if (status.needsRefresh) {
      return `${color}Needs Refresh${reset}`;
    }
    return `${color}Valid${reset}`;
  }
  
  /**
   * Format expiration information.
   */
  private static formatExpirationInfo(expiresAt: Date, needsRefresh: boolean, useColors: boolean): string {
    const now = new Date();
    const isExpired = expiresAt <= now;
    
    if (isExpired) {
      const expiredColor = useColors ? Colors.RED : '';
      const reset = useColors ? Colors.RESET : '';
      return `${expiredColor}EXPIRED${reset}`;
    }
    
    const timeUntilExpiration = expiresAt.getTime() - now.getTime();
    const hoursUntilExpiration = Math.floor(timeUntilExpiration / (1000 * 60 * 60));
    const minutesUntilExpiration = Math.floor((timeUntilExpiration % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeString: string;
    if (hoursUntilExpiration > 0) {
      timeString = `${hoursUntilExpiration}h ${minutesUntilExpiration}m`;
    } else {
      timeString = `${minutesUntilExpiration}m`;
    }
    
    if (needsRefresh) {
      const warningColor = useColors ? Colors.YELLOW : '';
      const reset = useColors ? Colors.RESET : '';
      return `${warningColor}${timeString} (refresh needed)${reset}`;
    }
    
    return timeString;
  }
  
  /**
   * Format data in a table format.
   */
  private static formatTable(headers: string[], rows: string[][], useColors: boolean): string {
    // Calculate column widths
    const columnWidths = headers.map((header, index) => {
      const rowWidths = rows.map(row => this.stripAnsiCodes(row[index] || '').length);
      const maxRowWidth = rowWidths.length > 0 ? Math.max(...rowWidths) : 0;
      return Math.max(header.length, maxRowWidth);
    });
    
    // Format header
    const headerColor = useColors ? Colors.BRIGHT : '';
    const reset = useColors ? Colors.RESET : '';
    const headerRow = headers
      .map((header, index) => `${headerColor}${header.padEnd(columnWidths[index] || 0)}${reset}`)
      .join(' | ');
    
    // Format separator
    const separator = columnWidths.map(width => '-'.repeat(width)).join('-+-');
    
    // Format rows
    const formattedRows = rows.map(row =>
      row.map((cell, index) => {
        const plainText = this.stripAnsiCodes(cell);
        const columnWidth = columnWidths[index] || 0;
        const padding = columnWidth - plainText.length;
        return cell + ' '.repeat(Math.max(0, padding));
      }).join(' | ')
    );
    
    return [headerRow, separator, ...formattedRows].join('\n');
  }
  
  /**
   * Strip ANSI color codes from text for length calculation.
   */
  private static stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

// =============================================================================
// TOKEN INFORMATION DISPLAY
// =============================================================================

/**
 * Token information display formatter.
 */
export class TokenDisplayFormatter {
  /**
   * Format token information for secure display.
   */
  static formatTokenInfo(provider: string, tokens: TokenSet | null, useColors: boolean = true): string {
    const maskedInfo = TokenInfoFormatter.createMaskedTokenInfo(provider, tokens);
    return this.formatMaskedTokenInfo(maskedInfo, useColors);
  }
  
  /**
   * Format masked token information with colors.
   */
  static formatMaskedTokenInfo(maskedInfo: MaskedTokenInfo, useColors: boolean = true): string {
    if (!maskedInfo.hasTokens) {
      const noTokenColor = useColors ? Colors.DIM : '';
      const reset = useColors ? Colors.RESET : '';
      return `${noTokenColor}${maskedInfo.provider}: No tokens${reset}`;
    }
    
    const statusColor = this.getTokenStatusColor(maskedInfo, useColors);
    const reset = useColors ? Colors.RESET : '';
    
    const parts = [
      `${statusColor}${maskedInfo.provider}${reset}`,
      `Token: ${maskedInfo.maskedAccessToken}`,
      `Type: ${maskedInfo.tokenType}`,
    ];
    
    if (maskedInfo.expiresAt) {
      const expirationInfo = this.formatTokenExpiration(maskedInfo, useColors);
      parts.push(`Expires: ${expirationInfo}`);
    }
    
    if (maskedInfo.hasRefreshToken) {
      const refreshColor = useColors ? Colors.CYAN : '';
      parts.push(`${refreshColor}Refresh: Available${reset}`);
    }
    
    const statusInfo = this.formatTokenStatus(maskedInfo, useColors);
    parts.push(`Status: ${statusInfo}`);
    
    return parts.join(' | ');
  }
  
  /**
   * Format multiple token infos in a table format.
   */
  static formatTokenInfoTable(tokenInfos: MaskedTokenInfo[], useColors: boolean = true): string {
    if (tokenInfos.length === 0) {
      const noTokenColor = useColors ? Colors.DIM : '';
      const reset = useColors ? Colors.RESET : '';
      return `${noTokenColor}No OAuth tokens configured${reset}`;
    }
    
    const headers = ['Provider', 'Token', 'Type', 'Status', 'Expires', 'Refresh'];
    const rows = tokenInfos.map(info => [
      info.provider,
      info.maskedAccessToken || 'None',
      info.tokenType,
      this.getTokenStatusText(info, useColors),
      info.expiresAt ? this.formatTokenExpiration(info, useColors) : 'N/A',
      info.hasRefreshToken ? 'Yes' : 'No',
    ]);
    
    return AuthStatusDisplayFormatter['formatTable'](headers, rows, useColors);
  }
  
  /**
   * Get color for token status.
   */
  private static getTokenStatusColor(maskedInfo: MaskedTokenInfo, useColors: boolean): string {
    if (!useColors) return '';
    if (!maskedInfo.hasTokens) return Colors.DIM;
    if (maskedInfo.isExpired) return Colors.RED;
    if (maskedInfo.needsRefresh) return Colors.YELLOW;
    return Colors.GREEN;
  }
  
  /**
   * Format token expiration information.
   */
  private static formatTokenExpiration(maskedInfo: MaskedTokenInfo, useColors: boolean): string {
    if (!maskedInfo.expiresAt) return 'N/A';
    
    if (maskedInfo.isExpired) {
      const expiredColor = useColors ? Colors.RED : '';
      const reset = useColors ? Colors.RESET : '';
      return `${expiredColor}EXPIRED${reset}`;
    }
    
    const now = new Date();
    const timeUntilExpiration = maskedInfo.expiresAt.getTime() - now.getTime();
    const hoursUntilExpiration = Math.floor(timeUntilExpiration / (1000 * 60 * 60));
    const minutesUntilExpiration = Math.floor((timeUntilExpiration % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeString: string;
    if (hoursUntilExpiration > 0) {
      timeString = `${hoursUntilExpiration}h ${minutesUntilExpiration}m`;
    } else {
      timeString = `${minutesUntilExpiration}m`;
    }
    
    if (maskedInfo.needsRefresh) {
      const warningColor = useColors ? Colors.YELLOW : '';
      const reset = useColors ? Colors.RESET : '';
      return `${warningColor}${timeString} (refresh needed)${reset}`;
    }
    
    return timeString;
  }
  
  /**
   * Format token status information.
   */
  private static formatTokenStatus(maskedInfo: MaskedTokenInfo, useColors: boolean): string {
    const statusColor = this.getTokenStatusColor(maskedInfo, useColors);
    const reset = useColors ? Colors.RESET : '';
    
    if (!maskedInfo.hasTokens) {
      return `${statusColor}No Tokens${reset}`;
    }
    if (maskedInfo.isExpired) {
      return `${statusColor}Expired${reset}`;
    }
    if (maskedInfo.needsRefresh) {
      return `${statusColor}Needs Refresh${reset}`;
    }
    return `${statusColor}Valid${reset}`;
  }
  
  /**
   * Get token status text without formatting.
   */
  private static getTokenStatusText(maskedInfo: MaskedTokenInfo, useColors: boolean): string {
    return this.formatTokenStatus(maskedInfo, useColors);
  }
}

// =============================================================================
// CONFIGURATION DISPLAY
// =============================================================================

/**
 * Configuration display formatter with security considerations.
 */
export class ConfigDisplayFormatter {
  /**
   * Format OAuth configuration for display (excluding sensitive data).
   */
  static formatOAuthConfig(config: OAuthConfig, useColors: boolean = true): string {
    const titleColor = useColors ? Colors.BRIGHT : '';
    const labelColor = useColors ? Colors.CYAN : '';
    const reset = useColors ? Colors.RESET : '';
    
    const lines = [
      `${titleColor}OAuth Configuration: ${config.provider}${reset}`,
      `${labelColor}Client ID:${reset} ${this.maskSensitiveValue(config.clientId, 'clientId')}`,
      `${labelColor}Authorization Endpoint:${reset} ${config.authorizationEndpoint}`,
      `${labelColor}Token Endpoint:${reset} ${config.tokenEndpoint}`,
      `${labelColor}Scopes:${reset} ${config.scopes.join(', ')}`,
      `${labelColor}Redirect URI:${reset} ${config.redirectUri}`,
    ];
    
    if (config.additionalParams && Object.keys(config.additionalParams).length > 0) {
      const maskedParams = this.maskSensitiveObject(config.additionalParams);
      lines.push(`${labelColor}Additional Parameters:${reset} ${JSON.stringify(maskedParams, null, 2)}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Format provider configuration for display (excluding sensitive data).
   */
  static formatProviderConfig(config: ProviderConfig, useColors: boolean = true): string {
    const titleColor = useColors ? Colors.BRIGHT : '';
    const labelColor = useColors ? Colors.CYAN : '';
    const enabledColor = config.enabled ? (useColors ? Colors.GREEN : '') : (useColors ? Colors.RED : '');
    const reset = useColors ? Colors.RESET : '';
    
    const lines = [
      `${titleColor}Provider Configuration: ${config.name}${reset}`,
      `${labelColor}Enabled:${reset} ${enabledColor}${config.enabled ? 'Yes' : 'No'}${reset}`,
      `${labelColor}Priority:${reset} ${config.priority ?? 0}`,
    ];
    
    if (config.baseUrl) {
      lines.push(`${labelColor}Base URL:${reset} ${config.baseUrl}`);
    }
    
    if (config.oauth) {
      lines.push(`${labelColor}OAuth Enabled:${reset} ${config.oauth.enabled ? 'Yes' : 'No'}`);
      if (config.oauth.clientId) {
        lines.push(`${labelColor}OAuth Client ID:${reset} ${this.maskSensitiveValue(config.oauth.clientId, 'clientId')}`);
      }
      lines.push(`${labelColor}Preferred Method:${reset} ${config.oauth.preferredMethod}`);
      lines.push(`${labelColor}Auto Refresh:${reset} ${config.oauth.autoRefresh ? 'Yes' : 'No'}`);
    }
    
    if (config.rateLimit) {
      lines.push(`${labelColor}Rate Limits:${reset}`);
      if (config.rateLimit.requestsPerMinute) {
        lines.push(`  Requests/min: ${config.rateLimit.requestsPerMinute}`);
      }
      if (config.rateLimit.tokensPerMinute) {
        lines.push(`  Tokens/min: ${config.rateLimit.tokensPerMinute}`);
      }
      if (config.rateLimit.concurrentRequests) {
        lines.push(`  Concurrent: ${config.rateLimit.concurrentRequests}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Format multiple provider configurations in a summary table.
   */
  static formatProviderConfigSummary(configs: ProviderConfig[], useColors: boolean = true): string {
    if (configs.length === 0) {
      const noConfigColor = useColors ? Colors.DIM : '';
      const reset = useColors ? Colors.RESET : '';
      return `${noConfigColor}No providers configured${reset}`;
    }
    
    const headers = ['Provider', 'Enabled', 'Priority', 'OAuth', 'Method'];
    const rows = configs.map(config => [
      config.name,
      this.formatEnabledStatus(config.enabled ?? true, useColors),
      String(config.priority ?? 0),
      config.oauth?.enabled ? 'Yes' : 'No',
      config.oauth?.preferredMethod ?? 'api_key',
    ]);
    
    return AuthStatusDisplayFormatter['formatTable'](headers, rows, useColors);
  }
  
  /**
   * Mask sensitive values for display.
   */
  private static maskSensitiveValue(value: string, type: 'clientId' | 'token' | 'secret'): string {
    if (type === 'clientId') {
      // Show first 8 characters of client ID
      return value.length > 8 ? `${value.substring(0, 8)}...` : value;
    }
    if (type === 'token') {
      // Show first 8 characters of tokens
      return value.length > 8 ? `${value.substring(0, 8)}...` : '***';
    }
    if (type === 'secret') {
      // Never show secrets
      return '[REDACTED]';
    }
    return value;
  }
  
  /**
   * Mask sensitive data in configuration objects.
   */
  private static maskSensitiveObject(obj: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};
    const sensitiveKeys = ['secret', 'key', 'token', 'password', 'credential'];
    
    for (const [key, value] of Object.entries(obj)) {
      const isSensitive = sensitiveKeys.some(sensitiveKey => 
        key.toLowerCase().includes(sensitiveKey)
      );
      
      if (isSensitive) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = value;
      }
    }
    
    return masked;
  }
  
  /**
   * Format enabled status with colors.
   */
  private static formatEnabledStatus(enabled: boolean, useColors: boolean): string {
    const color = enabled ? (useColors ? Colors.GREEN : '') : (useColors ? Colors.RED : '');
    const reset = useColors ? Colors.RESET : '';
    return `${color}${enabled ? 'Yes' : 'No'}${reset}`;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Utility functions for display formatting.
 */
export class DisplayUtils {
  /**
   * Check if colors should be used based on environment.
   */
  static shouldUseColors(): boolean {
    // Check if running in a terminal that supports colors
    if (process.env['NO_COLOR'] || process.env['NODE_ENV'] === 'test') {
      return false;
    }
    
    // Check if stdout is a TTY
    return process.stdout.isTTY ?? false;
  }
  
  /**
   * Format a success message.
   */
  static formatSuccess(message: string, useColors: boolean = true): string {
    const successColor = useColors ? Colors.GREEN : '';
    const reset = useColors ? Colors.RESET : '';
    return `${successColor}✓ ${message}${reset}`;
  }
  
  /**
   * Format an error message.
   */
  static formatError(message: string, useColors: boolean = true): string {
    const errorColor = useColors ? Colors.RED : '';
    const reset = useColors ? Colors.RESET : '';
    return `${errorColor}✗ ${message}${reset}`;
  }
  
  /**
   * Format a warning message.
   */
  static formatWarning(message: string, useColors: boolean = true): string {
    const warningColor = useColors ? Colors.YELLOW : '';
    const reset = useColors ? Colors.RESET : '';
    return `${warningColor}⚠ ${message}${reset}`;
  }
  
  /**
   * Format an info message.
   */
  static formatInfo(message: string, useColors: boolean = true): string {
    const infoColor = useColors ? Colors.BLUE : '';
    const reset = useColors ? Colors.RESET : '';
    return `${infoColor}ℹ ${message}${reset}`;
  }
}