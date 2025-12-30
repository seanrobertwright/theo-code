/**
 * @fileoverview Property-based tests for validation logging completeness
 * **Feature: session-restoration-robustness, Property 3: Validation Logging Completeness**
 * **Validates: Requirements 1.3, 5.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionValidator } from '../validation.js';
import { SessionStorage } from '../storage.js';
import { 
  createSessionId, 
  createMessageId,
  type Session,
  type SessionId,
} from '../../../shared/types/index.js';
import { logger } from '../../../shared/utils/logger.js';

// =============================================================================
// TEST SETUP
// =============================================================================

/**
 * Creates a test session with minimal required data
 */
function createTestSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  const sessionId = createSessionId();
  
  return {
    id: sessionId,
    version: '1.0.0',
    created: now,
    lastModified: now,
    model: 'gpt-4o',
    provider: 'openai',
    workspaceRoot: '/test/workspace',
    tokenCount: {
      total: 100,
      input: 50,
      output: 50,
    },
    title: 'Test Session',
    filesAccessed: [],
    contextFiles: [],
    tags: [],
    messages: [
      {
        id: createMessageId(),
        role: 'user',
        content: 'Hello, world!',
        timestamp: now,
      },
    ],
    ...overrides,
  };
}

describe('Property 3: Validation Logging Completeness', () => {
  let validator: SessionValidator;
  let storage: SessionStorage;
  let testDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validation-logging-test-'));
    
    // Mock getSessionsDir to use our test directory
    vi.mock('../../../config/loader.js', () => ({
      getSessionsDir: () => testDir,
    }));
    
    storage = new SessionStorage();
    validator = new SessionValidator();
    
    // Spy on logger methods to capture log calls
    logSpy = vi.spyOn(logger, 'warn');
  });

  afterEach(async () => {
    logSpy.mockRestore();
    vi.restoreAllMocks();
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // =============================================================================
  // PROPERTY TESTS
  // =============================================================================

  /**
   * Property 3: Validation Logging Completeness
   * For any missing session file detected during validation, a warning message 
   * must be logged with the session ID and file path.
   * **Validates: Requirements 1.3, 5.3**
   */
  it('should log warnings for all missing session files during validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.string({ minLength: 8, maxLength: 36 }).map(s => `session-${s}` as SessionId),
            shouldExist: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (sessionConfigs) => {
          // Clear any previous log calls
          logSpy.mockClear();

          const existingSessions: SessionId[] = [];
          const missingSessions: SessionId[] = [];

          // Create sessions based on configuration
          for (const config of sessionConfigs) {
            if (config.shouldExist) {
              const session = createTestSession({
                id: config.sessionId,
                title: `Test Session ${config.sessionId}`,
              });
              await storage.writeSession(config.sessionId, session);
              existingSessions.push(config.sessionId);
            } else {
              missingSessions.push(config.sessionId);
            }
          }

          // Validate all sessions (both existing and missing)
          const validationResults = await Promise.all(
            sessionConfigs.map(config => validator.validateSessionFile(config.sessionId))
          );

          // Property: For any missing session file, a warning must be logged
          for (const sessionId of missingSessions) {
            const loggedWarning = logSpy.mock.calls.some(call => 
              call[0].includes(sessionId) && 
              call[0].includes('file not found')
            );
            
            expect(loggedWarning).toBe(true);
          }

          // Property: Existing sessions should not generate missing file warnings
          for (const sessionId of existingSessions) {
            const loggedMissingWarning = logSpy.mock.calls.some(call => 
              call[0].includes(sessionId) && 
              call[0].includes('file not found')
            );
            
            expect(loggedMissingWarning).toBe(false);
          }

          // Property: Number of missing file warnings should match number of missing sessions
          const missingFileWarnings = logSpy.mock.calls.filter(call => 
            call[0].includes('file not found')
          );
          
          expect(missingFileWarnings.length).toBe(missingSessions.length);

          // Property: Each warning should contain the session ID
          for (const call of missingFileWarnings) {
            const warningMessage = call[0];
            const containsSessionId = missingSessions.some(sessionId => 
              warningMessage.includes(sessionId)
            );
            expect(containsSessionId).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Validation logging should include structured information
   * For any validation operation, logs should contain structured information
   * that can be used for monitoring and debugging.
   */
  it('should log structured validation information for cleanup operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.string({ minLength: 8, maxLength: 36 }).map(s => `session-${s}` as SessionId),
            createFile: fc.boolean(),
            createIndexEntry: fc.boolean(),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        async (sessionConfigs) => {
          // Clear any previous log calls
          logSpy.mockClear();

          // Also spy on info and error logs for comprehensive monitoring
          const infoSpy = vi.spyOn(logger, 'info');
          const errorSpy = vi.spyOn(logger, 'error');

          try {
            const orphanedEntries: SessionId[] = [];
            const orphanedFiles: SessionId[] = [];

            // Create test scenarios with orphaned entries and files
            for (const config of sessionConfigs) {
              if (config.createFile && !config.createIndexEntry) {
                // Create orphaned file (file without index entry)
                const session = createTestSession({
                  id: config.sessionId,
                  title: `Orphaned File ${config.sessionId}`,
                });
                await storage.writeSession(config.sessionId, session);
                orphanedFiles.push(config.sessionId);
              } else if (!config.createFile && config.createIndexEntry) {
                // Create orphaned index entry (index entry without file)
                // This would be created by manually adding to index, but for testing
                // we'll track it as an expected orphaned entry
                orphanedEntries.push(config.sessionId);
              } else if (config.createFile && config.createIndexEntry) {
                // Create valid session (both file and index entry)
                const session = createTestSession({
                  id: config.sessionId,
                  title: `Valid Session ${config.sessionId}`,
                });
                await storage.writeSession(config.sessionId, session);
              }
            }

            // Perform validation operations that should generate logs
            await validator.validateSessionIndex();
            
            if (orphanedEntries.length > 0 || orphanedFiles.length > 0) {
              await validator.cleanupOrphanedEntries();
            }

            // Property: Cleanup operations should log session counts
            if (orphanedFiles.length > 0) {
              const cleanupLogs = [...infoSpy.mock.calls, ...logSpy.mock.calls]
                .filter(call => call[0].includes('cleanup') || call[0].includes('orphaned'));
              
              expect(cleanupLogs.length).toBeGreaterThan(0);
              
              // Property: Logs should contain quantitative information
              const hasCountInformation = cleanupLogs.some(call => 
                /\d+/.test(call[0]) // Contains numbers (counts)
              );
              expect(hasCountInformation).toBe(true);
            }

            // Property: All validation operations should be logged
            const allLogCalls = [
              ...logSpy.mock.calls,
              ...infoSpy.mock.calls,
              ...errorSpy.mock.calls
            ];

            // Should have logs for validation operations
            expect(allLogCalls.length).toBeGreaterThan(0);

            // Property: Log messages should be structured and informative
            for (const call of allLogCalls) {
              const message = call[0];
              
              // Should not be empty
              expect(message.length).toBeGreaterThan(0);
              
              // Should contain contextual information (session IDs, operations, etc.)
              const hasContext = /session|validation|cleanup|orphaned|index/.test(message.toLowerCase());
              expect(hasContext).toBe(true);
            }

          } finally {
            infoSpy.mockRestore();
            errorSpy.mockRestore();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Warning logs should be generated for missing files during index validation
   * For any session index validation that finds missing files, appropriate warnings
   * should be logged with session identifiers.
   */
  it('should log warnings for missing files during index validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 8, maxLength: 36 }).map(s => `session-${s}` as SessionId),
          { minLength: 1, maxLength: 5 }
        ),
        async (sessionIds) => {
          // Clear any previous log calls
          logSpy.mockClear();

          // Create index entries without corresponding files (orphaned entries)
          const indexContent = {
            version: '1.0.0',
            lastUpdated: Date.now(),
            sessions: Object.fromEntries(
              sessionIds.map(sessionId => [
                sessionId,
                {
                  id: sessionId,
                  created: Date.now(),
                  lastModified: Date.now(),
                  model: 'gpt-4',
                  provider: 'openai',
                  tokenCount: 100,
                  title: `Test Session ${sessionId}`,
                  workspaceRoot: '/test',
                  messageCount: 1,
                }
              ])
            ),
          };

          // Write index without creating session files
          const { atomicWriteFile, getSessionIndexPath } = await import('../filesystem.js');
          await atomicWriteFile(getSessionIndexPath(), JSON.stringify(indexContent, null, 2));

          // Perform index validation
          await validator.validateSessionIndex();

          // Property: Each missing file should generate a warning log
          for (const sessionId of sessionIds) {
            const hasWarningForSession = logSpy.mock.calls.some(call => 
              call[0].includes(sessionId) && 
              (call[0].includes('missing') || call[0].includes('orphaned'))
            );
            
            expect(hasWarningForSession).toBe(true);
          }

          // Property: Warning logs should contain session identifiers
          const orphanedWarnings = logSpy.mock.calls.filter(call => 
            call[0].includes('orphaned') || call[0].includes('missing')
          );

          for (const warning of orphanedWarnings) {
            const message = warning[0];
            const containsSessionId = sessionIds.some(sessionId => 
              message.includes(sessionId)
            );
            expect(containsSessionId).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});