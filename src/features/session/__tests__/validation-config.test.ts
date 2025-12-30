/**
 * @fileoverview Unit tests for session validation configuration
 * @module features/session/__tests__/validation-config
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ValidationConfigManager,
  createValidationConfigManager,
  createStrictValidationConfigManager,
  createLenientValidationConfigManager,
  validateSessionValidationConfig,
  createConfigFromEnvironment,
  STRICT_VALIDATION_CONFIG,
  NORMAL_VALIDATION_CONFIG,
  LENIENT_VALIDATION_CONFIG,
  type SessionValidationConfig,
  type ValidationStrictness,
} from '../validation-config.js';

describe('ValidationConfigManager', () => {
  let configManager: ValidationConfigManager;

  beforeEach(() => {
    configManager = new ValidationConfigManager();
  });

  describe('constructor', () => {
    it('should initialize with normal preset by default', () => {
      const config = configManager.getConfig();
      expect(config.strictness).toBe('normal');
      expect(config.enabled).toBe(true);
      expect(config.retry.maxRetries).toBe(3);
    });

    it('should apply initial configuration overrides', () => {
      const manager = new ValidationConfigManager({
        strictness: 'strict',
        retry: { maxRetries: 5 },
      });
      
      const config = manager.getConfig();
      expect(config.strictness).toBe('strict');
      expect(config.retry.maxRetries).toBe(5);
      // Other values should remain from normal preset
      expect(config.cleanup.enableAutomaticCleanup).toBe(true);
    });

    it('should handle partial nested configuration', () => {
      const manager = new ValidationConfigManager({
        retry: { maxRetries: 10 },
        cleanup: { enableAutomaticCleanup: false },
      });
      
      const config = manager.getConfig();
      expect(config.retry.maxRetries).toBe(10);
      expect(config.retry.baseDelayMs).toBe(1000); // Should keep default
      expect(config.cleanup.enableAutomaticCleanup).toBe(false);
      expect(config.cleanup.createBackups).toBe(true); // Should keep default
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the configuration', () => {
      const config1 = configManager.getConfig();
      const config2 = configManager.getConfig();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });
  });

  describe('updateConfig', () => {
    it('should update configuration with partial changes', () => {
      configManager.updateConfig({
        strictness: 'strict',
        retry: { maxRetries: 5 },
      });
      
      const config = configManager.getConfig();
      expect(config.strictness).toBe('strict');
      expect(config.retry.maxRetries).toBe(5);
      expect(config.retry.baseDelayMs).toBe(1000); // Should preserve existing
    });

    it('should merge nested objects correctly', () => {
      configManager.updateConfig({
        timeouts: { fileReadTimeoutMs: 15000 },
      });
      
      const config = configManager.getConfig();
      expect(config.timeouts.fileReadTimeoutMs).toBe(15000);
      expect(config.timeouts.fileExistenceTimeoutMs).toBe(5000); // Should preserve
    });

    it('should handle boolean updates', () => {
      configManager.updateConfig({
        enabled: false,
        cleanup: { enableAutomaticCleanup: false },
      });
      
      const config = configManager.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.cleanup.enableAutomaticCleanup).toBe(false);
    });
  });

  describe('setPreset', () => {
    it('should set strict preset correctly', () => {
      configManager.setPreset('strict');
      
      const config = configManager.getConfig();
      expect(config.strictness).toBe('strict');
      expect(config.retry.maxRetries).toBe(2);
      expect(config.cleanup.promptBeforeDestruction).toBe(false);
    });

    it('should set normal preset correctly', () => {
      configManager.setPreset('normal');
      
      const config = configManager.getConfig();
      expect(config.strictness).toBe('normal');
      expect(config.retry.maxRetries).toBe(3);
      expect(config.cleanup.promptBeforeDestruction).toBe(true);
    });

    it('should set lenient preset correctly', () => {
      configManager.setPreset('lenient');
      
      const config = configManager.getConfig();
      expect(config.strictness).toBe('lenient');
      expect(config.retry.maxRetries).toBe(5);
      expect(config.cleanup.enableAutomaticCleanup).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const validConfig = {
        strictness: 'normal' as ValidationStrictness,
        enabled: true,
        retry: { maxRetries: 3 },
      };
      
      expect(() => configManager.validateConfig(validConfig)).not.toThrow();
    });

    it('should reject invalid strictness values', () => {
      const invalidConfig = {
        strictness: 'invalid',
        enabled: true,
      };
      
      expect(() => configManager.validateConfig(invalidConfig)).toThrow(/Invalid session validation configuration/);
    });

    it('should reject negative retry values', () => {
      const invalidConfig = {
        strictness: 'normal' as ValidationStrictness,
        retry: { maxRetries: -1 },
      };
      
      expect(() => configManager.validateConfig(invalidConfig)).toThrow(/Invalid session validation configuration/);
    });

    it('should reject invalid timeout values', () => {
      const invalidConfig = {
        strictness: 'normal' as ValidationStrictness,
        timeouts: { fileReadTimeoutMs: 0 },
      };
      
      expect(() => configManager.validateConfig(invalidConfig)).toThrow(/Invalid session validation configuration/);
    });

    it('should provide detailed error messages', () => {
      const invalidConfig = {
        strictness: 'invalid',
        retry: { maxRetries: -1 },
      };
      
      expect(() => configManager.validateConfig(invalidConfig)).toThrow(/strictness.*retry\.maxRetries/);
    });
  });

  describe('getPresetConfig', () => {
    it('should return strict preset configuration', () => {
      const config = configManager.getPresetConfig('strict');
      expect(config).toEqual(STRICT_VALIDATION_CONFIG);
      expect(config).not.toBe(STRICT_VALIDATION_CONFIG); // Should be a copy
    });

    it('should return normal preset configuration', () => {
      const config = configManager.getPresetConfig('normal');
      expect(config).toEqual(NORMAL_VALIDATION_CONFIG);
    });

    it('should return lenient preset configuration', () => {
      const config = configManager.getPresetConfig('lenient');
      expect(config).toEqual(LENIENT_VALIDATION_CONFIG);
    });

    it('should default to normal for invalid preset', () => {
      const config = configManager.getPresetConfig('invalid' as ValidationStrictness);
      expect(config).toEqual(NORMAL_VALIDATION_CONFIG);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true for enabled boolean features', () => {
      configManager.updateConfig({ enabled: true });
      expect(configManager.isFeatureEnabled('enabled')).toBe(true);
    });

    it('should return false for disabled boolean features', () => {
      configManager.updateConfig({ enabled: false });
      expect(configManager.isFeatureEnabled('enabled')).toBe(false);
    });

    it('should return true for non-boolean features by default', () => {
      expect(configManager.isFeatureEnabled('strictness')).toBe(true);
    });
  });

  describe('configuration section getters', () => {
    it('should return retry configuration', () => {
      const retryConfig = configManager.getRetryConfig();
      expect(retryConfig).toHaveProperty('maxRetries');
      expect(retryConfig).toHaveProperty('baseDelayMs');
      expect(retryConfig).toHaveProperty('maxDelayMs');
      expect(retryConfig).toHaveProperty('enableBackoff');
    });

    it('should return timeout configuration', () => {
      const timeoutConfig = configManager.getTimeoutConfig();
      expect(timeoutConfig).toHaveProperty('fileExistenceTimeoutMs');
      expect(timeoutConfig).toHaveProperty('fileReadTimeoutMs');
      expect(timeoutConfig).toHaveProperty('indexValidationTimeoutMs');
    });

    it('should return cleanup configuration', () => {
      const cleanupConfig = configManager.getCleanupConfig();
      expect(cleanupConfig).toHaveProperty('enableAutomaticCleanup');
      expect(cleanupConfig).toHaveProperty('createBackups');
      expect(cleanupConfig).toHaveProperty('maxBackups');
    });

    it('should return performance configuration', () => {
      const performanceConfig = configManager.getPerformanceConfig();
      expect(performanceConfig).toHaveProperty('maxFileSizeBytes');
      expect(performanceConfig).toHaveProperty('maxConcurrentValidations');
      expect(performanceConfig).toHaveProperty('enableCaching');
    });

    it('should return logging configuration', () => {
      const loggingConfig = configManager.getLoggingConfig();
      expect(loggingConfig).toHaveProperty('enableDetailedLogging');
      expect(loggingConfig).toHaveProperty('logLevel');
      expect(loggingConfig).toHaveProperty('logSuccessfulValidations');
    });

    it('should return copies of configuration sections', () => {
      const retryConfig1 = configManager.getRetryConfig();
      const retryConfig2 = configManager.getRetryConfig();
      
      expect(retryConfig1).toEqual(retryConfig2);
      expect(retryConfig1).not.toBe(retryConfig2);
    });
  });
});

describe('Factory Functions', () => {
  describe('createValidationConfigManager', () => {
    it('should create manager with default configuration', () => {
      const manager = createValidationConfigManager();
      const config = manager.getConfig();
      expect(config.strictness).toBe('normal');
    });

    it('should create manager with custom configuration', () => {
      const manager = createValidationConfigManager({
        strictness: 'strict',
        enabled: false,
      });
      
      const config = manager.getConfig();
      expect(config.strictness).toBe('strict');
      expect(config.enabled).toBe(false);
    });
  });

  describe('createStrictValidationConfigManager', () => {
    it('should create manager with strict configuration', () => {
      const manager = createStrictValidationConfigManager();
      const config = manager.getConfig();
      expect(config.strictness).toBe('strict');
      expect(config.retry.maxRetries).toBe(2);
    });
  });

  describe('createLenientValidationConfigManager', () => {
    it('should create manager with lenient configuration', () => {
      const manager = createLenientValidationConfigManager();
      const config = manager.getConfig();
      expect(config.strictness).toBe('lenient');
      expect(config.retry.maxRetries).toBe(5);
    });
  });
});

describe('validateSessionValidationConfig', () => {
  it('should validate and return valid configuration', () => {
    const validConfig = {
      strictness: 'normal' as ValidationStrictness,
      enabled: true,
      retry: { maxRetries: 3 },
    };
    
    const result = validateSessionValidationConfig(validConfig);
    expect(result.strictness).toBe('normal');
    expect(result.enabled).toBe(true);
  });

  it('should apply default values for missing properties', () => {
    const minimalConfig = {
      strictness: 'normal' as ValidationStrictness,
    };
    
    const result = validateSessionValidationConfig(minimalConfig);
    expect(result.enabled).toBe(true); // Default value
    expect(result.retry.maxRetries).toBe(3); // Default value
  });

  it('should throw for invalid configuration', () => {
    const invalidConfig = {
      strictness: 'invalid',
    };
    
    expect(() => validateSessionValidationConfig(invalidConfig)).toThrow();
  });
});

describe('createConfigFromEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear environment variables
    delete process.env.SESSION_VALIDATION_STRICTNESS;
    delete process.env.SESSION_VALIDATION_ENABLED;
    delete process.env.SESSION_VALIDATION_MAX_RETRIES;
    delete process.env.SESSION_VALIDATION_ENABLE_CLEANUP;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return empty config when no environment variables are set', () => {
    const config = createConfigFromEnvironment();
    expect(config).toEqual({});
  });

  it('should parse strictness from environment', () => {
    process.env.SESSION_VALIDATION_STRICTNESS = 'strict';
    
    const config = createConfigFromEnvironment();
    expect(config.strictness).toBe('strict');
  });

  it('should ignore invalid strictness values', () => {
    process.env.SESSION_VALIDATION_STRICTNESS = 'invalid';
    
    const config = createConfigFromEnvironment();
    expect(config.strictness).toBeUndefined();
  });

  it('should parse enabled flag from environment', () => {
    process.env.SESSION_VALIDATION_ENABLED = 'true';
    
    const config = createConfigFromEnvironment();
    expect(config.enabled).toBe(true);
    
    process.env.SESSION_VALIDATION_ENABLED = 'false';
    const config2 = createConfigFromEnvironment();
    expect(config2.enabled).toBe(false);
  });

  it('should parse max retries from environment', () => {
    process.env.SESSION_VALIDATION_MAX_RETRIES = '5';
    
    const config = createConfigFromEnvironment();
    expect(config.retry?.maxRetries).toBe(5);
  });

  it('should ignore invalid max retries values', () => {
    process.env.SESSION_VALIDATION_MAX_RETRIES = 'invalid';
    
    const config = createConfigFromEnvironment();
    expect(config.retry).toBeUndefined();
  });

  it('should parse cleanup flag from environment', () => {
    process.env.SESSION_VALIDATION_ENABLE_CLEANUP = 'true';
    
    const config = createConfigFromEnvironment();
    expect(config.cleanup?.enableAutomaticCleanup).toBe(true);
    
    process.env.SESSION_VALIDATION_ENABLE_CLEANUP = 'false';
    const config2 = createConfigFromEnvironment();
    expect(config2.cleanup?.enableAutomaticCleanup).toBe(false);
  });

  it('should parse multiple environment variables', () => {
    process.env.SESSION_VALIDATION_STRICTNESS = 'lenient';
    process.env.SESSION_VALIDATION_ENABLED = 'false';
    process.env.SESSION_VALIDATION_MAX_RETRIES = '10';
    process.env.SESSION_VALIDATION_ENABLE_CLEANUP = 'false';
    
    const config = createConfigFromEnvironment();
    expect(config.strictness).toBe('lenient');
    expect(config.enabled).toBe(false);
    expect(config.retry?.maxRetries).toBe(10);
    expect(config.cleanup?.enableAutomaticCleanup).toBe(false);
  });
});

describe('Preset Configurations', () => {
  describe('STRICT_VALIDATION_CONFIG', () => {
    it('should have strict settings', () => {
      expect(STRICT_VALIDATION_CONFIG.strictness).toBe('strict');
      expect(STRICT_VALIDATION_CONFIG.retry.maxRetries).toBe(2);
      expect(STRICT_VALIDATION_CONFIG.cleanup.promptBeforeDestruction).toBe(false);
      expect(STRICT_VALIDATION_CONFIG.performance.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    });
  });

  describe('NORMAL_VALIDATION_CONFIG', () => {
    it('should have balanced settings', () => {
      expect(NORMAL_VALIDATION_CONFIG.strictness).toBe('normal');
      expect(NORMAL_VALIDATION_CONFIG.retry.maxRetries).toBe(3);
      expect(NORMAL_VALIDATION_CONFIG.cleanup.promptBeforeDestruction).toBe(true);
      expect(NORMAL_VALIDATION_CONFIG.performance.maxFileSizeBytes).toBe(50 * 1024 * 1024);
    });
  });

  describe('LENIENT_VALIDATION_CONFIG', () => {
    it('should have lenient settings', () => {
      expect(LENIENT_VALIDATION_CONFIG.strictness).toBe('lenient');
      expect(LENIENT_VALIDATION_CONFIG.retry.maxRetries).toBe(5);
      expect(LENIENT_VALIDATION_CONFIG.cleanup.enableAutomaticCleanup).toBe(false);
      expect(LENIENT_VALIDATION_CONFIG.performance.maxFileSizeBytes).toBe(100 * 1024 * 1024);
    });
  });
});

describe('Configuration Validation Edge Cases', () => {
  let configManager: ValidationConfigManager;

  beforeEach(() => {
    configManager = new ValidationConfigManager();
  });

  it('should handle null values gracefully', () => {
    expect(() => configManager.validateConfig(null)).toThrow();
  });

  it('should handle undefined values gracefully', () => {
    expect(() => configManager.validateConfig(undefined)).toThrow();
  });

  it('should handle empty object', () => {
    const result = configManager.validateConfig({});
    expect(result.strictness).toBe('normal'); // Default value
    expect(result.enabled).toBe(true); // Default value
  });

  it('should handle array instead of object', () => {
    expect(() => configManager.validateConfig([])).toThrow();
  });

  it('should handle string instead of object', () => {
    expect(() => configManager.validateConfig('invalid')).toThrow();
  });

  it('should handle number instead of object', () => {
    expect(() => configManager.validateConfig(123)).toThrow();
  });

  it('should validate nested object structure', () => {
    const configWithInvalidNesting = {
      strictness: 'normal' as ValidationStrictness,
      retry: 'invalid', // Should be an object
    };
    
    expect(() => configManager.validateConfig(configWithInvalidNesting)).toThrow();
  });

  it('should handle partial nested updates without breaking existing config', () => {
    // Start with a known good config
    configManager.setPreset('normal');
    
    // Update only part of a nested object
    configManager.updateConfig({
      retry: { maxRetries: 10 }, // Only update maxRetries
    });
    
    const config = configManager.getConfig();
    expect(config.retry.maxRetries).toBe(10);
    expect(config.retry.baseDelayMs).toBe(1000); // Should preserve original
    expect(config.retry.enableBackoff).toBe(true); // Should preserve original
  });
});

describe('Default Value Handling', () => {
  it('should apply all default values when creating empty config', () => {
    const config = validateSessionValidationConfig({});
    
    // Check that all required defaults are present
    expect(config.strictness).toBe('normal');
    expect(config.enabled).toBe(true);
    expect(config.retry.maxRetries).toBe(3);
    expect(config.retry.baseDelayMs).toBe(1000);
    expect(config.retry.maxDelayMs).toBe(30000);
    expect(config.retry.enableBackoff).toBe(true);
    expect(config.timeouts.fileExistenceTimeoutMs).toBe(5000);
    expect(config.cleanup.enableAutomaticCleanup).toBe(true);
    expect(config.performance.maxFileSizeBytes).toBe(50 * 1024 * 1024);
    expect(config.logging.logLevel).toBe('info');
  });

  it('should preserve provided values and only apply defaults for missing ones', () => {
    const partialConfig = {
      strictness: 'strict' as ValidationStrictness,
      retry: { maxRetries: 5 },
    };
    
    const config = validateSessionValidationConfig(partialConfig);
    
    // Provided values should be preserved
    expect(config.strictness).toBe('strict');
    expect(config.retry.maxRetries).toBe(5);
    
    // Missing values should get defaults
    expect(config.enabled).toBe(true);
    expect(config.retry.baseDelayMs).toBe(1000);
  });
});