/**
 * @fileoverview Configuration schemas for application settings
 * @module config/schemas
 */

import { z } from 'zod';
import { ModelProviderSchema } from '../shared/types/index.js';

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
  providers: z
    .object({
      fallbackChain: z.array(ModelProviderSchema).optional(),
      defaultRateLimit: z
        .object({
          requestsPerMinute: z.number().int().positive().default(60),
          tokensPerMinute: z.number().int().positive().default(100000),
          concurrentRequests: z.number().int().positive().default(5),
        })
        .optional(),
      healthCheckInterval: z.number().int().positive().default(300000), // 5 minutes
    })
    .optional(),

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

  /** Files/directories to auto-load into context */
  contextFiles: z.array(z.string()).optional(),

  /** Patterns to ignore (in addition to .gitignore) */
  ignore: z.array(z.string()).optional(),

  /** Custom system prompt additions */
  systemPrompt: z.string().optional(),

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
