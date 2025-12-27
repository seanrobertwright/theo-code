/**
 * @fileoverview OAuth configuration serialization with security considerations
 * @module features/auth/config-serializer
 */

import { z } from 'zod';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import type { OAuthConfig, TokenSet, OAuthProviderSettings } from './types.js';
import type { ProviderConfig } from '../../config/schemas.js';

// =============================================================================
// SERIALIZATION SCHEMAS
// =============================================================================

/**
 * Secure OAuth configuration schema for serialization.
 * Excludes sensitive data like client secrets and tokens.
 */
export const SecureOAuthConfigSchema = z.object({
  /** Provider name */
  provider: z.string().min(1),
  
  /** OAuth client ID (safe to serialize) */
  clientId: z.string().min(1),
  
  /** Authorization endpoint URL */
  authorizationEndpoint: z.string().url(),
  
  /** Token exchange endpoint URL */
  tokenEndpoint: z.string().url(),
  
  /** OAuth scopes */
  scopes: z.array(z.string().min(1)).min(1),
  
  /** Redirect URI for OAuth callback */
  redirectUri: z.string().url(),
  
  /** Additional OAuth parameters (excluding sensitive ones) */
  additionalParams: z.record(z.string()).nullish(),
  
  /** OAuth provider settings */
  settings: z.object({
    enabled: z.boolean(),
    preferredMethod: z.enum(['oauth', 'api_key']),
    autoRefresh: z.boolean(),
  }),
});
export type SecureOAuthConfig = z.infer<typeof SecureOAuthConfigSchema>;

/**
 * Masked token information schema for display purposes.
 */
export const MaskedTokenInfoSchema = z.object({
  /** Provider name */
  provider: z.string().min(1),
  
  /** Whether tokens are present */
  hasTokens: z.boolean(),
  
  /** Masked access token (first 8 chars + ...) */
  maskedAccessToken: z.string().nullish(),
  
  /** Token expiration timestamp */
  expiresAt: z.date().nullish(),
  
  /** Whether refresh token is available */
  hasRefreshToken: z.boolean(),
  
  /** Token type */
  tokenType: z.string().default('Bearer'),
  
  /** Whether tokens are expired */
  isExpired: z.boolean(),
  
  /** Whether tokens need refresh */
  needsRefresh: z.boolean(),
});
export type MaskedTokenInfo = z.infer<typeof MaskedTokenInfoSchema>;

/**
 * Serializable provider configuration with OAuth support.
 */
export const SerializableProviderConfigSchema = z.object({
  /** Provider name */
  name: z.string(),
  
  /** Whether this provider is enabled */
  enabled: z.boolean().default(true),
  
  /** Priority for fallback ordering */
  priority: z.number().int().nonnegative().default(0),
  
  /** Custom base URL (safe to serialize) */
  baseUrl: z.string().url().nullish(),
  
  /** OAuth configuration (secure subset) */
  oauth: SecureOAuthConfigSchema.nullish(),
  
  /** Rate limiting configuration */
  rateLimit: z.object({
    requestsPerMinute: z.number().int().positive().nullish(),
    tokensPerMinute: z.number().int().positive().nullish(),
    concurrentRequests: z.number().int().positive().nullish(),
  }).nullish(),
  
  /** Provider-specific configuration (excluding sensitive data) */
  providerConfig: z.record(z.any()).nullish(),
});
export type SerializableProviderConfig = z.infer<typeof SerializableProviderConfigSchema>;

// =============================================================================
// SENSITIVE DATA PATTERNS
// =============================================================================

/**
 * Patterns for identifying sensitive configuration keys.
 */
const SENSITIVE_KEY_PATTERNS = [
  /^.*secret.*$/i,
  /^.*key.*$/i,
  /^.*token.*$/i,
  /^.*password.*$/i,
  /^.*credential.*$/i,
  /^.*auth.*$/i,
  /^client_secret$/i,
  /^refresh_token$/i,
  /^access_token$/i,
];

/**
 * Check if a configuration key contains sensitive data.
 */
function isSensitiveKey(_key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Recursively filter out sensitive data from configuration object.
 */
function filterSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj) {
    return obj.map(filterSensitiveData);
  }
  
  if (typeof obj === 'object') {
    const filtered: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!isSensitiveKey(key) {
        filtered[key] = filterSensitiveData(value);
      } else {
        // Replace sensitive values with placeholder
        filtered[key] = '[REDACTED]';
      }
    }
    return filtered;
  }
  
  return obj;
}

