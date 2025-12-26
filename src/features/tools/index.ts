/**
 * @fileoverview Tools feature public API
 * @module features/tools
 */

export { ToolRegistry } from './framework.js';
export { createFileSystemTools } from './filesystem/index.js';
export { ConfirmationService } from './confirmation.js';
export { createAstGrepTool, createAstGrepRewriteTool } from './ast-grep/index.js';
export { createLSPTools } from './lsp/index.js';
export { createGitTools } from './git/index.js';
export type {
  Tool,
  ToolContext,
  ToolExecutionResult,
  ToolRegistryEntry,
} from '../../shared/types/tools.js';
