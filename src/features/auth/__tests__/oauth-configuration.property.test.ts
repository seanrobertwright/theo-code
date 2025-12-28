/**
 * @fileoverview Property-based tests for OAuth configuration schema
 * @module features/auth/__tests__/oauth-configuration.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  OAuthConfigSchema,
  TokenSetSchema,
  OAuthResultSchema,
  AuthStatusSchema,
  CallbackResultSchema,
  OAuthErrorSchema,
  OAuthProviderSettingsSchema,
  ExtendedProviderConfigSchema,
} from '../types.js';
import type {
  OAuthConfig,
  TokenSet,
  OAuthResult,
  AuthStatus,
  CallbackResult,
  OAuthError,
  OAuthProviderSettings,
  ExtendedProviderConfig,
} from '../types.js';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generates valid OAuth configuration objects.
 */
const oauthConfigArb = fc.record({
  provider: fc.string({ _minLength: 1, _maxLength: 50 }),
  clientId: fc.string({ _minLength: 1, _maxLength: 100 }),
  clientSecret: fc.option(fc.string({ _minLength: 1, _maxLength: 100 })),
  authorizationEndpoint: fc.webUrl(),
  tokenEndpoint: fc.webUrl(),
  scopes: fc.array(fc.string({ _minLength: 1, _maxLength: 50 }), { _minLength: 1, _maxLength: 10 }),
  redirectUri: fc.webUrl(),
  additionalParams: fc.option(fc.dictionary(
    fc.string({ _minLength: 1, _maxLength: 20 }).filter(key => key !== '__proto__'),
    fc.string({ _minLength: 1, _maxLength: 100 })
  )),
});

/**
 * Generates valid token set objects.
 */
const tokenSetArb = fc.record({
  accessToken: fc.string({ _minLength: 10, _maxLength: 500 }),
  refreshToken: fc.option(fc.string({ _minLength: 10, _maxLength: 500 })),
  expiresAt: fc.integer({ min: Date.now() + 60000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }).map(ts => new Date(ts)),
  tokenType: fc.constant('Bearer' as const),
  scope: fc.option(fc.string({ _minLength: 1, _maxLength: 200 })),
});

/**
 * Generates valid OAuth result objects.
 */
const oauthResultArb = fc.oneof(
  // Success case
  fc.record({
    success: fc.constant(true),
    tokens: tokenSetArb,
    error: fc.constant(null),
    provider: fc.string({ _minLength: 1, _maxLength: 50 }),
  }),
  // Failure case
  fc.record({
    success: fc.constant(false),
    tokens: fc.constant(null),
    error: fc.string({ _minLength: 1, _maxLength: 200 }),
    provider: fc.string({ _minLength: 1, _maxLength: 50 }),
  })
);

/**
 * Generates valid authentication status objects.
 */
const authStatusArb = fc.oneof(
  // OAuth authenticated status
  fc.record({
    provider: fc.string({ _minLength: 1, _maxLength: 50 }),
    authenticated: fc.constant(true),
    method: fc.constant('oauth' as const),
    expiresAt: fc.integer({ min: Date.now() + 60000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }).map(ts => new Date(ts)),
    needsRefresh: fc.boolean(),
  }),
  // OAuth not authenticated status
  fc.record({
    provider: fc.string({ _minLength: 1, _maxLength: 50 }),
    authenticated: fc.constant(false),
    method: fc.constant('oauth' as const),
    expiresAt: fc.constant(null),
    needsRefresh: fc.constant(false),
  }),
  // API key authenticated status
  fc.record({
    provider: fc.string({ _minLength: 1, _maxLength: 50 }),
    authenticated: fc.boolean(),
    method: fc.constant('api_key' as const),
    expiresAt: fc.constant(null),
    needsRefresh: fc.constant(false),
  }),
  // No authentication status
  fc.record({
    provider: fc.string({ _minLength: 1, _maxLength: 50 }),
    authenticated: fc.constant(false),
    method: fc.constant('none' as const),
    expiresAt: fc.constant(null),
    needsRefresh: fc.constant(false),
  })
);

/**
 * Generates valid callback result objects.
 */
