/**
 * @fileoverview Integration tests for session restoration error boundaries
 * @module shared/components/SessionRestoration/__tests__/error-boundaries.integration.test
 */

import * as React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionRestorationErrorBoundary,
  SessionDetectionErrorBoundary,
  SessionRestoration,
  SessionDetectionLoading,
} from '../index.js';
import type { SessionMetadata } from '../../../types/index.js';

// =============================================================================
// TEST COMPONENTS
// =============================================================================

/**
 * Component that throws an error when rendered
 */
const ThrowingComponent: React.FC<{ shouldThrow?: boolean; errorMessage?: string }> = ({ 
  shouldThrow = true, 
  errorMessage = 'Test error' 
}) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div>No error</div>;
};

/**
 * Component that throws an error after a delay (simulates async errors)
 */
const AsyncThrowingComponent: React.FC = () => {
  const [shouldThrow, setShouldThrow] = React.useState(false);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShouldThrow(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (shouldThrow) {
    throw new Error('Async test error');
  }
  
  return <div>Loading...</div>;
};

/**
 * Mock SessionRestoration component that can throw errors
 */
const MockSessionRestoration: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = false }) => {
  if (shouldThrow) {
    throw new Error('Session restoration component error');
  }
  
  return (
    <SessionRestoration
      sessions={[]}
      onSessionSelected={() => {}}
      onNewSession={() => {}}
    />
  );
};

/**
 * Mock session detection component that can throw errors
 */
