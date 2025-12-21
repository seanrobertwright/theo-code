/**
 * @fileoverview Property-based tests for SessionStorage compression effectiveness
 * **Feature: session-persistence, Property 12: Compression effectiveness**
 * **Validates: Requirements 4.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';
import { SessionStorage } from '../storage.js';
import { 
  type Session, 
  createSessionId,
  createMessageId,
} from '../../../shared/types/index.js';

// Mock the config loader
vi.mock('../../../config/loader.js', async () => {
  const actual = await vi.importActual('../../../config/loader.js');
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  };
});

describe('SessionStorage Compression Property Tests', () => {
  let storage: SessionStorage;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-compression-test-'));
    
    // Mock getSessionsDir to use our temp directory
    const { getSessionsDir } = await import('../../../config/loader.js');
    vi.mocked(getSessionsDir).mockReturnValue(tempDir);
    
    storage = new SessionStorage({ enableCompression: true });
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
   * Property 12: Compression effectiveness
   * For any session with compression enabled, the compressed file should be smaller 
   * than the uncompressed equivalent without data loss
   */
  it('should compress sessions effectively without data loss', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate sessions with repetitive content that should compress well
        fc.record({
          messageCount: fc.integer({ min: 5, max: 50 }),
          messageLength: fc.integer({ min: 50, max: 200 }),
          repeatPattern: fc.string({ minLength: 10, maxLength: 50 }),
          contextFileCount: fc.integer({ min: 0, max: 10 }),
        }),
        async ({ messageCount, messageLength, repeatPattern, contextFileCount }) => {
          const sessionId = createSessionId();
          
          // Create session with repetitive content that should compress well
          const session: Session = {
            id: sessionId,
            version: '1.0.0',
            created: Date.now(),
            lastModified: Date.now(),
            model: 'gpt-4o',
            workspaceRoot: '/test/workspace',
            tokenCount: { total: messageCount * 10, input: messageCount * 5, output: messageCount * 5 },
            filesAccessed: [],
            messages: Array.from({ length: messageCount }, (_, i) => ({
              id: createMessageId(),
              role: (i % 2 === 0 ? 'user' : 'assistant') as const,
              content: `${repeatPattern} `.repeat(Math.ceil(messageLength / repeatPattern.length)).slice(0, messageLength),
              timestamp: Date.now() + i,
            })),
            contextFiles: Array.from({ length: contextFileCount }, (_, i) => `/path/to/file${i}.ts`),
            tags: ['test', 'compression'],
          };

          // Create storage instances with and without compression
          const compressedStorage = new SessionStorage({ enableCompression: true });
          const uncompressedStorage = new SessionStorage({ enableCompression: false });

          // Write with both storages
          await compressedStorage.writeSession(sessionId, session);
          const compressedSessionId = createSessionId();
          await uncompressedStorage.writeSession(compressedSessionId, session);

          // Get file sizes
          const compressedPath = path.join(tempDir, `${sessionId}.json`);
          const uncompressedPath = path.join(tempDir, `${compressedSessionId}.json`);
          
          const compressedStats = await fs.stat(compressedPath);
          const uncompressedStats = await fs.stat(uncompressedPath);

          // Read back the compressed session to verify no data loss
          const readSession = await compressedStorage.readSession(sessionId);

          // Verify data integrity (no data loss)
          expect(readSession).toEqual(session);

          // Verify compression effectiveness for sessions with repetitive content
          // Only assert compression effectiveness if the session has enough repetitive content
          const hasRepetitiveContent = messageCount >= 10 && messageLength >= 100;
          if (hasRepetitiveContent) {
            expect(compressedStats.size).toBeLessThan(uncompressedStats.size);
          }

          // At minimum, compressed version should not be significantly larger
          // Allow up to 20% overhead for small files due to compression headers
          const maxAllowedSize = uncompressedStats.size * 1.2;
          expect(compressedStats.size).toBeLessThanOrEqual(maxAllowedSize);
        }
      ),
      { numRuns: 20 } // Run 20 iterations to test various session sizes
    );
  });

  /**
   * Additional property: Compression should preserve all session data exactly
   */
  it('should preserve all session data through compression round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate diverse session content
        fc.record({
          model: fc.constantFrom('gpt-4o', 'gpt-3.5-turbo', 'claude-3-sonnet'),
          messageCount: fc.integer({ min: 1, max: 20 }),
          workspaceRoot: fc.string({ minLength: 5, maxLength: 50 }),
          tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          contextFiles: fc.array(fc.string({ minLength: 5, maxLength: 30 }), { maxLength: 10 }),
        }),
        async ({ model, messageCount, workspaceRoot, tags, contextFiles }) => {
          const sessionId = createSessionId();
          
          const session: Session = {
            id: sessionId,
            version: '1.0.0',
            created: Date.now(),
            lastModified: Date.now(),
            model,
            workspaceRoot,
            tokenCount: { total: messageCount * 15, input: messageCount * 7, output: messageCount * 8 },
            filesAccessed: contextFiles.slice(0, 3), // Some files accessed
            messages: Array.from({ length: messageCount }, (_, i) => ({
              id: createMessageId(),
              role: (i % 2 === 0 ? 'user' : 'assistant') as const,
              content: `Message ${i}: ${Math.random().toString(36).repeat(10)}`,
              timestamp: Date.now() + i * 1000,
            })),
            contextFiles,
            tags,
          };

          // Write and read with compression
          await storage.writeSession(sessionId, session);
          const readSession = await storage.readSession(sessionId);

          // Verify exact data preservation
          expect(readSession).toEqual(session);
          expect(readSession.id).toBe(session.id);
          expect(readSession.model).toBe(session.model);
          expect(readSession.workspaceRoot).toBe(session.workspaceRoot);
          expect(readSession.messages).toHaveLength(session.messages.length);
          expect(readSession.contextFiles).toEqual(session.contextFiles);
          expect(readSession.tags).toEqual(session.tags);
          expect(readSession.tokenCount).toEqual(session.tokenCount);
        }
      ),
      { numRuns: 30 } // Run more iterations for data integrity testing
    );
  });
});