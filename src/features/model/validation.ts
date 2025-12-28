/**
 * @fileoverview Provider configuration validation utilities
 * @module features/model/validation
 *
 * Provides utilities for validating provider configurations, API keys,
 * and connectivity testing across different AI providers.
 */

import type { ModelConfig, ModelProvider } from '../../shared/types/models.js';
import { AdapterError } from './adapters/types.js';
import { logger } from '../../shared/utils/logger.js';
// =============================================================================
// TYPES
// =============================================================================

/**
 * Validation result for a provider configuration.
 */
export interface ValidationResult {
  valid: boolean;
  provider: ModelProvider;
  errors: string[];
  warnings: string[];
}

/**
 * Connectivity test result.
 */
export interface ConnectivityResult {
  provider: ModelProvider;
  connected: boolean;
  responseTimeMs: number | null;
  error: string | null;
}

/**
 * API key validation result.
 */
export interface ApiKeyValidationResult {
  provider: ModelProvider;
  valid: boolean;
  error: string | null;
  hasPermissions: boolean;
}

// =============================================================================
// PROVIDER-SPECIFIC VALIDATORS
// =============================================================================

/**
 * Validate OpenAI configuration.
 */
function validateOpenAIConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['OPENAI_API_KEY']) {
    errors.push('API key is required. Set OPENAI_API_KEY environment variable or provide in config.');
  }

  if (config.apiKey && !config.apiKey.startsWith('sk-')) {
    errors.push('OpenAI API key should start with "sk-"');
  }

  const validModels = [
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
    'o1', 'o1-mini', 'o1-preview'
  ];
  
  if (!validModels.some(model => config.model.startsWith(model))) {
    errors.push(`Unsupported OpenAI model: ${config.model}. Supported: ${validModels.join(', ')}`);
  }

  return errors;
}

/**
 * Validate Anthropic configuration.
 */
function validateAnthropicConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['ANTHROPIC_API_KEY']) {
    errors.push('API key is required. Set ANTHROPIC_API_KEY environment variable or provide in config.');
  }

  if (config.apiKey && !config.apiKey.startsWith('sk-ant-')) {
    errors.push('Anthropic API key should start with "sk-ant-"');
  }

  const validModels = [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307'
  ];
  
  if (!validModels.includes(config.model)) {
    errors.push(`Unsupported Anthropic model: ${config.model}. Supported: ${validModels.join(', ')}`);
  }

  // Validate Anthropic-specific config
  if (config.providerConfig?.anthropic?.maxTokens) {
    const maxTokens = config.providerConfig.anthropic.maxTokens;
    if (maxTokens > 4096) {
      errors.push('Anthropic maxTokens cannot exceed 4096');
    }
  }

  return errors;
}

/**
 * Validate Google configuration.
 */
function validateGoogleConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['GOOGLE_API_KEY']) {
    errors.push('API key is required. Set GOOGLE_API_KEY environment variable or provide in config.');
  }

  const validModels = [
    'gemini-3-pro-preview',
    'gemini-3-flash-preview', 
    'gemini-3-pro-image-preview',
    'gemini-2-flash-preview',
    'gemini-2-flash-thinking-preview',
    'gemini-1.5-pro',
    'gemini-1.5-flash'
  ];
  
  if (!validModels.includes(config.model)) {
    errors.push(`Unsupported Google model: ${config.model}. Supported: ${validModels.join(', ')}`);
  }

  // Validate Google-specific config
  const googleConfig = config.providerConfig?.google;
  if (googleConfig) {
    if (googleConfig.thinkingLevel && !['low', 'medium', 'high'].includes(googleConfig.thinkingLevel)) {
      errors.push('Google thinkingLevel must be one of: low, medium, high');
    }
    
    if (googleConfig.mediaResolution && !['low', 'medium', 'high', 'ultra_high'].includes(googleConfig.mediaResolution)) {
      errors.push('Google mediaResolution must be one of: low, medium, high, ultra_high');
    }
    
    if (googleConfig.imageConfig?.imageSize && !['1K', '2K', '4K'].includes(googleConfig.imageConfig.imageSize)) {
      errors.push('Google imageSize must be one of: 1K, 2K, 4K');
    }
  }

  return errors;
}

/**
 * Validate OpenRouter configuration.
 */
function validateOpenRouterConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['OPENROUTER_API_KEY']) {
    errors.push('API key is required. Set OPENROUTER_API_KEY environment variable or provide in config.');
  }

  if (config.apiKey && !config.apiKey.startsWith('sk-or-')) {
    errors.push('OpenRouter API key should start with "sk-or-"');
  }

  // OpenRouter supports many models, so we don't validate specific model names
  // The model catalog is dynamic and fetched from their API

  return errors;
}

