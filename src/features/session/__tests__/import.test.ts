/**
 * @fileoverview Integration tests for session import functionality
 * @module features/session/__tests__/import.test
 * 
 * Tests the session import functionality including:
 * - Format validation
 * - Unique ID generation
 * - Import validation and warnings
 * - Missing context file detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '../manager.js';
import { SessionStorage } from '../storage.js';
import type { CreateSessionOptions, ImportSessionOptions } from '../manager.js';
import type { Session } from '../../../shared/types/index.js';
import { createMessageId } from '../../../shared/types/index.js';

// Mock the config loader
vi.mock('../../../config/loader.js', () => ({
  loadConfig: () => ({
    global: {
      session: {
        autoSaveInterval: 5000,
        maxSessions: 50,
      },
    },
  }),
  getSessionsDir: () => path.join(os.tmpdir(), 'theo-code-test-sessions'),
}));

describe('Session Import', () => {
  let testDir: string;
  let storage: SessionStorage;
  let manager: SessionManager;

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = path.join(os.tmpdir(), `theo-code-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create storage and manager instances
    storage = new SessionStorage({
      enableCompression: false,
      enableChecksum: false, // Disable checksum for tests to avoid validation issues
      createBackups: false,
    });

    manager = new SessionManager(storage);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  describe('Basic Import', () => {
    it('should import a valid session from JSON data', async () => {
      // Create a session to export
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        title: 'Test Session',
        tags: ['test', 'import'],
      };

      const originalSession = await manager.createSession(createOptions);

      // Add some messages to make it more realistic
      originalSession.messages.push({
        id: createMessageId(),
        role: 'user',
        content: 'Hello, this is a test message',
        timestamp: Date.now(),
      });

      await manager.saveSession(originalSession);

      // Export the session
      const exportResult = await manager.exportSession(originalSession.id, {
        format: 'json-pretty',
        sanitize: false,
      });

      // Import the session
      const importResult = await manager.importSession(exportResult.data, {
        generateNewId: true,
        preserveTimestamps: false,
      });

      // Verify import result
      expect(importResult.session).toBeDefined();
      expect(importResult.newIdGenerated).toBe(true);
      expect(importResult.originalId).toBe(originalSession.id);
      expect(importResult.session.id).not.toBe(originalSession.id);
      expect(importResult.session.model).toBe(originalSession.model);
      expect(importResult.session.title).toBe(originalSession.title);
      expect(importResult.session.messages).toHaveLength(1);
      expect(importResult.session.messages[0].content).toBe('Hello, this is a test message');
    });

    it('should preserve original ID when generateNewId is false and ID does not exist', async () => {
      // Create a session to export
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      };

      const originalSession = await manager.createSession(createOptions);
      await manager.saveSession(originalSession);

      // Export the session
      const exportResult = await manager.exportSession(originalSession.id, {
        format: 'json',
        sanitize: false,
      });

      // Delete the original session
      await manager.deleteSession(originalSession.id);

      // Import with generateNewId = false
      const importResult = await manager.importSession(exportResult.data, {
        generateNewId: false,
        preserveTimestamps: true,
      });

      // Verify the original ID was preserved
      expect(importResult.session.id).toBe(originalSession.id);
      expect(importResult.newIdGenerated).toBe(false);
      expect(importResult.session.created).toBe(originalSession.created);
      expect(importResult.session.lastModified).toBe(originalSession.lastModified);
    });

    it('should generate new ID when original ID already exists', async () => {
      // Create a session
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      };

      const originalSession = await manager.createSession(createOptions);
      await manager.saveSession(originalSession);

      // Export the session
      const exportResult = await manager.exportSession(originalSession.id, {
        format: 'json',
        sanitize: false,
      });

      // Try to import with generateNewId = false (should generate new ID because original exists)
      const importResult = await manager.importSession(exportResult.data, {
        generateNewId: false,
        strictValidation: false, // Allow auto-generation when ID exists
      });

      // Verify a new ID was generated
      expect(importResult.session.id).not.toBe(originalSession.id);
      expect(importResult.newIdGenerated).toBe(true);
      expect(importResult.warnings).toContain(
        expect.stringContaining('already exists')
      );
    });
  });

  describe('Format Validation', () => {
    it('should reject invalid JSON format', async () => {
      const invalidJson = 'this is not valid JSON';

      await expect(
        manager.importSession(invalidJson)
      ).rejects.toThrow('Invalid JSON format');
    });

    it('should reject data without required session fields in strict mode', async () => {
      const invalidData = JSON.stringify({
        type: 'session-full',
        version: '1.0.0',
        session: {
          // Missing required fields like id, model, workspaceRoot
          messages: [],
        },
      });

      await expect(
        manager.importSession(invalidData, { strictValidation: true })
      ).rejects.toThrow();
    });

    it('should attempt to repair invalid data in non-strict mode', async () => {
      const incompleteData = JSON.stringify({
        type: 'session-full',
        version: '1.0.0',
        session: {
          model: 'gpt-4o',
          workspaceRoot: '/test',
          // Missing some fields
        },
      });

      const importResult = await manager.importSession(incompleteData, {
        strictValidation: false,
        generateNewId: true,
      });

      // Should succeed with warnings
      expect(importResult.session).toBeDefined();
      expect(importResult.warnings.length).toBeGreaterThan(0);
      expect(importResult.session.id).toBeDefined();
      expect(importResult.session.messages).toBeDefined();
      expect(importResult.session.contextFiles).toBeDefined();
    });

    it('should reject metadata-only exports', async () => {
      const metadataOnlyData = JSON.stringify({
        type: 'session-metadata',
        version: '1.0.0',
        metadata: {
          id: 'test-id',
          model: 'gpt-4o',
        },
      });

      await expect(
        manager.importSession(metadataOnlyData)
      ).rejects.toThrow('Cannot import session from metadata-only export');
    });
  });

  describe('Workspace Root Handling', () => {
    it('should use provided workspace root when specified', async () => {
      // Create and export a session
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/original/workspace',
      };

      const originalSession = await manager.createSession(createOptions);
      await manager.saveSession(originalSession);

      const exportResult = await manager.exportSession(originalSession.id, {
        sanitize: false,
      });

      // Import with custom workspace root
      const customWorkspace = '/new/workspace/path';
      const importResult = await manager.importSession(exportResult.data, {
        workspaceRoot: customWorkspace,
        generateNewId: true,
      });

      expect(importResult.session.workspaceRoot).toBe(customWorkspace);
    });

    it('should preserve original workspace root when not specified', async () => {
      // Create and export a session
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/original/workspace',
      };

      const originalSession = await manager.createSession(createOptions);
      await manager.saveSession(originalSession);

      const exportResult = await manager.exportSession(originalSession.id, {
        sanitize: false,
      });

      // Import without specifying workspace root
      const importResult = await manager.importSession(exportResult.data, {
        generateNewId: true,
      });

      expect(importResult.session.workspaceRoot).toBe('/original/workspace');
    });
  });

  describe('Timestamp Handling', () => {
    it('should update timestamps when preserveTimestamps is false', async () => {
      // Create and export a session
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      };

      const originalSession = await manager.createSession(createOptions);
      await manager.saveSession(originalSession);

      // Wait a bit to ensure timestamps will be different
      await new Promise(resolve => setTimeout(resolve, 10));

      const exportResult = await manager.exportSession(originalSession.id, {
        sanitize: false,
      });

      // Import with preserveTimestamps = false
      const importResult = await manager.importSession(exportResult.data, {
        preserveTimestamps: false,
        generateNewId: true,
      });

      // Timestamps should be updated
      expect(importResult.session.created).toBeGreaterThan(originalSession.created);
      expect(importResult.session.lastModified).toBeGreaterThan(originalSession.lastModified);
    });

    it('should preserve timestamps when preserveTimestamps is true', async () => {
      // Create and export a session
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      };

      const originalSession = await manager.createSession(createOptions);
      await manager.saveSession(originalSession);

      const exportResult = await manager.exportSession(originalSession.id, {
        sanitize: false,
      });

      // Import with preserveTimestamps = true
      const importResult = await manager.importSession(exportResult.data, {
        preserveTimestamps: true,
        generateNewId: true,
      });

      // Timestamps should be preserved
      expect(importResult.session.created).toBe(originalSession.created);
      expect(importResult.session.lastModified).toBe(originalSession.lastModified);
    });
  });

  describe('Warning System', () => {
    it('should warn about missing context files', async () => {
      // Create a session with context files
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      };

      const originalSession = await manager.createSession(createOptions);
      originalSession.contextFiles = [
        '/test/workspace/file1.ts',
        '/test/workspace/file2.ts',
        '/test/workspace/missing.ts',
      ];
      await manager.saveSession(originalSession);

      const exportResult = await manager.exportSession(originalSession.id, {
        sanitize: false,
      });

      // Import the session
      const importResult = await manager.importSession(exportResult.data, {
        generateNewId: true,
        showWarnings: true,
      });

      // Should have warnings about missing context files
      expect(importResult.missingContextFiles).toBeDefined();
      expect(importResult.missingContextFiles.length).toBeGreaterThan(0);
    });

    it('should include validation warnings in non-strict mode', async () => {
      const incompleteData = JSON.stringify({
        session: {
          model: 'gpt-4o',
          workspaceRoot: '/test',
          // Missing version and other fields
        },
      });

      const importResult = await manager.importSession(incompleteData, {
        strictValidation: false,
        generateNewId: true,
        showWarnings: true,
      });

      expect(importResult.warnings.length).toBeGreaterThan(0);
      expect(importResult.warnings.some(w => w.includes('format metadata'))).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve all session data during import', async () => {
      // Create a comprehensive session
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        title: 'Comprehensive Test',
        tags: ['tag1', 'tag2', 'tag3'],
        notes: 'These are test notes',
      };

      const originalSession = await manager.createSession(createOptions);

      // Add messages
      originalSession.messages.push(
        {
          id: createMessageId(),
          role: 'user',
          content: 'First message',
          timestamp: Date.now(),
        },
        {
          id: createMessageId(),
          role: 'assistant',
          content: 'Second message',
          timestamp: Date.now(),
        }
      );

      // Add context files
      originalSession.contextFiles = ['/test/file1.ts', '/test/file2.ts'];

      // Update token count
      originalSession.tokenCount = {
        total: 1000,
        input: 400,
        output: 600,
      };

      await manager.saveSession(originalSession);

      // Export and import
      const exportResult = await manager.exportSession(originalSession.id, {
        sanitize: false,
      });

      const importResult = await manager.importSession(exportResult.data, {
        generateNewId: true,
        preserveTimestamps: true,
      });

      // Verify all data is preserved
      expect(importResult.session.model).toBe(originalSession.model);
      expect(importResult.session.title).toBe(originalSession.title);
      expect(importResult.session.tags).toEqual(originalSession.tags);
      expect(importResult.session.notes).toBe(originalSession.notes);
      expect(importResult.session.messages).toHaveLength(2);
      expect(importResult.session.contextFiles).toEqual(originalSession.contextFiles);
      expect(importResult.session.tokenCount).toEqual(originalSession.tokenCount);
    });

    it('should handle sessions with complex message content', async () => {
      // Create a session with complex messages
      const createOptions: CreateSessionOptions = {
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      };

      const originalSession = await manager.createSession(createOptions);

      // Add message with complex content
      originalSession.messages.push({
        id: createMessageId(),
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is some code:' },
          { type: 'text', text: 'console.log("Hello");' },
        ],
        timestamp: Date.now(),
      });

      await manager.saveSession(originalSession);

      // Export and import
      const exportResult = await manager.exportSession(originalSession.id, {
        sanitize: false,
      });

      const importResult = await manager.importSession(exportResult.data, {
        generateNewId: true,
      });

      // Verify complex content is preserved
      expect(importResult.session.messages).toHaveLength(1);
      expect(Array.isArray(importResult.session.messages[0].content)).toBe(true);
      const content = importResult.session.messages[0].content as any[];
      expect(content).toHaveLength(2);
      expect(content[0].text).toBe('Here is some code:');
      expect(content[1].t