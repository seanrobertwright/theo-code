/**
 * @fileoverview Git integration with AI-powered semantic commits
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import type { Tool } from '../../../shared/types/tools.js';
import { logger } from '../../../shared/utils/index.js';

interface GitChange {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  diff: string;
}

interface CommitAnalysis {
  type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore';
  scope?: string;
  description: string;
  body?: string;
  breaking?: boolean;
}

class GitAnalyzer {
  private analyzeChangeType(changes: GitChange[]): CommitAnalysis['type'] {
    const hasNewFiles = changes.some(c => c.status === 'added');
    const hasTests = changes.some(c => c.file.includes('test') || c.file.includes('spec'));
    const hasDocumentation = changes.some(c => c.file.endsWith('.md') || c.file.includes('doc'));
    const hasBugFix = changes.some(c => 
      c.diff.toLowerCase().includes('fix') || 
      c.diff.toLowerCase().includes('bug') ||
      c.diff.toLowerCase().includes('error')
    );

    if (hasBugFix) return 'fix';
    if (hasNewFiles && !hasTests) return 'feat';
    if (hasTests) return 'test';
    if (hasDocumentation) return 'docs';
    
    return 'refactor';
  }

  private extractScope(changes: GitChange[]): string | undefined {
    const directories = changes
      .map(c => path.dirname(c.file))
      .filter(dir => dir !== '.')
      .map(dir => dir.split('/')[0]);

    const commonDir = directories.reduce((acc, dir) => {
      acc[dir] = (acc[dir] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommon = Object.entries(commonDir)
      .sort(([,a], [,b]) => b - a)[0];

    return mostCommon && mostCommon[1] > 1 ? mostCommon[0] : undefined;
  }

  private generateDescription(changes: GitChange[]): string {
    const totalFiles = changes.length;
    const addedFiles = changes.filter(c => c.status === 'added').length;
    const modifiedFiles = changes.filter(c => c.status === 'modified').length;
    const deletedFiles = changes.filter(c => c.status === 'deleted').length;

    if (addedFiles > 0 && modifiedFiles === 0) {
      return `add ${addedFiles === 1 ? changes[0].file : `${addedFiles} new files`}`;
    }

    if (modifiedFiles > 0 && addedFiles === 0 && deletedFiles === 0) {
      return `update ${modifiedFiles === 1 ? path.basename(changes[0].file) : `${modifiedFiles} files`}`;
    }

    if (deletedFiles > 0 && addedFiles === 0 && modifiedFiles === 0) {
      return `remove ${deletedFiles === 1 ? path.basename(changes[0].file) : `${deletedFiles} files`}`;
    }

    return `modify ${totalFiles} files`;
  }

  analyzeCommit(changes: GitChange[]): CommitAnalysis {
    const type = this.analyzeChangeType(changes);
    const scope = this.extractScope(changes);
    const description = this.generateDescription(changes);
    
    const hasBreaking = changes.some(c => 
      c.diff.includes('BREAKING CHANGE') || 
      c.diff.includes('breaking:')
    );

    return {
      type,
      scope,
      description,
      breaking: hasBreaking
    };
  }

  formatCommitMessage(analysis: CommitAnalysis): string {
    let message = analysis.type;
    
    if (analysis.scope) {
      message += `(${analysis.scope})`;
    }
    
    if (analysis.breaking) {
      message += '!';
    }
    
    message += `: ${analysis.description}`;
    
    if (analysis.body) {
      message += `\n\n${analysis.body}`;
    }
    
    if (analysis.breaking) {
      message += '\n\nBREAKING CHANGE: ';
    }
    
    return message;
  }
}

const gitAnalyzer = new GitAnalyzer();

export const createGitTools = (): Tool[] => [
  {
    definition: {
      name: 'git_status',
      description: 'Get current git repository status',
      parameters: {
        type: 'object',
        properties: {
          porcelain: { type: 'boolean', default: true }
        }
      }
    },

    async execute(params, context) {
      try {
        const cmd = params.porcelain ? 'git status --porcelain' : 'git status';
        const result = execSync(cmd, {
          cwd: context.workspaceRoot,
          encoding: 'utf8'
        });

        return {
          success: true,
          data: {
            status: result.trim(),
            hasChanges: result.trim().length > 0
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Git status failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  },

  {
    definition: {
      name: 'git_diff',
      description: 'Get git diff with change analysis',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', default: false },
          files: { type: 'array', items: { type: 'string' } },
          generateCommit: { type: 'boolean', default: false }
        }
      }
    },

    async execute(params, context) {
      try {
        const { staged, files = [], generateCommit } = params;
        
        let cmd = 'git diff --numstat';
        if (staged) cmd += ' --cached';
        if (files.length > 0) cmd += ` -- ${files.join(' ')}`;

        const numstat = execSync(cmd, {
          cwd: context.workspaceRoot,
          encoding: 'utf8'
        });

        const changes: GitChange[] = numstat
          .trim()
          .split('\n')
          .filter(line => line)
          .map(line => {
            const [additions, deletions, file] = line.split('\t');
            
            // Get detailed diff for this file
            const diffCmd = `git diff ${staged ? '--cached' : ''} -- "${file}"`;
            const diff = execSync(diffCmd, {
              cwd: context.workspaceRoot,
              encoding: 'utf8'
            });

            // Determine status
            let status: GitChange['status'] = 'modified';
            if (additions !== '0' && deletions === '0') status = 'added';
            else if (additions === '0' && deletions !== '0') status = 'deleted';

            return {
              file,
              status,
              additions: parseInt(additions) || 0,
              deletions: parseInt(deletions) || 0,
              diff
            };
          });

        let commitSuggestion;
        if (generateCommit && changes.length > 0) {
          const analysis = gitAnalyzer.analyzeCommit(changes);
          commitSuggestion = {
            analysis,
            message: gitAnalyzer.formatCommitMessage(analysis)
          };
        }

        return {
          success: true,
          data: {
            changes,
            totalFiles: changes.length,
            totalAdditions: changes.reduce((sum, c) => sum + c.additions, 0),
            totalDeletions: changes.reduce((sum, c) => sum + c.deletions, 0),
            commitSuggestion
          }
        };

      } catch (error) {
        return {
          success: false,
          error: `Git diff failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  },

  {
    definition: {
      name: 'git_commit',
      description: 'Create a git commit with AI-generated message',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Custom commit message' },
          autoGenerate: { type: 'boolean', default: true },
          addAll: { type: 'boolean', default: false },
          files: { type: 'array', items: { type: 'string' } }
        }
      }
    },

    async execute(params, context) {
      try {
        const { message, autoGenerate, addAll, files = [] } = params;

        // Add files if specified
        if (addAll) {
          execSync('git add .', { cwd: context.workspaceRoot });
        } else if (files.length > 0) {
          execSync(`git add ${files.join(' ')}`, { cwd: context.workspaceRoot });
        }

        let commitMessage = message;

        // Generate message if not provided
        if (!commitMessage && autoGenerate) {
          const diffResult = execSync('git diff --cached --numstat', {
            cwd: context.workspaceRoot,
            encoding: 'utf8'
          });

          if (!diffResult.trim()) {
            return {
              success: false,
              error: 'No staged changes to commit'
            };
          }

          // Parse changes and generate commit message
          const changes: GitChange[] = diffResult
            .trim()
            .split('\n')
            .map(line => {
              const [additions, deletions, file] = line.split('\t');
              return {
                file,
                status: 'modified' as const,
                additions: parseInt(additions) || 0,
                deletions: parseInt(deletions) || 0,
                diff: ''
              };
            });

          const analysis = gitAnalyzer.analyzeCommit(changes);
          commitMessage = gitAnalyzer.formatCommitMessage(analysis);
        }

        if (!commitMessage) {
          return {
            success: false,
            error: 'No commit message provided'
          };
        }

        // Create commit
        const result = execSync(`git commit -m "${commitMessage}"`, {
          cwd: context.workspaceRoot,
          encoding: 'utf8'
        });

        return {
          success: true,
          data: {
            message: commitMessage,
            output: result.trim(),
            generated: !message && autoGenerate
          }
        };

      } catch (error) {
        return {
          success: false,
          error: `Git commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  },

  {
    definition: {
      name: 'git_log',
      description: 'Get git commit history with analysis',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10 },
          oneline: { type: 'boolean', default: false },
          since: { type: 'string', description: 'Date filter (e.g., "1 week ago")' }
        }
      }
    },

    async execute(params, context) {
      try {
        const { limit, oneline, since } = params;
        
        let cmd = 'git log --pretty=format:"%H|%an|%ad|%s"';
        if (limit) cmd += ` -${limit}`;
        if (since) cmd += ` --since="${since}"`;

        const result = execSync(cmd, {
          cwd: context.workspaceRoot,
          encoding: 'utf8'
        });

        const commits = result
          .trim()
          .split('\n')
          .filter(line => line)
          .map(line => {
            const [hash, author, date, subject] = line.split('|');
            return { hash, author, date, subject };
          });

        return {
          success: true,
          data: {
            commits,
            total: commits.length
          }
        };

      } catch (error) {
        return {
          success: false,
          error: `Git log failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  }
];
