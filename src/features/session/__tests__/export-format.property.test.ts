/**
 * @fileoverview Property-based tests for session export format consistency
 * **Feature: session-persistence, Property 8: Session export format consistency**
 * **Validates: Requirements 3.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import { createMessageId, createSessionId } from '../../../shared/types/index.js';
import type { CreateSessionOptions, ExportSessionOptions } from '../manager.js';
import type { Session, Message } from '../../../shared/types/index.js';

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

describe('Session Export Format Property Tests', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-export-test-'));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    // Create storage and manager instances
    storage = new SessionStorage();
    manager = new SessionManager(storage);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  /**
   * Property 8: Session export format consistency
   * For any session export operation, the output should be valid JSON containing all session data
   */
  it('should export sessions in valid JSON format with consistent structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate session data
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo', 'claude-3-sonnet', 'gemini-pro'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 50 }).map(s => `/workspace/${s}`),
          title: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
          tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          notes: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
          messageCount: fc.integer({ min: 0, max: 20 }),
          contextFiles: fc.array(fc.string({ minLength: 5, maxLength: 50 }).map(s => `/path/to/${s}.ts`), { maxLength: 10 }),
        }),
        // Generate export options
        fc.record({
          format: fc.constantFrom('json', 'json-pretty', 'json-compact'),
          sanitize: fc.boolean(),
          includeContent: fc.boolean(),
          metadataOnly: fc.boolean(),
          preserveWorkspacePaths: fc.boolean(),
        }),
        async (sessionData, exportOptions) => {
          // Create a session with the generated data
          const createOptions: CreateSessionOptions = {
            model: sessionData.model,
            workspaceRoot: sessionData.workspaceRoot,
            title: sessionData.title ?? undefined,
            tags: sessionData.tags,
            notes: sessionData.notes ?? undefined,
          };
          
          const session = await manager.createSession(createOptions);
          
          // Add some messages to the session
          const messages: Message[] = [];
          for (let i = 0; i < sessionData.messageCount; i++) {
            messages.push({
              id: createMessageId(),
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `Test message ${i + 1}`,
              timestamp: Date.now() + i * 1000,
            });
          }
          
          // Update session with messages and context files
          const updatedSession: Session = {
            ...session,
            messages,
            contextFiles: sessionData.contextFiles,
          };
          
          await manager.saveSession(updatedSession);
          
          // Export the session
          const exportResult = await manager.exportSession(session.id, exportOptions as ExportSessionOptions);
          
          // Verify export result structure
          expect(exportResult).toBeDefined();
          expect(exportResult.data).toBeDefined();
          expect(typeof exportResult.data).toBe('string');
          expect(exportResult.format).toBe(exportOptions.format);
          expect(typeof exportResult.sanitized).toBe('boolean');
          expect(typeof exportResult.size).toBe('number');
          expect(Array.isArray(exportResult.warnings)).toBe(true);
          
          // Verify the exported data is valid JSON
          let parsedData: any;
          expect(() => {
            parsedData = JSON.parse(exportResult.data);
          }).not.toThrow();
          
          // Verify the JSON structure contains required fields
          expect(parsedData).toBeDefined();
          expect(parsedData.type).toBeDefined();
          expect(parsedData.version).toBeDefined();
          expect(parsedData.exported).toBeDefined();
          expect(typeof parsedData.exported).toBe('number');
          
          if (exportOptions.metadataOnly) {
            // For metadata-only exports, verify metadata structure
            expect(parsedData.type).toBe('session-metadata');
            expect(parsedData.metadata).toBeDefined();
            expect(parsedData.metadata.id).toBeDefined();
            expect(parsedData.metadata.model).toBeDefined();
            expect(parsedData.metadata.created).toBeDefined();
            expect(parsedData.metadata.lastModified).toBeDefined();
          } else {
            // For full session exports, verify session structure
            expect(parsedData.type).toBe('session-full');
            expect(parsedData.session).toBeDefined();
            expect(parsedData.session.id).toBeDefined();
            expect(parsedData.session.model).toBe(sessionData.model);
            expect(parsedData.session.version).toBeDefined();
            expect(parsedData.session.created).toBeDefined();
            expect(parsedData.session.lastModified).toBeDefined();
            expect(Array.isArray(parsedData.session.messages)).toBe(true);
            expect(Array.isArray(parsedData.session.contextFiles)).toBe(true);
            expect(Array.isArray(parsedData.session.tags)).toBe(true);
            
            // Verify message content handling
            if (exportOptions.includeContent) {
              // Messages should contain actual content
              if (parsedData.session.messages.length > 0) {
                const firstMessage = parsedData.session.messages[0];
                expect(firstMessage.content).toBeDefined();
                if (!exportOptions.sanitize || typeof firstMessage.content === 'string') {
                  // Content should be preserved if not sanitized or if it's a simple string
                  expect(firstMessage.content).not.toBe('[Content removed]');
                }
              }
            } else {
              // Messages should have content removed
              if (parsedData.session.messages.length > 0) {
                const firstMessage = parsedData.session.messages[0];
                if (typeof firstMessage.content === 'string') {
                  expect(firstMessage.content).toBe('[Content removed]');
                }
              }
            }
            
            // Verify workspace path handling
            if (exportOptions.sanitize && !exportOptions.preserveWorkspacePaths) {
              expect(parsedData.session.workspaceRoot).toBe('[Workspace path removed]');
              expect(parsedData.originalWorkspace).toBe('[Workspace path removed]');
            } else if (exportOptions.preserveWorkspacePaths) {
              expect(parsedData.session.workspaceRoot).toBe(sessionData.workspaceRoot);
              expect(parsedData.originalWorkspace).toBe(sessionData.workspaceRoot);
            }
          }
          
          // Verify format consistency
          if (exportOptions.format === 'json-compact') {
            // Compact format should not contain extra whitespace
            expect(exportResult.data).not.toMatch(/\n\s+/);
          } else {
            // Pretty format should contain proper indentation
            expect(exportResult.data).toMatch(/\n\s+/);
          }
          
          // Verify size calculation is accurate
          const actualSize = Buffer.byteLength(exportResult.data, 'utf8');
          expect(exportResult.size).toBe(actualSize);
          
          // Verify sanitization flag matches options
          expect(exportResult.sanitized).toBe(exportOptions.sanitize);
          
          // Verify the exported data can be parsed back to the same structure
          const reparsedData = JSON.parse(exportResult.data);
          expect(reparsedData).toEqual(parsedData);
        }
      ),
      { numRuns: 100 } // Run 100 iterations to test various combinations
    );
  });

  /**
   * Additional property: Export format should be deterministic for the same input
   */
  it('should produce identical exports for the same session and options', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 30 }).map(s => `/test/${s}`),
          format: fc.constantFrom('json', 'json-pretty', 'json-compact'),
          sanitize: fc.boolean(),
        }),
        async ({ model, workspaceRoot, format, sanitize }) => {
          // Create a session
          const session = await manager.createSession({ model, workspaceRoot });
          
          const exportOptions: ExportSessionOptions = {
            format: format as any,
            sanitize,
            includeContent: true,
            metadataOnly: false,
          };
          
          // Export the session twice
          const export1 = await manager.exportSession(session.id, exportOptions);
          const export2 = await manager.exportSession(session.id, exportOptions);
          
          // The exports should be identical (except for the exported timestamp)
          expect(export1.format).toBe(export2.format);
          expect(export1.sanitized).toBe(export2.sanitized);
          expect(export1.size).toBe(export2.size);
          expect(export1.warnings).toEqual(export2.warnings);
          
          // Parse both exports and compare structure (ignoring timestamp)
          const parsed1 = JSON.parse(export1.data);
          const parsed2 = JSON.parse(export2.data);
          
          // Remove timestamps for comparison
          delete parsed1.exported;
          delete parsed2.exported;
          
          expect(parsed1).toEqual(parsed2);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Additional property: Export should preserve essential session data
   */
  it('should preserve essential session data in all export formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 30 }).map(s => `/workspace/${s}`),
          title: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          tags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 3 }),
        }),
        async ({ model, workspaceRoot, title, tags }) => {
          // Create session with specific data
          const session = await manager.createSession({
            model,
            workspaceRoot,
            title: title ?? undefined,
            tags,
          });
          
          // Test all export formats
          const formats: Array<'json' | 'json-pretty' | 'json-compact'> = ['json', 'json-pretty', 'json-compact'];
          
          for (const format of formats) {
            const exportResult = await manager.exportSession(session.id, {
              format,
              sanitize: false, // Don't sanitize to preserve original data
              includeContent: true,
              metadataOnly: false,
            });
            
            const parsedData = JSON.parse(exportResult.data);
            
            // Verify essential data is preserved
            expect(parsedData.session.id).toBe(session.id);
            expect(parsedData.session.model).toBe(model);
            expect(parsedData.session.workspaceRoot).toBe(workspaceRoot);
            expect(parsedData.session.version).toBe(session.version);
            expect(parsedData.session.created).toBe(session.created);
            expect(parsedData.session.lastModified).toBe(session.lastModified);
            
            if (title) {
              expect(parsedData.session.title).toBe(title);
            }
            
            expect(parsedData.session.tags).toEqual(tags);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});