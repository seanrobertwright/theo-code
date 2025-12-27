/**
 * @fileoverview Public API for configuration
 * @module config
 */

export {
  // Schemas
  GlobalConfigSchema,
  ProjectConfigSchema,
  SecurityPolicySchema,
  MergedConfigSchema,
  ProviderConfigSchema,
  MultiProviderConfigSchema,
  // Types
  type GlobalConfig,
  type ProjectConfig,
  type SecurityPolicy,
  type MergedConfig,
  type ProviderConfig,
  type MultiProviderConfig,
} from './schemas.js';

export {
  // Path utilities
  getGlobalConfigDir,
  getGlobalConfigPath,
  getSessionsDir,
  // Loaders
  loadGlobalConfig,
  loadProjectConfig,
  loadAgentsInstructions,
  loadSecurityPolicy,
  loadConfig,
  // Environment
  getApiKeyFromEnv,
  getModelFromEnv,
  isSafeModeEnabled,
  getApiKey,
  // Provider utilities
  validateProviderConfig,
  getProviderConfig,
  getAvailableProviders,
  // Initialization
  ensureConfigDir,
  createDefaultConfig,
} from './loader.js';
