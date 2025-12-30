/**
 * @fileoverview Property-based tests for restoration failure recovery
 * @module features/session/__tests__/restoration-failure-recovery.property.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import { ErrorRecoverySystem } from '../error-recovery.js';
import { createSessionId, type Session, type SessionId, type SessionMetadata } from '../../../shared/types/index.js';
import { atomicWriteFile } from '../filesystem.js';

// =============================================================================
// TEST SETUP
// =============================================================================

let testSessionsDir: string;
let sessionManager: SessionManager;
let sessionStorage: SessionStorage;
let errorRecovery: ErrorRecoverySystem;

// Mock the filesystem functions to use our test directory
vi.mock('../filesystem.js', async () => {
  const actual = await vi.importActual('../filesystem.js');
  return {
    ...actual,
    getSessionFilePath: (sessionId: string) => path.join(testSessionsDir, `${sessionId}.json`),
    getSessionIndexPath: () => path.join(testSessionsDir, 'index.json'),
    getSessionsDir: () => testSessionsDir,
    listSessionFiles: async () => {
      try {
        const files = await fs.readdir(testSessionsDir);
        return files
          .filter(file => file.endsWith('.json') && file !== 'index.json')
          .map(file => path.join(testSessionsDir, file));
      } catch {
        return [];
      }
    },
  };
});

beforeEach(async () => {
  // Create a temporary directory for testing
  testSessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restoration-failure-recovery-test-'));
  
  // Create storage and manager instances
  sessionStorage = new SessionStorage({
    enableCompression: false,
    enableChecksum: false,
    createBackups: false,
    maxFileSize: 10 * 1024 * 1024,
  });
  
  sessionManager = new SessionManager(sessionStorage);
  errorRecovery = new ErrorRecoverySystem();
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(testSessionsDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});

// =============================================================================
// ARBITRARIES (TEST DATA GENERATORS)
// =============================================================================

/**
 * Generator for valid session IDs
 */
const sessionIdArb = fc.uuid().map(() => createSessionId());

/**
 * Generator for valid timestamps
 */
const timestampArb = fc.integer({ min: 1000000000000, max: Date.now() + 86400000 });

/**
 * Generator for simple valid sessions
 */
const simpleSessionArb = fc.record({
  id: sessionIdArb,
  version: fc.constant('1.0.0'),
  created: timestampArb,
  lastModified: timestampArb,
  model: fc.oneof(fc.constant('gpt-4'), fc.constant('claude-3'), fc.constant('test-model')),
  provider: fc.oneof(fc.constant('openai'), fc.constant('anthropic'), fc.constant('test-provider')),
  workspaceRoot: fc.constant('/test/workspace'),
  tokenCount: fc.constant({ total: 0, input: 0, output: 0 }),
  filesAccessed: fc.constant([] as string[]),
  messages: fc.constant([] as any[]),
  contextFiles: fc.constant([] as string[]),
  title: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  tags: fc.constant([] as string[]),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  providerData: fc.constant(undefined),
}).map(session => ({
  ...session,
  lastModified: Math.max(session.created, session.lastModified),
}));

/**
 * Generator for error types that can occur during session restoration
 */
const sessionErrorArb = fc.oneof(
  fc.constant(new Error('Session file not found')),
  fc.constant(new Error('Permission denied')),
  fc.constant(new Error('Invalid session format')),
  fc.constant(new Error('Corrupted session data')),
  fc.constant(new Error('Network timeout')),
  fc.constant(new Error('Disk full'))
);

/**
 * Helper function to create session metadata from session
 */
