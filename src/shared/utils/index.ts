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

// Performance monitoring utilities
export {
  performanceMonitor,
  PerformanceMonitor,
  startRenderTracking,
  recordRenderCycle,
  startOperation,
  measure,
  measureAsync,
  getRenderCycleData,
  getOperationData,
  getSummary,
  logSummary,
  clearPerformanceData,
  setPerformanceMonitorEnabled,
  isPerformanceMonitorEnabled,
  type RenderCycleData,
  type OperationData,
} from './performanceMonitor.js';
