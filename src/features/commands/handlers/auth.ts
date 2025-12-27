/**
 * @fileoverview OAuth authentication command handler with enhanced feedback and error handling
 * @module features/commands/handlers/auth
 */

import type { CommandHandler, CommandContext } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';
import type { 
  IOAuthManager, 
  AuthenticationManager, 
  AuthMethod, 
  ProviderAuthStatus,
  OAuthError 
} from '../../auth/index.js';
import { logger } from '../../../shared/utils/index.js';

// =============================================================================
// PROGRESS INDICATORS AND FEEDBACK
// =============================================================================

/**
 * Progress indicator for OAuth flows.
 */
class OAuthProgressIndicator {
  private context: CommandContext;
  private provider: ModelProvider;
  private startTime: number;
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(context: CommandContext, provider: ModelProvider) {
    this.context = context;
    this.provider = provider;
    this.startTime = Date.now();
  }

  /**
   * Show initial progress message.
   */
  showInitialProgress(): void {
    this.context.addMessage({
      role: 'assistant',
      content: `🔐 **Starting OAuth Authentication**\n\n` +
               `Provider: \`${this.provider}\`\n` +
               `Status: Initializing OAuth flow...\n\n` +
               `📱 **Next Steps:**\n` +
               `1. Browser will open automatically\n` +
               `2. Complete authentication in browser\n` +
               `3. Return here for confirmation\n\n` +
               `⏱️ Timeout: 5 minutes\n` +
               `🔄 You can cancel anytime with Ctrl+C`
    });
  }

  /**
   * Show browser launch progress.
   */
  showBrowserLaunch(): void {
    this.context.addMessage({
      role: 'assistant',
      content: `🌐 **Browser Opening**\n\n` +
               `Opening your default browser for authentication...\n\n` +
               `**If browser doesn't open:**\n` +
               `• Check if popups are blocked\n` +
               `• Manually copy the URL from the browser\n` +
               `• Ensure you have a default browser set`
    });
  }

  /**
   * Show waiting for callback progress.
   */
  showWaitingForCallback(): void {
    this.context.addMessage({
      role: 'assistant',
      content: `⏳ **Waiting for Authentication**\n\n` +
               `Please complete the authentication in your browser.\n\n` +
               `**Current Status:**\n` +
               `• Browser authentication in progress\n` +
               `• Waiting for callback from ${this.provider}\n` +
               `• Time elapsed: ${this.getElapsedTime()}\n\n` +
               `**Troubleshooting:**\n` +
               `• Make sure you're logged into ${this.provider}\n` +
               `• Check for any error messages in the browser\n` +
               `• Ensure you clicked "Allow" or "Authorize"`
    });
  }

  /**
   * Show token exchange progress.
   */
  showTokenExchange(): void {
    this.context.addMessage({
      role: 'assistant',
      content: `🔄 **Processing Authentication**\n\n` +
               `Exchanging authorization code for access tokens...\n\n` +
               `This may take a few seconds.`
    });
  }

  /**
   * Start timeout warning.
   */
  startTimeoutWarning(): void {
    // Show warning after 3 minutes
    this.timeoutId = setTimeout(() => {
      this.context.addMessage({
        role: 'assistant',
        content: `⚠️ **Authentication Taking Longer Than Expected**\n\n` +
                 `Time elapsed: ${this.getElapsedTime()}\n` +
                 `Timeout in: ${this.getRemainingTime()}\n\n` +
                 `**If you're having trouble:**\n` +
                 `• Check the browser for error messages\n` +
                 `• Try refreshing the authentication page\n` +
                 `• Cancel and try again if needed`
      });
    }, 3 * 60 * 1000); // 3 minutes
  }

