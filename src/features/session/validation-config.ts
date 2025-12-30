/**
 * @fileoverview Configuration system for session validation behavior
 * @module features/session/validation-config
 *
 * Provides configurable validation behavior including:
 * - Validation strictness levels
 * - Configurable retry limits and timeouts
 * - Option to disable automatic cleanup
 * - Timeout and performance settings
 */

import { z } from 'zod';
import { logger } from '../../shared/utils/logger.js';

// =============================================================================
// CONFIGURATION SCHEMAS
// =============================================================================

/**
 * Validation strictness levels.
 */
export const ValidationStrictnessSchema = z.enum(['strict', 'normal', 'lenient']);
export type ValidationStrictness = z.infer<typeof ValidationStrictnessSchema>;

/**
 * Retry configuration for validation operations.
 */
export const ValidationRetryConfigSchema = z.object({
  /** Maximum number of retry attempts for validation operations */
  maxRetries: z.number().int().nonnegative().default(3),
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: z.number().int().positive().default(1000),
  /** Maximum delay in milliseconds for exponential backoff */
  maxDelayMs: z.number().int().positive().default(30000),
  /** Whether to enable exponential backoff */
  enableBackoff: z.boolean().default(true),
});
export type ValidationRetryConfig = z.infer<typeof ValidationRetryConfigSchema>;

/**
 * Timeout configuration for validation operations.
 */
export const ValidationTimeoutConfigSchema = z.object({
  /** Timeout for file existence checks in milliseconds */
  fileExistenceTimeoutMs: z.number().int().positive().default(5000),
  /** Timeout for file read operations in milliseconds */
  fileReadTimeoutMs: z.number().int().positive().default(10000),
  /** Timeout for index validation operations in milliseconds */
  indexValidationTimeoutMs: z.number().int().positive().default(30000),
  /** Timeout for cleanup operations in milliseconds */
  cleanupTimeoutMs: z.number().int().positive().default(60000),
  /** Timeout for startup integrity check in milliseconds */
  startupCheckTimeoutMs: z.number().int().positive().default(120000),
});
export type ValidationTimeoutConfig = z.infer<typeof ValidationTimeoutConfigSchema>;

/**
 * Cleanup behavior configuration.
 */
export const ValidationCleanupConfigSchema = z.object({
  /** Whether to enable automatic cleanup of orphaned entries */
  enableAutomaticCleanup: z.boolean().default(true),
  /** Whether to create backups before cleanup operations */
  createBackups: z.boolean().default(true),
  /** Maximum number of backups to keep */
  maxBackups: z.number().int().positive().default(10),
  /** Whether to clean up orphaned files (not just index entries) */
  cleanupOrphanedFiles: z.boolean().default(false),
  /** Whether to prompt user before destructive operations */
  promptBeforeDestruction: z.boolean().default(true),
});
export type ValidationCleanupConfig = z.infer<typeof ValidationCleanupConfigSchema>;

/**
 * Performance configuration for validation operations.
 */
export const ValidationPerformanceConfigSchema = z.object({
  /** Maximum file size to validate in bytes */
  maxFileSizeBytes: z.number().int().positive().default(50 * 1024 * 1024), // 50MB
  /** Maximum number of sessions to validate concurrently */
  maxConcurrentValidations: z.number().int().positive().default(5),
  /** Whether to enable validation caching */
  enableCaching: z.boolean().default(true),
  /** Cache TTL in milliseconds */
  cacheTtlMs: z.number().int().positive().default(5 * 60 * 1000), // 5 minutes
  /** Whether to validate files in parallel */
  enableParallelValidation: z.boolean().default(true),
});
export type ValidationPerformanceConfig = z.infer<typeof ValidationPerformanceConfigSchema>;

/**
 * Logging configuration for validation operations.
 */
export const ValidationLoggingConfigSchema = z.object({
  /** Whether to enable detailed validation logging */
  enableDetailedLogging: z.boolean().default(true),
  /** Whether to log successful validations */
  logSuccessfulValidations: z.boolean().default(false),
  /** Whether to log performance metrics */
  logPerformanceMetrics: z.boolean().default(true),
  /** Whether to log cleanup operations */
  logCleanupOperations: z.boolean().default(true),
  /** Log level for validation operations */
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});
export type ValidationLoggingConfig = z.infer<typeof ValidationLoggingConfigSchema>;