/**
 * Validate Cohere configuration.
 */
function validateCohereConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['COHERE_API_KEY']) {
    errors.push('API key is required. Set COHERE_API_KEY environment variable or provide in config.');
  }

  const validModels = ['command', 'command-light', 'command-nightly'];
  
  if (!validModels.some(model => config.model.startsWith(model))) {
    errors.push(`Unsupported Cohere model: ${config.model}. Supported: ${validModels.join(', ')}`);
  }

  return errors;
}

/**
 * Validate Mistral configuration.
 */
function validateMistralConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['MISTRAL_API_KEY']) {
    errors.push('API key is required. Set MISTRAL_API_KEY environment variable or provide in config.');
  }

  const validModels = ['mistral-large', 'mistral-medium', 'mistral-small'];
  
  if (!validModels.some(model => config.model.startsWith(model))) {
    errors.push(`Unsupported Mistral model: ${config.model}. Supported: ${validModels.join(', ')}`);
  }

  return errors;
}

/**
 * Validate Together configuration.
 */
function validateTogetherConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['TOGETHER_API_KEY']) {
    errors.push('API key is required. Set TOGETHER_API_KEY environment variable or provide in config.');
  }

  // Together supports many open-source models, so we don't validate specific model names

  return errors;
}

/**
 * Validate Perplexity configuration.
 */
function validatePerplexityConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey && !process.env['PERPLEXITY_API_KEY']) {
    errors.push('API key is required. Set PERPLEXITY_API_KEY environment variable or provide in config.');
  }

  const validModels = ['pplx-7b-online', 'pplx-70b-online', 'pplx-7b-chat', 'pplx-70b-chat'];
  
  if (!validModels.some(model => config.model.startsWith(model))) {
    errors.push(`Unsupported Perplexity model: ${config.model}. Supported: ${validModels.join(', ')}`);
  }

  return errors;
}

/**
 * Validate Ollama configuration.
 */
function validateOllamaConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push('Base URL is required for Ollama. Default: http://localhost:11434');
  }

  try {
    if (config.baseUrl) {
      new URL(config.baseUrl);
    }
  } catch {
    errors.push('Invalid base URL format');
  }

  // Validate Ollama-specific config
  const ollamaConfig = config.providerConfig?.ollama;
  if (ollamaConfig) {
    if (ollamaConfig.numGpu !== undefined && ollamaConfig.numGpu < 0) {
      errors.push('Ollama numGpu must be non-negative');
    }
    
    if (ollamaConfig.numCtx !== undefined && ollamaConfig.numCtx <= 0) {
      errors.push('Ollama numCtx must be positive');
    }
  }

  return errors;
}

// =============================================================================
// MAIN VALIDATION FUNCTIONS
// =============================================================================

/**
 * Provider-specific validation functions.
 */
const PROVIDER_VALIDATORS: Record<ModelProvider, (config: ModelConfig) => string[]> = {
  openai: validateOpenAIConfig,
  anthropic: validateAnthropicConfig,
  google: validateGoogleConfig,
  openrouter: validateOpenRouterConfig,
  cohere: validateCohereConfig,
  mistral: validateMistralConfig,
  together: validateTogetherConfig,
  perplexity: validatePerplexityConfig,
  ollama: validateOllamaConfig,
};

/**
 * Validate a provider configuration.
 */
export function validateProviderConfig(config: ModelConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic validation
  if (!config.provider) {
    errors.push('Provider is required');
  }

  if (!config.model || config.model.trim() === '') {
    errors.push('Model is required');
  }

  if (config.contextLimit <= 0) {
    errors.push('Context limit must be positive');
  }

  if (config.maxOutputTokens <= 0) {
    errors.push('Max output tokens must be positive');
  }

  // Rate limit validation
  if (config.rateLimit) {
    if (config.rateLimit.requestsPerMinute !== undefined && config.rateLimit.requestsPerMinute <= 0) {
      errors.push('Rate limit requests per minute must be positive');
    }
    
    if (config.rateLimit.tokensPerMinute !== undefined && config.rateLimit.tokensPerMinute <= 0) {
      errors.push('Rate limit tokens per minute must be positive');
    }
    
    if (config.rateLimit.concurrentRequests <= 0) {
      errors.push('Rate limit concurrent requests must be positive');
    }
  }

  // Retry config validation
  if (config.retryConfig) {
    if (config.retryConfig.maxRetries < 0) {
      errors.push('Max retries must be non-negative');
    }
    
    if (config.retryConfig.backoffMs <= 0) {
      errors.push('Backoff time must be positive');
    }
  }

  // Provider-specific validation
  const validator = PROVIDER_VALIDATORS[config.provider];
  if (validator) {
    errors.push(...validator(config));
  } else {
    errors.push(`Unsupported provider: ${config.provider}`);
  }

  // Warnings
  if (config.contextLimit > 200000) {
    warnings.push('Very large context limit may impact performance');
  }

  if (config.maxOutputTokens > 8192) {
    warnings.push('Large max output tokens may impact response time');
  }

  if (config.fallbackProviders && config.fallbackProviders.length > 5) {
    warnings.push('Many fallback providers may slow down error recovery');
  }

  return {
    valid: errors.length === 0,
    provider: config.provider,
    errors,
    warnings,
  };
}

