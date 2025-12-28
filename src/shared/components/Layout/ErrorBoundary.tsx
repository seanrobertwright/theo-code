/**
 * @fileoverview Error boundary component for layout system
 * @module shared/components/Layout/ErrorBoundary
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import { logger } from '../../utils/logger.js';
import { createDefaultColorScheme } from './utils.js';
import { detectTerminalColorCapabilities, createFallbackColorScheme } from './error-handling.js';
import type { ColorScheme } from './types.js';

// =============================================================================
// ERROR BOUNDARY PROPS
// =============================================================================

interface LayoutErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<LayoutErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  colorScheme?: ColorScheme;
}

interface LayoutErrorFallbackProps {
  error: Error;
  resetError: () => void;
  colorScheme: ColorScheme;
}

// =============================================================================
// ERROR BOUNDARY STATE
// =============================================================================

interface LayoutErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

// =============================================================================
// DEFAULT ERROR FALLBACK COMPONENT
// =============================================================================

const DefaultLayoutErrorFallback: React.FC<LayoutErrorFallbackProps> = ({
  error,
  resetError: _resetError,
  colorScheme,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);
  
  // Auto-hide details after 10 seconds
  React.useEffect(() => {
    if (showDetails) {
      const timer = setTimeout(() => {
        setShowDetails(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showDetails]);
  
  return (
    <Box
      flexDirection="column"
      padding={2}
      borderStyle="double"
      borderColor={colorScheme.colors.errorMessage}
      alignItems="center"
      justifyContent="center"
    >
      {/* Error Header */}
      <Box marginBottom={1}>
        <Text color={colorScheme.colors.errorMessage} bold>
          ⚠️ Layout System Error
        </Text>
      </Box>
      
      {/* Error Message */}
      <Box marginBottom={1} width="100%" justifyContent="center">
        <Text color={colorScheme.colors.errorMessage}>
          {error.message || 'An unexpected error occurred in the layout system'}
        </Text>
      </Box>
      
      {/* Error Type */}
      <Box marginBottom={2}>
        <Text color={colorScheme.colors.comment}>
          Error Type: {error.name || 'Unknown'}
        </Text>
      </Box>
      
      {/* Action Buttons */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Box borderStyle="single" borderColor={colorScheme.colors.focus} padding={1}>
          <Text color={colorScheme.colors.focus}>
            Press 'r' to retry
          </Text>
        </Box>
        
        <Box borderStyle="single" borderColor={colorScheme.colors.border} padding={1}>
          <Text color={colorScheme.colors.border}>
            Press 'd' for details
          </Text>
        </Box>
      </Box>
      
      {/* Error Details (if shown) */}
      {showDetails && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={colorScheme.colors.comment}
          padding={1}
          width="100%"
        >
          <Box marginBottom={1}>
            <Text color={colorScheme.colors.comment} bold>
              Error Details:
            </Text>
          </Box>
          
          <Box marginBottom={1}>
            <Text color={colorScheme.colors.comment}>
              Stack: {error.stack?.split('\n')[0] || 'No stack trace available'}
            </Text>
          </Box>
          
          <Box>
            <Text color={colorScheme.colors.comment}>
              Press any key to hide details
            </Text>
          </Box>
        </Box>
      )}
      
      {/* Recovery Instructions */}
      <Box marginTop={1}>
        <Text color={colorScheme.colors.comment}>
          If the error persists, try resizing your terminal or restarting the application
        </Text>
      </Box>
    </Box>
  );
};

// =============================================================================
// ERROR BOUNDARY COMPONENT
// =============================================================================

/**
 * Error boundary component for the layout system.
 * 
 * This component catches JavaScript errors anywhere in the layout component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 * 
 * Features:
 * - Catches and handles layout-related errors
 * - Provides user-friendly error messages
 * - Supports error recovery and retry functionality
 * - Logs errors for debugging
 * - Adapts to terminal color capabilities
 * - Provides detailed error information on demand
 */
export class LayoutErrorBoundary extends React.Component<
  LayoutErrorBoundaryProps,
  LayoutErrorBoundaryState
> {
  constructor(props: LayoutErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }
  
  static getDerivedStateFromError(error: Error): Partial<LayoutErrorBoundaryState> {
    // Generate unique error ID for tracking
    const errorId = `layout-error-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the error
    logger.error('Layout Error Boundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
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
    logger.info('User requested error recovery retry', { errorId: this.state.errorId });
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };
  
  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      // Determine appropriate color scheme
      const capabilities = detectTerminalColorCapabilities();
      const colorScheme = this.props.colorScheme || createFallbackColorScheme(capabilities);
      
      // Use custom fallback component if provided
      const FallbackComponent = this.props.fallback || DefaultLayoutErrorFallback;
      
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.handleRetry}
          colorScheme={colorScheme}
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
 * Hook to provide error boundary functionality to functional components.
 */
export function useLayoutErrorHandler(): {
  hasError: boolean;
  error: Error | null;
  resetError: () => void;
  captureError: (error: Error) => void;
} {
  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  
  const resetError = React.useCallback(() => {
    setHasError(false);
    setError(null);
  }, []);
  
  const captureError = React.useCallback((error: Error) => {
    logger.error('Layout error captured by hook', {
      error: error.message,
      stack: error.stack,
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
 * Higher-order component that wraps a component with layout error boundary.
 */
export function withLayoutErrorBoundary<P extends Record<string, any>>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<LayoutErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = React.forwardRef<any, P>((props, ref) => (
    <LayoutErrorBoundary {...errorBoundaryProps}>
      <Component {...(props as P)} ref={ref} />
    </LayoutErrorBoundary>
  ));
  
  WrappedComponent.displayName = `withLayoutErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  LayoutErrorBoundaryProps,
  LayoutErrorFallbackProps,
};

export {
  DefaultLayoutErrorFallback,
};