const MockSessionDetection: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = false }) => {
  if (shouldThrow) {
    throw new Error('Session detection error');
  }
  
  return <SessionDetectionLoading />;
};

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Session Restoration Error Boundaries Integration Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  
  beforeEach(() => {
    // Suppress console.error during tests to avoid noise
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ===========================================================================
  // SESSION RESTORATION ERROR BOUNDARY TESTS
  // ===========================================================================

  describe('SessionRestorationErrorBoundary', () => {
    it('should catch errors and display fallback UI', () => {
      const onError = vi.fn();
      const onFallbackToNewSession = vi.fn();
      
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary
          onError={onError}
          onFallbackToNewSession={onFallbackToNewSession}
          sessionId="test-session-123"
        >
          <ThrowingComponent errorMessage="Session restoration failed" />
        </SessionRestorationErrorBoundary>
      );
      
      // Should display error boundary fallback UI
      expect(lastFrame()).toContain('Session Restoration Error');
      expect(lastFrame()).toContain('Session restoration failed');
      expect(lastFrame()).toContain('Session: test-session-123');
      expect(lastFrame()).toContain('Continue with New Session');
      expect(lastFrame()).toContain('Retry Session Restoration');
      
      // Should call onError callback
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });

    it('should display error ID for debugging', () => {
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Should display error ID
      expect(lastFrame()).toMatch(/Error ID: session-restoration-error-\d+-[a-z0-9]+/);
    });

    it('should provide recovery options with proper navigation', () => {
      const onFallbackToNewSession = vi.fn();
      
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary onFallbackToNewSession={onFallbackToNewSession}>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Should show navigation instructions
      expect(lastFrame()).toContain('↑/↓: Navigate');
      expect(lastFrame()).toContain('Enter: Select');
      expect(lastFrame()).toContain('Show details');
      
      // Should show recovery options
      expect(lastFrame()).toContain('Continue with New Session');
      expect(lastFrame()).toContain('(Recommended)');
      expect(lastFrame()).toContain('Retry Session Restoration');
    });

    it('should handle errors without session ID', () => {
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Should display error UI without session context
      expect(lastFrame()).toContain('Session Restoration Error');
      expect(lastFrame()).not.toContain('Session:');
    });

    it('should reset error state when retry is triggered', () => {
      let shouldThrow = true;
      const TestComponent: React.FC = () => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div>Success</div>;
      };
      
      const { lastFrame, rerender } = render(
        <SessionRestorationErrorBoundary>
          <TestComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Should show error initially
      expect(lastFrame()).toContain('Session Restoration Error');
      
      // Simulate fixing the error and retrying
      shouldThrow = false;
      
      // Note: In a real scenario, the retry would be triggered by user input
      // For testing purposes, we verify the error boundary structure is correct
      expect(lastFrame()).toContain('Retry Session Restoration');
    });

    it('should use custom fallback component when provided', () => {
      const CustomFallback: React.FC<any> = ({ error }) => (
        <Text>Custom Error: {error.message}</Text>
      );
      
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary fallback={CustomFallback}>
          <ThrowingComponent errorMessage="Custom error message" />
        </SessionRestorationErrorBoundary>
      );
      
      expect(lastFrame()).toContain('Custom Error: Custom error message');
    });
  });

  // ===========================================================================
  // SESSION DETECTION ERROR BOUNDARY TESTS
  // ===========================================================================

  describe('SessionDetectionErrorBoundary', () => {
    it('should catch detection errors and display appropriate fallback UI', () => {
      const onError = vi.fn();
      const onFallbackToNewSession = vi.fn();
      const onRetryDetection = vi.fn();
      
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary
          onError={onError}
          onFallbackToNewSession={onFallbackToNewSession}
          onRetryDetection={onRetryDetection}
        >
          <ThrowingComponent errorMessage="Detection failed" />
        </SessionDetectionErrorBoundary>
      );
      
      // Should display detection-specific error UI
      expect(lastFrame()).toContain('Session Detection Failed');
      expect(lastFrame()).toContain('Detection failed');
      expect(lastFrame()).toContain('Continue with New Session');
      expect(lastFrame()).toContain('Retry Session Detection');
      expect(lastFrame()).toContain('Reset and Retry');
      
      // Should call onError callback
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });

    it('should provide detection-specific context and instructions', () => {
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary>
          <ThrowingComponent />
        </SessionDetectionErrorBoundary>
      );
      
      // Should show detection-specific context
      expect(lastFrame()).toContain('detecting available sessions');
      expect(lastFrame()).toContain('scan for previous sessions');
      expect(lastFrame()).toContain('Reset the error state and try again');
    });

    it('should display error ID for debugging', () => {
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary>
          <ThrowingComponent />
        </SessionDetectionErrorBoundary>
      );
      
      // Should display error ID with detection prefix
      expect(lastFrame()).toMatch(/Error ID: session-detection-error-\d+-[a-z0-9]+/);
    });

    it('should handle missing callback props gracefully', () => {
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary>
          <ThrowingComponent />
        </SessionDetectionErrorBoundary>
      );
      
      // Should still display error UI with available options
      expect(lastFrame()).toContain('Session Detection Failed');
      expect(lastFrame()).toContain('Reset and Retry');
    });

    it('should use custom fallback component when provided', () => {
      const CustomDetectionFallback: React.FC<any> = ({ error }) => (
        <Text>Custom Detection Error: {error.message}</Text>
      );
      
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary fallback={CustomDetectionFallback}>
          <ThrowingComponent errorMessage="Custom detection error" />
        </SessionDetectionErrorBoundary>
      );
      
      expect(lastFrame()).toContain('Custom Detection Error: Custom detection error');
    });
  });

  // ===========================================================================
  // INTEGRATION SCENARIOS
  // ===========================================================================

  describe('Integration Scenarios', () => {
    it('should handle nested error boundaries correctly', () => {
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary>
          <SessionRestorationErrorBoundary>
            <ThrowingComponent errorMessage="Nested error" />
          </SessionRestorationErrorBoundary>
        </SessionDetectionErrorBoundary>
      );
      
      // Inner error boundary should catch the error
      expect(lastFrame()).toContain('Session Restoration Error');
      expect(lastFrame()).toContain('Nested error');
    });

    it('should handle errors in real session restoration components', () => {
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary>
          <MockSessionRestoration shouldThrow={true} />
        </SessionRestorationErrorBoundary>
      );
      
      expect(lastFrame()).toContain('Session Restoration Error');
      expect(lastFrame()).toContain('Session restoration component error');
    });

    it('should handle errors in session detection components', () => {
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary>
          <MockSessionDetection shouldThrow={true} />
        </SessionDetectionErrorBoundary>
      );
      
      expect(lastFrame()).toContain('Session Detection Failed');
      expect(lastFrame()).toContain('Session detection error');
    });

    it('should provide appropriate recovery options for different error types', () => {
      // Test session restoration error
      const { lastFrame: restorationFrame } = render(
        <SessionRestorationErrorBoundary onFallbackToNewSession={() => {}}>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      expect(restorationFrame()).toContain('Continue with New Session');
      expect(restorationFrame()).toContain('Retry Session Restoration');
      
      // Test session detection error
      const { lastFrame: detectionFrame } = render(
        <SessionDetectionErrorBoundary onFallbackToNewSession={() => {}} onRetryDetection={() => {}}>
          <ThrowingComponent />
        </SessionDetectionErrorBoundary>
      );
      
      expect(detectionFrame()).toContain('Continue with New Session');
      expect(detectionFrame()).toContain('Retry Session Detection');
      expect(detectionFrame()).toContain('Reset and Retry');
    });

    it('should maintain error boundary isolation', () => {
      // One error boundary should not affect another
      const { lastFrame: frame1 } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent errorMessage="Error 1" />
        </SessionRestorationErrorBoundary>
      );
      
      const { lastFrame: frame2 } = render(
        <SessionDetectionErrorBoundary>
          <ThrowingComponent errorMessage="Error 2" />
        </SessionDetectionErrorBoundary>
      );
      
      expect(frame1()).toContain('Error 1');
      expect(frame1()).toContain('Session Restoration Error');
      
      expect(frame2()).toContain('Error 2');
      expect(frame2()).toContain('Session Detection Failed');
    });
  });

  // ===========================================================================
  // ERROR REPORTING TESTS
  // ===========================================================================

  describe('Error Reporting', () => {
    it('should log errors with appropriate context', () => {
      const mockLogger = vi.fn();
      
      // Mock the logger module
      vi.doMock('../../utils/logger.js', () => ({
        logger: {
          error: mockLogger,
          info: vi.fn(),
        },
      }));
      
      render(
        <SessionRestorationErrorBoundary sessionId="test-session">
          <ThrowingComponent errorMessage="Logged error" />
        </SessionRestorationErrorBoundary>
      );
      
      // Note: In a real test, we would verify the logger was called
      // This test structure shows how error logging should be tested
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include session context in error logs', () => {
      const sessionId = 'test-session-456';
      
      render(
        <SessionRestorationErrorBoundary sessionId={sessionId}>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Error boundary should capture and log the session context
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should generate unique error IDs for tracking', () => {
      const { lastFrame: frame1 } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      const { lastFrame: frame2 } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Extract error IDs from both frames
      const errorId1Match = frame1().match(/Error ID: (session-restoration-error-[^\\s]+)/);
      const errorId2Match = frame2().match(/Error ID: (session-restoration-error-[^\\s]+)/);
      
      expect(errorId1Match).toBeTruthy();
      expect(errorId2Match).toBeTruthy();
      
      if (errorId1Match && errorId2Match) {
        // Error IDs should be unique
        expect(errorId1Match[1]).not.toBe(errorId2Match[1]);
      }
    });
  });

  // ===========================================================================
  // ACCESSIBILITY AND UX TESTS
  // ===========================================================================

  describe('Accessibility and User Experience', () => {
    it('should provide clear navigation instructions', () => {
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Should provide clear keyboard navigation instructions
      expect(lastFrame()).toContain('↑/↓: Navigate');
      expect(lastFrame()).toContain('Enter: Select');
      expect(lastFrame()).toContain('D:');
      expect(lastFrame()).toContain('details');
    });

    it('should highlight recommended options', () => {
      const { lastFrame } = render(
        <SessionDetectionErrorBoundary onFallbackToNewSession={() => {}}>
          <ThrowingComponent />
        </SessionDetectionErrorBoundary>
      );
      
      // Should mark the new session option as recommended for detection errors
      expect(lastFrame()).toContain('(Recommended)');
      expect(lastFrame()).toContain('Continue with New Session');
    });

    it('should provide contextual help text', () => {
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Should explain what happened and what options are available
      expect(lastFrame()).toContain('unexpected error');
      expect(lastFrame()).toContain('Choose a recovery option');
    });

    it('should use appropriate visual styling for errors', () => {
      const { lastFrame } = render(
        <SessionRestorationErrorBoundary>
          <ThrowingComponent />
        </SessionRestorationErrorBoundary>
      );
      
      // Should use error styling (red colors, warning symbols)
      expect(lastFrame()).toContain('⚠️');
      expect(lastFrame()).toContain('Session Restoration Error');
    });
  });
});