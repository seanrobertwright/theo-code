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
  type GlobalConfig,
  type ProjectConfig,
  type SecurityPolicy,
  type MergedConfig,
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
  return path.join(getGlobalConfigDir(), 'sessions');
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
    gemini: 'GOOGLE_API_KEY',
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
 * console.log(config.global.defaultModel);
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
# OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY
# apiKeys:
#   openai: sk-...
#   anthropic: sk-ant-...

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
  if (envKey !== undefined) {
    return envKey;
  }

  // 2. TODO: Check keychain (keytar)

  // 3. Check config file
  if (config.global.apiKeys !== undefined) {
    const configKey = config.global.apiKeys[provider as keyof typeof config.global.apiKeys];
    if (configKey !== undefined) {
      return configKey;
    }
  }

  return undefined;
}
