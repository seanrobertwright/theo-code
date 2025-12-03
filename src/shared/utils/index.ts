/**
 * @fileoverview Public API for shared utilities
 * @module shared/utils
 */

// Logger
export { logger, LogLevel } from './logger.js';

// Path utilities
export {
  isPathWithinWorkspace,
  normalizePath,
  getRelativePath,
  pathExists,
  isDirectory,
  isFile,
  getFileSize,
  formatFileSize,
  isBinaryFile,
  getDirectoryTree,
  formatTreeAsAscii,
  type TreeEntry,
} from './paths.js';

// Tokenizer utilities
export {
  countTokens,
  countMessageTokens,
  countMessagesTokens,
  getContextLimit,
  checkContextFit,
  formatTokenCount,
} from './tokenizer.js';
