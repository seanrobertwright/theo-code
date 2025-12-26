/**
 * @fileoverview Tests for Git tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitTools } from '../index.js';
import type { ToolContext } from '../../../../shared/types/tools.js';

// Mock execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}));

describe('Git Tools', () => {
  let mockContext: ToolContext;
  let tools: ReturnType<typeof createGitTools>;
  
  beforeEach(() => {
    mockContext = {
      workspaceRoot: '/test/workspace',
      sessionId: 'test-session',
      userId: 'test-user'
    };
    tools = createGitTools();
    vi.clearAllMocks();
  });

  describe('git_status tool', () => {
    it('should have correct definition', () => {
      const statusTool = tools.find(t => t.definition.name === 'git_status');
      
      expect(statusTool).toBeDefined();
      expect(statusTool!.definition.description).toContain('git repository status');
    });

    it('should execute git status successfully', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any).mockReturnValue(' M src/file.ts\n A src/new.ts\n');

      const statusTool = tools.find(t => t.definition.name === 'git_status')!;
      const result = await statusTool.execute({}, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.hasChanges).toBe(true);
    });
  });

  describe('git_diff tool', () => {
    it('should have correct definition', () => {
      const diffTool = tools.find(t => t.definition.name === 'git_diff');
      
      expect(diffTool).toBeDefined();
      expect(diffTool!.definition.description).toContain('git diff');
    });

    it('should analyze changes and generate commit suggestion', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any)
        .mockReturnValueOnce('5\t2\tsrc/feature.ts\n')  // numstat
        .mockReturnValueOnce('+function newFeature() {\n+  return true;\n+}');  // diff

      const diffTool = tools.find(t => t.definition.name === 'git_diff')!;
      const result = await diffTool.execute({
        generateCommit: true
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.changes).toHaveLength(1);
      expect(result.data?.commitSuggestion).toBeDefined();
      expect(result.data?.commitSuggestion?.message).toContain('feat');
    });
  });

  describe('git_commit tool', () => {
    it('should have correct definition', () => {
      const commitTool = tools.find(t => t.definition.name === 'git_commit');
      
      expect(commitTool).toBeDefined();
      expect(commitTool!.definition.description).toContain('git commit');
    });

    it('should create commit with custom message', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any).mockReturnValue('[main abc123] feat: add new feature\n 1 file changed, 5 insertions(+)');

      const commitTool = tools.find(t => t.definition.name === 'git_commit')!;
      const result = await commitTool.execute({
        message: 'feat: add new feature'
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.message).toBe('feat: add new feature');
      expect(result.data?.generated).toBe(false);
    });

    it('should auto-generate commit message', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any)
        .mockReturnValueOnce('3\t1\tsrc/component.ts\n')  // diff --cached --numstat
        .mockReturnValueOnce('[main def456] refactor: update component.ts\n 1 file changed, 3 insertions(+), 1 deletion(-)');  // commit

      const commitTool = tools.find(t => t.definition.name === 'git_commit')!;
      const result = await commitTool.execute({
        autoGenerate: true
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.generated).toBe(true);
      expect(result.data?.message).toContain('refactor');
    });
  });

  describe('git_log tool', () => {
    it('should have correct definition', () => {
      const logTool = tools.find(t => t.definition.name === 'git_log');
      
      expect(logTool).toBeDefined();
      expect(logTool!.definition.description).toContain('git commit history');
    });

    it('should retrieve commit history', async () => {
      const { execSync } = await import('node:child_process');
      (execSync as any).mockReturnValue('abc123|John Doe|Mon Dec 25 10:00:00 2023|feat: add new feature\ndef456|Jane Smith|Sun Dec 24 15:30:00 2023|fix: resolve bug');

      const logTool = tools.find(t => t.definition.name === 'git_log')!;
      const result = await logTool.execute({
        limit: 2
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.commits).toHaveLength(2);
      expect(result.data?.commits[0].hash).toBe('abc123');
      expect(result.data?.commits[0].subject).toBe('feat: add new feature');
    });
  });
});
