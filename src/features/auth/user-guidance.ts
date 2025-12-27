/**
 * @fileoverview OAuth User Guidance System
 * @module features/auth/user-guidance
 */

import type { ModelProvider } from '../../shared/types/models.js';
import type { OAuthError } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Guidance category types.
 */
export type GuidanceCategory = 
  | 'setup'
  | 'authentication'
  | 'troubleshooting'
  | 'configuration'
  | 'security'
  | 'maintenance';

/**
 * Guidance severity levels.
 */
export type GuidanceSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * User guidance item.
 */
export interface GuidanceItem {
  /** Unique identifier for this guidance */
  id: string;
  
  /** Category of guidance */
  category: GuidanceCategory;
  
  /** Severity level */
  severity: GuidanceSeverity;
  
  /** Title of the guidance */
  title: string;
  
  /** Detailed description */
  description: string;
  
  /** Step-by-step instructions */
  steps: string[];
  
  /** Additional tips or notes */
  tips?: string[];
  
  /** Related commands or actions */
  relatedCommands?: string[];
  
  /** Links to external resources */
  externalLinks?: Array<{
    title: string;
    url: string;
    description?: string;
  }>;
  
  /** Conditions when this guidance applies */
  conditions?: string[];
}

/**
 * Provider-specific guidance configuration.
 */
export interface ProviderGuidanceConfig {
  /** Provider name */
  provider: ModelProvider;
  
  /** OAuth setup instructions */
  setupInstructions: GuidanceItem[];
  
  /** Common troubleshooting guides */
  troubleshooting: GuidanceItem[];
  
  /** Provider-specific tips */
  providerTips: GuidanceItem[];
  
  /** Known issues and workarounds */
  knownIssues: GuidanceItem[];
}

// =============================================================================
// OAUTH USER GUIDANCE MANAGER
// =============================================================================

/**
 * Provides contextual user guidance for OAuth operations.
 */
export class OAuthUserGuidanceManager {
  private readonly guidanceDatabase = new Map<string, GuidanceItem>();
  private readonly providerConfigs = new Map<ModelProvider, ProviderGuidanceConfig>();

  constructor() {
    this.initializeGuidanceDatabase();
    this.initializeProviderConfigs();
  }

  // =============================================================================
  // GUIDANCE RETRIEVAL
  // =============================================================================

  /**
   * Get guidance for a specific error.
   */
  getErrorGuidance(error: any, provider: ModelProvider, operation: string): GuidanceItem[] {
    const errorType = this.classifyError(error);
    const guidance: GuidanceItem[] = [];

    // Get error-specific guidance
    const errorGuidance = this.getGuidanceByCondition(`error:${errorType}`);
    guidance.push(...errorGuidance);

    // Get provider-specific guidance
    const providerGuidance = this.getProviderGuidance(provider, 'troubleshooting');
    guidance.push(...providerGuidance.filter(g => 
      g.conditions?.some(c => c.includes(errorType)) || 
      g.description.toLowerCase().includes(errorType.toLowerCase())
    ));

    // Get operation-specific guidance
    const operationGuidance = this.getGuidanceByCondition(`operation:${operation}`);
    guidance.push(...operationGuidance);

    return this.deduplicateGuidance(guidance);
  }

  /**
   * Get setup guidance for a provider.
   */
  getSetupGuidance(provider: ModelProvider): GuidanceItem[] {
    const providerConfig = this.providerConfigs.get(provider);
    if (!providerConfig) {
      return this.getGenericSetupGuidance();
    }

    return providerConfig.setupInstructions;
  }

  /**
   * Get troubleshooting guidance for a provider.
   */
  getTroubleshootingGuidance(provider: ModelProvider): GuidanceItem[] {
    const providerConfig = this.providerConfigs.get(provider);
    if (!providerConfig) {
      return this.getGenericTroubleshootingGuidance();
    }

    return providerConfig.troubleshooting;
  }