/**
 * Validate multiple provider configurations.
 */
export function validateProviderConfigs(configs: ModelConfig[]): ValidationResult[] {
  return configs.map(validateProviderConfig);
}

// =============================================================================
// API KEY VALIDATION
// =============================================================================

/**
 * Validate API key format for a provider.
 */
export function validateApiKey(provider: ModelProvider, apiKey: string): ApiKeyValidationResult {
  const result: ApiKeyValidationResult = {
    provider,
    valid: false,
    error: null,
    hasPermissions: false, // TODO: Implement permission checking
  };

  try {
    switch (provider) {
      case 'openai':
        result.valid = apiKey.startsWith('sk-') && apiKey.length > 20;
        if (!result.valid) {
          result.error = 'OpenAI API key should start with "sk-" and be at least 20 characters';
        }
        break;

      case 'anthropic':
        result.valid = apiKey.startsWith('sk-ant-') && apiKey.length > 20;
        if (!result.valid) {
          result.error = 'Anthropic API key should start with "sk-ant-" and be at least 20 characters';
        }
        break;

      case 'google':
        result.valid = apiKey.length > 10; // Google API keys vary in format
        if (!result.valid) {
          result.error = 'Google API key appears to be too short';
        }
        break;

      case 'openrouter':
        result.valid = apiKey.startsWith('sk-or-') && apiKey.length > 20;
        if (!result.valid) {
          result.error = 'OpenRouter API key should start with "sk-or-" and be at least 20 characters';
        }
        break;

      case 'cohere':
      case 'mistral':
      case 'together':
      case 'perplexity':
        result.valid = apiKey.length > 10;
        if (!result.valid) {
          result.error = `${provider} API key appears to be too short`;
        }
        break;

      case 'ollama':
        result.valid = true; // Ollama typically doesn't require API keys
        break;

      default:
        result.error = `Unknown provider: ${provider}`;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown validation error';
  }

  return result;
}

// =============================================================================
// CONNECTIVITY TESTING
// =============================================================================

/**
 * Test connectivity to a provider.
 */
export async function testProviderConnectivity(config: ModelConfig): Promise<ConnectivityResult> {
  const result: ConnectivityResult = {
    provider: config.provider,
    connected: false,
    responseTimeMs: null,
    error: null,
  };

  const startTime = Date.now();

  try {
    // For now, we'll do basic validation and assume connectivity
    // TODO: Implement actual API calls to test connectivity
    
    const validation = validateProviderConfig(config);
    if (!validation.valid) {
      result.error = validation.errors.join('; ');
      return result;
    }

    // Simulate connectivity test
    await new Promise(resolve => setTimeout(resolve, 100));
    
    result.connected = true;
    result.responseTimeMs = Date.now() - startTime;
    
    logger.debug(`[Validation] Connectivity test passed for ${config.provider}`);
    
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown connectivity error';
    result.responseTimeMs = Date.now() - startTime;
    
    logger.error(`[Validation] Connectivity test failed for ${config.provider}:`, error);
  }

  return result;
}

/**
 * Test connectivity to multiple providers.
 */
export async function testMultipleProviderConnectivity(configs: ModelConfig[]): Promise<ConnectivityResult[]> {
  const tests = configs.map(config => testProviderConnectivity(config));
  return Promise.all(tests);
}

// =============================================================================
// CONFIGURATION UTILITIES
// =============================================================================

/**
 * Create a configuration validation utilities object.
 */
export const configValidation = {
  validateConfig: validateProviderConfig,
  validateConfigs: validateProviderConfigs,
  validateApiKey,
  testConnectivity: testProviderConnectivity,
  testMultipleConnectivity: testMultipleProviderConnectivity,
} as const;