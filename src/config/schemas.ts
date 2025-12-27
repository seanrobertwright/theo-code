/**
 * @fileoverview Configuration schemas for application settings
 * @module config/schemas
 */

import { z } from 'zod';
import { ModelProviderSchema, RateLimitConfigSchema, RetryConfigSchema, ProviderSpecificConfigSchema } from '../shared/types/models.js';

// =============================================================================
// OAUTH CONFIGURATION SCHEMAS
// =============================================================================

/**
 * OAuth provider settings schema.
 */
export const OAuthProviderSettingsSchema = z.object({
  /** Whether OAuth is enabled for this provider */
  enabled: z.boolean().default(false),
  
  /** OAuth client ID */
  clientId: z.string().optional(),
  
  /** Preferred authentication method */
  preferredMethod: z.enum(['oauth', 'api_key']).default('oauth'),
  
  /** Whether to automatically refresh tokens */
  autoRefresh: z.boolean().default(true),
});
export type OAuthProviderSettings = z.infer<typeof OAuthProviderSettingsSchema>;

// =============================================================================
// PROVIDER CONFIGURATION SCHEMAS
// =============================================================================

/**
 * OAuth provider settings schema.
 */
export const OAuthProviderSettingsSchema = z.object({
  /** Whether OAuth is enabled for this provider */
  enabled: z.boolean().default(false),
  
  /** OAuth client ID */
  clientId: z.string().optional(),
  
  /** Preferred authentication method */
  preferredMethod: z.enum(['oauth', 'api_key']).default('oauth'),
  
  /** Whether to automatically refresh tokens */
  autoRefresh: z.boolean().default(true),
});
export type OAuthProviderSettings = z.infer<typeof OAuthProviderSettingsSchema>;

/**
 * Individual provider configuration.
 */
export const ProviderConfigSchema = z.object({
  /** Provider name */
  name: ModelProviderSchema,
  
  /** API key (optional, can be set via environment) */
  apiKey: z.string().optional(),
  
  /** Custom base URL for the provider */
  baseUrl: z.string().url().optional(),
  
  /** Whether this provider is enabled */
  enabled: z.boolean().default(true),
  
  /** Priority for fallback ordering (higher = preferred) */
  priority: z.number().int().nonnegative().default(0),
  
  /** Rate limiting configuration */
  rateLimit: RateLimitConfigSchema.optional(),
  
  /** Retry configuration */
  retryConfig: RetryConfigSchema.optional(),
  
  /** Provider-specific configuration */
  providerConfig: ProviderSpecificConfigSchema.optional(),
  
  /** OAuth-specific configuration */
  oauth: OAuthProviderSettingsSchema.optional(),
  
  /** Available models for this provider */
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    contextLimit: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    supportsToolCalling: z.boolean().default(false),
    supportsStreaming: z.boolean().default(false),
    supportsMultimodal: z.boolean().default(false),
    supportsImageGeneration: z.boolean().default(false),
    supportsReasoning: z.boolean().default(false),
    costPer1kTokens: z.object({
      input: z.number().nonnegative().optional(),
      output: z.number().nonnegative().optional(),
    }).optional(),
  })).optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Multi-provider configuration schema.
 */
export const MultiProviderConfigSchema = z.object({
  /** List of configured providers */
  providers: z.array(ProviderConfigSchema).default([]),
  
  /** Default fallback chain */
  fallbackChain: z.array(ModelProviderSchema).optional(),
  
  /** Default rate limiting for all providers */
  defaultRateLimit: RateLimitConfigSchema.optional(),
  
  /** Health check interval in milliseconds */
  healthCheckInterval: z.number().int().positive().default(300000), // 5 minutes
  
  /** Whether to enable automatic provider switching on failures */
  autoSwitchOnFailure: z.boolean().default(true),
  
  /** Maximum number of fallback attempts */
  maxFallbackAttempts: z.number().int().nonnegative().default(3),
});
export type MultiProviderConfig = z.infer<typeof MultiProviderConfigSchema>;