  /**
   * Get guidance by category.
   */
  getGuidanceByCategory(category: GuidanceCategory): GuidanceItem[] {
    return Array.from(this.guidanceDatabase.values())
      .filter(item => item.category === category)
      .sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  /**
   * Get guidance by condition.
   */
  getGuidanceByCondition(condition: string): GuidanceItem[] {
    return Array.from(this.guidanceDatabase.values())
      .filter(item => item.conditions?.includes(condition));
  }

  /**
   * Search guidance by keywords.
   */
  searchGuidance(keywords: string[]): GuidanceItem[] {
    const searchTerms = keywords.map(k => k.toLowerCase());
    
    return Array.from(this.guidanceDatabase.values())
      .filter(item => {
        const searchText = [
          item.title,
          item.description,
          ...item.steps,
          ...(item.tips || []),
        ].join(' ').toLowerCase();
        
        return searchTerms.some(term => searchText.includes(term));
      })
      .sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  // =============================================================================
  // PROVIDER-SPECIFIC GUIDANCE
  // =============================================================================

  /**
   * Get provider-specific guidance.
   */
  private getProviderGuidance(provider: ModelProvider, type: keyof ProviderGuidanceConfig): GuidanceItem[] {
    const config = this.providerConfigs.get(provider);
    if (!config) return [];

    switch (type) {
      case 'setupInstructions':
        return config.setupInstructions;
      case 'troubleshooting':
        return config.troubleshooting;
      case 'providerTips':
        return config.providerTips;
      case 'knownIssues':
        return config.knownIssues;
      default:
        return [];
    }
  }

  // =============================================================================
  // FORMATTING UTILITIES
  // =============================================================================

  /**
   * Format guidance as markdown text.
   */
  formatGuidanceAsMarkdown(guidance: GuidanceItem[]): string {
    if (guidance.length === 0) {
      return 'No specific guidance available for this issue.';
    }

    let markdown = '';

    for (const item of guidance) {
      const severityIcon = this.getSeverityIcon(item.severity);
      
      markdown += `## ${severityIcon} ${item.title}\n\n`;
      markdown += `${item.description}\n\n`;

      if (item.steps.length > 0) {
        markdown += `**Steps to resolve:**\n\n`;
        item.steps.forEach((step, index) => {
          markdown += `${index + 1}. ${step}\n`;
        });
        markdown += '\n';
      }

      if (item.tips && item.tips.length > 0) {
        markdown += `**💡 Tips:**\n\n`;
        item.tips.forEach(tip => {
          markdown += `• ${tip}\n`;
        });
        markdown += '\n';
      }

      if (item.relatedCommands && item.relatedCommands.length > 0) {
        markdown += `**Related commands:**\n\n`;
        item.relatedCommands.forEach(command => {
          markdown += `• \`${command}\`\n`;
        });
        markdown += '\n';
      }

      if (item.externalLinks && item.externalLinks.length > 0) {
        markdown += `**Additional resources:**\n\n`;
        item.externalLinks.forEach(link => {
          markdown += `• [${link.title}](${link.url})`;
          if (link.description) {
            markdown += ` - ${link.description}`;
          }
          markdown += '\n';
        });
        markdown += '\n';
      }

      markdown += '---\n\n';
    }

    return markdown.trim();
  }

  /**
   * Format guidance as plain text.
   */
  formatGuidanceAsText(guidance: GuidanceItem[]): string {
    if (guidance.length === 0) {
      return 'No specific guidance available for this issue.';
    }

    let text = '';

    for (const item of guidance) {
      text += `${item.title.toUpperCase()}\n`;
      text += '='.repeat(item.title.length) + '\n\n';
      text += `${item.description}\n\n`;

      if (item.steps.length > 0) {
        text += `Steps to resolve:\n`;
        item.steps.forEach((step, index) => {
          text += `  ${index + 1}. ${step}\n`;
        });
        text += '\n';
      }

      if (item.tips && item.tips.length > 0) {
        text += `Tips:\n`;
        item.tips.forEach(tip => {
          text += `  • ${tip}\n`;
        });
        text += '\n';
      }

      if (item.relatedCommands && item.relatedCommands.length > 0) {
        text += `Related commands:\n`;
        item.relatedCommands.forEach(command => {
          text += `  • ${command}\n`;
        });
        text += '\n';
      }

      text += '\n';
    }

    return text.trim();
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Classify error for guidance lookup.
   */
  private classifyError(error: any): string {
    if (!error) return 'unknown';

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';
    const errorType = error.error?.toLowerCase() || '';

    if (errorType === 'access_denied' || message.includes('access_denied')) {
      return 'access_denied';
    }
    if (errorType === 'invalid_grant' || message.includes('invalid_grant')) {
      return 'invalid_grant';
    }
    if (message.includes('network') || code.includes('enotfound')) {
      return 'network_error';
    }
    if (message.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('browser')) {
      return 'browser_error';
    }
    if (message.includes('configuration') || message.includes('client_id')) {
      return 'configuration_error';
    }

    return 'unknown';
  }

  /**
   * Get severity weight for sorting.
   */
  private getSeverityWeight(severity: GuidanceSeverity): number {
    switch (severity) {
      case 'critical': return 4;
      case 'error': return 3;
      case 'warning': return 2;
      case 'info': return 1;
      default: return 0;
    }
  }

  /**
   * Get severity icon.
   */
  private getSeverityIcon(severity: GuidanceSeverity): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📝';
    }
  }

  /**
   * Remove duplicate guidance items.
   */
  private deduplicateGuidance(guidance: GuidanceItem[]): GuidanceItem[] {
    const seen = new Set<string>();
    return guidance.filter(item => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  // =============================================================================
  // GUIDANCE DATABASE INITIALIZATION
  // =============================================================================

  /**
   * Initialize the guidance database with common issues and solutions.
   */
  private initializeGuidanceDatabase(): void {
    // Access Denied Error
    this.guidanceDatabase.set('access_denied', {
      id: 'access_denied',
      category: 'troubleshooting',
      severity: 'error',
      title: 'Access Denied During OAuth',
      description: 'The OAuth provider denied access during authentication. This usually happens when you click "Deny" or "Cancel" in the browser.',
      steps: [
        'Try the authentication process again',
        'Make sure to click "Allow" or "Authorize" when prompted',
        'Check that you\'re logged into the correct account',
        'Verify your account has the necessary permissions',
      ],
      tips: [
        'Some providers require specific account types or permissions',
        'Corporate accounts may have additional restrictions',
        'Check if your account is in good standing with the provider',
      ],
      relatedCommands: ['/auth login <provider>', '/auth status'],
      conditions: ['error:access_denied'],
    });

    // Network Error
    this.guidanceDatabase.set('network_error', {
      id: 'network_error',
      category: 'troubleshooting',
      severity: 'warning',
      title: 'Network Connection Issues',
      description: 'Unable to connect to the OAuth provider. This could be due to internet connectivity or firewall issues.',
      steps: [
        'Check your internet connection',
        'Try accessing the provider\'s website in your browser',
        'Check if you\'re behind a corporate firewall or proxy',
        'Wait a few minutes and try again',
        'Contact your network administrator if behind a corporate network',
      ],
      tips: [
        'Some corporate networks block OAuth flows',
        'VPN connections can sometimes cause issues',
        'Try using a different network if possible',
      ],
      relatedCommands: ['/auth login <provider>', '/provider status'],
      conditions: ['error:network_error'],
    });

    // Browser Issues
    this.guidanceDatabase.set('browser_error', {
      id: 'browser_error',
      category: 'troubleshooting',
      severity: 'warning',
      title: 'Browser Launch or Display Issues',
      description: 'Problems opening or using the browser for OAuth authentication.',
      steps: [
        'Make sure you have a default browser set',
        'Check if popup blockers are preventing the browser from opening',
        'Try manually copying the OAuth URL if the browser doesn\'t open',
        'Clear your browser cache and cookies for the provider',
        'Try using a different browser',
      ],
      tips: [
        'Incognito/private browsing mode can help with cookie issues',
        'Some browsers have strict security settings that block OAuth',
        'Mobile browsers may have different behavior',
      ],
      relatedCommands: ['/auth login <provider>'],
      conditions: ['error:browser_error'],
    });

    // Configuration Error
    this.guidanceDatabase.set('configuration_error', {
      id: 'configuration_error',
      category: 'configuration',
      severity: 'error',
      title: 'OAuth Configuration Issues',
      description: 'There are problems with the OAuth configuration for this provider.',
      steps: [
        'Check if OAuth is properly configured for this provider',
        'Verify the client ID and endpoints are correct',
        'Ensure the provider supports OAuth in this version',
        'Contact support if configuration issues persist',
      ],
      tips: [
        'Not all providers support OAuth yet',
        'Configuration is usually handled automatically',
        'API key authentication may be available as an alternative',
      ],
      relatedCommands: ['/provider validate <provider>', '/auth list'],
      conditions: ['error:configuration_error'],
    });

    // Token Issues
    this.guidanceDatabase.set('token_issues', {
      id: 'token_issues',
      category: 'troubleshooting',
      severity: 'warning',
      title: 'Token Expiration or Invalid Tokens',
      description: 'Issues with OAuth tokens being expired, invalid, or corrupted.',
      steps: [
        'Try refreshing your tokens',
        'If refresh fails, log out and log back in',
        'Check if your account permissions have changed',
        'Verify your account is still active with the provider',
      ],
      tips: [
        'Tokens automatically refresh in most cases',
        'Manual refresh is only needed for troubleshooting',
        'Logging out clears all stored tokens',
      ],
      relatedCommands: ['/auth refresh <provider>', '/auth logout <provider>', '/auth login <provider>'],
      conditions: ['error:invalid_grant', 'error:token_expired'],
    });

    // General Setup
    this.guidanceDatabase.set('general_setup', {
      id: 'general_setup',
      category: 'setup',
      severity: 'info',
      title: 'OAuth Authentication Setup',
      description: 'How to set up and use OAuth authentication with AI providers.',
      steps: [
        'Check which providers support OAuth with `/auth list`',
        'Start OAuth authentication with `/auth login <provider>`',
        'Complete the authentication in your browser',
        'Check your authentication status with `/auth status`',
      ],
      tips: [
        'OAuth is more secure than API keys',
        'Tokens refresh automatically',
        'You can use both OAuth and API keys for the same provider',
      ],
      relatedCommands: ['/auth list', '/auth login <provider>', '/auth status'],
      conditions: ['operation:setup'],
    });
  }

  /**
   * Initialize provider-specific configurations.
   */
  private initializeProviderConfigs(): void {
    // Google OAuth Configuration
    this.providerConfigs.set('google', {
      provider: 'google',
      setupInstructions: [
        {
          id: 'google_setup',
          category: 'setup',
          severity: 'info',
          title: 'Google OAuth Setup',
          description: 'Set up OAuth authentication with Google for Gemini models.',
          steps: [
            'Run `/auth login google` to start OAuth flow',
            'Sign in with your Google account in the browser',
            'Grant permissions for Generative AI API access',
            'Return to the application for confirmation',
          ],
          tips: [
            'You need a Google account with Generative AI API access',
            'Some Google Workspace accounts may have restrictions',
            'Personal Google accounts usually work without issues',
          ],
          relatedCommands: ['/auth login google', '/auth status'],
          externalLinks: [
            {
              title: 'Google AI Studio',
              url: 'https://aistudio.google.com/',
              description: 'Manage your Google AI API access',
            },
          ],
        },
      ],
      troubleshooting: [
        {
          id: 'google_workspace_issues',
          category: 'troubleshooting',
          severity: 'warning',
          title: 'Google Workspace Account Issues',
          description: 'Problems with Google Workspace or organizational accounts.',
          steps: [
            'Check if your organization allows external API access',
            'Try using a personal Google account instead',
            'Contact your Google Workspace administrator',
            'Use API key authentication as an alternative',
          ],
          tips: [
            'Google Workspace admins can restrict API access',
            'Personal accounts usually have fewer restrictions',
            'API keys may work when OAuth doesn\'t',
          ],
          relatedCommands: ['/auth login google', '/provider validate google'],
        },
      ],
      providerTips: [],
      knownIssues: [],
    });

    // OpenRouter OAuth Configuration
    this.providerConfigs.set('openrouter', {
      provider: 'openrouter',
      setupInstructions: [
        {
          id: 'openrouter_setup',
          category: 'setup',
          severity: 'info',
          title: 'OpenRouter OAuth Setup',
          description: 'Set up OAuth authentication with OpenRouter for access to multiple models.',
          steps: [
            'Run `/auth login openrouter` to start OAuth flow',
            'Sign in with your OpenRouter account',
            'Authorize the application for API access',
            'Confirm successful authentication',
          ],
          tips: [
            'OpenRouter provides access to many different models',
            'OAuth may generate credits or API keys automatically',
            'Check your OpenRouter dashboard for usage and billing',
          ],
          relatedCommands: ['/auth login openrouter', '/auth status'],
          externalLinks: [
            {
              title: 'OpenRouter Dashboard',
              url: 'https://openrouter.ai/keys',
              description: 'Manage your OpenRouter API keys and usage',
            },
          ],
        },
      ],
      troubleshooting: [],
      providerTips: [],
      knownIssues: [],
    });
  }

  /**
   * Get generic setup guidance.
   */
  private getGenericSetupGuidance(): GuidanceItem[] {
    return [this.guidanceDatabase.get('general_setup')!].filter(Boolean);
  }

  /**
   * Get generic troubleshooting guidance.
   */
  private getGenericTroubleshootingGuidance(): GuidanceItem[] {
    return [
      this.guidanceDatabase.get('access_denied')!,
      this.guidanceDatabase.get('network_error')!,
      this.guidanceDatabase.get('browser_error')!,
      this.guidanceDatabase.get('token_issues')!,
    ].filter(Boolean);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new OAuth user guidance manager.
 */
export function createOAuthUserGuidanceManager(): OAuthUserGuidanceManager {
  return new OAuthUserGuidanceManager();
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

/**
 * Global user guidance manager instance.
 */
export const globalUserGuidanceManager = new OAuthUserGuidanceManager();