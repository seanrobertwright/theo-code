/**
 * @fileoverview Path utilities for file system operations
 * @module shared/utils/paths
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

// =============================================================================
// PATH VALIDATION
// =============================================================================

/**
 * Checks if a path is within the workspace root.
 * Prevents path traversal attacks.
 *
 * @param targetPath - The path to check
 * @param workspaceRoot - The workspace root directory
 * @returns True if path is within workspace
 *
 * @example
 * ```typescript
 * isPathWithinWorkspace('/project/src/file.ts', '/project'); // true
 * isPathWithinWorkspace('/project/../etc/passwd', '/project'); // false
 * ```
 */
export function isPathWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const resolvedTarget = path.resolve(workspaceRoot, targetPath);
  const resolvedRoot = path.resolve(workspaceRoot);
  return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
}

/**
 * Normalizes a path relative to workspace root.
 *
 * @param targetPath - The path to normalize
 * @param workspaceRoot - The workspace root directory
 * @returns Absolute path within workspace
 * @throws {Error} If path is outside workspace
 */
export function normalizePath(targetPath: string, workspaceRoot: string): string {
  const absolutePath = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(workspaceRoot, targetPath);

  if (!isPathWithinWorkspace(absolutePath, workspaceRoot)) {
    throw new Error(`Path "${targetPath}" is outside workspace root`);
  }

  return absolutePath;
}

/**
 * Gets the relative path from workspace root.
 *
 * @param absolutePath - The absolute path
 * @param workspaceRoot - The workspace root directory
 * @returns Relative path from workspace root
 */
export function getRelativePath(absolutePath: string, workspaceRoot: string): string {
  return path.relative(workspaceRoot, absolutePath);
}

// =============================================================================
// FILE EXISTENCE
// =============================================================================

/**
 * Checks if a path exists.
 *
 * @param targetPath - The path to check
 * @returns True if path exists
 */
export function pathExists(targetPath: string): boolean {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a path is a directory.
 *
 * @param targetPath - The path to check
 * @returns True if path is a directory
 */
export function isDirectory(targetPath: string): boolean {
  try {
    const stats = fs.statSync(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Checks if a path exists and is a file.
 *
 * @param targetPath - The path to check
 * @returns True if path is a file
 */
export function isFile(targetPath: string): boolean {
  try {
    const stats = fs.statSync(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

// =============================================================================
// FILE SIZE
// =============================================================================

/**
 * Gets the size of a file in bytes.
 *
 * @param targetPath - The path to the file
 * @returns File size in bytes, or -1 if file doesn't exist
 */
export function getFileSize(targetPath: string): number {
  try {
    const stats = fs.statSync(targetPath);
    return stats.size;
  } catch {
    return -1;
  }
}

/**
 * Formats a file size in human-readable format.
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.5 KB")
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const unit = units[unitIndex];
  if (unit === undefined) {
    return `${bytes} B`;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${unit}`;
}

// =============================================================================
// BINARY FILE DETECTION
// =============================================================================

/** Common binary file extensions */
const BINARY_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.obj',
  '.o',
  '.a',
  '.lib',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.mov',
  '.mkv',
  '.webm',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
]);

/**
 * Checks if a file is likely binary based on extension.
 *
 * @param filePath - The path to check
 * @returns True if file is likely binary
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

// =============================================================================
// DIRECTORY TREE
// =============================================================================

/**
 * Entry in a directory tree.
 */
export interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeEntry[];
}

/**
 * Generates a directory tree structure.
 *
 * @param dirPath - The directory to scan
 * @param maxDepth - Maximum depth to scan (default: 3)
 * @param currentDepth - Current depth (internal use)
 * @returns Tree structure
 */
export function getDirectoryTree(
  dirPath: string,
  maxDepth = 3,
  currentDepth = 0
): TreeEntry[] {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const entries: TreeEntry[] = [];

  try {
    const items = fs.readdirSync(dirPath, { _withFileTypes: true });

    for (const item of items) {
      // Skip hidden files and common ignore patterns
      if (item.name.startsWith('.') || item.name === 'node_modules') {
        continue;
      }

      const itemPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        entries.push({
          name: item.name,
          _path: itemPath,
          type: 'directory',
          children: getDirectoryTree(itemPath, maxDepth, currentDepth + 1),
        });
      } else {
        entries.push({
          name: item.name,
          _path: itemPath,
          type: 'file',
        });
      }
    }
  } catch {
    // Ignore permission errors, etc.
  }

  return entries.sort((a, b) => {
    // Directories first, then alphabetically
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Formats a directory tree as ASCII art.
 *
 * @param entries - Tree entries to format
 * @param prefix - Line prefix (internal use)
 * @returns Formatted ASCII tree
 */
export function formatTreeAsAscii(entries: TreeEntry[], prefix = ''): string {
  const lines: string[] = [];

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const icon = entry.type === 'directory' ? '📁 ' : '📄 ';

    lines.push(`${prefix}${connector}${icon}${entry.name}`);

    if (entry.children !== undefined && entry.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(formatTreeAsAscii(entry.children, childPrefix));
    }
  });

  return lines.join('\n');
}
