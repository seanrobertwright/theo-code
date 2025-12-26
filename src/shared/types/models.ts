/**
 * @fileoverview Model-related type definitions
 * @module shared/types/models
 */

import { z } from 'zod';

// =============================================================================
// MODEL PROVIDER TYPES
// =============================================================================

/**
 * Supported LLM provider identifiers.
 */
export const ModelProviderSchema = z.enum([
  'openai',
  'anthropic', 
  'google',
  'openrouter',
  'cohere',
  'mistral',
  'together',
  'perplexity',
  'ollama'
]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

/**
 * Rate limiting configuration.
 */
export const RateLimitConfigSchema = z.object({
  requestsPerMinute: z.number().int().positive().optional(),
  tokensPerMinute: z.number().int().positive().optional(),
  concurrentRequests: z.number().int().positive().default(5),
});
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Provider-specific configuration options.
 */
export const ProviderSpecificConfigSchema = z.object({
  // Anthropic specific
  anthropic: z.object({
    maxTokens: z.number().int().positive().optional(),
    systemMessage: z.string().optional(),
  }).optional(),
  
  // Google/Gemini specific  
  google: z.object({
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    mediaResolution: z.enum(['low', 'medium', 'high', 'ultra_high']).optional(),
    thoughtSignatures: z.boolean().optional(),
    imageConfig: z.object({
      aspectRatio: z.string().optional(),
      imageSize: z.enum(['1K', '2K', '4K']).optional(),
    }).optional(),
  }).optional(),
  
  // OpenRouter specific
  openrouter: z.object({
    models: z.array(z.string()).optional(),
    trackCredits: z.boolean().default(true),
  }).optional(),
  
  // Ollama specific
  ollama: z.object({
    keepAlive: z.string().optional(),
    numCtx: z.number().int().positive().optional(),
    numGpu: z.number().int().nonnegative().optional(),
  }).optional(),
});
export type ProviderSpecificConfig = z.infer<typeof ProviderSpecificConfigSchema>;

/**
 * Retry configuration for error handling.
 */
export const RetryConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative().default(3),
  backoffMs: z.number().int().positive().default(1000),
  retryableErrors: z.array(z.string()).default(['RATE_LIMITED', 'NETWORK_ERROR', 'TIMEOUT']),
});
export type RetryConfig = z.infer<typeof RetryConfigSchema>;

/**
 * Model configuration schema.
 */
export const ModelConfigSchema = z.object({
  provider: ModelProviderSchema,
  model: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  contextLimit: z.number().int().positive().default(128000),
  maxOutputTokens: z.number().int().positive().default(4096),
  
  // Enhanced configuration options
  fallbackProviders: z.array(ModelProviderSchema).optional(),
  rateLimit: RateLimitConfigSchema.optional(),
  retryConfig: RetryConfigSchema.optional(),
  providerConfig: ProviderSpecificConfigSchema.optional(),
  
  // Feature flags
  features: z.object({
    toolCalling: z.boolean().default(true),
    streaming: z.boolean().default(true),
    multimodal: z.boolean().default(false),
    imageGeneration: z.boolean().default(false),
    reasoning: z.boolean().default(false),
  }).optional(),
  
  // Priority for provider selection (higher = preferred)
  priority: z.number().int().nonnegative().default(0),
  enabled: z.boolean().default(true),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// =============================================================================
// STREAMING TYPES
// =============================================================================

/**
 * Text chunk from streaming response.
 */
export const TextStreamChunkSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextStreamChunk = z.infer<typeof TextStreamChunkSchema>;

/**
 * Tool call chunk from streaming response.
 */
export const ToolCallStreamChunkSchema = z.object({
  type: z.literal('tool_call'),
  id: z.string(),
  name: z.string(),
  arguments: z.string(), // JSON string, accumulated
});
export type ToolCallStreamChunk = z.infer<typeof ToolCallStreamChunkSchema>;

/**
 * Completion signal from streaming response.
 */
export const DoneStreamChunkSchema = z.object({
  type: z.literal('done'),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export type DoneStreamChunk = z.infer<typeof DoneStreamChunkSchema>;

/**
 * Error from streaming response.
 */
export const ErrorStreamChunkSchema = z.object({
  type: z.literal('error'),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorStreamChunk = z.infer<typeof ErrorStreamChunkSchema>;

/**
 * Union of all stream chunk types.
 */
export const StreamChunkSchema = z.discriminatedUnion('type', [
  TextStreamChunkSchema,
  ToolCallStreamChunkSchema,
  DoneStreamChunkSchema,
  ErrorStreamChunkSchema,
]);
export type StreamChunk = z.infer<typeof StreamChunkSchema>;

// =============================================================================
// GENERATION OPTIONS
// =============================================================================

/**
 * Response format configuration for structured outputs.
 */
export const ResponseFormatSchema = z.object({
  type: z.enum(['text', 'json_object']),
  schema: z.any().optional(), // JSON Schema for structured outputs
});
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

/**
 * Options for text generation.
 */
export const GenerateOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).optional(),
  responseFormat: ResponseFormatSchema.optional(),
  includeBuiltInTools: z.boolean().default(false), // For Google Search, Code Execution
});
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
