/**
 * @fileoverview Unit tests for secure token storage
 * @module features/auth/__tests__/token-store.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenStore } from '../token-store.js';
import type { TokenSet } from '../types.js';
import type { ModelProvider } from '../../../shared/types/models.js';

// Mock keytar to avoid system keychain dependencies in tests
vi.mock('keytar', () => ({
  setPassword: vi.fn(),
  getPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
}));

import * as keytar from 'keytar';

describe('TokenStore', () => {
  let tokenStore: TokenStore;
  const mockProvider: ModelProvider = 'anthropic';
  
  const mockTokenSet: TokenSet = {
    accessToken: 'test-access-token-12345',
    refreshToken: 'test-refresh-token-67890',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    tokenType: 'Bearer',
    scope: 'api:read api:write',
  };

  beforeEach(() => {
    tokenStore = new TokenStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('storeTokens', () => {
    it('should store tokens securely in keychain', async () => {
      const setPasswordSpy = vi.mocked(keytar.setPassword);
      setPasswordSpy.mockResolvedValue();

      await tokenStore.storeTokens(mockProvider, mockTokenSet);

      expect(setPasswordSpy).toHaveBeenCalledWith(
        'theo-code-oauth',
        'oauth-tokens-anthropic',
        expect.stringContaining('"accessToken":"test-access-token-12345"')
      );
    });

    it('should validate token structure before storing', async () => {
      const invalidTokenSet = {
        accessToken: '', // Invalid: empty string
        expiresAt: new Date(),
        tokenType: 'Bearer',
      } as TokenSet;

      await expect(tokenStore.storeTokens(mockProvider, invalidTokenSet))
        .rejects.toThrow('Failed to store OAuth tokens');
    });

    it('should handle keychain storage errors', async () => {
      const setPasswordSpy = vi.mocked(keytar.setPassword);
      setPasswordSpy.mockRejectedValue(new Error('Keychain access denied'));

      await expect(tokenStore.storeTokens(mockProvider, mockTokenSet))
        .rejects.toThrow('Failed to store OAuth tokens');
    });
  });

  describe('getTokens', () => {
    it('should retrieve and parse stored tokens', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const storedData = JSON.stringify({
        accessToken: mockTokenSet.accessToken,
        refreshToken: mockTokenSet.refreshToken,
        expiresAt: mockTokenSet.expiresAt.toISOString(),
        tokenType: mockTokenSet.tokenType,
        scope: mockTokenSet.scope,
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.getTokens(mockProvider);

      expect(result).toEqual(mockTokenSet);
      expect(getPasswordSpy).toHaveBeenCalledWith(
        'theo-code-oauth',
        'oauth-tokens-anthropic'
      );
    });

    it('should return null when no tokens are stored', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      getPasswordSpy.mockResolvedValue(null);

      const result = await tokenStore.getTokens(mockProvider);

      expect(result).toBeNull();
    });

    it('should handle corrupted token data by clearing it', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const deletePasswordSpy = vi.mocked(keytar.deletePassword);
      
      getPasswordSpy.mockResolvedValue('invalid-json-data');
      deletePasswordSpy.mockResolvedValue(true);

      const result = await tokenStore.getTokens(mockProvider);

      expect(result).toBeNull();
      expect(deletePasswordSpy).toHaveBeenCalledWith(
        'theo-code-oauth',
        'oauth-tokens-anthropic'
      );
    });

    it('should validate retrieved token structure', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const invalidStoredData = JSON.stringify({
        accessToken: '', // Invalid: empty string
        expiresAt: mockTokenSet.expiresAt.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(invalidStoredData);

      const result = await tokenStore.getTokens(mockProvider);

      expect(result).toBeNull();
    });
  });

  describe('clearTokens', () => {
    it('should remove tokens from keychain', async () => {
      const deletePasswordSpy = vi.mocked(keytar.deletePassword);
      deletePasswordSpy.mockResolvedValue(true);

      await tokenStore.clearTokens(mockProvider);

      expect(deletePasswordSpy).toHaveBeenCalledWith(
        'theo-code-oauth',
        'oauth-tokens-anthropic'
      );
    });

    it('should handle case when no tokens exist to clear', async () => {
      const deletePasswordSpy = vi.mocked(keytar.deletePassword);
      deletePasswordSpy.mockResolvedValue(false);

      await expect(tokenStore.clearTokens(mockProvider)).resolves.not.toThrow();
    });

    it('should handle keychain deletion errors', async () => {
      const deletePasswordSpy = vi.mocked(keytar.deletePassword);
      deletePasswordSpy.mockRejectedValue(new Error('Keychain access denied'));

      await expect(tokenStore.clearTokens(mockProvider))
        .rejects.toThrow('Failed to clear OAuth tokens');
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid, non-expired tokens', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const futureExpiry = new Date(Date.now() + 3600000); // 1 hour from now
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: futureExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.isTokenValid(mockProvider);

      expect(result).toBe(true);
    });

    it('should return false for expired tokens', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const pastExpiry = new Date(Date.now() - 3600000); // 1 hour ago
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: pastExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.isTokenValid(mockProvider);

      expect(result).toBe(false);
    });

    it('should return false when no tokens exist', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      getPasswordSpy.mockResolvedValue(null);

      const result = await tokenStore.isTokenValid(mockProvider);

      expect(result).toBe(false);
    });

    it('should return false for tokens expiring within buffer time', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const soonExpiry = new Date(Date.now() + 60000); // 1 minute from now (within 5-minute buffer)
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: soonExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.isTokenValid(mockProvider);

      expect(result).toBe(false);
    });
  });

  describe('refreshIfNeeded', () => {
    it('should return tokens if they are still valid', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const futureExpiry = new Date(Date.now() + 3600000); // 1 hour from now
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: futureExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.refreshIfNeeded(mockProvider);

      expect(result).toEqual(expect.objectContaining({
        accessToken: mockTokenSet.accessToken,
        refreshToken: mockTokenSet.refreshToken,
      }));
    });

    it('should return null if tokens need refresh', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const soonExpiry = new Date(Date.now() + 60000); // 1 minute from now (within buffer)
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: soonExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.refreshIfNeeded(mockProvider);

      expect(result).toBeNull();
    });

    it('should return null when no tokens exist', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      getPasswordSpy.mockResolvedValue(null);

      const result = await tokenStore.refreshIfNeeded(mockProvider);

      expect(result).toBeNull();
    });
  });

  describe('utility methods', () => {
    it('should check if tokens are expired', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const pastExpiry = new Date(Date.now() - 3600000); // 1 hour ago
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: pastExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.isTokenExpired(mockProvider);

      expect(result).toBe(true);
    });

    it('should check if tokens are expiring soon', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const soonExpiry = new Date(Date.now() + 60000); // 1 minute from now
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: soonExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.isTokenExpiringSoon(mockProvider);

      expect(result).toBe(true);
    });

    it('should get time until expiration', async () => {
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const futureExpiry = new Date(Date.now() + 3600000); // 1 hour from now
      const storedData = JSON.stringify({
        ...mockTokenSet,
        expiresAt: futureExpiry.toISOString(),
      });
      getPasswordSpy.mockResolvedValue(storedData);

      const result = await tokenStore.getTimeUntilExpiration(mockProvider);

      expect(result).toBeGreaterThan(3500000); // Should be close to 1 hour
      expect(result).toBeLessThanOrEqual(3600000);
    });

    it('should list stored providers', async () => {
      const findCredentialsSpy = vi.mocked(keytar.findCredentials);
      findCredentialsSpy.mockResolvedValue([
        { account: 'oauth-tokens-anthropic', password: 'data1' },
        { account: 'oauth-tokens-openai', password: 'data2' },
        { account: 'other-account', password: 'data3' },
      ]);

      const result = await tokenStore.getStoredProviders();

      expect(result).toEqual(['anthropic', 'openai']);
    });

    it('should clear all tokens', async () => {
      const findCredentialsSpy = vi.mocked(keytar.findCredentials);
      const deletePasswordSpy = vi.mocked(keytar.deletePassword);
      
      findCredentialsSpy.mockResolvedValue([
        { account: 'oauth-tokens-anthropic', password: 'data1' },
        { account: 'oauth-tokens-openai', password: 'data2' },
      ]);
      deletePasswordSpy.mockResolvedValue(true);

      await tokenStore.clearAllTokens();

      expect(deletePasswordSpy).toHaveBeenCalledTimes(2);
      expect(deletePasswordSpy).toHaveBeenCalledWith('theo-code-oauth', 'oauth-tokens-anthropic');
      expect(deletePasswordSpy).toHaveBeenCalledWith('theo-code-oauth', 'oauth-tokens-openai');
    });
  });

  describe('security features', () => {
    it('should validate keychain access', async () => {
      const setPasswordSpy = vi.mocked(keytar.setPassword);
      const getPasswordSpy = vi.mocked(keytar.getPassword);
      const deletePasswordSpy = vi.mocked(keytar.deletePassword);
      
      setPasswordSpy.mockResolvedValue();
      getPasswordSpy.mockResolvedValue('test-value');
      deletePasswordSpy.mockResolvedValue(true);

      const result = await tokenStore.validateKeychainAccess();

      expect(result).toBe(true);
      expect(setPasswordSpy).toHaveBeenCalledWith(
        'theo-code-oauth',
        'test-access-validation',
        'test-value'
      );
      expect(getPasswordSpy).toHaveBeenCalledWith(
        'theo-code-oauth',
        'test-access-validation'
      );
      expect(deletePasswordSpy).toHaveBeenCalledWith(
        'theo-code-oauth',
        'test-access-validation'
      );
    });

    it('should return false when keychain access fails', async () => {
      const setPasswordSpy = vi.mocked(keytar.setPassword);
      setPasswordSpy.mockRejectedValue(new Error('Access denied'));

      const result = await tokenStore.validateKeychainAccess();

      expect(result).toBe(false);
    });

    it('should provide keychain info', () => {
      const info = tokenStore.getKeychainInfo();

      expect(info).toEqual({
        service: 'theo-code-oauth',
        platform: process.platform,
      });
    });
  });
});