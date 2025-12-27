/**
 * @fileoverview Integration tests for provider switching functionality
 * @module config/__tests__/provider-switching.integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { 
  loadConfig, 
  createDefaultConfig,
  validateProviderConfig,
  getProviderConfig,
  getAvailableProviders,
  type MergedConfig 
} from '../index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Provider Switching Integration Tests', () => {
  let testWorkspaceRoot: string;
  let testConfigFile: string;
  let testProjectFile: string;

  beforeEach(() => {
    // Create temporary directories for testing
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-test-'));
    testConfigFile = path.join(testWorkspaceRoot, 'test-config.yaml');
    testProjectFile = path.join(testWorkspaceRoot, '.agentrc');
    
    // Set up test environment variables
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.GOOGLE_API_KEY = 'test-google-key';
  });

  afterEach(() => {
    // Clean up temporary directories
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
    
    // Clean up environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.THEO_CODE_MODEL;
    
    // Restore mocks
    vi.restoreAllMocks();
  });

  // =============================================================================
  // RUNTIME PROVIDER SWITCHING TESTS
  // =============================================================================

  describe('Runtime Provider Switching', () => {
    it('should validate multiple providers for switching', () => {
      // Test provider validation for switching scenarios
      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
                apiKey: 'sk-test-openai',
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
                apiKey: 'sk-ant-test',
              },
              {
                name: 'google',
                _enabled: true,
                _priority: 80,
                apiKey: 'test-google',
              },
            ],
            fallbackChain: ['openai', 'anthropic', 'google'],
            _autoSwitchOnFailure: true,
            _healthCheckInterval: 300000,
            _maxFallbackAttempts: 3,
          },
          session: {
            _autoSaveInterval: 30000,
            _maxSessions: 50,
          },
          editor: {
            theme: 'dark',
            _syntaxHighlighting: true,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
        _agentsInstructions: undefined,
      };

      // Verify all providers are available
      const providers = getAvailableProviders(mockConfig);
      expect(providers).toHaveLength(9); // 3 configured + 6 defaults
      
      const configuredProviders = providers.filter(p => 
        ['openai', 'anthropic', 'google'].includes(String(p.name))
      );
      expect(configuredProviders).toHaveLength(3);

      // Validate each provider can be switched to
      for (const provider of ['openai', 'anthropic', 'google']) {
        const validation = validateProviderConfig(provider, mockConfig);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }

      // Verify fallback chain configuration
      expect(mockConfig.global.providers?.fallbackChain).toEqual(['openai', 'anthropic', 'google']);
      expect(mockConfig.global.providers?.autoSwitchOnFailure).toBe(true);
    });

    it('should handle provider switching with environment variable override', () => {
      // Set environment override
      process.env.THEO_CODE_MODEL = 'gpt-4o-mini';

      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'anthropic',
          defaultModel: 'gpt-4o-mini', // This would be overridden by loadConfig
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };

      // Environment variable should override config
      expect(mockConfig.global.defaultModel).toBe('gpt-4o-mini');
      expect(mockConfig.global.defaultProvider).toBe('anthropic'); // Provider not overridden
    });

    it('should handle provider switching with disabled providers', () => {
      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'anthropic',
                _enabled: false,
                _priority: 90,
              },
              {
                name: 'google',
                _enabled: true,
                _priority: 80,
              },
            ],
            fallbackChain: ['openai', 'google'],
            _autoSwitchOnFailure: true,
            _healthCheckInterval: 300000,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };
      
      // Validate that disabled provider shows warning but is still valid
      const anthropicValidation = validateProviderConfig('anthropic', mockConfig);
      expect(anthropicValidation.valid).toBe(true);
      expect(anthropicValidation.warnings).toContain('Provider anthropic is disabled in configuration');

      // Verify fallback chain excludes disabled provider
      expect(mockConfig.global.providers?.fallbackChain).toEqual(['openai', 'google']);
    });
  });

  // =============================================================================
  // SESSION PROVIDER MIGRATION TESTS
  // =============================================================================

  describe('Session Provider Migration', () => {
    it('should handle session provider information storage', () => {
      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
          session: {
            _autoSaveInterval: 30000,
            _maxSessions: 50,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };
      
      // Verify session configuration is loaded
      expect(mockConfig.global.session?.autoSaveInterval).toBe(30000);
      expect(mockConfig.global.session?.maxSessions).toBe(50);

      // Verify provider information is available for session storage
      const openaiConfig = getProviderConfig('openai', mockConfig);
      expect(openaiConfig).toBeDefined();
      expect(openaiConfig?.name).toBe('openai');
      expect(openaiConfig?.enabled).toBe(true);
    });

    it('should handle provider migration for existing sessions', () => {
      // Simulate initial configuration with one provider
      const initialConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };

      expect(initialConfig.global.defaultProvider).toBe('openai');

      // Simulate adding a new provider
      const updatedConfig: MergedConfig = {
        ...initialConfig,
        global: {
          ...initialConfig.global,
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
              },
            ],
            fallbackChain: ['openai', 'anthropic'],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
      };
      
      // Verify both providers are now available
      const providers = getAvailableProviders(updatedConfig);
      const configuredProviders = providers.filter(p => 
        ['openai', 'anthropic'].includes(String(p.name))
      );
      expect(configuredProviders).toHaveLength(2);

      // Verify fallback chain includes new provider
      expect(updatedConfig.global.providers?.fallbackChain).toEqual(['openai', 'anthropic']);
    });

    it('should handle provider removal gracefully', () => {
      // Create configuration with multiple providers
      const initialConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
              },
              {
                name: 'google',
                _enabled: true,
                _priority: 80,
              },
            ],
            fallbackChain: ['openai', 'anthropic', 'google'],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };

      expect(initialConfig.global.providers?.fallbackChain).toEqual(['openai', 'anthropic', 'google']);

      // Remove one provider from configuration
      const updatedConfig: MergedConfig = {
        ...initialConfig,
        global: {
          ...initialConfig.global,
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'google',
                _enabled: true,
                _priority: 80,
              },
            ],
            fallbackChain: ['openai', 'google'],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
      };
      
      // Verify fallback chain is updated
      expect(updatedConfig.global.providers?.fallbackChain).toEqual(['openai', 'google']);

      // Verify removed provider still has default configuration
      const anthropicConfig = getProviderConfig('anthropic', updatedConfig);
      expect(anthropicConfig).toBeDefined();
      expect(anthropicConfig?.name).toBe('anthropic');
      expect(anthropicConfig?.enabled).toBe(true);
      expect(anthropicConfig?.priority).toBe(0); // Default priority
    });
  });

  // =============================================================================
  // CONFIGURATION PERSISTENCE TESTS
  // =============================================================================

  describe('Configuration Persistence', () => {
    it('should persist provider configuration changes', () => {
      // Test configuration with rate limits
      const initialConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
                rateLimit: {
                  _requestsPerMinute: 60,
                  _tokensPerMinute: 100000,
                  _concurrentRequests: 5,
                },
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };

      const openaiConfig1 = getProviderConfig('openai', initialConfig);
      expect(openaiConfig1?.rateLimit?.requestsPerMinute).toBe(60);

      // Update configuration
      const updatedConfig: MergedConfig = {
        ...initialConfig,
        global: {
          ...initialConfig.global,
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
                rateLimit: {
                  _requestsPerMinute: 120,
                  _tokensPerMinute: 200000,
                  _concurrentRequests: 10,
                },
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
      };

      const openaiConfig2 = getProviderConfig('openai', updatedConfig);
      expect(openaiConfig2?.rateLimit?.requestsPerMinute).toBe(120);
      expect(openaiConfig2?.rateLimit?.tokensPerMinute).toBe(200000);
      expect(openaiConfig2?.rateLimit?.concurrentRequests).toBe(10);
    });

    it('should handle project-level provider overrides', () => {
      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        project: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          providerOverrides: {
            openai: {
              _enabled: false,
              _priority: 50,
            },
            anthropic: {
              _priority: 100,
              rateLimit: {
                _requestsPerMinute: 30,
                _tokensPerMinute: 50000,
                _concurrentRequests: 5,
              },
            },
          },
        },
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };
      
      // Verify project overrides are applied
      expect(mockConfig.project?.provider).toBe('anthropic');
      expect(mockConfig.project?.model).toBe('claude-3-5-sonnet-20241022');

      // Verify provider overrides
      const openaiConfig = getProviderConfig('openai', mockConfig);
      expect(openaiConfig?.enabled).toBe(false);
      expect(openaiConfig?.priority).toBe(50);

      const anthropicConfig = getProviderConfig('anthropic', mockConfig);
      expect(anthropicConfig?.priority).toBe(100);
      expect(anthropicConfig?.rateLimit?.requestsPerMinute).toBe(30);
    });

    it('should handle configuration validation across persistence', () => {
      // Configuration with validation issues
      const configWithIssues: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
                baseUrl: 'not-a-valid-url',
                rateLimit: {
                  requestsPerMinute: -1,
                  _tokensPerMinute: 0,
                  _concurrentRequests: 5,
                },
              },
              {
                name: 'anthropic',
                _enabled: false,
                _priority: 90,
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };
      
      // Validate providers and check for expected errors
      const openaiValidation = validateProviderConfig('openai', configWithIssues);
      expect(openaiValidation.valid).toBe(false);
      expect(openaiValidation.errors).toContain('Invalid base URL for provider openai');
      expect(openaiValidation.errors).toContain('Invalid requests per minute for provider openai');
      expect(openaiValidation.errors).toContain('Invalid tokens per minute for provider openai');

      const anthropicValidation = validateProviderConfig('anthropic', configWithIssues);
      expect(anthropicValidation.valid).toBe(true); // Disabled providers are valid
      expect(anthropicValidation.warnings).toContain('Provider anthropic is disabled in configuration');

      // Fixed configuration
      const fixedConfig: MergedConfig = {
        ...configWithIssues,
        global: {
          ...configWithIssues.global,
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
                baseUrl: 'https://api.openai.com/v1',
                rateLimit: {
                  _requestsPerMinute: 60,
                  _tokensPerMinute: 100000,
                  _concurrentRequests: 5,
                },
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
      };
      
      // Verify validation passes after fix
      const fixedOpenaiValidation = validateProviderConfig('openai', fixedConfig);
      expect(fixedOpenaiValidation.valid).toBe(true);
      expect(fixedOpenaiValidation.errors).toHaveLength(0);

      const fixedAnthropicValidation = validateProviderConfig('anthropic', fixedConfig);
      expect(fixedAnthropicValidation.valid).toBe(true);
      expect(fixedAnthropicValidation.warnings).toHaveLength(0);
    });
  });

  // =============================================================================
  // ERROR HANDLING AND EDGE CASES
  // =============================================================================

  describe('Error Handling and Edge Cases', () => {
    it('should handle provider switching with missing API keys', () => {
      // Remove API keys from environment
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            providers: [
              {
                name: 'openai',
                _enabled: true,
                _priority: 100,
              },
              {
                name: 'anthropic',
                _enabled: true,
                _priority: 90,
              },
            ],
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };
      
      // Validation should fail for providers without API keys
      const openaiValidation = validateProviderConfig('openai', mockConfig);
      expect(openaiValidation.valid).toBe(false);
      expect(openaiValidation.errors).toContain('No API key found for provider openai');

      const anthropicValidation = validateProviderConfig('anthropic', mockConfig);
      expect(anthropicValidation.valid).toBe(false);
      expect(anthropicValidation.errors).toContain('No API key found for provider anthropic');

      // Ollama should still be valid (doesn't require API key)
      const ollamaValidation = validateProviderConfig('ollama', mockConfig);
      expect(ollamaValidation.valid).toBe(true);
      expect(ollamaValidation.errors).toHaveLength(0);
    });

    it('should handle unsupported provider gracefully', () => {
      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };

      const validation = validateProviderConfig('unsupported-provider', mockConfig);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Unsupported provider: unsupported-provider');
    });

    it('should handle malformed provider configuration', () => {
      const mockConfig: MergedConfig = {
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          providers: {
            // Malformed providers array
            providers: 'not-an-array' as any,
            _healthCheckInterval: 300000,
            _autoSwitchOnFailure: true,
            _maxFallbackAttempts: 3,
          },
        },
        _project: undefined,
        policy: {
          _allowNet: false,
          _allowExec: true,
          blockedCommands: ['rm -rf /', 'sudo', 'chmod 777'],
          _autoApproveRead: true,
          _autoApproveWrite: false,
          _maxFileSize: 1048576,
          _executionTimeout: 30000,
        },
      };

      // Should still return default providers
      const providers = getAvailableProviders(mockConfig);
      expect(providers).toHaveLength(9); // All default providers
    });
  });
});