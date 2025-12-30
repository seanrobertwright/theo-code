/**
 * @fileoverview Property tests for orphaned entry cleanup functionality
 * @module features/session/__tests__/orphaned-entry-cleanup.property
 * 
 * Feature: session-restoration-robustness, Property 7: Orphaned Entry Cleanup
 * Validates: Requirements 3.2, 5.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { promises as fs } from 'fs';
import path from 'path';
import { createSafeSessionManager, type ISafeSessionManager } from '../safe-session-manager.js';
import type { SessionId, SessionMetadata } from '../../../shared/types/index.js';

// Mock the filesystem functions to use test directory
let testSessionsDir: string;

vi.mock('../filesystem.js', async () => {
  const actual = await vi.importActual('../filesystem.js');
  return {
    ...actual,
    getSessionFilePath: (sessionId: string) => path.join(testSessionsDir, `${sessionId}.json`),
    getSessionIndexPath: () => path.join(testSessionsDir, 'index.json'),
    getSessionsDir: () => testSessionsDir,
    fileExists: async (filePath: string) => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    safeReadFile: async (filePath: string, options?: any) => {
      return await fs.readFile(filePath, 'utf-8');
    },
    listSessionFiles: async () => {
      try {
        const files = await fs.readdir(testSessionsDir);
        return files
          .filter(file => file.endsWith('.json') && file !== 'index.json')
          .map(file => path.join(testSessionsDir, file));
      } catch (error) {
        return [];
      }
    },
    atomicWriteFile: async (filePath: string, content: string, options?: any) => {
      await fs.writeFile(filePath, content, 'utf-8');
    },
    decompressData: async (data: string) => {
      // For testing, assume data is not compressed
      return data;
    },
  };
});

describe('Property 7: Orphaned Entry Cleanup', () => {
  let testDir: string;
  let indexPath: string;
  let safeSessionManager: ISafeSessionManager;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-temp', `orphaned-cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    testSessionsDir = testDir;
    indexPath = path.join(testDir, 'index.json');
    
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize safe session manager
    safeSessionManager = createSafeSessionManager();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Property 7: Orphaned Entry Cleanup
   * For any orphaned index entry (entry without corresponding file), 
   * the entry must be removed from the index during integrity checks.
   */
  it('should remove orphaned entries from index during integrity checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 0, max: 999999 }).map(n => `session${n}${Date.now()}${Math.random().toString(36).slice(2)}` as SessionId),
            title: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            created: fc.integer({ min: Date.now() - 30 * 24 * 60 * 60 * 1000, max: Date.now() }),
            lastModified: fc.integer({ min: Date.now() - 30 * 24 * 60 * 60 * 1000, max: Date.now() }),
            model: fc.constantFrom('gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022'),
            provider: fc.constantFrom('openai', 'anthropic'),
            messageCount: fc.integer({ min: 0, max: 100 }),
            tokenCount: fc.record({
              total: fc.integer({ min: 0, max: 10000 }),
              input: fc.integer({ min: 0, max: 5000 }),
              output: fc.integer({ min: 0, max: 5000 })
            }),
            workspaceRoot: fc.constant('/test/workspace'),
            contextFiles: fc.array(fc.string(), { maxLength: 5 }),
            tags: fc.array(fc.string(), { maxLength: 3 }),
            preview: fc.option(fc.string({ maxLength: 100 }), { nil: undefined })
          }),
          { minLength: 1, maxLength: 5 }
        ).map(sessions => {
          // Ensure unique IDs by adding index
          return sessions.map((session, index) => ({
            ...session,
            id: `session${index}${Date.now()}${Math.random().toString(36).slice(2)}` as SessionId
          }));
        }),
        // Generate which sessions should be orphaned (have index entry but no file)
        fc.array(fc.boolean()),
        async (sessions, orphanFlags) => {
          // Ensure orphanFlags array matches sessions length
          const actualOrphanFlags = orphanFlags.slice(0, sessions.length);
          while (actualOrphanFlags.length < sessions.length) {
            actualOrphanFlags.push(false);
          }

          // Create index with all sessions
          const indexData = {
            sessions: sessions.reduce((acc, session) => {
              acc[session.id] = {
                id: session.id,
                title: session.title,
                created: session.created,
                lastModified: session.lastModified,
                model: session.model,
                provider: session.provider,
                messageCount: session.messageCount,
                tokenCount: session.tokenCount,
                workspaceRoot: session.workspaceRoot,
                contextFiles: session.contextFiles,
                tags: session.tags,
                preview: session.preview
              };
              return acc;
            }, {} as Record<string, SessionMetadata>),
            lastUpdated: Date.now()
          };

          await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));

          // Debug: Check if index file was created and can be read
          console.log('Index path:', indexPath);
          console.log('Index exists:', await fs.access(indexPath).then(() => true).catch(() => false));
          console.log('Index content:', await fs.readFile(indexPath, 'utf-8').catch(e => `Error: ${e.message}`));

          // Create session files only for non-orphaned sessions
          const expectedValidSessions: SessionId[] = [];
          const expectedOrphanedSessions: SessionId[] = [];

          for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const isOrphaned = actualOrphanFlags[i];

            if (isOrphaned) {
              expectedOrphanedSessions.push(session.id);
              // Don't create the session file - this makes it orphaned
            } else {
              expectedValidSessions.push(session.id);
              // Create the session file
              const sessionFilePath = path.join(testDir, `${session.id}.json`);
              const sessionData = {
                id: session.id,
                messages: [],
                metadata: session,
                created: session.created,
                lastModified: session.lastModified
              };
              await fs.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2));
            }
          }

          // Skip test if no orphaned sessions (nothing to test)
          if (expectedOrphanedSessions.length === 0) {
            return;
          }

          // Perform integrity check which should clean up orphaned entries
          const integrityResult = await safeSessionManager.getValidator().performStartupIntegrityCheck();

          console.log('Integrity result:', {
            success: integrityResult.success,
            orphanedEntries: integrityResult.indexValidation.orphanedEntries,
            orphanedFiles: integrityResult.indexValidation.orphanedFiles,
            totalSessions: integrityResult.indexValidation.totalSessions,
            validSessions: integrityResult.indexValidation.validSessions,
            expectedOrphanedSessions,
            expectedValidSessions
          });

          // Verify orphaned entries were detected
          expect(integrityResult.indexValidation.orphanedEntries.length).toBeGreaterThan(0);
          
          // Verify all orphaned entries are in the expected list
          for (const orphanedId of integrityResult.indexValidation.orphanedEntries) {
            expect(expectedOrphanedSessions).toContain(orphanedId);
          }

          // Read the updated index
          const updatedIndexContent = await fs.readFile(indexPath, 'utf-8');
          const updatedIndex = JSON.parse(updatedIndexContent);

          // Verify orphaned entries were removed from index
          for (const orphanedId of expectedOrphanedSessions) {
            expect(updatedIndex.sessions[orphanedId]).toBeUndefined();
          }

          // Verify valid sessions remain in index
          for (const validId of expectedValidSessions) {
            expect(updatedIndex.sessions[validId]).toBeDefined();
            expect(updatedIndex.sessions[validId].id).toBe(validId);
          }

          // Verify cleanup was reported
          expect(integrityResult.issuesResolved).toBe(true);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Additional property: Cleanup preserves valid sessions
   * For any cleanup operation, valid sessions (those with both index entry and file)
   * must remain unchanged in the index.
   */
  it('should preserve valid sessions during orphaned entry cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 0, max: 999999 }).map(n => `session${n}${Date.now()}${Math.random().toString(36).slice(2)}` as SessionId),
            title: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            created: fc.integer({ min: Date.now() - 30 * 24 * 60 * 60 * 1000, max: Date.now() }),
            lastModified: fc.integer({ min: Date.now() - 30 * 24 * 60 * 60 * 1000, max: Date.now() }),
            model: fc.constantFrom('gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022'),
            provider: fc.constantFrom('openai', 'anthropic'),
            messageCount: fc.integer({ min: 0, max: 100 }),
            tokenCount: fc.record({
              total: fc.integer({ min: 0, max: 10000 }),
              input: fc.integer({ min: 0, max: 5000 }),
              output: fc.integer({ min: 0, max: 5000 })
            }),
            workspaceRoot: fc.constant('/test/workspace'),
            contextFiles: fc.array(fc.string(), { maxLength: 3 }),
            tags: fc.array(fc.string(), { maxLength: 2 }),
            preview: fc.option(fc.string({ maxLength: 100 }), { nil: undefined })
          }),
          { minLength: 2, maxLength: 4 }
        ).map(sessions => {
          // Ensure unique IDs by adding index
          return sessions.map((session, index) => ({
            ...session,
            id: `session${index}${Date.now()}${Math.random().toString(36).slice(2)}` as SessionId
          }));
        }),
        async (sessions) => {
          // Create index with all sessions
          const indexData = {
            sessions: sessions.reduce((acc, session) => {
              acc[session.id] = {
                id: session.id,
                title: session.title,
                created: session.created,
                lastModified: session.lastModified,
                model: session.model,
                provider: session.provider,
                messageCount: session.messageCount,
                tokenCount: session.tokenCount,
                workspaceRoot: session.workspaceRoot,
                contextFiles: session.contextFiles,
                tags: session.tags,
                preview: session.preview
              };
              return acc;
            }, {} as Record<string, SessionMetadata>),
            lastUpdated: Date.now()
          };

          await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));

          // Create files for first half of sessions (valid), leave second half orphaned
          const validSessions = sessions.slice(0, Math.ceil(sessions.length / 2));
          const orphanedSessions = sessions.slice(Math.ceil(sessions.length / 2));

          // Create session files for valid sessions
          for (const session of validSessions) {
            const sessionFilePath = path.join(testDir, `${session.id}.json`);
            const sessionData = {
              id: session.id,
              messages: [],
              metadata: session,
              created: session.created,
              lastModified: session.lastModified
            };
            await fs.writeFile(sessionFilePath, JSON.stringify(sessionData, null, 2));
          }

          // Store original valid session data for comparison
          const originalValidSessions = validSessions.map(s => ({ ...s }));

          // Perform integrity check
          await safeSessionManager.getValidator().performStartupIntegrityCheck();

          // Read the updated index
          const updatedIndexContent = await fs.readFile(indexPath, 'utf-8');
          const updatedIndex = JSON.parse(updatedIndexContent);

          // Verify all valid sessions are preserved exactly as they were
          for (let i = 0; i < validSessions.length; i++) {
            const originalSession = originalValidSessions[i];
            const preservedSession = updatedIndex.sessions[originalSession.id];

            expect(preservedSession).toBeDefined();
            expect(preservedSession.id).toBe(originalSession.id);
            expect(preservedSession.title).toBe(originalSession.title);
            expect(preservedSession.created).toBe(originalSession.created);
            expect(preservedSession.lastModified).toBe(originalSession.lastModified);
            expect(preservedSession.model).toBe(originalSession.model);
            expect(preservedSession.provider).toBe(originalSession.provider);
            expect(preservedSession.messageCount).toBe(originalSession.messageCount);
            expect(preservedSession.tokenCount).toEqual(originalSession.tokenCount);
            expect(preservedSession.workspaceRoot).toBe(originalSession.workspaceRoot);
            expect(preservedSession.contextFiles).toEqual(originalSession.contextFiles);
            expect(preservedSession.tags).toEqual(originalSession.tags);
            expect(preservedSession.preview).toBe(originalSession.preview);
          }

          // Verify orphaned sessions were removed
          for (const orphanedSession of orphanedSessions) {
            expect(updatedIndex.sessions[orphanedSession.id]).toBeUndefined();
          }
        }
      ),
      { numRuns: 15, timeout: 8000 }
    );
  });
});