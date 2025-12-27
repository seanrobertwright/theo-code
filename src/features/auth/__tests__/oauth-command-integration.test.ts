/**
 * @fileoverview OAuth Command Interface Integration Tests
 * @module features/auth/__tests__/oauth-command-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ModelProvider } from '../../../shared/types/models.js';
import type { CommandContext } from '../../commands/types.js';
import {
  authCommandHandler,
  authContextHelpers
} from '../../commands/handlers/auth.js';
import { providerCommandHandler } from '../../commands/handlers/provider.js';
import {
  OAuthManager,
  AuthenticationManager,
} from '../index.js';

// Mock the config module
vi.mock('../../../config/index.js', () => ({
  loadConfig: vi.fn(),
  validateProviderConfig: vi.fn(),
  getProviderConfig: vi.fn(),
  getAvailableProviders: vi.fn(),
  getApiKey: vi.fn(),
  getAuthenticationConfig: vi.fn(),
  isOAuthEnabled: vi.fn(),
  getPreferredAuthMethod: vi.fn(),
}));

import { 
  loadConfig, 
  validateProviderConfig, 
  getProviderConfig, 
  getAvailableProviders,
  getApiKey,
  getAuthenticationConfig
} from '../../../config/index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('OAuth Command Interface Integration', () => {
  let mockContext: CommandContext;
  let oauthManager: OAuthManager;
  let authManager: AuthenticationManager;

  const testProvider: ModelProvider = 'google';

  beforeEach(() => {
    // Create OAuth components with mocks
    oauthManager = {
      supportsOAuth: vi.fn().mockReturnValue(true),
      getSupportedProviders: vi.fn().mockReturnValue(['google', 'openrouter']),
      initiateFlow: vi.fn().mockResolvedValue({
        success: true,
        provider: testProvider,
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: new Date(Date.now() + 3600000),
          tokenType: 'Bearer',
        },
      }),
      revokeTokens: vi.fn().mockResolvedValue(undefined),
      refreshTokens: vi.fn().mockResolvedValue({
        accessToken: 'refreshed-access-token',
        refreshToken: 'refreshed-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      }),
      getAuthStatus: vi.fn().mockResolvedValue({
        authenticated: true,
        expiresAt: new Date(Date.now() + 3600000),
        needsRefresh: false,
        provider: testProvider,
      }),
    } as any;

    authManager = new AuthenticationManager(oauthManager);

    // Mock command context
    mockContext = {
      workspaceRoot: '/test/workspace',
      currentModel: 'gemini-pro',
      addMessage: vi.fn(),
      setError: vi.fn(),
      showConfirmation: vi.fn().mockResolvedValue(true),
      sessionActions: {
        createNewSession: vi.fn(),
        restoreSession: vi.fn(),
        saveCurrentSession: vi.fn(),
        getSessionManager: vi.fn(),
      },
    } as any;

    // Mock authentication manager methods - set authenticated: false by default
    vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
      provider: testProvider,
      currentMethod: 'none',
      authenticated: false,
      hasApiKey: false,
      fallbackAvailable: false,
      needsRefresh: false,
    });
    vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([
      {
        provider: testProvider,
        currentMethod: 'none',
        authenticated: false,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      },
    ]);
    vi.spyOn(authManager, 'clearAuthentication').mockResolvedValue();

    // Mock the helper functions that get managers from context
    vi.spyOn(authContextHelpers, 'getOAuthManager').mockReturnValue(oauthManager as any);
    vi.spyOn(authContextHelpers, 'getAuthenticationManager').mockReturnValue(authManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // =============================================================================
  // AUTH LOGIN COMMAND
  // =============================================================================

  describe('/auth login command', () => {
    it('should handle successful OAuth login', async () => {
      // For a new login, user should not be already authenticated
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'none',
        authenticated: false,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      await authCommandHandler(['login', testProvider], mockContext);

      expect(oauthManager.initiateFlow).toHaveBeenCalledWith(testProvider);
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Authentication Successful'),
        })
      );
    });

    it('should handle OAuth login failure', async () => {
      vi.spyOn(oauthManager, 'initiateFlow').mockResolvedValue({
        success: false,
        provider: testProvider,
        error: 'OAuth flow failed',
      });

      await authCommandHandler(['login', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('OAuth'),
        })
      );
    });

    it('should handle unsupported provider', async () => {
      vi.spyOn(oauthManager, 'supportsOAuth').mockReturnValue(false);

      await authCommandHandler(['login', 'unsupported'], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('OAuth Not Supported'),
        })
      );
    });

    it('should handle already authenticated provider', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await authCommandHandler(['login', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Already Authenticated'),
        })
      );
    });

    it('should handle missing provider argument', async () => {
      await authCommandHandler(['login'], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Missing Provider'),
        })
      );
    });
  });

  // =============================================================================
  // AUTH LOGOUT COMMAND
  // =============================================================================

  describe('/auth logout command', () => {
    it('should handle successful OAuth logout', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      await authCommandHandler(['logout', testProvider], mockContext);

      expect(oauthManager.revokeTokens).toHaveBeenCalledWith(testProvider);
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Logout Successful'),
        })
      );
    });

    it('should handle logout from non-authenticated provider', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: false,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      await authCommandHandler(['logout', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Not Authenticated'),
        })
      );
    });

    it('should show confirmation dialog for OAuth logout', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      await authCommandHandler(['logout', testProvider], mockContext);

      expect(mockContext.showConfirmation).toHaveBeenCalledWith(
        expect.stringContaining('Log out from'),
        expect.stringContaining('revoke your OAuth authentication')
      );
    });

    it('should handle cancelled logout', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      vi.mocked(mockContext.showConfirmation).mockResolvedValue(false);

      await authCommandHandler(['logout', testProvider], mockContext);

      expect(oauthManager.revokeTokens).not.toHaveBeenCalled();
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Logout Cancelled'),
        })
      );
    });

    it('should handle logout failure', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      vi.spyOn(oauthManager, 'revokeTokens').mockRejectedValue(new Error('Logout failed'));

      await authCommandHandler(['logout', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Logout'),
        })
      );
    });
  });

  // =============================================================================
  // AUTH STATUS COMMAND
  // =============================================================================

  describe('/auth status command', () => {
    it('should display authentication status for all providers', async () => {
      vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([
        {
          provider: testProvider,
          currentMethod: 'oauth',
          authenticated: true,
          hasApiKey: false,
          fallbackAvailable: false,
          needsRefresh: false,
          expiresAt: new Date(Date.now() + 3600000),
        },
      ]);

      await authCommandHandler(['status'], mockContext);

      expect(authManager.getAllProviderAuthStatus).toHaveBeenCalled();
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Authentication Status'),
        })
      );
    });

    it('should handle no configured providers', async () => {
      vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([]);

      await authCommandHandler(['status'], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('No providers are configured'),
        })
      );
    });

    it('should display OAuth and API key authentication methods', async () => {
      vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([
        {
          provider: 'google',
          currentMethod: 'oauth',
          authenticated: true,
          hasApiKey: false,
          fallbackAvailable: false,
          needsRefresh: false,
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          provider: 'anthropic',
          currentMethod: 'api_key',
          authenticated: true,
          hasApiKey: true,
          fallbackAvailable: false,
          needsRefresh: false,
        },
      ]);

      await authCommandHandler(['status'], mockContext);

      const message = vi.mocked(mockContext.addMessage).mock.calls[0][0];
      expect(message.content).toContain('google');
      expect(message.content).toContain('anthropic');
      expect(message.content).toContain('oauth');
      expect(message.content).toContain('api_key');
    });

    it('should show tokens that need refresh', async () => {
      vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([
        {
          provider: testProvider,
          currentMethod: 'oauth',
          authenticated: true,
          hasApiKey: false,
          fallbackAvailable: false,
          needsRefresh: true,
          expiresAt: new Date(Date.now() + 300000), // 5 minutes
        },
      ]);

      await authCommandHandler(['status'], mockContext);

      const message = vi.mocked(mockContext.addMessage).mock.calls[0][0];
      expect(message.content).toContain('needs refresh');
    });
  });

  // =============================================================================
  // AUTH REFRESH COMMAND
  // =============================================================================

  describe('/auth refresh command', () => {
    it('should handle successful token refresh', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: true,
        expiresAt: new Date(Date.now() + 300000), // 5 minutes
      });

      await authCommandHandler(['refresh', testProvider], mockContext);

      expect(oauthManager.refreshTokens).toHaveBeenCalledWith(testProvider);
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Tokens Refreshed Successfully'),
        })
      );
    });

    it('should handle refresh for non-authenticated provider', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: false,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      await authCommandHandler(['refresh', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Not Authenticated'),
        })
      );
    });

    it('should handle refresh for API key authentication', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'api_key',
        authenticated: true,
        hasApiKey: true,
        fallbackAvailable: false,
        needsRefresh: false,
      });

      await authCommandHandler(['refresh', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('API Key Authentication'),
        })
      );
    });

    it('should handle tokens that do not need refresh', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: false,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
      });

      await authCommandHandler(['refresh', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Tokens Still Valid'),
        })
      );
    });

    it('should handle refresh failure', async () => {
      vi.spyOn(authManager, 'getProviderAuthStatus').mockResolvedValue({
        provider: testProvider,
        currentMethod: 'oauth',
        authenticated: true,
        hasApiKey: false,
        fallbackAvailable: false,
        needsRefresh: true,
      });

      vi.spyOn(oauthManager, 'refreshTokens').mockRejectedValue(new Error('Refresh failed'));

      await authCommandHandler(['refresh', testProvider], mockContext);

      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Token Refresh'),
        })
      );
    });
  });

  // =============================================================================
  // AUTH LIST COMMAND
  // =============================================================================

  describe('/auth list command', () => {
    it('should list OAuth supported providers', async () => {
      vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([
        {
          provider: 'google',
          currentMethod: 'oauth',
          authenticated: true,
          hasApiKey: false,
          fallbackAvailable: false,
          needsRefresh: false,
        },
      ]);

      await authCommandHandler(['list'], mockContext);

      expect(oauthManager.getSupportedProviders).toHaveBeenCalled();
      expect(mockContext.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Available Authentication Methods'),
        })
      );
    });

    it('should show OAuth and API key providers separately', async () => {
      vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([
        {
          provider: 'google',
          currentMethod: 'oauth',
          authenticated: true,
          hasApiKey: false,
          fallbackAvailable: false,
          needsRefresh: false,
        },
        {
          provider: 'anthropic',
          currentMethod: 'api_key',
          authenticated: true,
          hasApiKey: true,
          fallbackAvailable: false,
          needsRefresh: false,
        },
      ]);

      await authCommandHandler(['list'], mockContext);

      const message = vi.mocked(mockContext.addMessage).mock.calls[0][0];
      expect(message.content).toContain('OAuth Supported Providers');
      expect(message.content).toContain('API Key Only Providers');
    });

    it('should show authentication status for each provider', async () => {
      vi.spyOn(authManager, 'getAllProviderAuthStatus').mockResolvedValue([
        {
          provider: 'google',
          currentMethod: 'oauth',
          authenticated: true,
          hasApiKey: false,
          fallbackAvailable: false,
          needsRefresh: false,
        },
      ]);

      await authCommandHandler(['list'], mockContext);

      const message = vi.mocked(mockContext.addMessage).mock.calls[0][0];
      expect(message.content).toContain('✅'); // Authenticated indicator
    });
  });

  // =============================================================================
  // PROVIDER COMMAND INTEGRATION
  // =============================================================================

  describe('Provider command OAuth integration', () => {
    beforeEach(() => {
      // Mock config loading for provider commands
      vi.mocked(loadConfig).mockReturnValue({
        global: {
          defaultProvider: 'google',
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
      } as any);
      
      vi.mocked(getAuthenticationConfig).mockReturnValue({
        hasApiKey: false,
        hasOAuth: true,
        preferredMethod: 'oauth',
        oauthEnabled: true,
        autoRefresh: true,
      } as any);
      
      vi.mocked(getAvailableProviders).mockReturnValue([
        {
          name: 'google',
          enabled: true,
          priority: 100,
        },
      ] as any);
      
      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      
      vi.mocked(getProviderConfig).mockReturnValue({
        name: 'google',
        enabled: true,
        priority: 100,
      } as any);
      
      vi.mocked(getApiKey).mockReturnValue(undefined);
    });

    it('should show OAuth status in provider list', async () => {
      await providerCommandHandler(['list', '--details'], mockContext);

      const message = vi.mocked(mockContext.addMessage).mock.calls[0][0];
      expect(message.content).toContain('OAuth');
      expect(message.content).toContain('Authentication');
    });

    it('should show OAuth configuration in provider status', async () => {
      await providerCommandHandler(['status', 'google'], mockContext);

      const message = vi.mocked(mockContext.addMessage).mock.calls[0][0];
      expect(message.content).toContain('Authentication');
      expect(message.content).toContain('OAuth');
    });

    it('should validate OAuth configuration in provider validation', async () => {
      await providerCommandHandler(['validate', 'google'], mockContext);

      const message = vi.mocked(mockContext.addMessage).mock.calls[0][0];
      expect(message.content).toContain('Configuration is valid');
    });
  });

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================
  
      describe('Command error handling', () => {
        it('should handle OAuth service unavailable', async () => {
          vi.spyOn(authContextHelpers, 'getOAuthManager').mockReturnValue(null);
          vi.spyOn(authContextHelpers, 'getAuthenticationManager').mockReturnValue(null);
    
          await authCommandHandler(['login', testProvider], mockContext);
    
          expect(mockContext.addMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              role: 'assistant',
              content: expect.stringContaining('OAuth services not available'),
            })
          );
        });  
      it('should handle authentication manager errors', async () => {
        vi.spyOn(authManager, 'getAllProviderAuthStatus').mockRejectedValue(
          new Error('Authentication manager error')
        );
  
        await authCommandHandler(['status'], mockContext);
  
        expect(mockContext.addMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            role: 'assistant',
            content: expect.stringContaining('Status Error'),
          })
        );
      });
  
      it('should handle OAuth manager errors', async () => {
        vi.spyOn(oauthManager, 'initiateFlow').mockRejectedValue(
          new Error('OAuth manager error')
        );
  
        await authCommandHandler(['login', testProvider], mockContext);
  
        expect(mockContext.setError).toHaveBeenCalledWith(
          expect.stringContaining('Authentication failed')
        );
      });
    });
  });