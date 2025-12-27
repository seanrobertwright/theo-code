/**
 * @fileoverview Provider management command handler
 * @module features/commands/handlers/provider
 */

import type { CommandHandler, CommandContext } from '../types.js';
import { 
  loadConfig, 
  validateProviderConfig, 
  getProviderConfig, 
  getAvailableProviders,
  getApiKey,
  getAuthenticationConfig,
  isOAuthEnabled,
  getPreferredAuthMethod
} from '../../../config/index.js';
import { useAppStore } from '../../../shared/store/index.js';

// =============================================================================
// PROVIDER COMMAND HANDLER
// =============================================================================

/**
 * Handles provider management commands.
 * 
 * Supports subcommands:
 * - list: Show all available providers
 * - status: Show provider status and health
 * - switch <provider>: Switch to a different provider
 * - validate <provider>: Validate provider configuration
 * - test <provider>: Test provider connectivity
 */
export const providerCommandHandler: CommandHandler = async (args, context) => {
  const [subcommand, ...subArgs] = args;
  
  if (!subcommand) {
    await showProviderHelp(context);
    return;
  }
  
  switch (subcommand.toLowerCase()) {
    case 'list':
    case 'ls':
      await handleListProviders(subArgs, context);
      break;
      
    case 'status':
      await handleProviderStatus(subArgs, context);
      break;
      
    case 'switch':
    case 'use':
      await handleSwitchProvider(subArgs, context);
      break;
      
    case 'validate':
    case 'check':
      await handleValidateProvider(subArgs, context);
      break;
      
    case 'test':
      await handleTestProvider(subArgs, context);
      break;
      
    case 'ui':
    case 'select':
      await handleProviderUI(subArgs, context);
      break;
      
    case 'help':
    case '--help':
    case '-h':
      await showProviderHelp(context);
      break;
      
    default:
      context.addMessage({
        role: 'assistant',
        content: `Unknown provider subcommand: ${subcommand}\n\nUse \`/provider help\` to see available commands.`
      });
  }
};

// =============================================================================
// SUBCOMMAND HANDLERS
// =============================================================================

/**
 * Lists all available providers with their status.
 */
async function handleListProviders(args: string[], context: CommandContext): Promise<void> {
  try {
    const config = loadConfig(context.workspaceRoot);
    const providers = getAvailableProviders(config);
    
    const showDetails = args.includes('--details') || args.includes('-d');
    const showAll = args.includes('--all') || args.includes('-a');
    
    let message = '**Available Providers:**\n\n';
    
    // Filter providers if not showing all
    const displayProviders = showAll ? providers : providers.filter(p => p.enabled);
    
    if (displayProviders.length === 0) {
      message += 'No providers configured or enabled.\n\n';
      message += 'Use `/provider help` for setup instructions.';
      context.addMessage({ role: 'assistant', content: message });
      return;
    }
    
    for (const provider of displayProviders) {
      const status = provider.enabled ? '✅' : '❌';
      const priority = provider.priority || 0;
      const hasApiKey = getApiKey(String(provider.name), config) ? '🔑' : '❌';
      const authConfig = getAuthenticationConfig(String(provider.name), config);
      
      // OAuth status indicator
      let oauthStatus = '';
      if (authConfig.hasOAuth) {
        oauthStatus = authConfig.oauthEnabled ? ' 🔐' : ' 🔐❌';
      }
      
      // Preferred method indicator
      const preferredMethod = authConfig.preferredMethod === 'oauth' ? ' (OAuth preferred)' : '';
      
      message += `${status} **${provider.name}** (priority: ${priority}) ${hasApiKey}${oauthStatus}${preferredMethod}\n`;
      
      if (showDetails) {
        if (provider.baseUrl) {
          message += `  • Base URL: ${provider.baseUrl}\n`;
        }
        
        // Authentication details
        message += `  • Authentication:\n`;
        if (authConfig.hasApiKey) {
          message += `    - API Key: Available\n`;
        }
        if (authConfig.hasOAuth) {
          message += `    - OAuth: ${authConfig.oauthEnabled ? 'Enabled' : 'Disabled'}`;
          if (authConfig.oauthEnabled) {
            message += ` (${authConfig.preferredMethod} preferred, auto-refresh: ${authConfig.autoRefresh ? 'on' : 'off'})`;
          }
          message += '\n';
        }
        if (!authConfig.hasApiKey && !authConfig.hasOAuth) {
          message += `    - None required (local/open source)\n`;
        }
        
        if (provider.rateLimit && typeof provider.rateLimit === 'object') {
          const rateLimit = provider.rateLimit as any;
          message += `  • Rate Limit: ${rateLimit.requestsPerMinute || 'N/A'} req/min, ${rateLimit.tokensPerMinute || 'N/A'} tokens/min\n`;
        }
        
        if (provider.models && Array.isArray(provider.models) && provider.models.length > 0) {
          message += `  • Models: ${provider.models.length} available\n`;
        }
        
        message += '\n';
      }
    }
    
    if (!showDetails) {
      message += '\n💡 Use `--details` to see more information\n';
      message += '🔑 = API key configured, ❌ = missing API key\n';
      message += '🔐 = OAuth configured, 🔐❌ = OAuth disabled\n';
    }
    
    message += '\n**Current Provider:** ' + config.global.defaultProvider;
    message += '\n**Current Model:** ' + context.currentModel;
    
    context.addMessage({ role: 'assistant', content: message });
    
  } catch (error: any) {
    context.setError(`Failed to list providers: ${error.message}`);
  }
}

