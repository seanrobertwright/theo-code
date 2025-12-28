/**
 * @fileoverview Property-based tests for session validation
 * @module features/session/__tests__/validation.property.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionValidator, type ISessionValidator } from '../validation.js';
import { MessageIdSchema, createSessionId, type Session, type SessionId } from '../../../shared/types/index.js';
import { atomicWriteFile } from '../filesystem.js';

// =============================================================================
// TEST SETUP
// =============================================================================

let testSessionsDir: string;

// Mock the getSessionFilePath and getSessionIndexPath functions
vi.mock('../filesystem.js', async () => {
  const actual = await vi.importActual('../filesystem.js');
  return {
    ...actual,
    getSessionFilePath: (sessionId: string) => path.join(testSessionsDir, `${sessionId}.json`),
    getSessionIndexPath: () => path.join(testSessionsDir, 'index.json'),
    listSessionFiles: async () => {
      // List files in the test directory only
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

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(async () => {
  // Create a temporary directory for testing
  testSessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-validation-test-'));
  
  // Clear any existing files in the directory
  try {
    const files = await fs.readdir(testSessionsDir);
    for (const file of files) {
      await fs.unlink(path.join(testSessionsDir, file));
    }
  } catch (error) {
    // Directory might be empty, ignore
  }
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
const sessionIdArb = fc.uuid().map(uuid => createSessionId());

/**
 * Generator for valid message IDs
 */
const messageIdArb = fc.uuid().map(uuid => MessageIdSchema.parse(uuid));

/**
 * Generator for valid timestamps
 */
const timestampArb = fc.integer({ min: 1000000000000, max: Date.now() + 86400000 });

/**
 * Generator for token count objects
 */
const tokenCountArb = fc.record({
  total: fc.nat(100000),
  input: fc.nat(50000),
  output: fc.nat(50000),
}).map(({ total, input, output }) => ({
  total: Math.max(total, input + output),
  input,
  output,
}));

/**
 * Generator for simple valid sessions (reduced complexity)
 */
const simpleSessionArb = fc.record({
  id: sessionIdArb,
  version: fc.constant('1.0.0'),
  created: timestampArb,
  lastModified: timestampArb,
  model: fc.constant('test-model'),
  provider: fc.constant('test-provider'),
  workspaceRoot: fc.constant('/test/workspace'),
  tokenCount: fc.constant({ total: 0, input: 0, output: 0 }),
  filesAccessed: fc.constant([]),
  messages: fc.constant([]),
  contextFiles: fc.constant([]),
  title: fc.constant(null),
  tags: fc.constant([]),
  notes: fc.constant(null),
  providerData: fc.constant(undefined),
}).map(session => ({
  ...session,
  lastModified: Math.max(session.created, session.lastModified),
}));

/**
 * Generator for versioned session format
 */
const versionedSessionArb = fc.record({
  version: fc.constant('1.0.0'),
  compressed: fc.boolean(),
  checksum: fc.option(fc.string({ minLength: 64, maxLength: 64 }).filter(s => /^[0-9a-f]+$/i.test(s))),
  data: sessionArb,
});

/**
 * Generator for corrupted JSON strings
 */
const corruptedJsonArb = fc.oneof(
  fc.constant(''), // Empty string
  fc.constant('{'), // Incomplete JSON
  fc.constant('{"id": "incomplete"'), // Incomplete JSON
  fc.constant('not json at all'), // Invalid JSON
  fc.constant('{"id": null}'), // Invalid session structure
  fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
    try {
      JSON.parse(s);
      return false; // Skip valid JSON
    } catch {
      return true; // Keep invalid JSON
    }
  })
);

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
  const content = JSON.stringify(session, null, 2);
  await createSessionFile(session.id, content);
}

/**
 * Creates a versioned session file
 */
