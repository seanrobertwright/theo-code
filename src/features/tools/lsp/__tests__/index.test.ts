/**
 * @fileoverview Tests for LSP tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLSPTools } from '../index.js';
import type { ToolContext } from '../../../../shared/types/tools.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}));

describe('LSP Tools', () => {
  let mockContext: ToolContext;
  let tools: ReturnType<typeof createLSPTools>;
  
  beforeEach(() => {
    mockContext = {
      workspaceRoot: '/test/workspace',
      sessionId: 'test-session',
      userId: 'test-user'
    };
    tools = createLSPTools();
    vi.clearAllMocks();
  });

  describe('lsp_start tool', () => {
    it('should have correct definition', () => {
      const startTool = tools.find(t => t.definition.name === 'lsp_start');
      
      expect(startTool).toBeDefined();
      expect(startTool!.definition.description).toContain('Language Server Protocol');
      expect(startTool!.definition.parameters.required).toEqual(['language']);
    });

    it('should start LSP server successfully', async () => {
      const { spawn } = await import('node:child_process');
      const mockProcess = {
        pid: 1234,
        stdin: { write: vi.fn() },
        stdout: { once: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('Content-Length: 20\r\n\r\n{"result": "ok"}')), 10);
          }
        }) },
        kill: vi.fn()
      };
      (spawn as any).mockReturnValue(mockProcess);

      const startTool = tools.find(t => t.definition.name === 'lsp_start')!;
      const result = await startTool.execute({
        language: 'typescript'
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.language).toBe('typescript');
    });
  });

  describe('lsp_definition tool', () => {
    it('should have correct definition', () => {
      const defTool = tools.find(t => t.definition.name === 'lsp_definition');
      
      expect(defTool).toBeDefined();
      expect(defTool!.definition.description).toContain('symbol definition');
      expect(defTool!.definition.parameters.required).toEqual(['language', 'file', 'line', 'character']);
    });
  });

  describe('lsp_hover tool', () => {
    it('should have correct definition', () => {
      const hoverTool = tools.find(t => t.definition.name === 'lsp_hover');
      
      expect(hoverTool).toBeDefined();
      expect(hoverTool!.definition.description).toContain('hover information');
    });
  });

  describe('lsp_references tool', () => {
    it('should have correct definition', () => {
      const refTool = tools.find(t => t.definition.name === 'lsp_references');
      
      expect(refTool).toBeDefined();
      expect(refTool!.definition.description).toContain('references');
    });
  });
});
