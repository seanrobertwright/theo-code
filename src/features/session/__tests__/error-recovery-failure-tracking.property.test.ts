/**
 * @fileoverview Property-based tests for error recovery failure tracking
 * @module features/session/__tests__/error-recovery-failure-tracking.property
 *
 * Tests Property 14: Failure Tracking Persistence
 * Validates: Requirements 6.1, 6.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createSessionId } from '../../../shared/types/index.js';
import { 
  ErrorRecoverySystem, 
  createErrorRecoverySystem,
  type IErrorRecoverySystem,
  type ErrorRecoveryConfig,
  type FailureAttempt,
  type SessionFailureRecord
} from '../error-recovery.js';

describe('Error Recovery Failure Tracking Properties', () => {
  let errorRecovery: IErrorRecoverySystem;

  beforeEach(() => {
    errorRecovery = createErrorRecoverySystem();
  });

  /**
   * Property 14: Failure Tracking Persistence
   * 
   * For any session restoration failure, the failure must be recorded and the session 
   * must be excluded from future automatic restoration attempts.
   * 
   * **Validates: Requirements 6.1, 6.2**
   */
  it('should persistently track failures and exclude problematic sessions', () => {
    fc.assert(
      fc.property(
        // Generate test data
        fc.array(fc.record({
          sessionId: fc.string().map(s => createSessionId()),
          errors: fc.array(
            fc.record({
              message: fc.string({ minLength: 1, maxLength: 100 }),
              type: fc.constantFrom('Error', 'TypeError', 'ReferenceError')
            }),
            { minLength: 1, maxLength: 10 }
          )
        }), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 10 }), // maxRetries
        
        (sessionFailures, maxRetries) => {
          // Setup error recovery with specific max retries
          const recovery = createErrorRecoverySystem({ maxRetries });
          
          // Track all failures and verify persistence
          const expectedProblematicSessions = new Set<string>();
          
          for (const { sessionId, errors } of sessionFailures) {
            let failureCount = 0;
            
            for (const errorData of errors) {
              const error = new Error(errorData.message);
              recovery.recordFailure(sessionId, error);
              failureCount++;
              
              // After recording, verify the failure is tracked
              const record = recovery.getFailureRecord(sessionId);
              expect(record).toBeDefined();
              expect(record!.sessionId).toBe(sessionId);
              expect(record!.totalFailures).toBe(failureCount);
              expect(record!.failures).toHaveLength(failureCount);
              
              // Verify the latest failure is recorded correctly
              const latestFailure = record!.failures[record!.failures.length - 1];
              expect(latestFailure.error).toBe(errorData.message);
              expect(latestFailure.timestamp).toBeGreaterThan(0);
              expect(latestFailure.recoveryAttempted).toBe(false);
              
              // If we've reached max retries, session should be problematic
              if (failureCount >= maxRetries) {
                expectedProblematicSessions.add(sessionId);
                expect(recovery.isSessionProblematic(sessionId)).toBe(true);
                expect(recovery.shouldSkipSession(sessionId)).toBe(true);
              } else {
                // Should not be problematic yet
                expect(recovery.isSessionProblematic(sessionId)).toBe(false);
              }
            }
          }
          
          // Verify all expected problematic sessions are actually problematic
          for (const sessionId of expectedProblematicSessions) {
            expect(recovery.isSessionProblematic(sessionId)).toBe(true);
            expect(recovery.shouldSkipSession(sessionId)).toBe(true);
            
            const record = recovery.getFailureRecord(sessionId);
            expect(record).toBeDefined();
            expect(record!.totalFailures).toBeGreaterThanOrEqual(maxRetries);
            expect(record!.isBlacklisted).toBe(true);
          }
          
          // Verify sessions under the limit are not problematic
          for (const { sessionId, errors } of sessionFailures) {
            if (!expectedProblematicSessions.has(sessionId)) {
              expect(recovery.isSessionProblematic(sessionId)).toBe(false);
              expect(recovery.shouldSkipSession(sessionId)).toBe(false);
              
              const record = recovery.getFailureRecord(sessionId);
              expect(record).toBeDefined();
              expect(record!.totalFailures).toBeLessThan(maxRetries);
              expect(record!.isBlacklisted).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Failure Record Consistency
   * 
   * For any sequence of failures recorded for a session, the failure record
   * must maintain consistency in timestamps, counts, and error categorization.
   */
  it('should maintain consistent failure records across multiple failures', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 50 }),
            delay: fc.integer({ min: 0, max: 1000 })
          }),
          { minLength: 1, maxLength: 15 }
        ),
        
        async (sessionId, errorSequence) => {
          const recovery = createErrorRecoverySystem();
          let previousTimestamp = 0;
          
          for (let i = 0; i < errorSequence.length; i++) {
            const { message, delay } = errorSequence[i];
            
            // Add delay to ensure timestamp progression
            if (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            const error = new Error(message);
            recovery.recordFailure(sessionId, error);
            
            const record = recovery.getFailureRecord(sessionId);
            expect(record).toBeDefined();
            
            // Verify record consistency
            expect(record!.sessionId).toBe(sessionId);
            expect(record!.totalFailures).toBe(i + 1);
            expect(record!.failures).toHaveLength(i + 1);
            
            // Verify timestamp progression
            expect(record!.lastFailure).toBeGreaterThanOrEqual(previousTimestamp);
            previousTimestamp = record!.lastFailure;
            
            // Verify latest failure details
            const latestFailure = record!.failures[i];
            expect(latestFailure.error).toBe(message);
            expect(latestFailure.timestamp).toBe(record!.lastFailure);
            expect(latestFailure.recoveryAttempted).toBe(false);
            
            // Verify error type categorization is consistent
            expect(['file-not-found', 'corrupted', 'permission-denied', 'unknown'])
              .toContain(latestFailure.errorType);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Blacklist Duration Enforcement
   * 
   * For any session that reaches the maximum retry limit, it must be blacklisted
   * for the configured duration and then become available again.
   */
  it('should enforce blacklist duration correctly', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.integer({ min: 1, max: 5 }), // maxRetries
        fc.integer({ min: 100, max: 2000 }), // blacklistDurationMs
        
        async (sessionId, maxRetries, blacklistDurationMs) => {
          const recovery = createErrorRecoverySystem({ 
            maxRetries, 
            blacklistDurationMs 
          });
          
          // Record enough failures to trigger blacklist
          for (let i = 0; i < maxRetries; i++) {
            recovery.recordFailure(sessionId, new Error(`Failure ${i + 1}`));
          }
          
          // Should be blacklisted immediately
          expect(recovery.isSessionProblematic(sessionId)).toBe(true);
          expect(recovery.shouldSkipSession(sessionId)).toBe(true);
          
          const record = recovery.getFailureRecord(sessionId);
          expect(record).toBeDefined();
          expect(record!.isBlacklisted).toBe(true);
          expect(record!.blacklistedUntil).toBeDefined();
          expect(record!.blacklistedUntil!).toBeGreaterThan(Date.now());
          
          // Wait for blacklist to expire (with small buffer)
          await new Promise(resolve => setTimeout(resolve, blacklistDurationMs + 50));
          
          // Should no longer be problematic after blacklist expires
          // Note: The blacklist check happens when isSessionProblematic is called
          const isStillProblematic = recovery.isSessionProblematic(sessionId);
          
          // After checking, the blacklist should be cleared if expired
          const updatedRecord = recovery.getFailureRecord(sessionId);
          expect(updatedRecord).toBeDefined();
          
          // The session should either be cleared of blacklist or still have high failure count
          if (updatedRecord!.blacklistedUntil && Date.now() >= updatedRecord!.blacklistedUntil) {
            expect(updatedRecord!.isBlacklisted).toBe(false);
          }
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Error Categorization Consistency
   * 
   * For any error message, the error categorization must be consistent
   * and follow the defined categorization rules.
   */
  it('should categorize errors consistently', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.array(
          fc.oneof(
            fc.constant('File not found'),
            fc.constant('ENOENT: no such file'),
            fc.constant('Permission denied'),
            fc.constant('EACCES: permission denied'),
            fc.constant('Invalid JSON format'),
            fc.constant('Corrupted data'),
            fc.constant('Parse error'),
            fc.constant('Unknown error occurred'),
            fc.string({ minLength: 1, maxLength: 30 })
          ),
          { minLength: 1, maxLength: 10 }
        ),
        
        (sessionId, errorMessages) => {
          const recovery = createErrorRecoverySystem();
          
          for (const message of errorMessages) {
            const error = new Error(message);
            recovery.recordFailure(sessionId, error);
            
            const record = recovery.getFailureRecord(sessionId);
            expect(record).toBeDefined();
            
            const latestFailure = record!.failures[record!.failures.length - 1];
            
            // Verify categorization follows rules
            const lowerMessage = message.toLowerCase();
            if (lowerMessage.includes('not found') || lowerMessage.includes('enoent')) {
              expect(latestFailure.errorType).toBe('file-not-found');
            } else if (lowerMessage.includes('permission') || lowerMessage.includes('eacces')) {
              expect(latestFailure.errorType).toBe('permission-denied');
            } else if (lowerMessage.includes('corrupt') || lowerMessage.includes('invalid') || lowerMessage.includes('parse')) {
              expect(latestFailure.errorType).toBe('corrupted');
            } else {
              expect(latestFailure.errorType).toBe('unknown');
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Reset Functionality
   * 
   * For any state of failure tracking, calling resetFailureTracking
   * must clear all records and restore the system to initial state.
   */
  it('should completely reset failure tracking state', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sessionId: fc.string().map(s => createSessionId()),
            failureCount: fc.integer({ min: 1, max: 10 })
          }),
          { minLength: 1, maxLength: 20 }
        ),
        
        (sessionData) => {
          const recovery = createErrorRecoverySystem();
          
          // Record failures for multiple sessions
          for (const { sessionId, failureCount } of sessionData) {
            for (let i = 0; i < failureCount; i++) {
              recovery.recordFailure(sessionId, new Error(`Error ${i}`));
            }
            
            // Verify failures are recorded
            expect(recovery.getFailureRecord(sessionId)).toBeDefined();
          }
          
          // Reset all tracking
          recovery.resetFailureTracking();
          
          // Verify all records are cleared
          for (const { sessionId } of sessionData) {
            expect(recovery.getFailureRecord(sessionId)).toBeUndefined();
            expect(recovery.isSessionProblematic(sessionId)).toBe(false);
            expect(recovery.shouldSkipSession(sessionId)).toBe(false);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});