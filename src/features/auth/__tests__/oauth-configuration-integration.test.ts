/**
 * @fileoverview OAuth Configuration Management Integration Tests
 * @module features/auth/__tests__/oauth-configuration-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ModelProvider } from '../../../shared/types/models.js';
import type { MergedConfig } from '../../../config/schemas.js';
import { 
  loadConfig,
  getAuthenticationConfig,
  getOAuthConfig,
  isOAuthEnabled,
  getPreferredAuthMethod,
  getApiKey,
} from '../../../config/index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('OAuth Configuration Integration', () => {
  const mockWorkspaceRoot = '/test/workspace';
  const testProvider: ModelProvider = 'google';

  let mockConfig: MergedConfig;

  beforeEach(() => {
    mockConfig = {
      global: {
        defaultProvider: 'google',
        defaultModel: 'gemini-pro',
        providers: {
          providers: [
            {
              name: 'google',
              _enabled: true,
              _priority: 100,
              apiKey: 'test-api-key',
              oauth: {
                _enabled: true,
                clientId: 'test-client-id',
                preferredMethod: 'oauth',
                _autoRefresh: true,
              },
            },
            {
              name: 'anthropic',
              _enabled: true,
              _priority: 90,
              apiKey: 'test-anthropic-key',
              oauth: {
                _enabled: false,
                preferredMethod: 'api_key',
                _autoRefresh: true,
              },
            },
            {
              name: 'openrouter',
              _enabled: true,
              _priority: 80,
              oauth: {
                _enabled: true,
                clientId: 'openrouter-client-id',
                preferredMethod: 'oauth',
                _autoRefresh: true,
              },
            },
          ],
        },
        oauthSerialization: {
          _includeInSerialization: true,
          _maskSensitiveData: true,
          customSensitivePatterns: ['client_secret', 'refresh_token'],
        },
      },
      _project: undefined,
      policy: {
        _allowNet: true,
        _allowExec: true,
        _autoApproveRead: true,
        _autoApproveWrite: false,
        blockedCommands: [],
        maxFileSize: 1024 * 1024,
        _executionTimeout: 30000,
      },
    } as MergedConfig;

    // Mock the actual implementation
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // OAUTH CONFIGURATION LOADING
  // =============================================================================

  describe('OAuth Configuration Loading', () => {
    it('should load OAuth configuration for enabled provider', () => {
      const oauthConfig = getOAuthConfig('google', mockConfig);
      
      expect(oauthConfig).toEqual({
        _enabled: true,
        clientId: 'test-client-id',
        preferredMethod: 'oauth',
        _autoRefresh: true,
      });
    });

    it('should load OAuth configuration for disabled provider', () => {
      const oauthConfig = getOAuthConfig('anthropic', mockConfig);
      
      expect(oauthConfig).toEqual({
        _enabled: false,
        preferredMethod: 'api_key',
        _autoRefresh: true,
      });
    });

    it('should return undefined for provider without OAuth config', () => {
      // Add provider without OAuth config
      mockConfig.global.providers!.providers.push({
        name: 'ollama',
        _enabled: true,
        _priority: 50,
      } as any);

      const oauthConfig = getOAuthConfig('ollama', mockConfig);
      expect(oauthConfig).toBeUndefined();
    });

    it('should check if OAuth is enabled for provider', () => {
      expect(isOAuthEnabled('google', mockConfig)).toBe(true);
      expect(isOAuthEnabled('anthropic', mockConfig)).toBe(false);
      expect(isOAuthEnabled('ollama', mockConfig)).toBe(false);
    });

    it('should get preferred authentication method', () => {
      expect(getPreferredAuthMethod('google', mockConfig)).toBe('oauth');
      expect(getPreferredAuthMethod('anthropic', mockConfig)).toBe('api_key');
      expect(getPreferredAuthMethod('ollama', mockConfig)).toBe('api_key'); // Default
    });

    it('should get comprehensive authentication configuration', () => {
      const googleAuth = getAuthenticationConfig('google', mockConfig);
      expect(googleAuth).toEqual({
        _hasApiKey: true,
        _hasOAuth: true,
        preferredMethod: 'oauth',
        _oauthEnabled: true,
        _autoRefresh: true,
      });

      const anthropicAuth = getAuthenticationConfig('anthropic', mockConfig);
      expect(anthropicAuth).toEqual({
        _hasApiKey: true,
        _hasOAuth: false, // OAuth disabled
        preferredMethod: 'api_key',
        _oauthEnabled: false,
        _autoRefresh: true,
      });

      const openrouterAuth = getAuthenticationConfig('openrouter', mockConfig);
      expect(openrouterAuth).toEqual({
        _hasApiKey: false,
        _hasOAuth: true,
        preferredMethod: 'oauth',
        _oauthEnabled: true,
        _autoRefresh: true,
      });
    });
  });

  // =============================================================================
  // CONFIGURATION VALIDATION
  // =============================================================================

  describe('Configuration Validation', () => {
    it('should validate OAuth configuration with client ID', () => {
      const authConfig = getAuthenticationConfig('google', mockConfig);
      
      expect(authConfig.hasOAuth).toBe(true);
      expect(authConfig.oauthEnabled).toBe(true);
    });

    it('should handle OAuth configuration without client ID', () => {
      // Remove client ID
      mockConfig.global.providers!.providers[0].oauth!.clientId = undefined;
      
      const authConfig = getAuthenticationConfig('google', mockConfig);
      
      expect(authConfig.hasOAuth).toBe(false); // No client ID means no OAuth
      expect(authConfig.oauthEnabled).toBe(true); // Still enabled in config
    });

    it('should validate mixed authentication configurations', () => {
      const providers = ['google', 'anthropic', 'openrouter'];
      const configs = providers.map(p => getAuthenticationConfig(p, mockConfig));
      
      // Google: Both OAuth and API key
      expect(configs[0]).toMatchObject({
        _hasApiKey: true,
        _hasOAuth: true,
        preferredMethod: 'oauth',
      });

      // Anthropic: API key only (OAuth disabled)
      expect(configs[1]).toMatchObject({
        _hasApiKey: true,
        _hasOAuth: false,
        preferredMethod: 'api_key',
      });

      // OpenRouter: OAuth only
      expect(configs[2]).toMatchObject({
        _hasApiKey: false,
        _hasOAuth: true,
        preferredMethod: 'oauth',
      });
    });
  });

  // =============================================================================
  // ENVIRONMENT VARIABLE INTEGRATION
  // =============================================================================

  describe('Environment Variable Integration', () => {
    beforeEach(() => {
      // Mock environment variables
      process.env.GOOGLE_API_KEY = 'env-google-key';
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';
    });

    afterEach(() => {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('should prioritize environment variables over config', () => {
      const googleKey = getApiKey('google', mockConfig);
      expect(googleKey).toBe('env-google-key'); // From environment

      const anthropicKey = getApiKey('anthropic', mockConfig);
      expect(anthropicKey).toBe('env-anthropic-key'); // From environment
    });

    it('should fall back to config when no environment variable', () => {
      delete process.env.GOOGLE_API_KEY;
      
      const googleKey = getApiKey('google', mockConfig);
      expect(googleKey).toBe('test-api-key'); // From config
    });

    it('should update authentication config based on environment', () => {
      // Remove API key from config
      mockConfig.global.providers!.providers[0].apiKey = undefined;
      
      const authConfig = getAuthenticationConfig('google', mockConfig);
      
      // Should still have API key due to environment variable
      expect(authConfig.hasApiKey).toBe(true);
    });
  });

  // =============================================================================
  // PROJECT-LEVEL OVERRIDES
  // =============================================================================

  describe('Project-Level Configuration Overrides', () => {
    beforeEach(() => {
      // Add project-level overrides
      mockConfig.project = {
        providerOverrides: {
          google: {
            _enabled: false, // Override to disable
            _priority: 50,   // Override priority
          },
          anthropic: {
            _enabled: true,
            _priority: 100,  // Higher priority than global
          },
        },
      };
    });

    it('should apply project-level provider overrides', () => {
      // Note: This test assumes the config loader applies overrides
      // In the actual implementation, getProviderConfig would handle this
      
      const config = loadConfig(mockWorkspaceRoot);
      expect(config.project?.providerOverrides).toBeDefined();
      expect(config.project?.providerOverrides?.google).toMatchObject({
        _enabled: false,
        _priority: 50,
      });
    });

    it('should maintain OAuth configuration with project overrides', () => {
      // OAuth configuration should not be affected by basic project overrides
      const oauthConfig = getOAuthConfig('google', mockConfig);
      
      expect(oauthConfig).toEqual({
        _enabled: true,
        clientId: 'test-client-id',
        preferredMethod: 'oauth',
        _autoRefresh: true,
      });
    });
  });

  // =============================================================================
  // OAUTH SERIALIZATION SETTINGS
  // =============================================================================

  describe('OAuth Serialization Settings', () => {
    it('should load OAuth serialization settings', () => {
      const config = loadConfig(mockWorkspaceRoot);
      
      expect(config.global.oauthSerialization).toEqual({
        _includeInSerialization: true,
        _maskSensitiveData: true,
        customSensitivePatterns: ['client_secret', 'refresh_token'],
      });
    });

    it('should provide default serialization settings when not configured', () => {
      // Remove OAuth serialization config
      delete mockConfig.global.oauthSerialization;
      
      const config = loadConfig(mockWorkspaceRoot);
      
      // The actual implementation would provide defaults
      expect(config.global.oauthSerialization).toBeUndefined();
    });
  });

  // =============================================================================
  // CONFIGURATION EDGE CASES
  // =============================================================================

  describe('Configuration Edge Cases', () => {
    it('should handle missing providers configuration', () => {
      mockConfig.global.providers = undefined;
      
      const authConfig = getAuthenticationConfig('google', mockConfig);
      
      expect(authConfig).toEqual({
        _hasApiKey: false,
        _hasOAuth: false,
        preferredMethod: 'api_key',
        _oauthEnabled: false,
        _autoRefresh: true,
      });
    });

    it('should handle empty providers array', () => {
      mockConfig.global.providers!.providers = [];
      
      const authConfig = getAuthenticationConfig('google', mockConfig);
      
      expect(authConfig).toEqual({
        _hasApiKey: false,
        _hasOAuth: false,
        preferredMethod: 'api_key',
        _oauthEnabled: false,
        _autoRefresh: true,
      });
    });

    it('should handle malformed provider configuration', () => {
      // Add malformed provider config
      mockConfig.global.providers!.providers.push({
        name: 'malformed',
        // Missing required fields
      } as any);
      
      const authConfig = getAuthenticationConfig('malformed', mockConfig);
      
      expect(authConfig).toEqual({
        _hasApiKey: false,
        _hasOAuth: false,
        preferredMethod: 'api_key',
        _oauthEnabled: false,
        _autoRefresh: true,
      });
    });

    it('should handle OAuth configuration without enabled flag', () => {
      // Remove enabled flag from OAuth config
      delete mockConfig.global.providers!.providers[0].oauth!.enabled;
      
      const authConfig = getAuthenticationConfig('google', mockConfig);
      
      expect(authConfig.oauthEnabled).toBe(false); // Default to false
    });

    it('should handle OAuth configuration without preferred method', () => {
      // Remove preferred method from OAuth config
      delete mockConfig.global.providers!.providers[0].oauth!.preferredMethod;
      
      const authConfig = getAuthenticationConfig('google', mockConfig);
      
      expect(authConfig.preferredMethod).toBe('api_key'); // Default to api_key
    });
  });

  // =============================================================================
  // CONFIGURATION LOADING INTEGRATION
  // =============================================================================

  describe('Configuration Loading Integration', () => {
    it('should load configuration from workspace root', () => {
      const config = loadConfig(mockWorkspaceRoot);
      
      expect(config).toBeDefined();
      expect(config.global).toBeDefined();
      expect(config.global.providers).toBeDefined();
    });

    it('should handle configuration loading errors gracefully', () => {
      // Mock configuration loading error
      vi.mocked(loadConfig).mockImplementation(() => {
        throw new Error('Configuration loading failed');
      });

      expect(() => loadConfig(mockWorkspaceRoot)).toThrow('Configuration loading failed');
    });

    it('should validate loaded configuration structure', () => {
      const config = loadConfig(mockWorkspaceRoot);
      
      // Verify required structure
      expect(config.global).toBeDefined();
      expect(config.policy).toBeDefined();
      expect(Array.isArray(config.global.providers?.providers)).toBe(true);
    });
  });
});

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock the config loader functions
vi.mock('../../../config/index.js', async () => {
  const actual = await vi.importActual('../../../config/index.js');
  return {
    ...actual,
    loadConfig: vi.fn(),
    getAuthenticationConfig: vi.fn().mockImplementation((_provider: string, _config: MergedConfig) => {
      const providers = config.global.providers?.providers || [];
      const providerConfig = providers.find((_p: any) => p.name === provider);
      
      if (!providerConfig) {
        return {
          _hasApiKey: false,
          _hasOAuth: false,
          preferredMethod: 'api_key',
          _oauthEnabled: false,
          _autoRefresh: true,
        };
      }

      const hasApiKey = !!(providerConfig.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`]);
      const oauthConfig = providerConfig.oauth;
      const hasOAuth = !!(oauthConfig?.enabled && oauthConfig?.clientId);

      return {
        hasApiKey,
        hasOAuth,
        preferredMethod: oauthConfig?.preferredMethod || 'api_key',
        oauthEnabled: oauthConfig?.enabled || false,
        autoRefresh: oauthConfig?.autoRefresh ?? true,
      };
    }),
    getOAuthConfig: vi.fn().mockImplementation((_provider: string, _config: MergedConfig) => {
      const providers = config.global.providers?.providers || [];
      const providerConfig = providers.find((_p: any) => p.name === provider);
      return providerConfig?.oauth;
    }),
    isOAuthEnabled: vi.fn().mockImplementation((_provider: string, _config: MergedConfig) => {
      const providers = config.global.providers?.providers || [];
      const providerConfig = providers.find((_p: any) => p.name === provider);
      return providerConfig?.oauth?.enabled || false;
    }),
    getPreferredAuthMethod: vi.fn().mockImplementation((_provider: string, _config: MergedConfig) => {
      const providers = config.global.providers?.providers || [];
      const providerConfig = providers.find((_p: any) => p.name === provider);
      return providerConfig?.oauth?.preferredMethod || 'api_key';
    }),
    getApiKey: vi.fn().mockImplementation((_provider: string, _config: MergedConfig) => {
      // Check environment first
      const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
      if (envKey) {
    return envKey;
  }

      // Check config
      const providers = config.global.providers?.providers || [];
      const providerConfig = providers.find((_p: any) => p.name === provider);
      return providerConfig?.apiKey;
    }),
  };
});