  /**
   * Clear timeout warning.
   */
  clearTimeoutWarning(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Get elapsed time string.
   */
  private getElapsedTime(): string {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get remaining time string.
   */
  private getRemainingTime(): string {
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, (5 * 60 * 1000) - elapsed); // 5 minutes total
    const minutes = Math.floor(remaining / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

/**
 * Enhanced error handler for OAuth operations.
 */
class OAuthErrorHandler {
  /**
   * Handle and format OAuth errors with user-friendly messages.
   */
  static handleOAuthError(error: any, provider: ModelProvider, operation: string): string {
    logger.error(`[AuthCommand] ${operation} failed for ${provider}:`, error);

    // Handle specific OAuth error types
    if (this.isOAuthError(error)) {
      return this.formatOAuthError(error, provider, operation);
    }

    // Handle network errors
    if (this.isNetworkError(error)) {
      return this.formatNetworkError(error, provider, operation);
    }

    // Handle timeout errors
    if (this.isTimeoutError(error)) {
      return this.formatTimeoutError(error, provider, operation);
    }

    // Handle configuration errors
    if (this.isConfigurationError(error)) {
      return this.formatConfigurationError(error, provider, operation);
    }

    // Handle token errors
    if (this.isTokenError(error)) {
      return this.formatTokenError(error, provider, operation);
    }

    // Generic error fallback
    return this.formatGenericError(error, provider, operation);
  }

  /**
   * Check if error is an OAuth-specific error.
   */
  private static isOAuthError(error: any): boolean {
    return error && (
      error.code?.includes('oauth') ||
      error.message?.includes('oauth') ||
      error.error_description ||
      error.error
    );
  }

  /**
   * Check if error is a network-related error.
   */
  private static isNetworkError(error: any): boolean {
    return error && (
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('network') ||
      error.message?.includes('connection')
    );
  }

  /**
   * Check if error is a timeout error.
   */
  private static isTimeoutError(error: any): boolean {
    return error && (
      error.code === 'TIMEOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('timed out')
    );
  }

  /**
   * Check if error is a configuration error.
   */
  private static isConfigurationError(error: any): boolean {
    return error && (
      error.message?.includes('client_id') ||
      error.message?.includes('configuration') ||
      error.message?.includes('not supported') ||
      error.message?.includes('invalid_client')
    );
  }

  /**
   * Check if error is a token-related error.
   */
  private static isTokenError(error: any): boolean {
    return error && (
      error.message?.includes('token') ||
      error.message?.includes('expired') ||
      error.message?.includes('invalid_grant') ||
      error.error === 'invalid_grant'
    );
  }

  /**
   * Format OAuth-specific errors.
   */
  private static formatOAuthError(error: any, provider: ModelProvider, operation: string): string {
    const errorCode = error.error || error.code || 'unknown_error';
    const errorDescription = error.error_description || error.message || 'Unknown OAuth error';

    let message = `❌ **OAuth ${operation} Failed**\n\n`;
    message += `Provider: \`${provider}\`\n`;
    message += `Error: ${errorCode}\n`;
    message += `Details: ${errorDescription}\n\n`;

    // Add specific guidance based on error type
    switch (errorCode) {
      case 'access_denied':
        message += `**What happened:** You denied authorization in the browser.\n\n`;
        message += `**To fix:** Run \`/auth login ${provider}\` again and click "Allow" or "Authorize".`;
        break;
      
      case 'invalid_client':
        message += `**What happened:** OAuth client configuration is invalid.\n\n`;
        message += `**To fix:** This is a configuration issue. Please contact support.`;
        break;
      
      case 'invalid_grant':
        message += `**What happened:** The authorization code or refresh token is invalid or expired.\n\n`;
        message += `**To fix:** Try logging in again with \`/auth login ${provider}\`.`;
        break;
      
      case 'invalid_scope':
        message += `**What happened:** The requested permissions are not available.\n\n`;
        message += `**To fix:** This is a configuration issue. Please contact support.`;
        break;
      
      default:
        message += `**To fix:** Try the following steps:\n`;
        message += `1. Wait a moment and try again\n`;
        message += `2. Check your internet connection\n`;
        message += `3. Try \`/auth logout ${provider}\` then \`/auth login ${provider}\``;
    }

    return message;
  }

  /**
   * Format network errors.
   */
  private static formatNetworkError(error: any, provider: ModelProvider, operation: string): string {
    return `❌ **Network Error**\n\n` +
           `Failed to connect to ${provider} during ${operation}.\n\n` +
           `**Possible causes:**\n` +
           `• No internet connection\n` +
           `• ${provider} services are temporarily unavailable\n` +
           `• Firewall or proxy blocking the connection\n\n` +
           `**To fix:**\n` +
           `1. Check your internet connection\n` +
           `2. Try again in a few minutes\n` +
           `3. Check if ${provider} is experiencing outages\n` +
           `4. Contact your network administrator if behind a corporate firewall`;
  }

  /**
   * Format timeout errors.
   */
  private static formatTimeoutError(error: any, provider: ModelProvider, operation: string): string {
    return `⏱️ **Authentication Timeout**\n\n` +
           `The ${operation} process timed out after 5 minutes.\n\n` +
           `**What happened:**\n` +
           `• You may have taken too long to complete browser authentication\n` +
           `• Network connection may be slow\n` +
           `• ${provider} may be experiencing delays\n\n` +
           `**To fix:**\n` +
           `1. Try \`/auth login ${provider}\` again\n` +
           `2. Complete the browser authentication more quickly\n` +
           `3. Check your internet connection speed\n` +
           `4. Try again during off-peak hours`;
  }

  /**
   * Format configuration errors.
   */
  private static formatConfigurationError(error: any, provider: ModelProvider, operation: string): string {
    return `⚙️ **Configuration Error**\n\n` +
           `OAuth is not properly configured for ${provider}.\n\n` +
           `**Error details:** ${error.message}\n\n` +
           `**This is likely a setup issue:**\n` +
           `• OAuth client ID may be missing or invalid\n` +
           `• Provider endpoints may be incorrect\n` +
           `• OAuth may not be enabled for this provider\n\n` +
           `**To fix:**\n` +
           `1. Check if ${provider} supports OAuth in this version\n` +
           `2. Verify your configuration settings\n` +
           `3. Contact support if the issue persists\n` +
           `4. Use API key authentication as an alternative: check provider documentation`;
  }

  /**
   * Format token errors.
   */
  private static formatTokenError(error: any, provider: ModelProvider, operation: string): string {
    return `🔑 **Token Error**\n\n` +
           `There was an issue with your authentication tokens for ${provider}.\n\n` +
           `**Error details:** ${error.message}\n\n` +
           `**Common causes:**\n` +
           `• Tokens have expired\n` +
           `• Refresh token is no longer valid\n` +
           `• Account permissions have changed\n` +
           `• Provider has revoked access\n\n` +
           `**To fix:**\n` +
           `1. Log out and log back in: \`/auth logout ${provider}\` then \`/auth login ${provider}\`\n` +
           `2. Check your account status with ${provider}\n` +
           `3. Ensure your account has the necessary permissions\n` +
           `4. Contact ${provider} support if issues persist`;
  }

  /**
   * Format generic errors.
   */
  private static formatGenericError(error: any, provider: ModelProvider, operation: string): string {
    const errorMessage = error.message || error.toString() || 'Unknown error';
    
    return `❌ **${operation} Failed**\n\n` +
           `An unexpected error occurred while ${operation.toLowerCase()} with ${provider}.\n\n` +
           `**Error details:** ${errorMessage}\n\n` +
           `**General troubleshooting:**\n` +
           `1. Wait a moment and try again\n` +
           `2. Check your internet connection\n` +
           `3. Restart the application if issues persist\n` +
           `4. Check \`/auth status\` for current authentication state\n\n` +
           `**If the problem continues:**\n` +
           `• Try using API key authentication instead\n` +
           `• Contact support with the error details above\n` +
           `• Check the application logs for more information`;
  }
}

// =============================================================================
// SUCCESS MESSAGE FORMATTER
// =============================================================================

/**
 * Formats success messages with helpful information.
 */
class SuccessMessageFormatter {
  /**
   * Format successful login message.
   */
  static formatLoginSuccess(provider: ModelProvider, tokens: any): string {
    const expiresIn = tokens?.expiresAt ? 
      Math.round((tokens.expiresAt.getTime() - Date.now()) / (1000 * 60)) : 
      null;
    
    let message = `✅ **Authentication Successful!**\n\n`;
    message += `🎉 Successfully authenticated with \`${provider}\` via OAuth\n\n`;
    
    message += `**What's enabled:**\n`;
    message += `🔑 Secure access to ${provider} models\n`;
    message += `🔄 Automatic token refresh\n`;
    message += `🔒 Tokens stored securely in system keychain\n`;
    
    if (expiresIn) {
      message += `🕒 Current token expires in ${expiresIn} minutes\n`;
    }
    
    message += `\n**Next steps:**\n`;
    message += `• Start using ${provider} models in your conversations\n`;
    message += `• Check \`/auth status\` to monitor authentication\n`;
    message += `• Tokens will refresh automatically when needed\n\n`;
    
    message += `💡 **Tip:** Use \`/provider switch ${provider}\` to make this your default provider.`;
    
    return message;
  }

  /**
   * Format successful logout message.
   */
  static formatLogoutSuccess(provider: ModelProvider): string {
    return `✅ **Logout Successful**\n\n` +
           `Successfully logged out from \`${provider}\`.\n\n` +
           `**What was cleared:**\n` +
           `🔒 OAuth tokens revoked with ${provider}\n` +
           `💾 Local credentials removed from keychain\n` +
           `🚫 API access disabled for ${provider}\n\n` +
           `**To use ${provider} again:**\n` +
           `• Run \`/auth login ${provider}\` for OAuth authentication\n` +
           `• Or configure API key authentication\n` +
           `• Check \`/auth list\` for available options`;
  }

  /**
   * Format successful refresh message.
   */
  static formatRefreshSuccess(provider: ModelProvider, tokens: any): string {
    const expiresIn = Math.round((tokens.expiresAt.getTime() - Date.now()) / (1000 * 60));
    
    return `✅ **Tokens Refreshed Successfully**\n\n` +
           `OAuth tokens for \`${provider}\` have been updated.\n\n` +
           `**Token status:**\n` +
           `🔑 New access token obtained\n` +
           `🕒 Expires in ${expiresIn} minutes\n` +
           `🔄 Automatic refresh will continue\n` +
           `✨ Authentication is now up to date\n\n` +
           `Your ${provider} models are ready to use!`;
  }
}

// =============================================================================
// AUTH COMMAND HANDLER
// =============================================================================

/**
 * Handles OAuth authentication commands.
 * 
 * Supports subcommands:
 * - login <provider>: Initiate OAuth flow for provider
 * - logout <provider>: Revoke tokens and clear authentication
 * - status: Show authentication status for all providers
 * - refresh <provider>: Manually refresh tokens for provider
 * - list: Show available authentication methods for each provider
 */
export const authCommandHandler: CommandHandler = async (args, context) => {
  const [subcommand, ...subArgs] = args;
  
  if (!subcommand) {
    await showAuthHelp(context);
    return;
  }
  
  switch (subcommand.toLowerCase()) {
    case 'login':
      await handleAuthLogin(subArgs, context);
      break;
      
    case 'logout':
      await handleAuthLogout(subArgs, context);
      break;
      
    case 'status':
      await handleAuthStatus(subArgs, context);
      break;
      
    case 'refresh':
      await handleAuthRefresh(subArgs, context);
      break;
      
    case 'list':
      await handleAuthList(subArgs, context);
      break;
      
    case 'help':
    case '--help':
    case '-h':
      await showAuthHelp(context);
      break;
      
    default:
      context.addMessage({
        role: 'assistant',
        content: `❌ **Unknown Auth Command**\n\nUnknown subcommand: \`${subcommand}\`\n\nUse \`/auth help\` to see available commands.`
      });
  }
};

// =============================================================================
// SUBCOMMAND HANDLERS
// =============================================================================

/**
 * Handles /auth login <provider> command.
 */
async function handleAuthLogin(args: string[], context: CommandContext): Promise<void> {
  const { addMessage, setError } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Provider**\n\nUsage: \`/auth login <provider>\`\n\nExample: \`/auth login google\`\n\nUse \`/auth list\` to see available providers.`
    });
    return;
  }
  
  const provider = args[0] as ModelProvider;
  let progressIndicator: OAuthProgressIndicator | null = null;
  
  try {
    // Get OAuth manager and authentication manager from context
    const oauthManager = authContextHelpers.getOAuthManager(context);
    const authManager = authContextHelpers.getAuthenticationManager(context);
    
    if (!oauthManager || !authManager) {
      throw new Error('OAuth services not available. Please ensure OAuth is properly configured.');
    }
    
    // Check if provider supports OAuth
    if (!oauthManager.supportsOAuth(provider)) {
      const supportedProviders = oauthManager.getSupportedProviders();
      addMessage({
        role: 'assistant',
        content: `❌ **OAuth Not Supported**\n\n` +
                 `Provider \`${provider}\` does not support OAuth authentication.\n\n` +
                 `**OAuth-supported providers:**\n` +
                 `${supportedProviders.map(p => `• ${p}`).join('\n')}\n\n` +
                 `**Alternative:** Check if ${provider} supports API key authentication.\n` +
                 `Use \`/auth list\` to see all available authentication methods.`
      });
      return;
    }
    
    // Check current authentication status
    const status = await authManager.getProviderAuthStatus(provider);
    if (status.authenticated && status.currentMethod === 'oauth') {
      const expiresIn = status.expiresAt ? 
        Math.round((status.expiresAt.getTime() - Date.now()) / (1000 * 60)) : 
        null;
      
      const needsRefreshWarning = status.needsRefresh ? 
        `\n⚠️ **Note:** Your token will expire soon. Consider running \`/auth refresh ${provider}\`.` : '';
      
      addMessage({
        role: 'assistant',
        content: `✅ **Already Authenticated**\n\n` +
                 `You are already logged in to \`${provider}\` via OAuth.\n\n` +
                 `**Current status:**\n` +
                 `🔑 OAuth authentication active\n` +
                 `${expiresIn ? `🕒 Token expires in ${expiresIn} minutes\n` : ''}` +
                 `🔄 Automatic refresh enabled\n` +
                 `${needsRefreshWarning}\n\n` +
                 `**Options:**\n` +
                 `• Continue using your current authentication\n` +
                 `• Use \`/auth logout ${provider}\` to log out first if you want to re-authenticate\n` +
                 `• Use \`/auth refresh ${provider}\` to refresh expiring tokens`
      });
      return;
    }
    
    // Initialize progress indicator
    progressIndicator = new OAuthProgressIndicator(context, provider);
    progressIndicator.showInitialProgress();
    progressIndicator.startTimeoutWarning();
    
    // Initiate OAuth flow with progress updates
    logger.info(`[AuthCommand] Starting OAuth login for provider: ${provider}`);
    
    // Show browser launch progress
    progressIndicator.showBrowserLaunch();
    
    // Show waiting for callback
    setTimeout(() => {
      if (progressIndicator) {
        progressIndicator.showWaitingForCallback();
      }
    }, 2000);
    
    // Show token exchange progress (this would be triggered by the actual OAuth flow)
    setTimeout(() => {
      if (progressIndicator) {
        progressIndicator.showTokenExchange();
      }
    }, 10000);
    
    const result = await oauthManager.initiateFlow(provider);
    
    // Clear progress indicator
    if (progressIndicator) {
      progressIndicator.clearTimeoutWarning();
    }
    
    if (result.success && result.tokens) {
      // Show success message with helpful information
      const successMessage = SuccessMessageFormatter.formatLoginSuccess(provider, result.tokens);
      addMessage({
        role: 'assistant',
        content: successMessage
      });
    } else {
      // Handle OAuth flow failure with detailed error information
      const errorMessage = OAuthErrorHandler.handleOAuthError(
        new Error(result.error || 'OAuth flow failed'), 
        provider, 
        'Authentication'
      );
      addMessage({
        role: 'assistant',
        content: errorMessage
      });
    }
    
  } catch (error: any) {
    // Clear progress indicator on error
    if (progressIndicator) {
      progressIndicator.clearTimeoutWarning();
    }
    
    logger.error(`[AuthCommand] Login failed for provider ${provider}:`, error);
    setError(`Authentication failed: ${error.message}`);
    
    // Use enhanced error handling
    const errorMessage = OAuthErrorHandler.handleOAuthError(error, provider, 'Authentication');
    addMessage({
      role: 'assistant',
      content: errorMessage
    });
  }
}

/**
 * Handles /auth logout <provider> command.
 */
async function handleAuthLogout(args: string[], context: CommandContext): Promise<void> {
  const { addMessage, setError, showConfirmation } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Provider**\n\nUsage: \`/auth logout <provider>\`\n\nExample: \`/auth logout google\`\n\nUse \`/auth status\` to see authenticated providers.`
    });
    return;
  }
  
  const provider = args[0] as ModelProvider;
  
  try {
    const oauthManager = authContextHelpers.getOAuthManager(context);
    const authManager = authContextHelpers.getAuthenticationManager(context);
    
    if (!oauthManager || !authManager) {
      throw new Error('OAuth services not available. Please ensure OAuth is properly configured.');
    }
    
    // Check current authentication status
    const status = await authManager.getProviderAuthStatus(provider);
    if (!status.authenticated) {
      addMessage({
        role: 'assistant',
        content: `ℹ️ **Not Authenticated**\n\n` +
                 `You are not currently authenticated with \`${provider}\`.\n\n` +
                 `**Current status:** No active authentication\n` +
                 `**Available options:** Use \`/auth login ${provider}\` to authenticate\n\n` +
                 `Use \`/auth status\` to see your authentication status for all providers.`
      });
      return;
    }
    
    // Show detailed confirmation for OAuth logout
    if (status.currentMethod === 'oauth') {
      const expiresInfo = status.expiresAt ? 
        `\n• Token expires: ${status.expiresAt.toLocaleString()}` : '';
      
      const confirmed = await showConfirmation(
        `Log out from ${provider}?`,
        `This will revoke your OAuth authentication and clear all stored tokens.\n\n` +
        `**What will happen:**\n` +
        `• OAuth tokens will be revoked with ${provider}\n` +
        `• Local credentials will be removed from keychain\n` +
        `• You'll need to re-authenticate to use ${provider} models${expiresInfo}\n\n` +
        `**Note:** Your conversation history will not be affected.`
      );
      
      if (!confirmed) {
        addMessage({
          role: 'assistant',
          content: '⏹️ **Logout Cancelled**\n\nYour authentication with ' + provider + ' remains active.'
        });
        return;
      }
    }
    
    // Show progress message for logout
    addMessage({
      role: 'assistant',
      content: `🔄 **Logging Out**\n\nRevoking authentication with \`${provider}\`...\n\n` +
               `This may take a moment.`
    });
    
    // Perform logout
    logger.info(`[AuthCommand] Logging out from provider: ${provider}`);
    
    if (status.currentMethod === 'oauth') {
      await oauthManager.revokeTokens(provider);
    } else {
      await authManager.clearAuthentication(provider);
    }
    
    // Show success message with helpful information
    const successMessage = SuccessMessageFormatter.formatLogoutSuccess(provider);
    addMessage({
      role: 'assistant',
      content: successMessage
    });
    
  } catch (error: any) {
    logger.error(`[AuthCommand] Logout failed for provider ${provider}:`, error);
    setError(`Logout failed: ${error.message}`);
    
    // Use enhanced error handling
    const errorMessage = OAuthErrorHandler.handleOAuthError(error, provider, 'Logout');
    addMessage({
      role: 'assistant',
      content: errorMessage + 
               `\n\n**Note:** The logout may have been partially completed. ` +
               `Use \`/auth status\` to check your current authentication state.`
    });
  }
}

