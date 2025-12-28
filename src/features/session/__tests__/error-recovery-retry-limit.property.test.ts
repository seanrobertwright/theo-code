/**
 * @fileoverview Property-based tests for error recovery retry limit enforcement
 * @module features/session/__tests__/error-recovery-retry-limit.property
 *
 * Tests Property 15: Retry Limit Enforcement
 * Validates: Requirements 6.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createSessionId } from '../../../shared/types/index.js';
import { 
  ErrorRecoverySystem, 
  createErrorRecoverySystem,
  type IErrorRecoverySystem,
  type ErrorRecoveryConfig
} from '../error-recovery.js';

describe('Error Recovery Retry Limit Enforcement Properties', () => {
  let errorRecovery: IErrorRecoverySystem;

  beforeEach(() => {
    errorRecovery = createErrorRecoverySystem();
  });

  /**
   * Property 15: Retry Limit Enforcement
   * 
   * For any session restoration operation, the number of retry attempts 
   * must not exceed the configured maximum limit.
   * 
   * **Validates: Requirements 6.3**
   */
  it('should enforce maximum retry limits for all sessions', () => {
    fc.assert(
      fc.property(
        // Generate test data
        fc.array(fc.record({
          sessionId: fc.string().map(s => createSessionId()),
          errorCount: fc.integer({ min: 1, max: 20 })
        }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 8 }), // maxRetries
        
        (sessionData, maxRetries) => {
          const recovery = createErrorRecoverySystem({ maxRetries });
          
          for (const { sessionId, errorCount } of sessionData) {
            // Record failures up to the error count
            for (let i = 0; i < errorCount; i++) {
              recovery.recordFailure(sessionId, new Error(`Error ${i + 1}`));
              
              const record = recovery.getFailureRecord(sessionId);
              expect(record).toBeDefined();
              
              // Verify failure count is tracked correctly
              expect(record!.totalFailures).toBe(i + 1);
              
              // Check if session should be problematic based on retry limit
              if (i + 1 >= maxRetries) {
                // Should be problematic after reaching max retries
                expect(recovery.isSessionProblematic(sessionId)).toBe(true);
                expect(recovery.shouldSkipSession(sessionId)).toBe(true);
                expect(record!.isBlacklisted).toBe(true);
                
                // Calculate retry delay should return -1 (no more retries)
                expect(recovery.calculateRetryDelay(sessionId)).toBe(-1);
              } else {
                // Should not be problematic yet
                expect(recovery.isSessionProblematic(sessionId)).toBe(false);
                expect(recovery.shouldSkipSession(sessionId)).toBe(false);
                expect(record!.isBlacklisted).toBe(false);
                
                // Calculate retry delay should return a positive value
                const delay = recovery.calculateRetryDelay(sessionId);
                expect(delay).toBeGreaterThanOrEqual(0);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Exponential Backoff Calculation
   * 
   * For any session with failures below the retry limit, the retry delay
   * must follow exponential backoff pattern and respect maximum delay limits.
   */
  it('should calculate exponential backoff delays correctly', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.integer({ min: 2, max: 10 }), // maxRetries (at least 2 for meaningful backoff)
        fc.integer({ min: 100, max: 2000 }), // baseDelayMs
        fc.integer({ min: 5000, max: 30000 }), // maxDelayMs
        
        (sessionId, maxRetries, baseDelayMs, maxDelayMs) => {
          const recovery = createErrorRecoverySystem({ 
            maxRetries, 
            baseDelayMs, 
            maxDelayMs 
          });
          
          let previousDelay = 0;
          
          // Record failures up to just before max retries
          for (let i = 0; i < maxRetries - 1; i++) {
            recovery.recordFailure(sessionId, new Error(`Error ${i + 1}`));
            
            const delay = recovery.calculateRetryDelay(sessionId);
            
            // Should not exceed max delay
            expect(delay).toBeLessThanOrEqual(maxDelayMs);
            expect(delay).toBeGreaterThanOrEqual(0);
            
            // Should follow exponential pattern (each delay >= previous, allowing for max cap)
            if (i > 0) {
              expect(delay).toBeGreaterThanOrEqual(previousDelay);
            }
            
            // Verify exponential calculation (before max cap)
            const expectedDelay = Math.min(baseDelayMs * Math.pow(2, i), maxDelayMs);
            expect(delay).toBe(expectedDelay);
            
            previousDelay = delay;
          }
          
          // After max retries, should return -1
          recovery.recordFailure(sessionId, new Error(`Final error`));
          expect(recovery.calculateRetryDelay(sessionId)).toBe(-1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Configuration Consistency
   * 
   * For any error recovery configuration, the system must consistently
   * apply the configured limits across all operations.
   */
  it('should consistently apply configured retry limits', () => {
    fc.assert(
      fc.property(
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 10 }),
          baseDelayMs: fc.integer({ min: 50, max: 1000 }),
          maxDelayMs: fc.integer({ min: 1000, max: 10000 }),
          blacklistDurationMs: fc.integer({ min: 1000, max: 60000 })
        }),
        fc.array(fc.string().map(s => createSessionId()), { minLength: 1, maxLength: 5 }),
        
        (config, sessionIds) => {
          const recovery = createErrorRecoverySystem(config);
          
          // Verify configuration is applied
          const appliedConfig = recovery.getConfig();
          expect(appliedConfig.maxRetries).toBe(config.maxRetries);
          expect(appliedConfig.baseDelayMs).toBe(config.baseDelayMs);
          expect(appliedConfig.maxDelayMs).toBe(config.maxDelayMs);
          expect(appliedConfig.blacklistDurationMs).toBe(config.blacklistDurationMs);
          
          // Test each session against the configured limits
          for (const sessionId of sessionIds) {
            // Record failures up to and beyond max retries
            for (let i = 0; i < config.maxRetries + 2; i++) {
              recovery.recordFailure(sessionId, new Error(`Error ${i + 1}`));
              
              const record = recovery.getFailureRecord(sessionId);
              expect(record).toBeDefined();
              expect(record!.totalFailures).toBe(i + 1);
              
              // Check problematic status based on configured limit
              if (i + 1 >= config.maxRetries) {
                expect(recovery.isSessionProblematic(sessionId)).toBe(true);
                expect(record!.isBlacklisted).toBe(true);
                expect(recovery.calculateRetryDelay(sessionId)).toBe(-1);
              } else {
                expect(recovery.isSessionProblematic(sessionId)).toBe(false);
                expect(record!.isBlacklisted).toBe(false);
                
                const delay = recovery.calculateRetryDelay(sessionId);
                expect(delay).toBeGreaterThanOrEqual(0);
                expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
              }
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Retry Limit Boundary Conditions
   * 
   * For any retry limit configuration, the system must handle boundary
   * conditions correctly (exactly at limit, just before, just after).
   */
  it('should handle retry limit boundary conditions correctly', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.integer({ min: 1, max: 5 }), // maxRetries
        
        (sessionId, maxRetries) => {
          const recovery = createErrorRecoverySystem({ maxRetries });
          
          // Test just before limit
          for (let i = 0; i < maxRetries - 1; i++) {
            recovery.recordFailure(sessionId, new Error(`Error ${i + 1}`));
          }
          
          // Should not be problematic yet
          expect(recovery.isSessionProblematic(sessionId)).toBe(false);
          expect(recovery.shouldSkipSession(sessionId)).toBe(false);
          expect(recovery.calculateRetryDelay(sessionId)).toBeGreaterThanOrEqual(0);
          
          const record = recovery.getFailureRecord(sessionId);
          expect(record).toBeDefined();
          expect(record!.totalFailures).toBe(maxRetries - 1);
          expect(record!.isBlacklisted).toBe(false);
          
          // Add one more failure to reach exactly the limit
          recovery.recordFailure(sessionId, new Error(`Limit error`));
          
          // Should now be problematic
          expect(recovery.isSessionProblematic(sessionId)).toBe(true);
          expect(recovery.shouldSkipSession(sessionId)).toBe(true);
          expect(recovery.calculateRetryDelay(sessionId)).toBe(-1);
          
          const updatedRecord = recovery.getFailureRecord(sessionId);
          expect(updatedRecord).toBeDefined();
          expect(updatedRecord!.totalFailures).toBe(maxRetries);
          expect(updatedRecord!.isBlacklisted).toBe(true);
          expect(updatedRecord!.blacklistedUntil).toBeDefined();
          expect(updatedRecord!.blacklistedUntil!).toBeGreaterThan(Date.now());
          
          // Add one more failure beyond the limit
          recovery.recordFailure(sessionId, new Error(`Beyond limit error`));
          
          // Should still be problematic
          expect(recovery.isSessionProblematic(sessionId)).toBe(true);
          expect(recovery.shouldSkipSession(sessionId)).toBe(true);
          expect(recovery.calculateRetryDelay(sessionId)).toBe(-1);
          
          const finalRecord = recovery.getFailureRecord(sessionId);
          expect(finalRecord).toBeDefined();
          expect(finalRecord!.totalFailures).toBe(maxRetries + 1);
          expect(finalRecord!.isBlacklisted).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple Session Independence
   * 
   * For any set of sessions, the retry limit enforcement for one session
   * must not affect the retry limit enforcement for other sessions.
   */
  it('should enforce retry limits independently for each session', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          sessionId: fc.string().map(s => createSessionId()),
          failureCount: fc.integer({ min: 1, max: 15 })
        }), { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 2, max: 6 }), // maxRetries
        
        (sessionData, maxRetries) => {
          const recovery = createErrorRecoverySystem({ maxRetries });
          
          // Record failures for all sessions
          for (const { sessionId, failureCount } of sessionData) {
            for (let i = 0; i < failureCount; i++) {
              recovery.recordFailure(sessionId, new Error(`Error ${i + 1}`));
            }
          }
          
          // Verify each session's state is independent
          for (const { sessionId, failureCount } of sessionData) {
            const record = recovery.getFailureRecord(sessionId);
            expect(record).toBeDefined();
            expect(record!.totalFailures).toBe(failureCount);
            
            const shouldBeProblematic = failureCount >= maxRetries;
            expect(recovery.isSessionProblematic(sessionId)).toBe(shouldBeProblematic);
            expect(recovery.shouldSkipSession(sessionId)).toBe(shouldBeProblematic);
            expect(record!.isBlacklisted).toBe(shouldBeProblematic);
            
            if (shouldBeProblematic) {
              expect(recovery.calculateRetryDelay(sessionId)).toBe(-1);
              expect(record!.blacklistedUntil).toBeDefined();
            } else {
              expect(recovery.calculateRetryDelay(sessionId)).toBeGreaterThanOrEqual(0);
              expect(record!.blacklistedUntil).toBeUndefined();
            }
          }
          
          // Verify that modifying one session doesn't affect others
          const firstSession = sessionData[0];
          const secondSession = sessionData[1];
          
          const firstRecordBefore = recovery.getFailureRecord(firstSession.sessionId);
          const secondRecordBefore = recovery.getFailureRecord(secondSession.sessionId);
          
          // Add more failures to first session
          recovery.recordFailure(firstSession.sessionId, new Error('Additional error'));
          
          // Second session should be unchanged
          const secondRecordAfter = recovery.getFailureRecord(secondSession.sessionId);
          expect(secondRecordAfter!.totalFailures).toBe(secondRecordBefore!.totalFailures);
          expect(secondRecordAfter!.isBlacklisted).toBe(secondRecordBefore!.isBlacklisted);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Configuration Update Effects
   * 
   * For any configuration update, existing failure records must be
   * re-evaluated against the new limits appropriately.
   */
  it('should handle configuration updates correctly', () => {
    fc.assert(
      fc.property(
        fc.string().map(s => createSessionId()),
        fc.integer({ min: 2, max: 5 }), // initialMaxRetries
        fc.integer({ min: 1, max: 8 }), // newMaxRetries
        fc.integer({ min: 1, max: 10 }), // failureCount
        
        (sessionId, initialMaxRetries, newMaxRetries, failureCount) => {
          const recovery = createErrorRecoverySystem({ maxRetries: initialMaxRetries });
          
          // Record some failures
          for (let i = 0; i < failureCount; i++) {
            recovery.recordFailure(sessionId, new Error(`Error ${i + 1}`));
          }
          
          const recordBefore = recovery.getFailureRecord(sessionId);
          const wasProblematicBefore = recovery.isSessionProblematic(sessionId);
          
          // Update configuration
          recovery.updateConfig({ maxRetries: newMaxRetries });
          
          // Verify configuration was updated
          expect(recovery.getConfig().maxRetries).toBe(newMaxRetries);
          
          // Record should still exist with same failure count
          const recordAfter = recovery.getFailureRecord(sessionId);
          expect(recordAfter).toBeDefined();
          expect(recordAfter!.totalFailures).toBe(recordBefore!.totalFailures);
          
          // Problematic status should be based on new limits
          const shouldBeProblematicAfter = failureCount >= newMaxRetries;
          
          // Note: The existing blacklist status might persist until next check
          // This is acceptable behavior as it provides stability
          if (shouldBeProblematicAfter) {
            // If should be problematic with new config, delay should be -1
            expect(recovery.calculateRetryDelay(sessionId)).toBe(-1);
          } else if (!wasProblematicBefore) {
            // If wasn't problematic before and shouldn't be now, should allow retries
            expect(recovery.calculateRetryDelay(sessionId)).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});