const callbackResultArb = fc.oneof(
  // Success case with code and state
  fc.record({
    code: fc.string({ _minLength: 1, _maxLength: 200 }),
    state: fc.string({ _minLength: 1, _maxLength: 100 }),
    error: fc.constant(null),
    errorDescription: fc.constant(null),
  }),
  // Error case
  fc.record({
    code: fc.constant(null),
    state: fc.constant(null),
    error: fc.string({ _minLength: 1, _maxLength: 100 }),
    errorDescription: fc.option(fc.string({ _minLength: 1, _maxLength: 200 })),
  }),
  // Empty case (no response yet)
  fc.record({
    code: fc.constant(null),
    state: fc.constant(null),
    error: fc.constant(null),
    errorDescription: fc.constant(null),
  })
);

/**
 * Generates valid OAuth error objects.
 */
const oauthErrorArb = fc.record({
  code: fc.string({ _minLength: 1, _maxLength: 50 }),
  message: fc.string({ _minLength: 1, _maxLength: 200 }),
  provider: fc.string({ _minLength: 1, _maxLength: 50 }),
  recoverable: fc.boolean(),
  suggestedAction: fc.option(fc.string({ _minLength: 1, _maxLength: 200 })),
  fallbackAvailable: fc.boolean(),
});

/**
 * Generates valid OAuth provider settings objects.
 */
const oauthProviderSettingsArb = fc.record({
  enabled: fc.boolean(),
  clientId: fc.option(fc.string({ _minLength: 1, _maxLength: 100 })),
  preferredMethod: fc.constantFrom('oauth', 'api_key'),
  autoRefresh: fc.boolean(),
});

/**
 * Generates valid extended provider configuration objects.
 */
