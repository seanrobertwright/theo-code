/**
 * @fileoverview Unit tests for provider selection UI components
 * @module shared/components/__tests__/provider-selection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { 
  ProviderSelection, 
  ProviderStatus, 
  ProviderConfigWizard,
  type ProviderSelectionProps,
  type ProviderStatusProps,
  type ProviderConfigWizardProps 
} from '../ProviderSelection/index.js';
import type { ProviderConfig } from '../../../config/index.js';

// =============================================================================
// TEST DATA
// =============================================================================

const mockProviders: ProviderConfig[] = [
  {
    name: 'openai',
    enabled: true,
    priority: 100,
    apiKey: 'sk-test-key',
  },
  {
    name: 'anthropic',
    enabled: true,
    priority: 90,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000,
      concurrentRequests: 5,
    },
  },
  {
    name: 'google',
    enabled: false,
    priority: 80,
    baseUrl: 'https://custom-google-api.com',
  },
];

// =============================================================================
// PROVIDER SELECTION TESTS
// =============================================================================

describe('ProviderSelection Component', () => {
  let mockProps: ProviderSelectionProps;

  beforeEach(() => {
    mockProps = {
      providers: mockProviders,
      currentProvider: 'openai',
      onProviderSelected: vi.fn(),
      onCancel: vi.fn(),
      showDetails: false,
      maxDisplayProviders: 10,
      title: 'Select AI Provider',
    };
  });

  it('should render provider list', () => {
    const { lastFrame } = render(<ProviderSelection {...mockProps} />);
    
    expect(lastFrame()).toContain('Select AI Provider');
    expect(lastFrame()).toContain('openai');
    expect(lastFrame()).toContain('anthropic');
    expect(lastFrame()).toContain('google');
  });

  it('should show current provider indicator', () => {
    const { lastFrame } = render(<ProviderSelection {...mockProps} />);
    
    expect(lastFrame()).toContain('🎯'); // Current provider indicator
  });

  it('should show provider status icons', () => {
    const { lastFrame } = render(<ProviderSelection {...mockProps} />);
    
    expect(lastFrame()).toContain('✅'); // Enabled providers
    expect(lastFrame()).toContain('❌'); // Disabled provider (google)
  });

  it('should show details when requested', () => {
    const detailedProps = { ...mockProps, showDetails: true };
    const { lastFrame } = render(<ProviderSelection {...detailedProps} />);
    
    expect(lastFrame()).toContain('priority:');
    expect(lastFrame()).toContain('OpenAI GPT models'); // Description
  });

  it('should show navigation instructions', () => {
    const { lastFrame } = render(<ProviderSelection {...mockProps} />);
    
    expect(lastFrame()).toContain('↑/↓: Navigate');
    expect(lastFrame()).toContain('Enter: Select');
    expect(lastFrame()).toContain('Esc: Cancel');
  });

  it('should handle empty provider list', () => {
    const emptyProps = { ...mockProps, providers: [] };
    const { lastFrame } = render(<ProviderSelection {...emptyProps} />);
    
    expect(lastFrame()).toContain('No Providers Available');
    expect(lastFrame()).toContain('Press Escape to cancel');
  });

  it('should limit displayed providers', () => {
    const limitedProps = { ...mockProps, maxDisplayProviders: 2 };
    const { lastFrame } = render(<ProviderSelection {...limitedProps} />);
    
    // Should only show first 2 providers
    expect(lastFrame()).toContain('openai');
    expect(lastFrame()).toContain('anthropic');
    // Should not show google (3rd provider)
    expect(lastFrame()).not.toContain('google');
  });

  it('should show disabled provider warning', () => {
    const detailedProps = { ...mockProps, showDetails: true };
    const { lastFrame } = render(<ProviderSelection {...detailedProps} />);
    
    expect(lastFrame()).toContain('Provider is disabled');
  });

  it('should show rate limit information in details', () => {
    const detailedProps = { ...mockProps, showDetails: true };
    const { lastFrame } = render(<ProviderSelection {...detailedProps} />);
    
    expect(lastFrame()).toContain('Rate Limits:');
    expect(lastFrame()).toContain('60 req/min');
    expect(lastFrame()).toContain('100000 tokens/min');
  });

  it('should show base URL in details', () => {
    const detailedProps = { ...mockProps, showDetails: true };
    const { lastFrame } = render(<ProviderSelection {...detailedProps} />);
    
    expect(lastFrame()).toContain('Base URL:');
    expect(lastFrame()).toContain('https://custom-google-api.com');
  });
});

// =============================================================================
// PROVIDER STATUS TESTS
// =============================================================================

describe('ProviderStatus Component', () => {
  let mockProps: ProviderStatusProps;

  beforeEach(() => {
    mockProps = {
      providers: mockProviders,
      currentProvider: 'openai',
      showDetails: true,
      onClose: vi.fn(),
    };
  });

  it('should render provider status overview', () => {
    const { lastFrame } = render(<ProviderStatus {...mockProps} />);
    
    expect(lastFrame()).toContain('Provider Status');
    expect(lastFrame()).toContain('Ready Providers');
    expect(lastFrame()).toContain('Disabled Providers');
  });

  it('should show ready providers count', () => {
    const { lastFrame } = render(<ProviderStatus {...mockProps} />);
    
    expect(lastFrame()).toContain('Ready Providers (2)'); // openai and anthropic
  });

  it('should show disabled providers count', () => {
    const { lastFrame } = render(<ProviderStatus {...mockProps} />);
    
    expect(lastFrame()).toContain('Disabled Providers (1)'); // google
  });

  it('should indicate current provider', () => {
    const { lastFrame } = render(<ProviderStatus {...mockProps} />);
    
    expect(lastFrame()).toContain('🎯 (current)');
  });

  it('should show priority information when details enabled', () => {
    const { lastFrame } = render(<ProviderStatus {...mockProps} />);
    
    expect(lastFrame()).toContain('priority: 100');
    expect(lastFrame()).toContain('priority: 90');
  });

  it('should handle no ready providers', () => {
    const noReadyProps = {
      ...mockProps,
      providers: [{ ...mockProviders[2] }], // Only disabled provider
    };
    const { lastFrame } = render(<ProviderStatus {...noReadyProps} />);
    
    expect(lastFrame()).toContain('No providers are ready');
  });

  it('should show close instructions', () => {
    const { lastFrame } = render(<ProviderStatus {...mockProps} />);
    
    expect(lastFrame()).toContain('Press Enter or Escape to close');
  });
});

// =============================================================================
// PROVIDER CONFIG WIZARD TESTS
// =============================================================================

describe('ProviderConfigWizard Component', () => {
  let mockProps: ProviderConfigWizardProps;

  beforeEach(() => {
    mockProps = {
      provider: 'anthropic',
      currentConfig: mockProviders[1],
      onConfigSaved: vi.fn(),
      onCancel: vi.fn(),
    };
  });

  it('should render configuration wizard', () => {
    const { lastFrame } = render(<ProviderConfigWizard {...mockProps} />);
    
    expect(lastFrame()).toContain('Provider Configuration Wizard');
    expect(lastFrame()).toContain('Configure anthropic provider settings');
  });

  it('should show placeholder message', () => {
    const { lastFrame } = render(<ProviderConfigWizard {...mockProps} />);
    
    expect(lastFrame()).toContain('placeholder for the configuration wizard');
    expect(lastFrame()).toContain('Full implementation requires form handling');
  });

  it('should show cancel instructions', () => {
    const { lastFrame } = render(<ProviderConfigWizard {...mockProps} />);
    
    expect(lastFrame()).toContain('Press Escape to cancel');
  });

  it('should handle provider without current config', () => {
    const noConfigProps = { ...mockProps, currentConfig: undefined };
    const { lastFrame } = render(<ProviderConfigWizard {...noConfigProps} />);
    
    expect(lastFrame()).toContain('Provider Configuration Wizard');
    expect(lastFrame()).toContain('Configure anthropic provider settings');
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Provider Selection Integration', () => {
  it('should handle provider selection flow', () => {
    const onProviderSelected = vi.fn();
    const props: ProviderSelectionProps = {
      providers: mockProviders,
      currentProvider: 'openai',
      onProviderSelected,
      onCancel: vi.fn(),
    };

    const { lastFrame } = render(<ProviderSelection {...props} />);
    
    // Should render selection interface
    expect(lastFrame()).toContain('Select AI Provider');
    expect(lastFrame()).toContain('▶'); // Selection indicator
    
    // Should show all providers
    expect(lastFrame()).toContain('openai');
    expect(lastFrame()).toContain('anthropic');
    expect(lastFrame()).toContain('google');
  });

  it('should handle status display flow', () => {
    const onClose = vi.fn();
    const props: ProviderStatusProps = {
      providers: mockProviders,
      currentProvider: 'openai',
      onClose,
    };

    const { lastFrame } = render(<ProviderStatus {...props} />);
    
    // Should render status overview
    expect(lastFrame()).toContain('Provider Status');
    expect(lastFrame()).toContain('Ready Providers');
    expect(lastFrame()).toContain('Disabled Providers');
  });

  it('should handle configuration wizard flow', () => {
    const onConfigSaved = vi.fn();
    const onCancel = vi.fn();
    const props: ProviderConfigWizardProps = {
      provider: 'anthropic',
      onConfigSaved,
      onCancel,
    };

    const { lastFrame } = render(<ProviderConfigWizard {...props} />);
    
    // Should render configuration wizard
    expect(lastFrame()).toContain('Provider Configuration Wizard');
    expect(lastFrame()).toContain('Configure anthropic provider settings');
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('Provider Selection Accessibility', () => {
  it('should provide clear navigation instructions', () => {
    const props: ProviderSelectionProps = {
      providers: mockProviders,
      onProviderSelected: vi.fn(),
      onCancel: vi.fn(),
    };

    const { lastFrame } = render(<ProviderSelection {...props} />);
    
    expect(lastFrame()).toContain('↑/↓: Navigate');
    expect(lastFrame()).toContain('Enter: Select');
    expect(lastFrame()).toContain('1-9: Quick select');
    expect(lastFrame()).toContain('Esc: Cancel');
  });

  it('should show status indicators with clear meanings', () => {
    const props: ProviderSelectionProps = {
      providers: mockProviders,
      onProviderSelected: vi.fn(),
      onCancel: vi.fn(),
      showDetails: true,
    };

    const { lastFrame } = render(<ProviderSelection {...props} />);
    
    expect(lastFrame()).toContain('🎯 = Current provider');
    expect(lastFrame()).toContain('✅ = Ready');
    expect(lastFrame()).toContain('❌ = Disabled/Issues');
  });

  it('should provide descriptive provider information', () => {
    const props: ProviderSelectionProps = {
      providers: mockProviders,
      onProviderSelected: vi.fn(),
      onCancel: vi.fn(),
      showDetails: true,
    };

    const { lastFrame } = render(<ProviderSelection {...props} />);
    
    expect(lastFrame()).toContain('OpenAI GPT models');
    expect(lastFrame()).toContain('Anthropic Claude models');
    expect(lastFrame()).toContain('Google Gemini models');
  });
});