/**
 * Handles /auth status command.
 */
async function handleAuthStatus(args: string[], context: CommandContext): Promise<void> {
  const { addMessage, setError } = context;
  
  try {
    const oauthManager = authContextHelpers.getOAuthManager(context);
    const authManager = authContextHelpers.getAuthenticationManager(context);
    
    if (!oauthManager || !authManager) {
      throw new Error('OAuth services not available');
    }
    
    // Get status for all providers
    const allStatus = await authManager.getAllProviderAuthStatus();
    
    if (allStatus.length === 0) {
      addMessage({
        role: 'assistant',
        content: `📊 **Authentication Status**\n\nNo providers are configured for authentication.\n\n` +
                 `Use \`/auth list\` to see available providers.`
      });
      return;
    }
    
    // Format status display
    let message = `📊 **Authentication Status**\n\n`;
    
    const authenticatedProviders = allStatus.filter(s => s.authenticated);
    const unauthenticatedProviders = allStatus.filter(s => !s.authenticated);
    
    if (authenticatedProviders.length > 0) {
      message += `**✅ Authenticated Providers:**\n`;
      for (const status of authenticatedProviders) {
        const methodIcon = status.currentMethod === 'oauth' ? '🔐' : '🔑';
        const expiresInfo = status.expiresAt ? 
          ` (expires ${formatTimeUntilExpiration(status.expiresAt)})` : '';
        const refreshInfo = status.needsRefresh ? ' ⚠️ needs refresh' : '';
        
        message += `${methodIcon} **${status.provider}** - ${status.currentMethod}${expiresInfo}${refreshInfo}\n`;
      }
      message += '\n';
    }
    
    if (unauthenticatedProviders.length > 0) {
      message += `**❌ Not Authenticated:**\n`;
      for (const status of unauthenticatedProviders) {
        const availableMethods = getAvailableMethodsDisplay(status);
        message += `• **${status.provider}** - ${availableMethods}\n`;
      }
      message += '\n';
    }
    
    // Add helpful tips
    message += `**💡 Tips:**\n`;
    message += `• Use \`/auth login <provider>\` to authenticate\n`;
    message += `• Use \`/auth refresh <provider>\` to refresh expiring tokens\n`;
    message += `• Use \`/auth list\` to see all available authentication methods`;
    
    addMessage({
      role: 'assistant',
      content: message
    });
    
  } catch (error: any) {
    logger.error('[AuthCommand] Failed to get authentication status:', error);
    setError(`Failed to get status: ${error.message}`);
    
    addMessage({
      role: 'assistant',
      content: `❌ **Status Error**\n\nFailed to retrieve authentication status:\n\n${error.message}`
    });
  }
}

