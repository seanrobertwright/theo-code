/**
 * @fileoverview Filesystem tools implementation
 * @module features/tools/filesystem
 *
 * Provides safe file system operations for the agent:
 * - read_file: Read file contents with optional line ranges
 * - write_file: Write content to files with confirmation
 * - list_files: List directory contents with filtering
 * - grep_search: Search for patterns in files
 */

import { z } from 'zod';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { glob } from 'glob';
import type { Tool, ToolContext } from '../../../shared/types/tools.js';
import { ToolExecutionError } from '../../../shared/types/tools.js';
const DEFAULT_ENCODING = 'utf-8';
const PATH_DESCRIPTION = 'File path relative to workspace';

// =============================================================================
// READ FILE TOOL
// =============================================================================

const ReadFileInputSchema = z.object({
  path: z.string().describe(PATH_DESCRIPTION),
  lineStart: z.number().int().positive().optional().describe('Starting line (1-indexed)'),
  lineEnd: z.number().int().positive().optional().describe('Ending line (inclusive)'),
});

const ReadFileOutputSchema = z.object({
  content: z.string(),
  path: z.string(),
  size: z.number(),
  lines: z.number(),
  encoding: z.string(),
});

type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
type ReadFileOutput = z.infer<typeof ReadFileOutputSchema>;