/**
 * Complete session validation configuration schema.
 */
export const SessionValidationConfigSchema = z.object({
  /** Validation strictness level */
  strictness: ValidationStrictnessSchema.default('normal'),
  /** Retry configuration */
  retry: ValidationRetryConfigSchema.default({}),
  /** Timeout configuration */
  timeouts: ValidationTimeoutConfigSchema.default({}),
  /** Cleanup behavior configuration */
  cleanup: ValidationCleanupConfigSchema.default({}),
  /** Performance configuration */
  performance: ValidationPerformanceConfigSchema.default({}),
  /** Logging configuration */
  logging: ValidationLoggingConfigSchema.default({}),
  /** Whether validation is enabled globally */
  enabled: z.boolean().default(true),
});
export type SessionValidationConfig = z.infer<typeof SessionValidationConfigSchema>;

// =============================================================================
// PRESET CONFIGURATIONS
// =============================================================================

/**
 * Strict validation configuration preset.
 * - High validation standards
 * - Lower retry limits
 * - Shorter timeouts
 * - Automatic cleanup enabled
 */
export const STRICT_VALIDATION_CONFIG: SessionValidationConfig = {
  strictness: 'strict',
  retry: {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    enableBackoff: true,
  },
  timeouts: {
    fileExistenceTimeoutMs: 2000,
    fileReadTimeoutMs: 5000,
    indexValidationTimeoutMs: 15000,
    cleanupTimeoutMs: 30000,
    startupCheckTimeoutMs: 60000,
  },
  cleanup: {
    enableAutomaticCleanup: true,
    createBackups: true,
    maxBackups: 5,
    cleanupOrphanedFiles: true,
    promptBeforeDestruction: false, // Auto-cleanup in strict mode
  },
  performance: {
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
    maxConcurrentValidations: 3,
    enableCaching: true,
    cacheTtlMs: 2 * 60 * 1000, // 2 minutes
    enableParallelValidation: true,
  },
  logging: {
    enableDetailedLogging: true,
    logSuccessfulValidations: true,
    logPerformanceMetrics: true,
    logCleanupOperations: true,
    logLevel: 'info',
  },
  enabled: true,
};

/**
 * Normal validation configuration preset.
 * - Balanced validation standards
 * - Standard retry limits
 * - Reasonable timeouts
 * - Automatic cleanup with prompts
 */
export const NORMAL_VALIDATION_CONFIG: SessionValidationConfig = {
  strictness: 'normal',
  retry: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    enableBackoff: true,
  },
  timeouts: {
    fileExistenceTimeoutMs: 5000,
    fileReadTimeoutMs: 10000,
    indexValidationTimeoutMs: 30000,
    cleanupTimeoutMs: 60000,
    startupCheckTimeoutMs: 120000,
  },
  cleanup: {
    enableAutomaticCleanup: true,
    createBackups: true,
    maxBackups: 10,
    cleanupOrphanedFiles: false,
    promptBeforeDestruction: true,
  },
  performance: {
    maxFileSizeBytes: 50 * 1024 * 1024, // 50MB
    maxConcurrentValidations: 5,
    enableCaching: true,
    cacheTtlMs: 5 * 60 * 1000, // 5 minutes
    enableParallelValidation: true,
  },
  logging: {
    enableDetailedLogging: true,
    logSuccessfulValidations: false,
    logPerformanceMetrics: true,
    logCleanupOperations: true,
    logLevel: 'info',
  },
  enabled: true,
};

/**
 * Lenient validation configuration preset.
 * - Relaxed validation standards
 * - Higher retry limits
 * - Longer timeouts
 * - Manual cleanup only
 */