// =============================================================================
// OAUTH CONFIGURATION SERIALIZER
// =============================================================================

/**
 * OAuth configuration serializer with security considerations.
 */
export class OAuthConfigSerializer {
  /**
   * Serialize OAuth configuration to YAML format with security masking.
   */
  static serializeOAuthConfig(_config: OAuthConfig, _settings: OAuthProviderSettings): string {
    const secureConfig: SecureOAuthConfig = {
      provider: config.provider,
      clientId: config.clientId,
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      scopes: config.scopes,
      redirectUri: config.redirectUri,
      additionalParams: filterSensitiveData(config.additionalParams),
      settings: {
        enabled: settings.enabled,
        preferredMethod: settings.preferredMethod,
        autoRefresh: settings.autoRefresh,
      },
    };
    
    return stringifyYaml(secureConfig, {
      _indent: 2,
      _lineWidth: 120,
      _minContentWidth: 0,
    });
  }
  
  /**
   * Deserialize OAuth configuration from YAML format.
   */
  static deserializeOAuthConfig(_yamlContent: string): SecureOAuthConfig {
    try {
      const parsed = parseYaml(yamlContent);
      return SecureOAuthConfigSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to deserialize OAuth configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Serialize provider configuration with OAuth support.
   */
  static serializeProviderConfig(_config: ProviderConfig): string {
    // Convert to serializable format, filtering sensitive data
    const serializableConfig: SerializableProviderConfig = {
      name: config.name,
      enabled: config.enabled ?? true,
      priority: config.priority ?? 0,
      baseUrl: config.baseUrl ?? null,
      oauth: config.oauth ? {
        provider: config.name,
        clientId: config.oauth.clientId ?? '',
        authorizationEndpoint: '', // Will be filled by provider adapter
        tokenEndpoint: '', // Will be filled by provider adapter
        scopes: [], // Will be filled by provider adapter
        redirectUri: 'http://localhost:8080/callback',
        _additionalParams: null,
        settings: {
          enabled: config.oauth.enabled,
          preferredMethod: config.oauth.preferredMethod,
          autoRefresh: config.oauth.autoRefresh,
        },
      } : null,
      rateLimit: config.rateLimit ? {
        requestsPerMinute: config.rateLimit.requestsPerMinute ?? null,
        tokensPerMinute: config.rateLimit.tokensPerMinute ?? null,
        concurrentRequests: config.rateLimit.concurrentRequests ?? null,
      } : null,
      providerConfig: filterSensitiveData(config.providerConfig),
    };
    
    return stringifyYaml(serializableConfig, {
      _indent: 2,
      _lineWidth: 120,
      _minContentWidth: 0,
    });
  }
  
  /**
   * Deserialize provider configuration from YAML format.
   */
  static deserializeProviderConfig(_yamlContent: string): SerializableProviderConfig {
    try {
      const parsed = parseYaml(yamlContent);
      return SerializableProviderConfigSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Failed to deserialize provider configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Validate OAuth configuration round-trip consistency.
   */
  static validateRoundTrip(_originalConfig: OAuthConfig, _settings: OAuthProviderSettings): boolean {
    try {
      // Serialize then deserialize
      const serialized = this.serializeOAuthConfig(originalConfig, settings);
      const deserialized = this.deserializeOAuthConfig(serialized);
      
      // Check that functional properties are preserved
      return (
        deserialized.provider === originalConfig.provider &&
        deserialized.clientId === originalConfig.clientId &&
        deserialized.authorizationEndpoint === originalConfig.authorizationEndpoint &&
        deserialized.tokenEndpoint === originalConfig.tokenEndpoint &&
        JSON.stringify(deserialized.scopes.sort()) === JSON.stringify(originalConfig.scopes.sort()) &&
        deserialized.redirectUri === originalConfig.redirectUri &&
        deserialized.settings.enabled === settings.enabled &&
        deserialized.settings.preferredMethod === settings.preferredMethod &&
        deserialized.settings.autoRefresh === settings.autoRefresh
      );
    } catch {
      return false;
    }
  }
}

// =============================================================================
// TOKEN INFORMATION FORMATTER
// =============================================================================

/**
 * Token information formatter with security masking.
 */
export class TokenInfoFormatter {
  /**
   * Create masked token information for display.
   */
  static createMaskedTokenInfo(_provider: string, tokens: TokenSet | null): MaskedTokenInfo {
    if (!tokens) {
      return {
        provider,
        _hasTokens: false,
        _maskedAccessToken: null,
        _expiresAt: null,
        _hasRefreshToken: false,
        tokenType: 'Bearer',
        _isExpired: false,
        _needsRefresh: false,
      };
    }
    
    const now = new Date();
    const isExpired = tokens.expiresAt <= now;
    const needsRefresh = tokens.expiresAt <= new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes buffer
    
    return {
      provider,
      _hasTokens: true,
      maskedAccessToken: this.maskToken(tokens.accessToken),
      expiresAt: tokens.expiresAt,
      hasRefreshToken: !!tokens.refreshToken,
      tokenType: tokens.tokenType,
      isExpired,
      needsRefresh,
    };
  }
  
  /**
   * Mask a token for safe display.
   */
  static maskToken(_token: string): string {
    if (token.length <= 8) {
      return '***';
    }
    
    // For JWT tokens (starting with eyJ), show less to avoid revealing token type
    if (token.startsWith('eyJ') {
      return 'eyJ...';
    }
    
    // For API keys with known prefixes, show only the prefix
    if (token.startsWith('sk-') {
      return 'sk-...';
    }
    if (token.startsWith('sk-ant-') {
      return 'sk-ant-...';
    }
    
    // For other tokens, show first 3 characters for better security
    return `${token.substring(0, 3)}...`;
  }
  
  /**
   * Format token information for display.
   */
  static formatTokenInfo(_maskedInfo: MaskedTokenInfo): string {
    if (!maskedInfo.hasTokens) {
      return `${maskedInfo.provider}: No tokens`;
    }
    
    const parts = [
      `${maskedInfo.provider}: ${maskedInfo.maskedAccessToken}`,
      `Type: ${maskedInfo.tokenType}`,
    ];
    
    if (maskedInfo.expiresAt) {
      const expiresStr = maskedInfo.isExpired ? 'EXPIRED' : maskedInfo.expiresAt.toISOString();
      parts.push(`Expires: ${expiresStr}`);
    }
    
    if (maskedInfo.hasRefreshToken) {
      parts.push('Refresh: Available');
    }
    
    if (maskedInfo.needsRefresh && !maskedInfo.isExpired) {
      parts.push('Status: Needs Refresh');
    } else if (maskedInfo.isExpired) {
      parts.push('Status: Expired');
    } else {
      parts.push('Status: Valid');
    }
    
    return parts.join(', ');
  }
  
  /**
   * Format multiple token infos for display.
   */
  static formatMultipleTokenInfos(tokenInfos: MaskedTokenInfo[]): string {
    if (tokenInfos.length === 0) {
      return 'No OAuth tokens configured';
    }
    
    return tokenInfos
      .map(info => this.formatTokenInfo(info))
      .join('\n');
  }
}

// =============================================================================
// CONFIGURATION VALIDATOR
// =============================================================================

/**
 * OAuth configuration validator.
 */
export class OAuthConfigValidator {
  /**
   * Validate OAuth configuration structure and values.
   */
  static validateOAuthConfig(_config: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      SecureOAuthConfigSchema.parse(config);
      return { _valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
      } else {
        errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      return { _valid: false, errors };
    }
  }
  
  /**
   * Validate provider configuration with OAuth support.
   */
  static validateProviderConfig(_config: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      SerializableProviderConfigSchema.parse(config);
      return { _valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
      } else {
        errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      return { _valid: false, errors };
    }
  }
  
  /**
   * Check if configuration contains sensitive data that should be masked.
   */
  static containsSensitiveData(_config: any): boolean {
    if (config === null ?? config === undefined) {
      return false;
    }
    
    if (Array.isArray(config) {
      return config.some(item => this.containsSensitiveData(item));
    }
    
    if (typeof config === 'object') {
      for (const [key, value] of Object.entries(config)) {
        if (isSensitiveKey(key) {
    || this.containsSensitiveData(value)) {
  }
          return true;
        }
      }
    }
    
    return false;
  }
}