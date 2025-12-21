/**
 * @fileoverview Public API for shared types
 * @module shared/types
 */

// Core schemas and types
export {
  // Branded ID schemas
  MessageIdSchema,
  SessionIdSchema,
  ToolCallIdSchema,
  FilePathSchema,
  // Branded ID types
  type MessageId,
  type SessionId,
  type ToolCallId,
  type FilePath,
  // Content block schemas
  TextContentBlockSchema,
  ToolUseContentBlockSchema,
  ToolResultContentBlockSchema,
  ContentBlockSchema,
  // Content block types
  type TextContentBlock,
  type ToolUseContentBlock,
  type ToolResultContentBlock,
  type ContentBlock,
  // Tool definition schemas
  ParameterSchemaSchema,
  UniversalToolDefinitionSchema,
  // Tool definition types
  type ParameterSchema,
  type UniversalToolDefinition,
  // Tool call/result schemas
  ToolCallSchema,
  ToolResultSchema,
  // Tool call/result types
  type ToolCall,
  type ToolResult,
  // Message schemas
  MessageRoleSchema,
  TokenUsageSchema,
  MessageSchema,
  // Message types
  type MessageRole,
  type TokenUsage,
  type Message,
  // Session schemas
  SessionTokenCountSchema,
  SessionSchema,
  SessionMetadataSchema,
  SessionIndexSchema,
  VersionedSessionSchema,
  // Session types
  type SessionTokenCount,
  type Session,
  type SessionMetadata,
  type SessionIndex,
  type VersionedSession,
  // Helper functions
  createMessageId,
  createSessionId,
  createToolCallId,
  createFilePath,
} from './schemas.js';

// Model types
export {
  ModelProviderSchema,
  ModelConfigSchema,
  TextStreamChunkSchema,
  ToolCallStreamChunkSchema,
  DoneStreamChunkSchema,
  ErrorStreamChunkSchema,
  StreamChunkSchema,
  GenerateOptionsSchema,
  type ModelProvider,
  type ModelConfig,
  type TextStreamChunk,
  type ToolCallStreamChunk,
  type DoneStreamChunk,
  type ErrorStreamChunk,
  type StreamChunk,
  type GenerateOptions,
} from './models.js';

// Tool types
export {
  ToolExecutionResultSchema,
  ToolCategorySchema,
  ToolExecutionError,
  ToolValidationError,
  type ToolContext,
  type ToolExecutionResult,
  type Tool,
  type ToolRegistryEntry,
  type ToolCategory,
} from './tools.js';
