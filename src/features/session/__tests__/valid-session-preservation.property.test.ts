/**
 * @fileoverview Property-based tests for valid session preservation
 * **Feature: session-restoration-robustness, Property 13: Valid Session Preservation**
 * **Validates: Requirements 5.2**
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

describe('Property 13: Valid Session Preservation', () => {
  let validator: SessionValidator;
  let storage: SessionStorage;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'valid-session-preservation-test-'));
    
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
  });

  // =============================================================================
  // PROPERTY TESTS
  // =============================================================================

  /**
   * Property 13: Valid Session Preservation
   * For any valid session with both file and index entry, cleanup operations 
   * must preserve the session without modification.
   * **Validates: Requirements 5.2**
   */
  it('should preserve valid sessions during cleanup operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.uuid().map(uuid => uuid as SessionId),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            messageContent: fc.string({ minLength: 1, maxLength: 200 }),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
            model: fc.constantFrom('gpt-4o', 'gpt-4', 'claude-3-opus', 'claude-3-sonnet'),
            provider: fc.constantFrom('openai', 'anthropic'),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (validSessionConfigs) => {
          const originalSessions: Record<SessionId, Session> = {};

          // Create valid sessions (both file and index entry)
          for (const config of validSessionConfigs) {
            const session = createTestSession({
              id: config.sessionId,
              title: config.title,
              tags: config.tags,
              model: config.model,
              provider: config.provider,
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
            await storage.writeSession(config.sessionId, session);
          }

          // Get initial state
          const initialIndex = await storage.getIndex();
          const initialSessionCount = Object.keys(initialIndex.sessions).length;

          // Perform validation and cleanup operations
          const validationResult = await validator.validateSessionIndex();
          const cleanupResult = await validator.cleanupOrphanedEntries();

          // Property: Valid sessions should remain in the index
          const finalIndex = await storage.getIndex();
          
          for (const config of validSessionConfigs) {
            const sessionId = config.sessionId;
            
            // Session should still exist in index
            expect(finalIndex.sessions[sessionId]).toBeDefined();
            
            // Session metadata should be preserved
            const metadata = finalIndex.sessions[sessionId]!;
            expect(metadata.id).toBe(sessionId);
            expect(metadata.title).toBe(config.title);
            expect(metadata.tags).toEqual(config.tags);
            expect(metadata.model).toBe(config.model);
            expect(metadata.provider).toBe(config.provider);
          }

          // Property: Valid sessions should not be included in cleaned sessions
          for (const sessionId of Object.keys(originalSessions)) {
            expect(cleanupResult.cleanedSessions).not.toContain(sessionId);
          }

          // Property: Session files should remain accessible
          for (const config of validSessionConfigs) {
            const restoredSession = await storage.readSession(config.sessionId);
            const originalSession = originalSessions[config.sessionId];

            // Core session data should be preserved
            expect(restoredSession.id).toBe(originalSession.id);
            expect(restoredSession.title).toBe(originalSession.title);
            expect(restoredSession.tags).toEqual(originalSession.tags);
            expect(restoredSession.model).toBe(originalSession.model);
            expect(restoredSession.provider).toBe(originalSession.provider);
            expect(restoredSession.messages.length).toBe(originalSession.messages.length);
            
            if (restoredSession.messages.length > 0 && originalSession.messages.length > 0) {
              expect(restoredSession.messages[0].content).toBe(originalSession.messages[0].content);
            }
          }

          // Property: Total number of valid sessions should be preserved
          expect(Object.keys(finalIndex.sessions).length).toBeGreaterThanOrEqual(initialSessionCount);

          // Property: Valid sessions should not be reported as orphaned
          for (const sessionId of Object.keys(originalSessions)) {
            const isOrphanedEntry = validationResult.orphanedEntries.includes(sessionId);
            expect(isOrphanedEntry).toBe(false);
            
            const { getSessionFilePath } = await import('../filesystem.js');
            const filePath = getSessionFilePath(sessionId);
            const isOrphanedFile = validationResult.orphanedFiles.some(orphanedPath => 
              orphanedPath === filePath || orphanedPath.endsWith(`${sessionId}.json`)
            );
            expect(isOrphanedFile).toBe(false);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Valid sessions should be preserved across multiple cleanup cycles
   * For any valid session, multiple cleanup operations should not affect it.
   */
  it('should preserve valid sessions across multiple cleanup cycles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.uuid().map(uuid => uuid as SessionId),
            title: fc.string({ minLength: 1, maxLength: 50 }),
            workspaceRoot: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (sessionConfigs) => {
          const originalSessions: Record<SessionId, Session> = {};

          // Create valid sessions
          for (const config of sessionConfigs) {
            const session = createTestSession({
              id: config.sessionId,
              title: config.title,
              workspaceRoot: config.workspaceRoot,
            });
            
            originalSessions[config.sessionId] = session;
            await storage.writeSession(config.sessionId, session);
          }

          // Perform multiple cleanup cycles
          const cleanupResults = [];
          for (let i = 0; i < 3; i++) {
            await validator.validateSessionIndex();
            const cleanupResult = await validator.cleanupOrphanedEntries();
            cleanupResults.push(cleanupResult);
          }

          // Property: Valid sessions should not be cleaned in any cycle
          for (const result of cleanupResults) {
            for (const sessionId of Object.keys(originalSessions)) {
              expect(result.cleanedSessions).not.toContain(sessionId);
            }
          }

          // Property: Session data should remain consistent across cycles
          const finalIndex = await storage.getIndex();
          
          for (const config of sessionConfigs) {
            const sessionId = config.sessionId;
            
            // Session should still exist
            expect(finalIndex.sessions[sessionId]).toBeDefined();
            
            // Session should be readable
            const restoredSession = await storage.readSession(sessionId);
            const originalSession = originalSessions[sessionId];
            
            expect(restoredSession.id).toBe(originalSession.id);
            expect(restoredSession.title).toBe(originalSession.title);
            expect(restoredSession.workspaceRoot).toBe(originalSession.workspaceRoot);
          }

          // Property: No errors should occur during cleanup of valid sessions
          for (const result of cleanupResults) {
            const errorsRelatedToValidSessions = result.errors.filter(error => 
              Object.keys(originalSessions).some(sessionId => 
                error.sessionId === sessionId || error.error.includes(sessionId)
              )
            );
            expect(errorsRelatedToValidSessions).toHaveLength(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Valid sessions should be preserved when mixed with invalid sessions
   * For any combination of valid and invalid sessions, cleanup should only 
   * affect invalid sessions while preserving valid ones.
   */
  it('should preserve valid sessions when mixed with invalid sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          validSessions: fc.array(
            fc.record({
              sessionId: fc.uuid().map(uuid => uuid as SessionId),
              title: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          orphanedEntries: fc.array(
            fc.uuid().map(uuid => uuid as SessionId),
            { minLength: 0, maxLength: 3 }
          ),
          orphanedFiles: fc.array(
            fc.uuid().map(uuid => uuid as SessionId),
            { minLength: 0, maxLength: 3 }
          ),
        }).filter(({ validSessions, orphanedEntries, orphanedFiles }) => {
          // Ensure all session IDs are unique across all arrays
          const allIds = [
            ...validSessions.map(s => s.sessionId),
            ...orphanedEntries,
            ...orphanedFiles
          ];
          const uniqueIds = new Set(allIds);
          return uniqueIds.size === allIds.length;
        }),
        async ({ validSessions, orphanedEntries, orphanedFiles }) => {
          const originalValidSessions: Record<SessionId, Session> = {};

          // Create valid sessions (both file and index entry)
          for (const config of validSessions) {
            const session = createTestSession({
              id: config.sessionId,
              title: config.title,
            });
            
            originalValidSessions[config.sessionId] = session;
            await storage.writeSession(config.sessionId, session);
          }

          // Create orphaned entries (index entries without files)
          const indexSessions: Record<string, any> = {};
          
          // Add valid sessions to index (already done by writeSession)
          const currentIndex = await storage.getIndex();
          Object.assign(indexSessions, currentIndex.sessions);
          
          // Add orphaned entries
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

          // Create orphaned files (files without index entries)
          for (const sessionId of orphanedFiles) {
            const session = createTestSession({
              id: sessionId,
              title: `Orphaned File ${sessionId}`,
            });
            
            // Use storage.writeSession to create properly formatted files, then remove from index
            await storage.writeSession(sessionId, session);
          }

          // Update index with orphaned entries (but exclude the orphaned files)
          const { atomicWriteFile, getSessionIndexPath } = await import('../filesystem.js');
          
          // Remove orphaned files from the index to make them truly orphaned
          for (const sessionId of orphanedFiles) {
            delete indexSessions[sessionId];
          }
          
          const testIndex: SessionIndex = {
            version: '1.0.0',
            lastUpdated: Date.now(),
            sessions: indexSessions,
          };
          await atomicWriteFile(getSessionIndexPath(), JSON.stringify(testIndex, null, 2));

          // Perform cleanup
          const validationResult = await validator.validateSessionIndex();
          const cleanupResult = await validator.cleanupOrphanedEntries();

          // Property: Valid sessions should be preserved
          const finalIndex = await storage.getIndex();
          
          for (const config of validSessions) {
            const sessionId = config.sessionId;
            
            // Should still exist in index
            expect(finalIndex.sessions[sessionId]).toBeDefined();
            expect(finalIndex.sessions[sessionId]!.id).toBe(sessionId);
            expect(finalIndex.sessions[sessionId]!.title).toBe(config.title);
            
            // Should be readable
            const restoredSession = await storage.readSession(sessionId);
            expect(restoredSession.id).toBe(sessionId);
            expect(restoredSession.title).toBe(config.title);
            
            // Should not be in cleaned sessions list
            expect(cleanupResult.cleanedSessions).not.toContain(sessionId);
          }

          // Property: Orphaned entries should be cleaned but valid sessions preserved
          for (const sessionId of orphanedEntries) {
            expect(finalIndex.sessions[sessionId]).toBeUndefined();
            expect(cleanupResult.cleanedSessions).toContain(sessionId);
          }

          // Property: Orphaned files should be processed but valid sessions preserved
          for (const sessionId of orphanedFiles) {
            // Orphaned files should now have index entries (if they were valid)
            expect(finalIndex.sessions[sessionId]).toBeDefined();
            expect(cleanupResult.cleanedSessions).toContain(sessionId);
          }

          // Property: Valid sessions should not appear in validation issues
          for (const sessionId of Object.keys(originalValidSessions)) {
            expect(validationResult.orphanedEntries).not.toContain(sessionId);
            
            const { getSessionFilePath } = await import('../filesystem.js');
            const filePath = getSessionFilePath(sessionId);
            const isOrphanedFile = validationResult.orphanedFiles.some(orphanedPath => 
              orphanedPath === filePath || orphanedPath.endsWith(`${sessionId}.json`)
            );
            expect(isOrphanedFile).toBe(false);
          }

          // Property: Total valid sessions should be preserved or increased
          const validSessionCount = validSessions.length;
          const finalValidSessionCount = Object.keys(finalIndex.sessions).filter(sessionId => 
            Object.keys(originalValidSessions).includes(sessionId)
          ).length;
          
          expect(finalValidSessionCount).toBe(validSessionCount);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Valid session metadata should remain consistent during cleanup
   * For any valid session, all metadata fields should be preserved exactly
   * during cleanup operations.
   */
  it('should preserve all metadata fields of valid sessions during cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.uuid().map(uuid => uuid as SessionId),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            workspaceRoot: fc.string({ minLength: 1, maxLength: 100 }),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
            model: fc.constantFrom('gpt-4o', 'gpt-4', 'claude-3-opus'),
            provider: fc.constantFrom('openai', 'anthropic'),
            messageCount: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        async (sessionConfigs) => {
          const originalSessions: Record<SessionId, Session> = {};
          const originalMetadata: Record<SessionId, any> = {};

          // Create valid sessions with specific metadata
          for (const config of sessionConfigs) {
            const messages = Array.from({ length: config.messageCount }, (_, i) => ({
              id: createMessageId(),
              role: i % 2 === 0 ? 'user' : 'assistant' as const,
              content: `Message ${i + 1}`,
              timestamp: Date.now() + i,
            }));

            const session = createTestSession({
              id: config.sessionId,
              title: config.title,
              workspaceRoot: config.workspaceRoot,
              tags: config.tags,
              model: config.model,
              provider: config.provider,
              messages,
            });
            
            originalSessions[config.sessionId] = session;
            await storage.writeSession(config.sessionId, session);
            
            // Store original metadata for comparison
            const index = await storage.getIndex();
            originalMetadata[config.sessionId] = index.sessions[config.sessionId];
          }

          // Perform cleanup operations
          await validator.validateSessionIndex();
          await validator.cleanupOrphanedEntries();

          // Property: All metadata fields should be preserved exactly
          const finalIndex = await storage.getIndex();
          
          for (const config of sessionConfigs) {
            const sessionId = config.sessionId;
            const originalMeta = originalMetadata[sessionId];
            const finalMeta = finalIndex.sessions[sessionId];
            
            expect(finalMeta).toBeDefined();
            
            // Core metadata fields should be identical
            expect(finalMeta!.id).toBe(originalMeta.id);
            expect(finalMeta!.title).toBe(originalMeta.title);
            expect(finalMeta!.workspaceRoot).toBe(originalMeta.workspaceRoot);
            expect(finalMeta!.tags).toEqual(originalMeta.tags);
            expect(finalMeta!.model).toBe(originalMeta.model);
            expect(finalMeta!.provider).toBe(originalMeta.provider);
            expect(finalMeta!.messageCount).toBe(originalMeta.messageCount);
            expect(finalMeta!.created).toBe(originalMeta.created);
            
            // Token count should be preserved
            expect(finalMeta!.tokenCount).toEqual(originalMeta.tokenCount);
            
            // Context files should be preserved
            expect(finalMeta!.contextFiles).toEqual(originalMeta.contextFiles);
            
            // Preview and lastMessage should be preserved if they existed
            if (originalMeta.preview) {
              expect(finalMeta!.preview).toBe(originalMeta.preview);
            }
            if (originalMeta.lastMessage) {
              expect(finalMeta!.lastMessage).toBe(originalMeta.lastMessage);
            }
          }

          // Property: Session file content should remain unchanged
          for (const config of sessionConfigs) {
            const restoredSession = await storage.readSession(config.sessionId);
            const originalSession = originalSessions[config.sessionId];
            
            // Deep comparison of session content
            expect(restoredSession.id).toBe(originalSession.id);
            expect(restoredSession.title).toBe(originalSession.title);
            expect(restoredSession.workspaceRoot).toBe(originalSession.workspaceRoot);
            expect(restoredSession.tags).toEqual(originalSession.tags);
            expect(restoredSession.model).toBe(originalSession.model);
            expect(restoredSession.provider).toBe(originalSession.provider);
            expect(restoredSession.messages).toEqual(originalSession.messages);
            expect(restoredSession.tokenCount).toEqual(originalSession.tokenCount);
            expect(restoredSession.contextFiles).toEqual(originalSession.contextFiles);
            expect(restoredSession.filesAccessed).toEqual(originalSession.filesAccessed);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});