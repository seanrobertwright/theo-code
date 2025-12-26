/**
 * @fileoverview Tests for AST-Grep tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAstGrepTool, createAstGrepRewriteTool } from '../index.js';
import type { ToolContext } from '../../../../shared/types/tools.js';

// Mock execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}));

describe('AST-Grep Tools', () => {
  let mockContext: ToolContext;
  
  beforeEach(() => {
    mockContext = {
      workspaceRoot: '/test/workspace',
      sessionId: 'test-session',
      userId: 'test-user'
    };
    vi.clearAllMocks();
  });

  describe('ast_grep tool', () => {
    it('should have correct definition', () => {
      const tool = createAstGrepTool();
      
      expect(tool.definition.name).toBe('ast_grep');
      expect(tool.definition.description).toContain('AST pattern');
      expect(tool.definition.parameters.required).toEqual(['pattern', 'language']);
    });

    it('should execute search successfully', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any).mockReturnValue('{"file": "test.ts", "line": 1}\n');

      const tool = createAstGrepTool();
      const result = await tool.execute({
        pattern: 'function $NAME() {}',
        language: 'typescript'
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('matches');
    });

    it('should handle execution errors', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any).mockImplementation(() => {
        throw new Error('ast-grep not found');
      });

      const tool = createAstGrepTool();
      const result = await tool.execute({
        pattern: 'function $NAME() {}',
        language: 'typescript'
      }, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ast-grep not found');
    });
  });

  describe('ast_grep_rewrite tool', () => {
    it('should have correct definition', () => {
      const tool = createAstGrepRewriteTool();
      
      expect(tool.definition.name).toBe('ast_grep_rewrite');
      expect(tool.definition.description).toContain('Rewrite code');
      expect(tool.definition.parameters.required).toEqual(['pattern', 'rewrite', 'language']);
    });

    it('should execute rewrite in dry-run mode by default', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any).mockReturnValue('Would change 2 files');

      const tool = createAstGrepRewriteTool();
      const result = await tool.execute({
        pattern: 'function $NAME() {}',
        rewrite: 'const $NAME = () => {}',
        language: 'typescript'
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.dryRun).toBe(true);
    });
  });
});
