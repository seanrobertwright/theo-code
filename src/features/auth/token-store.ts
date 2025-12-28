/**
 * @fileoverview Secure token storage using system keychain
 * @module features/auth/token-store
 */

import * as keytar from 'keytar';
import type { ModelProvider } from '../../shared/types/models.js';
import type { ITokenStore, TokenSet } from './types.js';
import { TokenSetSchema } from './types.js';
import { logger } from '../../shared/utils/logger.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Service name for keychain storage */
const KEYCHAIN_SERVICE = 'theo-code-oauth';

/** Token expiration buffer (5 minutes in milliseconds) */
const TOKEN_EXPIRATION_BUFFER = 5 * 60 * 1000;

// =============================================================================
// TOKEN STORE IMPLEMENTATION
// =============================================================================

/**
 * Secure token storage implementation using system keychain.
 * 
 * Provides encrypted storage and retrieval of OAuth tokens using the system's
 * native keychain/credential manager (macOS Keychain, Windows Credential Manager,
 * Linux Secret Service).
 */
export class TokenStore implements ITokenStore {
  
  // =============================================================================
  // TOKEN STORAGE
  // =============================================================================

  /**
   * Store OAuth tokens securely in the system keychain.
   */
  async storeTokens(provider: ModelProvider, tokens: TokenSet): Promise<void> {
    try {
      logger.debug(`[TokenStore] Storing tokens for provider: ${provider}`);

      // Validate token structure
      const validatedTokens = TokenSetSchema.parse(tokens);

      // Serialize tokens to JSON
      const tokenData = JSON.stringify({
        accessToken: validatedTokens.accessToken,
        refreshToken: validatedTokens.refreshToken,
        expiresAt: validatedTokens.expiresAt.toISOString(),
        tokenType: validatedTokens.tokenType,
        scope: validatedTokens.scope,
      });

      // Store in keychain
      const account = this.getKeychainAccount(provider);
      await keytar.setPassword(KEYCHAIN_SERVICE, account, tokenData);

      logger.info(`[TokenStore] Tokens stored successfully for provider: ${provider}`);
    } catch (error) {
      logger.error(`[TokenStore] Failed to store tokens for provider ${provider}:`, error);
      throw new Error(`Failed to store OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve stored tokens from the system keychain.
   */
  async getTokens(provider: ModelProvider): Promise<TokenSet | null> {
    try {
      logger.debug(`[TokenStore] Retrieving tokens for provider: ${provider}`);

      const account = this.getKeychainAccount(provider);
      const tokenData = await keytar.getPassword(KEYCHAIN_SERVICE, account);

      if (!tokenData) {
        logger.debug(`[TokenStore] No tokens found for provider: ${provider}`);
        return null;
      }

      // Parse and validate token data
      const parsedData = JSON.parse(tokenData);
      const tokens: TokenSet = {
        accessToken: parsedData.accessToken,
        refreshToken: parsedData.refreshToken,
        expiresAt: new Date(parsedData.expiresAt),
        tokenType: parsedData.tokenType || 'Bearer',
        scope: parsedData.scope,
      };

      // Validate token structure
      const validatedTokens = TokenSetSchema.parse(tokens);

      logger.debug(`[TokenStore] Tokens retrieved successfully for provider: ${provider}`);
      return validatedTokens;
    } catch (error) {
      logger.error(`[TokenStore] Failed to retrieve tokens for provider ${provider}:`, error);
      
      // If parsing fails, clear corrupted data
      if (error instanceof SyntaxError) {
        logger.warn(`[TokenStore] Corrupted token data detected, clearing for provider: ${provider}`);
        await this.clearTokens(provider);
      }
      
      return null;
    }
  }

  /**
   * Clear stored tokens from the system keychain.
   */
  async clearTokens(provider: ModelProvider): Promise<void> {
    try {
      logger.debug(`[TokenStore] Clearing tokens for provider: ${provider}`);

      const account = this.getKeychainAccount(provider);
      const deleted = await keytar.deletePassword(KEYCHAIN_SERVICE, account);

      if (deleted) {
        logger.info(`[TokenStore] Tokens cleared successfully for provider: ${provider}`);
      } else {
        logger.debug(`[TokenStore] No tokens to clear for provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`[TokenStore] Failed to clear tokens for provider ${provider}:`, error);
      throw new Error(`Failed to clear OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================================================
  // TOKEN VALIDATION
  // =============================================================================

  /**
   * Check if stored tokens are valid (exist and not expired).
   */
  async isTokenValid(provider: ModelProvider): Promise<boolean> {
    try {
      const tokens = await this.getTokens(provider);
      
      if (!tokens) {
        return false;
      }

      // Check if token is expired (with buffer)
      const now = Date.now();
      const expiresAt = tokens.expiresAt.getTime();
      const isExpired = expiresAt <= now + TOKEN_EXPIRATION_BUFFER;

      if (isExpired) {
        logger.debug(`[TokenStore] Token expired for provider: ${provider}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`[TokenStore] Error validating tokens for provider ${provider}:`, error);
      return false;
    }
  }

