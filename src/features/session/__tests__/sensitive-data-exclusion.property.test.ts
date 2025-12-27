/**
 * @fileoverview Property-based tests for sensitive data exclusion
 * **Feature: session-persistence, Property 11: Sensitive data exclusion**
 * **Validates: Requirements 4.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { 
  SensitiveDataFilter, 
  createDefaultSensitiveDataConfig,
  type SensitiveDataConfig 
} from '../security.js';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import { createMessageId, createSessionId } from '../../../shared/types/index.js';
import type { Session, Message, SessionMetadata } from '../../../shared/types/index.js';

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

describe('Sensitive Data Exclusion Property Tests', () => {
  let manager: SessionManager;
  let storage: SessionStorage;
  let tempDir: string;
  let sensitiveDataFilter: SensitiveDataFilter;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sensitive-data-test-'));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    // Create storage and manager instances
    storage = new SessionStorage();
    manager = new SessionManager(storage);
    
    // Create sensitive data filter with default config
    const config = createDefaultSensitiveDataConfig();
    sensitiveDataFilter = new SensitiveDataFilter(config);
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
   * Property 11: Sensitive data exclusion
   * For any session file, it should never contain API keys, credentials, 
   * or other sensitive information
   */
  it('should never contain API keys, credentials, or sensitive information in session files', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate session data with various types of sensitive information
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
          sensitiveContent: fc.record({
            // API keys in various formats
            apiKeys: fc.array(
              fc.oneof(
                // OpenAI style API keys
                fc.string({ _minLength: 20, _maxLength: 30 }).map(s => `sk-${s}`),
                // Generic long tokens
                fc.string({ _minLength: 32, _maxLength: 64 }).map(s => s.replace(/[^A-Za-z0-9]/g, '')),
                // API keys with mixed characters
                fc.string({ _minLength: 15, _maxLength: 40 }).map(s => `sk-${s}!@#$%^&*()`),
              ),
              { _minLength: 1, _maxLength: 3 }
            ),
            // Email addresses in various formats
            emails: fc.array(
              fc.oneof(
                // Standard emails
                fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `user${s}@example.com`),
                // Emails with special characters
                fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `user.${s}+test@domain.co.uk`),
                // Emails with spaces (edge case)
                fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `user ${s} @ domain.com`),
              ),
              { _minLength: 1, _maxLength: 3 }
            ),
            // Passwords and credentials
            credentials: fc.array(
              fc.oneof(
                fc.string({ _minLength: 8, _maxLength: 20 }).map(s => `password=${s}`),
                fc.string({ _minLength: 8, _maxLength: 20 }).map(s => `token: ${s}`),
                fc.string({ _minLength: 8, _maxLength: 20 }).map(s => `key = "${s}"`),
              ),
              { _minLength: 1, _maxLength: 3 }
            ),
            // File paths
            filePaths: fc.array(
              fc.oneof(
                fc.string({ _minLength: 5, _maxLength: 20 }).map(s => `/home/user/secret/${s}.txt`),
                fc.string({ _minLength: 5, _maxLength: 20 }).map(s => `C:\\Users\\User\\Documents\\${s}.doc`),
                fc.string({ _minLength: 5, _maxLength: 20 }).map(s => `/var/log/sensitive/${s}.log`),
              ),
              { _minLength: 1, _maxLength: 3 }
            ),
            // URLs with credentials
            urlsWithCredentials: fc.array(
              fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `https://user:password@${s}.com/api`),
              { _minLength: 0, _maxLength: 2 }
            ),
            // Environment variables
            envVars: fc.array(
              fc.string({ _minLength: 3, _maxLength: 15 }).map(s => `$${s.toUpperCase()}_SECRET`),
              { _minLength: 0, _maxLength: 2 }
            ),
          }),
        }),
        async (sessionData) => {
          // Create a session with sensitive content
          const session = await manager.createSession({
            model: sessionData.model,
            workspaceRoot: sessionData.workspaceRoot,
            title: sessionData.title ?? undefined,
            tags: sessionData.tags,
            notes: sessionData.notes ?? undefined,
          });
          
          // Add context files
          session.contextFiles = sessionData.contextFiles;
          
          // Create messages with sensitive content embedded
          const messages: Message[] = [];
          
          // Create messages that contain various types of sensitive data
          for (let i = 0; i < 5; i++) {
            const sensitiveElements: string[] = [];
            
            // Add API keys
            if (sessionData.sensitiveContent.apiKeys.length > 0) {
              const apiKey = sessionData.sensitiveContent.apiKeys[i % sessionData.sensitiveContent.apiKeys.length];
              sensitiveElements.push(`Here's my API key: ${apiKey}`);
            }
            
            // Add emails
            if (sessionData.sensitiveContent.emails.length > 0) {
              const email = sessionData.sensitiveContent.emails[i % sessionData.sensitiveContent.emails.length];
              sensitiveElements.push(`Contact me at ${email}`);
            }
            
            // Add credentials
            if (sessionData.sensitiveContent.credentials.length > 0) {
              const credential = sessionData.sensitiveContent.credentials[i % sessionData.sensitiveContent.credentials.length];
              sensitiveElements.push(`Configuration: ${credential}`);
            }
            
            // Add file paths
            if (sessionData.sensitiveContent.filePaths.length > 0) {
              const filePath = sessionData.sensitiveContent.filePaths[i % sessionData.sensitiveContent.filePaths.length];
              sensitiveElements.push(`Check the file at ${filePath}`);
            }
            
            // Add URLs with credentials
            if (sessionData.sensitiveContent.urlsWithCredentials.length > 0) {
              const url = sessionData.sensitiveContent.urlsWithCredentials[i % sessionData.sensitiveContent.urlsWithCredentials.length];
              sensitiveElements.push(`API endpoint: ${url}`);
            }
            
            // Add environment variables
            if (sessionData.sensitiveContent.envVars.length > 0) {
              const envVar = sessionData.sensitiveContent.envVars[i % sessionData.sensitiveContent.envVars.length];
              sensitiveElements.push(`Environment variable: ${envVar}`);
            }
            
            // Create message content with sensitive data
            const messageContent = sensitiveElements.length > 0 
              ? `Here's some information: ${sensitiveElements.join(', ')}. Please help me with this.`
              : `This is a normal message without sensitive data.`;
            
            const message: Message = {
              id: createMessageId(),
              role: i % 2 === 0 ? 'user' : 'assistant',
              _content: messageContent,
              timestamp: Date.now() + i,
            };
            
            messages.push(message);
          }
          
          session.messages = messages;
          
          // Save the session
          await manager.saveSession(session);
          
          // Filter the session using the sensitive data filter
          const { _session: filteredSession, result } = await sensitiveDataFilter.filterSession(session);
          
          // Verify that sensitive data was filtered
          expect(result.filtered).toBe(true);
          expect(result.matchCount).toBeGreaterThan(0);
          expect(result.dataTypes.length).toBeGreaterThan(0);
          
          // Check that no API keys remain in the filtered session
          for (const apiKey of sessionData.sensitiveContent.apiKeys) {
            // Check messages
            for (const message of filteredSession.messages) {
              const content = typeof message.content === 'string' ? message.content : 
                message.content.map(block => 
                  block.type === 'text' ? block.text : 
                  block.type === 'tool_result' ? block.content : ''
                ).join(' ');
              
              expect(content).not.toContain(apiKey);
            }
            
            // Check title and notes
            if (filteredSession.title) {
              expect(filteredSession.title).not.toContain(apiKey);
            }
            if (filteredSession.notes) {
              expect(filteredSession.notes).not.toContain(apiKey);
            }
          }
          
          // Check that no email addresses remain
          for (const email of sessionData.sensitiveContent.emails) {
            for (const message of filteredSession.messages) {
              const content = typeof message.content === 'string' ? message.content : 
                message.content.map(block => 
                  block.type === 'text' ? block.text : 
                  block.type === 'tool_result' ? block.content : ''
                ).join(' ');
              
              expect(content).not.toContain(email);
            }
          }
          
          // Check that no credentials remain
          for (const credential of sessionData.sensitiveContent.credentials) {
            for (const message of filteredSession.messages) {
              const content = typeof message.content === 'string' ? message.content : 
                message.content.map(block => 
                  block.type === 'text' ? block.text : 
                  block.type === 'tool_result' ? block.content : ''
                ).join(' ');
              
              expect(content).not.toContain(credential);
            }
          }
          
          // Check that workspace paths are sanitized (unless preserveWorkspacePaths is true)
          expect(filteredSession.workspaceRoot).toBe('[REDACTED]');
          
          // Check that context files are sanitized
          for (const filePath of filteredSession.contextFiles) {
            expect(filePath).not.toMatch(/^\/home\/user/);
            expect(filePath).not.toMatch(/^C:\\Users/);
          }
          
          // Verify that [REDACTED] markers are present where sensitive data was found
          let foundRedactionMarkers = false;
          for (const message of filteredSession.messages) {
            const content = typeof message.content === 'string' ? message.content : 
              message.content.map(block => 
                block.type === 'text' ? block.text : 
                block.type === 'tool_result' ? block.content : ''
              ).join(' ');
            
            if (content.includes('[REDACTED]')) {
              foundRedactionMarkers = true;
              break;
            }
          }
          
          // Should have redaction markers if sensitive data was present
          const hasSensitiveData = 
            sessionData.sensitiveContent.apiKeys.length > 0 ||
            sessionData.sensitiveContent.emails.length > 0 ||
            sessionData.sensitiveContent.credentials.length > 0 ||
            sessionData.sensitiveContent.filePaths.length > 0 ||
            sessionData.sensitiveContent.urlsWithCredentials.length > 0 ||
            sessionData.sensitiveContent.envVars.length > 0;
          
          if (hasSensitiveData) {
            expect(foundRedactionMarkers).toBe(true);
          }
        }
      ),
      { _numRuns: 100 } // Run 100 iterations to test various sensitive data patterns
    );
  });

  /**
   * Additional property: Custom sanitization patterns should work correctly
   */
  it('should filter custom sensitive data patterns when configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ _minLength: 10, _maxLength: 30 }),
          customPattern: fc.string({ _minLength: 5, _maxLength: 15 }).map(s => s.replace(/[^A-Za-z0-9]/g, '')),
          customData: fc.string({ _minLength: 10, _maxLength: 30 }),
        }),
        async ({ model, workspaceRoot, customPattern, customData }) => {
          // Create custom configuration with additional pattern
          const config: SensitiveDataConfig = {
            ...createDefaultSensitiveDataConfig(),
            customPatterns: [customPattern], // Add custom pattern
          };
          
          const customFilter = new SensitiveDataFilter(config);
          
          // Create session with custom sensitive data
          const session = await manager.createSession({ model, workspaceRoot });
          
          // Add message with custom sensitive data
          const messageContent = `Here's some data: ${customPattern} and ${customData}`;
          session.messages = [{
            id: createMessageId(),
            role: 'user',
            _content: messageContent,
            timestamp: Date.now(),
          }];
          
          // Filter the session
          const { _session: filteredSession, result } = await customFilter.filterSession(session);
          
          // Verify that custom pattern was filtered if it matches
          const filteredContent = filteredSession.messages[0].content as string;
          
          // If the custom pattern appears in the content, it should be redacted
          if (customPattern.length > 0 && messageContent.includes(customPattern) {
            expect(result.filtered).toBe(true);
            expect(filteredContent).not.toContain(customPattern);
            expect(filteredContent).toContain('[REDACTED]');
          }
        }
      ),
      { _numRuns: 50 }
    );
  });

  /**
   * Additional property: Session metadata should also be filtered
   */
  it('should filter sensitive data from session metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ _minLength: 10, _maxLength: 30 }),
          apiKey: fc.string({ _minLength: 20, _maxLength: 30 }).map(s => `sk-${s}`),
          email: fc.string({ _minLength: 3, _maxLength: 10 }).map(s => `user${s}@example.com`),
        }),
        async ({ model, workspaceRoot, apiKey, email }) => {
          // Create session
          const session = await manager.createSession({ model, workspaceRoot });
          
          // Create metadata with sensitive information
          const metadata: SessionMetadata = {
            id: session.id,
            created: session.created,
            lastModified: session.lastModified,
            model: session.model,
            tokenCount: session.tokenCount,
            title: `Project with API key ${apiKey}`,
            workspaceRoot: session.workspaceRoot,
            _messageCount: 1,
            lastMessage: `Contact ${email} for more info`,
            contextFiles: session.contextFiles,
            tags: session.tags,
            preview: `API configuration: ${apiKey}`,
          };
          
          // Filter the metadata
          const { _metadata: filteredMetadata, result } = await sensitiveDataFilter.filterSessionMetadata(metadata);
          
          // Verify filtering occurred
          expect(result.filtered).toBe(true);
          
          // Check that sensitive data was removed
          if (filteredMetadata.title) {
            expect(filteredMetadata.title).not.toContain(apiKey);
            expect(filteredMetadata.title).toContain('[REDACTED]');
          }
          
          if (filteredMetadata.lastMessage) {
            expect(filteredMetadata.lastMessage).not.toContain(email);
            expect(filteredMetadata.lastMessage).toContain('[REDACTED]');
          }
          
          if (filteredMetadata.preview) {
            expect(filteredMetadata.preview).not.toContain(apiKey);
            expect(filteredMetadata.preview).toContain('[REDACTED]');
          }
          
          // Workspace root should be sanitized
          expect(filteredMetadata.workspaceRoot).toBe('[REDACTED]');
        }
      ),
      { _numRuns: 50 }
    );
  });

  /**
   * Edge case property: Empty or null content should not cause errors
   */
  it('should handle empty or null content gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo'),
          workspaceRoot: fc.string({ _minLength: 10, _maxLength: 30 }),
          hasEmptyMessages: fc.boolean(),
          hasNullFields: fc.boolean(),
        }),
        async ({ model, workspaceRoot, hasEmptyMessages, hasNullFields }) => {
          // Create session
          const session = await manager.createSession({ model, workspaceRoot });
          
          if (hasEmptyMessages) {
            // Add messages with empty content
            session.messages = [
              {
                id: createMessageId(),
                role: 'user',
                content: '',
                timestamp: Date.now(),
              },
              {
                id: createMessageId(),
                role: 'assistant',
                content: [],
                timestamp: Date.now(),
              },
            ];
          }
          
          if (hasNullFields) {
            // Set optional fields to null
            session.title = null;
            session.notes = null;
          }
          
          // Filter should not throw errors
          const { _session: filteredSession, result } = await sensitiveDataFilter.filterSession(session);
          
          // Should complete without errors
          expect(filteredSession).toBeDefined();
          expect(result).toBeDefined();
          expect(result.filtered).toBeDefined();
          expect(result.matchCount).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(result.dataTypes)).toBe(true);
          expect(Array.isArray(result.warnings)).toBe(true);
        }
      ),
      { _numRuns: 30 }
    );
  });
});