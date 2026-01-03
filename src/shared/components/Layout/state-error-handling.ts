/**
 * @fileoverview State update error handling utilities
 * @module shared/components/Layout/state-error-handling
 */

import { logger } from '../../utils/logger.js';

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Base class for state update errors.
 */
export class StateUpdateError extends Error {
  constructor(message: string, public readonly code: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'StateUpdateError';
  }
}

/**
 * Error thrown when state update fails due to invalid state.
 */
export class InvalidStateError extends StateUpdateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_STATE', context);
  }
}

/**
 * Error thrown when state update fails due to concurrent modifications.
 */
export class ConcurrentStateError extends StateUpdateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONCURRENT_STATE_MODIFICATION', context);
  }
}

/**
 * Error thrown when state update fails due to validation errors.
 */
export class StateValidationError extends StateUpdateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STATE_VALIDATION_FAILED', context);
  }
}

/**
 * Error thrown when state update fails due to memory constraints.
 */
export class StateMemoryError extends StateUpdateError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STATE_MEMORY_ERROR', context);
  }
}

// =============================================================================
// STATE UPDATE TYPES
// =============================================================================

/**
 * State updater function type
 */
export type StateUpdater<T> = (prevState: T) => T;

/**
 * Simple state setter function type
 */
export type StateSetter<T> = (newState: T) => void;

/**
 * Functional state setter type (can accept value or updater function)
 */
export type FunctionalStateSetter<T> = (newStateOrUpdater: T | StateUpdater<T>) => void;

/**
 * State update options
 */
