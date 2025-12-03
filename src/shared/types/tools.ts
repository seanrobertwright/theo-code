/**
 * @fileoverview Tool-related type definitions
 * @module shared/types/tools
 */

import { z } from 'zod';
import type { UniversalToolDefinition } from './schemas.js';

// =============================================================================
// TOOL EXECUTION CONTEXT
// =============================================================================

/**
 * Context provided to tools during execution.
 */
export interface ToolContext {
  /** Absolute path to workspace root directory */
  readonly workspaceRoot: string;

  /**
   * Request user confirmation for an action.
   *
   * @param _message - Description of the action requiring confirmation
   * @returns Promise resolving to true if confirmed, false if rejected
   */
  confirm: (_message: string) => Promise<boolean>;

  /**
   * Report progress during long-running operations.
   *
   * @param _message - Progress message to display
   */
  onProgress?: (_message: string) => void;
}

/**
 * Result of tool execution.
 */
export const ToolExecutionResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
});
export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;

// =============================================================================
// TOOL INTERFACE
// =============================================================================

/**
 * Generic tool interface.
 *
 * @typeParam TInput - Type of the validated input
 * @typeParam TOutput - Type of the execution output
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** Tool definition for LLM */
  readonly definition: UniversalToolDefinition;

  /** Zod schema for input validation */
  readonly inputSchema: z.ZodType<TInput>;

  /** Zod schema for output validation */
  readonly outputSchema: z.ZodType<TOutput>;

  /** Whether this tool requires user confirmation before execution */
  readonly requiresConfirmation: boolean;

  /**
   * Execute the tool with validated input.
   *
   * @param _input - Validated input parameters
   * @param _context - Execution context with workspace info and utilities
   * @returns Promise resolving to the tool output
   * @throws {ToolExecutionError} If execution fails
   */
  execute(_input: TInput, _context: ToolContext): Promise<TOutput>;
}

// =============================================================================
// TOOL REGISTRY
// =============================================================================

/**
 * Registry entry for a tool.
 */
export interface ToolRegistryEntry {
  tool: Tool;
  enabled: boolean;
}

/**
 * Tool category for organization.
 */
export const ToolCategorySchema = z.enum([
  'filesystem',
  'search',
  'terminal',
  'git',
  'mcp',
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

// =============================================================================
// TOOL ERRORS
// =============================================================================

/**
 * Custom error class for tool execution failures.
 */
export class ToolExecutionError extends Error {
  readonly toolName: string;
  override readonly cause: Error | undefined;

  constructor(toolName: string, message: string, cause?: Error) {
    super(`Tool '${toolName}' failed: ${message}`);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
    this.cause = cause;
  }
}

/**
 * Custom error class for tool validation failures.
 */
export class ToolValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly validationErrors: z.ZodError
  ) {
    super(`Tool '${toolName}' input validation failed: ${validationErrors.message}`);
    this.name = 'ToolValidationError';
  }
}
