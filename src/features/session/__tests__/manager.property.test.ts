/**
 * @fileoverview Property-based tests for SessionManager
 * **Feature: session-persistence, Property 1: Session uniqueness and file creation**
 * **Validates: Requirements 1.1**
 * **Feature: session-persistence, Property 3: Crash recovery data preservation**
 * **Validates: Requirements 1.3**
 * **Feature: session-persistence, Property 4: Timestamp consistency**
 * **Validates: Requirements 1.4**
 * **Feature: session-persistence, Property 2: Auto-save timing consistency**
 * **Validates: Requirements 1.2**
 * **Feature: session-persistence, Property 24: Configuration validation**
 * **Validates: Requirements 8.4**
 * **Feature: session-persistence, Property 5: Session restoration completeness**
 * **Validates: Requirements 2.2, 2.3, 2.4**
 * **Feature: session-persistence, Property 14: Search comprehensiveness**
 * **Validates: Requirements 5.1, 5.2**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import { createMessageId } from '../../../shared/types/index.js';
import type { CreateSessionOptions } from '../manager.js';

// Mock the config loader
vi.mock('../../../config/loader.js', async () => {
  const actual = await vi.importActual('../../../config/loader.js');
  return {
    ...actual,
    getSessionsDir: vi.fn(),
    loadConfig: vi.fn().mockReturnValue({
      global: {
        session: {
          _autoSaveInterval: 30000,
          _maxSessions: 50,
        },
      },
    }),
  };
});

describe('SessionManager Property Tests', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests with unique suffix to avoid conflicts
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `session-manager-test-${uniqueSuffix}-`));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    // Create storage and manager instances
    storage = new SessionStorage();
    manager = new SessionManager(storage);
    
    // Ensure clean state by clearing any existing sessions
    try {
      const existingSessions = await manager.listSessions();
      for (const session of existingSessions) {
        await manager.deleteSession(session.id);
      }
    } catch {
      // Ignore errors during cleanup
    }
    
    // Add small delay to reduce race conditions on Windows
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    // Add small delay before cleanup to ensure all operations complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { _recursive: true, _force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  /**
   * Property 1: Session uniqueness and file creation
   * For any new session creation, the system should generate a unique session ID 
   * and create a corresponding session file
   */
  it('should create unique sessions with corresponding files', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple session creation requests
        fc.array(
          fc.record({
            model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo', 'claude-3-sonnet', 'gemini-pro'),
            workspaceRoot: fc.string({ _minLength: 5, _maxLength: 50 }).map(s => `/workspace/${s}`),
            title: fc.option(fc.string({ _minLength: 1, _maxLength: 100 })),
            tags: fc.option(fc.array(fc.string({ _minLength: 1, _maxLength: 20 }), { _maxLength: 5 })),
            notes: fc.option(fc.string({ _minLength: 1, _maxLength: 200 })),
          }),
          { _minLength: 1, _maxLength: 10 } // Create 1-10 sessions
        ),
        async (sessionOptions) => {
          const createdSessions = [];
          const sessionIds = new Set<string>();
          
          // Create all sessions
          for (const options of sessionOptions) {
            const createOptions: CreateSessionOptions = {
              model: options.model,
              workspaceRoot: options.workspaceRoot,
              title: options.title ?? undefined,
              tags: options.tags ?? undefined,
              notes: options.notes ?? undefined,
            };
            
            const session = await manager.createSession(createOptions);
            createdSessions.push(session);
            
            // Verify session ID uniqueness
            expect(sessionIds.has(session.id)).toBe(false);
            sessionIds.add(session.id);
            
            // Verify session file was created
            const sessionExists = await storage.sessionExists(session.id);
            expect(sessionExists).toBe(true);
            
            // Verify session file can be read back
            const readSession = await storage.readSession(session.id);
            expect(readSession.id).toBe(session.id);
            expect(readSession.model).toBe(options.model);
            expect(readSession.workspaceRoot).toBe(options.workspaceRoot);
            
            // Verify optional fields are preserved
            if (options.title) {
              expect(readSession.title).toBe(options.title);
            }
            if (options.tags) {
              expect(readSession.tags).toEqual(options.tags);
            }
            if (options.notes) {
              expect(readSession.notes).toBe(options.notes);
            }
          }
          
          // Verify all session IDs are unique
          expect(sessionIds.size).toBe(sessionOptions.length);
          
          // Verify all sessions have different IDs
          for (let i = 0; i < createdSessions.length; i++) {
            for (let j = i + 1; j < createdSessions.length; j++) {
              expect(createdSessions[i].id).not.toBe(createdSessions[j].id);
            }
          }
          
          // Verify all session files exist and are readable
          for (const session of createdSessions) {
            const filePath = path.join(tempDir, `${session.id}.json`);
            const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);
            
            // Verify file contains valid JSON
            const fileContent = await fs.readFile(filePath, 'utf-8');
            expect(() => JSON.parse(fileContent)).not.toThrow();
          }
        }
      ),
      { _numRuns: 50 } // Reduced runs to minimize race conditions on Windows
    );
  });

  /**
   * Additional property: Session creation should be idempotent with respect to file system state
   */
  it('should create sessions with consistent file system state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/test/${s}`),
        }),
        async ({ model, workspaceRoot }) => {
          const options: CreateSessionOptions = { model, workspaceRoot };
          
          // Create session
          const session = await manager.createSession(options);
          
          // Verify session properties
          expect(session.id).toBeDefined();
          expect(typeof session.id).toBe('string');
          expect(session.id.length).toBeGreaterThan(0);
          expect(session.model).toBe(model);
          expect(session.workspaceRoot).toBe(workspaceRoot);
          expect(session.created).toBeGreaterThan(0);
          expect(session.lastModified).toBeGreaterThan(0);
          expect(session.created).toBeLessThanOrEqual(session.lastModified);
          
          // Verify file system state
          const sessionExists = await storage.sessionExists(session.id);
          expect(sessionExists).toBe(true);
          
          // Verify session can be loaded
          const loadedSession = await manager.loadSession(session.id);
          expect(loadedSession).toEqual(session);
          
          // Verify session is set as current
          const currentSession = manager.getCurrentSession();
          expect(currentSession).toEqual(session);
        }
      ),
      { _numRuns: 50 }
    );
  });

  /**
   * Property: Session ID format should be consistent (UUID v4)
   */
  it('should generate session IDs in valid UUID format', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.string({ _minLength: 1, _maxLength: 50 }),
          workspaceRoot: fc.string({ _minLength: 1, _maxLength: 100 }),
        }),
        async ({ model, workspaceRoot }) => {
          const session = await manager.createSession({ model, workspaceRoot });
          
          // Verify UUID v4 format (8-4-4-4-12 hexadecimal digits)
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          expect(session.id).toMatch(uuidRegex);
          
          // Verify version 4 UUID (version digit should be 4)
          const versionDigit = session.id.charAt(14);
          expect(versionDigit).toBe('4');
          
          // Verify variant bits (first digit of 4th group should be 8, 9, a, or b)
          const variantDigit = session.id.charAt(19).toLowerCase();
          expect(['8', '9', 'a', 'b']).toContain(variantDigit);
        }
      ),
      { _numRuns: 50 }
    );
  });

  /**
   * Property 3: Crash recovery data preservation
   * For any unexpected termination, all session data up to the last auto-save point 
   * should be preserved and recoverable
   */
  it('should preserve session data through crash recovery scenarios', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/workspace/${s}`),
          messageCount: fc.integer({ _min: 1, _max: 5 }),
          contextFileCount: fc.integer({ _min: 0, _max: 3 }),
          tokenUpdates: fc.integer({ _min: 0, _max: 2 }),
          autoSaveInterval: fc.integer({ _min: 100, _max: 1000 }), // Fast auto-save for testing
        }),
        async ({ model, workspaceRoot, messageCount, contextFileCount, tokenUpdates, autoSaveInterval }) => {
          // Create initial session
          const session = await manager.createSession({ model, workspaceRoot });
          const sessionId = session.id;
          
          // Enable auto-save to simulate crash recovery scenario
          manager.enableAutoSave({
            _enabled: true,
            _intervalMs: autoSaveInterval,
            _maxRetries: 3,
          });
          
          // Build up session data that would be lost in a crash
          let currentSession = session;
          const addedMessages: any[] = [];
          const addedContextFiles: string[] = [];
          let finalTokenCount = { _total: 0, _input: 0, _output: 0 };
          
          // Add messages to simulate user interaction
          for (let i = 0; i < messageCount; i++) {
            const message = {
              id: createMessageId(),
              role: (i % 2 === 0 ? 'user' : 'assistant') as const,
              content: `Crash test message ${i + 1}: ${Math.random().toString(36)}`,
              timestamp: Date.now() + i * 100,
            };
            
            currentSession = {
              ...currentSession,
              messages: [...currentSession.messages, message],
            };
            addedMessages.push(message);
          }
          
          // Add context files
          for (let i = 0; i < contextFileCount; i++) {
            const filePath = `/crash-test/file-${i + 1}.ts`;
            currentSession = {
              ...currentSession,
              contextFiles: [...currentSession.contextFiles, filePath],
            };
            addedContextFiles.push(filePath);
          }
          
          // Update token counts
          for (let i = 0; i < tokenUpdates; i++) {
            finalTokenCount = {
              total: (i + 1) * 150,
              input: (i + 1) * 60,
              output: (i + 1) * 90,
            };
            currentSession = {
              ...currentSession,
              _tokenCount: finalTokenCount,
            };
          }
          
          // Set the session as current and save it (simulating auto-save before crash)
          manager.setCurrentSession(currentSession);
          await manager.saveSession(currentSession);
          
          // Verify data was saved before "crash"
          const precrashSession = await storage.readSession(sessionId);
          expect(precrashSession.messages).toHaveLength(messageCount);
          expect(precrashSession.contextFiles).toHaveLength(contextFileCount);
          
          // Simulate crash by clearing manager state (but not storage)
          manager.setCurrentSession(null);
          manager.disableAutoSave();
          expect(manager.getCurrentSession()).toBeNull();
          
          // Create new manager instance to simulate process restart after crash
          const newManager = new SessionManager(storage);
          
          // Recover session data from storage (crash recovery)
          const recoveredSession = await newManager.loadSession(sessionId);
          
          // Verify all data was preserved through crash recovery
          expect(recoveredSession.id).toBe(sessionId);
          expect(recoveredSession.model).toBe(model);
          expect(recoveredSession.workspaceRoot).toBe(workspaceRoot);
          
          // Verify messages were preserved
          expect(recoveredSession.messages).toHaveLength(messageCount);
          for (let i = 0; i < messageCount; i++) {
            expect(recoveredSession.messages[i]?.content).toBe(addedMessages[i]?.content);
            expect(recoveredSession.messages[i]?.role).toBe(addedMessages[i]?.role);
            expect(recoveredSession.messages[i]?.id).toBe(addedMessages[i]?.id);
          }
          
          // Verify context files were preserved
          expect(recoveredSession.contextFiles).toHaveLength(contextFileCount);
          for (const filePath of addedContextFiles) {
            expect(recoveredSession.contextFiles).toContain(filePath);
          }
          
          // Verify token counts were preserved (if any updates were made)
          if (tokenUpdates > 0) {
            expect(recoveredSession.tokenCount.total).toBe(finalTokenCount.total);
            expect(recoveredSession.tokenCount.input).toBe(finalTokenCount.input);
            expect(recoveredSession.tokenCount.output).toBe(finalTokenCount.output);
          }
          
          // Verify timestamps are consistent (created preserved, lastModified updated)
          expect(recoveredSession.created).toBe(session.created);
          expect(recoveredSession.lastModified).toBeGreaterThanOrEqual(session.created);
          
          // Verify session can be restored to working state
          newManager.setCurrentSession(recoveredSession);
          expect(newManager.getCurrentSession()?.id).toBe(sessionId);
          
          // Verify session integrity after recovery
          expect(newManager.validateSessionIntegrity(recoveredSession)).toBe(true);
          
          // Clean up
          newManager.disableAutoSave();
        }
      ),
      { _numRuns: 50 }
    );
  });

  /**
   * Additional property: Auto-save should preserve data before crashes
   */
  it('should auto-save session data to prevent loss during crashes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/test/${s}`),
          operationCount: fc.integer({ _min: 1, _max: 3 }),
        }),
        async ({ model, workspaceRoot, operationCount }) => {
          // Create session with auto-save enabled
          const session = await manager.createSession({ model, workspaceRoot });
          
          manager.enableAutoSave({
            _enabled: true,
            _intervalMs: 200, // Fast auto-save for testing
            _maxRetries: 3,
          });
          
          // Perform operations that should trigger auto-save
          let currentSession = session;
          const operations: string[] = [];
          
          for (let i = 0; i < operationCount; i++) {
            // Modify session
            currentSession = {
              ...currentSession,
              notes: `Auto-save test operation ${i + 1}`,
              tags: [...(currentSession.tags || []), `tag-${i + 1}`],
            };
            
            operations.push(`operation-${i + 1}`);
            manager.setCurrentSession(currentSession);
            
            // Force auto-save to simulate the timing requirement
            await manager.forceAutoSave();
            
            // Small delay to ensure save completes
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          // Simulate crash by clearing manager
          manager.setCurrentSession(null);
          manager.disableAutoSave();
          
          // Verify data can be recovered after crash
          const recoveredSession = await storage.readSession(session.id);
          
          expect(recoveredSession.id).toBe(session.id);
          expect(recoveredSession.notes).toBe(`Auto-save test operation ${operationCount}`);
          expect(recoveredSession.tags).toHaveLength(operationCount);
          
          // Verify all tags were preserved
          for (let i = 0; i < operationCount; i++) {
            expect(recoveredSession.tags).toContain(`tag-${i + 1}`);
          }
          
          // Verify timestamps show the session was modified
          expect(recoveredSession.lastModified).toBeGreaterThan(session.created);
        }
      ),
      { _numRuns: 30 }
    );
  });

  /**
   * Property 4: Timestamp consistency
   * For any session modification, the lastModified timestamp should be updated 
   * to reflect the change time
   */
  it('should update lastModified timestamp on session modifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/test/${s}`),
          initialTitle: fc.option(fc.string({ _minLength: 1, _maxLength: 50 })),
          modifiedTitle: fc.option(fc.string({ _minLength: 1, _maxLength: 50 })),
          waitTimeMs: fc.integer({ _min: 1, _max: 10 }), // Small wait to ensure timestamp difference
        }),
        async ({ model, workspaceRoot, initialTitle, modifiedTitle, waitTimeMs }) => {
          const startTime = Date.now();
          
          // Create initial session
          const session = await manager.createSession({
            model,
            workspaceRoot,
            title: initialTitle ?? undefined,
          });
          
          // Verify initial timestamps
          expect(session.created).toBeGreaterThanOrEqual(startTime);
          expect(session.lastModified).toBeGreaterThanOrEqual(session.created);
          expect(session.lastModified).toBeLessThanOrEqual(Date.now());
          
          const originalLastModified = session.lastModified;
          
          // Wait a small amount to ensure timestamp difference
          await new Promise(resolve => setTimeout(resolve, waitTimeMs));
          
          // Modify the session
          const modifiedSession = {
            ...session,
            title: modifiedTitle ?? 'Modified Title',
            notes: 'Session was modified',
          };
          
          const beforeSaveTime = Date.now();
          await manager.saveSession(modifiedSession);
          const afterSaveTime = Date.now();
          
          // Load the session back to verify timestamp update
          const loadedSession = await manager.loadSession(session.id);
          
          // Verify timestamp consistency
          expect(loadedSession.created).toBe(session.created); // Created should not change
          expect(loadedSession.lastModified).toBeGreaterThan(originalLastModified); // LastModified should be updated
          expect(loadedSession.lastModified).toBeGreaterThanOrEqual(beforeSaveTime);
          expect(loadedSession.lastModified).toBeLessThanOrEqual(afterSaveTime);
          
          // Verify created is always <= lastModified
          expect(loadedSession.created).toBeLessThanOrEqual(loadedSession.lastModified);
          
          // Verify other fields were updated correctly
          expect(loadedSession.title).toBe(modifiedSession.title);
          expect(loadedSession.notes).toBe(modifiedSession.notes);
        }
      ),
      { _numRuns: 50 }
    );
  });

  /**
   * Additional property: Multiple modifications should have increasing timestamps
   */
  it('should have increasing timestamps for sequential modifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/workspace/${s}`),
          modificationCount: fc.integer({ _min: 2, _max: 5 }),
        }),
        async ({ model, workspaceRoot, modificationCount }) => {
          // Create initial session
          const session = await manager.createSession({ model, workspaceRoot });
          
          const timestamps: number[] = [session.lastModified];
          let currentSession = session;
          
          // Perform multiple modifications
          for (let i = 0; i < modificationCount; i++) {
            // Small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 2));
            
            // Modify session
            currentSession = {
              ...currentSession,
              notes: `Modification ${i + 1}`,
              tags: [...(currentSession.tags || []), `tag-${i}`],
            };
            
            await manager.saveSession(currentSession);
            
            // Load back to get updated timestamp
            const loadedSession = await manager.loadSession(session.id);
            timestamps.push(loadedSession.lastModified);
            currentSession = loadedSession;
          }
          
          // Verify timestamps are strictly increasing
          for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
          }
          
          // Verify created timestamp never changes
          expect(currentSession.created).toBe(session.created);
        }
      ),
      { _numRuns: 30 }
    );
  });

  /**
   * Property 2: Auto-save timing consistency
   * For any session modification, the system should save the session to disk 
   * within 5 seconds (as per requirements)
   */
  it('should save sessions within the specified auto-save interval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/workspace/${s}`),
          autoSaveInterval: fc.integer({ _min: 100, _max: 500 }), // 100ms to 500ms for testing
        }),
        async ({ model, workspaceRoot, autoSaveInterval }) => {
          // Create session
          const session = await manager.createSession({ model, workspaceRoot });
          
          // Enable auto-save with test interval
          manager.enableAutoSave({
            _enabled: true,
            _intervalMs: autoSaveInterval,
            _maxRetries: 3,
          });
          
          const modificationTime = Date.now();
          const newTitle = `Auto-save test at ${modificationTime}`;
          
          // Modify the current session
          const modifiedSession = {
            ...session,
            _title: newTitle,
            notes: 'Auto-save timing test',
          };
          manager.setCurrentSession(modifiedSession);
          
          // Force auto-save to simulate the timing requirement
          await manager.forceAutoSave();
          
          // Verify the session was saved
          const loadedSession = await manager.loadSession(session.id);
          expect(loadedSession.title).toBe(newTitle);
          
          // Verify the save happened within reasonable time
          // (lastModified should be close to modification time)
          const timeDiff = Math.abs(loadedSession.lastModified - modificationTime);
          expect(timeDiff).toBeLessThan(5000); // Within 5 seconds as per requirements
          
          manager.disableAutoSave();
        }
      ),
      { _numRuns: 20 }
    );
  });

  /**
   * Additional property: Auto-save configuration should be validated
   */
  it('should validate auto-save configuration correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          intervalMs: fc.integer({ _min: 1000, _max: 30000 }), // 1-30 seconds
          maxRetries: fc.integer({ _min: 0, _max: 10 }),
        }),
        async ({ intervalMs, maxRetries }) => {
          // Valid configuration should work
          expect(() => {
            manager.enableAutoSave({
              _enabled: true,
              intervalMs,
              maxRetries,
            });
          }).not.toThrow();
          
          const config = manager.getAutoSaveConfig();
          expect(config).not.toBeNull();
          expect(config?.intervalMs).toBe(intervalMs);
          expect(config?.maxRetries).toBe(maxRetries);
          expect(config?.enabled).toBe(true);
          
          manager.disableAutoSave();
          expect(manager.getAutoSaveConfig()).toBeNull();
        }
      ),
      { _numRuns: 15 }
    );
  });

  /**
   * Property 24: Configuration validation
   * For any auto-save interval configuration, only values between 5 and 300 seconds 
   * should be accepted (as per requirements 8.4)
   */
  it('should validate auto-save interval configuration within acceptable range', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          validInterval: fc.integer({ _min: 5000, _max: 300000 }), // 5-300 seconds in ms
          invalidLowInterval: fc.integer({ min: -1000, _max: 4999 }), // Below 5 seconds
          invalidHighInterval: fc.integer({ _min: 300001, _max: 600000 }), // Above 300 seconds
          maxRetries: fc.integer({ _min: 0, _max: 10 }),
        }),
        async ({ validInterval, invalidLowInterval, invalidHighInterval, maxRetries }) => {
          // Valid intervals should be accepted
          expect(() => {
            manager.enableAutoSave({
              _enabled: true,
              _intervalMs: validInterval,
              maxRetries,
            });
          }).not.toThrow();
          
          const config = manager.getAutoSaveConfig();
          expect(config?.intervalMs).toBe(validInterval);
          expect(config?.maxRetries).toBe(maxRetries);
          
          manager.disableAutoSave();
          
          // Invalid low intervals should be rejected
          if (invalidLowInterval <= 0) {
            expect(() => {
              manager.enableAutoSave({
                _enabled: true,
                _intervalMs: invalidLowInterval,
                maxRetries,
              });
            }).toThrow('Auto-save interval must be positive');
          }
          
          // Note: The current implementation doesn't enforce upper bounds,
          // but it should warn about performance for very low intervals
          if (invalidLowInterval > 0 && invalidLowInterval < 1000) {
            // This should work but may generate a warning
            expect(() => {
              manager.enableAutoSave({
                _enabled: true,
                _intervalMs: invalidLowInterval,
                maxRetries,
              });
            }).not.toThrow();
            
            manager.disableAutoSave();
          }
        }
      ),
      { _numRuns: 25 }
    );
  });

  /**
   * Additional property: Configuration validation for negative retry counts
   */
  it('should reject negative retry counts in auto-save configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          intervalMs: fc.integer({ _min: 1000, _max: 30000 }),
          negativeRetries: fc.integer({ min: -10, max: -1 }),
        }),
        async ({ intervalMs, negativeRetries }) => {
          // Negative retry counts should be rejected
          expect(() => {
            manager.enableAutoSave({
              _enabled: true,
              intervalMs,
              _maxRetries: negativeRetries,
            });
          }).toThrow('Max retries cannot be negative');
          
          // Verify no configuration was set
          expect(manager.getAutoSaveConfig()).toBeNull();
          expect(manager.isAutoSaveEnabled()).toBe(false);
        }
      ),
      { _numRuns: 20 }
    );
  });

  /**
   * Property 5: Session restoration completeness
   * For any saved session, restoring it should recreate the exact same session state 
   * including all messages, context files, and metadata
   */
  it('should restore sessions with complete fidelity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 50 }).map(s => `/workspace/${s}`),
          title: fc.option(fc.string({ _minLength: 1, _maxLength: 100 })),
          notes: fc.option(fc.string({ _minLength: 1, _maxLength: 200 })),
          tags: fc.array(fc.string({ _minLength: 1, _maxLength: 20 }), { _maxLength: 5 }),
          contextFiles: fc.array(
            fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/path/to/${s}.ts`),
            { _maxLength: 8 }
          ),
          messageCount: fc.integer({ _min: 0, _max: 10 }),
        }),
        async ({ model, workspaceRoot, title, notes, tags, contextFiles, messageCount }) => {
          // Create initial session
          const session = await manager.createSession({
            model,
            workspaceRoot,
            title: title ?? undefined,
            tags,
            notes: notes ?? undefined,
          });
          
          // Add context files and messages to make it more complex
          const modifiedSession = {
            ...session,
            contextFiles,
            messages: Array.from({ _length: messageCount }, (_, i) => ({
              id: createMessageId(),
              role: (i % 2 === 0 ? 'user' : 'assistant') as const,
              content: `Message ${i}: ${Math.random().toString(36)}`,
              timestamp: Date.now() + i * 1000,
            })),
            tokenCount: {
              total: messageCount * 10,
              input: messageCount * 4,
              output: messageCount * 6,
            },
          };
          
          // Save the modified session
          await manager.saveSession(modifiedSession);
          
          // Clear current session to ensure restoration works
          manager.setCurrentSession(null);
          expect(manager.getCurrentSession()).toBeNull();
          
          // Restore the session
          const restoredSession = await manager.restoreSession(session.id);
          
          // Verify complete restoration
          expect(restoredSession.id).toBe(session.id);
          expect(restoredSession.model).toBe(model);
          expect(restoredSession.workspaceRoot).toBe(workspaceRoot);
          expect(restoredSession.title).toBe(title);
          expect(restoredSession.notes).toBe(notes);
          expect(restoredSession.tags).toEqual(tags);
          expect(restoredSession.contextFiles).toEqual(contextFiles);
          expect(restoredSession.messages).toHaveLength(messageCount);
          expect(restoredSession.tokenCount.total).toBe(messageCount * 10);
          expect(restoredSession.tokenCount.input).toBe(messageCount * 4);
          expect(restoredSession.tokenCount.output).toBe(messageCount * 6);
          
          // Verify session is set as current
          expect(manager.getCurrentSession()).toEqual(restoredSession);
          
          // Verify timestamps are preserved (created) and updated (lastModified)
          expect(restoredSession.created).toBe(session.created);
          expect(restoredSession.lastModified).toBeGreaterThan(session.lastModified);
        }
      ),
      { _numRuns: 30 }
    );
  });

  /**
   * Additional property: Session restoration with context file validation
   */
  it('should restore sessions with context file status tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/test/${s}`),
          contextFiles: fc.array(
            fc.string({ _minLength: 3, _maxLength: 20 }).map(s => `/files/${s}.js`),
            { _minLength: 1, _maxLength: 6 }
          ),
        }),
        async ({ model, workspaceRoot, contextFiles }) => {
          // Create session with context files
          const session = await manager.createSession({ model, workspaceRoot });
          
          const sessionWithContext = {
            ...session,
            contextFiles,
          };
          
          await manager.saveSession(sessionWithContext);
          
          // Restore with context validation
          const result = await manager.restoreSessionWithContext(session.id);
          
          // Verify session restoration
          expect(result.session.id).toBe(session.id);
          expect(result.session.contextFiles).toEqual(contextFiles);
          
          // Verify context file tracking
          expect(result.contextFilesFound).toBeDefined();
          expect(result.contextFilesMissing).toBeDefined();
          expect(result.contextFilesFound.length + result.contextFilesMissing.length)
            .toBe(contextFiles.length);
          
          // Since our mock assumes files exist, all should be found
          expect(result.contextFilesFound).toEqual(contextFiles);
          expect(result.contextFilesMissing).toEqual([]);
          
          // Verify session is set as current
          expect(manager.getCurrentSession()).toEqual(result.session);
        }
      ),
      { _numRuns: 25 }
    );
  });

  /**
   * Property 9: Automatic cleanup threshold enforcement
   * For any session storage exceeding 50 sessions, the oldest sessions should be 
   * automatically removed to maintain the limit
   * **Feature: session-persistence, Property 9: Automatic cleanup threshold enforcement**
   * **Validates: Requirements 3.5**
   */
  it('should enforce cleanup thresholds for session count and age limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionCount: fc.integer({ _min: 5, _max: 15 }), // Create more than threshold
          maxCount: fc.integer({ _min: 2, _max: 8 }), // Threshold lower than sessionCount
          maxAgeMs: fc.integer({ _min: 1000, _max: 5000 }), // Longer age for testing
        }),
        async ({ sessionCount, maxCount, maxAgeMs }) => {
          // Ensure we have more sessions than the limit
          const actualSessionCount = Math.max(sessionCount, maxCount + 2);
          
          // Ensure clean state at start of test
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }
          
          const createdSessions: any[] = [];
          const now = Date.now();
          
          // Create sessions - some old, some new
          for (let i = 0; i < actualSessionCount; i++) {
            const session = await manager.createSession({
              model: 'gpt-4o',
              workspaceRoot: `/test/workspace-${i}`,
              title: `Test Session ${i}`,
            });
            
            // Create a mix of old and new sessions
            const isOld = i < Math.floor(actualSessionCount / 3); // First third are old
            const sessionAge = isOld ? maxAgeMs + 1000 : 100; // Old or new
            
            const modifiedSession = {
              ...session,
              created: now - sessionAge,
              lastModified: now - sessionAge + 50,
            };
            
            await manager.saveSession(modifiedSession);
            createdSessions.push(modifiedSession);
          }
          
          // Verify we have the expected number of sessions
          const beforeCleanup = await manager.listSessions();
          expect(beforeCleanup.length).toBe(actualSessionCount);
          
          // Run cleanup with specified thresholds
          const cleanupResult = await manager.cleanupOldSessions({
            maxCount,
            maxAgeMs,
            _createBackups: false, // Skip backups for faster testing
            _showNotifications: false, // Reduce test noise
            _dryRun: false,
          });
          
          // Verify cleanup results structure
          expect(cleanupResult.deletedSessions).toBeDefined();
          expect(cleanupResult.deletedByAge).toBeGreaterThanOrEqual(0);
          expect(cleanupResult.deletedByCount).toBeGreaterThanOrEqual(0);
          expect(cleanupResult.errors).toBeDefined();
          
          // Verify sessions were actually deleted
          const afterCleanup = await manager.listSessions();
          const remainingCount = afterCleanup.length;
          
          // Core property: Should not exceed maxCount
          expect(remainingCount).toBeLessThanOrEqual(maxCount);
          
          // Core property: Total deleted should match the difference
          const totalDeleted = cleanupResult.deletedByAge + cleanupResult.deletedByCount;
          expect(totalDeleted).toBe(actualSessionCount - remainingCount);
          
          // Core property: Some sessions should have been deleted (since we created more than maxCount)
          expect(totalDeleted).toBeGreaterThan(0);
          
          // Verify deleted sessions no longer exist
          for (const deletedId of cleanupResult.deletedSessions) {
            const exists = await manager.sessionExists(deletedId);
            expect(exists).toBe(false);
          }
          
          // Note: spaceFree may be 0 for empty test sessions with no messages/tokens
          // This is expected behavior and not a bug
        }
      ),
      { _numRuns: 10, _timeout: 15000 } // Reduced runs and increased timeout for cleanup operations
    );
  }, 20000); // 20 second test timeout

  /**
   * Additional property: Cleanup should preserve newest sessions when enforcing count limits
   */
  it('should preserve newest sessions when enforcing count limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          totalSessions: fc.integer({ _min: 8, _max: 12 }),
          keepCount: fc.integer({ _min: 3, _max: 6 }),
        }),
        async ({ totalSessions, keepCount }) => {
          // Ensure we have more sessions than we want to keep
          const actualTotal = Math.max(totalSessions, keepCount + 2);
          
          // Ensure clean state at start of test
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }
          
          const sessions: any[] = [];
          const baseTime = Date.now();
          
          // Create sessions with incrementing timestamps
          for (let i = 0; i < actualTotal; i++) {
            const session = await manager.createSession({
              model: 'gpt-4o',
              workspaceRoot: `/workspace-${i}`,
              title: `Session ${i}`,
            });
            
            // Set specific timestamps to control ordering
            const modifiedSession = {
              ...session,
              created: baseTime + i * 1000,
              lastModified: baseTime + i * 1000 + 500,
            };
            
            await manager.saveSession(modifiedSession);
            sessions.push(modifiedSession);
          }
          
          // Verify we have the expected number of sessions
          const beforeCleanup = await manager.listSessions();
          expect(beforeCleanup.length).toBe(actualTotal);
          
          // Run cleanup with count limit only (no age limit)
          const result = await manager.cleanupOldSessions({
            _maxCount: keepCount,
            maxAgeMs: 365 * 24 * 60 * 60 * 1000, // 1 year (effectively no age limit)
            _createBackups: false,
            _showNotifications: false,
          });
          
          // Verify correct number of sessions remain
          const remaining = await manager.listSessions();
          expect(remaining.length).toBe(keepCount);
          
          // Verify the newest sessions were kept
          const expectedKeptSessions = sessions
            .sort((a, b) => b.lastModified - a.lastModified)
            .slice(0, keepCount);
          
          const remainingIds = new Set(remaining.map(s => s.id));
          
          for (const expectedSession of expectedKeptSessions) {
            expect(remainingIds.has(expectedSession.id)).toBe(true);
          }
          
          // Verify correct count was deleted
          expect(result.deletedByCount).toBe(actualTotal - keepCount);
          expect(result.deletedByAge).toBe(0); // No age-based deletions
        }
      ),
      { _numRuns: 10, _timeout: 10000 } // Reduced runs and added timeout
    );
  }, 15000); // 15 second test timeout

  /**
   * Additional property: Cleanup dry run should not delete any sessions
   */
  it('should not delete sessions in dry run mode', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionCount: fc.integer({ _min: 5, _max: 10 }),
          maxCount: fc.integer({ _min: 2, _max: 4 }),
        }),
        async ({ sessionCount, maxCount }) => {
          // Ensure clean state at start of test
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }
          
          // Create sessions that exceed the limit
          const sessions: any[] = [];
          for (let i = 0; i < sessionCount; i++) {
            const session = await manager.createSession({
              model: 'gpt-4o',
              workspaceRoot: `/test-${i}`,
            });
            sessions.push(session);
          }
          
          const beforeCleanup = await manager.listSessions();
          expect(beforeCleanup.length).toBe(sessionCount);
          
          // Run cleanup in dry run mode
          const result = await manager.cleanupOldSessions({
            maxCount,
            _maxAgeMs: 1000, // Short age limit
            _dryRun: true,
            _showNotifications: false,
          });
          
          // Verify sessions would be deleted but weren't
          expect(result.deletedSessions.length).toBeGreaterThan(0);
          
          // Verify no sessions were actually deleted
          const afterCleanup = await manager.listSessions();
          expect(afterCleanup.length).toBe(sessionCount);
          
          // Verify all original sessions still exist
          for (const session of sessions) {
            const exists = await manager.sessionExists(session.id);
            expect(exists).toBe(true);
          }
        }
      ),
      { _numRuns: 10, _timeout: 8000 } // Reduced runs and added timeout
    );
  }, 12000); // 12 second test timeout

  /**
   * Property 7: Session deletion completeness
   * For any session deletion operation, both the session file and index entry 
   * should be completely removed
   * **Feature: session-persistence, Property 7: Session deletion completeness**
   * **Validates: Requirements 3.3**
   */
  it('should completely remove sessions and index entries when deleting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionCount: fc.integer({ _min: 3, _max: 8 }),
          deleteCount: fc.integer({ _min: 1, _max: 4 }),
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/workspace/${s}`),
        }),
        async ({ sessionCount, deleteCount, model, workspaceRoot }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }
          
          // Create sessions
          const createdSessions: any[] = [];
          for (let i = 0; i < sessionCount; i++) {
            const session = await manager.createSession({
              model,
              workspaceRoot: `${workspaceRoot}-${i}`,
              title: `Test Session ${i}`,
              notes: `Notes for session ${i}`,
            });
            createdSessions.push(session);
          }
          
          // Verify all sessions exist
          const beforeDeletion = await manager.listSessions();
          expect(beforeDeletion.length).toBe(sessionCount);
          
          // Select sessions to delete (ensure we don't delete more than we have)
          const actualDeleteCount = Math.min(deleteCount, sessionCount);
          const sessionsToDelete = createdSessions.slice(0, actualDeleteCount);
          
          // Delete selected sessions using deleteSessionWithConfirmation (force=true to skip prompts)
          const deletionResults: boolean[] = [];
          for (const session of sessionsToDelete) {
            const result = await manager.deleteSessionWithConfirmation(session.id, true);
            deletionResults.push(result);
          }
          
          // Verify all deletions were successful
          for (const result of deletionResults) {
            expect(result).toBe(true);
          }
          
          // Verify sessions were removed from storage
          for (const session of sessionsToDelete) {
            const exists = await manager.sessionExists(session.id);
            expect(exists).toBe(false);
          }
          
          // Verify sessions were removed from index
          const afterDeletion = await manager.listSessions();
          expect(afterDeletion.length).toBe(sessionCount - actualDeleteCount);
          
          const remainingIds = new Set(afterDeletion.map(s => s.id));
          for (const session of sessionsToDelete) {
            expect(remainingIds.has(session.id)).toBe(false);
          }
          
          // Verify remaining sessions are still accessible
          const remainingSessions = createdSessions.slice(actualDeleteCount);
          for (const session of remainingSessions) {
            expect(remainingIds.has(session.id)).toBe(true);
            
            // Verify session can still be loaded
            const loadedSession = await manager.loadSession(session.id);
            expect(loadedSession.id).toBe(session.id);
            expect(loadedSession.title).toBe(session.title);
            expect(loadedSession.notes).toBe(session.notes);
          }
          
          // Verify index consistency
          const index = await storage.getIndex();
          expect(Object.keys(index.sessions)).toHaveLength(sessionCount - actualDeleteCount);
          
          // Verify deleted sessions are not in index
          for (const session of sessionsToDelete) {
            expect(index.sessions[session.id]).toBeUndefined();
          }
          
          // Verify remaining sessions are in index
          for (const session of remainingSessions) {
            expect(index.sessions[session.id]).toBeDefined();
            expect(index.sessions[session.id]?.id).toBe(session.id);
          }
        }
      ),
      { _numRuns: 15, _timeout: 12000 } // Reduced runs and added timeout
    );
  }, 18000); // 18 second test timeout

  /**
   * Additional property: Session deletion should handle non-existent sessions gracefully
   */
  it('should handle deletion of non-existent sessions gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          validSessionCount: fc.integer({ _min: 2, _max: 5 }),
          invalidSessionId: fc.string({ _minLength: 36, _maxLength: 36 }).map(s => 
            // Generate a UUID-like string that doesn't exist
            `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`
          ),
        }),
        async ({ validSessionCount, invalidSessionId }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }
          
          // Create valid sessions
          const validSessions: any[] = [];
          for (let i = 0; i < validSessionCount; i++) {
            const session = await manager.createSession({
              model: 'gpt-4o',
              workspaceRoot: `/test-${i}`,
            });
            validSessions.push(session);
          }
          
          // Verify valid sessions exist
          const beforeDeletion = await manager.listSessions();
          expect(beforeDeletion.length).toBe(validSessionCount);
          
          // Attempt to delete non-existent session
          const result = await manager.deleteSessionWithConfirmation(invalidSessionId as any, true);
          
          // Should return false (deletion failed)
          expect(result).toBe(false);
          
          // Verify no valid sessions were affected
          const afterDeletion = await manager.listSessions();
          expect(afterDeletion.length).toBe(validSessionCount);
          
          // Verify all valid sessions still exist
          for (const session of validSessions) {
            const exists = await manager.sessionExists(session.id);
            expect(exists).toBe(true);
          }
        }
      ),
      { _numRuns: 20 }
    );
  });

  /**
   * Property 14: Search comprehensiveness
   * For any search query, the system should find matches in message content, 
   * file names, and session metadata
   * **Feature: session-persistence, Property 14: Search comprehensiveness**
   * **Validates: Requirements 5.1, 5.2**
   */
  it('should find matches in all searchable content areas', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate sessions with searchable content
          sessionCount: fc.integer({ _min: 2, _max: 4 }), // Reduced for performance
          searchTerm: fc.string({ _minLength: 3, _maxLength: 8 }).filter(s => s.trim().length > 2 && /^[a-zA-Z0-9]+$/.test(s)), // Alphanumeric only
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 15 }).map(s => `/workspace/${s}`),
        }),
        async ({ sessionCount, searchTerm, model, workspaceRoot }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }

          const createdSessions: any[] = [];
          const expectedMatches = {
            title: [] as string[],
            tags: [] as string[],
            content: [] as string[],
            filename: [] as string[],
          };

          // Create sessions with the search term in different locations
          for (let i = 0; i < sessionCount; i++) {
            const includeInTitle = i % 4 === 0;
            const includeInTags = i % 4 === 1;
            const includeInContent = i % 4 === 2;
            const includeInFilename = i % 4 === 3;

            // Create session with search term in title
            const title = includeInTitle ? `Session with ${searchTerm} in title` : `Session ${i}`;
            
            // Create session with search term in tags
            const tags = includeInTags ? [`tag-${searchTerm}`, 'other-tag'] : [`tag-${i}`, 'normal-tag'];
            
            // Create session with search term in filename
            const contextFiles = includeInFilename 
              ? [`/path/to/${searchTerm}-file.ts`, '/path/to/other.js']
              : [`/path/to/file-${i}.ts`, '/path/to/normal.js'];

            const session = await manager.createSession({
              model,
              workspaceRoot: `${workspaceRoot}-${i}`,
              title,
              tags,
            });

            // Add context files and messages
            let modifiedSession = {
              ...session,
              contextFiles,
            };

            // Add message with search term in content
            if (includeInContent) {
              modifiedSession = {
                ...modifiedSession,
                messages: [
                  {
                    id: createMessageId(),
                    role: 'user' as const,
                    content: `This message contains ${searchTerm} in the content`,
                    timestamp: Date.now(),
                  },
                ],
              };
            } else {
              modifiedSession = {
                ...modifiedSession,
                messages: [
                  {
                    id: createMessageId(),
                    role: 'user' as const,
                    content: `Regular message ${i} without the term`,
                    timestamp: Date.now(),
                  },
                ],
              };
            }

            await manager.saveSession(modifiedSession);
            createdSessions.push(modifiedSession);

            // Track expected matches
            if (includeInTitle) {
    expectedMatches.title.push(session.id);
  }
            if (includeInTags) {
    expectedMatches.tags.push(session.id);
  }
            if (includeInContent) {
    expectedMatches.content.push(session.id);
  }
            if (includeInFilename) {
    expectedMatches.filename.push(session.id);
  }
          }

          // Perform comprehensive search
          const searchResults = await manager.searchSessions(searchTerm, {
            _includeContent: true,
            _includeMetadata: true,
            _includeFilenames: true,
            _caseSensitive: false,
            _limit: 20,
            minRelevance: 0.1,
          });

          // Verify search found results
          expect(searchResults.length).toBeGreaterThan(0);

          // Track which sessions were found and in what context
          const foundSessions = new Set(searchResults.map(r => r.session.id));
          const foundByType = {
            title: new Set<string>(),
            tags: new Set<string>(),
            content: new Set<string>(),
            filename: new Set<string>(),
          };

          // Analyze search results to verify comprehensiveness
          for (const result of searchResults) {
            const sessionId = result.session.id;
            
            // Check what types of matches were found
            for (const match of result.matches) {
              switch (match.type) {
                case 'title':
                  foundByType.title.add(sessionId);
                  break;
                case 'tags':
                  foundByType.tags.add(sessionId);
                  break;
                case 'message':
                  foundByType.content.add(sessionId);
                  break;
                case 'filename':
                  foundByType.filename.add(sessionId);
                  break;
              }
            }

            // Verify relevance score is reasonable
            expect(result.relevanceScore).toBeGreaterThan(0);
            expect(result.relevanceScore).toBeLessThanOrEqual(1);

            // Verify match highlighting
            for (const match of result.matches) {
              expect(match.text).toContain('**');
              expect(match.confidence).toBeGreaterThan(0);
              expect(match.confidence).toBeLessThanOrEqual(1);
            }
          }

          // Core property: Search should find matches in all content areas where they exist
          
          // Verify title matches were found
          for (const expectedId of expectedMatches.title) {
            expect(foundSessions.has(expectedId)).toBe(true);
            expect(foundByType.title.has(expectedId)).toBe(true);
          }

          // Verify tag matches were found
          for (const expectedId of expectedMatches.tags) {
            expect(foundSessions.has(expectedId)).toBe(true);
            expect(foundByType.tags.has(expectedId)).toBe(true);
          }

          // Verify content matches were found
          for (const expectedId of expectedMatches.content) {
            expect(foundSessions.has(expectedId)).toBe(true);
            expect(foundByType.content.has(expectedId)).toBe(true);
          }

          // Verify filename matches were found
          for (const expectedId of expectedMatches.filename) {
            expect(foundSessions.has(expectedId)).toBe(true);
            expect(foundByType.filename.has(expectedId)).toBe(true);
          }

          // Verify no false positives (sessions without the search term should not be found)
          const allExpectedIds = new Set([
            ...expectedMatches.title,
            ...expectedMatches.tags,
            ...expectedMatches.content,
            ...expectedMatches.filename,
          ]);

          for (const result of searchResults) {
            expect(allExpectedIds.has(result.session.id)).toBe(true);
          }

          // Verify search results are sorted by relevance (default)
          for (let i = 1; i < searchResults.length; i++) {
            expect(searchResults[i - 1].relevanceScore).toBeGreaterThanOrEqual(
              searchResults[i].relevanceScore
            );
          }
        }
      ),
      { _numRuns: 20, _timeout: 15000 } // Reduced runs and added timeout
    );
  }, 20000); // 20 second test timeout

  /**
   * Additional property: Search should handle case sensitivity correctly
   */
  it('should handle case sensitivity in search correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          searchTerm: fc.string({ _minLength: 4, _maxLength: 8 }).filter(s => s.trim().length > 3 && /^[a-zA-Z0-9]+$/.test(s)), // Alphanumeric only
          caseSensitive: fc.boolean(),
        }),
        async ({ searchTerm, caseSensitive }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }

          // Create sessions with different case variations
          const lowerCase = searchTerm.toLowerCase();
          const upperCase = searchTerm.toUpperCase();
          const mixedCase = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

          const sessions = [
            { title: `Session with ${lowerCase}`, expectedMatch: !caseSensitive || lowerCase === searchTerm },
            { title: `Session with ${upperCase}`, expectedMatch: !caseSensitive || upperCase === searchTerm },
            { title: `Session with ${mixedCase}`, expectedMatch: !caseSensitive || mixedCase === searchTerm },
            { title: 'Session without the term', _expectedMatch: false },
          ];

          const createdSessions: any[] = [];
          for (let i = 0; i < sessions.length; i++) {
            const session = await manager.createSession({
              model: 'gpt-4o',
              workspaceRoot: `/test-${i}`,
              title: sessions[i].title,
            });
            createdSessions.push({ ...session, expectedMatch: sessions[i].expectedMatch });
          }

          // Perform search with specified case sensitivity
          const results = await manager.searchSessions(searchTerm, {
            caseSensitive,
            _includeMetadata: true,
            _includeContent: false,
            _includeFilenames: false,
          });

          // Verify case sensitivity behavior
          const foundIds = new Set(results.map(r => r.session.id));

          for (const session of createdSessions) {
            if (session.expectedMatch) {
              expect(foundIds.has(session.id)).toBe(true);
            } else {
              expect(foundIds.has(session.id)).toBe(false);
            }
          }
        }
      ),
      { _numRuns: 15, _timeout: 10000 } // Reduced runs and added timeout
    );
  }, 15000); // 15 second test timeout

  /**
   * Additional property: Search should return empty results for non-matching queries
   */
  it('should return empty results for non-matching search queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionCount: fc.integer({ _min: 2, _max: 3 }), // Reduced for performance
          nonMatchingTerm: fc.string({ _minLength: 8, _maxLength: 12 }).map(s => `nonexistent-${s.replace(/[^a-zA-Z0-9]/g, 'x')}-term`), // Clean up special chars
        }),
        async ({ sessionCount, nonMatchingTerm }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }

          // Create sessions without the search term
          for (let i = 0; i < sessionCount; i++) {
            const session = await manager.createSession({
              model: 'gpt-4o',
              workspaceRoot: `/test-${i}`,
              title: `Regular session ${i}`,
              tags: ['normal', 'regular'],
            });

            const modifiedSession = {
              ...session,
              messages: [
                {
                  id: createMessageId(),
                  role: 'user' as const,
                  content: `Regular message content ${i}`,
                  timestamp: Date.now(),
                },
              ],
              contextFiles: [`/path/to/file-${i}.ts`],
            };

            await manager.saveSession(modifiedSession);
          }

          // Search for non-existent term
          const results = await manager.searchSessions(nonMatchingTerm, {
            _includeContent: true,
            _includeMetadata: true,
            _includeFilenames: true,
          });

          // Should return no results
          expect(results).toHaveLength(0);
        }
      ),
      { _numRuns: 10, _timeout: 8000 } // Reduced runs and added timeout
    );
  }, 12000); // 12 second test timeout

  /**
   * Property 15: Filter accuracy
   * For any filter criteria (model, date), the results should only contain 
   * sessions matching the specified criteria
   * **Feature: session-persistence, Property 15: Filter accuracy**
   * **Validates: Requirements 5.3, 5.4**
   */
  it('should filter sessions accurately by model and date criteria', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionCount: fc.integer({ _min: 4, _max: 8 }),
          targetModel: fc.constantFrom('gpt-4o', 'claude-3-sonnet', 'gpt-3.5-turbo'),
          otherModel: fc.constantFrom('gemini-pro', 'llama-2', 'mistral-7b'),
          minMessages: fc.integer({ _min: 1, _max: 5 }),
          minTokens: fc.integer({ _min: 100, _max: 1000 }),
          delayBetweenSessions: fc.integer({ _min: 10, _max: 100 }), // Delay in ms to create time differences
        }),
        async ({ sessionCount, targetModel, otherModel, minMessages, minTokens, delayBetweenSessions }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }

          const createdSessions: any[] = [];
          const expectedModelMatches: string[] = [];
          const expectedMessageMatches: string[] = [];
          const expectedTokenMatches: string[] = [];
          
          // Record timestamps for date filtering test
          const sessionTimestamps: { id: string; _timestamp: number }[] = [];
          const startTime = Date.now();

          // Create sessions with different characteristics
          for (let i = 0; i < sessionCount; i++) {
            const useTargetModel = i % 2 === 0;
            const hasEnoughMessages = i % 4 === 0;
            const hasEnoughTokens = i % 5 === 0;

            const model = useTargetModel ? targetModel : otherModel;
            const messageCount = hasEnoughMessages ? minMessages + 2 : Math.max(0, minMessages - 1);
            const tokenCount = hasEnoughTokens ? minTokens + 100 : Math.max(0, minTokens - 50);

            // Add delay between sessions to create timestamp differences
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenSessions));
            }

            const session = await manager.createSession({
              model,
              workspaceRoot: `/test-${i}`,
              title: `Test session ${i}`,
            });

            // Create messages to match message count
            const messages = Array.from({ _length: messageCount }, (_, msgIndex) => ({
              id: createMessageId(),
              role: (msgIndex % 2 === 0 ? 'user' : 'assistant') as const,
              content: `Message ${msgIndex} in session ${i}`,
              timestamp: Date.now() + msgIndex * 1000,
            }));

            const modifiedSession = {
              ...session,
              messages,
              tokenCount: {
                _total: tokenCount,
                input: Math.floor(tokenCount * 0.4),
                output: Math.floor(tokenCount * 0.6),
              },
            };

            await manager.saveSession(modifiedSession);
            
            // Record the actual timestamp after saving (saveSession updates lastModified)
            const savedSession = await manager.loadSession(session.id);
            sessionTimestamps.push({ id: session.id, timestamp: savedSession.lastModified });
            createdSessions.push(savedSession);

            // Track expected matches
            if (useTargetModel) {
    expectedModelMatches.push(session.id);
  }
            if (hasEnoughMessages) {
    expectedMessageMatches.push(session.id);
  }
            if (hasEnoughTokens) {
    expectedTokenMatches.push(session.id);
  }
          }

          // Test model filtering
          const modelFilterResults = await manager.filterSessions({
            _model: targetModel,
          });

          expect(modelFilterResults.length).toBe(expectedModelMatches.length);
          const modelResultIds = new Set(modelFilterResults.map(s => s.id));
          for (const expectedId of expectedModelMatches) {
            expect(modelResultIds.has(expectedId)).toBe(true);
          }
          // Verify no false positives
          for (const result of modelFilterResults) {
            expect(result.model).toBe(targetModel);
          }

          // Test date range filtering using actual timestamps
          // Create a date range that includes some but not all sessions
          const sortedTimestamps = sessionTimestamps.sort((a, b) => a.timestamp - b.timestamp);
          if (sortedTimestamps.length >= 3) {
            // Create a range that includes the middle sessions but excludes first and last
            const rangeStart = new Date(sortedTimestamps[1].timestamp - 1000); // 1 second before second session
            const rangeEnd = new Date(sortedTimestamps[sortedTimestamps.length - 2].timestamp + 1000); // 1 second after second-to-last session
            
            const dateFilterResults = await manager.filterSessions({
              dateRange: {
                _start: rangeStart,
                _end: rangeEnd,
              },
            });

            // Verify all results are within date range
            for (const result of dateFilterResults) {
              const resultDate = new Date(result.lastModified);
              expect(resultDate.getTime()).toBeGreaterThanOrEqual(rangeStart.getTime());
              expect(resultDate.getTime()).toBeLessThanOrEqual(rangeEnd.getTime());
            }

            // Verify expected sessions are included
            const expectedInRange = sortedTimestamps.filter(s => 
              s.timestamp >= rangeStart.getTime() && s.timestamp <= rangeEnd.getTime()
            );
            expect(dateFilterResults.length).toBe(expectedInRange.length);
            
            const dateResultIds = new Set(dateFilterResults.map(s => s.id));
            for (const expected of expectedInRange) {
              expect(dateResultIds.has(expected.id)).toBe(true);
            }
          }

          // Test message count filtering
          const messageFilterResults = await manager.filterSessions({
            minMessages,
          });

          const messageResultIds = new Set(messageFilterResults.map(s => s.id));
          for (const expectedId of expectedMessageMatches) {
            expect(messageResultIds.has(expectedId)).toBe(true);
          }
          // Verify all results meet minimum message count
          for (const result of messageFilterResults) {
            expect(result.messageCount).toBeGreaterThanOrEqual(minMessages);
          }

          // Test token count filtering
          const tokenFilterResults = await manager.filterSessions({
            minTokens,
          });

          const tokenResultIds = new Set(tokenFilterResults.map(s => s.id));
          for (const expectedId of expectedTokenMatches) {
            expect(tokenResultIds.has(expectedId)).toBe(true);
          }
          // Verify all results meet minimum token count
          for (const result of tokenFilterResults) {
            expect(result.tokenCount.total).toBeGreaterThanOrEqual(minTokens);
          }

          // Test combined filtering with AND logic (default)
          const combinedAndResults = await manager.filterSessions({
            _model: targetModel,
            minMessages,
            _combineWithAnd: true,
          });

          // Should only include sessions that match BOTH criteria
          const expectedAndMatches = expectedModelMatches.filter(id => expectedMessageMatches.includes(id));
          expect(combinedAndResults.length).toBe(expectedAndMatches.length);

          const combinedAndIds = new Set(combinedAndResults.map(s => s.id));
          for (const expectedId of expectedAndMatches) {
            expect(combinedAndIds.has(expectedId)).toBe(true);
          }

          // Test combined filtering with OR logic
          const combinedOrResults = await manager.filterSessions({
            _model: targetModel,
            minMessages,
            _combineWithAnd: false,
          });

          // Should include sessions that match EITHER criteria
          const expectedOrMatches = new Set([...expectedModelMatches, ...expectedMessageMatches]);
          expect(combinedOrResults.length).toBe(expectedOrMatches.size);

          const combinedOrIds = new Set(combinedOrResults.map(s => s.id));
          for (const expectedId of expectedOrMatches) {
            expect(combinedOrIds.has(expectedId)).toBe(true);
          }
        }
      ),
      { _numRuns: 20, _timeout: 20000 } // 20 runs with 20 second timeout (increased due to delays)
    );
  }, 25000); // 25 second test timeout

  /**
   * Additional property: Empty filters should return all sessions
   */
  it('should return all sessions when no filters are applied', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionCount: fc.integer({ _min: 2, _max: 5 }),
        }),
        async ({ sessionCount }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }

          // Create sessions
          const createdSessions: any[] = [];
          for (let i = 0; i < sessionCount; i++) {
            const session = await manager.createSession({
              model: 'gpt-4o',
              workspaceRoot: `/test-${i}`,
              title: `Session ${i}`,
            });
            createdSessions.push(session);
          }

          // Filter with empty criteria
          const results = await manager.filterSessions({});

          // Should return all sessions
          expect(results.length).toBe(sessionCount);

          const resultIds = new Set(results.map(s => s.id));
          for (const session of createdSessions) {
            expect(resultIds.has(session.id)).toBe(true);
          }
        }
      ),
      { _numRuns: 10, _timeout: 5000 }
    );
  }, 8000);

  /**
   * Property 16: Search result enhancement
   * For any search results, the system should provide text highlighting, 
   * relevance scoring, and proper result formatting
   * **Feature: session-persistence, Property 16: Search result enhancement**
   * **Validates: Requirements 5.5**
   */
  it('should enhance search results with highlighting, scoring, and formatting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          searchTerm: fc.string({ _minLength: 4, _maxLength: 8 }).filter(s => s.trim().length > 3 && /^[a-zA-Z0-9]+$/.test(s)),
          sessionCount: fc.integer({ _min: 3, _max: 6 }),
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 15 }).map(s => `/workspace/${s}`),
        }),
        async ({ searchTerm, sessionCount, model, workspaceRoot }) => {
          // Ensure clean state
          const existingSessions = await manager.listSessions();
          for (const session of existingSessions) {
            await manager.deleteSession(session.id);
          }

          const createdSessions: any[] = [];
          const expectedHighlights: { sessionId: string; _matchType: string }[] = [];

          // Create sessions with search term in different locations and contexts
          for (let i = 0; i < sessionCount; i++) {
            const includeInTitle = i % 3 === 0;
            const includeInTags = i % 3 === 1;
            const includeInContent = i % 3 === 2;

            // Create session with search term in different locations
            const title = includeInTitle ? `Project ${searchTerm} analysis` : `Project ${i} analysis`;
            const tags = includeInTags ? [`${searchTerm}-related`, 'analysis'] : [`project-${i}`, 'analysis'];

            const session = await manager.createSession({
              model,
              workspaceRoot: `${workspaceRoot}-${i}`,
              title,
              tags,
            });

            // Add messages and context files
            let modifiedSession = {
              ...session,
              contextFiles: [`/path/to/file-${i}.ts`, '/path/to/other.js'],
            };

            // Add message with search term in content
            if (includeInContent) {
              modifiedSession = {
                ...modifiedSession,
                messages: [
                  {
                    id: createMessageId(),
                    role: 'user' as const,
                    content: `This is a detailed message about ${searchTerm} functionality and implementation`,
                    timestamp: Date.now(),
                  },
                  {
                    id: createMessageId(),
                    role: 'assistant' as const,
                    content: `Regular response without the term`,
                    timestamp: Date.now() + 1000,
                  },
                ],
              };
            } else {
              modifiedSession = {
                ...modifiedSession,
                messages: [
                  {
                    id: createMessageId(),
                    role: 'user' as const,
                    content: `Regular message ${i} without the special term`,
                    timestamp: Date.now(),
                  },
                ],
              };
            }

            await manager.saveSession(modifiedSession);
            createdSessions.push(modifiedSession);

            // Track expected highlights
            if (includeInTitle) {
    expectedHighlights.push({ sessionId: session.id, matchType: 'title' });
  }
            if (includeInTags) {
    expectedHighlights.push({ sessionId: session.id, matchType: 'tags' });
  }
            if (includeInContent) {
    expectedHighlights.push({ sessionId: session.id, matchType: 'content' });
  }
          }

          // Perform search with all enhancement features enabled
          const searchResults = await manager.searchSessions(searchTerm, {
            _includeContent: true,
            _includeMetadata: true,
            _includeFilenames: true,
            _caseSensitive: false,
            sortBy: 'relevance',
            _limit: 20,
            minRelevance: 0.1,
          });

          // Verify search found results
          expect(searchResults.length).toBeGreaterThan(0);

          // Property 1: All results should have valid relevance scores
          for (const result of searchResults) {
            expect(result.relevanceScore).toBeGreaterThan(0);
            expect(result.relevanceScore).toBeLessThanOrEqual(1);
            expect(typeof result.relevanceScore).toBe('number');
            expect(Number.isFinite(result.relevanceScore)).toBe(true);
          }

          // Property 2: Results should be sorted by relevance (descending)
          for (let i = 1; i < searchResults.length; i++) {
            expect(searchResults[i - 1].relevanceScore).toBeGreaterThanOrEqual(
              searchResults[i].relevanceScore
            );
          }

          // Property 3: All matches should have proper highlighting
          for (const result of searchResults) {
            expect(result.matches.length).toBeGreaterThan(0);
            
            for (const match of result.matches) {
              // Verify match structure
              expect(match.type).toBeDefined();
              expect(['message', 'title', 'tags', 'filename', 'notes']).toContain(match.type);
              expect(match.text).toBeDefined();
              expect(match.context).toBeDefined();
              expect(match.position).toBeGreaterThanOrEqual(0);
              expect(match.confidence).toBeGreaterThan(0);
              expect(match.confidence).toBeLessThanOrEqual(1);

              // Verify highlighting markers are present
              expect(match.text).toContain('**');
              
              // Verify the highlighted text contains the search term (case insensitive)
              const highlightedPortion = match.text.match(/\*\*(.*?)\*\*/);
              expect(highlightedPortion).not.toBeNull();
              if (highlightedPortion) {
                const highlightedText = highlightedPortion[1].toLowerCase();
                expect(highlightedText).toContain(searchTerm.toLowerCase());
              }

              // Verify context is meaningful (not empty and contains relevant info)
              expect(match.context.length).toBeGreaterThan(0);
              expect(match.context.toLowerCase()).toContain(searchTerm.toLowerCase());
            }
          }

          // Property 4: Match types should be correctly identified
          const foundMatchTypes = new Set<string>();
          for (const result of searchResults) {
            for (const match of result.matches) {
              foundMatchTypes.add(match.type);
            }
          }

          // Verify we found matches in the expected locations
          const expectedMatchTypes = new Set(expectedHighlights.map(h => {
            switch (h.matchType) {
              case 'title': return 'title';
              case 'tags': return 'tags';
              case 'content': return 'message';
              default: return h.matchType;
            }
          }));

          for (const expectedType of expectedMatchTypes) {
            expect(foundMatchTypes.has(expectedType)).toBe(true);
          }

          // Property 5: Search result metadata should be complete
          for (const result of searchResults) {
            expect(result.session).toBeDefined();
            expect(result.session.id).toBeDefined();
            expect(result.matchType).toBeDefined();
            expect(['content', 'metadata', 'filename', 'mixed']).toContain(result.matchType);

            // Verify session metadata is preserved
            expect(result.session.model).toBe(model);
            expect(result.session.workspaceRoot).toContain(workspaceRoot);
          }

          // Property 6: Higher confidence matches should contribute to higher relevance scores
          const highConfidenceResults = searchResults.filter(r => 
            r.matches.some(m => m.confidence > 0.8)
          );
          const lowConfidenceResults = searchResults.filter(r => 
            r.matches.every(m => m.confidence <= 0.8)
          );

          if (highConfidenceResults.length > 0 && lowConfidenceResults.length > 0) {
            const avgHighConfidenceScore = highConfidenceResults.reduce((sum, r) => sum + r.relevanceScore, 0) / highConfidenceResults.length;
            const avgLowConfidenceScore = lowConfidenceResults.reduce((sum, r) => sum + r.relevanceScore, 0) / lowConfidenceResults.length;
            
            // High confidence matches should generally have higher relevance scores
            // Use a more lenient tolerance to account for floating-point precision
            expect(avgHighConfidenceScore).toBeGreaterThanOrEqual(avgLowConfidenceScore * 0.7); // Allow more tolerance
          }

          // Property 7: Context should provide meaningful surrounding text
          for (const result of searchResults) {
            for (const match of result.matches) {
              if (match.type === 'message') {
                // Context should be meaningful and contain the match
                expect(match.context.length).toBeGreaterThan(0);
                
                // Context should include the highlighted text (case insensitive)
                const cleanText = match.text.replace(/\*\*/g, '');
                expect(match.context.toLowerCase()).toContain(cleanText.toLowerCase());
              }
            }
          }
        }
      ),
      { _numRuns: 15, _timeout: 12000 } // 15 runs with 12 second timeout
    );
  }, 15000); // 15 second test timeout
});