export interface StateUpdateOptions<T> {
  /** Component name for logging context */
  componentName: string;
  /** State name for logging context */
  stateName: string;
  /** Validation function to check state before update */
  validator?: (state: T) => boolean | string;
  /** Fallback state to use when update fails */
  fallbackState?: T;
  /** Whether to suppress error logging */
  suppressLogging?: boolean;
  /** Custom error message prefix */
  errorPrefix?: string;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * State update result
 */
export interface StateUpdateResult<T> {
  /** Whether the update was successful */
  success: boolean;
  /** The final state value */
  state?: T;
  /** Error that occurred, if any */
  error?: StateUpdateError;
  /** Warnings generated during update */
  warnings: string[];
  /** Whether fallback state was used */
  usedFallback: boolean;
  /** Number of retry attempts made */
  retryAttempts: number;
}

// =============================================================================
// SAFE STATE UPDATE WRAPPERS
// =============================================================================

/**
 * Wraps a state setter with error boundary protection.
 * 
 * This function provides:
 * - Try-catch error handling around state updates
 * - State validation before updates
 * - Fallback behavior when updates fail
 * - Comprehensive error logging with context
 * - Retry logic for transient failures
 * - Graceful degradation to prevent UI crashes
 * 
 * @param setter - The state setter function to wrap
 * @param options - Configuration options
 * @returns Safe state setter with error boundaries
 */
export function createSafeStateSetter<T>(
  setter: StateSetter<T>,
  options: StateUpdateOptions<T>
): StateSetter<T> {
  const {
    componentName,
    stateName,
    validator,
    fallbackState,
    suppressLogging = false,
    errorPrefix = 'State update error',
    maxRetries = 0,
    retryDelay = 100
  } = options;

  return (newState: T) => {
    let retryAttempts = 0;
    const warnings: string[] = [];

    const attemptUpdate = async (): Promise<void> => {
      try {
        // Validate state before update
        if (validator) {
          const validationResult = validator(newState);
          if (validationResult !== true) {
            const validationMessage = typeof validationResult === 'string' 
              ? validationResult 
              : 'State validation failed';
            throw new StateValidationError(validationMessage, { 
              newState, 
              componentName, 
              stateName 
            });
          }
        }

        // Attempt the state update
        setter(newState);
        
        // Log successful update if there were previous failures
        if (retryAttempts > 0 && !suppressLogging) {
          logger.info(`State update succeeded after ${retryAttempts} retries in ${componentName}.${stateName}`);
        }
      } catch (error) {
        retryAttempts++;
        
        // Log the error with context
        if (!suppressLogging) {
          logger.error(`${errorPrefix} in ${componentName}.${stateName} (attempt ${retryAttempts})`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            newState,
            componentName,
            stateName,
            retryAttempts,
            context: 'state-update-error-boundary'
          });
        }

        // Check if we should retry
        if (retryAttempts <= maxRetries && isRetryableError(error)) {
          warnings.push(`State update failed, retrying (attempt ${retryAttempts}/${maxRetries + 1})`);
          
          // Wait before retry
          if (retryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
          
          return attemptUpdate();
        }

        // Max retries reached or non-retryable error
        if (fallbackState !== undefined) {
          try {
            setter(fallbackState);
            warnings.push(`Used fallback state after ${retryAttempts} failed attempts`);
            
            if (!suppressLogging) {
              logger.warn(`Using fallback state in ${componentName}.${stateName}`, {
                fallbackState,
                originalError: error instanceof Error ? error.message : String(error),
                retryAttempts
              });
            }
          } catch (fallbackError) {
            if (!suppressLogging) {
              logger.error(`Fallback state update also failed in ${componentName}.${stateName}`, {
                fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                fallbackState,
                originalError: error instanceof Error ? error.message : String(error)
              });
            }
            
            // If even fallback fails, just ignore to prevent crashes
            // This ensures the UI remains functional
          }
        }
        
        // If no fallback state, just ignore the update
        // This prevents the error from propagating and crashing the UI
      }
    };

    // Execute the update (async but don't await to maintain sync interface)
    void attemptUpdate();
  };
}

/**
 * Wraps a functional state setter (that accepts value or updater function) with error boundary protection.
 */
export function createSafeFunctionalStateSetter<T>(
  setter: FunctionalStateSetter<T>,
  options: StateUpdateOptions<T>
): FunctionalStateSetter<T> {
  const {
    componentName,
    stateName,
    validator,
    fallbackState,
    suppressLogging = false,
    errorPrefix = 'State update error',
    maxRetries = 0,
    retryDelay = 100
  } = options;

  return (newStateOrUpdater: T | StateUpdater<T>) => {
    let retryAttempts = 0;
    const warnings: string[] = [];

    const attemptUpdate = async (): Promise<void> => {
      try {
        // If it's an updater function, we need to be more careful
        if (typeof newStateOrUpdater === 'function') {
          // Create a safe wrapper for the updater function
          const safeUpdater = (prevState: T): T => {
            try {
              const updater = newStateOrUpdater as StateUpdater<T>;
              const newState = updater(prevState);
              
              // Validate the new state
              if (validator) {
                const validationResult = validator(newState);
                if (validationResult !== true) {
                  const validationMessage = typeof validationResult === 'string' 
                    ? validationResult 
                    : 'State validation failed';
                  throw new StateValidationError(validationMessage, { 
                    newState, 
                    prevState, 
                    componentName, 
                    stateName 
                  });
                }
              }
              
              return newState;
            } catch (error) {
              // If updater fails, return previous state to prevent crashes
              if (!suppressLogging) {
                logger.error(`State updater function failed in ${componentName}.${stateName}`, {
                  error: error instanceof Error ? error.message : String(error),
                  prevState,
                  componentName,
                  stateName
                });
              }
              
              // Return fallback state or previous state
              return fallbackState !== undefined ? fallbackState : prevState;
            }
          };
          
          setter(safeUpdater);
        } else {
          // Direct value update - validate first
          if (validator) {
            const validationResult = validator(newStateOrUpdater);
            if (validationResult !== true) {
              const validationMessage = typeof validationResult === 'string' 
                ? validationResult 
                : 'State validation failed';
              throw new StateValidationError(validationMessage, { 
                newState: newStateOrUpdater, 
                componentName, 
                stateName 
              });
            }
          }
          
          setter(newStateOrUpdater);
        }
        
        // Log successful update if there were previous failures
        if (retryAttempts > 0 && !suppressLogging) {
          logger.info(`State update succeeded after ${retryAttempts} retries in ${componentName}.${stateName}`);
        }
      } catch (error) {
        retryAttempts++;
        
        // Log the error with context
        if (!suppressLogging) {
          logger.error(`${errorPrefix} in ${componentName}.${stateName} (attempt ${retryAttempts})`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            newStateOrUpdater: typeof newStateOrUpdater === 'function' ? '[Function]' : newStateOrUpdater,
            componentName,
            stateName,
            retryAttempts,
            context: 'functional-state-update-error-boundary'
          });
        }

        // Check if we should retry
        if (retryAttempts <= maxRetries && isRetryableError(error)) {
          warnings.push(`State update failed, retrying (attempt ${retryAttempts}/${maxRetries + 1})`);
          
          // Wait before retry
          if (retryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
          
          return attemptUpdate();
        }

        // Max retries reached or non-retryable error
        if (fallbackState !== undefined) {
          try {
            setter(fallbackState);
            warnings.push(`Used fallback state after ${retryAttempts} failed attempts`);
            
            if (!suppressLogging) {
              logger.warn(`Using fallback state in ${componentName}.${stateName}`, {
                fallbackState,
                originalError: error instanceof Error ? error.message : String(error),
                retryAttempts
              });
            }
          } catch (fallbackError) {
            if (!suppressLogging) {
              logger.error(`Fallback state update also failed in ${componentName}.${stateName}`, {
                fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                fallbackState,
                originalError: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }
      }
    };

    // Execute the update (async but don't await to maintain sync interface)
    void attemptUpdate();
  };
}

// =============================================================================
// BATCH STATE UPDATES
// =============================================================================

/**
 * Options for batch state updates
 */
export interface BatchStateUpdateOptions {
  /** Component name for logging context */
  componentName: string;
  /** Whether to suppress error logging */
  suppressLogging?: boolean;
  /** Whether to continue batch if one update fails */
  continueOnError?: boolean;
  /** Maximum retry attempts for the entire batch */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Batch state update function type
 */
export type BatchStateUpdate = () => void;

/**
 * Safely executes multiple state updates in a batch with error handling.
 * 
 * This function provides:
 * - Atomic batch execution (all or nothing by default)
 * - Error recovery for individual updates
 * - Comprehensive error logging
 * - Retry logic for transient failures
 * - Option to continue on individual failures
 * 
 * @param updates - Array of state update functions
 * @param options - Configuration options
 * @returns Promise resolving to batch update result
 */
export async function executeBatchStateUpdates(
  updates: BatchStateUpdate[],
  options: BatchStateUpdateOptions
): Promise<StateUpdateResult<void>> {
  const {
    componentName,
    suppressLogging = false,
    continueOnError = false,
    maxRetries = 0,
    retryDelay = 100
  } = options;

  let retryAttempts = 0;
  const warnings: string[] = [];
  const errors: Error[] = [];

  const attemptBatch = async (): Promise<StateUpdateResult<void>> => {
    try {
      // Execute all updates
      for (let i = 0; i < updates.length; i++) {
        try {
          const update = updates[i];
          if (update) {
            update();
          }
        } catch (error) {
          const updateError = error instanceof Error ? error : new Error(String(error));
          errors.push(updateError);
          
          if (!suppressLogging) {
            logger.error(`Batch state update ${i + 1}/${updates.length} failed in ${componentName}`, {
              error: updateError.message,
              stack: updateError.stack,
              updateIndex: i,
              componentName,
              retryAttempts,
              context: 'batch-state-update-error'
            });
          }
          
          if (!continueOnError) {
            throw updateError;
          }
        }
      }
      
      // If we had errors but continued, report them as warnings
      if (errors.length > 0 && continueOnError) {
        warnings.push(`${errors.length} state updates failed but batch continued`);
      }
      
      return {
        success: errors.length === 0,
        warnings,
        usedFallback: false,
        retryAttempts
      };
    } catch (error) {
      retryAttempts++;
      
      // Check if we should retry
      if (retryAttempts <= maxRetries && isRetryableError(error)) {
        warnings.push(`Batch state update failed, retrying (attempt ${retryAttempts}/${maxRetries + 1})`);
        
        // Wait before retry
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
        return attemptBatch();
      }
      
      // Max retries reached
      const stateError = error instanceof StateUpdateError 
        ? error 
        : new StateUpdateError(
            `Batch state update failed: ${error instanceof Error ? error.message : String(error)}`,
            'BATCH_UPDATE_FAILED',
            { componentName, retryAttempts, updateCount: updates.length }
          );
      
      return {
        success: false,
        error: stateError,
        warnings,
        usedFallback: false,
        retryAttempts
      };
    }
  };

  return attemptBatch();
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Determines if an error is retryable.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof StateUpdateError) {
    // Don't retry validation errors or invalid state errors
    return error.code !== 'STATE_VALIDATION_FAILED' && error.code !== 'INVALID_STATE';
  }
  
  // Retry other errors (might be transient)
  return true;
}

/**
 * Creates a state validator that checks for null/undefined values.
 */
export function createNullValidator<T>(allowNull = false, allowUndefined = false) {
  return (state: T): boolean | string => {
    if (state === null && !allowNull) {
      return 'State cannot be null';
    }
    if (state === undefined && !allowUndefined) {
      return 'State cannot be undefined';
    }
    return true;
  };
}

/**
 * Creates a state validator that checks object properties.
 */
export function createObjectValidator<T extends Record<string, unknown>>(
  requiredProperties: (keyof T)[]
) {
  return (state: T): boolean | string => {
    if (typeof state !== 'object' || state === null) {
      return 'State must be an object';
    }
    
    for (const prop of requiredProperties) {
      if (!(prop in state)) {
        return `Missing required property: ${String(prop)}`;
      }
    }
    
    return true;
  };
}

/**
 * Creates a state validator that checks array properties.
 */
export function createArrayValidator<T extends unknown[]>(
  minLength = 0,
  maxLength = Infinity
) {
  return (state: T): boolean | string => {
    if (!Array.isArray(state)) {
      return 'State must be an array';
    }
    
    if (state.length < minLength) {
      return `Array must have at least ${minLength} items`;
    }
    
    if (state.length > maxLength) {
      return `Array must have at most ${maxLength} items`;
    }
    
    return true;
  };
}

/**
 * Default fallback handler that logs the attempt and does nothing.
 */
export function createDefaultStateUpdateFallback<T>(
  componentName: string,
  stateName: string,
  defaultValue: T
): T {
  logger.debug(`Using default fallback state in ${componentName}.${stateName}`, {
    defaultValue,
    componentName,
    stateName,
    context: 'default-state-fallback'
  });
  
  return defaultValue;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Creates a safe state setter with common defaults.
 */
export function createSafeStateSetterWithDefaults<T>(
  setter: StateSetter<T>,
  componentName: string,
  stateName: string,
  fallbackState?: T
): StateSetter<T> {
  const optionsObj: StateUpdateOptions<T> = {
    componentName,
    stateName,
    validator: createNullValidator<T>(),
    maxRetries: 1,
    retryDelay: 50
  };

  if (fallbackState !== undefined) {
    optionsObj.fallbackState = fallbackState;
  }

  return createSafeStateSetter(setter, optionsObj);
}

/**
 * Creates a safe functional state setter with common defaults.
 */
export function createSafeFunctionalStateSetterWithDefaults<T>(
  setter: FunctionalStateSetter<T>,
  componentName: string,
  stateName: string,
  fallbackState?: T
): FunctionalStateSetter<T> {
  const optionsObj: StateUpdateOptions<T> = {
    componentName,
    stateName,
    validator: createNullValidator<T>(),
    maxRetries: 1,
    retryDelay: 50
  };

  if (fallbackState !== undefined) {
    optionsObj.fallbackState = fallbackState;
  }

  return createSafeFunctionalStateSetter(setter, optionsObj);
}