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
export const ModelProviderSchema = z.enum(['openai', 'anthropic', 'gemini', 'ollama']);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

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
 * Options for text generation.
 */
export const GenerateOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).optional(),
});
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