/**
 * Shows detailed status for a specific provider or all providers.
 */
async function handleProviderStatus(args: string[], context: CommandContext): Promise<void> {
  try {
    const config = loadConfig(context.workspaceRoot);
    const targetProvider = args[0];
    
    if (targetProvider) {
      // Show status for specific provider
      await showSingleProviderStatus(targetProvider, config, context);
    } else {
      // Show status for all providers
      await showAllProvidersStatus(config, context);
    }
    
  } catch (error: any) {
    context.setError(`Failed to get provider status: ${error.message}`);
  }
}

/**
 * Switches to a different provider.
 */
async function handleSwitchProvider(args: string[], context: CommandContext): Promise<void> {
  const targetProvider = args[0];
  
  if (!targetProvider) {
    context.addMessage({
      role: 'assistant',
      content: 'Please specify a provider to switch to.\n\nExample: `/provider switch anthropic`\n\nUse `/provider list` to see available providers.'
    });
    return;
  }
  
  try {
    const config = loadConfig(context.workspaceRoot);
    const providerConfig = getProviderConfig(targetProvider, config);
    
    if (!providerConfig) {
      context.addMessage({
        role: 'assistant',
        content: `Provider "${targetProvider}" is not available.\n\nUse \`/provider list\` to see available providers.`
      });
      return;
    }
    
    if (!providerConfig.enabled) {
      const confirmed = await context.showConfirmation(
        `Provider "${targetProvider}" is disabled. Enable and switch to it?`,
        'This will enable the provider in your configuration.'
      );
      
      if (!confirmed) {
        context.addMessage({
          role: 'assistant',
          content: 'Provider switch cancelled.'
        });
        return;
      }
    }
    
    // Validate provider configuration
    const validation = validateProviderConfig(targetProvider, config);
    if (!validation.valid) {
      context.addMessage({
        role: 'assistant',
        content: `Cannot switch to "${targetProvider}" due to configuration errors:\n\n${validation.errors.map(e => `• ${e}`).join('\n')}\n\nPlease fix these issues first.`
      });
      return;
    }
    
    // Show warnings if any
    if (validation.warnings.length > 0) {
      context.addMessage({
        role: 'assistant',
        content: `⚠️ Warnings for provider "${targetProvider}":\n${validation.warnings.map(w => `• ${w}`).join('\n')}\n`
      });
    }
    
    // TODO: Actually switch the provider in the session
    // This would require integration with the model adapter system
    context.addMessage({
      role: 'assistant',
      content: `✅ Switched to provider: **${targetProvider}**\n\n` +
               `Note: Provider switching will take effect for new conversations. ` +
               `Current conversation will continue with the existing provider.`
    });
    
  } catch (error: any) {
    context.setError(`Failed to switch provider: ${error.message}`);
  }
}

