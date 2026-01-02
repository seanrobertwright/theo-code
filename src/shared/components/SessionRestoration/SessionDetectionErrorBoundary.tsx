/**
 * @fileoverview Specialized error boundary for session detection process
 * @module shared/components/SessionRestoration/SessionDetectionErrorBoundary
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import { logger } from '../../utils/logger.js';
import { createSafeInputHandlerWithDefaults } from '../Layout/input-error-handling.js';

// =============================================================================
// ERROR BOUNDARY PROPS
// =============================================================================

interface SessionDetectionErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<SessionDetectionErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onFallbackToNewSession?: () => void;
  onRetryDetection?: () => void;
}

interface SessionDetectionErrorFallbackProps {
  error: Error;
  resetError: () => void;
  onFallbackToNewSession?: () => void;
  onRetryDetection?: () => void;
  errorId: string;
}

// =============================================================================
// ERROR BOUNDARY STATE
// =============================================================================

interface SessionDetectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

// =============================================================================
// DEFAULT ERROR FALLBACK COMPONENT
// =============================================================================

const DefaultSessionDetectionErrorFallback: React.FC<SessionDetectionErrorFallbackProps> = ({
  error,
  resetError,
  onFallbackToNewSession,
  onRetryDetection,
  errorId,
}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(false);
  
  // Build options array
  const options: Array<{ label: string; action: () => void; description: string; isRecommended?: boolean }> = [];
  
  // Always provide option to start new session (recommended for detection errors)
  if (onFallbackToNewSession) {
    options.push({
      label: 'Continue with New Session',
      action: onFallbackToNewSession,
      description: 'Skip session detection and start fresh',
      isRecommended: true,
    });
  }
  
  // Provide retry detection option
  if (onRetryDetection) {
    options.push({
      label: 'Retry Session Detection',
      action: onRetryDetection,
      description: 'Attempt to detect available sessions again',
    });
  }
  
  // Fallback retry option
  options.push({
    label: 'Reset and Retry',
    action: resetError,
    description: 'Reset the error state and try again',
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
    () => createSafeInputHandlerWithDefaults(handleInput, 'SessionDetectionErrorFallback'),
    [handleInput]
  );

  useInput(safeHandleInput);
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Error Header */}
      <Box marginBottom={1}>
        <Text bold color="red">
          ⚠️ Session Detection Failed
        </Text>
      </Box>
      
      {/* Error Message */}
      <Box marginBottom={1} borderStyle="single" borderColor="red" paddingX={1}>
        <Text color="red">
          {error.message || 'An unexpected error occurred while detecting available sessions'}
        </Text>
      </Box>

      {/* Error Context */}
      <Box marginBottom={1}>
        <Text color="yellow">
          The system encountered an error while trying to scan for previous sessions.
        </Text>
      </Box>

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
              Technical Details:
            </Text>
          </Box>
          
          <Box marginBottom={1}>
            <Text color="gray">
              Error Type: {error.name || 'Unknown'}
            </Text>
          </Box>
          
          {error.stack && (
            <Box marginBottom={1}>
              <Text color="gray">
                Location: {error.stack.split('\n')[1]?.trim() || 'Unknown'}
              </Text>
            </Box>
          )}
          
          <Box marginBottom={1}>
            <Text color="gray">
              This error occurred during the session detection phase, which scans
              for available sessions to restore.
            </Text>
          </Box>
          
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
          This error prevents the system from detecting available sessions.
          You can continue with a new session or try to detect sessions again:
        </Text>
      </Box>

      {/* Recovery Options */}
      <Box flexDirection="column" marginBottom={1}>
        {options.map((option, index) => {
          const isSelected = selectedIndex === index;
          
          return (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Box>
                <Text 
                  color={isSelected ? 'black' : 'white'} 
                  {...(isSelected ? { backgroundColor: 'cyan' } : {})}
                >
                  {isSelected ? '► ' : '  '}
                  {option.label}
                  {option.isRecommended ? ' (Recommended)' : ''}
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
 * Specialized error boundary for session detection process.
 * 
 * This component specifically handles errors that occur during the session
 * detection phase, providing appropriate recovery options and context-specific
 * error messages.
 * 
 * Features:
 * - Catches errors during session detection/scanning
 * - Provides detection-specific error messages
 * - Offers retry detection functionality
 * - Supports fallback to new session creation
 * - Logs errors with detection context
 */
export class SessionDetectionErrorBoundary extends React.Component<
  SessionDetectionErrorBoundaryProps,
  SessionDetectionErrorBoundaryState
> {
  constructor(props: SessionDetectionErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }
  
  static getDerivedStateFromError(error: Error): Partial<SessionDetectionErrorBoundaryState> {
    // Generate unique error ID for tracking
    const errorId = `session-detection-error-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log the error with detection context
    logger.error('Session Detection Error Boundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      context: 'session-detection',
      phase: 'detection',
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
    logger.info('User requested session detection error recovery retry', { 
      errorId: this.state.errorId,
    });
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };
  
  private handleRetryDetection = (): void => {
    logger.info('User requested retry of session detection', { 
      errorId: this.state.errorId,
    });
    
    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
    
    // Call retry detection callback if provided
    this.props.onRetryDetection?.();
  };
  
  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback component if provided
      const FallbackComponent = this.props.fallback || DefaultSessionDetectionErrorFallback;
      
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.handleRetry}
          onFallbackToNewSession={this.props.onFallbackToNewSession || (() => {})}
          onRetryDetection={this.handleRetryDetection}
          errorId={this.state.errorId}
        />
      );
    }
    
    return this.props.children;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
  SessionDetectionErrorBoundaryProps,
  SessionDetectionErrorFallbackProps,
};

export {
  DefaultSessionDetectionErrorFallback,
};