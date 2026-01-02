/**
 * @fileoverview Centralized Input Manager Hook - Single source of truth for input handlers
 * @module shared/hooks/useInputManager
 */

import * as React from 'react';
import { useInput } from 'ink';
import { logger } from '../utils/logger.js';

/**
 * Input handler function type
 */
export type InputHandler = (input: string, key: any) => void;

/**
 * Input handler registration with metadata
 */
export interface InputHandlerRegistration {
  id: string;
  handler: InputHandler;
  priority: number;
  isActive: boolean;
  component: string;
  registeredAt: number;
}

/**
 * Input manager state
 */
interface InputManagerState {
  handlers: Map<string, InputHandlerRegistration>;
  activeHandlerId: string | null;
  isProcessing: boolean;
  lastInputTime: number;
}

/**
 * Input manager context for sharing state across components
 */
interface InputManagerContextValue {
  registerHandler: (id: string, handler: InputHandler, component: string, priority?: number) => void;
  unregisterHandler: (id: string) => void;
  setActiveHandler: (id: string) => void;
  getActiveHandler: () => InputHandlerRegistration | null;
  getAllHandlers: () => InputHandlerRegistration[];
  isHandlerActive: (id: string) => boolean;
  state: InputManagerState;
}

/**
 * Context for sharing input manager across components
 */
const InputManagerContext = React.createContext<InputManagerContextValue | null>(null);

/**
 * Provider component for input manager context
 */