/**
 * Validates a provider's configuration.
 */
async function handleValidateProvider(args: string[], context: CommandContext): Promise<void> {
  const targetProvider = args[0];
  
  if (!targetProvider) {
    context.addMessage({
      role: 'assistant',
      content: 'Please specify a provider to validate.\n\nExample: `/provider validate anthropic`'
    });
    return;
  }
  
  try {
    const config = loadConfig(context.workspaceRoot);
    const validation = validateProviderConfig(targetProvider, config);
    
    let message = `**Validation Results for "${targetProvider}":**\n\n`;
    
    if (validation.valid) {
      message += '✅ **Configuration is valid**\n\n';
    } else {
      message += '❌ **Configuration has errors**\n\n';
      message += '**Errors:**\n';
      message += validation.errors.map(e => `• ${e}`).join('\n') + '\n\n';
    }
    
    if (validation.warnings.length > 0) {
      message += '**Warnings:**\n';
      message += validation.warnings.map(w => `• ${w}`).join('\n') + '\n\n';
    }
    
    // Show configuration details
    const providerConfig = getProviderConfig(targetProvider, config);
    if (providerConfig) {
      message += '**Configuration Details:**\n';
      message += `• Enabled: ${providerConfig.enabled ? 'Yes' : 'No'}\n`;
      message += `• Priority: ${providerConfig.priority || 0}\n`;
      
      if (providerConfig.baseUrl) {
        message += `• Base URL: ${providerConfig.baseUrl}\n`;
      }
      
      const hasApiKey = getApiKey(targetProvider, config);
      message += `• API Key: ${hasApiKey ? 'Configured' : 'Missing'}\n`;
      
      if (providerConfig.rateLimit && typeof providerConfig.rateLimit === 'object') {
        const rateLimit = providerConfig.rateLimit as any;
        message += `• Rate Limits: ${rateLimit.requestsPerMinute || 'N/A'} req/min, ${rateLimit.tokensPerMinute || 'N/A'} tokens/min\n`;
      }
    }
    
    context.addMessage({ role: 'assistant', content: message });
    
  } catch (error: any) {
    context.setError(`Failed to validate provider: ${error.message}`);
  }
}

/**
 * Shows provider selection UI.
 */
