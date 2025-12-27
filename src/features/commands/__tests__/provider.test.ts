/**
 * @fileoverview Unit tests for provider command handler
 * @module features/commands/__tests__/provider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { providerCommandHandler } from '../handlers/provider.js';
import type { CommandContext } from '../types.js';

// =============================================================================
// MOCKS
// =============================================================================

// Mock the config module
vi.mock('../../../config/index.js', () => ({
  loadConfig: vi.fn(),
  validateProviderConfig: vi.fn(),
  getProviderConfig: vi.fn(),
  getAvailableProviders: vi.fn(),
  getApiKey: vi.fn(),
}));

// Import mocked functions
import { 
  loadConfig, 
  validateProviderConfig, 
  getProviderConfig, 
  getAvailableProviders,
  getApiKey 
} from '../../../config/index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Provider Command Handler', () => {
  let mockContext: CommandContext;
  let mockMessages: Array<{ role: string; content: string }>;

  beforeEach(() => {
    mockMessages = [];
    
    mockContext = {
      addMessage: vi.fn((message) => {
        mockMessages.push(message);
      }),
      setError: vi.fn(),
      showConfirmation: vi.fn(),
      workspaceRoot: '/test/workspace',
      currentModel: 'gpt-4o',
      sessionActions: {
        createNewSession: vi.fn(),
        restoreSession: vi.fn(),
        saveCurrentSession: vi.fn(),
        getSessionManager: vi.fn(),
      },
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  // =============================================================================
  // HELP COMMAND TESTS
  // =============================================================================

  describe('Help Command', () => {
    it('should show help when no subcommand provided', async () => {
      await providerCommandHandler([], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Provider Management Commands'),
      });
    });

    it('should show help for explicit help command', async () => {
      await providerCommandHandler(['help'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Provider Management Commands'),
      });
    });
  });

  // =============================================================================
  // LIST COMMAND TESTS
  // =============================================================================

  describe('List Command', () => {
    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue({
        global: {
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
        },
      } as any);

      vi.mocked(getAvailableProviders).mockReturnValue([
        {
          name: 'openai',
          enabled: true,
          priority: 100,
        },
        {
          name: 'anthropic',
          enabled: true,
          priority: 90,
        },
        {
          name: 'google',
          enabled: false,
          priority: 80,
        },
      ] as any);

      vi.mocked(getApiKey).mockImplementation((provider) => {
        return provider === 'openai' ? 'sk-test-key' : undefined;
      });
    });

    it('should list available providers', async () => {
      await providerCommandHandler(['list'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Available Providers:'),
      });
      
      const message = mockMessages[0].content;
      expect(message).toContain('openai');
      expect(message).toContain('anthropic');
      expect(message).toContain('🔑'); // API key indicator
    });

    it('should show details when requested', async () => {
      vi.mocked(getAvailableProviders).mockReturnValue([
        {
          name: 'openai',
          enabled: true,
          priority: 100,
          baseUrl: 'https://api.openai.com',
          rateLimit: {
            requestsPerMinute: 60,
            tokensPerMinute: 100000,
          },
        },
      ] as any);

      await providerCommandHandler(['list', '--details'], mockContext);
      
      const message = mockMessages[0].content;
      expect(message).toContain('Base URL:');
      expect(message).toContain('Rate Limit:');
    });

    it('should show all providers including disabled ones', async () => {
      await providerCommandHandler(['list', '--all'], mockContext);
      
      const message = mockMessages[0].content;
      expect(message).toContain('google'); // Should include disabled provider
    });

    it('should handle empty provider list', async () => {
      vi.mocked(getAvailableProviders).mockReturnValue([]);

      await providerCommandHandler(['list'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('No providers configured'),
      });
    });
  });

  // =============================================================================
  // STATUS COMMAND TESTS
  // =============================================================================

  describe('Status Command', () => {
    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue({
        global: {
          defaultProvider: 'openai',
        },
      } as any);

      vi.mocked(getProviderConfig).mockReturnValue({
        name: 'openai',
        enabled: true,
        priority: 100,
      } as any);

      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      vi.mocked(getApiKey).mockReturnValue('sk-test-key');
    });

    it('should show status for specific provider', async () => {
      await providerCommandHandler(['status', 'openai'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Status for "openai"'),
      });
    });

    it('should show status for all providers when no specific provider given', async () => {
      vi.mocked(getAvailableProviders).mockReturnValue([
        { name: 'openai', enabled: true, priority: 100 },
        { name: 'anthropic', enabled: false, priority: 90 },
      ] as any);

      await providerCommandHandler(['status'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Provider Status Overview'),
      });
    });

    it('should handle unknown provider', async () => {
      vi.mocked(getProviderConfig).mockReturnValue(undefined);

      await providerCommandHandler(['status', 'unknown'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Provider "unknown" is not available'),
      });
    });
  });

  // =============================================================================
  // SWITCH COMMAND TESTS
  // =============================================================================

  describe('Switch Command', () => {
    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue({
        global: {
          defaultProvider: 'openai',
        },
      } as any);

      vi.mocked(getProviderConfig).mockReturnValue({
        name: 'anthropic',
        enabled: true,
        priority: 90,
      } as any);

      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
    });

    it('should switch to valid provider', async () => {
      await providerCommandHandler(['switch', 'anthropic'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Switched to provider: **anthropic**'),
      });
    });

    it('should require provider argument', async () => {
      await providerCommandHandler(['switch'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Please specify a provider to switch to'),
      });
    });

    it('should handle unknown provider', async () => {
      vi.mocked(getProviderConfig).mockReturnValue(undefined);

      await providerCommandHandler(['switch', 'unknown'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Provider "unknown" is not available'),
      });
    });

    it('should handle disabled provider with confirmation', async () => {
      vi.mocked(getProviderConfig).mockReturnValue({
        name: 'anthropic',
        enabled: false,
        priority: 90,
      } as any);

      vi.mocked(mockContext.showConfirmation).mockResolvedValue(true);

      await providerCommandHandler(['switch', 'anthropic'], mockContext);
      
      expect(mockContext.showConfirmation).toHaveBeenCalledWith(
        expect.stringContaining('Provider "anthropic" is disabled'),
        expect.any(String)
      );
    });

    it('should handle validation errors', async () => {
      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: false,
        errors: ['Missing API key'],
        warnings: [],
      });

      await providerCommandHandler(['switch', 'anthropic'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('configuration errors'),
      });
    });
  });

  // =============================================================================
  // VALIDATE COMMAND TESTS
  // =============================================================================

  describe('Validate Command', () => {
    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue({} as any);
      vi.mocked(getProviderConfig).mockReturnValue({
        name: 'openai',
        enabled: true,
        priority: 100,
      } as any);
      vi.mocked(getApiKey).mockReturnValue('sk-test-key');
    });

    it('should validate provider configuration', async () => {
      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      await providerCommandHandler(['validate', 'openai'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Configuration is valid'),
      });
    });

    it('should show validation errors', async () => {
      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: false,
        errors: ['Missing API key', 'Invalid base URL'],
        warnings: ['Provider is disabled'],
      });

      await providerCommandHandler(['validate', 'openai'], mockContext);
      
      const message = mockMessages[0].content;
      expect(message).toContain('Configuration has errors');
      expect(message).toContain('Missing API key');
      expect(message).toContain('Invalid base URL');
      expect(message).toContain('Provider is disabled');
    });

    it('should require provider argument', async () => {
      await providerCommandHandler(['validate'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Please specify a provider to validate'),
      });
    });
  });

  // =============================================================================
  // TEST COMMAND TESTS
  // =============================================================================

  describe('Test Command', () => {
    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue({} as any);
      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
    });

    it('should test provider connectivity', async () => {
      await providerCommandHandler(['test', 'openai'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Testing connectivity to "openai"'),
      });
    });

    it('should handle validation errors before testing', async () => {
      vi.mocked(validateProviderConfig).mockReturnValue({
        valid: false,
        errors: ['Missing API key'],
        warnings: [],
      });

      await providerCommandHandler(['test', 'openai'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('configuration errors'),
      });
    });

    it('should require provider argument', async () => {
      await providerCommandHandler(['test'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Please specify a provider to test'),
      });
    });
  });

  // =============================================================================
  // UI COMMAND TESTS
  // =============================================================================

  describe('UI Command', () => {
    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue({
        global: {
          defaultProvider: 'openai',
        },
      } as any);

      vi.mocked(getAvailableProviders).mockReturnValue([
        { name: 'openai', enabled: true, priority: 100 },
        { name: 'anthropic', enabled: true, priority: 90 },
      ] as any);

      vi.mocked(getApiKey).mockImplementation((provider) => {
        return provider === 'openai' ? 'sk-test-key' : undefined;
      });
    });

    it('should show provider selection UI', async () => {
      await providerCommandHandler(['ui'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Provider Selection UI'),
      });
    });

    it('should handle select alias', async () => {
      await providerCommandHandler(['select'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Provider Selection UI'),
      });
    });
  });

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle unknown subcommand', async () => {
      await providerCommandHandler(['unknown'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Unknown provider subcommand: unknown'),
      });
    });

    it('should handle config loading errors', async () => {
      vi.mocked(loadConfig).mockImplementation(() => {
        throw new Error('Config load failed');
      });

      await providerCommandHandler(['list'], mockContext);
      
      expect(mockContext.setError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list providers')
      );
    });

    it('should handle validation errors', async () => {
      vi.mocked(loadConfig).mockReturnValue({} as any);
      vi.mocked(validateProviderConfig).mockImplementation(() => {
        throw new Error('Validation failed');
      });

      await providerCommandHandler(['validate', 'openai'], mockContext);
      
      expect(mockContext.setError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to validate provider')
      );
    });
  });

  // =============================================================================
  // COMMAND ALIASES TESTS
  // =============================================================================

  describe('Command Aliases', () => {
    beforeEach(() => {
      vi.mocked(loadConfig).mockReturnValue({
        global: { defaultProvider: 'openai' },
      } as any);
      vi.mocked(getAvailableProviders).mockReturnValue([]);
    });

    it('should handle ls alias for list', async () => {
      await providerCommandHandler(['ls'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Available Providers'),
      });
    });

    it('should handle use alias for switch', async () => {
      await providerCommandHandler(['use'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Please specify a provider to switch to'),
      });
    });

    it('should handle check alias for validate', async () => {
      await providerCommandHandler(['check'], mockContext);
      
      expect(mockContext.addMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content: expect.stringContaining('Please specify a provider to validate'),
      });
    });
  });
});