export const LENIENT_VALIDATION_CONFIG: SessionValidationConfig = {
  strictness: 'lenient',
  retry: {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    enableBackoff: true,
  },
  timeouts: {
    fileExistenceTimeoutMs: 10000,
    fileReadTimeoutMs: 20000,
    indexValidationTimeoutMs: 60000,
    cleanupTimeoutMs: 120000,
    startupCheckTimeoutMs: 300000,
  },
  cleanup: {
    enableAutomaticCleanup: false,
    createBackups: true,
    maxBackups: 20,
    cleanupOrphanedFiles: false,
    promptBeforeDestruction: true,
  },
  performance: {
    maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
    maxConcurrentValidations: 10,
    enableCaching: true,
    cacheTtlMs: 10 * 60 * 1000, // 10 minutes
    enableParallelValidation: true,
  },
  logging: {
    enableDetailedLogging: false,
    logSuccessfulValidations: false,
    logPerformanceMetrics: false,
    logCleanupOperations: true,
    logLevel: 'warn',
  },
  enabled: true,
};

// =============================================================================
// CONFIGURATION MANAGER
// =============================================================================

/**
 * Configuration manager for session validation behavior.
 */
export interface IValidationConfigManager {
  /**
   * Gets the current configuration.
   */
  getConfig(): SessionValidationConfig;

  /**
   * Updates the configuration with partial changes.
   */
  updateConfig(config: Partial<SessionValidationConfig>): void;

  /**
   * Resets configuration to a preset.
   */
  setPreset(preset: ValidationStrictness): void;

  /**
   * Validates a configuration object.
   */
  validateConfig(config: unknown): SessionValidationConfig;

  /**
   * Gets the default configuration for a strictness level.
   */
  getPresetConfig(preset: ValidationStrictness): SessionValidationConfig;

  /**
   * Checks if a feature is enabled based on current configuration.
   */
  isFeatureEnabled(feature: keyof SessionValidationConfig): boolean;

  /**
   * Gets a specific configuration section.
   */
  getRetryConfig(): ValidationRetryConfig;
  getTimeoutConfig(): ValidationTimeoutConfig;
  getCleanupConfig(): ValidationCleanupConfig;
  getPerformanceConfig(): ValidationPerformanceConfig;
  getLoggingConfig(): ValidationLoggingConfig;
}

/**
 * Implementation of the validation configuration manager.
 */
export class ValidationConfigManager implements IValidationConfigManager {
  private config: SessionValidationConfig;

  constructor(initialConfig?: Partial<SessionValidationConfig>) {
    // Start with normal preset and apply any overrides
    this.config = this.mergeConfigs(NORMAL_VALIDATION_CONFIG, initialConfig || {});
    this.validateAndNormalizeConfig();
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): SessionValidationConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration with partial changes.
   */
  updateConfig(config: Partial<SessionValidationConfig>): void {
    this.config = this.mergeConfigs(this.config, config);
    this.validateAndNormalizeConfig();
    logger.info('Session validation configuration updated', config);
  }

  /**
   * Resets configuration to a preset.
   */
  setPreset(preset: ValidationStrictness): void {
    this.config = this.getPresetConfig(preset);
    logger.info(`Session validation configuration set to ${preset} preset`);
  }

