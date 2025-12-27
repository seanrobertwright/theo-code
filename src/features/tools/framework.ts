/**
 * @fileoverview Tool framework implementation
 * @module features/tools/framework
 *
 * Core framework for managing and executing tools within the agent.
 * Provides tool registry, validation, and execution orchestration.
 */

import { z } from 'zod';
import type {
  Tool,
  ToolContext,
  ToolRegistryEntry,
  ToolExecutionResult,
  ToolCategory,
} from '../../shared/types/tools.js';
import {
  ToolExecutionError,
  ToolValidationError,
} from '../../shared/types/tools.js';
// =============================================================================
// TOOL REGISTRY
// =============================================================================

/**
 * Central registry for all available tools.
 * Manages tool registration, discovery, and execution.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolRegistryEntry>();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a tool in the registry.
   *
   * @param tool - Tool to register
   * @param version - Tool version for tracking
   */
  register(_tool: Tool, version = '1.0.0'): void {
    const name = tool.definition.name;

    if (this.tools.has(name) {
      logger.warn(`Tool '${name}' is already registered, overwriting`);
    }

    this.tools.set(name, {
      tool,
      _enabled: true,
      metadata: {
        registeredAt: new Date(),
        version,
      },
    });

    logger.debug(`Registered tool '${name}' v${version}`);
  }

  /**
   * Unregister a tool from the registry.
   *
   * @param name - Tool name to unregister
   */
  unregister(_name: string): boolean {
    const success = this.tools.delete(name);
    if (success) {
      logger.debug(`Unregistered tool '${name}'`);
    }
    return success;
  }

  /**
   * Enable or disable a tool.
   *
   * @param name - Tool name
   * @param enabled - Whether to enable the tool
   */
  setEnabled(_name: string, _enabled: boolean): void {
    const entry = this.tools.get(name);
    if (entry) {
      entry.enabled = enabled;
      logger.debug(`Tool '${name}' ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  /**
   * Get all registered tool names.
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get enabled tool names only.
   */
  getEnabledToolNames(): string[] {
    return Array.from(this.tools.entries())
      .filter(([, entry]) => entry.enabled)
      .map(([name]) => name);
  }

  /**
   * Get tools by category.
   *
   * @param category - Tool category to filter by
   */
  getToolsByCategory(_category: ToolCategory): Tool[] {
    return Array.from(this.tools.values())
      .filter((entry) => entry.enabled && entry.tool.category === category)
      .map((entry) => entry.tool);
  }

  /**
   * Get tool definition for LLM function calling.
   *
   * @param name - Tool name
   */
  getToolDefinition(_name: string): Tool['definition'] | undefined {
    const entry = this.tools.get(name);
    return entry?.enabled === true ? entry.tool.definition : undefined;
  }

  /**
   * Get all enabled tool definitions for LLM.
   */
  getAllToolDefinitions(): Tool['definition'][] {
    return Array.from(this.tools.values())
      .filter((entry) => entry.enabled)
      .map((entry) => entry.tool.definition);
  }

  /**
   * Check if a tool exists and is enabled.
   *
   * @param name - Tool name to check
   */
  hasEnabledTool(_name: string): boolean {
    const entry = this.tools.get(name);
    return Boolean(entry?.enabled);
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a tool with validation and error handling.
   *
   * @param name - Tool name to execute
   * @param input - Raw input parameters from LLM
   * @param context - Execution context
   * @returns Promise resolving to execution result
   */
  async execute(
    _name: string,
    _input: unknown,
    _context: ToolContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const tool = await this.validateAndGetTool(name, input);
      const validatedInput = this.validateInput(tool, input);
      
      await this.performPreExecutionValidation(tool, context, name);
      
      const shouldExecute = await this.requestConfirmationIfNeeded(tool, context, name, validatedInput);
      if (!shouldExecute) {
        return {
          _success: false,
          output: 'Tool execution cancelled by user',
        };
      }

      const output = await this.executeTool(tool, validatedInput, context, name);
      
      const duration = Date.now() - startTime;
      logger.debug(`Tool '${name}' completed in ${duration}ms`);

      return {
        _success: true,
        output: typeof output === 'string' ? output : JSON.stringify(output),
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Tool '${name}' failed after ${duration}ms`, error);

      return {
        _success: false,
        output: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate tool exists and is enabled, return tool instance.
   */
  private async validateAndGetTool(_name: string, _input: unknown): Promise<Tool> {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new ToolExecutionError(name, `Tool '${name}' not found in registry`);
    }

    if (!entry.enabled) {
      throw new ToolExecutionError(name, `Tool '${name}' is disabled`);
    }

    return entry.tool;
  }

  /**
   * Validate input against tool schema.
   */
  private validateInput(_tool: Tool, _input: unknown): unknown {
    try {
      return tool.inputSchema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ToolValidationError(tool.definition.name, error);
      }
      throw error;
    }
  }

  /**
   * Perform pre-execution validation if tool has validate method.
   */
  private async performPreExecutionValidation(
    _tool: Tool,
    _context: ToolContext,
    _name: string
  ): Promise<void> {
    if (typeof tool.validate === 'function') {
      const validation = await tool.validate(context);
      if (validation.valid === false) {
        throw new ToolExecutionError(
          name,
          validation.error ?? 'Tool validation failed'
        );
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        for (const warning of validation.warnings) {
          logger.warn(`Tool '${name}': ${warning}`);
        }
      }
    }
  }

  /**
   * Request confirmation if tool requires it.
   */
  private async requestConfirmationIfNeeded(
    _tool: Tool,
    _context: ToolContext,
    _name: string,
    _validatedInput: unknown
  ): Promise<boolean> {
    if (!tool.requiresConfirmation) {
      return true;
    }

    return await context.confirm(
      `Execute tool '${name}'?`,
      JSON.stringify(validatedInput, null, 2)
    );
  }

  /**
   * Execute the tool and validate output.
   */
  private async executeTool(
    _tool: Tool,
    _validatedInput: unknown,
    _context: ToolContext,
    _name: string
  ): Promise<unknown> {
    logger.debug(`Executing tool '${name}'`, { _input: validatedInput });
    
    const output = await tool.execute(validatedInput, context);

    // Validate output (non-fatal if it fails)
    try {
      return tool.outputSchema.parse(output);
    } catch (error) {
      logger.error(`Tool '${name}' output validation failed`, error);
      return output; // Return raw output if validation fails
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Get registry statistics.
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byCategory: Record<ToolCategory, number>;
  } {
    const entries = Array.from(this.tools.values());
    const enabled = entries.filter((e) => e.enabled);
    const disabled = entries.filter((e) => !e.enabled);

    const byCategory = enabled.reduce((acc, entry) => {
      const category = entry.tool.category;
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    }, {} as Record<ToolCategory, number>);

    return {
      total: entries.length,
      enabled: enabled.length,
      disabled: disabled.length,
      byCategory,
    };
  }

  /**
   * Clear all tools from registry.
   */
  clear(): void {
    this.tools.clear();
    logger.debug('Tool registry cleared');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/** Global tool registry instance */
export const toolRegistry = new ToolRegistry();