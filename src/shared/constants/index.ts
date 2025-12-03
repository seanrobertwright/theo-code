/**
 * @fileoverview Application constants
 * @module shared/constants
 */

/** Application name */
export const APP_NAME = 'theo-code';

/** Application version */
export const APP_VERSION = '0.1.0';

/** Default model provider */
export const DEFAULT_PROVIDER = 'openai';

/** Default model */
export const DEFAULT_MODEL = 'gpt-4o';

/** Session auto-save interval in milliseconds */
export const AUTO_SAVE_INTERVAL = 30000;

/** Maximum sessions to keep */
export const MAX_SESSIONS = 50;

/** Maximum file size to read (1MB) */
export const MAX_FILE_SIZE = 1024 * 1024;

/** Execution timeout in milliseconds */
export const EXECUTION_TIMEOUT = 30000;

/** Reserved tokens for response */
export const RESERVED_RESPONSE_TOKENS = 4096;

/** Context warning threshold (80%) */
export const CONTEXT_WARNING_THRESHOLD = 0.8;
