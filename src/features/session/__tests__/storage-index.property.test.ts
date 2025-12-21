/**
 * @fileoverview Property-based tests for SessionStorage index consistency
 * **Feature: session-persistence, Property 6: Session metadata display completeness**
 * **Validates: Requirements 3.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { 
  type Session, 
  type SessionId,
  type SessionIndex,
  type SessionMetadata,
  type VersionedSession,
  SessionSchema,
  SessionIndexSchema,
  VersionedSessionSchema,
  SessionMetadataSchema,
  createSessionId,
  createMessageId,
} from '../../../shared/types/index.js';
import {
  ensureSessionsDirectory,
  atomicWriteFile,
  safeReadFile,
  safeDeleteFile,
  fileExists,
  compressData,
  decompressData,
  calculateChecksum,
  verifyChecksum,
  listSessionFiles,
} from '../filesystem.js';

// Create a custom SessionStorage that takes the directory as a parameter
class TestableSessionStorage {
  private readonly options = {
    enableCompression: true,
    enableChecksum: true,
    createBackups: true,
    maxFileSize: 10 * 1024 * 1024,
  };
  
  constructor(private sessionsDir: string) {}
  
  private getSessionFilePath(sessionId: SessionId): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }
  
  private getSessionIndexPath(): string {
    return path.join(this.sessionsDir, 'index.json');
  }
  
  async writeSession(sessionId: SessionId, session: Session): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    
    // Validate session data
    const validatedSession = SessionSchema.parse(session);
    
    // Serialize session data
    const sessionData = JSON.stringify(validatedSession, null, 2);
    
    // Prepare versioned session format
    let finalData = sessionData;
    let compressed = false;
    let checksum: string | undefined;
    
    // Apply compression if enabled
    if (this.options.enableCompression) {
      const compressedData = await compressData(sessionData);
      // Only use compression if it actually reduces size
      if (compressedData.length < sessionData.length) {
        finalData = compressedData;
        compressed = true;
      }
    }
    
    // Calculate checksum if enabled
    if (this.options.enableChecksum) {
      checksum = calculateChecksum(sessionData); // Always checksum original data
    }
    
    // Create versioned session wrapper
    const versionedSession: VersionedSession = {
      version: '1.0.0',
      compressed,
      checksum,
      data: compressed ? finalData : validatedSession,
    };
    
    const finalContent = JSON.stringify(versionedSession, null, 2);
    
    // Write to file atomically
    const filePath = this.getSessionFilePath(sessionId);
    await atomicWriteFile(filePath, finalContent, {
      createBackup: this.options.createBackups,
    });
    
    // Update index
    const metadata = this.createSessionMetadata(validatedSession);
    await this.updateIndex(metadata);
  }
  
  async getIndex(): Promise<SessionIndex> {
    const indexPath = this.getSessionIndexPath();
    
    if (!await fileExists(indexPath)) {
      // Index doesn't exist, rebuild it
      await this.rebuildIndex();
    }
    
    try {
      const content = await safeReadFile(indexPath);
      const parsed = JSON.parse(content);
      return SessionIndexSchema.parse(parsed);
    } catch (error: any) {
      // Index is corrupted, rebuild it
      console.warn(`Index corrupted, rebuilding: ${error.message}`);
      await this.rebuildIndex();
      return this.getIndex();
    }
  }
  
  async updateIndex(metadata: SessionMetadata): Promise<void> {
    const indexPath = this.getSessionIndexPath();
    
    // Load existing index or create new one
    let index: SessionIndex;
    try {
      if (await fileExists(indexPath)) {
        const content = await safeReadFile(indexPath);
        const parsed = JSON.parse(content);
        index = SessionIndexSchema.parse(parsed);
      } else {
        index = {
          version: '1.0.0',
          lastUpdated: Date.now(),
          sessions: {},
        };
      }
    } catch (error: any) {
      // If index is corrupted, rebuild it
      console.warn(`Index corrupted, rebuilding: ${error.message}`);
      await this.rebuildIndex();
      return this.updateIndex(metadata);
    }
    
    // Update metadata
    index.sessions[metadata.id] = metadata;
    index.lastUpdated = Date.now();
    
    // Write updated index
    const content = JSON.stringify(index, null, 2);
    await atomicWriteFile(indexPath, content, {
      createBackup: this.options.createBackups,
    });
  }
  
  async rebuildIndex(): Promise<void> {
    const indexPath = this.getSessionIndexPath();
    const sessionFiles = await this.listSessionFiles();
    
    const index: SessionIndex = {
      version: '1.0.0',
      lastUpdated: Date.now(),
      sessions: {},
    };
    
    // Process each session file
    for (const filePath of sessionFiles) {
      try {
        const sessionId = path.basename(filePath, '.json') as SessionId;
        const session = await this.readSession(sessionId);
        const metadata = this.createSessionMetadata(session);
        index.sessions[sessionId] = metadata;
      } catch (error: any) {
        console.warn(`Failed to process session file ${filePath}: ${error.message}`);
        // Continue with other files
      }
    }
    
    // Write rebuilt index
    const content = JSON.stringify(index, null, 2);
    await atomicWriteFile(indexPath, content, {
      createBackup: false, // Don't backup during rebuild
    });
  }
  
  async readSession(sessionId: SessionId): Promise<Session> {
    const filePath = this.getSessionFilePath(sessionId);
    
    // Read file content
    const content = await safeReadFile(filePath, {
      maxSize: this.options.maxFileSize,
    });
    
    // Parse versioned session format
    let versionedSession: VersionedSession;
    try {
      const parsed = JSON.parse(content);
      versionedSession = VersionedSessionSchema.parse(parsed);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      throw new Error(`Invalid session file format: ${errorMessage}`);
    }
    
    // Extract session data
    let sessionData: string;
    
    if (versionedSession.compressed) {
      // Decompress data
      if (typeof versionedSession.data !== 'string') {
        throw new Error('Compressed session data must be a string');
      }
      sessionData = await decompressData(versionedSession.data);
    } else {
      // Use data directly
      if (typeof versionedSession.data === 'string') {
        sessionData = versionedSession.data;
      } else {
        sessionData = JSON.stringify(versionedSession.data);
      }
    }
    
    // Verify checksum if present
    if (versionedSession.checksum && this.options.enableChecksum) {
      if (!verifyChecksum(sessionData, versionedSession.checksum)) {
        throw new Error('Session data checksum verification failed');
      }
    }
    
    // Parse and validate session
    let session: Session;
    try {
      const parsed = JSON.parse(sessionData);
      session = SessionSchema.parse(parsed);
    } catch (error: any) {
      throw new Error(`Invalid session data: ${error.message}`);
    }
    
    return session;
  }
  
  async deleteSession(sessionId: SessionId): Promise<void> {
    const filePath = this.getSessionFilePath(sessionId);
    
    // Delete session file
    await safeDeleteFile(filePath);
    
    // Remove from index
    await this.removeFromIndex(sessionId);
  }
  
  private async removeFromIndex(sessionId: SessionId): Promise<void> {
    const index = await this.getIndex();
    delete index.sessions[sessionId];
    index.lastUpdated = Date.now();
    
    const indexPath = this.getSessionIndexPath();
    const content = JSON.stringify(index, null, 2);
    await atomicWriteFile(indexPath, content, {
      createBackup: this.options.createBackups,
    });
  }
  
  private async listSessionFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      return files
        .filter(file => file.endsWith('.json') && file !== 'index.json')
        .map(file => path.join(this.sessionsDir, file));
    } catch (error: any) {
      throw new Error(`Failed to list session files: ${error.message}`);
    }
  }
  
  private createSessionMetadata(session: Session): SessionMetadata {
    // Get preview from first user message or first message
    let preview: string | undefined;
    const firstUserMessage = session.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const content = typeof firstUserMessage.content === 'string' 
        ? firstUserMessage.content 
        : firstUserMessage.content.find(block => block.type === 'text')?.text || '';
      preview = content.slice(0, 100);
    }
    
    // Get last message content
    let lastMessage: string | undefined;
    if (session.messages.length > 0) {
      const last = session.messages[session.messages.length - 1];
      const content = typeof last.content === 'string'
        ? last.content
        : last.content.find(block => block.type === 'text')?.text || '';
      lastMessage = content.slice(0, 50);
    }
    
    return SessionMetadataSchema.parse({
      id: session.id,
      created: session.created,
      lastModified: session.lastModified,
      model: session.model,
      tokenCount: session.tokenCount,
      title: session.title,
      workspaceRoot: session.workspaceRoot,
      messageCount: session.messages.length,
      lastMessage,
      contextFiles: session.contextFiles,
      tags: session.tags,
      preview,
    });
  }
}

describe('SessionStorage Index Consistency Property Tests', () => {
  let storage: TestableSessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-index-test-'));
    storage = new TestableSessionStorage(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Property 6: Session metadata display completeness
   * For any session listing operation, all required metadata fields 
   * (ID, dates, counts, model) should be present in the output
   */
  it('should maintain complete metadata for all sessions in index', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a single session with diverse properties
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo', 'claude-3-sonnet'),
          messageCount: fc.integer({ min: 0, max: 10 }),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 50 }),
          tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }),
          contextFiles: fc.array(fc.string({ minLength: 5, maxLength: 30 }), { maxLength: 5 }),
          title: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        }),
        async (config) => {
          const sessionId = createSessionId();
          const now = Date.now();
          
          const session: Session = {
            id: sessionId,
            version: '1.0.0',
            created: now,
            lastModified: now,
            model: config.model,
            workspaceRoot: config.workspaceRoot,
            tokenCount: { 
              total: config.messageCount * 15, 
              input: config.messageCount * 7, 
              output: config.messageCount * 8 
            },
            filesAccessed: config.contextFiles.slice(0, 2),
            messages: Array.from({ length: config.messageCount }, (_, i) => ({
              id: createMessageId(),
              role: (i % 2 === 0 ? 'user' : 'assistant') as const,
              content: `Message ${i}`,
              timestamp: now + i * 1000,
            })),
            contextFiles: config.contextFiles,
            tags: config.tags,
            title: config.title || undefined,
          };

          // Write session
          await storage.writeSession(sessionId, session);

          // Get the index and verify metadata is complete
          const index = await storage.getIndex();
          const metadata = index.sessions[sessionId];

          // Verify metadata exists and has all required fields
          expect(metadata).toBeDefined();
          expect(metadata.id).toBe(session.id);
          expect(metadata.created).toBe(session.created);
          expect(metadata.lastModified).toBe(session.lastModified);
          expect(metadata.model).toBe(session.model);
          expect(metadata.messageCount).toBe(session.messages.length);
          expect(metadata.tokenCount).toEqual(session.tokenCount);
          expect(metadata.contextFiles).toEqual(session.contextFiles);
          expect(metadata.tags).toEqual(session.tags);
          expect(metadata.workspaceRoot).toBe(session.workspaceRoot);

          // Verify optional fields
          if (session.title) {
            expect(metadata.title).toBe(session.title);
          }

          // Verify preview is generated for sessions with messages
          if (session.messages.length > 0) {
            expect(metadata.preview).toBeDefined();
            expect(typeof metadata.preview).toBe('string');
            expect(metadata.lastMessage).toBeDefined();
            expect(typeof metadata.lastMessage).toBe('string');
          }

          // Verify index metadata
          expect(index.version).toBe('1.0.0');
          expect(index.lastUpdated).toBeGreaterThan(0);
          expect(typeof index.lastUpdated).toBe('number');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Additional property: Index should remain consistent after session operations
   */
  it('should maintain index consistency through session lifecycle operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationsCount: fc.integer({ min: 2, max: 5 }),
        }),
        async ({ operationsCount }) => {
          // Create a fresh temp directory for this property iteration
          const iterationTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-iter-test-'));
          const iterationStorage = new TestableSessionStorage(iterationTempDir);
          
          try {
            const sessionIds: string[] = [];

            // Create initial session
            const initialSessionId = createSessionId();
            sessionIds.push(initialSessionId);

            const initialSession: Session = {
              id: initialSessionId,
              version: '1.0.0',
              created: Date.now(),
              lastModified: Date.now(),
              model: 'gpt-4o',
              workspaceRoot: '/workspace',
              tokenCount: { total: 10, input: 5, output: 5 },
              filesAccessed: [],
              messages: [{
                id: createMessageId(),
                role: 'user',
                content: 'Initial message',
                timestamp: Date.now(),
              }],
              contextFiles: ['file.ts'],
              tags: ['tag'],
            };

            await iterationStorage.writeSession(initialSessionId, initialSession);

            // Verify initial index state
            let index = await iterationStorage.getIndex();
            expect(Object.keys(index.sessions)).toHaveLength(1);

            // Perform random operations
            for (let op = 0; op < operationsCount; op++) {
              const operation = Math.random();
              
              if (operation < 0.5 && sessionIds.length > 0) {
                // Delete a session (50% chance)
                const indexToDelete = Math.floor(Math.random() * sessionIds.length);
                const sessionIdToDelete = sessionIds[indexToDelete];
                
                await iterationStorage.deleteSession(sessionIdToDelete);
                sessionIds.splice(indexToDelete, 1);
                
              } else {
                // Add a new session (50% chance)
                const newSessionId = createSessionId();
                sessionIds.push(newSessionId);

                const newSession: Session = {
                  id: newSessionId,
                  version: '1.0.0',
                  created: Date.now(),
                  lastModified: Date.now(),
                  model: 'gpt-3.5-turbo',
                  workspaceRoot: `/new-workspace${op}`,
                  tokenCount: { total: op * 5, input: op * 2, output: op * 3 },
                  filesAccessed: [],
                  messages: [{
                    id: createMessageId(),
                    role: 'assistant',
                    content: `New message ${op}`,
                    timestamp: Date.now(),
                  }],
                  contextFiles: [`newfile${op}.ts`],
                  tags: [`newtag${op}`],
                };

                await iterationStorage.writeSession(newSessionId, newSession);
              }

              // Verify index consistency after each operation
              index = await iterationStorage.getIndex();
              expect(Object.keys(index.sessions)).toHaveLength(sessionIds.length);

              // Verify all expected sessions are in the index
              for (const sessionId of sessionIds) {
                expect(index.sessions[sessionId]).toBeDefined();
                expect(index.sessions[sessionId].id).toBe(sessionId);
              }

              // Verify no unexpected sessions are in the index
              for (const indexedSessionId of Object.keys(index.sessions)) {
                expect(sessionIds).toContain(indexedSessionId);
              }
            }
          } finally {
            // Clean up iteration temp directory
            try {
              await fs.rm(iterationTempDir, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 8 }
    );
  });

  /**
   * Property: Index rebuild should recreate identical metadata
   */
  it('should recreate identical metadata when rebuilding index', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            messageCount: fc.integer({ min: 1, max: 20 }),
            model: fc.constantFrom('gpt-4o', 'claude-3-sonnet'),
          }),
          { minLength: 2, maxLength: 6 }
        ),
        async (sessionConfigs) => {
          // Create a fresh temp directory for this property iteration
          const iterationTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-rebuild-test-'));
          const iterationStorage = new TestableSessionStorage(iterationTempDir);
          
          try {
            const sessionIds: string[] = [];

            // Create sessions
            for (const config of sessionConfigs) {
              const sessionId = createSessionId();
              sessionIds.push(sessionId);

              const session: Session = {
                id: sessionId,
                version: '1.0.0',
                created: Date.now(),
                lastModified: Date.now(),
                model: config.model,
                workspaceRoot: '/test/workspace',
                tokenCount: { total: config.messageCount * 10, input: config.messageCount * 5, output: config.messageCount * 5 },
                filesAccessed: [],
                messages: Array.from({ length: config.messageCount }, (_, i) => ({
                  id: createMessageId(),
                  role: (i % 2 === 0 ? 'user' : 'assistant') as const,
                  content: `Message ${i}`,
                  timestamp: Date.now() + i,
                })),
                contextFiles: [],
                tags: [],
              };

              await iterationStorage.writeSession(sessionId, session);
            }

            // Get original index
            const originalIndex = await iterationStorage.getIndex();

            // Rebuild index
            await iterationStorage.rebuildIndex();

            // Get rebuilt index
            const rebuiltIndex = await iterationStorage.getIndex();

            // Verify indexes are identical (except for lastUpdated timestamp)
            expect(Object.keys(rebuiltIndex.sessions)).toHaveLength(Object.keys(originalIndex.sessions).length);

            for (const sessionId of sessionIds) {
              const originalMetadata = originalIndex.sessions[sessionId];
              const rebuiltMetadata = rebuiltIndex.sessions[sessionId];

              expect(rebuiltMetadata).toBeDefined();
              expect(rebuiltMetadata.id).toBe(originalMetadata.id);
              expect(rebuiltMetadata.created).toBe(originalMetadata.created);
              expect(rebuiltMetadata.lastModified).toBe(originalMetadata.lastModified);
              expect(rebuiltMetadata.model).toBe(originalMetadata.model);
              expect(rebuiltMetadata.messageCount).toBe(originalMetadata.messageCount);
              expect(rebuiltMetadata.tokenCount).toEqual(originalMetadata.tokenCount);
              expect(rebuiltMetadata.contextFiles).toEqual(originalMetadata.contextFiles);
              expect(rebuiltMetadata.tags).toEqual(originalMetadata.tags);
              expect(rebuiltMetadata.preview).toBe(originalMetadata.preview);
              expect(rebuiltMetadata.lastMessage).toBe(originalMetadata.lastMessage);
            }
          } finally {
            // Clean up iteration temp directory
            try {
              await fs.rm(iterationTempDir, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 12 }
    );
  });
});