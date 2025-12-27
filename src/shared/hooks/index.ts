/**
 * @fileoverview Public API for shared hooks
 * @module shared/hooks
 */

export { useKeyboard, type UseKeyboardOptions, type UseKeyboardResult } from './useKeyboard.js';
export { useConfig, type UseConfigResult } from './useConfig.js';
export { 
  useArchonMCP, 
  useUIUpgradeArchonTasks,
  type UseArchonMCPReturn 
} from './useArchonMCP.js';
