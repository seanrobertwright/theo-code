/**
 * @fileoverview Input handler error boundary utilities
 * @module shared/components/Layout/input-error-handling
 */

import { logger } from '../../utils/logger.js';

/**
 * Input handler function type
 */
export type InputHandler = (input: string, key: any) => void;

/**
 * Safe input handler options
 */
export interface SafeInputHandlerOptions {
  /** Component name for logging context */
  componentName: string;
  /** Fallback handler to use when primary handler fails */
  fallbackHandler?: InputHandler;
  /** Whether to suppress error logging */
  suppressLogging?: boolean;
  /** Custom error message prefix */
  errorPrefix?: string;
}

/**
 * Wraps an input handler with error boundary protection.
 * 
 * This function provides:
 * - Try-catch error handling around input handlers
 * - Fallback behavior when handlers fail
 * - Comprehensive error logging with context
 * - Graceful degradation to prevent UI crashes
 * 
 * @param handler - The input handler to wrap
 * @param options - Configuration options
 * @returns Safe input handler with error boundaries
 */
export function createSafeInputHandler(
  handler: InputHandler,
  options: SafeInputHandlerOptions
): InputHandler {
  const {
    componentName,
    fallbackHandler,
    suppressLogging = false,
    errorPrefix = 'Input handler error'
  } = options;

  return (input: string, key: any) => {
    try {
      // Execute the primary handler
      handler(input, key);
    } catch (error) {
      // Log the error with context
      if (!suppressLogging) {
        logger.error(`${errorPrefix} in ${componentName}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          input,
          key: key ? JSON.stringify(key) : undefined,
          componentName,
          context: 'input-handler-error-boundary'
        });
      }

      // Try fallback handler if available
      if (fallbackHandler) {
        try {
          fallbackHandler(input, key);
        } catch (fallbackError) {
          if (!suppressLogging) {
            logger.error(`Fallback handler also failed in ${componentName}`, {
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              stack: fallbackError instanceof Error ? fallbackError.stack : undefined,
              input,
              key: key ? JSON.stringify(key) : undefined,
              componentName,
              context: 'fallback-handler-error'
            });
          }
          
          // If even fallback fails, just ignore the input to prevent crashes
          // This ensures the UI remains functional
        }
      }
      
      // If no fallback handler, just ignore the input
      // This prevents the error from propagating and crashing the UI
    }
  };
}

/**
 * Default fallback handler that does nothing but logs the attempt.
 * This can be used as a safe fallback when no specific fallback behavior is needed.
 */
export function createDefaultFallbackHandler(componentName: string): InputHandler {
  return (input: string, key: any) => {
    logger.debug(`Default fallback handler activated in ${componentName}`, {
      input,
      key: key ? JSON.stringify(key) : undefined,
      componentName,
      context: 'default-fallback-handler'
    });
    // Do nothing - just prevent crashes
  };
}

/**
 * Creates a safe input handler with default fallback behavior.
 * This is a convenience function for common use cases.
 */
export function createSafeInputHandlerWithDefaults(
  handler: InputHandler,
  componentName: string
): InputHandler {
  return createSafeInputHandler(handler, {
    componentName,
    fallbackHandler: createDefaultFallbackHandler(componentName),
    errorPrefix: 'Input handler error'
  });
}

/**
 * Error recovery strategies for different types of input handler failures
 */
export const InputErrorRecoveryStrategies = {
  /**
   * Ignore the input and continue - safest option
   */
  IGNORE: 'ignore' as const,
  
  /**
   * Log error and attempt to continue with partial functionality
   */
  LOG_AND_CONTINUE: 'log_and_continue' as const,
  
  /**
   * Reset component state and continue
   */
  RESET_AND_CONTINUE: 'reset_and_continue' as const,
  
  /**
   * Disable input handling temporarily
   */
  DISABLE_TEMPORARILY: 'disable_temporarily' as const
} as const;

export type InputErrorRecoveryStrategy = typeof InputErrorRecoveryStrategies[keyof typeof InputErrorRecoveryStrategies];

/**
 * Advanced safe input handler with recovery strategies
 */
export function createAdvancedSafeInputHandler(
  handler: InputHandler,
  componentName: string,
  recoveryStrategy: InputErrorRecoveryStrategy = InputErrorRecoveryStrategies.IGNORE
): InputHandler {
  let isTemporarilyDisabled = false;
  let disableTimeout: NodeJS.Timeout | null = null;

  return (input: string, key: any) => {
    // Check if temporarily disabled
    if (isTemporarilyDisabled) {
      logger.debug(`Input handler temporarily disabled in ${componentName}`, {
        input,
        componentName,
        context: 'temporarily-disabled'
      });
      return;
    }

    try {
      handler(input, key);
    } catch (error) {
      logger.error(`Advanced input handler error in ${componentName}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        input,
        key: key ? JSON.stringify(key) : undefined,
        componentName,
        recoveryStrategy,
        context: 'advanced-input-handler-error'
      });

      // Apply recovery strategy
      switch (recoveryStrategy) {
        case InputErrorRecoveryStrategies.IGNORE:
          // Do nothing - just ignore the input
          break;

        case InputErrorRecoveryStrategies.LOG_AND_CONTINUE:
          // Already logged above, just continue
          break;

        case InputErrorRecoveryStrategies.RESET_AND_CONTINUE:
          // This would require component-specific reset logic
          logger.info(`Attempting to reset component state in ${componentName}`);
          break;

        case InputErrorRecoveryStrategies.DISABLE_TEMPORARILY:
          // Disable input handling for 5 seconds
          isTemporarilyDisabled = true;
          if (disableTimeout) {
            clearTimeout(disableTimeout);
          }
          disableTimeout = setTimeout(() => {
            isTemporarilyDisabled = false;
            logger.info(`Re-enabled input handler in ${componentName}`);
          }, 5000);
          break;

        default:
          // Default to ignore
          break;
      }
    }
  };
}