const extendedProviderConfigArb = fc.record({
  oauth: fc.option(oauthProviderSettingsArb),
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('OAuth Configuration Schema Property Tests', () => {
  /**
   * **Feature: oauth-authentication, Property 8: Configuration Round-Trip**
   * **Validates: Requirements 10.4**
   * 
   * For any valid OAuth configuration, serializing then deserializing should
   * preserve all functional properties and maintain schema compliance.
   */
  it('should preserve OAuth configuration through round-trip serialization', async () => {
    fc.assert(
      fc.property(oauthConfigArb, (originalConfig) => {
        // Parse and validate the original configuration
        const parsedConfig = OAuthConfigSchema.parse(originalConfig);

        // Serialize to JSON and back
        const serialized = JSON.stringify(parsedConfig);
        const deserialized = JSON.parse(serialized);

        // Parse the deserialized data again
        const reparsedConfig = OAuthConfigSchema.parse(deserialized);

        // Verify all functional properties are preserved
        expect(reparsedConfig.provider).toBe(originalConfig.provider);
        expect(reparsedConfig.clientId).toBe(originalConfig.clientId);
        expect(reparsedConfig.clientSecret).toBe(originalConfig.clientSecret);
        expect(reparsedConfig.authorizationEndpoint).toBe(originalConfig.authorizationEndpoint);
        expect(reparsedConfig.tokenEndpoint).toBe(originalConfig.tokenEndpoint);
        expect(reparsedConfig.scopes).toEqual(originalConfig.scopes);
        expect(reparsedConfig.redirectUri).toBe(originalConfig.redirectUri);
        expect(reparsedConfig.additionalParams).toEqual(originalConfig.additionalParams);

        // Verify schema compliance is maintained
        expect(() => OAuthConfigSchema.parse(reparsedConfig)).not.toThrow();
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: Token set schema should validate all required fields
   * 
   * For any valid token set, the schema should accept it and preserve
   * all token information through serialization.
   */
  it('should validate and preserve token set data', async () => {
    fc.assert(
      fc.property(tokenSetArb, (originalTokens) => {
        // Parse and validate the original tokens
        const parsedTokens = TokenSetSchema.parse(originalTokens);

        // Serialize to JSON and back
        const serialized = JSON.stringify(parsedTokens, (key, value) => {
          // Handle Date serialization
          if (value instanceof Date) {
            return value.toISOString();
          }
          return value;
        });
        const deserialized = JSON.parse(serialized, (key, value) => {
          // Handle Date deserialization
          if (key === 'expiresAt' && typeof value === 'string') {
            return new Date(value);
          }
          return value;
        });

        // Parse the deserialized data again
        const reparsedTokens = TokenSetSchema.parse(deserialized);

        // Verify all token properties are preserved
        expect(reparsedTokens.accessToken).toBe(originalTokens.accessToken);
        expect(reparsedTokens.refreshToken).toBe(originalTokens.refreshToken);
        expect(reparsedTokens.expiresAt.getTime()).toBe(originalTokens.expiresAt.getTime());
        expect(reparsedTokens.tokenType).toBe('Bearer');
        expect(reparsedTokens.scope).toBe(originalTokens.scope);
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: OAuth result schema should handle both success and error cases
   * 
   * For any OAuth result (success or failure), the schema should validate
   * the structure and preserve all relevant information.
   */
  it('should validate OAuth result structures consistently', async () => {
    fc.assert(
      fc.property(oauthResultArb, (originalResult) => {
        // Parse and validate the original result
        const parsedResult = OAuthResultSchema.parse(originalResult);

        // Verify logical consistency
        if (parsedResult.success) {
          // Successful results should have tokens and no error
          expect(parsedResult.tokens).toBeDefined();
          expect(parsedResult.tokens).not.toBeNull();
          expect(parsedResult.error).toBeNull();
        } else {
          // Failed results should have error and no tokens
          expect(parsedResult.error).toBeDefined();
          expect(parsedResult.error).not.toBeNull();
          expect(parsedResult.tokens).toBeNull();
        }

        // Verify provider is always present
        expect(parsedResult.provider).toBe(originalResult.provider);
        expect(parsedResult.provider.length).toBeGreaterThan(0);
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: Authentication status should reflect current state accurately
   * 
   * For any authentication status, the schema should validate the structure
   * and maintain logical consistency between fields.
   */
  it('should validate authentication status consistency', async () => {
    fc.assert(
      fc.property(authStatusArb, (originalStatus) => {
        // Parse and validate the original status
        const parsedStatus = AuthStatusSchema.parse(originalStatus);

        // Verify logical consistency
        if (parsedStatus.method === 'oauth' && parsedStatus.authenticated) {
          // OAuth authenticated users should have expiration info
          expect(parsedStatus.expiresAt).toBeDefined();
          expect(parsedStatus.expiresAt).not.toBeNull();
        }

        if (parsedStatus.method === 'none') {
          // No authentication method means not authenticated
          expect(parsedStatus.authenticated).toBe(false);
          expect(parsedStatus.needsRefresh).toBe(false);
        }

        // Verify provider is always present
        expect(parsedStatus.provider).toBe(originalStatus.provider);
        expect(parsedStatus.provider.length).toBeGreaterThan(0);
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: Callback results should handle OAuth flow responses
   * 
   * For any OAuth callback result, the schema should validate the structure
   * and handle both successful and error responses appropriately.
   */
  it('should validate OAuth callback result structures', async () => {
    fc.assert(
      fc.property(callbackResultArb, (originalCallback) => {
        // Parse and validate the original callback
        const parsedCallback = CallbackResultSchema.parse(originalCallback);

        // Verify logical consistency
        if (parsedCallback.error) {
          // Error responses should not have authorization code
          expect(parsedCallback.code).toBeNull();
        }

        if (parsedCallback.code) {
          // Successful responses should have state parameter and no error
          expect(parsedCallback.state).toBeTruthy();
          expect(parsedCallback.error).toBeNull();
        }

        // Verify all fields are preserved
        expect(parsedCallback.code).toBe(originalCallback.code);
        expect(parsedCallback.state).toBe(originalCallback.state);
        expect(parsedCallback.error).toBe(originalCallback.error);
        expect(parsedCallback.errorDescription).toBe(originalCallback.errorDescription);
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: OAuth errors should provide actionable information
   * 
   * For any OAuth error, the schema should validate the structure and
   * ensure all required error information is present.
   */
  it('should validate OAuth error information completeness', async () => {
    fc.assert(
      fc.property(oauthErrorArb, (originalError) => {
        // Parse and validate the original error
        const parsedError = OAuthErrorSchema.parse(originalError);

        // Verify required fields are present and non-empty
        expect(parsedError.code).toBe(originalError.code);
        expect(parsedError.code.length).toBeGreaterThan(0);
        expect(parsedError.message).toBe(originalError.message);
        expect(parsedError.message.length).toBeGreaterThan(0);
        expect(parsedError.provider).toBe(originalError.provider);
        expect(parsedError.provider.length).toBeGreaterThan(0);

        // Verify boolean fields are preserved
        expect(parsedError.recoverable).toBe(originalError.recoverable);
        expect(parsedError.fallbackAvailable).toBe(originalError.fallbackAvailable);

        // Verify optional fields are preserved
        expect(parsedError.suggestedAction).toBe(originalError.suggestedAction);
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: OAuth provider settings should maintain configuration integrity
   * 
   * For any OAuth provider settings, the schema should validate the structure
   * and preserve all configuration options.
   */
  it('should validate OAuth provider settings configuration', async () => {
    fc.assert(
      fc.property(oauthProviderSettingsArb, (originalSettings) => {
        // Parse and validate the original settings
        const parsedSettings = OAuthProviderSettingsSchema.parse(originalSettings);

        // Verify all fields are preserved
        expect(parsedSettings.enabled).toBe(originalSettings.enabled);
        expect(parsedSettings.clientId).toBe(originalSettings.clientId);
        expect(parsedSettings.preferredMethod).toBe(originalSettings.preferredMethod);
        expect(parsedSettings.autoRefresh).toBe(originalSettings.autoRefresh);

        // Verify enum constraints
        expect(['oauth', 'api_key']).toContain(parsedSettings.preferredMethod);

        // Verify logical consistency
        if (parsedSettings.enabled && parsedSettings.preferredMethod === 'oauth') {
          // OAuth-enabled providers should have client ID when preferring OAuth
          if (parsedSettings.clientId) {
            expect(parsedSettings.clientId.length).toBeGreaterThan(0);
          }
        }
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: Extended provider configuration should integrate OAuth settings
   * 
   * For any extended provider configuration, the schema should validate
   * the OAuth integration and maintain backward compatibility.
   */
  it('should validate extended provider configuration with OAuth', async () => {
    fc.assert(
      fc.property(extendedProviderConfigArb, (originalConfig) => {
        // Parse and validate the original configuration
        const parsedConfig = ExtendedProviderConfigSchema.parse(originalConfig);

        // Verify OAuth settings are preserved
        expect(parsedConfig.oauth).toEqual(originalConfig.oauth);

        // If OAuth is configured, validate its structure
        if (parsedConfig.oauth) {
          expect(() => OAuthProviderSettingsSchema.parse(parsedConfig.oauth)).not.toThrow();
        }

        // Verify the configuration can be serialized and deserialized
        const serialized = JSON.stringify(parsedConfig);
        const deserialized = JSON.parse(serialized);
        const reparsedConfig = ExtendedProviderConfigSchema.parse(deserialized);

        expect(reparsedConfig).toEqual(parsedConfig);
      }),
      { _numRuns: 10 }
    );
  });

  /**
   * Property: Schema validation should reject malformed configurations
   * 
   * For any configuration with missing required fields or invalid formats,
   * the schema should reject it with appropriate error messages.
   */
  it('should reject invalid OAuth configurations', async () => {
    fc.assert(
      fc.property(
        fc.record({
          provider: fc.option(fc.string()),
          clientId: fc.option(fc.string()),
          authorizationEndpoint: fc.option(fc.string()),
          tokenEndpoint: fc.option(fc.string()),
          scopes: fc.option(fc.array(fc.string())),
          redirectUri: fc.option(fc.string()),
        }),
        (invalidConfig) => {
          // Create invalid configurations by removing required fields or using invalid formats
          const config: any = { ...invalidConfig };

          // Make it invalid by removing required fields or using invalid formats
          if (Math.random() < 0.5) {config.provider = undefined;}
          if (Math.random() < 0.5) {config.clientId = undefined;}
          if (Math.random() < 0.5) {config.authorizationEndpoint = undefined;}
          if (Math.random() < 0.5) {config.tokenEndpoint = undefined;}
          if (Math.random() < 0.5) {config.scopes = undefined;}
          if (Math.random() < 0.5) {config.redirectUri = undefined;}

          // Or use invalid URL formats
          if (config.authorizationEndpoint && Math.random() < 0.3) {
            config.authorizationEndpoint = 'not-a-url';
          }
          if (config.tokenEndpoint && Math.random() < 0.3) {
            config.tokenEndpoint = 'invalid-url';
          }
          if (config.redirectUri && Math.random() < 0.3) {
            config.redirectUri = 'bad-url';
          }

          // Schema should reject invalid configurations
          expect(() => OAuthConfigSchema.parse(config)).toThrow();
        }
      ),
      { _numRuns: 10 }
    );
  });
});