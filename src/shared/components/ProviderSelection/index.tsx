/**
 * @fileoverview Provider selection UI component
 * @module shared/components/ProviderSelection
 */

import * as React from 'react';
import { type ReactElement, useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ProviderConfig } from '../../../config/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Props for the ProviderSelection component.
 */
export interface ProviderSelectionProps {
  /** Available providers to choose from */
  providers: ProviderConfig[];
  
  /** Currently selected provider */
  currentProvider?: string;
  
  /** Callback when a provider is selected */
  onProviderSelected: (provider: string) => void;
  
  /** Callback to cancel selection */
  onCancel: () => void;
  
  /** Whether to show detailed information */
  showDetails?: boolean;
  
  /** Maximum number of providers to display */
  maxDisplayProviders?: number;
  
  /** Title for the selection dialog */
  title?: string;
}

/**
 * Props for individual provider item.
 */
interface ProviderItemProps {
  provider: ProviderConfig;
  isSelected: boolean;
  isCurrent: boolean;
  showDetails: boolean;
  index: number;
}

// =============================================================================
// PROVIDER ITEM COMPONENT
// =============================================================================

/**
 * Individual provider item in the selection list.
 */
const ProviderItem = ({ 
  provider, 
  isSelected, 
  isCurrent, 
  showDetails, 
  index 
}: ProviderItemProps): ReactElement => {
  const getStatusIcon = (): string => {
    if (!provider.enabled) {
    return '❌';
  }
    return '✅';
  };

  const getProviderDescription = (): string => {
    const descriptions: Record<string, string> = {
      openai: 'OpenAI GPT models (GPT-4, GPT-3.5)',
      anthropic: 'Anthropic Claude models (Claude 3.5 Sonnet, Opus, Haiku)',
      google: 'Google Gemini models (Gemini 3.0 Pro, Flash, 2.0 Flash Thinking)',
      openrouter: 'Unified access to multiple AI providers',
      cohere: 'Cohere Command models for enterprise use',
      mistral: 'Mistral AI models with European compliance',
      together: 'Together AI open-source model hosting',
      perplexity: 'Perplexity AI with search-augmented generation',
      ollama: 'Local AI models for privacy-focused usage',
    };
    
    return descriptions[String(provider.name)] || 'AI language model provider';
  };

  const providerName = String(provider.name);
  const selectionIndicator = isSelected ? '▶ ' : '  ';
  const currentIndicator = isCurrent ? ' 🎯' : '';
  const statusIcon = getStatusIcon();
  const priority = provider.priority || 0;

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color={isSelected ? 'cyan' : 'white'}>
          {selectionIndicator}{statusIcon} {index + 1}. <Text bold>{providerName}</Text>{currentIndicator}
        </Text>
        {showDetails && (
          <Text color="gray"> (priority: {priority})</Text>
        )}
      </Box>
      
      {showDetails && (
        <Box marginLeft={4}>
          <Text color="gray">{getProviderDescription()}</Text>
        </Box>
      )}
      
      {showDetails && provider.baseUrl && (
        <Box marginLeft={4}>
          <Text color="gray">Base URL: {provider.baseUrl}</Text>
        </Box>
      )}
      
      {showDetails && provider.rateLimit && typeof provider.rateLimit === 'object' && (
        <Box marginLeft={4}>
          <Text color="gray">
            Rate Limits: {(provider.rateLimit as any).requestsPerMinute || 'N/A'} req/min, {(provider.rateLimit as any).tokensPerMinute || 'N/A'} tokens/min
          </Text>
        </Box>
      )}
      
      {!provider.enabled && (
        <Box marginLeft={4}>
          <Text color="red">⚠️ Provider is disabled</Text>
        </Box>
      )}
    </Box>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Provider selection component with keyboard navigation.
 */
export const ProviderSelection = ({
  providers,
  currentProvider,
  onProviderSelected,
  onCancel,
  showDetails = false,
  maxDisplayProviders = 10,
  title = 'Select AI Provider',
}: ProviderSelectionProps): ReactElement => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Filter and limit providers
  const displayProviders = providers.slice(0, maxDisplayProviders);
  
  // Handle keyboard input
  useInput(
    useCallback(
      (input, key) => {
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displayProviders.length - 1));
        } else if (key.downArrow) {
          setSelectedIndex((prev) => (prev < displayProviders.length - 1 ? prev + 1 : 0));
        } else if (key.return) {
          const selectedProvider = displayProviders[selectedIndex];
          if (selectedProvider) {
            onProviderSelected(String(selectedProvider.name));
          }
        } else if (key.escape || (key.ctrl && input === 'c')) {
          onCancel();
        } else if (input >= '1' && input <= '9') {
          const index = parseInt(input, 10) - 1;
          if (index >= 0 && index < displayProviders.length) {
            const selectedProvider = displayProviders[index];
            if (selectedProvider) {
              onProviderSelected(String(selectedProvider.name));
            }
          }
        }
      },
      [displayProviders, selectedIndex, onProviderSelected, onCancel]
    )
  );

  if (displayProviders.length === 0) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="single" borderColor="red">
        <Text bold color="red">No Providers Available</Text>
        <Text>No AI providers are configured or available.</Text>
        <Text color="gray">Press Escape to cancel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
      <Box marginBottom={1}>
        <Text bold color="cyan">{title}</Text>
      </Box>
      
      <Box flexDirection="column">
        {displayProviders.map((provider, index) => {
          const providerName = String(provider.name);
          return (
            <ProviderItem
              key={providerName}
              provider={provider}
              isSelected={index === selectedIndex}
              isCurrent={providerName === currentProvider}
              showDetails={showDetails}
              index={index}
            />
          );
        })}
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">
          ↑/↓: Navigate • Enter: Select • 1-9: Quick select • Esc: Cancel
        </Text>
        {showDetails && (
          <Text color="gray">
            🎯 = Current provider • ✅ = Ready • ❌ = Disabled/Issues
          </Text>
        )}
      </Box>
    </Box>
  );
};

