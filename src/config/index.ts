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
  // Types
  type GlobalConfig,
  type ProjectConfig,
  type SecurityPolicy,
  type MergedConfig,
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
  // Initialization
  ensureConfigDir,
  createDefaultConfig,
} from './loader.js';
