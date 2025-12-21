/**
 * @fileoverview Core Zod schemas with branded types for type safety
 * @module shared/types/schemas
 *
 * This module defines all core data schemas using Zod for runtime validation
 * and branded types for compile-time type safety. All external data MUST be
 * validated through these schemas before use.
 */

import { z } from 'zod';

// =============================================================================
// BRANDED ID TYPES
// =============================================================================

/**
 * Branded type for Message IDs.
 * Use MessageIdSchema.parse() to create valid MessageId values.
 */
export const MessageIdSchema = z.string().uuid().brand<'MessageId'>();
export type MessageId = z.infer<typeof MessageIdSchema>;

/**
 * Branded type for Session IDs.
 * Use SessionIdSchema.parse() to create valid SessionId values.
 */
export const SessionIdSchema = z.string().uuid().brand<'SessionId'>();
export type SessionId = z.infer<typeof SessionIdSchema>;

/**
 * Branded type for Tool Call IDs.
 * Use ToolCallIdSchema.parse() to create valid ToolCallId values.
 */
export const ToolCallIdSchema = z.string().min(1).brand<'ToolCallId'>();
export type ToolCallId = z.infer<typeof ToolCallIdSchema>;

/**
 * Branded type for file paths within workspace.
 * Use FilePathSchema.parse() to create valid FilePath values.
 */
export const FilePathSchema = z.string().min(1).brand<'FilePath'>();
export type FilePath = z.infer<typeof FilePathSchema>;

// =============================================================================
// CONTENT BLOCKS
// =============================================================================

/**
 * Text content block schema.
 */
export const TextContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextContentBlock = z.infer<typeof TextContentBlockSchema>;

/**
 * Tool use content block schema (from assistant).
 */
export const ToolUseContentBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: ToolCallIdSchema,
  name: z.string(),
  input: z.record(z.unknown()),
});
export type ToolUseContentBlock = z.infer<typeof ToolUseContentBlockSchema>;

/**
 * Tool result content block schema (from tool execution).
 */
export const ToolResultContentBlockSchema = z.object({
  type: z.literal('tool_result'),
  toolUseId: ToolCallIdSchema,
  content: z.string(),
  isError: z.boolean().optional(),
});
export type ToolResultContentBlock = z.infer<typeof ToolResultContentBlockSchema>;

/**
 * Union of all content block types.
 */
export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextContentBlockSchema,
  ToolUseContentBlockSchema,
  ToolResultContentBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Base JSON Schema parameter definition for tool parameters.
 */
const BaseParameterSchemaSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string(),
  enum: z.array(z.string()).optional(),
  default: z.unknown().optional(),
});

/**
 * JSON Schema parameter definition for tool parameters.
 * Uses lazy evaluation for recursive array items.
 */
export const ParameterSchemaSchema: z.ZodType<{
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[] | undefined;
  items?: unknown;
  default?: unknown;
}> = BaseParameterSchemaSchema.extend({
  items: z.lazy(() => ParameterSchemaSchema).optional(),
});
export type ParameterSchema = z.infer<typeof ParameterSchemaSchema>;

/**
 * Universal tool definition schema.
 * This is the canonical format used internally; adapters convert to provider formats.
 */
export const UniversalToolDefinitionSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  description: z.string().min(1).max(1024),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(ParameterSchemaSchema),
    required: z.array(z.string()),
  }),
});
export type UniversalToolDefinition = z.infer<typeof UniversalToolDefinitionSchema>;

// =============================================================================
// TOOL CALLS & RESULTS
// =============================================================================

/**
 * Tool call schema (request from LLM).
 */
export const ToolCallSchema = z.object({
  id: ToolCallIdSchema,
  name: z.string(),
  arguments: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Tool result schema (response from tool execution).
 */
export const ToolResultSchema = z.object({
  toolCallId: ToolCallIdSchema,
  content: z.string(),
  isError: z.boolean().default(false),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

// =============================================================================
// MESSAGES
// =============================================================================

/**
 * Message role enum.
 */
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/**
 * Token usage statistics.
 */
export const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Core message schema for conversation history.
 *
 * Messages can contain either a simple string content or an array of
 * structured content blocks (for multi-modal or tool interactions).
 */
export const MessageSchema = z.object({
  id: MessageIdSchema,
  role: MessageRoleSchema,
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  timestamp: z.number().int().positive(),
  model: z.string().optional().nullable(),
  tokens: TokenUsageSchema.optional().nullable(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(ToolResultSchema).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

// =============================================================================
// SESSION
// =============================================================================

/**
 * Aggregate token count for a session.
 */
export const SessionTokenCountSchema = z.object({
  total: z.number().int().nonnegative(),
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
});
export type SessionTokenCount = z.infer<typeof SessionTokenCountSchema>;

/**
 * Session schema for persistence.
 *
 * Represents a complete conversation session including all messages,
 * context files, and metadata for restoration.
 */
export const SessionSchema = z.object({
  id: SessionIdSchema,
  version: z.string().default('1.0.0'),
  created: z.number().int().positive(),
  lastModified: z.number().int().positive(),
  model: z.string(),
  workspaceRoot: z.string(),
  tokenCount: SessionTokenCountSchema,
  filesAccessed: z.array(z.string()),
  messages: z.array(MessageSchema),
  contextFiles: z.array(z.string()),
  title: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

/**
 * Session metadata for listing (without full message history).
 */
export const SessionMetadataSchema = z.object({
  id: SessionIdSchema,
  created: z.number().int().positive(),
  lastModified: z.number().int().positive(),
  model: z.string(),
  tokenCount: SessionTokenCountSchema,
  title: z.string().optional().nullable(),
  workspaceRoot: z.string().optional().nullable(),
  messageCount: z.number().int().nonnegative(),
  lastMessage: z.string().optional().nullable(),
  contextFiles: z.array(z.string()),
  tags: z.array(z.string()).default([]),
  preview: z.string().optional().nullable(),
});
export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

/**
 * Session index schema for fast metadata access.
 */
export const SessionIndexSchema = z.object({
  version: z.string().default('1.0.0'),
  lastUpdated: z.number().int().positive(),
  sessions: z.record(SessionIdSchema, SessionMetadataSchema),
});
export type SessionIndex = z.infer<typeof SessionIndexSchema>;

/**
 * Versioned session storage format.
 */
export const VersionedSessionSchema = z.object({
  version: z.string().default('1.0.0'),
  compressed: z.boolean().default(false),
  checksum: z.string().optional(),
  data: z.union([SessionSchema, z.string()]), // Can be Session object or compressed string
});
export type VersionedSession = z.infer<typeof VersionedSessionSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a new MessageId.
 *
 * @returns A new branded MessageId
 */
export function createMessageId(): MessageId {
  return MessageIdSchema.parse(globalThis.crypto.randomUUID());
}

/**
 * Creates a new SessionId.
 *
 * @returns A new branded SessionId
 */
export function createSessionId(): SessionId {
  return SessionIdSchema.parse(globalThis.crypto.randomUUID());
}

/**
 * Creates a new ToolCallId.
 *
 * @param id - The raw ID string
 * @returns A branded ToolCallId
 */
export function createToolCallId(id: string): ToolCallId {
  return ToolCallIdSchema.parse(id);
}

/**
 * Creates a new FilePath.
 *
 * @param path - The raw path string
 * @returns A branded FilePath
 */
export function createFilePath(path: string): FilePath {
  return FilePathSchema.parse(path);
}