/**
 * Handles /auth refresh <provider> command.
 */
async function handleAuthRefresh(args: string[], context: CommandContext): Promise<void> {
  const { addMessage, setError } = context;
  
  if (args.length === 0) {
    addMessage({
      role: 'assistant',
      content: `❌ **Missing Provider**\n\nUsage: \`/auth refresh <provider>\`\n\nExample: \`/auth refresh google\`\n\nUse \`/auth status\` to see providers that need refresh.`
    });
    return;
  }
  
  const provider = args[0] as ModelProvider;
  
  try {
    const oauthManager = authContextHelpers.getOAuthManager(context);
    const authManager = authContextHelpers.getAuthenticationManager(context);
    
    if (!oauthManager || !authManager) {
      throw new Error('OAuth services not available. Please ensure OAuth is properly configured.');
    }
    
    // Check current authentication status
    const status = await authManager.getProviderAuthStatus(provider);
    
    if (!status.authenticated) {
      addMessage({
        role: 'assistant',
        content: `❌ **Not Authenticated**\n\n` +
                 `You are not currently authenticated with \`${provider}\`.\n\n` +
                 `**To get started:**\n` +
                 `1. Use \`/auth login ${provider}\` to authenticate\n` +
                 `2. Then use \`/auth refresh ${provider}\` if needed\n\n` +
                 `**Note:** You can only refresh tokens for OAuth authentication.`
      });
      return;
    }
    
    if (status.currentMethod !== 'oauth') {
      addMessage({
        role: 'assistant',
        content: `ℹ️ **API Key Authentication**\n\n` +
                 `Provider \`${provider}\` is using API key authentication.\n\n` +
                 `**About API keys:**\n` +
                 `• API keys don't expire like OAuth tokens\n` +
                 `• No refresh is needed for API key authentication\n` +
                 `• Your authentication is always valid as long as the key is correct\n\n` +
                 `**If you want OAuth instead:**\n` +
                 `Use \`/auth login ${provider}\` to switch to OAuth authentication.`
      });
      return;
    }
    
    // Check if refresh is actually needed
    if (!status.needsRefresh && status.expiresAt) {
      const expiresIn = Math.round((status.expiresAt.getTime() - Date.now()) / (1000 * 60));
      
      if (expiresIn > 30) { // More than 30 minutes left
        addMessage({
          role: 'assistant',
          content: `✅ **Tokens Still Valid**\n\n` +
                   `Your OAuth tokens for \`${provider}\` are still valid.\n\n` +
                   `**Current status:**\n` +
                   `🔑 OAuth authentication active\n` +
                   `🕒 Token expires in ${expiresIn} minutes\n` +
                   `🔄 Automatic refresh will happen when needed\n\n` +
                   `**Note:** Tokens are automatically refreshed when they're about to expire. ` +
                   `Manual refresh is only needed if you're experiencing authentication issues.`
        });
        return;
      }
    }
    
    // Show progress message for refresh
    addMessage({
      role: 'assistant',
      content: `🔄 **Refreshing OAuth Tokens**\n\n` +
               `Updating authentication tokens for \`${provider}\`...\n\n` +
               `**What's happening:**\n` +
               `• Contacting ${provider} token endpoint\n` +
               `• Exchanging refresh token for new access token\n` +
               `• Updating secure storage\n\n` +
               `This usually takes just a few seconds.`
    });
    
    // Refresh tokens
    logger.info(`[AuthCommand] Refreshing tokens for provider: ${provider}`);
    const tokens = await oauthManager.refreshTokens(provider);
    
    // Show success message with helpful information
    const successMessage = SuccessMessageFormatter.formatRefreshSuccess(provider, tokens);
    addMessage({
      role: 'assistant',
      content: successMessage
    });
    
  } catch (error: any) {
    logger.error(`[AuthCommand] Token refresh failed for provider ${provider}:`, error);
    setError(`Token refresh failed: ${error.message}`);
    
    // Use enhanced error handling with specific refresh guidance
    let errorMessage = OAuthErrorHandler.handleOAuthError(error, provider, 'Token Refresh');
    
    // Add specific refresh troubleshooting
    errorMessage += `\n\n**Refresh-specific troubleshooting:**\n`;
    errorMessage += `• Your refresh token may have expired (typically after 30-90 days)\n`;
    errorMessage += `• Try logging out and back in: \`/auth logout ${provider}\` then \`/auth login ${provider}\`\n`;
    errorMessage += `• Check if your account permissions have changed\n`;
    errorMessage += `• Verify your internet connection and try again`;
    
    addMessage({
      role: 'assistant',
      content: errorMessage
    });
  }
}