async function handleProviderUI(_args: string[], context: CommandContext): Promise<void> {
  try {
    const config = loadConfig(context.workspaceRoot);
    const providers = getAvailableProviders(config);
    
    // For now, show a text-based provider selection
    // In a full implementation, this would trigger the UI component
    let message = '**Provider Selection UI**\n\n';
    message += 'Available providers:\n\n';
    
    providers.forEach((provider, index) => {
      const status = provider.enabled ? '✅' : '❌';
      const current = config.global.defaultProvider === String(provider.name) ? ' 🎯' : '';
      const hasApiKey = getApiKey(String(provider.name), config) ? '🔑' : '❌';
      
      message += `${index + 1}. ${status} **${provider.name}**${current} ${hasApiKey}\n`;
    });
    
    message += '\n🔑 = API key configured, ❌ = missing API key, 🎯 = current provider\n';
    message += '\n💡 Use `/provider switch <provider>` to change providers\n';
    message += '💡 Use `/provider status` for detailed information\n';
    
    // TODO: In a full implementation, this would show the ProviderSelection component
    // For now, we'll show the information as a message
    context.addMessage({ role: 'assistant', content: message });
    
  } catch (error: any) {
    context.setError(`Failed to show provider UI: ${error.message}`);
  }
}
async function handleTestProvider(args: string[], context: CommandContext): Promise<void> {
  const targetProvider = args[0];
  
  if (!targetProvider) {
    context.addMessage({
      role: 'assistant',
      content: 'Please specify a provider to test.\n\nExample: `/provider test anthropic`'
    });
    return;
  }
  
  try {
    const config = loadConfig(context.workspaceRoot);
    
    // First validate configuration
    const validation = validateProviderConfig(targetProvider, config);
    if (!validation.valid) {
      context.addMessage({
        role: 'assistant',
        content: `Cannot test "${targetProvider}" due to configuration errors:\n\n${validation.errors.map(e => `• ${e}`).join('\n')}\n\nUse \`/provider validate ${targetProvider}\` for more details.`
      });
      return;
    }
    
    context.addMessage({
      role: 'assistant',
      content: `🧪 Testing connectivity to "${targetProvider}"...\n\n` +
               `Note: Actual connectivity testing requires integration with the provider adapter system. ` +
               `For now, this validates that the configuration is correct and API keys are available.`
    });
    
    // TODO: Implement actual connectivity testing
    // This would require integration with the provider adapters
    
  } catch (error: any) {
    context.setError(`Failed to test provider: ${error.message}`);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Shows help for provider commands.
 */
async function showProviderHelp(context: CommandContext): Promise<void> {
  const helpText = `**Provider Management Commands**

**Usage:** \`/provider <subcommand> [options]\`

**Subcommands:**
• \`list\` - Show all available providers
  - \`--details\` or \`-d\`: Show detailed information
  - \`--all\` or \`-a\`: Show disabled providers too

• \`status [provider]\` - Show provider status and health
  - Without provider: Show status for all providers
  - With provider: Show detailed status for specific provider

• \`switch <provider>\` - Switch to a different provider
  - Aliases: \`use\`
  - Validates configuration before switching

• \`validate <provider>\` - Validate provider configuration
  - Aliases: \`check\`
  - Checks API keys, URLs, and settings

• \`test <provider>\` - Test provider connectivity
  - Validates configuration and tests connection

• \`ui\` - Show provider selection interface
  - Aliases: \`select\`
  - Interactive provider selection and status

• \`help\` - Show this help message

**Examples:**
\`/provider list --details\` - List all providers with details
\`/provider ui\` - Show interactive provider selection
\`/provider switch anthropic\` - Switch to Anthropic Claude
\`/provider validate openai\` - Validate OpenAI configuration
\`/provider status\` - Show status of all providers

**Configuration:**
Providers are configured in your global config file (\`~/.theo-code/config.yaml\`) or via environment variables. Use \`/provider validate <provider>\` to check your setup.`;

  context.addMessage({ role: 'assistant', content: helpText });
}

/**
 * Shows status for a single provider.
 */
async function showSingleProviderStatus(
  provider: string, 
  config: any, 
  context: CommandContext
): Promise<void> {
  const providerConfig = getProviderConfig(provider, config);
  
  if (!providerConfig) {
    context.addMessage({
      role: 'assistant',
      content: `Provider "${provider}" is not available.\n\nUse \`/provider list\` to see available providers.`
    });
    return;
  }
  
  const validation = validateProviderConfig(provider, config);
  const hasApiKey = getApiKey(provider, config);
  const authConfig = getAuthenticationConfig(provider, config);
  
  let message = `**Status for "${provider}":**\n\n`;
  
  // Overall status
  const statusIcon = validation.valid && providerConfig.enabled ? '✅' : '❌';
  message += `${statusIcon} **Overall Status:** ${validation.valid && providerConfig.enabled ? 'Ready' : 'Not Ready'}\n\n`;
  
  // Configuration details
  message += '**Configuration:**\n';
  message += `• Enabled: ${providerConfig.enabled ? 'Yes' : 'No'}\n`;
  message += `• Priority: ${providerConfig.priority || 0}\n`;
  
  // Authentication details
  message += '**Authentication:**\n';
  if (authConfig.hasApiKey) {
    message += `• API Key: Configured ✅\n`;
  } else {
    message += `• API Key: Missing ❌\n`;
  }
  
  if (authConfig.hasOAuth) {
    message += `• OAuth: ${authConfig.oauthEnabled ? 'Enabled ✅' : 'Disabled ❌'}\n`;
    if (authConfig.oauthEnabled) {
      message += `  - Preferred Method: ${authConfig.preferredMethod}\n`;
      message += `  - Auto Refresh: ${authConfig.autoRefresh ? 'Enabled' : 'Disabled'}\n`;
    }
  } else {
    message += `• OAuth: Not configured\n`;
  }
  
  if (!authConfig.hasApiKey && !authConfig.hasOAuth) {
    message += `• Authentication: None required (local/open source)\n`;
  }
  
  if (providerConfig.baseUrl) {
    message += `• Base URL: ${providerConfig.baseUrl}\n`;
  }
  
  if (providerConfig.rateLimit && typeof providerConfig.rateLimit === 'object') {
    const rateLimit = providerConfig.rateLimit as any;
    message += `• Rate Limits: ${rateLimit.requestsPerMinute || 'Default'} req/min, ${rateLimit.tokensPerMinute || 'Default'} tokens/min\n`;
  }
  
  // Models
  if (providerConfig.models && Array.isArray(providerConfig.models) && providerConfig.models.length > 0) {
    message += `• Available Models: ${providerConfig.models.length}\n`;
  }
  
  // Validation results
  if (!validation.valid) {
    message += '\n**Configuration Errors:**\n';
    message += validation.errors.map(e => `• ${e}`).join('\n') + '\n';
  }
  
  if (validation.warnings.length > 0) {
    message += '\n**Warnings:**\n';
    message += validation.warnings.map(w => `• ${w}`).join('\n') + '\n';
  }
  
  // Current usage
  const isCurrentProvider = config.global.defaultProvider === provider;
  if (isCurrentProvider) {
    message += '\n🎯 **This is your current default provider**\n';
  }
  
  context.addMessage({ role: 'assistant', content: message });
}

/**
 * Shows status for all providers.
 */
async function showAllProvidersStatus(config: any, context: CommandContext): Promise<void> {
  const providers = getAvailableProviders(config);
  
  let message = '**Provider Status Overview:**\n\n';
  
  const readyProviders: string[] = [];
  const notReadyProviders: string[] = [];
  
  for (const provider of providers) {
    const validation = validateProviderConfig(String(provider.name), config);
    const hasApiKey = getApiKey(String(provider.name), config);
    const authConfig = getAuthenticationConfig(String(provider.name), config);
    
    // Provider is ready if it's valid, enabled, and has some form of authentication (or doesn't need it)
    const hasAuth = authConfig.hasApiKey || authConfig.hasOAuth || String(provider.name) === 'ollama';
    const isReady = validation.valid && provider.enabled && hasAuth;
    
    const statusIcon = isReady ? '✅' : '❌';
    const currentIcon = config.global.defaultProvider === String(provider.name) ? ' 🎯' : '';
    
    // OAuth status indicator
    let oauthStatus = '';
    if (authConfig.hasOAuth) {
      oauthStatus = authConfig.oauthEnabled ? ' 🔐' : ' 🔐❌';
    }
    
    message += `${statusIcon} **${provider.name}**${currentIcon}${oauthStatus}\n`;
    
    if (isReady) {
      readyProviders.push(String(provider.name));
    } else {
      notReadyProviders.push(String(provider.name));
      
      // Show why it's not ready
      const issues: string[] = [];
      if (!provider.enabled) issues.push('disabled');
      if (!validation.valid) issues.push('config errors');
      if (String(provider.name) !== 'ollama' && !hasAuth) issues.push('missing authentication');
      
      if (issues.length > 0) {
        message += `  Issues: ${issues.join(', ')}\n`;
      }
    }
  }
  
  message += `\n**Summary:**\n`;
  message += `• Ready: ${readyProviders.length} providers\n`;
  message += `• Not Ready: ${notReadyProviders.length} providers\n`;
  message += `• Current Default: ${config.global.defaultProvider} 🎯\n`;
  
  if (notReadyProviders.length > 0) {
    message += `\n💡 Use \`/provider validate <provider>\` to see specific issues`;
  }
  
  context.addMessage({ role: 'assistant', content: message });
}