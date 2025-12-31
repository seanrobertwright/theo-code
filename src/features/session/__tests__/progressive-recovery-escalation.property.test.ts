/**
 * @fileoverview Property-based tests for progressive recovery escalation
 * @module features/session/__tests__/progressive-recovery-escalation.property
 *
 * Tests Property 5: Progressive Recovery Escalation
 * Validates: Requirements 2.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createSessionId } from '../../../shared/types/index.js';
import { 
  createErrorRecoverySystem,
  type IErrorRecoverySystem,
  type RecoveryContext
} from '../error-recovery.js';

describe('Progressive Recovery Escalation Properties', () => {
  let errorRecovery: IErrorRecoverySystem;

  beforeEach(() => {
    errorRecovery = createErrorRecoverySystem();
  });

  /**
   * Property 5: Progressive Recovery Escalation
   * 
   * For any sequence of multiple restoration failures, the system must eventually 
   * offer the option to skip session restoration entirely.
   * 
   * **Validates: Requirements 2.4**
   */
  it('should escalate to skip option after multiple failures', () => {
    fc.assert(
      fc.property(
        // Generate test data for multiple failure scenarios
        fc.array(fc.record({
          sessionId: fc.string().map(s => createSessionId()),
          failureCount: fc.integer({ min: 1, max: 8 })
        }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 3, max: 10 }), // totalFailureThreshold
        
        (sessionFailures, totalFailureThreshold) => {
          // Track total failures across all sessions
          let totalFailures = 0;
          
          // Record failures for each session
          for (const { sessionId, failureCount } of sessionFailures) {
            for (let i = 0; i < failureCount; i++) {
              const error = new Error(`Failure ${i + 1} for session ${sessionId}`);
              errorRecovery.recordFailure(sessionId, error);
              totalFailures++;
            }
          }
          
          // Test recovery options for a representative failed session
          const testSessionId = sessionFailures[0]?.sessionId || createSessionId();
          const testError = new Error('Test restoration failure');
          
          const context: RecoveryContext = {
            failedSessionId: testSessionId,
            attemptCount: sessionFailures[0]?.failureCount || 1,
            totalFailures,
            availableSessions: [], // Empty for this test
            lastError: testError,
          };
          
          const recoveryOptions = errorRecovery.getRecoveryOptions(context);
          
          // Property: Recovery options should always be available
          expect(recoveryOptions).toBeDefined();
          expect(recoveryOptions.length).toBeGreaterThan(0);
          
          // Property: Skip option should always be available
          const skipOption = recoveryOptions.find(option => option.type === 'skip');
          expect(skipOption).toBeDefined();
          expect(skipOption!.label).toContain('Skip');
          expect(skipOption!.description).toBeTruthy();
          expect(typeof skipOption!.action).toBe('function');
          
          // Property: New session option should always be available as ultimate fallback
          const newSessionOption = recoveryOptions.find(option => option.type === 'new-session');
          expect(newSessionOption).toBeDefined();
          expect(newSessionOption!.label).toContain('New Session');
          expect(newSessionOption!.description).toBeTruthy();
          expect(typeof newSessionOption!.action).toBe('function');
          
          // Property: Progressive escalation - skip should be recommended after many failures
          if (totalFailures >= totalFailureThreshold) {
            // Skip should be available and likely recommended
            expect(skipOption!.isRecommended || newSessionOption!.isRecommended).toBe(true);
          }
          
          // Property: New session should be recommended after significant failures
          if (totalFailures >= 3) {
            expect(newSessionOption!.isRecommended).toBe(true);
          }
          
          // Property: At least one option should always be recommended
          const recommendedOptions = recoveryOptions.filter(option => option.isRecommended);
          expect(recommendedOptions.length).toBeGreaterThan(0);
          
          // Property: All options should have valid structure
          for (const option of recoveryOptions) {
            expect(option.type).toMatch(/^(retry|skip|new-session|select-different)$/);
            expect(option.label).toBeTruthy();
            expect(option.description).toBeTruthy();
            expect(typeof option.action).toBe('function');
            expect(typeof option.isRecommended).toBe('boolean');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Recovery escalation should be context-aware
   * 
   * For any recovery context with high failure counts, more drastic recovery 
   * options should be recommended over retry attempts.
   */
  it('should recommend more drastic options as failures increase', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.integer({ min: 1, max: 15 }), // totalFailures
        fc.integer({ min: 0, max: 5 }), // attemptCount for specific session
        
        (sessionId, totalFailures, attemptCount) => {
          // Record failures to build up context
          for (let i = 0; i < Math.min(attemptCount, 10); i++) {
            errorRecovery.recordFailure(sessionId, new Error(`Failure ${i + 1}`));
          }
          
          const context: RecoveryContext = {
            failedSessionId: sessionId,
            attemptCount,
            totalFailures,
            availableSessions: [],
            lastError: new Error('Test error'),
          };
          
          const recoveryOptions = errorRecovery.getRecoveryOptions(context);
          
          // Property: Options should be available regardless of failure count
          expect(recoveryOptions.length).toBeGreaterThan(0);
          
          const retryOption = recoveryOptions.find(option => option.type === 'retry');
          const skipOption = recoveryOptions.find(option => option.type === 'skip');
          const newSessionOption = recoveryOptions.find(option => option.type === 'new-session');
          
          // Property: Retry should be less likely to be recommended as failures increase
          if (attemptCount >= 3 || totalFailures >= 5) {
            // With high failure counts, retry should not be recommended
            if (retryOption) {
              expect(retryOption.isRecommended).toBe(false);
            }
          } else if (totalFailures < 2 && attemptCount === 0) {
            // With very low failure counts, retry might be recommended
            if (retryOption) {
              // Don't enforce recommendation, just check it's available
              expect(retryOption.type).toBe('retry');
            }
          }
          
          // Property: Skip should be more likely to be recommended with high total failures
          if (totalFailures >= 5) {
            expect(skipOption).toBeDefined();
            expect(skipOption!.isRecommended).toBe(true);
          }
          
          // Property: New session should be recommended with very high failure counts
          if (totalFailures >= 3) {
            expect(newSessionOption).toBeDefined();
            expect(newSessionOption!.isRecommended).toBe(true);
          }
          
          // Property: Escalation should be progressive
          const recommendedTypes = recoveryOptions
            .filter(option => option.isRecommended)
            .map(option => option.type);
          
          // With low failures, retry might be recommended
          // With medium failures, skip or select-different might be recommended
          // With high failures, skip or new-session should be recommended
          if (totalFailures >= 5) {
            expect(recommendedTypes).toContain('skip');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Recovery options should include alternative session selection when available
   * 
   * For any recovery context with available alternative sessions, the system should 
   * offer the option to select a different session.
   */
  it('should offer alternative session selection when alternatives exist', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.array(fc.record({
          id: fc.string().map(s => createSessionId()),
          title: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          messageCount: fc.integer({ min: 0, max: 100 }),
          created: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
          lastModified: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 30 }),
          tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
          tokenCount: fc.record({
            total: fc.integer({ min: 0, max: 10000 }),
            input: fc.integer({ min: 0, max: 5000 }),
            output: fc.integer({ min: 0, max: 5000 })
          }),
          contextFiles: fc.array(fc.string({ minLength: 5, maxLength: 30 }), { maxLength: 5 })
        }), { minLength: 0, maxLength: 8 }),
        fc.integer({ min: 1, max: 5 }), // attemptCount
        
        (failedSessionId, availableSessions, attemptCount) => {
          // Record some failures for the failed session
          for (let i = 0; i < attemptCount; i++) {
            errorRecovery.recordFailure(failedSessionId, new Error(`Failure ${i + 1}`));
          }
          
          const context: RecoveryContext = {
            failedSessionId,
            attemptCount,
            totalFailures: attemptCount,
            availableSessions,
            lastError: new Error('Test error'),
          };
          
          const recoveryOptions = errorRecovery.getRecoveryOptions(context);
          
          // Property: Recovery options should always be available
          expect(recoveryOptions.length).toBeGreaterThan(0);
          
          const selectDifferentOption = recoveryOptions.find(option => option.type === 'select-different');
          
          // Property: Select different option should be available when there are alternatives
          if (availableSessions.length > 0) {
            expect(selectDifferentOption).toBeDefined();
            expect(selectDifferentOption!.label).toContain('Select Different');
            expect(selectDifferentOption!.description).toBeTruthy();
            
            // Filter out the failed session and problematic sessions
            const viableAlternatives = availableSessions.filter(session => 
              session.id !== failedSessionId && !errorRecovery.isSessionProblematic(session.id)
            );
            
            if (viableAlternatives.length > 0) {
              expect(selectDifferentOption!.description).toContain(viableAlternatives.length.toString());
            }
            
            // Property: Should be recommended after multiple failures if alternatives exist
            if (attemptCount >= 2 && viableAlternatives.length > 0) {
              expect(selectDifferentOption!.isRecommended).toBe(true);
            }
          }
          
          // Property: Select different option should always be available for consistency
          // (even with no alternatives, it should still be present)
          expect(selectDifferentOption).toBeDefined();
          if (availableSessions.length === 0) {
            expect(selectDifferentOption!.description).toContain('No alternative sessions');
          }
          
          // Property: All recovery options should have consistent structure
          for (const option of recoveryOptions) {
            expect(['retry', 'skip', 'new-session', 'select-different']).toContain(option.type);
            expect(option.label).toBeTruthy();
            expect(option.description).toBeTruthy();
            expect(typeof option.action).toBe('function');
            expect(typeof option.isRecommended).toBe('boolean');
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Recovery escalation should maintain option availability
   * 
   * For any failure scenario, essential recovery options (skip, new-session) 
   * should always be available regardless of context.
   */
  it('should always provide essential recovery options', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.integer({ min: 0, max: 20 }), // totalFailures
        fc.integer({ min: 0, max: 10 }), // attemptCount
        
        (sessionId, totalFailures, attemptCount) => {
          // Record failures to simulate various scenarios
          for (let i = 0; i < Math.min(attemptCount, 15); i++) {
            errorRecovery.recordFailure(sessionId, new Error(`Failure ${i + 1}`));
          }
          
          const context: RecoveryContext = {
            failedSessionId: sessionId,
            attemptCount,
            totalFailures,
            availableSessions: [], // Test with no alternatives
            lastError: new Error('Test error'),
          };
          
          const recoveryOptions = errorRecovery.getRecoveryOptions(context);
          
          // Property: Essential options should always be available
          const skipOption = recoveryOptions.find(option => option.type === 'skip');
          const newSessionOption = recoveryOptions.find(option => option.type === 'new-session');
          
          expect(skipOption).toBeDefined();
          expect(newSessionOption).toBeDefined();
          
          // Property: Essential options should have proper structure
          expect(skipOption!.label).toContain('Skip');
          expect(skipOption!.description).toBeTruthy();
          expect(typeof skipOption!.action).toBe('function');
          
          expect(newSessionOption!.label).toContain('New Session');
          expect(newSessionOption!.description).toBeTruthy();
          expect(typeof newSessionOption!.action).toBe('function');
          
          // Property: At least one option should be recommended
          const recommendedOptions = recoveryOptions.filter(option => option.isRecommended);
          expect(recommendedOptions.length).toBeGreaterThan(0);
          
          // Property: Options should be mutually exclusive in their actions
          const optionTypes = recoveryOptions.map(option => option.type);
          const uniqueTypes = new Set(optionTypes);
          expect(uniqueTypes.size).toBe(optionTypes.length); // No duplicate types
        }
      ),
      { numRuns: 100 }
    );
  });
});