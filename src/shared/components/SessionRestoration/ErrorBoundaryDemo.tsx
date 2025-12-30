/**
 * @fileoverview Demonstration of session restoration error boundaries
 * @module shared/components/SessionRestoration/ErrorBoundaryDemo
 * 
 * This file demonstrates how to use the session restoration error boundaries
 * in different scenarios. It's intended for development and testing purposes.
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import {
  SessionRestorationErrorBoundary,
  SessionDetectionErrorBoundary,
  SessionRestoration,
  SessionDetectionLoading,
} from './index.js';
import type { SessionMetadata } from '../../types/index.js';

// =============================================================================
// DEMO COMPONENTS
// =============================================================================

/**
 * Component that simulates a session restoration error
 */
const SimulatedSessionRestorationError: React.FC = () => {
  React.useEffect(() => {
    // Simulate an async error after component mounts
    setTimeout(() => {
      throw new Error('Simulated session restoration component error');
    }, 100);
  }, []);
  
  return <Text>Loading session restoration...</Text>;
};

/**
 * Component that simulates a session detection error
 */
const SimulatedSessionDetectionError: React.FC = () => {
  React.useEffect(() => {
    // Simulate an async error after component mounts
    setTimeout(() => {
      throw new Error('Simulated session detection error');
    }, 100);
  }, []);
  
  return <SessionDetectionLoading />;
};

/**
 * Component that throws an error immediately
 */
const ImmediateErrorComponent: React.FC<{ message?: string }> = ({ 
  message = 'Immediate error for testing' 
}) => {
  throw new Error(message);
};

// =============================================================================
// DEMO SCENARIOS
// =============================================================================

/**
 * Demo: Session restoration error boundary with recovery options
 */
export const SessionRestorationErrorDemo: React.FC = () => {
  const [showError, setShowError] = React.useState(false);
  const [sessionId] = React.useState('demo-session-123');
  
  const handleFallbackToNewSession = React.useCallback(() => {
    console.log('Demo: Falling back to new session');
    setShowError(false);
  }, []);
  
  const handleError = React.useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    console.log('Demo: Error caught by boundary', { error: error.message, errorInfo });
  }, []);
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Session Restoration Error Boundary Demo</Text>
      <Text color="gray">This demonstrates error handling during session restoration</Text>
      
      <Box marginTop={1}>
        <Text>
          Press 't' to trigger error, 'r' to reset
        </Text>
      </Box>
      
      <Box marginTop={1}>
        <SessionRestorationErrorBoundary
          sessionId={sessionId as any}
          onFallbackToNewSession={handleFallbackToNewSession}
          onError={handleError}
        >
          {showError ? (
            <ImmediateErrorComponent message="Demo session restoration error" />
          ) : (
            <SessionRestoration
              sessions={[]}
              onSessionSelected={() => setShowError(true)}
              onNewSession={() => console.log('Demo: New session selected')}
            />
          )}
        </SessionRestorationErrorBoundary>
      </Box>
    </Box>
  );
};

/**
 * Demo: Session detection error boundary with retry options
 */
export const SessionDetectionErrorDemo: React.FC = () => {
  const [showError, setShowError] = React.useState(false);
  
  const handleFallbackToNewSession = React.useCallback(() => {
    console.log('Demo: Falling back to new session from detection error');
    setShowError(false);
  }, []);
  
  const handleRetryDetection = React.useCallback(() => {
    console.log('Demo: Retrying session detection');
    setShowError(false);
  }, []);
  
  const handleError = React.useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    console.log('Demo: Detection error caught by boundary', { error: error.message, errorInfo });
  }, []);
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Session Detection Error Boundary Demo</Text>
      <Text color="gray">This demonstrates error handling during session detection</Text>
      
      <Box marginTop={1}>
        <Text>
          Press 't' to trigger error, 'r' to reset
        </Text>
      </Box>
      
      <Box marginTop={1}>
        <SessionDetectionErrorBoundary
          onFallbackToNewSession={handleFallbackToNewSession}
          onRetryDetection={handleRetryDetection}
          onError={handleError}
        >
          {showError ? (
            <ImmediateErrorComponent message="Demo session detection error" />
          ) : (
            <SessionDetectionLoading />
          )}
        </SessionDetectionErrorBoundary>
      </Box>
    </Box>
  );
};

/**
 * Demo: Nested error boundaries
 */
export const NestedErrorBoundariesDemo: React.FC = () => {
  const [outerError, setOuterError] = React.useState(false);
  const [innerError, setInnerError] = React.useState(false);
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Nested Error Boundaries Demo</Text>
      <Text color="gray">This demonstrates how error boundaries work when nested</Text>
      
      <Box marginTop={1}>
        <Text>
          Press 'o' for outer error, 'i' for inner error, 'r' to reset
        </Text>
      </Box>
      
      <Box marginTop={1}>
        <SessionDetectionErrorBoundary
          onFallbackToNewSession={() => {
            console.log('Demo: Outer boundary fallback');
            setOuterError(false);
            setInnerError(false);
          }}
          onError={(error) => console.log('Demo: Outer boundary caught:', error.message)}
        >
          <SessionRestorationErrorBoundary
            onFallbackToNewSession={() => {
              console.log('Demo: Inner boundary fallback');
              setInnerError(false);
            }}
            onError={(error) => console.log('Demo: Inner boundary caught:', error.message)}
          >
            {outerError ? (
              <ImmediateErrorComponent message="Outer boundary error" />
            ) : innerError ? (
              <ImmediateErrorComponent message="Inner boundary error" />
            ) : (
              <Text color="green">No errors - both boundaries are working</Text>
            )}
          </SessionRestorationErrorBoundary>
        </SessionDetectionErrorBoundary>
      </Box>
    </Box>
  );
};

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/**
 * Example: Basic session restoration with error boundary
 */
export const BasicUsageExample: React.FC = () => {
  const mockSessions: SessionMetadata[] = [
    {
      id: 'session-1' as any,
      title: 'Previous Chat Session',
      created: Date.now() - 7200000, // 2 hours ago
      lastModified: Date.now() - 3600000, // 1 hour ago
      messageCount: 15,
      tokenCount: { total: 2500, input: 1200, output: 1300 },
      model: 'claude-3-sonnet',
      contextFiles: [],
      tags: ['work', 'coding'],
      workspaceRoot: '/test/workspace',
      provider: 'anthropic'
    },
  ];
  
  return (
    <SessionRestorationErrorBoundary
      onFallbackToNewSession={() => console.log('Fallback to new session')}
      onError={(error, errorInfo) => {
        console.error('Session restoration error:', error);
        console.error('Component stack:', errorInfo.componentStack);
      }}
    >
      <SessionRestoration
        sessions={mockSessions}
        onSessionSelected={(sessionId) => console.log('Selected session:', sessionId)}
        onNewSession={() => console.log('New session requested')}
      />
    </SessionRestorationErrorBoundary>
  );
};

/**
 * Example: Session detection with error boundary
 */
export const DetectionUsageExample: React.FC = () => {
  return (
    <SessionDetectionErrorBoundary
      onFallbackToNewSession={() => console.log('Skip detection, start new session')}
      onRetryDetection={() => console.log('Retry session detection')}
      onError={(error, errorInfo) => {
        console.error('Session detection error:', error);
        console.error('Component stack:', errorInfo.componentStack);
      }}
    >
      <SessionDetectionLoading />
    </SessionDetectionErrorBoundary>
  );
};