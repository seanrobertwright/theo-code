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
   * @param message - Description of the action requiring confirmation
   * @param details - Optional additional details (e.g., diff preview)
   * @returns Promise resolving to true if confirmed, false if rejected
   */
  confirm: (message: string, details?: string) => Promise<boolean>;

  /**
   * Report progress during long-running operations.
   *
   * @param message - Progress message to display
   */
  onProgress?: (message: string) => void;

  /**
   * Log debug information during tool execution.
   *
   * @param message - Debug message
   * @param data - Optional structured data
   */
  debug?: (message: string, data?: unknown) => void;
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
  readonly inputSchema: z.ZodType<TInput, any, any>;

  /** Zod schema for output validation */
  readonly outputSchema: z.ZodType<TOutput, any, any>;

  /** Whether this tool requires user confirmation before execution */
  readonly requiresConfirmation: boolean;

  /** Tool category for organization and filtering */
  readonly category: ToolCategory;

  /**
   * Execute the tool with validated input.
   *
   * @param input - Validated input parameters
   * @param context - Execution context with workspace info and utilities
   * @returns Promise resolving to the tool output
   * @throws {ToolExecutionError} If execution fails
   */
  execute(input: TInput, context: ToolContext): Promise<TOutput>;

  /**
   * Validate tool can be executed in current context.
   *
   * @param context - Execution context
   * @returns Promise resolving to validation result
   */
  validate?(context: ToolContext): Promise<ToolValidationResult>;
}

// =============================================================================
// TOOL REGISTRY
// =============================================================================

/**
 * Registry entry for a tool.
 */
export interface ToolRegistryEntry {
  /** Tool instance */
  tool: Tool;
  /** Whether tool is currently enabled */
  enabled: boolean;
  /** Registration metadata */
  metadata: {
    registeredAt: Date;
    version: string;
  };
}

/**
 * Tool validation result.
 */
export const ToolValidationResultSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  warnings: z.array(z.string()).default([]),
});
export type ToolValidationResult = z.infer<typeof ToolValidationResultSchema>;

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
