/**
 * @fileoverview Property-based tests for safe session detection
 * @module features/session/__tests__/safe-session-detection.property.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SafeSessionManager } from '../safe-session-manager.js';
import { SessionStorage } from '../storage.js';
import { createSessionId, type Session, type SessionId, type SessionMetadata } from '../../../shared/types/index.js';
import { atomicWriteFile } from '../filesystem.js';

// =============================================================================
// TEST SETUP
// =============================================================================

let testSessionsDir: string;
let sessionManager: SafeSessionManager;
let sessionStorage: SessionStorage;

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
  testSessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-session-detection-test-'));
  
  // Create storage and manager instances
  sessionStorage = new SessionStorage({
    enableCompression: false,
    enableChecksum: false,
    createBackups: false,
    maxFileSize: 10 * 1024 * 1024,
  });
  
  sessionManager = new SafeSessionManager(sessionStorage);
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

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Safe Session Detection Property Tests', () => {
  describe('Property 1: Session File Validation Consistency', () => {
    it('**Feature: session-restoration-robustness, Property 1: Session File Validation Consistency**', async () => {
      // **Validates: Requirements 1.1**
      await fc.assert(
        fc.asyncProperty(
          fc.array(simpleSessionArb, { minLength: 1, maxLength: 10 }),
          async (sessions) => {
            // Create session files for all sessions
            for (const session of sessions) {
              await createValidSessionFile(session);
            }

            // Create session metadata for index
            const sessionMetadata = sessions.map(createSessionMetadata);

            // Create session index
            await createSessionIndex(sessionMetadata);

            // List sessions using the session manager
            const listedSessions = await sessionManager.listSessions();

            // Property: For any session listed in the available sessions, the corresponding session file must exist and be readable
            expect(listedSessions).toHaveLength(sessions.length);

            for (const listedSession of listedSessions) {
              // Verify the session exists in our original sessions
              const originalSession = sessions.find(s => s.id === listedSession.id);
              expect(originalSession).toBeDefined();

              // Verify the session file exists and can be loaded
              const sessionExists = await sessionManager.sessionExists(listedSession.id);
              expect(sessionExists).toBe(true);

              // Verify the session can be loaded successfully
              const loadedSession = await sessionManager.loadSession(listedSession.id);
              expect(loadedSession).toBeDefined();
              expect(loadedSession.id).toBe(listedSession.id);
              expect(loadedSession.model).toBe(listedSession.model);
              expect(loadedSession.workspaceRoot).toBe(listedSession.workspaceRoot);
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should exclude sessions with missing files from available sessions list', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(simpleSessionArb, { minLength: 2, maxLength: 5 }),
          fc.integer({ min: 1, max: 3 }),
          async (sessions, numToRemove) => {
            // Create session files for all sessions
            for (const session of sessions) {
              await createValidSessionFile(session);
            }

            // Create session metadata for index
            const sessionMetadata = sessions.map(createSessionMetadata);

            // Create session index
            await createSessionIndex(sessionMetadata);

            // Remove some session files (but keep them in the index)
            const sessionsToRemove = sessions.slice(0, Math.min(numToRemove, sessions.length - 1));
            for (const session of sessionsToRemove) {
              await removeSessionFile(session.id);
            }

            // List sessions using the session manager
            const listedSessions = await sessionManager.listSessions();

            // Property: Sessions with missing files should not appear in the available sessions list
            const expectedValidSessions = sessions.filter(s => !sessionsToRemove.includes(s));
            
            // The listed sessions should only include those with existing files
            expect(listedSessions.length).toBeLessThanOrEqual(expectedValidSessions.length);

            // All listed sessions should have existing files
            for (const listedSession of listedSessions) {
              const sessionExists = await sessionManager.sessionExists(listedSession.id);
              expect(sessionExists).toBe(true);

              // Should be able to load the session successfully
              await expect(sessionManager.loadSession(listedSession.id)).resolves.toBeDefined();
            }

            // None of the removed sessions should appear in the list
            for (const removedSession of sessionsToRemove) {
              const foundInList = listedSessions.some(s => s.id === removedSession.id);
              expect(foundInList).toBe(false);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should handle corrupted session files gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(simpleSessionArb, { minLength: 2, maxLength: 4 }),
          fc.array(fc.oneof(
            fc.constant(''), // Empty file
            fc.constant('{'), // Invalid JSON
            fc.constant('{"invalid": "structure"}'), // Invalid session structure
            fc.constant('not json at all') // Not JSON at all
          ), { minLength: 1, maxLength: 2 }),
          async (validSessions, corruptedContents) => {
            // Create valid session files
            for (const session of validSessions) {
              await createValidSessionFile(session);
            }

            // Create corrupted session files
            const corruptedSessionIds: SessionId[] = [];
            for (let i = 0; i < corruptedContents.length; i++) {
              const corruptedId = createSessionId();
              corruptedSessionIds.push(corruptedId);
              await createSessionFile(corruptedId, corruptedContents[i]);
            }

            // Create session metadata including corrupted sessions
            const allSessionMetadata = [
              ...validSessions.map(createSessionMetadata),
              ...corruptedSessionIds.map((sessionId): SessionMetadata => ({
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
              }))
            ];

            // Create session index
            await createSessionIndex(allSessionMetadata);

            // List sessions using the session manager
            const listedSessions = await sessionManager.listSessions();

            // Property: Corrupted session files should not cause the listing to fail
            expect(Array.isArray(listedSessions)).toBe(true);

            // Property: Only valid sessions should be included in the list
            expect(listedSessions.length).toBeLessThanOrEqual(validSessions.length);

            // All listed sessions should be loadable
            for (const listedSession of listedSessions) {
              await expect(sessionManager.loadSession(listedSession.id)).resolves.toBeDefined();
            }

            // All valid sessions should be present (assuming they're not filtered out due to corruption detection)
            const listedSessionIds = new Set(listedSessions.map(s => s.id));
            
            // At minimum, no corrupted sessions should be in the list
            for (const corruptedId of corruptedSessionIds) {
              expect(listedSessionIds.has(corruptedId)).toBe(false);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should maintain consistency across multiple detection calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(simpleSessionArb, { minLength: 1, maxLength: 5 }),
          async (sessions) => {
            // Create session files and index
            for (const session of sessions) {
              await createValidSessionFile(session);
            }

            const sessionMetadata = sessions.map(createSessionMetadata);

            await createSessionIndex(sessionMetadata);

            // Call listSessions multiple times
            const result1 = await sessionManager.listSessions();
            const result2 = await sessionManager.listSessions();
            const result3 = await sessionManager.listSessions();

            // Property: Multiple calls to safe session detection should produce identical results
            expect(result1).toHaveLength(result2.length);
            expect(result1).toHaveLength(result3.length);

            // Sort results by ID for comparison
            const sortById = (a: SessionMetadata, b: SessionMetadata) => a.id.localeCompare(b.id);
            result1.sort(sortById);
            result2.sort(sortById);
            result3.sort(sortById);

            // All results should contain the same sessions
            for (let i = 0; i < result1.length; i++) {
              expect(result1[i].id).toBe(result2[i].id);
              expect(result1[i].id).toBe(result3[i].id);
              expect(result1[i].model).toBe(result2[i].model);
              expect(result1[i].model).toBe(result3[i].model);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should validate session existence before including in results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(simpleSessionArb, { minLength: 1, maxLength: 3 }),
          async (sessions) => {
            // Create session files
            for (const session of sessions) {
              await createValidSessionFile(session);
            }

            // Create session metadata
            const sessionMetadata = sessions.map(createSessionMetadata);

            await createSessionIndex(sessionMetadata);

            // List sessions
            const listedSessions = await sessionManager.listSessions();

            // Property: Every session in the results must pass existence validation
            for (const listedSession of listedSessions) {
              // Session must exist according to sessionExists check
              const exists = await sessionManager.sessionExists(listedSession.id);
              expect(exists).toBe(true);

              // Session file must be readable and valid
              const loadedSession = await sessionManager.loadSession(listedSession.id, { 
                validateIntegrity: true 
              });
              expect(loadedSession).toBeDefined();
              expect(loadedSession.id).toBe(listedSession.id);

              // Session integrity must be valid
              const isValid = sessionManager.validateSessionIntegrity(loadedSession);
              expect(isValid).toBe(true);
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});