export const readFileTool: Tool<ReadFileInput, ReadFileOutput> = {
  definition: {
    name: 'read_file',
    description: 'Read contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          _description: PATH_DESCRIPTION,
        },
        lineStart: {
          type: 'number',
          description: 'Starting line number (1-indexed, optional)',
        },
        lineEnd: {
          type: 'number',
          description: 'Ending line number (inclusive, optional)',
        },
      },
      required: ['path'],
    },
  },
  _inputSchema: ReadFileInputSchema,
  _outputSchema: ReadFileOutputSchema,
  _requiresConfirmation: false,
  category: 'filesystem',

  async validate(context: ToolContext) {
    // Basic workspace validation
    if (!isDirectory(context.workspaceRoot)) {
      return {
        valid: false,
        error: `Workspace root does not exist: ${context.workspaceRoot}`,
        warnings: [],
      };
    }

    return { valid: true, warnings: [] };
  },

  async execute(input: ReadFileInput, _context: ToolContext): Promise<ReadFileOutput> {
    const absolutePath = resolve(context.workspaceRoot, input.path);
    
    // Security: Ensure path is within workspace
    const relativePath = relative(context.workspaceRoot, absolutePath);
    if (relativePath.startsWith('..')) {
      throw new ToolExecutionError(
        'read_file',
        `Path outside workspace not allowed: ${input.path}`
      );
    }

    // Check file exists and is readable
    if (!isFile(absolutePath)) {
      throw new ToolExecutionError(
        'read_file',
        `File not found or not readable: ${input.path}`
      );
    }

    // Check for binary files
    if (isBinaryFile(absolutePath)) {
      throw new ToolExecutionError(
        'read_file',
        `Cannot read binary file: ${input.path}`
      );
    }

    try {
      const stats = await stat(absolutePath);
      const content = await readFile(absolutePath, DEFAULT_ENCODING);
      const lines = content.split('\n');

      let finalContent = content;
      
      // Apply line range if specified
      if (input.lineStart !== undefined || input.lineEnd !== undefined) {
        const start = Math.max(1, input.lineStart ?? 1) - 1; // Convert to 0-indexed
        const end = Math.min(lines.length, input.lineEnd ?? lines.length);
        
        if (start >= lines.length) {
          throw new ToolExecutionError(
            'read_file',
            `Line start ${input.lineStart} exceeds file length (${lines.length} lines)`
          );
        }

        finalContent = lines.slice(start, end).join('\n');
      }

      return {
        content: finalContent,
        path: input.path,
        size: stats.size,
        lines: lines.length,
        encoding: DEFAULT_ENCODING,
      };

    } catch (error) {
      throw new ToolExecutionError(
        'read_file',
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

// =============================================================================
// WRITE FILE TOOL
// =============================================================================

const WriteFileInputSchema = z.object({
  path: z.string().describe(PATH_DESCRIPTION),
  content: z.string().describe('Content to write to file'),
  createDirs: z.boolean().default(true).describe('Create parent directories if needed'),
});

const WriteFileOutputSchema = z.object({
  path: z.string(),
  size: z.number(),
  created: z.boolean().describe('Whether file was newly created'),
});

type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
type WriteFileOutput = z.infer<typeof WriteFileOutputSchema>;

export const writeFileTool: Tool<WriteFileInput, WriteFileOutput> = {
  definition: {
    name: 'write_file',
    description: 'Write content to a file (requires confirmation)',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          _description: PATH_DESCRIPTION,
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
        createDirs: {
          type: 'boolean',
          description: 'Create parent directories if they do not exist',
          _default: true,
        },
      },
      required: ['path', 'content'],
    },
  },
  _inputSchema: WriteFileInputSchema,
  _outputSchema: WriteFileOutputSchema,
  _requiresConfirmation: true,
  category: 'filesystem',

  async validate(context: ToolContext) {
    if (!isDirectory(context.workspaceRoot)) {
      return {
        valid: false,
        error: `Workspace root does not exist: ${context.workspaceRoot}`,
        warnings: [],
      };
    }

    return { valid: true, warnings: [] };
  },

  async execute(input: WriteFileInput, context: ToolContext): Promise<WriteFileOutput> {
    const absolutePath = resolve(context.workspaceRoot, input.path);
    
    // Security: Ensure path is within workspace
    const relativePath = relative(context.workspaceRoot, absolutePath);
    if (relativePath.startsWith('..')) {
      throw new ToolExecutionError(
        'write_file',
        `Path outside workspace not allowed: ${input.path}`
      );
    }

    const fileExists = isFile(absolutePath);
    const dirPath = dirname(absolutePath);

    try {
      // Create parent directories if needed
      if (input.createDirs && !isDirectory(dirPath)) {
        await mkdir(dirPath, { recursive: true });
        logger.debug(`Created directory: ${relative(context.workspaceRoot, dirPath)}`);
      }

      // Write file
      await writeFile(absolutePath, input.content, 'utf-8');
      
      const stats = await stat(absolutePath);
      
      return {
        path: input.path,
        size: stats.size,
        created: !fileExists,
      };

    } catch (error) {
      throw new ToolExecutionError(
        'write_file',
        `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

// =============================================================================
// LIST FILES TOOL
// =============================================================================

const ListFilesInputSchema = z.object({
  path: z.string().default('.').describe('Directory path relative to workspace'),
  recursive: z.boolean().default(false).describe('Include subdirectories'),
  pattern: z.string().optional().describe('Glob pattern filter (e.g., "*.ts")'),
  includeHidden: z.boolean().default(false).describe('Include hidden files/directories'),
});

const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  modified: z.string().optional(),
});

const ListFilesOutputSchema = z.object({
  entries: z.array(FileEntrySchema),
  totalFiles: z.number(),
  totalDirectories: z.number(),
});

type ListFilesInput = z.infer<typeof ListFilesInputSchema>;
type ListFilesOutput = z.infer<typeof ListFilesOutputSchema>;

export const listFilesTool: Tool<ListFilesInput, ListFilesOutput> = {
  definition: {
    name: 'list_files',
    description: 'List files and directories',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to workspace',
          default: '.',
        },
        recursive: {
          type: 'boolean',
          description: 'Include subdirectories recursively',
          _default: false,
        },
        pattern: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.ts", "src/**/*.js")',
        },
        includeHidden: {
          type: 'boolean',
          description: 'Include hidden files and directories',
          _default: false,
        },
      },
      required: [],
    },
  },
  _inputSchema: ListFilesInputSchema,
  _outputSchema: ListFilesOutputSchema,
  _requiresConfirmation: false,
  category: 'filesystem',

  async execute(input: ListFilesInput, context: ToolContext): Promise<ListFilesOutput> {
    const absolutePath = resolve(context.workspaceRoot, input.path);
    
    // Security check
    const relativePath = relative(context.workspaceRoot, absolutePath);
    if (relativePath.startsWith('..')) {
      throw new ToolExecutionError(
        'list_files',
        `Path outside workspace not allowed: ${input.path}`
      );
    }

    if (!isDirectory(absolutePath)) {
      throw new ToolExecutionError(
        'list_files',
        `Directory not found: ${input.path}`
      );
    }

    try {
      const searchPattern = input.recursive
        ? join(input.path, '**', input.pattern ?? '*').replace(/\\/g, '/')
        : join(input.path, input.pattern ?? '*').replace(/\\/g, '/');

      const globOptions = {
        cwd: context.workspaceRoot,
        dot: input.includeHidden,
        absolute: false,
      };

      const matches = await glob(searchPattern, globOptions);
      const entries: FileEntry[] = [];
      let totalFiles = 0;
      let totalDirectories = 0;

      for (const match of matches) {
        const entry = await createFileEntry(context, match);
        if (entry) {
          entries.push(entry);
          if (entry.type === 'file') {
            totalFiles++;
          } else {
            totalDirectories++;
          }
        }
      }

      // Sort: directories first, then files, both alphabetically
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        entries,
        totalFiles,
        totalDirectories,
      };

    } catch (error) {
      throw new ToolExecutionError(
        'list_files',
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

type FileEntry = z.infer<typeof FileEntrySchema>;

async function createFileEntry(context: ToolContext, match: string): Promise<FileEntry | null> {
  const fullPath = resolve(context.workspaceRoot, match);
  try {
    const stats = await stat(fullPath);
    return {
      name: match.split('/').pop() ?? match,
      path: match,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.isFile() ? stats.size : undefined,
      modified: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

// =============================================================================
// GREP SEARCH TOOL
// =============================================================================

const GrepSearchInputSchema = z.object({
  path: z.string().default('.').describe('Directory to search (relative to workspace)'),
  pattern: z.string().describe('Search pattern (regex supported)'),
  filePattern: z.string().optional().describe('File glob pattern to limit search'),
  caseSensitive: z.boolean().default(false).describe('Case sensitive search'),
  maxResults: z.number().int().positive().default(100).describe('Maximum number of results'),
});

const SearchMatchSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  content: z.string(),
  context: z.object({
    before: z.array(z.string()).optional(),
    after: z.array(z.string()).optional(),
  }).optional(),
});

const GrepSearchOutputSchema = z.object({
  matches: z.array(SearchMatchSchema),
  totalMatches: z.number(),
  searchedFiles: z.number(),
  pattern: z.string(),
});

type GrepSearchInput = z.infer<typeof GrepSearchInputSchema>;
type GrepSearchOutput = z.infer<typeof GrepSearchOutputSchema>;

export const grepSearchTool: Tool<GrepSearchInput, GrepSearchOutput> = {
  definition: {
    name: 'grep_search',
    description: 'Search for patterns in files',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory to search (relative to workspace)',
          default: '.',
        },
        pattern: {
          type: 'string',
          description: 'Search pattern (regex supported)',
        },
        filePattern: {
          type: 'string',
          description: 'File glob pattern to limit search (e.g., "*.ts")',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Perform case-sensitive search',
          _default: false,
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of matches to return',
          _default: 100,
        },
      },
      required: ['pattern'],
    },
  },
  _inputSchema: GrepSearchInputSchema,
  _outputSchema: GrepSearchOutputSchema,
  _requiresConfirmation: false,
  category: 'search',

  async execute(input: GrepSearchInput, context: ToolContext): Promise<GrepSearchOutput> {
    const absolutePath = resolve(context.workspaceRoot, input.path);
    
    // Security check
    const relativePath = relative(context.workspaceRoot, absolutePath);
    if (relativePath.startsWith('..')) {
      throw new ToolExecutionError(
        'grep_search',
        `Path outside workspace not allowed: ${input.path}`
      );
    }

    try {
      const regex = new RegExp(
        input.pattern,
        input.caseSensitive ? 'g' : 'gi'
      );

      // Build file search pattern
      const fileGlob = input.filePattern !== undefined
        ? join(input.path, '**', input.filePattern).replace(/\\/g, '/')
        : join(input.path, '**', '*').replace(/\\/g, '/');

      const files = await glob(fileGlob, {
        cwd: context.workspaceRoot,
        dot: false,
        absolute: false,
      });

      const allMatches: SearchMatch[] = [];
      let searchedFiles = 0;

      for (const file of files) {
        if (allMatches.length >= input.maxResults) {
          break;
        }

        const fileMatches = await searchFile(file, regex, input.maxResults - allMatches.length, context);
        if (fileMatches.length > 0) {
          allMatches.push(...fileMatches);
        }
        searchedFiles++;
      }

      return {
        matches: allMatches,
        totalMatches: allMatches.length,
        searchedFiles,
        pattern: input.pattern,
      };

    } catch (error) {
      throw new ToolExecutionError(
        'grep_search',
        `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  },
};

type SearchMatch = z.infer<typeof SearchMatchSchema>;

async function searchFile(
  file: string,
  regex: RegExp,
  maxLimit: number,
  context: ToolContext
): Promise<SearchMatch[]> {
  const fullPath = resolve(context.workspaceRoot, file);
  
  // Skip directories and binary files
  if (!isFile(fullPath) || isBinaryFile(fullPath)) {
    return [];
  }

  try {
    const content = await readFile(fullPath, DEFAULT_ENCODING);
    const lines = content.split('\n');
    const matches: SearchMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxLimit) { break; }
      
      const line = lines[i];
      if (line === undefined) { continue; }

      const match = regex.exec(line);
      
      if (match) {
        matches.push({
          file,
          line: i + 1,
          column: match.index + 1,
          content: line,
        });
      }
      
      regex.lastIndex = 0;
    }
    return matches;
  } catch {
    return [];
  }
}

// =============================================================================
// TOOL COLLECTION
// =============================================================================

/**
 * Create and return all filesystem tools.
 */
export function createFileSystemTools(): Tool[] {
  return [
    readFileTool,
    writeFileTool,
    listFilesTool,
    grepSearchTool,
  ];
}