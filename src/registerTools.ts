/**
 * @fileoverview Tool registration helper
 */

import { toolRegistry } from './features/tools/framework.js';
import { 
  createFileSystemTools,
  createAstGrepTool,
  createAstGrepRewriteTool,
  createLSPTools,
  createGitTools
} from './features/tools/index.js';

export function registerAllTools(): void {
  // Filesystem tools
  const fileSystemTools = createFileSystemTools();
  for (const tool of fileSystemTools) {
    toolRegistry.register(tool);
  }

  // AST-Grep tools
  toolRegistry.register(createAstGrepTool());
  toolRegistry.register(createAstGrepRewriteTool());

  // LSP tools
  const lspTools = createLSPTools();
  for (const tool of lspTools) {
    toolRegistry.register(tool);
  }

  // Git tools
  const gitTools = createGitTools();
  for (const tool of gitTools) {
    toolRegistry.register(tool);
  }
}
