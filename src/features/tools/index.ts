/**
 * @fileoverview Tools feature public API
 * @module features/tools
 */

export { ToolRegistry } from './framework.js';
export { createFileSystemTools } from './filesystem/index.js';
export { ConfirmationService } from './confirmation.js';
export type {
  Tool,
  ToolContext,
  ToolExecutionResult,
  ToolRegistryEntry,
} from '../../shared/types/tools.js';
