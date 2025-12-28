/**
 * @fileoverview Configuration loader with file discovery and merging
 * @module config/loader
 *
 * Configuration is loaded from multiple sources with the following precedence:
 * 1. Environment variables (highest)
 * 2. Project config (.agentrc)
 * 3. Global config (~/.theo-code/config.yaml)
 * 4. Default values (lowest)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYaml } from 'yaml';
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  SecurityPolicySchema,
  MergedConfigSchema,
  ProviderConfigSchema,
  MultiProviderConfigSchema,
  OAuthSerializationSettingsSchema,
  type GlobalConfig,
  type ProjectConfig,
  type SecurityPolicy,
  type MergedConfig,
  type ProviderConfig,
  type MultiProviderConfig,
  type OAuthSerializationSettings,
} from './schemas.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIG_DIR_NAME = '.theo-code';
const GLOBAL_CONFIG_FILE = 'config.yaml';
const PROJECT_CONFIG_FILE = '.agentrc';
const AGENTS_FILE = 'AGENTS.md';
const POLICY_FILE = '.agent-policy.yaml';

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Gets the global configuration directory path.
 *
 * @returns Absolute path to global config directory
 */
export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * Gets the global configuration file path.
 *
 * @returns Absolute path to global config file
 */
export function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), GLOBAL_CONFIG_FILE);
}

/**
 * Gets the sessions directory path.
 *
 * @returns Absolute path to sessions directory
 */
export function getSessionsDir(): string {
  // Use local session_data directory in the current working directory
  return path.join(process.cwd(), 'session_data');
}

// =============================================================================
// FILE READING
// =============================================================================

/**
 * Safely reads a file and returns its contents, or undefined if not found.
 *
 * @param filePath - Path to the file
 * @returns File contents or undefined
 */
function safeReadFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Safely parses YAML content.
 *
 * @param content - YAML string to parse
 * @returns Parsed object or empty object on error
 */
