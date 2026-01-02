/**
 * @fileoverview Error boundary component for session restoration system
 * @module shared/components/SessionRestoration/ErrorBoundary
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import { logger } from '../../utils/logger.js';
import type { SessionId } from '../../types/index.js';
import { createSafeInputHandlerWithDefaults } from '../Layout/input-error-handling.js';

// =============================================================================
// ERROR BOUNDARY PROPS
// =============================================================================

interface SessionRestorationErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<SessionRestorationErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onFallbackToNewSession?: () => void;
  sessionId?: SessionId;
}

interface SessionRestorationErrorFallbackProps {
  error: Error;
  resetError: () => void;
  onFallbackToNewSession?: () => void;
  sessionId?: SessionId;
  errorId: string;
}

// =============================================================================
// ERROR BOUNDARY STATE
// =============================================================================

interface SessionRestorationErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

// =============================================================================
// DEFAULT ERROR FALLBACK COMPONENT
// =============================================================================

const DefaultSessionRestorationErrorFallback: React.FC<SessionRestorationErrorFallbackProps> = ({
  error,
  resetError,
  onFallbackToNewSession,
  sessionId,
  errorId,
}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(false);
  
  // Build options array
  const options: Array<{ label: string; action: () => void; description: string }> = [];
  
  // Always provide option to start new session
  if (onFallbackToNewSession) {
    options.push({
      label: 'Continue with New Session',
      action: onFallbackToNewSession,
      description: 'Start fresh without restoring any session (Recommended)',
    });
  }
  
  // Provide retry option
  options.push({
    label: 'Retry Session Restoration',
    action: resetError,
    description: 'Attempt to restore the session again',
  });
  
  const totalOptions = options.length;
  
  // Handle keyboard input
  const handleInput = React.useCallback(
    (input: string, key: any) => {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
      } else if (key.return) {
        const selectedOption = options[selectedIndex];
        if (selectedOption) {
          selectedOption.action();
        }
      } else if (input === 'd' || input === 'D') {
        setShowDetails((prev) => !prev);
      }
    },
    [selectedIndex, totalOptions, options]
  );

  // Wrap the input handler with error boundary protection
  const safeHandleInput = React.useMemo(
    () => createSafeInputHandlerWithDefaults(handleInput, 'SessionRestorationErrorFallback'),
    [handleInput]
  );

  useInput(safeHandleInput);
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Error Header */}
      <Box marginBottom={1}>
        <Text bold color="red">
          ⚠️ Session Restoration Error
        </Text>
      </Box>
      
      {/* Error Message */}
      <Box marginBottom={1} borderStyle="single" borderColor="red" paddingX={1}>
        <Text color="red">
          {error.message || 'An unexpected error occurred during session restoration'}
        </Text>
      </Box>

      {/* Session Context */}
      {sessionId && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Session: {sessionId}
          </Text>
        </Box>
      )}

      {/* Error ID for debugging */}
      <Box marginBottom={1}>
        <Text color="gray">
          Error ID: {errorId}
        </Text>
      </Box>

      {/* Error Details (if shown) */}
      {showDetails && (
        <Box
          flexDirection="column"
          marginBottom={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text color="gray" bold>
              Error Details:
            </Text>
          </Box>
          
          <Box marginBottom={1}>
            <Text color="gray">
              Type: {error.name || 'Unknown'}
            </Text>
          </Box>
          
          {error.stack && (
            <Box marginBottom={1}>
              <Text color="gray">
                Stack: {error.stack.split('\n')[0]}
              </Text>
            </Box>
          )}
          
          <Box>
            <Text color="gray" dimColor>
              Press D to hide details
            </Text>
          </Box>
        </Box>
      )}

      {/* Instructions */}
      <Box marginBottom={1}>
        <Text color="gray">
          The session restoration component encountered an unexpected error. 
          Choose a recovery option below:
        </Text>
      </Box>

      {/* Recovery Options */}
      <Box flexDirection="column" marginBottom={1}>
        {options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isRecommended = option.description.includes('Recommended');
          
          return (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Box>
                <Text 
                  color={isSelected ? 'black' : 'white'} 
                  {...(isSelected ? { backgroundColor: 'cyan' } : {})}
                >
                  {isSelected ? '► ' : '  '}
                  {option.label}
                  {isRecommended ? ' (Recommended)' : ''}
                </Text>
              </Box>
              
              <Box marginLeft={2}>
                <Text color={isSelected ? 'cyan' : 'gray'}>
                  {option.description}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          ↑/↓: Navigate | Enter: Select | D: {showDetails ? 'Hide' : 'Show'} details
        </Text>
      </Box>
    </Box>
  );
};

// =============================================================================
// ERROR BOUNDARY COMPONENT
// =============================================================================

/**
 * Error boundary component for the session restoration system.
 * 
 * This component catches JavaScript errors anywhere in the session restoration
 * component tree, logs those errors, and displays a fallback UI with recovery
 * options instead of the component tree that crashed.
 * 
 * Features:
 * - Catches and handles session restoration errors
 * - Provides user-friendly error messages with context
 * - Supports error recovery and retry functionality
 * - Offers fallback to new session creation
 * - Logs errors for debugging with session context
 * - Provides detailed error information on demand
 */
export class SessionRestorationErrorBoundary extends React.Component<
  SessionRestorationErrorBoundaryProps,
  SessionRestorationErrorBoundaryState
> {
  constructor(props: SessionRestorationErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }
  
  static getDerivedStateFromError(error: Error): Partial<SessionRestorationErrorBoundaryState> {
    // Generate unique error ID for tracking
    const errorId = `session-restoration-error-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the error with session context
    logger.error('Session Restoration Error Boundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      sessionId: this.props.sessionId,
      context: 'session-restoration',
    });
    
    // Update state with error info
    this.setState({ errorInfo });
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }
  
  componentWillUnmount(): void {
    // Cleanup if needed
  }
  
  private handleRetry = (): void => {
    logger.info('User requested session restoration error recovery retry', { 
      errorId: this.state.errorId,
      sessionId: this.props.sessionId,
    });
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };
  
  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback component if provided
      const FallbackComponent = this.props.fallback || DefaultSessionRestorationErrorFallback;
      
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.handleRetry}
          onFallbackToNewSession={this.props.onFallbackToNewSession || (() => {})}
          sessionId={this.props.sessionId!}
          errorId={this.state.errorId}
        />
      );
    }
    
    return this.props.children;
  }
}

// =============================================================================
// HOOK FOR ERROR BOUNDARY
// =============================================================================

/**
 * Hook to provide error boundary functionality to functional components
 * in the session restoration system.
 */
export function useSessionRestorationErrorHandler(): {
  hasError: boolean;
  error: Error | null;
  resetError: () => void;
  captureError: (error: Error, sessionId?: SessionId) => void;
} {
  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  
  const resetError = React.useCallback(() => {
    setHasError(false);
    setError(null);
  }, []);
  
  const captureError = React.useCallback((error: Error, sessionId?: SessionId) => {
    logger.error('Session restoration error captured by hook', {
      error: error.message,
      stack: error.stack,
      sessionId,
      context: 'session-restoration',
    });
    
    setHasError(true);
    setError(error);
  }, []);
  
  return {
    hasError,
    error,
    resetError,
    captureError,
  };
}

// =============================================================================
// HIGHER-ORDER COMPONENT
// =============================================================================

/**
 * Higher-order component that wraps a component with session restoration error boundary.
 */
export function withSessionRestorationErrorBoundary<P extends Record<string, any>>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<SessionRestorationErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = React.forwardRef<any, P>((props, ref) => (
    <SessionRestorationErrorBoundary {...errorBoundaryProps}>
      <Component {...(props as P)} ref={ref} />
    </SessionRestorationErrorBoundary>
  ));
  
  WrappedComponent.displayName = `withSessionRestorationErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  SessionRestorationErrorBoundaryProps,
  SessionRestorationErrorFallbackProps,
};

export {
  DefaultSessionRestorationErrorFallback,
};