/**
 * @fileoverview Property-based tests for fallback session creation
 * @module features/session/__tests__/fallback-session-creation.property
 *
 * Tests Property 16: Fallback Session Creation
 * Validates: Requirements 6.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { createSessionId } from '../../../shared/types/index.js';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import { 
  createErrorRecoverySystem,
  type IErrorRecoverySystem
} from '../error-recovery.js';

// Mock the config loader
vi.mock('../../../config/loader.js', async () => {
  const actual = await vi.importActual('../../../config/loader.js');
  return {
    ...actual,
    getSessionsDir: vi.fn(),
    loadConfig: vi.fn().mockReturnValue({
      global: {
        session: {
          autoSaveInterval: 30000,
          maxSessions: 50,
        },
      },
    }),
  };
});

describe('Fallback Session Creation Properties', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let errorRecovery: IErrorRecoverySystem;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `fallback-session-test-${uniqueSuffix}-`));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    // Create storage and manager instances
    storage = new SessionStorage();
    manager = new SessionManager(storage);
    errorRecovery = createErrorRecoverySystem();
    
    // Ensure clean state
    try {
      const existingSessions = await manager.listSessions();
      for (const session of existingSessions) {
        await manager.deleteSession(session.id);
      }
    } catch {
      // Ignore errors during cleanup
    }
    
    // Add small delay to reduce race conditions
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    // Add small delay before cleanup
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  /**
   * Property 16: Fallback Session Creation
   * 
   * For any scenario where the retry limit is exceeded, the system must fall back 
   * to creating a new session.
   * 
   * **Validates: Requirements 6.4**
   */
  it('should create fallback session when retry limit exceeded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 30 }).map(s => `/workspace/${s}`),
          maxRetries: fc.integer({ min: 1, max: 5 }),
          failureCount: fc.integer({ min: 1, max: 8 }),
          title: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
        }),
        
        async ({ model, workspaceRoot, maxRetries, failureCount, title, tags }) => {
          // Configure error recovery with specific retry limit
          errorRecovery.updateConfig({ maxRetries });
          
          // Create a session that will fail
          const problematicSessionId = createSessionId();
          
          // Record enough failures to exceed retry limit
          const actualFailures = Math.max(failureCount, maxRetries + 1);
          for (let i = 0; i < actualFailures; i++) {
            const error = new Error(`Restoration failure ${i + 1}`);
            errorRecovery.recordFailure(problematicSessionId, error);
          }
          
          // Verify the session is now problematic
          expect(errorRecovery.isSessionProblematic(problematicSessionId)).toBe(true);
          expect(errorRecovery.shouldSkipSession(problematicSessionId)).toBe(true);
          
          // Property: When retry limit is exceeded, system should fall back to new session creation
          const fallbackSession = await manager.createSession({
            model,
            workspaceRoot,
            title: title ?? undefined,
            tags: tags ?? undefined,
          });
          
          // Property: Fallback session should be successfully created
          expect(fallbackSession).toBeDefined();
          expect(fallbackSession.id).toBeDefined();
          expect(fallbackSession.id).not.toBe(problematicSessionId);
          expect(fallbackSession.model).toBe(model);
          expect(fallbackSession.workspaceRoot).toBe(workspaceRoot);
          
          // Property: Fallback session should have valid timestamps
          expect(fallbackSession.created).toBeGreaterThan(0);
          expect(fallbackSession.lastModified).toBeGreaterThan(0);
          expect(fallbackSession.created).toBeLessThanOrEqual(fallbackSession.lastModified);
          
          // Property: Fallback session should preserve provided metadata
          if (title) {
            expect(fallbackSession.title).toBe(title);
          }
          if (tags && tags.length > 0) {
            expect(fallbackSession.tags).toEqual(tags);
          }
          
          // Property: Fallback session should be in clean initial state
          expect(fallbackSession.messages).toEqual([]);
          expect(fallbackSession.contextFiles).toEqual([]);
          expect(fallbackSession.tokenCount.total).toBe(0);
          expect(fallbackSession.tokenCount.input).toBe(0);
          expect(fallbackSession.tokenCount.output).toBe(0);
          
          // Property: Fallback session should be persisted to storage
          const sessionExists = await storage.sessionExists(fallbackSession.id);
          expect(sessionExists).toBe(true);
          
          // Property: Fallback session should be loadable
          const loadedSession = await storage.readSession(fallbackSession.id);
          expect(loadedSession.id).toBe(fallbackSession.id);
          expect(loadedSession.model).toBe(model);
          expect(loadedSession.workspaceRoot).toBe(workspaceRoot);
          
          // Property: Fallback session should not be marked as problematic
          expect(errorRecovery.isSessionProblematic(fallbackSession.id)).toBe(false);
          expect(errorRecovery.shouldSkipSession(fallbackSession.id)).toBe(false);
          
          // Property: Original problematic session should remain problematic
          expect(errorRecovery.isSessionProblematic(problematicSessionId)).toBe(true);
          
          // Property: Fallback session should be set as current session
          expect(manager.getCurrentSession()?.id).toBe(fallbackSession.id);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Fallback session creation should be deterministic and reliable
   * 
   * For any valid session creation parameters, fallback session creation should 
   * always succeed regardless of previous failure history.
   */
  it('should reliably create fallback sessions regardless of failure history', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 25 }).map(s => `/test/${s}`),
          previousFailures: fc.array(
            fc.record({
              sessionId: fc.string().map(s => createSessionId()),
              errorCount: fc.integer({ min: 1, max: 6 })
            }),
            { minLength: 0, maxLength: 5 }
          ),
        }),
        
        async ({ model, workspaceRoot, previousFailures }) => {
          // Simulate previous failure history
          for (const { sessionId, errorCount } of previousFailures) {
            for (let i = 0; i < errorCount; i++) {
              errorRecovery.recordFailure(sessionId, new Error(`Previous failure ${i + 1}`));
            }
          }
          
          // Property: Fallback session creation should succeed despite previous failures
          const fallbackSession = await manager.createSession({
            model,
            workspaceRoot,
          });
          
          // Property: Fallback session should have unique ID
          expect(fallbackSession.id).toBeDefined();
          expect(typeof fallbackSession.id).toBe('string');
          expect(fallbackSession.id.length).toBeGreaterThan(0);
          
          // Verify ID is not one of the previously failed sessions
          const previousSessionIds = previousFailures.map(f => f.sessionId);
          expect(previousSessionIds).not.toContain(fallbackSession.id);
          
          // Property: Fallback session should have correct structure
          expect(fallbackSession.model).toBe(model);
          expect(fallbackSession.workspaceRoot).toBe(workspaceRoot);
          expect(fallbackSession.version).toBeDefined();
          expect(fallbackSession.created).toBeGreaterThan(0);
          expect(fallbackSession.lastModified).toBeGreaterThan(0);
          
          // Property: Fallback session should be in initial state
          expect(fallbackSession.messages).toEqual([]);
          expect(fallbackSession.contextFiles).toEqual([]);
          expect(fallbackSession.filesAccessed).toEqual([]);
          expect(fallbackSession.tokenCount).toEqual({ total: 0, input: 0, output: 0 });
          
          // Property: Fallback session should be immediately usable
          const sessionExists = await manager.sessionExists(fallbackSession.id);
          expect(sessionExists).toBe(true);
          
          const loadedSession = await manager.loadSession(fallbackSession.id);
          expect(loadedSession).toEqual(fallbackSession);
          
          // Property: Previous failure history should not affect new session
          expect(errorRecovery.isSessionProblematic(fallbackSession.id)).toBe(false);
          expect(errorRecovery.getFailureRecord(fallbackSession.id)).toBeUndefined();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Fallback session creation should handle concurrent scenarios
   * 
   * For any concurrent fallback session creation attempts, each should result 
   * in a unique, valid session.
   */
  it('should handle concurrent fallback session creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 20 }).map(s => `/concurrent/${s}`),
          concurrentCount: fc.integer({ min: 2, max: 4 }),
        }),
        
        async ({ model, workspaceRoot, concurrentCount }) => {
          // Create multiple fallback sessions concurrently
          const creationPromises = Array.from({ length: concurrentCount }, (_, i) =>
            manager.createSession({
              model,
              workspaceRoot: `${workspaceRoot}-${i}`,
              title: `Concurrent Session ${i}`,
            })
          );
          
          const fallbackSessions = await Promise.all(creationPromises);
          
          // Property: All sessions should be created successfully
          expect(fallbackSessions).toHaveLength(concurrentCount);
          
          // Property: All sessions should have unique IDs
          const sessionIds = fallbackSessions.map(session => session.id);
          const uniqueIds = new Set(sessionIds);
          expect(uniqueIds.size).toBe(concurrentCount);
          
          // Property: All sessions should have correct properties
          for (let i = 0; i < concurrentCount; i++) {
            const session = fallbackSessions[i];
            expect(session).toBeDefined();
            expect(session!.model).toBe(model);
            expect(session!.workspaceRoot).toBe(`${workspaceRoot}-${i}`);
            expect(session!.title).toBe(`Concurrent Session ${i}`);
            expect(session!.created).toBeGreaterThan(0);
            expect(session!.lastModified).toBeGreaterThan(0);
          }
          
          // Property: All sessions should be persisted and loadable
          for (const session of fallbackSessions) {
            const exists = await storage.sessionExists(session.id);
            expect(exists).toBe(true);
            
            const loaded = await storage.readSession(session.id);
            expect(loaded.id).toBe(session.id);
            expect(loaded.model).toBe(session.model);
          }
          
          // Property: None of the sessions should be problematic
          for (const session of fallbackSessions) {
            expect(errorRecovery.isSessionProblematic(session.id)).toBe(false);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Fallback session creation should preserve workspace context
   * 
   * For any fallback session creation, the workspace context and configuration 
   * should be properly preserved and initialized.
   */
  it('should preserve workspace context in fallback sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ minLength: 10, maxLength: 40 }).map(s => `/workspace/projects/${s}`),
          provider: fc.option(fc.constantFrom('openai', 'anthropic', 'google')),
          notes: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
          tags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 4 }),
        }),
        
        async ({ model, workspaceRoot, provider, notes, tags }) => {
          // Create fallback session with full context
          const fallbackSession = await manager.createSession({
            model,
            workspaceRoot,
            provider: provider ?? undefined,
            notes: notes ?? undefined,
            tags: tags ?? undefined,
          });
          
          // Property: Workspace context should be preserved
          expect(fallbackSession.workspaceRoot).toBe(workspaceRoot);
          expect(fallbackSession.model).toBe(model);
          
          if (provider) {
            expect(fallbackSession.provider).toBe(provider);
          }
          
          if (notes) {
            expect(fallbackSession.notes).toBe(notes);
          }
          
          if (tags && tags.length > 0) {
            expect(fallbackSession.tags).toEqual(tags);
          }
          
          // Property: Session should be properly initialized for the workspace
          expect(fallbackSession.filesAccessed).toEqual([]);
          expect(fallbackSession.contextFiles).toEqual([]);
          
          // Property: Session should be immediately ready for use
          const loadedSession = await manager.loadSession(fallbackSession.id);
          expect(loadedSession.workspaceRoot).toBe(workspaceRoot);
          expect(loadedSession.model).toBe(model);
          
          // Property: Session should be set as current and ready for operations
          expect(manager.getCurrentSession()?.id).toBe(fallbackSession.id);
          expect(manager.getCurrentSession()?.workspaceRoot).toBe(workspaceRoot);
          
          // Property: Session should pass integrity validation
          expect(manager.validateSessionIntegrity(fallbackSession)).toBe(true);
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property: Fallback session creation should reset failure tracking
   * 
   * For any successful fallback session creation, the new session should not 
   * inherit any failure history from previous problematic sessions.
   */
  it('should not inherit failure history in fallback sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 25 }).map(s => `/clean/${s}`),
          problematicSessions: fc.array(
            fc.record({
              sessionId: fc.string().map(s => createSessionId()),
              failures: fc.integer({ min: 3, max: 8 })
            }),
            { minLength: 1, maxLength: 4 }
          ),
        }),
        
        async ({ model, workspaceRoot, problematicSessions }) => {
          // Create problematic sessions with failure history
          for (const { sessionId, failures } of problematicSessions) {
            for (let i = 0; i < failures; i++) {
              errorRecovery.recordFailure(sessionId, new Error(`Failure ${i + 1}`));
            }
            
            // Verify session is problematic
            expect(errorRecovery.isSessionProblematic(sessionId)).toBe(true);
          }
          
          // Create fallback session
          const fallbackSession = await manager.createSession({
            model,
            workspaceRoot,
          });
          
          // Property: Fallback session should have clean failure history
          expect(errorRecovery.getFailureRecord(fallbackSession.id)).toBeUndefined();
          expect(errorRecovery.isSessionProblematic(fallbackSession.id)).toBe(false);
          expect(errorRecovery.shouldSkipSession(fallbackSession.id)).toBe(false);
          
          // Property: Fallback session should be immediately usable
          const restorationResult = await manager.restoreSession(fallbackSession.id);
          expect(restorationResult.id).toBe(fallbackSession.id);
          
          // Property: Previous problematic sessions should remain problematic
          for (const { sessionId } of problematicSessions) {
            expect(errorRecovery.isSessionProblematic(sessionId)).toBe(true);
            expect(errorRecovery.getFailureRecord(sessionId)).toBeDefined();
          }
          
          // Property: Fallback session should not be affected by previous failures
          const fallbackRecord = errorRecovery.getFailureRecord(fallbackSession.id);
          expect(fallbackRecord).toBeUndefined();
        }
      ),
      { numRuns: 25 }
    );
  });
});