// =============================================================================
// GLOBAL CONFIG SCHEMA
// =============================================================================

/**
 * Global configuration schema (~/.theo-code/config.yaml).
 */
export const GlobalConfigSchema = z.object({
  /** Default model provider */
  defaultProvider: ModelProviderSchema.default('openai'),

  /** Default model identifier */
  defaultModel: z.string().default('gpt-4o'),

  /** API keys (fallback if not in keychain) */
  apiKeys: z
    .object({
      openai: z.string().optional(),
      anthropic: z.string().optional(),
      google: z.string().optional(),
      openrouter: z.string().optional(),
      cohere: z.string().optional(),
      mistral: z.string().optional(),
      together: z.string().optional(),
      perplexity: z.string().optional(),
    })
    .optional(),

  /** Ollama configuration */
  ollama: z
    .object({
      baseUrl: z.string().url().default('http://localhost:11434'),
      defaultModel: z.string().default('llama3'),
    })
    .optional(),

  /** Provider configurations */
  providers: MultiProviderConfigSchema.optional(),

  /** Session settings */
  session: z
    .object({
      autoSaveInterval: z.number().int().positive().default(30000),
      maxSessions: z.number().int().positive().default(50),
      sessionsDir: z.string().optional(),
    })
    .optional(),

  /** Editor preferences */
  editor: z
    .object({
      theme: z.enum(['dark', 'light']).default('dark'),
      syntaxHighlighting: z.boolean().default(true),
    })
    .optional(),
});
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// =============================================================================
// PROJECT CONFIG SCHEMA
// =============================================================================

/**
 * Project configuration schema (.agentrc).
 */
export const ProjectConfigSchema = z.object({
  /** Override model for this project */
  model: z.string().optional(),
  
  /** Override provider for this project */
  provider: ModelProviderSchema.optional(),

  /** Files/directories to auto-load into context */
  contextFiles: z.array(z.string()).optional(),

  /** Patterns to ignore (in addition to .gitignore) */
  ignore: z.array(z.string()).optional(),

  /** Custom system prompt additions */
  systemPrompt: z.string().optional(),
  
  /** Project-specific provider overrides */
  providerOverrides: z.record(ModelProviderSchema, z.object({
    enabled: z.boolean().optional(),
    priority: z.number().int().nonnegative().optional(),
    rateLimit: RateLimitConfigSchema.optional(),
    providerConfig: ProviderSpecificConfigSchema.optional(),
  })).optional(),

  /** MCP servers to connect */
  mcpServers: z
    .array(
      z.object({
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
      })
    )
    .optional(),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// =============================================================================
// SECURITY POLICY SCHEMA
// =============================================================================

/**
 * Security policy schema (.agent-policy.yaml).
 */
export const SecurityPolicySchema = z.object({
  /** Allow network access from sandbox */
  allowNet: z.boolean().default(false),

  /** Allowed network hosts (if allowNet is true) */
  allowedHosts: z.array(z.string()).optional(),

  /** Allow shell command execution */
  allowExec: z.boolean().default(true),

  /** Blocked shell commands */
  blockedCommands: z
    .array(z.string())
    .default(['rm -rf /', 'sudo', 'chmod 777']),

  /** Auto-approve read operations without confirmation */
  autoApproveRead: z.boolean().default(true),

  /** Auto-approve write operations (DANGEROUS) */
  autoApproveWrite: z.boolean().default(false),

  /** Maximum file size to read (bytes) */
  maxFileSize: z.number().int().positive().default(1024 * 1024), // 1MB

  /** Sandbox execution timeout (ms) */
  executionTimeout: z.number().int().positive().default(30000),
});
export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;

// =============================================================================
// MERGED CONFIG
// =============================================================================

/**
 * Complete merged configuration.
 */
export const MergedConfigSchema = z.object({
  global: GlobalConfigSchema,
  project: ProjectConfigSchema.optional(),
  policy: SecurityPolicySchema,
  agentsInstructions: z.string().optional(),
});
export type MergedConfig = z.infer<typeof MergedConfigSchema>;
