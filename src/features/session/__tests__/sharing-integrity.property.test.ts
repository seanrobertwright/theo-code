/**
 * @fileoverview Property-based tests for session sharing data integrity
 * **Feature: session-persistence, Property 20: Sharing data integrity**
 * **Validates: Requirements 7.2, 7.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import { createMessageId } from '../../../shared/types/index.js';
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
          _autoSaveInterval: 30000,
          _maxSessions: 50,
        },
      },
    }),
  };
});

describe('Session Sharing Data Integrity Property Tests', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-sharing-test-'));
    
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
      await fs.rm(tempDir, { _recursive: true, _force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    vi.clearAllMocks();
  });

  /**
   * Property 20: Sharing data integrity
   * For any session export for sharing, sensitive information should be removed 
   * while preserving necessary metadata and workspace information
   */
  it('should sanitize sensitive data while preserving essential metadata for sharing', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate session data with potentially sensitive information
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 10, _maxLength: 50 }).map(s => `/home/user/projects/${s}`),
          title: fc.option(fc.string({ _minLength: 1, _maxLength: 100 })),
          tags: fc.array(fc.string({ _minLength: 1, _maxLength: 20 }), { _maxLength: 5 }),
          notes: fc.option(fc.string({ _minLength: 1, _maxLength: 200 })),
          contextFiles: fc.array(
            fc.string({ _minLength: 5, _maxLength: 30 }).map(s => `/home/user/projects/myapp/src/${s}.ts`), 
            { _maxLength: 8 }
          ),
          sensitiveMessages: fc.array(
            fc.record({
              role: fc.constantFrom('user', 'assistant'),
              content: fc.oneof(
                // Messages with API keys (more realistic format)
                fc.string({ _minLength: 10, _maxLength: 20 }).map(s => `Here's my API key: sk-${s}1234567890abcdef`),
                // Messages with email addresses
                fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `Contact me at user${s}@example.com`),
                // Messages with file paths
                fc.string({ _minLength: 3, _maxLength: 15 }).map(s => `Check the file at /home/user/secret/${s}.txt`),
                // Messages with URLs with credentials
                fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `https://user:pass@${s}.com/api`),
                // Normal messages
                fc.string({ _minLength: 10, _maxLength: 100 })
              ),
            }),
            { _minLength: 1, _maxLength: 10 }
          ),
        }),
        // Generate export options for sharing
        fc.record({
          sanitize: fc.constant(true), // Always sanitize for sharing
          preserveWorkspacePaths: fc.boolean(),
          includeContent: fc.boolean(),
          metadataOnly: fc.boolean(),
          customSanitizationPatterns: fc.array(
            fc.constantFrom(
              'secret\\w+', // Custom pattern for "secret" words
              '\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b', // Credit card pattern
              'password\\s*[:=]\\s*\\w+' // Password pattern
            ),
            { _maxLength: 3 }
          ),
        }),
        async (sessionData, exportOptions) => {
          // Create a session with potentially sensitive data
          const createOptions: CreateSessionOptions = {
            model: sessionData.model,
            workspaceRoot: sessionData.workspaceRoot,
            title: sessionData.title ?? undefined,
            tags: sessionData.tags,
            notes: sessionData.notes ?? undefined,
          };
          
          const session = await manager.createSession(createOptions);
          
          // Add messages with potentially sensitive content
          const messages: Message[] = sessionData.sensitiveMessages.map((msgData, index) => ({
            id: createMessageId(),
            role: msgData.role as any,
            content: msgData.content,
            timestamp: Date.now() + index * 1000,
          }));
          
          // Update session with messages and context files
          const updatedSession: Session = {
            ...session,
            messages,
            contextFiles: sessionData.contextFiles,
          };
          
          await manager.saveSession(updatedSession);
          
          // Export the session for sharing
          const exportResult = await manager.exportSession(session.id, exportOptions as ExportSessionOptions);
          
          // Parse the exported data
          const exportedData = JSON.parse(exportResult.data);
          
          // Verify sanitization occurred
          expect(exportResult.sanitized).toBe(true);
          expect(exportResult.warnings).toContain('Sensitive data was sanitized from export');
          
          if (exportOptions.metadataOnly) {
            // For metadata-only exports, check metadata sanitization
            const metadata = exportedData.metadata;
            
            // Workspace paths should be sanitized unless preserved
            if (!exportOptions.preserveWorkspacePaths) {
              expect(metadata.workspaceRoot).toBe('[Workspace path removed]');
              
              // Context files should be sanitized
              for (const filePath of metadata.contextFiles) {
                expect(filePath).not.toMatch(/^\/home\/user/);
                expect(filePath).toMatch(/^\.\.\./); // Should start with ...
              }
            }
            
            // Preview and last message should be sanitized
            if (metadata.preview) {
              // Check that preview doesn't contain original sensitive data
              for (const msgData of sessionData.sensitiveMessages) {
                const originalContent = msgData.content.trim();
                if (originalContent.includes('sk-') || originalContent.includes('@') || originalContent.includes('/home/user')) {
                  expect(metadata.preview).not.toContain(originalContent);
                }
              }
            }
            
          } else {
            // For full session exports, check session data sanitization
            const sessionExport = exportedData.session;
            
            // Workspace root should be sanitized unless preserved
            if (!exportOptions.preserveWorkspacePaths) {
              expect(sessionExport.workspaceRoot).toBe('[Workspace path removed]');
              expect(exportedData.originalWorkspace).toBe('[Workspace path removed]');
              
              // Context files should be sanitized
              for (const filePath of sessionExport.contextFiles) {
                expect(filePath).not.toMatch(/^\/home\/user/);
                expect(filePath).toMatch(/^\.\.\./); // Should start with ...
              }
              
              // Files accessed should be sanitized
              for (const filePath of sessionExport.filesAccessed) {
                expect(filePath).not.toMatch(/^\/home\/user/);
              }
            }
            
            // Messages should be sanitized if content is included
            if (exportOptions.includeContent) {
              for (let i = 0; i < sessionExport.messages.length; i++) {
                const message = sessionExport.messages[i];
                const content = typeof message.content === 'string' ? message.content : 
                               message.content.find((block: any) => block.type === 'text')?.text ?? '';
                
                if (content !== '[Content removed]') {
                  // Check if this specific message originally contained sensitive data
                  const originalMessage = sessionData.sensitiveMessages[i];
                  if (originalMessage) {
                    const originalContent = originalMessage.content.trim();
                    
                    // Check that original sensitive content is not present
                    if (originalContent.includes('sk-')) {
                      expect(content).not.toContain(originalContent);
                    }
                    if (originalContent.includes('@')) {
                      expect(content).not.toContain(originalContent);
                    }
                    if (originalContent.includes('/home/user')) {
                      expect(content).not.toContain(originalContent);
                    }
                    if (originalContent.includes('https://user:pass')) {
                      expect(content).not.toContain(originalContent);
                    }
                    
                    // Check custom sanitization patterns
                    for (const pattern of exportOptions.customSanitizationPatterns) {
                      try {
                        const regex = new RegExp(pattern, 'gi');
                        expect(content).not.toMatch(regex);
                      } catch {
                        // Skip invalid patterns
                      }
                    }
                    
                    const hasSensitiveContent = originalContent.length > 0 && (
                      originalContent.includes('sk-') || 
                      originalContent.includes('@') || 
                      originalContent.includes('/home/user') ||
                      originalContent.includes('https://user:pass')
                    );
                    
                    if (hasSensitiveContent) {
                      expect(content).toMatch(/\[REDACTED\]/);
                    }
                  }
                }
              }
            }
          }
          
          // Verify essential metadata is preserved
          if (!exportOptions.metadataOnly) {
            const sessionExport = exportedData.session;
            
            // Essential fields should be preserved
            expect(sessionExport.id).toBeDefined();
            expect(sessionExport.model).toBe(sessionData.model);
            expect(sessionExport.version).toBeDefined();
            expect(sessionExport.created).toBeDefined();
            expect(sessionExport.lastModified).toBeDefined();
            expect(sessionExport.tokenCount).toBeDefined();
            expect(Array.isArray(sessionExport.messages)).toBe(true);
            expect(Array.isArray(sessionExport.contextFiles)).toBe(true);
            expect(Array.isArray(sessionExport.tags)).toBe(true);
            
            // Optional fields should be preserved if they existed
            if (sessionData.title) {
              expect(sessionExport.title).toBeDefined();
            }
            
            if (sessionData.notes) {
              expect(sessionExport.notes).toBeDefined();
            }
            
            expect(sessionExport.tags).toEqual(sessionData.tags);
          }
          
          // Verify export format structure
          expect(exportedData.type).toBeDefined();
          expect(exportedData.version).toBeDefined();
          expect(exportedData.exported).toBeDefined();
          expect(typeof exportedData.exported).toBe('number');
        }
      ),
      { _numRuns: 100 } // Run 100 iterations to test various sensitive data patterns
    );
  });

  /**
   * Additional property: Sanitization should be consistent across multiple exports
   */
  it('should consistently sanitize the same sensitive data patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 10, _maxLength: 30 }).map(s => `/sensitive/path/${s}`),
          apiKey: fc.string({ _minLength: 20, _maxLength: 20 }).map(s => `sk-${s}abcdef1234567890`),
          email: fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `user${s}@example.com`),
        }),
        async ({ model, workspaceRoot, apiKey, email }) => {
          // Create session with known sensitive data
          const session = await manager.createSession({ model, workspaceRoot });
          
          // Add message with sensitive content
          const sensitiveMessage: Message = {
            id: createMessageId(),
            role: 'user',
            content: `My API key is ${apiKey} and email is ${email}. Check file at ${workspaceRoot}/secret.txt`,
            timestamp: Date.now(),
          };
          
          const updatedSession: Session = {
            ...session,
            messages: [sensitiveMessage],
            contextFiles: [`${workspaceRoot}/config.json`],
          };
          
          await manager.saveSession(updatedSession);
          
          // Export multiple times with sanitization
          const export1 = await manager.exportSession(session.id, { _sanitize: true, _preserveWorkspacePaths: false });
          const export2 = await manager.exportSession(session.id, { _sanitize: true, _preserveWorkspacePaths: false });
          
          const data1 = JSON.parse(export1.data);
          const data2 = JSON.parse(export2.data);
          
          // Remove timestamps for comparison
          delete data1.exported;
          delete data2.exported;
          
          // Sanitization should be consistent
          expect(data1).toEqual(data2);
          
          // Verify specific sensitive data is sanitized
          const messageContent = data1.session.messages[0].content;
          expect(messageContent).not.toContain(apiKey); // Check that original API key is not present
          expect(messageContent).not.toContain(email);
          expect(messageContent).not.toContain(workspaceRoot);
          expect(messageContent).toContain('[REDACTED]');
          
          // Workspace paths should be sanitized
          expect(data1.session.workspaceRoot).toBe('[Workspace path removed]');
          expect(data1.originalWorkspace).toBe('[Workspace path removed]');
          
          // Context files should be sanitized
          expect(data1.session.contextFiles[0]).not.toContain(workspaceRoot);
          expect(data1.session.contextFiles[0]).toMatch(/^\.\.\./);
        }
      ),
      { _numRuns: 50 }
    );
  });

  /**
   * Additional property: Preserved workspace paths should remain intact when requested
   */
  it('should preserve workspace paths when preserveWorkspacePaths is true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 10, _maxLength: 30 }).map(s => `/workspace/${s}`),
          contextFiles: fc.array(
            fc.string({ _minLength: 5, _maxLength: 20 }).map(s => `/workspace/src/${s}.ts`),
            { _minLength: 1, _maxLength: 5 }
          ),
        }),
        async ({ model, workspaceRoot, contextFiles }) => {
          // Create session
          const session = await manager.createSession({ model, workspaceRoot });
          
          const updatedSession: Session = {
            ...session,
            contextFiles,
          };
          
          await manager.saveSession(updatedSession);
          
          // Export with preserved workspace paths
          const exportResult = await manager.exportSession(session.id, {
            _sanitize: true,
            _preserveWorkspacePaths: true,
          });
          
          const exportedData = JSON.parse(exportResult.data);
          
          // Workspace paths should be preserved
          expect(exportedData.session.workspaceRoot).toBe(workspaceRoot);
          expect(exportedData.originalWorkspace).toBe(workspaceRoot);
          
          // Context files should be preserved
          expect(exportedData.session.contextFiles).toEqual(contextFiles);
          
          // But other sensitive data should still be sanitized
          expect(exportResult.sanitized).toBe(true);
        }
      ),
      { _numRuns: 30 }
    );
  });

  /**
   * Additional property: Custom sanitization patterns should be applied
   */
  it('should apply custom sanitization patterns correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          workspaceRoot: fc.string({ _minLength: 5, _maxLength: 20 }).map(s => `/test/${s}`),
          secretWord: fc.string({ _minLength: 5, _maxLength: 15 }).filter(s => s.trim().length > 0 && /^\w+$/.test(s)),
          customPattern: fc.constantFrom('secret\\w+', '\\bTOKEN_\\w+\\b', 'PRIVATE_\\w+'),
        }),
        async ({ model, workspaceRoot, secretWord, customPattern }) => {
          // Create session
          const session = await manager.createSession({ model, workspaceRoot });
          
          // Create message with content matching custom pattern
          let messageContent: string;
          if (customPattern === 'secret\\w+') {
            messageContent = `This is a secret${secretWord} that should be hidden`;
          } else if (customPattern === '\\bTOKEN_\\w+\\b') {
            messageContent = `Use TOKEN_${secretWord} for authentication`;
          } else {
            messageContent = `The PRIVATE_${secretWord} should not be shared`;
          }
          
          const message: Message = {
            id: createMessageId(),
            role: 'user',
            _content: messageContent,
            timestamp: Date.now(),
          };
          
          const updatedSession: Session = {
            ...session,
            messages: [message],
          };
          
          await manager.saveSession(updatedSession);
          
          // Export with custom sanitization pattern
          const exportResult = await manager.exportSession(session.id, {
            _sanitize: true,
            customSanitizationPatterns: [customPattern],
          });
          
          const exportedData = JSON.parse(exportResult.data);
          const exportedContent = exportedData.session.messages[0].content;
          
          // Custom pattern should be sanitized
          const regex = new RegExp(customPattern, 'g');
          expect(exportedContent).not.toMatch(regex);
          expect(exportedContent).toContain('[REDACTED]');
          
          // Original content should not be present
          if (customPattern === 'secret\\w+') {
            expect(exportedContent).not.toContain(`secret${secretWord}`);
          } else if (customPattern === '\\bTOKEN_\\w+\\b') {
            expect(exportedContent).not.toContain(`TOKEN_${secretWord}`);
          } else {
            expect(exportedContent).not.toContain(`PRIVATE_${secretWord}`);
          }
        }
      ),
      { _numRuns: 50 }
    );
  });
});