export const InputManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<InputManagerState>({
    handlers: new Map(),
    activeHandlerId: null,
    isProcessing: false,
    lastInputTime: 0,
  });

  /**
   * Register a new input handler
   */
  const registerHandler = React.useCallback((
    id: string,
    handler: InputHandler,
    component: string,
    priority: number = 0
  ) => {
    setState(prevState => {
      const newHandlers = new Map(prevState.handlers);
      const registration: InputHandlerRegistration = {
        id,
        handler,
        priority,
        isActive: false,
        component,
        registeredAt: Date.now(),
      };
      
      newHandlers.set(id, registration);
      
      logger.debug('Input handler registered', {
        id,
        component,
        priority,
        totalHandlers: newHandlers.size,
      });

      // If this is the first handler or has higher priority, make it active
      const shouldActivate = !prevState.activeHandlerId || 
        (prevState.handlers.get(prevState.activeHandlerId)?.priority || 0) < priority;

      return {
        ...prevState,
        handlers: newHandlers,
        activeHandlerId: shouldActivate ? id : prevState.activeHandlerId,
      };
    });
  }, []);

  /**
   * Unregister an input handler
   */
  const unregisterHandler = React.useCallback((id: string) => {
    setState(prevState => {
      const newHandlers = new Map(prevState.handlers);
      const wasActive = prevState.activeHandlerId === id;
      
      if (newHandlers.has(id)) {
        newHandlers.delete(id);
        
        logger.debug('Input handler unregistered', {
          id,
          wasActive,
          remainingHandlers: newHandlers.size,
        });
      }

      // If the active handler was removed, find the next highest priority handler
      let newActiveHandlerId = prevState.activeHandlerId;
      if (wasActive) {
        newActiveHandlerId = null;
        let highestPriority = -Infinity;
        
        for (const [handlerId, registration] of newHandlers) {
          if (registration.priority > highestPriority) {
            highestPriority = registration.priority;
            newActiveHandlerId = handlerId;
          }
        }
      }

      return {
        ...prevState,
        handlers: newHandlers,
        activeHandlerId: newActiveHandlerId,
      };
    });
  }, []);

  /**
   * Set the active input handler
   */
  const setActiveHandler = React.useCallback((id: string) => {
    setState(prevState => {
      if (!prevState.handlers.has(id)) {
        logger.warn('Attempted to activate non-existent input handler', { id });
        return prevState;
      }

      logger.debug('Input handler activated', {
        id,
        previousActive: prevState.activeHandlerId,
      });

      return {
        ...prevState,
        activeHandlerId: id,
      };
    });
  }, []);

  /**
   * Get the currently active handler
   */
  const getActiveHandler = React.useCallback((): InputHandlerRegistration | null => {
    if (!state.activeHandlerId) {
      return null;
    }
    return state.handlers.get(state.activeHandlerId) || null;
  }, [state.activeHandlerId, state.handlers]);

  /**
   * Get all registered handlers
   */
  const getAllHandlers = React.useCallback((): InputHandlerRegistration[] => {
    return Array.from(state.handlers.values()).sort((a, b) => b.priority - a.priority);
  }, [state.handlers]);

  /**
   * Check if a specific handler is active
   */
  const isHandlerActive = React.useCallback((id: string): boolean => {
    return state.activeHandlerId === id;
  }, [state.activeHandlerId]);

  /**
   * Master input handler that delegates to the active handler
   */
  const masterInputHandler = React.useCallback((input: string, key: any) => {
    if (state.isProcessing) {
      return; // Prevent concurrent input processing
    }

    const activeHandler = getActiveHandler();
    if (!activeHandler) {
      logger.debug('No active input handler available', {
        input: input.slice(0, 10), // Log first 10 chars for debugging
        totalHandlers: state.handlers.size,
      });
      return;
    }

    setState(prevState => ({ ...prevState, isProcessing: true, lastInputTime: Date.now() }));

    try {
      logger.debug('Delegating input to active handler', {
        handlerId: activeHandler.id,
        component: activeHandler.component,
        input: input.slice(0, 10),
      });

      activeHandler.handler(input, key);
    } catch (error) {
      logger.error('Error in input handler', {
        handlerId: activeHandler.id,
        component: activeHandler.component,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setState(prevState => ({ ...prevState, isProcessing: false }));
    }
  }, [state.isProcessing, state.handlers.size, getActiveHandler]);

  // Register the master input handler with Ink
  useInput(masterInputHandler);

  const contextValue: InputManagerContextValue = React.useMemo(() => ({
    registerHandler,
    unregisterHandler,
    setActiveHandler,
    getActiveHandler,
    getAllHandlers,
    isHandlerActive,
    state,
  }), [
    registerHandler,
    unregisterHandler,
    setActiveHandler,
    getActiveHandler,
    getAllHandlers,
    isHandlerActive,
    state,
  ]);

  return (
    React.createElement(
      InputManagerContext.Provider,
      { value: contextValue },
      children
    )
  );
};

/**
 * Hook to access the input manager
 */
export const useInputManager = (): InputManagerContextValue => {
  const context = React.useContext(InputManagerContext);
  if (!context) {
    throw new Error('useInputManager must be used within an InputManagerProvider');
  }
  return context;
};

/**
 * Hook for components to register their input handlers
 */
export const useInputHandler = (
  id: string,
  handler: InputHandler,
  component: string,
  options: {
    priority?: number;
    autoActivate?: boolean;
    dependencies?: React.DependencyList;
  } = {}
) => {
  const { priority = 0, autoActivate = false, dependencies = [] } = options;
  const inputManager = useInputManager();

  // Memoize the handler to prevent unnecessary re-registrations
  const stableHandler = React.useCallback(handler, dependencies);

  React.useEffect(() => {
    // Register the handler
    inputManager.registerHandler(id, stableHandler, component, priority);

    // Auto-activate if requested
    if (autoActivate) {
      inputManager.setActiveHandler(id);
    }

    // Cleanup on unmount or dependency change
    return () => {
      inputManager.unregisterHandler(id);
    };
  }, [id, stableHandler, component, priority, autoActivate, inputManager]);

  return {
    isActive: inputManager.isHandlerActive(id),
    activate: () => inputManager.setActiveHandler(id),
    deactivate: () => {
      // Find next highest priority handler to activate
      const allHandlers = inputManager.getAllHandlers();
      const nextHandler = allHandlers.find(h => h.id !== id);
      if (nextHandler) {
        inputManager.setActiveHandler(nextHandler.id);
      }
    },
  };
};

/**
 * Hook for debugging input manager state
 */
export const useInputManagerDebug = () => {
  const inputManager = useInputManager();
  
  return {
    totalHandlers: inputManager.state.handlers.size,
    activeHandlerId: inputManager.state.activeHandlerId,
    isProcessing: inputManager.state.isProcessing,
    lastInputTime: inputManager.state.lastInputTime,
    handlers: inputManager.getAllHandlers(),
    logState: () => {
      console.log('Input Manager State:', {
        totalHandlers: inputManager.state.handlers.size,
        activeHandlerId: inputManager.state.activeHandlerId,
        isProcessing: inputManager.state.isProcessing,
        handlers: inputManager.getAllHandlers().map(h => ({
          id: h.id,
          component: h.component,
          priority: h.priority,
          isActive: h.isActive,
        })),
      });
    },
  };
};

export type {
  InputHandlerRegistration,
  InputManagerContextValue,
};