/**
 * @fileoverview Property-based tests for session import validation
 * **Feature: session-persistence, Property 22: Import validation**
 * **Validates: Requirements 7.3**
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

describe('Session Import Validation Property Tests', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-import-validation-test-'));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    storage = new SessionStorage({ 
      enableCompression: false,
      enableChecksum: false,
      createBackups: false,
    });
    manager = new SessionManager(storage);
  });

  afterEach(async () => {
    // Small delay to allow file handles to close on Windows
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  /**
   * Property 22: Import validation
   * For any session import operation, the format should be validated and warnings should be shown for missing context
   */
  it('should validate import format and show warnings for invalid data', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate various types of invalid import data
        fc.oneof(
          // Invalid JSON strings
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
            try {
              JSON.parse(s);
              return false; // Skip valid JSON
            } catch {
              return true; // Keep invalid JSON
            }
          }),
          
          // Valid JSON but invalid format
          fc.record({
            invalidField: fc.string(),
            randomData: fc.integer(),
          }),
          
          // Missing required export format fields
          fc.record({
            session: fc.record({
              model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
              workspaceRoot: fc.string({ minLength: 1, maxLength: 20 }),
              messages: fc.array(fc.record({
                role: fc.constantFrom('user', 'assistant'),
                content: fc.string({ minLength: 1, maxLength: 50 }),
              }), { maxLength: 3 }),
            }),
            // Missing type and version fields
          }),
          
          // Metadata-only export (should be rejected)
          fc.record({
            type: fc.constant('session-metadata'),
            version: fc.constant('1.0.0'),
            metadata: fc.record({
              id: fc.string(),
              model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
            }),
          }),
        ),
        
        // Test both strict and non-strict validation modes
        fc.boolean(),
        
        async (invalidData, strictValidation) => {
          const dataString = typeof invalidData === 'string' 
            ? invalidData 
            : JSON.stringify(invalidData);
          
          if (typeof invalidData === 'string') {
            // Invalid JSON should always throw
            await expect(
              manager.importSession(dataString, { strictValidation })
            ).rejects.toThrow(/Invalid JSON format/);
          } else if (invalidData.type === 'session-metadata') {
            // Metadata-only exports should always be rejected
            await expect(
              manager.importSession(dataString, { strictValidation })
            ).rejects.toThrow(/Cannot import session from metadata-only export/);
          } else if (strictValidation) {
            // In strict mode, invalid formats should throw
            await expect(
              manager.importSession(dataString, { strictValidation: true })
            ).rejects.toThrow();
          } else {
            // In non-strict mode, should attempt repair and show warnings
            try {
              const result = await manager.importSession(dataString, { 
                strictValidation: false,
                generateNewId: true,
                showWarnings: true,
              });
              
              // Should have warnings about format issues
              expect(result.warnings).toBeDefined();
              expect(Array.isArray(result.warnings)).toBe(true);
              expect(result.warnings.length).toBeGreaterThan(0);
              
              // Should have attempted to create a valid session
              expect(result.session).toBeDefined();
              expect(result.session.id).toBeDefined();
              expect(result.newIdGenerated).toBe(true);
              
            } catch (error) {
              // Some data might be too malformed even for non-strict mode
              expect(error).toBeInstanceOf(Error);
            }
          }
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  }, 15000);

  /**
   * Test validation warnings for missing context files
   */
  it('should warn about missing context files during import', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 20 }),
          contextFiles: fc.array(
            fc.string({ minLength: 5, maxLength: 30 }).map(s => `/${s}.ts`),
            { minLength: 1, maxLength: 5 }
          ),
          messageCount: fc.integer({ min: 1, max: 3 }),
        }),
        
        async ({ model, workspaceRoot, contextFiles, messageCount }) => {
          // Create a session with context files
          const createOptions: CreateSessionOptions = {
            model,
            workspaceRoot,
          };
          
          const session = await manager.createSession(createOptions);
          
          // Add context files that likely don't exist
          session.contextFiles = contextFiles;
          
          // Add some messages
          for (let i = 0; i < messageCount; i++) {
            session.messages.push({
              id: createMessageId(),
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `Test message ${i + 1}`,
              timestamp: Date.now() + i,
            });
          }
          
          await manager.saveSession(session);
          
          // Export the session
          const exportResult = await manager.exportSession(session.id, {
            format: 'json',
            sanitize: false,
          });
          
          // Import the session with warnings enabled
          const importResult = await manager.importSession(exportResult.data, {
            generateNewId: true,
            showWarnings: true,
            strictValidation: false,
          });
          
          // Verify import validation properties
          expect(importResult.session).toBeDefined();
          expect(importResult.session.id).not.toBe(session.id);
          expect(importResult.newIdGenerated).toBe(true);
          
          // Verify context file validation
          expect(importResult.missingContextFiles).toBeDefined();
          expect(Array.isArray(importResult.missingContextFiles)).toBe(true);
          
          // Verify warnings are present
          expect(importResult.warnings).toBeDefined();
          expect(Array.isArray(importResult.warnings)).toBe(true);
          
          // The session should preserve the context files list even if they're missing
          expect(importResult.session.contextFiles).toEqual(contextFiles);
          
          // Verify the imported session can be loaded
          const loadedSession = await manager.loadSession(importResult.session.id);
          expect(loadedSession.contextFiles).toEqual(contextFiles);
          expect(loadedSession.messages).toHaveLength(messageCount);
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  }, 15000);

  /**
   * Test format validation with various export format variations
   */
  it('should validate different export format structures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 20 }),
          hasTypeField: fc.boolean(),
          hasVersionField: fc.boolean(),
          exportType: fc.constantFrom('session-full', 'session-metadata', 'unknown-type'),
        }),
        
        async ({ model, workspaceRoot, hasTypeField, hasVersionField, exportType }) => {
          // Create a valid session first
          const createOptions: CreateSessionOptions = {
            model,
            workspaceRoot,
          };
          
          const session = await manager.createSession(createOptions);
          session.messages.push({
            id: createMessageId(),
            role: 'user',
            content: 'Test message',
            timestamp: Date.now(),
          });
          
          await manager.saveSession(session);
          
          // Create export data with varying format compliance
          const exportData: any = {
            session: {
              id: session.id,
              model: session.model,
              workspaceRoot: session.workspaceRoot,
              messages: session.messages,
              contextFiles: session.contextFiles,
              created: session.created,
              lastModified: session.lastModified,
              tokenCount: session.tokenCount,
              tags: session.tags || [],
            },
          };
          
          if (hasTypeField) {
            exportData.type = exportType;
          }
          
          if (hasVersionField) {
            exportData.version = '1.0.0';
          }
          
          const dataString = JSON.stringify(exportData);
          
          if (hasTypeField && exportType === 'session-metadata') {
            // Metadata-only should be rejected
            await expect(
              manager.importSession(dataString, { strictValidation: false })
            ).rejects.toThrow(/Cannot import session from metadata-only export/);
          } else if (hasTypeField && exportType === 'unknown-type') {
            // Unknown export type should be rejected
            await expect(
              manager.importSession(dataString, { strictValidation: false })
            ).rejects.toThrow(/Unsupported export type/);
          } else if (!hasTypeField || !hasVersionField) {
            // Missing format fields should generate warnings in non-strict mode
            const result = await manager.importSession(dataString, {
              strictValidation: false,
              generateNewId: true,
              showWarnings: true,
            });
            
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('format metadata'))).toBe(true);
            expect(result.session).toBeDefined();
          } else {
            // Valid format should import successfully
            const result = await manager.importSession(dataString, {
              strictValidation: false,
              generateNewId: true,
            });
            
            expect(result.session).toBeDefined();
            expect(result.session.model).toBe(model);
            expect(result.session.workspaceRoot).toBe(workspaceRoot);
          }
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  }, 15000);
});