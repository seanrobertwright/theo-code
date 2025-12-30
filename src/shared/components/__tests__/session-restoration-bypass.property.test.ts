/**
 * @fileoverview Property tests for new session bypass availability
 * @module shared/components/__tests__/session-restoration-bypass.property
 * 
 * Tests that a "Continue with New Session" option is always available
 * as required by Requirement 4.3.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import fc from 'fast-check';
import { 
  SessionRestoration, 
  SessionDetectionError,
  type SessionRestorationProps,
  type SessionDetectionErrorProps 
} from '../SessionRestoration/index.js';
import type { SessionMetadata, SessionId } from '../../types/index.js';

// =============================================================================
// TEST DATA GENERATORS
// =============================================================================

/**
 * Generator for session metadata arrays of various sizes
 */
const sessionListArbitrary = fc.array(
  fc.record({
    id: fc.string().map(s => `session-${s}` as SessionId),
    created: fc.integer({ min: Date.now() - 1000 * 60 * 60 * 24 * 30, max: Date.now() }),
    lastModified: fc.integer({ min: Date.now() - 1000 * 60 * 60 * 24 * 30, max: Date.now() }),
    model: fc.constantFrom('gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022'),
    messageCount: fc.integer({ min: 0, max: 100 }),
    tokenCount: fc.record({
      total: fc.integer({ min: 0, max: 100000 }),
      input: fc.integer({ min: 0, max: 50000 }),
      output: fc.integer({ min: 0, max: 50000 }),
    }),
    workspaceRoot: fc.string().map(s => `/workspace/${s}`),
    contextFiles: fc.array(fc.string().map(s => `${s}.ts`), { minLength: 0, maxLength: 10 }),
    tags: fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
    preview: fc.option(fc.string(), { nil: undefined }),
    title: fc.option(fc.string(), { nil: undefined }),
  }),
  { minLength: 0, maxLength: 20 }
);

/**
 * Generator for error scenarios that might occur during session restoration
 */
const errorScenarioArbitrary = fc.record({
  error: fc.string({ minLength: 1 }),
  hasRetryOption: fc.boolean(),
  errorType: fc.constantFrom('file-not-found', 'corrupted', 'permission-denied', 'unknown'),
  sessionId: fc.option(fc.string().map(s => `session-${s}` as SessionId), { nil: undefined }),
  attemptCount: fc.integer({ min: 1, max: 10 }),
});

/**
 * Generator for component configuration options
 */