// =============================================================================
// PROVIDER STATUS DISPLAY
// =============================================================================

/**
 * Props for provider status display.
 */
export interface ProviderStatusProps {
  /** Providers to display status for */
  providers: ProviderConfig[];
  
  /** Current provider */
  currentProvider?: string;
  
  /** Whether to show detailed information */
  showDetails?: boolean;
  
  /** Callback to close the status display */
  onClose: () => void;
}

/**
 * Provider status display component.
 */
export const ProviderStatus = ({
  providers,
  currentProvider,
  showDetails = true,
  onClose,
}: ProviderStatusProps): ReactElement => {
  useInput(
    useCallback(
      (input, key) => {
        if (key.escape || key.return || (key.ctrl && input === 'c')) {
          onClose();
        }
      },
      [onClose]
    )
  );

  const readyProviders = providers.filter(p => p.enabled);
  const disabledProviders = providers.filter(p => !p.enabled);

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor="blue">
      <Box marginBottom={1}>
        <Text bold color="blue">Provider Status</Text>
      </Box>
      
      <Box flexDirection="column">
        <Text bold>Ready Providers ({readyProviders.length}):</Text>
        {readyProviders.length === 0 ? (
          <Text color="gray">  No providers are ready</Text>
        ) : (
          readyProviders.map((provider) => {
            const providerName = String(provider.name);
            return (
              <Box key={providerName} marginLeft={2}>
                <Text>
                  ✅ <Text bold>{providerName}</Text>
                  {providerName === currentProvider && <Text color="cyan"> 🎯 (current)</Text>}
                  {showDetails && <Text color="gray"> (priority: {provider.priority || 0})</Text>}
                </Text>
              </Box>
            );
          })
        )}
        
        {disabledProviders.length > 0 && (
          <>
            <Box marginTop={1}>
              <Text bold>Disabled Providers ({disabledProviders.length}):</Text>
            </Box>
            {disabledProviders.map((provider) => {
              const providerName = String(provider.name);
              return (
                <Box key={providerName} marginLeft={2}>
                  <Text color="gray">
                    ❌ {providerName}
                    {showDetails && ` (priority: ${provider.priority || 0})`}
                  </Text>
                </Box>
              );
            })}
          </>
        )}
      </Box>
      
      <Box marginTop={1}>
        <Text color="gray">Press Enter or Escape to close</Text>
      </Box>
    </Box>
  );
};

// =============================================================================
// PROVIDER CONFIGURATION WIZARD
// =============================================================================

/**
 * Props for provider configuration wizard.
 */
export interface ProviderConfigWizardProps {
  /** Provider to configure */
  provider: string;
  
  /** Current configuration */
  currentConfig?: ProviderConfig;
  
  /** Callback when configuration is saved */
  onConfigSaved: (config: ProviderConfig) => void;
  
  /** Callback to cancel configuration */
  onCancel: () => void;
}

/**
 * Provider configuration wizard component.
 */
export const ProviderConfigWizard = ({
  provider,
  currentConfig,
  onCancel,
}: ProviderConfigWizardProps): ReactElement => {
  const [step] = useState<'api-key' | 'base-url' | 'rate-limits' | 'confirm'>('api-key');
  const [config] = useState<Partial<ProviderConfig>>(
    currentConfig || {
      name: provider as any,
      enabled: true,
      priority: 0,
    }
  );

  useInput(
    useCallback(
      (input, key) => {
        if (key.escape || (key.ctrl && input === 'c')) {
          onCancel();
        }
      },
      [onCancel]
    )
  );

  const getStepContent = (): ReactElement => {
    return (
      <Box flexDirection="column">
        <Text bold>Provider Configuration</Text>
        <Text>Configure {provider} provider settings</Text>
        <Text color="gray">
          This is a placeholder for the configuration wizard.
        </Text>
        <Text color="gray">
          Full implementation requires form handling capabilities.
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor="yellow">
      <Box marginBottom={1}>
        <Text bold color="yellow">Provider Configuration Wizard</Text>
      </Box>
      
      {getStepContent()}
      
      <Box marginTop={1}>
        <Text color="gray">
          This is a placeholder wizard. Full implementation requires form handling.
        </Text>
        <Text color="gray">Press Escape to cancel</Text>
      </Box>
    </Box>
  );
};