  /**
   * Validates a configuration object.
   */
  validateConfig(config: unknown): SessionValidationConfig {
    try {
      return SessionValidationConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
        throw new Error(`Invalid session validation configuration: ${issues}`);
      }
      throw new Error(`Failed to validate session validation configuration: ${error}`);
    }
  }

  /**
   * Gets the default configuration for a strictness level.
   */
  getPresetConfig(preset: ValidationStrictness): SessionValidationConfig {
    switch (preset) {
      case 'strict':
        return { ...STRICT_VALIDATION_CONFIG };
      case 'normal':
        return { ...NORMAL_VALIDATION_CONFIG };
      case 'lenient':
        return { ...LENIENT_VALIDATION_CONFIG };
      default:
        return { ...NORMAL_VALIDATION_CONFIG };
    }
  }

  /**
   * Checks if a feature is enabled based on current configuration.
   */
  isFeatureEnabled(feature: keyof SessionValidationConfig): boolean {
    const value = this.config[feature];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'object' && value !== null && 'enabled' in value) {
      return Boolean((value as any).enabled);
    }
    return true; // Default to enabled if not explicitly disabled
  }

  /**
   * Gets the retry configuration.
   */
  getRetryConfig(): ValidationRetryConfig {
    return { ...this.config.retry };
  }

  /**
   * Gets the timeout configuration.
   */
  getTimeoutConfig(): ValidationTimeoutConfig {
    return { ...this.config.timeouts };
  }

  /**
   * Gets the cleanup configuration.
   */
  getCleanupConfig(): ValidationCleanupConfig {
    return { ...this.config.cleanup };
  }

  /**
   * Gets the performance configuration.
   */
  getPerformanceConfig(): ValidationPerformanceConfig {
    return { ...this.config.performance };
  }

  /**
   * Gets the logging configuration.
   */
  getLoggingConfig(): ValidationLoggingConfig {
    return { ...this.config.logging };
  }

  /**
   * Validates and normalizes the current configuration.
   */
  private validateAndNormalizeConfig(): void {
    try {
      this.config = SessionValidationConfigSchema.parse(this.config);
    } catch (error) {
      logger.error('Invalid session validation configuration, resetting to normal preset', error);
      this.config = { ...NORMAL_VALIDATION_CONFIG };
    }
  }

  /**
   * Deep merges two configuration objects.
   */
  private mergeConfigs(base: SessionValidationConfig, override: Partial<SessionValidationConfig>): SessionValidationConfig {
    const result = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Deep merge objects
          (result as any)[key] = {
            ...(result as any)[key],
            ...value,
          };
        } else {
          // Direct assignment for primitives and arrays
          (result as any)[key] = value;
        }
      }
    }

    return result;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a new validation configuration manager with default settings.
 */
export function createValidationConfigManager(initialConfig?: Partial<SessionValidationConfig>): IValidationConfigManager {
  return new ValidationConfigManager(initialConfig);
}

/**
 * Creates a validation configuration manager with strict settings.
 */
export function createStrictValidationConfigManager(): IValidationConfigManager {
  return new ValidationConfigManager(STRICT_VALIDATION_CONFIG);
}

/**
 * Creates a validation configuration manager with lenient settings.
 */
export function createLenientValidationConfigManager(): IValidationConfigManager {
  return new ValidationConfigManager(LENIENT_VALIDATION_CONFIG);
}

/**
 * Validates a configuration object and returns a normalized version.
 */
export function validateSessionValidationConfig(config: unknown): SessionValidationConfig {
  return SessionValidationConfigSchema.parse(config);
}

/**
 * Creates a configuration object from environment variables.
 * Useful for deployment scenarios where configuration comes from environment.
 */
export function createConfigFromEnvironment(): Partial<SessionValidationConfig> {
  const config: Partial<SessionValidationConfig> = {};

  // Parse environment variables with fallbacks
  const strictness = process.env['SESSION_VALIDATION_STRICTNESS'] as ValidationStrictness;
  if (strictness && ['strict', 'normal', 'lenient'].includes(strictness)) {
    config.strictness = strictness;
  }

  const enabled = process.env['SESSION_VALIDATION_ENABLED'];
  if (enabled !== undefined) {
    config.enabled = enabled.toLowerCase() === 'true';
  }

  const maxRetries = process.env['SESSION_VALIDATION_MAX_RETRIES'];
  if (maxRetries && !isNaN(Number(maxRetries)) && config.retry) {
    config.retry = { 
      maxRetries: Number(maxRetries),
      baseDelayMs: config.retry.baseDelayMs,
      maxDelayMs: config.retry.maxDelayMs,
      enableBackoff: config.retry.enableBackoff
    };
  }

  const enableCleanup = process.env['SESSION_VALIDATION_ENABLE_CLEANUP'];
  if (enableCleanup !== undefined && config.cleanup) {
    config.cleanup = { 
      enableAutomaticCleanup: enableCleanup.toLowerCase() === 'true',
      createBackups: config.cleanup.createBackups,
      maxBackups: config.cleanup.maxBackups,
      cleanupOrphanedFiles: config.cleanup.cleanupOrphanedFiles,
      promptBeforeDestruction: config.cleanup.promptBeforeDestruction
    };
  }

  return config;
}