function safeParseYaml(content: string | undefined): unknown {
  if (content === undefined) {
    return {};
  }
  try {
    const parsed: unknown = parseYaml(content);
    // Ensure we return an object, not a primitive
    if (parsed === null || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

// =============================================================================
// CONFIG LOADING
// =============================================================================

/**
 * Loads the global configuration.
 *
 * @returns Validated global configuration
 */
export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();
  const content = safeReadFile(configPath);
  const parsed = safeParseYaml(content);
  return GlobalConfigSchema.parse(parsed);
}

/**
 * Loads project configuration from a directory.
 *
 * @param workspaceRoot - Root directory to search for .agentrc
 * @returns Validated project configuration or undefined
 */
export function loadProjectConfig(workspaceRoot: string): ProjectConfig | undefined {
  const configPath = path.join(workspaceRoot, PROJECT_CONFIG_FILE);
  const content = safeReadFile(configPath);

  if (content === undefined) {
    return undefined;
  }

  const parsed = safeParseYaml(content);
  return ProjectConfigSchema.parse(parsed);
}

/**
 * Loads AGENTS.md instructions.
 *
 * @param workspaceRoot - Root directory to search for AGENTS.md
 * @returns AGENTS.md content or undefined
 */
export function loadAgentsInstructions(workspaceRoot: string): string | undefined {
  const agentsPath = path.join(workspaceRoot, AGENTS_FILE);
  return safeReadFile(agentsPath);
}

/**
 * Loads security policy.
 *
 * @param workspaceRoot - Root directory to search for .agent-policy.yaml
 * @returns Validated security policy
 */
export function loadSecurityPolicy(workspaceRoot: string): SecurityPolicy {
  // Check project-level policy first
  const projectPolicyPath = path.join(workspaceRoot, POLICY_FILE);
  let content = safeReadFile(projectPolicyPath);

  // Fall back to global policy
  if (content === undefined) {
    const globalPolicyPath = path.join(getGlobalConfigDir(), POLICY_FILE);
    content = safeReadFile(globalPolicyPath);
  }

  const parsed = safeParseYaml(content);
  return SecurityPolicySchema.parse(parsed);
}

// =============================================================================
// ENVIRONMENT VARIABLES
// =============================================================================

/**
 * Gets API key from environment variable.
 *
 * @param provider - The provider name
 * @returns API key or undefined
 */
export function getApiKeyFromEnv(provider: string): string | undefined {
  const envVarMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    gemini: 'GOOGLE_API_KEY', // Alias for Google
    openrouter: 'OPENROUTER_API_KEY',
    cohere: 'COHERE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    together: 'TOGETHER_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    ollama: 'OLLAMA_API_KEY', // Optional for Ollama
  };

  const envVar = envVarMap[provider];
  if (envVar === undefined) {
    return undefined;
  }

  return process.env[envVar];
}

/**
 * Gets model override from environment.
 *
 * @returns Model identifier or undefined
 */
export function getModelFromEnv(): string | undefined {
  return process.env['THEO_CODE_MODEL'];
}

/**
 * Checks if safe mode is enabled via environment.
 *
 * @returns True if safe mode is enabled
 */
export function isSafeModeEnabled(): boolean {
  return process.env['THEO_CODE_SAFE_MODE'] === 'true';
}

// =============================================================================
// MERGED CONFIG
// =============================================================================

/**
 * Loads and merges all configuration sources.
 *
 * @param workspaceRoot - Root directory of the current project
 * @returns Fully merged and validated configuration
 *
 * @example
 * ```typescript
 * const config = loadConfig('/path/to/project');
 * console.warn(config.global.defaultModel);
 * ```
 */
export function loadConfig(workspaceRoot: string): MergedConfig {
  const global = loadGlobalConfig();
  const project = loadProjectConfig(workspaceRoot);
  const policy = loadSecurityPolicy(workspaceRoot);
  const agentsInstructions = loadAgentsInstructions(workspaceRoot);

  // Apply environment overrides
  const envModel = getModelFromEnv();
  if (envModel !== undefined) {
    global.defaultModel = envModel;
  }

  // Apply safe mode
  if (isSafeModeEnabled()) {
    policy.autoApproveWrite = false;
    policy.autoApproveRead = false;
  }

  const merged = {
    global,
    project,
    policy,
    agentsInstructions,
  };

  return MergedConfigSchema.parse(merged);
}

// =============================================================================
// PROVIDER CONFIGURATION UTILITIES
// =============================================================================

/**
 * Validates provider configuration.
 *
 * @param provider - Provider name
 * @param config - Merged configuration
 * @returns Validation result with details
 */
export function validateProviderConfig(provider: string, config: MergedConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if provider is supported
  const supportedProviders = ['openai', 'anthropic', 'google', 'openrouter', 'cohere', 'mistral', 'together', 'perplexity', 'ollama'];
  if (!supportedProviders.includes(provider)) {
    errors.push(`Unsupported provider: ${provider}`);
    return { valid: false, errors, warnings };
  }

  // Check provider-specific configuration
  const providers = config.global.providers?.providers;
  let providerConfig: any = undefined;
  if (providers && Array.isArray(providers)) {
    providerConfig = providers.find((p: any) => p.name === provider);
  }

  // Check if provider is disabled
  const isDisabled = providerConfig && providerConfig.enabled === false;
  if (isDisabled) {
    warnings.push(`Provider ${provider} is disabled in configuration`);
  }

  // Validate base URL if provided
  if (providerConfig && providerConfig.baseUrl) {
    try {
      new URL(providerConfig.baseUrl);
    } catch {
      errors.push(`Invalid base URL for provider ${provider}`);
    }
  }

  // Validate rate limits
  if (providerConfig && providerConfig.rateLimit) {
    if (providerConfig.rateLimit.requestsPerMinute !== undefined && providerConfig.rateLimit.requestsPerMinute <= 0) {
      errors.push(`Invalid requests per minute for provider ${provider}`);
    }
    if (providerConfig.rateLimit.tokensPerMinute !== undefined && providerConfig.rateLimit.tokensPerMinute <= 0) {
      errors.push(`Invalid tokens per minute for provider ${provider}`);
    }
  }

  // Check API key availability (not required for Ollama or disabled providers)
  if (provider !== 'ollama' && !isDisabled) {
    const apiKey = getApiKey(provider, config);
    if (!apiKey) {
      errors.push(`No API key found for provider ${provider}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Gets effective provider configuration with fallbacks.
 *
 * @param provider - Provider name
 * @param config - Merged configuration
 * @returns Effective provider configuration
 */
export function getProviderConfig(provider: string, config: MergedConfig): ProviderConfig | undefined {
  // Find provider in configuration
  const providers = config.global.providers?.providers;
  let providerConfig: ProviderConfig | undefined;
  
  if (providers && Array.isArray(providers)) {
    providerConfig = providers.find((p: any) => p.name === provider);
  }
  
  if (!providerConfig) {
    // Return default configuration for known providers
    const supportedProviders = ['openai', 'anthropic', 'google', 'openrouter', 'cohere', 'mistral', 'together', 'perplexity', 'ollama'];
    if (supportedProviders.includes(provider)) {
      return {
        name: provider as any,
        enabled: true,
        priority: 0,
      };
    }
    return undefined;
  }

  // Apply project-level overrides if available
  const projectOverrides = config.project?.providerOverrides;
  if (projectOverrides && typeof projectOverrides === 'object') {
    const override = (projectOverrides as any)[provider];
    if (override) {
      return {
        ...providerConfig,
        enabled: override.enabled ?? providerConfig.enabled,
        priority: override.priority ?? providerConfig.priority,
        rateLimit: override.rateLimit ?? providerConfig.rateLimit,
        providerConfig: providerConfig.providerConfig ? {
          ...providerConfig.providerConfig,
          ...override.providerConfig,
        } : override.providerConfig,
      };
    }
  }

  return providerConfig;
}

/**
 * Gets all available providers with their configurations.
 *
 * @param config - Merged configuration
 * @returns Array of provider configurations
 */
export function getAvailableProviders(config: MergedConfig): ProviderConfig[] {
  const providers = config.global.providers?.providers;
  const configuredProviders = (providers && Array.isArray(providers)) ? providers as ProviderConfig[] : [];
  const supportedProviders = ['openai', 'anthropic', 'google', 'openrouter', 'cohere', 'mistral', 'together', 'perplexity', 'ollama'];
  
  // Ensure all supported providers have at least default configuration
  const allProviders = new Map<string, ProviderConfig>();
  
  // Add configured providers
  for (const provider of configuredProviders) {
    if (provider && typeof provider === 'object' && 'name' in provider) {
      allProviders.set(String(provider.name), provider);
    }
  }
  
  // Add default configurations for unconfigured providers
  for (const provider of supportedProviders) {
    if (!allProviders.has(provider)) {
      allProviders.set(provider, {
        name: provider as any,
        enabled: true,
        priority: 0,
      });
    }
  }
  
  return Array.from(allProviders.values()).sort((a, b) => {
    const aPriority = typeof a.priority === 'number' ? a.priority : 0;
    const bPriority = typeof b.priority === 'number' ? b.priority : 0;
    return bPriority - aPriority;
  });
}

// =============================================================================
// CONFIG INITIALIZATION
// =============================================================================

/**
 * Ensures the global config directory exists.
 */
export function ensureConfigDir(): void {
  const configDir = getGlobalConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
}

/**
 * Creates a default global config file if it doesn't exist.
 *
 * @returns True if file was created, false if it already existed
 */
export function createDefaultConfig(): boolean {
  ensureConfigDir();
  const configPath = getGlobalConfigPath();

  if (fs.existsSync(configPath)) {
    return false;
  }

  const defaultConfig = `# theo-code global configuration
# See documentation for all available options

defaultProvider: openai
defaultModel: gpt-4o

# API keys can also be set via environment variables:
# OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, etc.
# apiKeys:
#   openai: sk-...
#   anthropic: sk-ant-...

# Multi-provider configuration
providers:
  # Default fallback chain (optional)
  # fallbackChain: [openai, anthropic, google]
  
  # Auto-switch on provider failures
  autoSwitchOnFailure: true
  maxFallbackAttempts: 3
  
  # Health check interval (5 minutes)
  healthCheckInterval: 300000
  
  # Default rate limits for all providers
  defaultRateLimit:
    requestsPerMinute: 60
    tokensPerMinute: 100000
    concurrentRequests: 5
  
  # Individual provider configurations
  providers:
    - name: openai
      enabled: true
      priority: 100
      # apiKey: sk-...  # Or set OPENAI_API_KEY
      
    - name: anthropic
      enabled: true
      priority: 90
      # apiKey: sk-ant-...  # Or set ANTHROPIC_API_KEY
      
    - name: google
      enabled: true
      priority: 80
      # apiKey: ...  # Or set GOOGLE_API_KEY
      providerConfig:
        google:
          thinkingLevel: medium
          mediaResolution: high
          
    - name: openrouter
      enabled: false
      priority: 70
      # apiKey: sk-or-...  # Or set OPENROUTER_API_KEY
      
    - name: ollama
      enabled: false
      priority: 60
      baseUrl: http://localhost:11434
      providerConfig:
        ollama:
          keepAlive: 5m
          numCtx: 4096

# Session settings
session:
  autoSaveInterval: 30000
  maxSessions: 50

# Editor preferences
editor:
  theme: dark
  syntaxHighlighting: true
`;

  fs.writeFileSync(configPath, defaultConfig, 'utf-8');
  return true;
}

/**
 * Gets OAuth serialization settings from configuration.
 *
 * @param config - Merged configuration
 * @returns OAuth serialization settings with defaults
 */
export function getOAuthSerializationSettings(config: MergedConfig): OAuthSerializationSettings {
  const settings = config.global.oauthSerialization;
  if (!settings) {
    // Return default settings
    return {
      includeInSerialization: true,
      maskSensitiveData: true,
      customSensitivePatterns: undefined,
    };
  }
  return settings;
}

/**
 * Gets the effective API key for a provider.
 *
 * Checks in order: environment variable, keychain (TODO), config file.
 *
 * @param provider - The provider name
 * @param config - Merged configuration
 * @returns API key or undefined
 */
export function getApiKey(provider: string, config: MergedConfig): string | undefined {
  // 1. Check environment variable
  const envKey = getApiKeyFromEnv(provider);
  if (envKey !== undefined && envKey !== '') {
    return envKey;
  }

  // 2. TODO: Check keychain (keytar)

  // 3. Check provider-specific configuration
  const providers = config.global.providers?.providers;
  if (providers && Array.isArray(providers)) {
    const providerConfig = providers.find((p: any) => p.name === provider);
    if (providerConfig?.apiKey) {
      return providerConfig.apiKey;
    }
  }

  // 4. Check legacy config file format
  if (config.global.apiKeys !== undefined) {
    const configKey = (config.global.apiKeys as any)[provider];
    if (configKey !== undefined) {
      return configKey;
    }
  }

  return undefined;
}

/**
 * Gets OAuth configuration for a provider.
 *
 * @param provider - The provider name
 * @param config - Merged configuration
 * @returns OAuth configuration or undefined
 */
export function getOAuthConfig(provider: string, config: MergedConfig): any | undefined {
  const providers = config.global.providers?.providers;
  if (providers && Array.isArray(providers)) {
    const providerConfig = providers.find((p: any) => p.name === provider);
    return providerConfig?.oauth;
  }
  return undefined;
}

/**
 * Checks if OAuth is enabled for a provider.
 *
 * @param provider - The provider name
 * @param config - Merged configuration
 * @returns True if OAuth is enabled
 */
export function isOAuthEnabled(provider: string, config: MergedConfig): boolean {
  const oauthConfig = getOAuthConfig(provider, config);
  return oauthConfig?._enabled ?? false;
}

/**
 * Gets the preferred authentication method for a provider.
 *
 * @param provider - The provider name
 * @param config - Merged configuration
 * @returns Preferred authentication method
 */
export function getPreferredAuthMethod(provider: string, config: MergedConfig): 'oauth' | 'api_key' {
  const oauthConfig = getOAuthConfig(provider, config);
  return oauthConfig?.preferredMethod ?? 'api_key';
}

/**
 * Gets comprehensive authentication configuration for a provider.
 *
 * @param provider - The provider name
 * @param config - Merged configuration
 * @returns Authentication configuration
 */
export function getAuthenticationConfig(provider: string, config: MergedConfig): {
  hasApiKey: boolean;
  hasOAuth: boolean;
  preferredMethod: 'oauth' | 'api_key';
  oauthEnabled: boolean;
  autoRefresh: boolean;
} {
  const hasApiKey = !!getApiKey(provider, config);
  const oauthConfig = getOAuthConfig(provider, config);
  const hasOAuth = !!(oauthConfig?._enabled && oauthConfig?.clientId);
  
  return {
    hasApiKey,
    hasOAuth,
    preferredMethod: oauthConfig?.preferredMethod ?? 'api_key',
    oauthEnabled: oauthConfig?._enabled ?? false,
    autoRefresh: oauthConfig?._autoRefresh ?? true,
  };
}