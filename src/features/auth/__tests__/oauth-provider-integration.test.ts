/**
 * @fileoverview OAuth Provider Integration Tests
 * @module features/auth/__tests__/oauth-provider-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ModelProvider } from '../../../shared/types/models.js';
import { 
  OAuthManager,
  AuthenticationManager,
  TokenStore,
  PKCEGenerator,
  CallbackServer,
  BrowserLauncher,
} from '../index.js';
import { ProviderManager, createProviderManagerWithOAuth } from '../../model/provider-manager.js';
import '../../model/adapters/index.js'; // Ensure adapters are registered
import { loadConfig, getAuthenticationConfig } from '../../../config/index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('OAuth Provider Integration', () => {
  let oauthManager: OAuthManager;
  let authManager: AuthenticationManager;
  let providerManager: ProviderManager;
  let tokenStore: TokenStore;
  let pkceGenerator: PKCEGenerator;
  let callbackServer: CallbackServer;
  let browserLauncher: BrowserLauncher;

  const mockWorkspaceRoot = '/test/workspace';
  const testProvider: ModelProvider = 'google';

  beforeEach(async () => {
    // Mock configuration loading first
    vi.mocked(loadConfig).mockReturnValue({
      global: {
        defaultProvider: 'google',
        defaultModel: 'gemini-pro',
        providers: {
          providers: [
            {
              name: 'google',
              enabled: true,
              priority: 100,
              oauth: {
                enabled: true,
                clientId: 'test-client-id',
                preferredMethod: 'oauth',
                autoRefresh: true,
              },
            },
          ],
        },
      },
      project: undefined,
      policy: {
        allowNet: true,
        allowExec: true,
        autoApproveRead: true,
        autoApproveWrite: false,
        blockedCommands: [],
        maxFileSize: 1024 * 1024,
        executionTimeout: 30000,
      },
    } as any);

    vi.mocked(getAuthenticationConfig).mockReturnValue({
      hasApiKey: false,
      hasOAuth: true,
      preferredMethod: 'oauth',
      oauthEnabled: true,
      autoRefresh: true,
    });

    // Create OAuth components with mocks
    tokenStore = {
      storeTokens: vi.fn(),
      getTokens: vi.fn(),
      clearTokens: vi.fn(),
      isTokenValid: vi.fn(),
      refreshIfNeeded: vi.fn(),
    } as any;

    pkceGenerator = {
      generateCodeVerifier: vi.fn(),
      generateCodeChallenge: vi.fn(),
      validateCodeVerifier: vi.fn(),
    } as any;

    callbackServer = {
      start: vi.fn(),
      stop: vi.fn(),
      waitForCallback: vi.fn(),
      handleTimeout: vi.fn(),
    } as any;

    browserLauncher = {
      launchBrowser: vi.fn(),
      closeBrowser: vi.fn(),
    } as any;
    
    oauthManager = new OAuthManager(
      tokenStore,
      pkceGenerator,
      callbackServer,
      browserLauncher
    );

    // Register mock adapters to support OAuth
    const mockAdapter = {
      getOAuthConfig: vi.fn().mockReturnValue({
        clientId: 'test-client-id',
        authorizationEndpoint: 'https://example.com/auth',
        tokenEndpoint: 'https://example.com/token',
        scopes: ['test'],
        redirectUri: 'http://localhost:8080/callback',
      }),
      exchangeCodeForTokens: vi.fn(),
      refreshAccessToken: vi.fn(),
      revokeTokens: vi.fn(),
      validateTokens: vi.fn().mockReturnValue(true),
    };
    oauthManager.registerProvider('google', mockAdapter as any);
    oauthManager.registerProvider('anthropic', mockAdapter as any);

    authManager = new AuthenticationManager(oauthManager);

    // Create provider manager with OAuth integration
    providerManager = createProviderManagerWithOAuth(
      authManager,
      mockWorkspaceRoot,
      {
        enableHealthChecking: false, // Disable for tests
      }
    );
  });

  afterEach(async () => {
    if (providerManager) {
      await providerManager.destroy();
    }
    if (authManager) {
      await authManager.destroy();
    }
    vi.clearAllMocks();
  });

  // =============================================================================
  // PROVIDER MANAGER OAUTH INTEGRATION
  // =============================================================================

  describe('Provider Manager OAuth Integration', () => {
    it('should initialize OAuth configurations from config', async () => {
      // The provider manager should have initialized OAuth configs in constructor
      const authStatus = await authManager.getProviderAuthStatus(testProvider);
      
      expect(authStatus.provider).toBe(testProvider);
      expect(authStatus.fallbackAvailable).toBe(false); // No API key in test config
    });

    it('should update OAuth configuration for specific provider', async () => {
      // Update OAuth config
      providerManager.updateProviderOAuthConfig(testProvider, mockWorkspaceRoot);
      
      // Verify configuration was updated
      const authStatus = await authManager.getProviderAuthStatus(testProvider);
      expect(authStatus.provider).toBe(testProvider);
    });

    it('should get OAuth configuration status for all providers', async () => {
      // Register a provider first
      providerManager.registerProvider({
        provider: testProvider,
        model: 'gemini-pro',
        enabled: true,
        priority: 100,
      });

      const configStatus = providerManager.getOAuthConfigurationStatus(mockWorkspaceRoot);
      
      expect(configStatus).toHaveLength(1);
      expect(configStatus[0]).toMatchObject({
        provider: testProvider,
        oauthEnabled: true,
        hasApiKey: false,
        preferredMethod: 'oauth',
        configurationValid: true,
      });
    });

    it('should include OAuth status in provider info', async () => {
      // Register a provider
      providerManager.registerProvider({
        provider: testProvider,
        model: 'gemini-pro',
        enabled: true,
        priority: 100,
      });

      const providers = await providerManager.getAvailableProviders();
      
      expect(providers).toHaveLength(1);
      expect(providers[0].authStatus).toBeDefined();
      expect(providers[0].authStatus?.method).toBe('oauth');
      expect(providers[0].authStatus?.authenticated).toBe(false); // Not authenticated yet
    });

    it('should check OAuth support for providers', async () => {
      // Mock OAuth manager to support Google
      vi.spyOn(oauthManager, 'supportsOAuth').mockReturnValue(true);

      const supportsOAuth = providerManager.supportsOAuth(testProvider);
      expect(supportsOAuth).toBe(true);
    });

    it('should get OAuth support status for all providers', async () => {
      // Register providers
      providerManager.registerProvider({
        provider: 'google',
        model: 'gemini-pro',
        enabled: true,
        priority: 100,
      });

      providerManager.registerProvider({
        provider: 'anthropic',
        model: 'claude-3',
        enabled: true,
        priority: 90,
      });

      // Mock OAuth support
      vi.spyOn(oauthManager, 'supportsOAuth').mockImplementation((provider) => {
        return provider === 'google';
      });

      const oauthStatus = providerManager.getOAuthSupportStatus();
      
      expect(oauthStatus).toHaveLength(2);
      
      const googleStatus = oauthStatus.find(s => s.provider === 'google');
      expect(googleStatus?.supportsOAuth).toBe(true);
      
      const anthropicStatus = oauthStatus.find(s => s.provider === 'anthropic');
      expect(anthropicStatus?.supportsOAuth).toBe(false);
    });
  });

  // =============================================================================
  // AUTHENTICATION FLOW INTEGRATION
  // =============================================================================

  describe('Authentication Flow Integration', () => {
    beforeEach(() => {
      // Register test provider
      providerManager.registerProvider({
        provider: testProvider,
        model: 'gemini-pro',
        enabled: true,
        priority: 100,
      });

      // Configure authentication
      authManager.configureProvider(testProvider, {
        preferredMethod: 'oauth',
        oauthEnabled: true,
        enableFallback: false,
      });
    });

    it('should authenticate using OAuth when preferred', async () => {
      // Mock successful OAuth flow
      vi.spyOn(oauthManager, 'initiateFlow').mockResolvedValue({
        success: true,
        provider: testProvider,
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: new Date(Date.now() + 3600000),
          tokenType: 'Bearer',
        },
      });

      const result = await authManager.authenticate(testProvider);
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('oauth');
      expect(result.credential).toBe('test-access-token');
      expect(result.usedFallback).toBe(false);
    });

    it('should ensure valid authentication with token refresh', async () => {
      // Mock token store to return expired tokens
      vi.spyOn(tokenStore, 'getTokens').mockResolvedValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() - 1000), // Expired
        tokenType: 'Bearer',
      });

      // Mock successful token refresh
      vi.spyOn(oauthManager, 'refreshTokens').mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      });

      const result = await authManager.ensureValidAuthentication(testProvider);
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('oauth');
      expect(result.credential).toBe('new-access-token');
    });

    it('should get comprehensive authentication status', async () => {
      // Mock authentication status
      vi.spyOn(oauthManager, 'getAuthStatus').mockResolvedValue({
        authenticated: true,
        expiresAt: new Date(Date.now() + 3600000),
        needsRefresh: false,
        provider: testProvider,
      });

      const status = await authManager.getProviderAuthStatus(testProvider);
      
      expect(status.provider).toBe(testProvider);
      expect(status.currentMethod).toBe('oauth');
      expect(status.authenticated).toBe(true);
      expect(status.needsRefresh).toBe(false);
    });

    it('should handle authentication method priority', async () => {
      // Configure with both OAuth and API key
      authManager.configureProvider(testProvider, {
        preferredMethod: 'oauth',
        oauthEnabled: true,
        apiKey: 'test-api-key',
        enableFallback: true,
      });

      // Mock OAuth failure
      vi.spyOn(oauthManager, 'initiateFlow').mockRejectedValue(new Error('OAuth failed'));

      const result = await authManager.authenticate(testProvider);
      
      expect(result.success).toBe(true);
      expect(result.method).toBe('api_key');
      expect(result.credential).toBe('test-api-key');
      expect(result.usedFallback).toBe(true);
    });
  });

  // =============================================================================
  // PROVIDER ADAPTER INTEGRATION
  // =============================================================================

  describe('Provider Adapter Integration', () => {
    beforeEach(() => {
      // Register test provider
      providerManager.registerProvider({
        provider: testProvider,
        model: 'gemini-pro',
        enabled: true,
        priority: 100,
      });
    });

    it('should create adapter with OAuth authentication', async () => {
      // Mock successful authentication
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      vi.spyOn(authManager, 'ensureValidAuthentication').mockResolvedValue({
        success: true,
        method: 'oauth',
        credential: 'test-access-token',
        usedFallback: false,
      });

      // This should not throw an error
      const adapter = await providerManager.getAdapter({
        provider: testProvider,
        model: 'gemini-pro',
        enabled: true,
        priority: 100,
      });

      expect(adapter).toBeDefined();
    });

    it('should validate provider with OAuth authentication', async () => {
      // Mock successful authentication status
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      const isValid = await providerManager.validateProvider(testProvider);
      expect(isValid).toBe(true);
    });

    it('should handle OAuth token refresh during validation', async () => {
      // Mock authentication status that needs refresh
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: true,
      });

      // Mock successful refresh
      vi.spyOn(authManager, 'ensureValidAuthentication').mockResolvedValue({
        success: true,
        method: 'oauth',
        credential: 'refreshed-token',
        usedFallback: false,
      });

      const isValid = await providerManager.validateProvider(testProvider);
      expect(isValid).toBe(true);
    });

    it('should handle OAuth failure with API key fallback', async () => {
      // Mock OAuth failure but API key available
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: false,
        hasApiKey: true,
        fallbackAvailable: true,
        needsRefresh: false,
      });

      vi.spyOn(authManager, 'ensureValidAuthentication').mockRejectedValue(
        new Error('OAuth refresh failed')
      );

      // Should still be valid due to API key fallback
      const isValid = await providerManager.validateProvider(testProvider);
      expect(isValid).toBe(true);
    });
  });

  // =============================================================================
  // HEALTH MONITORING INTEGRATION
  // =============================================================================

  describe('Health Monitoring Integration', () => {
    beforeEach(() => {
      // Register test provider
      providerManager.registerProvider({
        provider: testProvider,
        model: 'gemini-pro',
        enabled: true,
        priority: 100,
      });
    });

    it('should include OAuth status in health checks', async () => {
      // Mock authentication status
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      // Perform health check
      await providerManager['performProviderHealthCheck'](testProvider);

      const health = providerManager.getProviderHealth();
      const providerHealth = health.find(h => h.provider === testProvider);
      
      expect(providerHealth?.healthy).toBe(true);
    });

    it('should refresh OAuth tokens during health checks', async () => {
      // Mock authentication status that needs refresh
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: true,
      });

      // Mock successful refresh
      vi.spyOn(authManager, 'ensureValidAuthentication').mockResolvedValue({
        success: true,
        method: 'oauth',
        credential: 'refreshed-token',
        usedFallback: false,
      });

      // Perform health check
      await providerManager['performProviderHealthCheck'](testProvider);

      expect(authManager.ensureValidAuthentication).toHaveBeenCalledWith(testProvider);
    });

    it('should get authentication status for all providers', async () => {
      // Mock authentication status
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const authStatus = await providerManager.getAuthenticationStatus();
      
      expect(authStatus).toHaveLength(1);
      expect(authStatus[0]).toMatchObject({
        provider: testProvider,
        method: 'oauth',
        authenticated: true,
        needsRefresh: false,
      });
    });

    it('should refresh authentication for providers that need it', async () => {
      // Mock authentication status that needs refresh
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: true,
      });

      // Mock successful refresh
      vi.spyOn(authManager, 'ensureValidAuthentication').mockResolvedValue({
        success: true,
        method: 'oauth',
        credential: 'refreshed-token',
        usedFallback: false,
      });

      await providerManager.refreshAuthentication();

      expect(authManager.ensureValidAuthentication).toHaveBeenCalledWith(testProvider);
    });
  });
});

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock the config loader
vi.mock('../../../config/index.js', () => ({
  loadConfig: vi.fn(),
  getAuthenticationConfig: vi.fn(),
  getApiKey: vi.fn(),
  getOAuthConfig: vi.fn(),
  isOAuthEnabled: vi.fn(),
  getPreferredAuthMethod: vi.fn(),
}));