  /**
   * Refresh tokens if needed (expired or expiring soon).
   */
  async refreshIfNeeded(provider: ModelProvider): Promise<TokenSet | null> {
    try {
      const tokens = await this.getTokens(provider);
      
      if (!tokens) {
        logger.debug(`[TokenStore] No tokens to refresh for provider: ${provider}`);
        return null;
      }

      // Check if token needs refresh (expires within buffer time)
      const now = Date.now();
      const expiresAt = tokens.expiresAt.getTime();
      const needsRefresh = expiresAt <= now + TOKEN_EXPIRATION_BUFFER;

      if (!needsRefresh) {
        logger.debug(`[TokenStore] Token still valid for provider: ${provider}`);
        return tokens;
      }

      // Token needs refresh but we don't have refresh logic here
      // This method is meant to be used by the OAuth manager which handles refresh
      logger.debug(`[TokenStore] Token needs refresh for provider: ${provider}`);
      return null;
    } catch (error) {
      logger.error(`[TokenStore] Error checking refresh need for provider ${provider}:`, error);
      return null;
    }
  }

  // =============================================================================
  // TOKEN EXPIRATION UTILITIES
  // =============================================================================

  /**
   * Check if tokens are expired.
   */
  async isTokenExpired(provider: ModelProvider): Promise<boolean> {
    const tokens = await this.getTokens(provider);
    
    if (!tokens) {
      return true;
    }

    return tokens.expiresAt.getTime() <= Date.now();
  }

  /**
   * Check if tokens are expiring soon (within buffer time).
   */
  async isTokenExpiringSoon(provider: ModelProvider): Promise<boolean> {
    const tokens = await this.getTokens(provider);
    
    if (!tokens) {
      return true;
    }

    return tokens.expiresAt.getTime() <= Date.now() + TOKEN_EXPIRATION_BUFFER;
  }

  /**
   * Get time until token expiration in milliseconds.
   */
  async getTimeUntilExpiration(provider: ModelProvider): Promise<number | null> {
    const tokens = await this.getTokens(provider);
    
    if (!tokens) {
      return null;
    }

    return Math.max(0, tokens.expiresAt.getTime() - Date.now());
  }

  // =============================================================================
  // KEYCHAIN UTILITIES
  // =============================================================================

  /**
   * Generate keychain account name for a provider.
   */
  private getKeychainAccount(provider: ModelProvider): string {
    return `oauth-tokens-${provider}`;
  }

  /**
   * List all stored OAuth providers.
   */
  async getStoredProviders(): Promise<ModelProvider[]> {
    try {
      const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE);
      
      return credentials
        .map(cred => cred.account)
        .filter(account => account.startsWith('oauth-tokens-'))
        .map(account => account.replace('oauth-tokens-', '') as ModelProvider);
    } catch (error) {
      logger.error('[TokenStore] Failed to list stored providers:', error);
      return [];
    }
  }

  /**
   * Clear all stored OAuth tokens.
   */
  async clearAllTokens(): Promise<void> {
    try {
      logger.info('[TokenStore] Clearing all OAuth tokens');

      const providers = await this.getStoredProviders();
      
      for (const provider of providers) {
        await this.clearTokens(provider);
      }

      logger.info(`[TokenStore] Cleared tokens for ${providers.length} providers`);
    } catch (error) {
      logger.error('[TokenStore] Failed to clear all tokens:', error);
      throw new Error(`Failed to clear all OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================================================
  // SECURITY UTILITIES
  // =============================================================================

  /**
   * Validate that keychain access is available.
   */
  async validateKeychainAccess(): Promise<boolean> {
    try {
      // Test keychain access by storing and retrieving a test value
      const testAccount = 'test-access-validation';
      const testValue = 'test-value';
      
      await keytar.setPassword(KEYCHAIN_SERVICE, testAccount, testValue);
      const retrieved = await keytar.getPassword(KEYCHAIN_SERVICE, testAccount);
      await keytar.deletePassword(KEYCHAIN_SERVICE, testAccount);
      
      return retrieved === testValue;
    } catch (error) {
      logger.error('[TokenStore] Keychain access validation failed:', error);
      return false;
    }
  }

  /**
   * Get keychain service information.
   */
  getKeychainInfo(): { service: string; platform: string } {
    return {
      service: KEYCHAIN_SERVICE,
      platform: process.platform,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new token store instance.
 */
export function createTokenStore(): TokenStore {
  return new TokenStore();
}