/**
 * Handles /auth list command.
 */
async function handleAuthList(args: string[], context: CommandContext): Promise<void> {
  const { addMessage, setError } = context;
  
  try {
    const oauthManager = authContextHelpers.getOAuthManager(context);
    const authManager = authContextHelpers.getAuthenticationManager(context);
    
    if (!oauthManager || !authManager) {
      throw new Error('OAuth services not available');
    }
    
    // Get supported OAuth providers
    const oauthProviders = oauthManager.getSupportedProviders();
    const allStatus = await authManager.getAllProviderAuthStatus();
    
    let message = `📋 **Available Authentication Methods**\n\n`;
    
    if (oauthProviders.length > 0) {
      message += `**🔐 OAuth Supported Providers:**\n`;
      for (const provider of oauthProviders) {
        const status = allStatus.find(s => s.provider === provider);
        const authStatus = status?.authenticated ? '✅' : '❌';
        const fallbackInfo = status?.fallbackAvailable ? ' (API key fallback available)' : '';
        
        message += `${authStatus} **${provider}** - OAuth 2.0${fallbackInfo}\n`;
      }
      message += '\n';
    }
    
    // Show providers with API key authentication
    const apiKeyProviders = allStatus.filter(s => 
      s.hasApiKey && !oauthProviders.includes(s.provider)
    );
    
    if (apiKeyProviders.length > 0) {
      message += `**🔑 API Key Only Providers:**\n`;
      for (const status of apiKeyProviders) {
        const authStatus = status.authenticated ? '✅' : '❌';
        message += `${authStatus} **${status.provider}** - API Key\n`;
      }
      message += '\n';
    }
    
    // Show providers without authentication
    const noAuthProviders = allStatus.filter(s => 
      !s.hasApiKey && !oauthProviders.includes(s.provider)
    );
    
    if (noAuthProviders.length > 0) {
      message += `**⚪ No Authentication Required:**\n`;
      for (const status of noAuthProviders) {
        message += `• **${status.provider}** - Local/Open source\n`;
      }
      message += '\n';
    }
    
    // Add usage instructions
    message += `**💡 Usage:**\n`;
    message += `• \`/auth login <provider>\` - Start OAuth authentication\n`;
    message += `• \`/auth status\` - Check current authentication status\n`;
    message += `• \`/auth logout <provider>\` - Revoke authentication\n\n`;
    
    message += `**🔐 OAuth Benefits:**\n`;
    message += `• More secure than API keys\n`;
    message += `• Automatic token refresh\n`;
    message += `• Granular permissions\n`;
    message += `• Easy revocation`;
    
    addMessage({
      role: 'assistant',
      content: message
    });
    
  } catch (error: any) {
    logger.error('[AuthCommand] Failed to list authentication methods:', error);
    setError(`Failed to list methods: ${error.message}`);
    
    addMessage({
      role: 'assistant',
      content: `❌ **List Error**\n\nFailed to retrieve authentication methods:\n\n${error.message}`
    });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Shows help for auth commands.
 */
async function showAuthHelp(context: CommandContext): Promise<void> {
  const helpText = `🔐 **OAuth Authentication Commands**

**Usage:** \`/auth <subcommand> [options]\`

**Subcommands:**

• \`login <provider>\` - Start OAuth authentication flow
  - Opens browser for secure authentication
  - Stores tokens securely in system keychain
  - Example: \`/auth login google\`

• \`logout <provider>\` - Revoke authentication and clear tokens
  - Revokes tokens with the provider
  - Clears local storage
  - Example: \`/auth logout anthropic\`

• \`status\` - Show authentication status for all providers
  - Displays current authentication method
  - Shows token expiration times
  - Indicates which tokens need refresh

• \`refresh <provider>\` - Manually refresh OAuth tokens
  - Updates expired or expiring tokens
  - Only works with OAuth authentication
  - Example: \`/auth refresh openai\`

• \`list\` - Show available authentication methods
  - Lists OAuth-supported providers
  - Shows API key authentication options
  - Displays current authentication status

• \`help\` - Show this help message

**Examples:**
\`/auth login google\` - Authenticate with Google via OAuth
\`/auth status\` - Check authentication status for all providers
\`/auth refresh anthropic\` - Refresh Anthropic OAuth tokens
\`/auth logout openai\` - Log out from OpenAI

**OAuth Benefits:**
• 🔒 More secure than API keys
• 🔄 Automatic token refresh
• 🎯 Granular permissions
• 🚫 Easy revocation
• 🔐 System keychain storage

**Troubleshooting:**
• Make sure your browser allows popups
• Check internet connection for OAuth flows
• Use \`/auth status\` to diagnose issues
• Try logout/login if refresh fails`;

  context.addMessage({ role: 'assistant', content: helpText });
}

/**
 * Helper functions for extracting managers from context.
 */
export const authContextHelpers = {
  /**
   * Get OAuth manager from context.
   * Note: In a real implementation, this would be properly injected.
   */
  getOAuthManager(context: CommandContext): IOAuthManager | null {
    // TODO: Implement proper dependency injection
    // For now, return null to indicate service not available
    return null;
  },

  /**
   * Get authentication manager from context.
   * Note: In a real implementation, this would be properly injected.
   */
  getAuthenticationManager(context: CommandContext): AuthenticationManager | null {
    // TODO: Implement proper dependency injection
    // For now, return null to indicate service not available
    return null;
  }
};

/**
 * Format time until token expiration.
 */
function formatTimeUntilExpiration(expiresAt: Date): string {
  const now = Date.now();
  const expiresAtMs = expiresAt.getTime();
  const diffMs = expiresAtMs - now;
  
  if (diffMs <= 0) {
    return 'expired';
  }
  
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 60) {
    return `in ${diffMinutes} minutes`;
  } else if (diffHours < 24) {
    return `in ${diffHours} hours`;
  } else {
    return `in ${diffDays} days`;
  }
}

/**
 * Get display text for available authentication methods.
 */
function getAvailableMethodsDisplay(status: ProviderAuthStatus): string {
  const methods: string[] = [];
  
  if (status.oauthStatus) {
    methods.push('OAuth');
  }
  
  if (status.hasApiKey) {
    methods.push('API Key');
  }
  
  if (methods.length === 0) {
    return 'No authentication required';
  }
  
  return methods.join(', ') + ' available';
}