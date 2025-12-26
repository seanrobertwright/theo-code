/**
 * @fileoverview AST-Grep tool for semantic code analysis
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import type { Tool } from '../../../shared/types/tools.js';
import { logger } from '../../../shared/utils/index.js';

interface AstGrepMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  context: string[];
}

export const createAstGrepTool = (): Tool => ({
  definition: {
    name: 'ast_grep',
    description: 'Search code using Abstract Syntax Tree patterns for semantic analysis',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'AST pattern to search (e.g., "function $NAME($ARGS) { $$$ }")'
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'rust', 'go'],
          description: 'Programming language'
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File patterns to search (optional)'
        },
        rewrite: {
          type: 'string',
          description: 'Replacement pattern for code transformation (optional)'
        }
      },
      required: ['pattern', 'language']
    }
  },

  async execute(params, context) {
    const { pattern, language, files = [], rewrite } = params;
    const workspaceRoot = context.workspaceRoot;

    try {
      // Build ast-grep command
      const cmd = ['ast-grep', 'search'];
      cmd.push('--pattern', pattern);
      cmd.push('--lang', language);
      cmd.push('--json');

      if (rewrite) {
        cmd.push('--rewrite', rewrite);
      }

      if (files.length > 0) {
        files.forEach(file => cmd.push(file));
      } else {
        cmd.push('.');
      }

      logger.debug('Executing ast-grep', { cmd: cmd.join(' ') });

      const result = execSync(cmd.join(' '), {
        cwd: workspaceRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10 // 10MB
      });

      const matches: AstGrepMatch[] = result
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      return {
        success: true,
        data: {
          matches,
          total: matches.length,
          pattern,
          language,
          rewrite: !!rewrite
        }
      };

    } catch (error) {
      logger.error('AST-Grep execution failed', error);
      return {
        success: false,
        error: `AST-Grep failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});

export const createAstGrepRewriteTool = (): Tool => ({
  definition: {
    name: 'ast_grep_rewrite',
    description: 'Rewrite code using AST patterns for refactoring',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'AST pattern to match' },
        rewrite: { type: 'string', description: 'Replacement pattern' },
        language: { type: 'string', enum: ['typescript', 'javascript', 'python', 'rust', 'go'] },
        files: { type: 'array', items: { type: 'string' } },
        dryRun: { type: 'boolean', default: true, description: 'Preview changes without applying' }
      },
      required: ['pattern', 'rewrite', 'language']
    }
  },

  async execute(params, context) {
    const { pattern, rewrite, language, files = [], dryRun = true } = params;

    try {
      const cmd = ['ast-grep', 'run'];
      cmd.push('--pattern', pattern);
      cmd.push('--rewrite', rewrite);
      cmd.push('--lang', language);
      
      if (dryRun) {
        cmd.push('--dry-run');
      }

      if (files.length > 0) {
        files.forEach(file => cmd.push(file));
      }

      const result = execSync(cmd.join(' '), {
        cwd: context.workspaceRoot,
        encoding: 'utf8'
      });

      return {
        success: true,
        data: {
          changes: result,
          dryRun,
          pattern,
          rewrite
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Rewrite failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});
