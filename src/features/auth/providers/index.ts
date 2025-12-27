/**
 * @fileoverview OAuth provider adapters exports
 * @module features/auth/providers
 */

// Google OAuth adapter
export { GoogleOAuthAdapter, createGoogleOAuthAdapter } from './google-oauth.js';

// OpenRouter OAuth adapter
export { OpenRouterOAuthAdapter, createOpenRouterOAuthAdapter } from './openrouter-oauth.js';

// Anthropic OAuth adapter (placeholder)
export { AnthropicOAuthAdapter, createAnthropicOAuthAdapter } from './anthropic-oauth.js';

// OpenAI OAuth adapter (placeholder)
export { OpenAIOAuthAdapter, createOpenAIOAuthAdapter } from './openai-oauth.js';

// Provider adapter factory
import type { IOAuthProviderAdapter } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';
import { GoogleOAuthAdapter } from './google-oauth.js';
import { OpenRouterOAuthAdapter } from './openrouter-oauth.js';
import { AnthropicOAuthAdapter } from './anthropic-oauth.js';
import { OpenAIOAuthAdapter } from './openai-oauth.js';

/**
 * Create OAuth adapter for the specified provider.
 * 
 * @param provider - Model provider name
 * @returns OAuth adapter instance for the provider
 * @throws Error if provider is not supported
 */
export function createOAuthAdapter(provider: ModelProvider): IOAuthProviderAdapter {
  switch (provider) {
    case 'google':
      return new GoogleOAuthAdapter();
    case 'openrouter':
      return new OpenRouterOAuthAdapter();
    case 'anthropic':
      return new AnthropicOAuthAdapter();
    case 'openai':
      return new OpenAIOAuthAdapter();
    default:
      throw new Error(`OAuth adapter not available for provider: ${provider}`);
  }
}

/**
 * Check if OAuth is supported for the specified provider.
 * 
 * @param provider - Model provider name
 * @returns True if OAuth is supported, false otherwise
 */
export function isOAuthSupported(provider: ModelProvider): boolean {
  switch (provider) {
    case 'google':
    case 'openrouter':
      return true;
    case 'anthropic':
    case 'openai':
      return false; // Placeholder adapters - not yet supported
    default:
      return false;
  }
}

/**
 * Get list of providers that support OAuth.
 * 
 * @returns Array of provider names that support OAuth
 */
export function getSupportedOAuthProviders(): ModelProvider[] {
  return ['google', 'openrouter'];
}

/**
 * Get list of providers with placeholder OAuth adapters.
 * 
 * @returns Array of provider names with placeholder adapters
 */
export function getPlaceholderOAuthProviders(): ModelProvider[] {
  return ['anthropic', 'openai'];
}