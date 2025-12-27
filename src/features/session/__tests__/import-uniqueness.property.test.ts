/**
 * @fileoverview Property-based tests for session import uniqueness
 * **Feature: session-persistence, Property 21: Import uniqueness**
 * **Validates: Requirements 7.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import { 
  type Session, 
  createSessionId,
  createMessageId,
} from '../../../shared/types/index.js';
import type { CreateSessionOptions } from '../manager.js';

// Mock the config loader
vi.mock('../../../config/loader.js', async () => {
  const actual = await vi.importActual('../../../config/loader.js');
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  };
});

describe('Session Import Uniqueness Property Tests', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-import-uniqueness-test-'));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    storage = new SessionStorage({ 
      _enableCompression: false,
      _enableChecksum: false,
      _createBackups: false,
    });
    manager = new SessionManager(storage);
  });

  afterEach(async () => {
    // Small delay to allow file handles to close on Windows
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { _recursive: true, _force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  /**
   * Property 21: Import uniqueness
   * For any imported shared session, a new unique session ID should be assigned to prevent conflicts
   */
  it('should assign unique session IDs when importing sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate fewer sessions with simpler properties to avoid timeout
        fc.array(
          fc.record({
            model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
            messageCount: fc.integer({ _min: 1, _max: 3 }),
            workspaceRoot: fc.string({ _minLength: 5, _maxLength: 20 }),
            title: fc.option(fc.string({ _minLength: 1, _maxLength: 20 })),
            tags: fc.array(fc.string({ _minLength: 1, _maxLength: 10 }), { _maxLength: 2 }),
          }),
          { _minLength: 1, _maxLength: 3 }
        ),
        async (sessionConfigs) => {
          const createdSessions: Session[] = [];
          const importedSessionIds: Set<string> = new Set();
          let totalImportsExpected = 0;
          
          // Create and export sessions
          for (const config of sessionConfigs) {
            const createOptions: CreateSessionOptions = {
              model: config.model,
              workspaceRoot: config.workspaceRoot,
              title: config.title ?? undefined,
              tags: config.tags,
            };
            
            const session = await manager.createSession(createOptions);
            
            // Add messages to make sessions more realistic
            for (let i = 0; i < config.messageCount; i++) {
              session.messages.push({
                id: createMessageId(),
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i + 1}`,
                timestamp: Date.now() + i,
              });
            }
            
            await manager.saveSession(session);
            createdSessions.push(session);
          }
          
          // Export and import each session multiple times
          for (const originalSession of createdSessions) {
            const exportResult = await manager.exportSession(originalSession.id, {
              format: 'json',
              _sanitize: false,
            });
            
            // Import the same session 2-3 times
            const importCount = fc.sample(fc.integer({ _min: 2, _max: 3 }), 1)[0];
            totalImportsExpected += importCount;
            
            for (let i = 0; i < importCount; i++) {
              const importResult = await manager.importSession(exportResult.data, {
                _generateNewId: true,
                _preserveTimestamps: false,
              });
              
              // Verify uniqueness properties
              expect(importResult.newIdGenerated).toBe(true);
              expect(importResult.session.id).not.toBe(originalSession.id);
              expect(importResult.originalId).toBe(originalSession.id);
              
              // Verify the imported session ID is unique across all imports
              expect(importedSessionIds.has(importResult.session.id)).toBe(false);
              importedSessionIds.add(importResult.session.id);
              
              // Verify the session can be loaded with its new ID
              const loadedSession = await manager.loadSession(importResult.session.id);
              expect(loadedSession.id).toBe(importResult.session.id);
              expect(loadedSession.model).toBe(originalSession.model);
              expect(loadedSession.messages).toHaveLength(originalSession.messages.length);
            }
          }
          
          // Verify all imported session IDs are unique
          expect(importedSessionIds.size).toBe(totalImportsExpected);
        }
      ),
      { _numRuns: 50, _timeout: 15000 }
    );
  }, 20000);

  /**
   * Additional test: Import uniqueness with existing session conflicts
   * Verifies that even when generateNewId is false, conflicts are resolved with unique IDs
   */
  it('should generate unique IDs when conflicts occur during import', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          messageCount: fc.integer({ _min: 1, _max: 3 }),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 20 }),
        }),
        async ({ model, messageCount, workspaceRoot }) => {
          // Create an original session
          const createOptions: CreateSessionOptions = {
            model,
            workspaceRoot,
          };
          
          const originalSession = await manager.createSession(createOptions);
          
          // Add some messages
          for (let i = 0; i < messageCount; i++) {
            originalSession.messages.push({
              id: createMessageId(),
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `Test message ${i + 1}`,
              timestamp: Date.now() + i,
            });
          }
          
          await manager.saveSession(originalSession);
          
          // Export the session
          const exportResult = await manager.exportSession(originalSession.id, {
            format: 'json',
            _sanitize: false,
          });
          
          // Try to import with generateNewId = false (should detect conflict and generate new ID)
          const importResult = await manager.importSession(exportResult.data, {
            _generateNewId: false,
            _strictValidation: false, // Allow auto-generation when ID exists
          });
          
          // Verify conflict resolution
          expect(importResult.session.id).not.toBe(originalSession.id);
          expect(importResult.newIdGenerated).toBe(true);
          expect(importResult.originalId).toBe(originalSession.id);
          expect(importResult.warnings.some(w => w.includes('already exists'))).toBe(true);
          
          // Verify both sessions exist and are distinct
          const originalLoaded = await manager.loadSession(originalSession.id);
          const importedLoaded = await manager.loadSession(importResult.session.id);
          
          expect(originalLoaded.id).toBe(originalSession.id);
          expect(importedLoaded.id).toBe(importResult.session.id);
          expect(originalLoaded.id).not.toBe(importedLoaded.id);
          
          // Verify content is preserved
          expect(importedLoaded.model).toBe(originalSession.model);
          expect(importedLoaded.messages).toHaveLength(originalSession.messages.length);
        }
      ),
      { _numRuns: 50, _timeout: 10000 }
    );
  }, 15000);
});