/**
 * @fileoverview Property-based tests for orphaned file handling
 * **Feature: session-restoration-robustness, Property 8: Orphaned File Handling**
 * **Validates: Requirements 3.3**
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
  type SessionIndex,
} from '../../../shared/types/index.js';

// Mock the config loader
vi.mock('../../../config/loader.js', () => ({
  getSessionsDir: vi.fn(),
}));

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

describe('Property 8: Orphaned File Handling', () => {
  let validator: SessionValidator;
  let storage: SessionStorage;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orphaned-file-test-'));
    
    // Mock getSessionsDir to use our test directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(testDir);
    
    storage = new SessionStorage();
    validator = new SessionValidator();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    // Force garbage collection if available
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
    }
    
    // Small delay to allow cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 5));
  });

  // =============================================================================
  // PROPERTY TESTS
  // =============================================================================

  /**
   * Property 8: Orphaned File Handling
   * For any orphaned session file (file without index entry), the system must 
   * either recreate the index entry or remove the file.
   * **Validates: Requirements 3.3**
   */
  it('should handle orphaned files by recreating index entries or removing files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.string({ minLength: 8, maxLength: 36 }).map(s => `session-${s}` as SessionId),
            hasValidContent: fc.boolean(),
            shouldRecreateEntry: fc.boolean(),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (orphanedFileConfigs) => {
          // Create orphaned session files (files without index entries)
          const orphanedFiles: SessionId[] = [];
          const validOrphanedFiles: SessionId[] = [];
          const invalidOrphanedFiles: SessionId[] = [];

          for (const config of orphanedFileConfigs) {
            if (config.hasValidContent) {
              // Create valid session file without index entry
              const session = createTestSession({
                id: config.sessionId,
                title: `Orphaned Session ${config.sessionId}`,
              });
              
              // Write session file directly without using storage (to avoid index update)
              const { atomicWriteFile, getSessionFilePath } = await import('../filesystem.js');
              await atomicWriteFile(
                getSessionFilePath(config.sessionId), 
                JSON.stringify(session, null, 2)
              );
              
              orphanedFiles.push(config.sessionId);
              validOrphanedFiles.push(config.sessionId);
            } else {
              // Create invalid/corrupted session file
              const { atomicWriteFile, getSessionFilePath } = await import('../filesystem.js');
              await atomicWriteFile(
                getSessionFilePath(config.sessionId), 
                '{ "invalid": "json content", "missing": "required fields" }'
              );
              
              orphanedFiles.push(config.sessionId);
              invalidOrphanedFiles.push(config.sessionId);
            }
          }

          // Ensure we have an empty index initially
          const { atomicWriteFile, getSessionIndexPath } = await import('../filesystem.js');
          const emptyIndex: SessionIndex = {
            version: '1.0.0',
            lastUpdated: Date.now(),
            sessions: {},
          };
          await atomicWriteFile(getSessionIndexPath(), JSON.stringify(emptyIndex, null, 2));

          // Perform validation to detect orphaned files
          const validationResult = await validator.validateSessionIndex();

          // Property: All orphaned files should be detected
          expect(validationResult.orphanedFiles.length).toBe(orphanedFiles.length);

          // Property: Each orphaned file should be in the orphaned files list
          for (const sessionId of orphanedFiles) {
            const { getSessionFilePath } = await import('../filesystem.js');
            const expectedFilePath = getSessionFilePath(sessionId);
            const isDetected = validationResult.orphanedFiles.some(filePath => 
              filePath.includes(sessionId)
            );
            expect(isDetected).toBe(true);
          }

          // Perform cleanup to handle orphaned files
          const cleanupResult = await validator.cleanupOrphanedEntries();

          // Property: Valid orphaned files should have index entries recreated
          const indexAfterCleanup = await storage.getIndex();
          
          for (const sessionId of validOrphanedFiles) {
            const hasIndexEntry = indexAfterCleanup.sessions[sessionId] !== undefined;
            expect(hasIndexEntry).toBe(true);
            
            if (hasIndexEntry) {
              const metadata = indexAfterCleanup.sessions[sessionId]!;
              expect(metadata.id).toBe(sessionId);
              expect(metadata.title).toContain('Orphaned Session');
            }
          }

          // Property: Cleanup should report the number of orphaned files processed
          expect(cleanupResult.orphanedFilesProcessed).toBe(validOrphanedFiles.length);

          // Property: Invalid orphaned files should be logged as warnings but not deleted
          // (They require manual review)
          if (invalidOrphanedFiles.length > 0) {
            expect(cleanupResult.warnings.length).toBeGreaterThan(0);
            
            // Check that warnings mention corrupted files
            const hasCorruptedWarning = cleanupResult.warnings.some(warning => 
              warning.includes('corrupted') || warning.includes('manual review')
            );
            expect(hasCorruptedWarning).toBe(true);
          }

          // Property: All processed orphaned files should be tracked in cleaned sessions
          for (const sessionId of validOrphanedFiles) {
            expect(cleanupResult.cleanedSessions).toContain(sessionId);
          }

          // Property: After cleanup, validation should show no orphaned files for valid sessions
          const finalValidation = await validator.validateSessionIndex();
          
          // Valid orphaned files should no longer be orphaned (they have index entries now)
          for (const sessionId of validOrphanedFiles) {
            const { getSessionFilePath } = await import('../filesystem.js');
            const filePath = getSessionFilePath(sessionId);
            const isStillOrphaned = finalValidation.orphanedFiles.some(orphanedPath => 
              orphanedPath.includes(sessionId)
            );
            expect(isStillOrphaned).toBe(false);
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Orphaned file detection should be consistent across multiple runs
   * For any set of orphaned files, detection should be deterministic and complete.
   */
  it('should consistently detect all orphaned files across multiple validation runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 8, maxLength: 36 }).map(s => `session-${s}` as SessionId),
          { minLength: 1, maxLength: 2 }
        ),
        async (sessionIds) => {
          // Create orphaned session files
          for (const sessionId of sessionIds) {
            const session = createTestSession({
              id: sessionId,
              title: `Consistent Test ${sessionId}`,
            });
            
            const { atomicWriteFile, getSessionFilePath } = await import('../filesystem.js');
            await atomicWriteFile(
              getSessionFilePath(sessionId), 
              JSON.stringify(session, null, 2)
            );
          }

          // Create empty index
          const { atomicWriteFile, getSessionIndexPath } = await import('../filesystem.js');
          const emptyIndex: SessionIndex = {
            version: '1.0.0',
            lastUpdated: Date.now(),
            sessions: {},
          };
          await atomicWriteFile(getSessionIndexPath(), JSON.stringify(emptyIndex, null, 2));

          // Run validation multiple times
          const validationResults = await Promise.all([
            validator.validateSessionIndex(),
            validator.validateSessionIndex(),
            validator.validateSessionIndex(),
          ]);

          // Property: All validation runs should detect the same orphaned files
          const firstRunOrphanedCount = validationResults[0].orphanedFiles.length;
          
          for (const result of validationResults) {
            expect(result.orphanedFiles.length).toBe(firstRunOrphanedCount);
            expect(result.orphanedFiles.length).toBe(sessionIds.length);
          }

          // Property: Each session should be detected as orphaned in all runs
          for (const sessionId of sessionIds) {
            for (const result of validationResults) {
              const isDetected = result.orphanedFiles.some(filePath => 
                filePath.includes(sessionId)
              );
              expect(isDetected).toBe(true);
            }
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Orphaned file handling should preserve file content integrity
   * For any valid orphaned file that gets an index entry recreated, the content
   * should remain unchanged and accessible.
   */
  it('should preserve file content integrity when recreating index entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.string({ minLength: 8, maxLength: 36 }).map(s => `session-${s}` as SessionId),
            title: fc.string({ minLength: 1, maxLength: 50 }),
            messageContent: fc.string({ minLength: 1, maxLength: 100 }),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (sessionConfigs) => {
          const originalSessions: Record<SessionId, Session> = {};

          // Create orphaned session files with specific content
          for (const config of sessionConfigs) {
            const session = createTestSession({
              id: config.sessionId,
              title: config.title,
              tags: config.tags,
              messages: [
                {
                  id: createMessageId(),
                  role: 'user',
                  content: config.messageContent,
                  timestamp: Date.now(),
                },
              ],
            });
            
            originalSessions[config.sessionId] = session;
            
            const { atomicWriteFile, getSessionFilePath } = await import('../filesystem.js');
            await atomicWriteFile(
              getSessionFilePath(config.sessionId), 
              JSON.stringify(session, null, 2)
            );
          }

          // Create empty index
          const { atomicWriteFile, getSessionIndexPath } = await import('../filesystem.js');
          const emptyIndex: SessionIndex = {
            version: '1.0.0',
            lastUpdated: Date.now(),
            sessions: {},
          };
          await atomicWriteFile(getSessionIndexPath(), JSON.stringify(emptyIndex, null, 2));

          // Perform cleanup to recreate index entries
          await validator.cleanupOrphanedEntries();

          // Property: All original session content should be preserved
          for (const config of sessionConfigs) {
            const restoredSession = await storage.readSession(config.sessionId);
            const originalSession = originalSessions[config.sessionId];

            // Content integrity checks
            expect(restoredSession.id).toBe(originalSession.id);
            expect(restoredSession.title).toBe(originalSession.title);
            expect(restoredSession.tags).toEqual(originalSession.tags);
            expect(restoredSession.messages.length).toBe(originalSession.messages.length);
            
            if (restoredSession.messages.length > 0 && originalSession.messages.length > 0) {
              expect(restoredSession.messages[0].content).toBe(originalSession.messages[0].content);
            }

            // Metadata should be correctly generated
            const indexAfterCleanup = await storage.getIndex();
            const metadata = indexAfterCleanup.sessions[config.sessionId];
            
            expect(metadata).toBeDefined();
            expect(metadata!.id).toBe(config.sessionId);
            expect(metadata!.title).toBe(config.title);
            expect(metadata!.tags).toEqual(config.tags);
            expect(metadata!.messageCount).toBe(1);
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Mixed scenarios with both orphaned entries and orphaned files
   * For any combination of orphaned entries and orphaned files, cleanup should
   * handle both types correctly without interference.
   */
  it('should handle mixed scenarios with both orphaned entries and orphaned files', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          orphanedEntries: fc.array(
            fc.string({ minLength: 8, maxLength: 36 }).map(s => `entry-${s}` as SessionId),
            { minLength: 0, maxLength: 3 }
          ),
          orphanedFiles: fc.array(
            fc.string({ minLength: 8, maxLength: 36 }).map(s => `file-${s}` as SessionId),
            { minLength: 1, maxLength: 3 }
          ),
          validSessions: fc.array(
            fc.string({ minLength: 8, maxLength: 36 }).map(s => `valid-${s}` as SessionId),
            { minLength: 0, maxLength: 3 }
          ),
        }),
        async ({ orphanedEntries, orphanedFiles, validSessions }) => {
          // Create index with orphaned entries and valid sessions
          const indexSessions: Record<string, any> = {};
          
          // Add orphaned entries (entries without files)
          for (const sessionId of orphanedEntries) {
            indexSessions[sessionId] = {
              id: sessionId,
              created: Date.now(),
              lastModified: Date.now(),
              model: 'gpt-4',
              provider: 'openai',
              tokenCount: { total: 100, input: 50, output: 50 },
              title: `Orphaned Entry ${sessionId}`,
              workspaceRoot: '/test',
              messageCount: 1,
              tags: [],
              contextFiles: [],
            };
          }

          // Add valid sessions (both file and index entry)
          for (const sessionId of validSessions) {
            const session = createTestSession({
              id: sessionId,
              title: `Valid Session ${sessionId}`,
            });
            
            await storage.writeSession(sessionId, session);
            
            // The storage.writeSession should have added to index, but let's ensure it
            const metadata = {
              id: sessionId,
              created: session.created,
              lastModified: session.lastModified,
              model: session.model,
              provider: session.provider,
              tokenCount: session.tokenCount,
              title: session.title,
              workspaceRoot: session.workspaceRoot,
              messageCount: session.messages.length,
              tags: session.tags,
              contextFiles: session.contextFiles,
            };
            indexSessions[sessionId] = metadata;
          }

          // Create orphaned files (files without index entries)
          for (const sessionId of orphanedFiles) {
            const session = createTestSession({
              id: sessionId,
              title: `Orphaned File ${sessionId}`,
            });
            
            const { atomicWriteFile, getSessionFilePath } = await import('../filesystem.js');
            await atomicWriteFile(
              getSessionFilePath(sessionId), 
              JSON.stringify(session, null, 2)
            );
          }

          // Write the index with orphaned entries and valid sessions
          const { atomicWriteFile, getSessionIndexPath } = await import('../filesystem.js');
          const testIndex: SessionIndex = {
            version: '1.0.0',
            lastUpdated: Date.now(),
            sessions: indexSessions,
          };
          await atomicWriteFile(getSessionIndexPath(), JSON.stringify(testIndex, null, 2));

          // Perform validation and cleanup
          const validationResult = await validator.validateSessionIndex();
          const cleanupResult = await validator.cleanupOrphanedEntries();

          // Property: Orphaned entries should be detected and removed
          expect(validationResult.orphanedEntries.length).toBe(orphanedEntries.length);
          expect(cleanupResult.orphanedEntriesRemoved).toBe(orphanedEntries.length);

          // Property: Orphaned files should be detected and processed
          expect(validationResult.orphanedFiles.length).toBe(orphanedFiles.length);
          expect(cleanupResult.orphanedFilesProcessed).toBe(orphanedFiles.length);

          // Property: Valid sessions should remain untouched
          const finalIndex = await storage.getIndex();
          
          for (const sessionId of validSessions) {
            expect(finalIndex.sessions[sessionId]).toBeDefined();
            expect(finalIndex.sessions[sessionId]!.id).toBe(sessionId);
          }

          // Property: Orphaned entries should be removed from final index
          for (const sessionId of orphanedEntries) {
            expect(finalIndex.sessions[sessionId]).toBeUndefined();
          }

          // Property: Orphaned files should now have index entries
          for (const sessionId of orphanedFiles) {
            expect(finalIndex.sessions[sessionId]).toBeDefined();
            expect(finalIndex.sessions[sessionId]!.id).toBe(sessionId);
          }

          // Property: Total cleaned sessions should equal orphaned entries + orphaned files
          const expectedCleanedCount = orphanedEntries.length + orphanedFiles.length;
          expect(cleanupResult.cleanedSessions.length).toBe(expectedCleanedCount);
        }
      ),
      { numRuns: 5 }
    );
  });
});