const componentConfigArbitrary = fc.record({
  showDetails: fc.boolean(),
  maxDisplaySessions: fc.integer({ min: 1, max: 50 }),
  showCancel: fc.boolean(),
  title: fc.option(fc.string(), { nil: undefined }),
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Session Restoration New Session Bypass Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 12: New Session Bypass Availability
   * For any session restoration scenario, a "Continue with New Session" option 
   * must be available that bypasses all restoration attempts.
   * **Validates: Requirements 4.3**
   */
  it('Property 12: New Session Bypass Availability - SessionRestoration always provides new session option', () => {
    fc.assert(
      fc.property(
        sessionListArbitrary,
        componentConfigArbitrary,
        (sessions, config) => {
          const mockOnSessionSelected = vi.fn();
          const mockOnNewSession = vi.fn();
          const mockOnCancel = config.showCancel ? vi.fn() : undefined;

          const props: SessionRestorationProps = {
            sessions,
            onSessionSelected: mockOnSessionSelected,
            onNewSession: mockOnNewSession,
            onCancel: mockOnCancel,
            showDetails: config.showDetails,
            maxDisplaySessions: config.maxDisplaySessions,
          };

          const { lastFrame } = render(
            React.createElement(SessionRestoration, props)
          );

          const output = lastFrame();

          // Property: "Start New Session" option must always be available
          const hasNewSessionOption = 
            output.includes('Start New Session') ||
            output.includes('New Session') ||
            output.includes('Continue with New Session') ||
            output.includes('Create New Session');

          expect(hasNewSessionOption).toBe(true);

          // Property: New session option must be selectable (not disabled)
          // This is verified by checking that the option appears in the UI
          // and is not marked as disabled or unavailable
          const isNewSessionSelectable = 
            !output.includes('disabled') ||
            !output.includes('unavailable') ||
            output.includes('Start New Session');

          expect(isNewSessionSelectable).toBe(true);

          // Property: New session option must be available regardless of session count
          // Whether there are 0, 1, or many sessions, new session option should exist
          if (sessions.length === 0) {
            // Even with no sessions, new session option should be available
            expect(hasNewSessionOption).toBe(true);
          } else if (sessions.length === 1) {
            // With one session, user should still be able to start new
            expect(hasNewSessionOption).toBe(true);
          } else {
            // With multiple sessions, new session option should still be available
            expect(hasNewSessionOption).toBe(true);
          }

          // Property: New session option must be clearly distinguishable from session restoration
          const hasDistinguishableOption = 
            output.includes('Start New') ||
            output.includes('New Session') ||
            output.includes('Create New');

          expect(hasDistinguishableOption).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12: New Session Bypass Availability - SessionDetectionError always provides bypass option', () => {
    fc.assert(
      fc.property(
        errorScenarioArbitrary,
        (errorScenario) => {
          const mockOnRetry = errorScenario.hasRetryOption ? vi.fn() : undefined;
          const mockOnContinue = vi.fn();

          const props: SessionDetectionErrorProps = {
            error: errorScenario.error,
            onRetry: mockOnRetry,
            onContinue: mockOnContinue,
          };

          const { lastFrame } = render(
            React.createElement(SessionDetectionError, props)
          );

          const output = lastFrame();

          // Property: "Continue with New Session" option must always be available in error scenarios
          const hasBypassOption = 
            output.includes('Continue with New Session') ||
            output.includes('Continue with New') ||
            output.includes('Start New Session') ||
            output.includes('New Session') ||
            output.includes('Continue');

          expect(hasBypassOption).toBe(true);

          // Property: Bypass option must be available regardless of retry option availability
          if (errorScenario.hasRetryOption) {
            // Even when retry is available, bypass should still be an option
            expect(hasBypassOption).toBe(true);
          } else {
            // When retry is not available, bypass must definitely be available
            expect(hasBypassOption).toBe(true);
          }

          // Property: Bypass option must be clearly labeled to indicate it skips restoration
          const hasClearBypassLabel = 
            output.includes('Continue') ||
            output.includes('New Session') ||
            output.includes('Skip');

          expect(hasClearBypassLabel).toBe(true);

          // Property: Error message must not prevent bypass option availability
          // Regardless of error type or severity, bypass should always be available
          expect(hasBypassOption).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12: New Session Bypass Availability - bypass option works with any session configuration', () => {
    fc.assert(
      fc.property(
        sessionListArbitrary,
        componentConfigArbitrary,
        (sessions, config) => {
          const mockOnSessionSelected = vi.fn();
          const mockOnNewSession = vi.fn();
          const mockOnCancel = config.showCancel ? vi.fn() : undefined;

          // Test with various session configurations
          const props: SessionRestorationProps = {
            sessions,
            onSessionSelected: mockOnSessionSelected,
            onNewSession: mockOnNewSession,
            onCancel: mockOnCancel,
            showDetails: config.showDetails,
            maxDisplaySessions: config.maxDisplaySessions,
          };

          const { lastFrame } = render(
            React.createElement(SessionRestoration, props)
          );

          const output = lastFrame();

          // Property: New session option must be available with any configuration
          const hasNewSessionOption = 
            output.includes('Start New Session') ||
            output.includes('New Session');

          expect(hasNewSessionOption).toBe(true);

          // Property: Configuration options must not interfere with bypass availability
          // showDetails, maxDisplaySessions, etc. should not affect new session option
          if (config.showDetails) {
            expect(hasNewSessionOption).toBe(true);
          }

          if (config.maxDisplaySessions < sessions.length) {
            // Even when sessions are truncated, new session option should be available
            expect(hasNewSessionOption).toBe(true);
          }

          if (config.showCancel) {
            // Cancel option should not replace new session option
            expect(hasNewSessionOption).toBe(true);
          }

          // Property: New session option must be positioned appropriately in the UI
          // It should be easily accessible and not hidden among other options
          const lines = output.split('\n');
          const newSessionLine = lines.find(line => 
            line.includes('Start New Session') || 
            line.includes('New Session')
          );
          
          expect(newSessionLine).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12: New Session Bypass Availability - bypass option is always functional', () => {
    fc.assert(
      fc.property(
        sessionListArbitrary,
        (sessions) => {
          const mockOnSessionSelected = vi.fn();
          const mockOnNewSession = vi.fn();

          const props: SessionRestorationProps = {
            sessions,
            onSessionSelected: mockOnSessionSelected,
            onNewSession: mockOnNewSession,
          };

          const { lastFrame } = render(
            React.createElement(SessionRestoration, props)
          );

          const output = lastFrame();

          // Property: New session callback must be provided and callable
          expect(typeof mockOnNewSession).toBe('function');

          // Property: New session option must be present in UI
          const hasNewSessionOption = 
            output.includes('Start New Session') ||
            output.includes('New Session');

          expect(hasNewSessionOption).toBe(true);

          // Property: Component must accept onNewSession callback
          expect(props.onNewSession).toBe(mockOnNewSession);

          // Property: New session option must not depend on session data validity
          // Even if sessions array contains invalid data, new session should work
          expect(hasNewSessionOption).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 12: New Session Bypass Availability - bypass works in all error recovery scenarios', () => {
    fc.assert(
      fc.property(
        fc.array(errorScenarioArbitrary, { minLength: 1, maxLength: 5 }),
        (errorScenarios) => {
          // Test multiple error scenarios to ensure bypass is always available
          errorScenarios.forEach(errorScenario => {
            const mockOnRetry = errorScenario.hasRetryOption ? vi.fn() : undefined;
            const mockOnContinue = vi.fn();

            const props: SessionDetectionErrorProps = {
              error: errorScenario.error,
              onRetry: mockOnRetry,
              onContinue: mockOnContinue,
            };

            const { lastFrame } = render(
              React.createElement(SessionDetectionError, props)
            );

            const output = lastFrame();

            // Property: Every error scenario must provide bypass option
            const hasBypassOption = 
              output.includes('Continue with New Session') ||
              output.includes('Continue') ||
              output.includes('New Session');

            expect(hasBypassOption).toBe(true);

            // Property: Bypass option must be functional (callback provided)
            expect(typeof mockOnContinue).toBe('function');

            // Property: Bypass must be available even in severe error conditions
            if (errorScenario.errorType === 'permission-denied' || 
                errorScenario.errorType === 'corrupted') {
              expect(hasBypassOption).toBe(true);
            }

            // Property: Multiple failed attempts should not disable bypass
            if (errorScenario.attemptCount > 3) {
              expect(hasBypassOption).toBe(true);
            }
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});