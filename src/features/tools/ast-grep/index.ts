/**
 * @fileoverview AST-Grep tool for semantic code analysis
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { z } from 'zod';
import type { Tool } from '../../../shared/types/tools.js';
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
          description: 'AST pattern to search (e.g., "function $NAME($ARGS) { $$ }")'
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
  inputSchema: z.object({
    pattern: z.string(),
    language: z.enum(['typescript', 'javascript', 'python', 'rust', 'go']),
    files: z.array(z.string()).optional(),
    rewrite: z.string().optional()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.object({
      matches: z.array(z.any()),
      total: z.number(),
      pattern: z.string(),
      language: z.string(),
      rewrite: z.boolean()
    }).optional(),
    error: z.string().optional()
  }),
  _requiresConfirmation: false,
  category: 'search',

  async execute(_params: unknown, context) {
    const typedParams = params as { pattern: string; language: string; files?: string[]; rewrite?: string };
    const { pattern, language, files = [], rewrite } = typedParams;
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
        files.forEach((_file: string) => cmd.push(file));
      } else {
        cmd.push('.');
      }

      logger.debug('Executing ast-grep', { cmd: cmd.join(' ') });

      const result = execSync(cmd.join(' '), {
        _cwd: workspaceRoot,
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
        _success: true,
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
        _success: false,
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
        language: { 
          type: 'string', 
          enum: ['typescript', 'javascript', 'python', 'rust', 'go'],
          description: 'Programming language'
        },
        files: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'File patterns to process'
        },
        dryRun: { 
          type: 'boolean', 
          _default: true, 
          description: 'Preview changes without applying' 
        }
      },
      required: ['pattern', 'rewrite', 'language']
    }
  },
  inputSchema: z.object({
    pattern: z.string(),
    rewrite: z.string(),
    language: z.enum(['typescript', 'javascript', 'python', 'rust', 'go']),
    files: z.array(z.string()).optional(),
    dryRun: z.boolean().optional()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.object({
      changes: z.string(),
      dryRun: z.boolean(),
      pattern: z.string(),
      rewrite: z.string()
    }).optional(),
    error: z.string().optional()
  }),
  _requiresConfirmation: true,
  category: 'search',

  async execute(_params: unknown, context) {
    const typedParams = params as { pattern: string; rewrite: string; language: string; files?: string[]; dryRun?: boolean };
    const { pattern, rewrite, language, files = [], dryRun = true } = typedParams;

    try {
      const cmd = ['ast-grep', 'run'];
      cmd.push('--pattern', pattern);
      cmd.push('--rewrite', rewrite);
      cmd.push('--lang', language);
      
      if (dryRun) {
        cmd.push('--dry-run');
      }

      if (files.length > 0) {
        files.forEach((_file: string) => cmd.push(file));
      }

      const result = execSync(cmd.join(' '), {
        cwd: context.workspaceRoot,
        encoding: 'utf8'
      });

      return {
        _success: true,
        data: {
          _changes: result,
          dryRun,
          pattern,
          rewrite
        }
      };

    } catch (error) {
      return {
        _success: false,
        error: `Rewrite failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});