async function createVersionedSessionFile(sessionId: SessionId, versionedSession: any): Promise<void> {
  const content = JSON.stringify(versionedSession, null, 2);
  await createSessionFile(sessionId, content);
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Session Validation Property Tests', () => {
  let validator: ISessionValidator;

  beforeEach(() => {
    validator = new SessionValidator();
  });

  describe('Property 1: Session File Validation Consistency', () => {
    it('**Feature: session-restoration-robustness, Property 1: Session File Validation Consistency**', async () => {
      // **Validates: Requirements 1.1**
      await fc.assert(
        fc.asyncProperty(sessionArb, async (session) => {
          // Create a valid session file
          await createValidSessionFile(session);

          // Validate the session file
          const result = await validator.validateSessionFile(session.id);

          // Property: For any valid session file that exists on disk, validation should succeed
          expect(result.isValid).toBe(true);
          expect(result.fileExists).toBe(true);
          expect(result.isReadable).toBe(true);
          expect(result.hasValidStructure).toBe(true);
          expect(result.errors).toHaveLength(0);
        }),
        { numRuns: 5 }
      );
    });

    it('should consistently detect missing session files', async () => {
      await fc.assert(
        fc.asyncProperty(sessionIdArb, async (sessionId) => {
          // Don't create the file - it should be missing

          // Validate the missing session file
          const result = await validator.validateSessionFile(sessionId);

          // Property: For any session ID without a corresponding file, validation should fail with specific errors
          expect(result.isValid).toBe(false);
          expect(result.fileExists).toBe(false);
          expect(result.isReadable).toBe(false);
          expect(result.hasValidStructure).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(error => error.includes('does not exist'))).toBe(true);
        }),
        { numRuns: 5 }
      );
    });

    it('should consistently detect corrupted session files', async () => {
      await fc.assert(
        fc.asyncProperty(sessionIdArb, corruptedJsonArb, async (sessionId, corruptedContent) => {
          // Create a corrupted session file
          await createSessionFile(sessionId, corruptedContent);

          // Validate the corrupted session file
          const result = await validator.validateSessionFile(sessionId);

          // Property: For any corrupted session file, validation should fail but file should exist and be readable
          expect(result.isValid).toBe(false);
          expect(result.fileExists).toBe(true);
          
          // File should be readable (we can read the content, even if it's invalid)
          if (corruptedContent.length > 0) {
            expect(result.isReadable).toBe(true);
          }
          
          expect(result.hasValidStructure).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }),
        { numRuns: 5 }
      );
    });

    it('should handle versioned session format consistently', async () => {
      await fc.assert(
        fc.asyncProperty(versionedSessionArb, async (versionedSession) => {
          const sessionId = versionedSession.data.id;
          
          // Create a versioned session file
          await createVersionedSessionFile(sessionId, versionedSession);

          // Validate the versioned session file
          const result = await validator.validateSessionFile(sessionId);

          // Property: For any valid versioned session file, validation should succeed
          expect(result.isValid).toBe(true);
          expect(result.fileExists).toBe(true);
          expect(result.isReadable).toBe(true);
          expect(result.hasValidStructure).toBe(true);
          expect(result.errors).toHaveLength(0);
        }),
        { numRuns: 5 }
      );
    });

    it('should provide consistent error reporting structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            sessionArb.map(s => ({ type: 'valid' as const, session: s })),
            sessionIdArb.map(id => ({ type: 'missing' as const, sessionId: id })),
            fc.tuple(sessionIdArb, corruptedJsonArb).map(([id, content]) => ({ type: 'corrupted' as const, sessionId: id, content }))
          ),
          async (testCase) => {
            let sessionId: SessionId;
            let expectedValid: boolean;

            if (testCase.type === 'valid') {
              sessionId = testCase.session.id;
              await createValidSessionFile(testCase.session);
              expectedValid = true;
            } else if (testCase.type === 'missing') {
              sessionId = testCase.sessionId;
              expectedValid = false;
            } else { // corrupted
              sessionId = testCase.sessionId;
              await createSessionFile(sessionId, testCase.content);
              expectedValid = false;
            }

            const result = await validator.validateSessionFile(sessionId);

            // Property: Validation result structure should always be consistent
            expect(typeof result.isValid).toBe('boolean');
            expect(typeof result.fileExists).toBe('boolean');
            expect(typeof result.isReadable).toBe('boolean');
            expect(typeof result.hasValidStructure).toBe('boolean');
            expect(Array.isArray(result.errors)).toBe(true);
            expect(Array.isArray(result.warnings)).toBe(true);

            // Property: isValid should match expected validity
            expect(result.isValid).toBe(expectedValid);

            // Property: If invalid, there should be at least one error
            if (!result.isValid) {
              expect(result.errors.length).toBeGreaterThan(0);
            }

            // Property: All errors should be non-empty strings
            result.errors.forEach(error => {
              expect(typeof error).toBe('string');
              expect(error.length).toBeGreaterThan(0);
            });

            // Property: All warnings should be non-empty strings
            result.warnings.forEach(warning => {
              expect(typeof warning).toBe('string');
              expect(warning.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should maintain validation consistency across multiple calls', async () => {
      await fc.assert(
        fc.asyncProperty(sessionArb, async (session) => {
          // Create a valid session file
          await createValidSessionFile(session);

          // Validate the same session multiple times
          const result1 = await validator.validateSessionFile(session.id);
          const result2 = await validator.validateSessionFile(session.id);
          const result3 = await validator.validateSessionFile(session.id);

          // Property: Multiple validations of the same file should produce identical results
          expect(result1.isValid).toBe(result2.isValid);
          expect(result1.isValid).toBe(result3.isValid);
          expect(result1.fileExists).toBe(result2.fileExists);
          expect(result1.fileExists).toBe(result3.fileExists);
          expect(result1.isReadable).toBe(result2.isReadable);
          expect(result1.isReadable).toBe(result3.isReadable);
          expect(result1.hasValidStructure).toBe(result2.hasValidStructure);
          expect(result1.hasValidStructure).toBe(result3.hasValidStructure);
          expect(result1.errors).toEqual(result2.errors);
          expect(result1.errors).toEqual(result3.errors);
        }),
        { numRuns: 3 } // Fewer runs since we're doing multiple validations per test
      );
    });
  });

  describe('Property 2: Index Cleanup Atomicity', () => {
    it('**Feature: session-restoration-robustness, Property 2: Index Cleanup Atomicity**', async () => {
      // **Validates: Requirements 1.2, 5.1, 5.4**
      await fc.assert(
        fc.asyncProperty(
          fc.array(sessionArb, { minLength: 1, maxLength: 10 }),
          fc.array(sessionIdArb, { minLength: 1, maxLength: 5 }),
          async (validSessions, orphanedSessionIds) => {
            // Create valid session files
            for (const session of validSessions) {
              await createValidSessionFile(session);
            }

            // Create session index with both valid and orphaned entries
            const indexContent = {
              version: '1.0.0',
              lastUpdated: Date.now(),
              sessions: {
                // Add valid sessions to index
                ...Object.fromEntries(validSessions.map(session => [
                  session.id,
                  {
                    id: session.id,
                    created: session.created,
                    lastModified: session.lastModified,
                    model: session.model,
                    provider: session.provider,
                    tokenCount: session.tokenCount,
                    title: session.title,
                    workspaceRoot: session.workspaceRoot,
                    messageCount: session.messages.length,
                    lastMessage: session.messages.length > 0 ? 'Test message' : undefined,
                    contextFiles: session.contextFiles,
                    tags: session.tags,
                    preview: session.messages.find(m => m.role === 'user') ? 'Test preview' : undefined,
                  }
                ])),
                // Add orphaned entries (no corresponding files)
                ...Object.fromEntries(orphanedSessionIds.map(sessionId => [
                  sessionId,
                  {
                    id: sessionId,
                    created: Date.now(),
                    lastModified: Date.now(),
                    model: 'test-model',
                    provider: 'test-provider',
                    tokenCount: { total: 0, input: 0, output: 0 },
                    title: null,
                    workspaceRoot: '/test',
                    messageCount: 0,
                    lastMessage: undefined,
                    contextFiles: [],
                    tags: [],
                    preview: undefined,
                  }
                ]))
              }
            };

            const indexPath = path.join(testSessionsDir, 'index.json');
            await atomicWriteFile(indexPath, JSON.stringify(indexContent, null, 2), { createBackup: false });

            // Read index before cleanup
            const indexBeforeCleanup = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
            const totalSessionsBeforeCleanup = Object.keys(indexBeforeCleanup.sessions).length;

            // Perform cleanup
            const cleanupResult = await validator.cleanupOrphanedEntries();

            // Read index after cleanup
            const indexAfterCleanup = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
            const totalSessionsAfterCleanup = Object.keys(indexAfterCleanup.sessions).length;

            // Property: For any missing session file, the corresponding entry must be removed from the index
            for (const orphanedId of orphanedSessionIds) {
              expect(indexAfterCleanup.sessions[orphanedId]).toBeUndefined();
            }

            // Property: Valid sessions must be preserved in the index
            for (const validSession of validSessions) {
              expect(indexAfterCleanup.sessions[validSession.id]).toBeDefined();
              expect(indexAfterCleanup.sessions[validSession.id].id).toBe(validSession.id);
            }

            // Property: The updated index must be persisted to disk atomically
            expect(totalSessionsAfterCleanup).toBe(validSessions.length);
            expect(cleanupResult.orphanedEntriesRemoved).toBe(orphanedSessionIds.length);

            // Property: Index structure must remain valid after cleanup
            expect(indexAfterCleanup.version).toBe('1.0.0');
            expect(typeof indexAfterCleanup.lastUpdated).toBe('number');
            expect(indexAfterCleanup.lastUpdated).toBeGreaterThan(indexBeforeCleanup.lastUpdated);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should handle concurrent cleanup operations atomically', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(sessionArb, { minLength: 2, maxLength: 5 }),
          fc.array(sessionIdArb, { minLength: 2, maxLength: 3 }),
          async (validSessions, orphanedSessionIds) => {
            // Create valid session files
            for (const session of validSessions) {
              await createValidSessionFile(session);
            }

            // Create session index with orphaned entries
            const indexContent = {
              version: '1.0.0',
              lastUpdated: Date.now(),
              sessions: {
                ...Object.fromEntries(validSessions.map(session => [
                  session.id,
                  {
                    id: session.id,
                    created: session.created,
                    lastModified: session.lastModified,
                    model: session.model,
                    provider: session.provider,
                    tokenCount: session.tokenCount,
                    title: session.title,
                    workspaceRoot: session.workspaceRoot,
                    messageCount: session.messages.length,
                    lastMessage: session.messages.length > 0 ? 'Test message' : undefined,
                    contextFiles: session.contextFiles,
                    tags: session.tags,
                    preview: session.messages.find(m => m.role === 'user') ? 'Test preview' : undefined,
                  }
                ])),
                ...Object.fromEntries(orphanedSessionIds.map(sessionId => [
                  sessionId,
                  {
                    id: sessionId,
                    created: Date.now(),
                    lastModified: Date.now(),
                    model: 'test-model',
                    provider: 'test-provider',
                    tokenCount: { total: 0, input: 0, output: 0 },
                    title: null,
                    workspaceRoot: '/test',
                    messageCount: 0,
                    lastMessage: undefined,
                    contextFiles: [],
                    tags: [],
                    preview: undefined,
                  }
                ]))
              }
            };

            const indexPath = path.join(testSessionsDir, 'index.json');
            await atomicWriteFile(indexPath, JSON.stringify(indexContent, null, 2), { createBackup: false });

            // Perform multiple cleanup operations concurrently
            const cleanupPromises = [
              validator.cleanupOrphanedEntries(),
              validator.cleanupOrphanedEntries(),
            ];

            const results = await Promise.allSettled(cleanupPromises);

            // Property: At least one cleanup should succeed
            const successfulResults = results.filter(result => result.status === 'fulfilled');
            expect(successfulResults.length).toBeGreaterThan(0);

            // Property: Final index state should be consistent regardless of concurrent operations
            const finalIndex = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
            
            // All orphaned entries should be removed
            for (const orphanedId of orphanedSessionIds) {
              expect(finalIndex.sessions[orphanedId]).toBeUndefined();
            }

            // All valid sessions should be preserved
            for (const validSession of validSessions) {
              expect(finalIndex.sessions[validSession.id]).toBeDefined();
            }

            expect(Object.keys(finalIndex.sessions).length).toBe(validSessions.length);
          }
        ),
        { numRuns: 2 } // Fewer runs for concurrent tests
      );
    });
  });

  describe('Property 6: Startup Integrity Check', () => {
    it('**Feature: session-restoration-robustness, Property 6: Startup Integrity Check**', async () => {
      // **Validates: Requirements 3.1**
      await fc.assert(
        fc.asyncProperty(
          fc.array(sessionArb, { minLength: 0, maxLength: 3 }),
          async (sessions) => {
            // Create a fresh test directory for this test case
            const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-validation-case-'));
            
            // Update the mock to use this directory
            const originalTestSessionsDir = testSessionsDir;
            testSessionsDir = testDir;
            
            try {
              // Create session files
              for (const session of sessions) {
                await createValidSessionFile(session);
              }

              // Create session index (only if we have sessions)
              if (sessions.length > 0) {
                const indexContent = {
                  version: '1.0.0',
                  lastUpdated: Date.now(),
                  sessions: Object.fromEntries(sessions.map(session => [
                    session.id,
                    {
                      id: session.id,
                      created: session.created,
                      lastModified: session.lastModified,
                      model: session.model,
                      provider: session.provider,
                      tokenCount: session.tokenCount,
                      title: session.title,
                      workspaceRoot: session.workspaceRoot,
                      messageCount: session.messages.length,
                      lastMessage: session.messages.length > 0 ? 'Test message' : undefined,
                      contextFiles: session.contextFiles,
                      tags: session.tags,
                      preview: session.messages.find(m => m.role === 'user') ? 'Test preview' : undefined,
                    }
                  ]))
                };

                const indexPath = path.join(testDir, 'index.json');
                await atomicWriteFile(indexPath, JSON.stringify(indexContent, null, 2), { createBackup: false });
              } else {
                // Create empty index for empty sessions case
                const indexContent = {
                  version: '1.0.0',
                  lastUpdated: Date.now(),
                  sessions: {}
                };

                const indexPath = path.join(testDir, 'index.json');
                await atomicWriteFile(indexPath, JSON.stringify(indexContent, null, 2), { createBackup: false });
              }

              // Property: For any system startup, an integrity check must be performed on the session index
              const validationResult = await validator.validateSessionIndex();

              // The validation should complete successfully
              expect(typeof validationResult.isValid).toBe('boolean');
              expect(typeof validationResult.totalSessions).toBe('number');
              expect(typeof validationResult.validSessions).toBe('number');
              expect(Array.isArray(validationResult.orphanedEntries)).toBe(true);
              expect(Array.isArray(validationResult.orphanedFiles)).toBe(true);
              expect(Array.isArray(validationResult.corruptedEntries)).toBe(true);

              // For valid setup, all sessions should be valid
              expect(validationResult.totalSessions).toBe(sessions.length);
              expect(validationResult.validSessions).toBe(sessions.length);
              expect(validationResult.orphanedEntries).toHaveLength(0);
              expect(validationResult.corruptedEntries).toHaveLength(0);
              expect(validationResult.isValid).toBe(true);
              
            } finally {
              // Restore original directory and cleanup
              testSessionsDir = originalTestSessionsDir;
              try {
                await fs.rm(testDir, { recursive: true, force: true });
              } catch (error) {
                // Ignore cleanup errors
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should detect integrity issues during startup check', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(sessionArb, { minLength: 1, maxLength: 2 }),
          fc.array(sessionIdArb, { minLength: 1, maxLength: 2 }),
          async (validSessions, orphanedIds) => {
            // Create only some session files (leaving some orphaned in index)
            for (const session of validSessions) {
              await createValidSessionFile(session);
            }

            // Create index with both valid and orphaned entries
            const indexContent = {
              version: '1.0.0',
              lastUpdated: Date.now(),
              sessions: {
                ...Object.fromEntries(validSessions.map(session => [
                  session.id,
                  {
                    id: session.id,
                    created: session.created,
                    lastModified: session.lastModified,
                    model: session.model,
                    provider: session.provider,
                    tokenCount: session.tokenCount,
                    title: session.title,
                    workspaceRoot: session.workspaceRoot,
                    messageCount: session.messages.length,
                    lastMessage: session.messages.length > 0 ? 'Test message' : undefined,
                    contextFiles: session.contextFiles,
                    tags: session.tags,
                    preview: session.messages.find(m => m.role === 'user') ? 'Test preview' : undefined,
                  }
                ])),
                ...Object.fromEntries(orphanedIds.map(sessionId => [
                  sessionId,
                  {
                    id: sessionId,
                    created: Date.now(),
                    lastModified: Date.now(),
                    model: 'test-model',
                    provider: 'test-provider',
                    tokenCount: { total: 0, input: 0, output: 0 },
                    title: null,
                    workspaceRoot: '/test',
                    messageCount: 0,
                    lastMessage: undefined,
                    contextFiles: [],
                    tags: [],
                    preview: undefined,
                  }
                ]))
              }
            };

            const indexPath = path.join(testSessionsDir, 'index.json');
            await atomicWriteFile(indexPath, JSON.stringify(indexContent, null, 2), { createBackup: false });

            // Perform startup integrity check
            const validationResult = await validator.validateSessionIndex();

            // Property: Startup integrity check must detect orphaned entries
            expect(validationResult.isValid).toBe(false);
            expect(validationResult.totalSessions).toBe(validSessions.length + orphanedIds.length);
            expect(validationResult.validSessions).toBe(validSessions.length);
            expect(validationResult.orphanedEntries).toHaveLength(orphanedIds.length);

            // All orphaned IDs should be detected
            for (const orphanedId of orphanedIds) {
              expect(validationResult.orphanedEntries).toContain(orphanedId);
            }
          }
        ),
        { numRuns: 2 }
      );
    });
  });
});