function createSessionMetadata(session: Session): SessionMetadata {
  return {
    id: session.id,
    created: session.created,
    lastModified: session.lastModified,
    model: session.model,
    provider: session.provider,
    tokenCount: session.tokenCount,
    title: session.title,
    workspaceRoot: session.workspaceRoot,
    messageCount: session.messages.length,
    lastMessage: undefined,
    contextFiles: [...session.contextFiles],
    tags: [...session.tags],
    preview: undefined,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a session file with the given content
 */
async function createSessionFile(sessionId: SessionId, content: string): Promise<void> {
  const filePath = path.join(testSessionsDir, `${sessionId}.json`);
  await atomicWriteFile(filePath, content, { createBackup: false });
}

/**
 * Creates a valid session file
 */
async function createValidSessionFile(session: Session): Promise<void> {
  // Create the session in the versioned format that SessionStorage expects
  const versionedSession = {
    version: '1.0.0',
    compressed: false,
    checksum: undefined,
    data: session, // The session data goes in the data field
  };
  
  const content = JSON.stringify(versionedSession, null, 2);
  await createSessionFile(session.id, content);
}

/**
 * Creates a session index with the given sessions
 */
async function createSessionIndex(sessions: SessionMetadata[]): Promise<void> {
  const indexContent = {
    version: '1.0.0',
    lastUpdated: Date.now(),
    sessions: Object.fromEntries(sessions.map(session => [session.id, session]))
  };
  
  const indexPath = path.join(testSessionsDir, 'index.json');
  await atomicWriteFile(indexPath, JSON.stringify(indexContent, null, 2), { createBackup: false });
}

/**
 * Removes a session file from disk
 */
async function removeSessionFile(sessionId: SessionId): Promise<void> {
  const filePath = path.join(testSessionsDir, `${sessionId}.json`);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // File might not exist, ignore
  }
}

/**
 * Creates a corrupted session file
 */
async function createCorruptedSessionFile(sessionId: SessionId, corruptionType: 'empty' | 'invalid-json' | 'invalid-structure'): Promise<void> {
  let content: string;
  
  switch (corruptionType) {
    case 'empty':
      content = '';
      break;
    case 'invalid-json':
      content = '{"invalid": json}';
      break;
    case 'invalid-structure':
      content = '{"not": "a session"}';
      break;
    default:
      content = '';
  }
  
  await createSessionFile(sessionId, content);
}

/**
 * Simulates a session restoration failure
 */
async function simulateRestorationFailure(sessionId: SessionId, errorType: 'missing' | 'corrupted' | 'permission'): Promise<Error> {
  switch (errorType) {
    case 'missing':
      await removeSessionFile(sessionId);
      return new Error(`Session file not found: ${sessionId}`);
    case 'corrupted':
      await createCorruptedSessionFile(sessionId, 'invalid-json');
      return new Error(`Corrupted session data: ${sessionId}`);
    case 'permission':
      return new Error(`Permission denied: ${sessionId}`);
    default:
      return new Error(`Unknown error: ${sessionId}`);
  }
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Restoration Failure Recovery Property Tests', () => {
  describe('Property 4: Restoration Failure Recovery', () => {
    it('**Feature: session-restoration-robustness, Property 4: Restoration Failure Recovery**', async () => {
      // **Validates: Requirements 2.1, 2.2, 2.3**
      await fc.assert(
        fc.asyncProperty(
          simpleSessionArb,
          fc.oneof(fc.constant('missing'), fc.constant('corrupted'), fc.constant('permission')),
          fc.array(simpleSessionArb, { minLength: 1, maxLength: 3 }),
          async (failingSession, errorType, availableSessions) => {
            // Ensure the failing session is not in the available sessions
            const filteredAvailableSessions = availableSessions.filter(s => s.id !== failingSession.id);
            
            if (filteredAvailableSessions.length === 0) {
              // Skip this test case if we don't have any available sessions
              return;
            }

            // Create valid session files for available sessions
            for (const session of filteredAvailableSessions) {
              await createValidSessionFile(session);
            }

            // Create session metadata for all sessions (including the failing one)
            const allSessionMetadata = [
              createSessionMetadata(failingSession),
              ...filteredAvailableSessions.map(createSessionMetadata)
            ];

            // Create session index
            await createSessionIndex(allSessionMetadata);

            // Simulate the restoration failure
            const error = await simulateRestorationFailure(failingSession.id, errorType);

            // Record the failure in the error recovery system
            errorRecovery.recordFailure(failingSession.id, error);

            // Property: For any session restoration that fails due to a missing file, the system must provide recovery options
            const recoveryContext = {
              failedSessionId: failingSession.id,
              attemptCount: 1,
              totalFailures: 1,
              availableSessions: filteredAvailableSessions.map(createSessionMetadata),
              lastError: error,
            };

            const recoveryOptions = errorRecovery.getRecoveryOptions(recoveryContext);

            // Property: Recovery options must be provided
            expect(recoveryOptions).toBeDefined();
            expect(Array.isArray(recoveryOptions)).toBe(true);
            expect(recoveryOptions.length).toBeGreaterThan(0);

            // Property: Recovery options must include required types
            const optionTypes = new Set(recoveryOptions.map(option => option.type));
            
            // Should always have a "new-session" option
            expect(optionTypes.has('new-session')).toBe(true);
            
            // Should always have a "skip" option
            expect(optionTypes.has('skip')).toBe(true);

            // If there are alternative sessions available, should have "select-different" option
            if (filteredAvailableSessions.length > 0) {
              expect(optionTypes.has('select-different')).toBe(true);
            }

            // Property: Each recovery option must have required fields
            for (const option of recoveryOptions) {
              expect(typeof option.type).toBe('string');
              expect(typeof option.label).toBe('string');
              expect(typeof option.description).toBe('string');
              expect(typeof option.action).toBe('function');
              expect(typeof option.isRecommended).toBe('boolean');
              
              // Labels and descriptions should be non-empty
              expect(option.label.length).toBeGreaterThan(0);
              expect(option.description.length).toBeGreaterThan(0);
            }

            // Property: The system must not automatically retry the same session
            const shouldSkip = errorRecovery.shouldSkipSession(failingSession.id);
            
            // After first failure, it might not be skipped yet, but after max retries it should be
            if (recoveryContext.attemptCount >= errorRecovery.getConfig().maxRetries) {
              expect(shouldSkip).toBe(true);
            }

            // Property: The failed session should be marked as problematic
            const isProblematic = errorRecovery.isSessionProblematic(failingSession.id);
            
            // After recording a failure, the session might be problematic depending on retry count
            if (recoveryContext.attemptCount >= errorRecovery.getConfig().maxRetries) {
              expect(isProblematic).toBe(true);
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should escalate recovery options based on failure count', async () => {
      await fc.assert(
        fc.asyncProperty(
          simpleSessionArb,
          fc.integer({ min: 1, max: 5 }),
          fc.array(simpleSessionArb, { minLength: 1, maxLength: 2 }),
          async (failingSession, failureCount, availableSessions) => {
            // Filter out the failing session from available sessions
            const filteredAvailableSessions = availableSessions.filter(s => s.id !== failingSession.id);
            
            if (filteredAvailableSessions.length === 0) {
              return; // Skip if no alternatives
            }

            // Create valid session files for available sessions
            for (const session of filteredAvailableSessions) {
              await createValidSessionFile(session);
            }

            // Simulate multiple failures
            for (let i = 0; i < failureCount; i++) {
              const error = new Error(`Failure attempt ${i + 1}`);
              errorRecovery.recordFailure(failingSession.id, error);
            }

            const recoveryContext = {
              failedSessionId: failingSession.id,
              attemptCount: failureCount,
              totalFailures: failureCount,
              availableSessions: filteredAvailableSessions.map(createSessionMetadata),
              lastError: new Error(`Final failure after ${failureCount} attempts`),
            };

            const recoveryOptions = errorRecovery.getRecoveryOptions(recoveryContext);

            // Property: Recovery options should escalate based on failure count
            const hasRetryOption = recoveryOptions.some(option => option.type === 'retry');
            const hasNewSessionOption = recoveryOptions.some(option => option.type === 'new-session');
            const hasSkipOption = recoveryOptions.some(option => option.type === 'skip');

            // After many failures, retry should not be available
            if (failureCount >= errorRecovery.getConfig().maxRetries) {
              expect(hasRetryOption).toBe(false);
            }

            // New session and skip options should always be available
            expect(hasNewSessionOption).toBe(true);
            expect(hasSkipOption).toBe(true);

            // Property: Recommendations should change based on failure count
            const recommendedOptions = recoveryOptions.filter(option => option.isRecommended);
            expect(recommendedOptions.length).toBeGreaterThan(0);

            // After multiple failures, "new-session" or "select-different" should be recommended
            if (failureCount >= 2) {
              const hasRecommendedAlternative = recommendedOptions.some(option => 
                option.type === 'new-session' || option.type === 'select-different'
              );
              expect(hasRecommendedAlternative).toBe(true);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should prevent automatic retry of problematic sessions', async () => {
      await fc.assert(
        fc.asyncProperty(
          simpleSessionArb,
          sessionErrorArb,
          async (session, error) => {
            // Create a valid session file initially
            await createValidSessionFile(session);

            // Record multiple failures to make the session problematic
            const maxRetries = errorRecovery.getConfig().maxRetries;
            for (let i = 0; i < maxRetries + 1; i++) {
              errorRecovery.recordFailure(session.id, error);
            }

            // Property: After max retries, the session should be marked as problematic
            const isProblematic = errorRecovery.isSessionProblematic(session.id);
            expect(isProblematic).toBe(true);

            // Property: Problematic sessions should be skipped
            const shouldSkip = errorRecovery.shouldSkipSession(session.id);
            expect(shouldSkip).toBe(true);

            // Property: Recovery options should not include retry for problematic sessions
            const recoveryContext = {
              failedSessionId: session.id,
              attemptCount: maxRetries + 1,
              totalFailures: maxRetries + 1,
              availableSessions: [],
              lastError: error,
            };

            const recoveryOptions = errorRecovery.getRecoveryOptions(recoveryContext);
            const hasRetryOption = recoveryOptions.some(option => option.type === 'retry');
            expect(hasRetryOption).toBe(false);

            // Property: Alternative options should still be available
            const hasNewSessionOption = recoveryOptions.some(option => option.type === 'new-session');
            const hasSkipOption = recoveryOptions.some(option => option.type === 'skip');
            expect(hasNewSessionOption).toBe(true);
            expect(hasSkipOption).toBe(true);
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should provide contextual recovery options based on available alternatives', async () => {
      await fc.assert(
        fc.asyncProperty(
          simpleSessionArb,
          fc.array(simpleSessionArb, { minLength: 0, maxLength: 5 }),
          async (failingSession, potentialAlternatives) => {
            // Filter out the failing session from alternatives
            const availableAlternatives = potentialAlternatives.filter(s => s.id !== failingSession.id);

            // Create valid session files for alternatives
            for (const session of availableAlternatives) {
              await createValidSessionFile(session);
            }

            // Record a failure for the failing session
            const error = new Error('Session restoration failed');
            errorRecovery.recordFailure(failingSession.id, error);

            const recoveryContext = {
              failedSessionId: failingSession.id,
              attemptCount: 1,
              totalFailures: 1,
              availableSessions: availableAlternatives.map(createSessionMetadata),
              lastError: error,
            };

            const recoveryOptions = errorRecovery.getRecoveryOptions(recoveryContext);

            // Property: If alternatives are available, "select-different" option should be provided
            const hasSelectDifferentOption = recoveryOptions.some(option => option.type === 'select-different');
            
            if (availableAlternatives.length > 0) {
              expect(hasSelectDifferentOption).toBe(true);
              
              // The select-different option should mention the number of alternatives
              const selectDifferentOption = recoveryOptions.find(option => option.type === 'select-different');
              expect(selectDifferentOption?.description).toContain(availableAlternatives.length.toString());
            } else {
              // If no alternatives, select-different should not be available or should indicate no alternatives
              if (hasSelectDifferentOption) {
                const selectDifferentOption = recoveryOptions.find(option => option.type === 'select-different');
                expect(selectDifferentOption?.description).toContain('0');
              }
            }

            // Property: Core recovery options should always be available regardless of alternatives
            const hasNewSessionOption = recoveryOptions.some(option => option.type === 'new-session');
            const hasSkipOption = recoveryOptions.some(option => option.type === 'skip');
            
            expect(hasNewSessionOption).toBe(true);
            expect(hasSkipOption).toBe(true);

            // Property: Recommendations should be contextual
            const recommendedOptions = recoveryOptions.filter(option => option.isRecommended);
            expect(recommendedOptions.length).toBeGreaterThan(0);

            // On first failure, retry should typically be recommended if available
            const hasRetryOption = recoveryOptions.some(option => option.type === 'retry');
            if (hasRetryOption) {
              const retryOption = recoveryOptions.find(option => option.type === 'retry');
              expect(retryOption?.isRecommended).toBe(true);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should maintain failure tracking consistency across recovery operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(simpleSessionArb, { minLength: 1, maxLength: 3 }),
          fc.array(sessionErrorArb, { minLength: 1, maxLength: 3 }),
          async (sessions, errors) => {
            // Create valid session files
            for (const session of sessions) {
              await createValidSessionFile(session);
            }

            // Record failures for each session
            const failureMap = new Map<SessionId, Error[]>();
            
            for (let i = 0; i < sessions.length; i++) {
              const session = sessions[i];
              const error = errors[i % errors.length];
              
              errorRecovery.recordFailure(session.id, error);
              
              if (!failureMap.has(session.id)) {
                failureMap.set(session.id, []);
              }
              failureMap.get(session.id)!.push(error);
            }

            // Property: Failure records should be consistent with what was recorded
            for (const [sessionId, recordedErrors] of failureMap) {
              const failureRecord = errorRecovery.getFailureRecord(sessionId);
              
              expect(failureRecord).toBeDefined();
              expect(failureRecord!.sessionId).toBe(sessionId);
              expect(failureRecord!.totalFailures).toBe(recordedErrors.length);
              expect(failureRecord!.failures).toHaveLength(recordedErrors.length);

              // Check that each failure was recorded correctly
              for (let i = 0; i < recordedErrors.length; i++) {
                const recordedFailure = failureRecord!.failures[i];
                expect(recordedFailure.error).toBe(recordedErrors[i].message);
                expect(typeof recordedFailure.timestamp).toBe('number');
                expect(recordedFailure.timestamp).toBeGreaterThan(0);
                expect(typeof recordedFailure.errorType).toBe('string');
                expect(typeof recordedFailure.recoveryAttempted).toBe('boolean');
              }
            }

            // Property: Sessions without failures should not have failure records
            const allSessionIds = new Set(sessions.map(s => s.id));
            const failedSessionIds = new Set(failureMap.keys());
            
            for (const sessionId of allSessionIds) {
              if (!failedSessionIds.has(sessionId)) {
                const failureRecord = errorRecovery.getFailureRecord(sessionId);
                expect(failureRecord).toBeUndefined();
              }
            }

            // Property: Problematic status should be consistent with failure count
            for (const [sessionId, recordedErrors] of failureMap) {
              const isProblematic = errorRecovery.isSessionProblematic(sessionId);
              const maxRetries = errorRecovery.getConfig().maxRetries;
              
              if (recordedErrors.length >= maxRetries) {
                expect(isProblematic).toBe(true);
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});