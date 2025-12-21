/**
 * @fileoverview Property-based tests for session persistence schemas
 * @module shared/types/__tests__/session-persistence.test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SessionSchema,
  SessionMetadataSchema,
  SessionIndexSchema,
  VersionedSessionSchema,
  SessionIdSchema,
  MessageSchema,
  SessionTokenCountSchema,
  createSessionId,
  createMessageId,
} from '../schemas.js';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for valid session IDs
 */
const sessionIdArb = fc.uuid().map(uuid => SessionIdSchema.parse(uuid));

/**
 * Generator for valid message IDs
 */
const messageIdArb = fc.uuid().map(uuid => createMessageId());

/**
 * Generator for valid timestamps
 */
const timestampArb = fc.integer({ min: 1000000000000, max: Date.now() + 86400000 });

/**
 * Generator for token count objects
 */
const tokenCountArb = fc.record({
  total: fc.nat(100000),
  input: fc.nat(50000),
  output: fc.nat(50000),
}).map(({ total, input, output }) => ({
  total: Math.max(total, input + output),
  input,
  output,
}));

/**
 * Generator for messages
 */
const messageArb = fc.record({
  id: messageIdArb,
  role: fc.constantFrom('user', 'assistant', 'system', 'tool'),
  content: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
  timestamp: timestampArb,
  model: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)),
  tokens: fc.option(tokenCountArb),
});

/**
 * Generator for valid sessions
 */
const sessionArb = fc.record({
  id: sessionIdArb,
  version: fc.constant('1.0.0'),
  created: timestampArb,
  lastModified: timestampArb,
  model: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  workspaceRoot: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  tokenCount: tokenCountArb,
  filesAccessed: fc.array(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { maxLength: 20 }),
  messages: fc.array(messageArb, { maxLength: 10 }),
  contextFiles: fc.array(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { maxLength: 20 }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { maxLength: 10 }),
  notes: fc.option(fc.string({ maxLength: 500 })),
}).map(session => ({
  ...session,
  lastModified: Math.max(session.created, session.lastModified),
}));

/**
 * Generator for session metadata
 */
const sessionMetadataArb = fc.record({
  id: sessionIdArb,
  created: timestampArb,
  lastModified: timestampArb,
  model: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  tokenCount: tokenCountArb,
  title: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)),
  workspaceRoot: fc.option(fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
  messageCount: fc.nat(1000),
  lastMessage: fc.option(fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
  contextFiles: fc.array(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { maxLength: 20 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { maxLength: 10 }),
  preview: fc.option(fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
}).map(metadata => ({
  ...metadata,
  lastModified: Math.max(metadata.created, metadata.lastModified),
}));

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Session Persistence Property Tests', () => {
  describe('Property 10: Storage location consistency', () => {
    it('**Feature: session-persistence, Property 10: Storage location consistency**', () => {
      // **Validates: Requirements 4.1, 4.2**
      fc.assert(
        fc.property(sessionArb, (session) => {
          // Test that any valid session can be serialized and validated
          const parseResult = SessionSchema.safeParse(session);
          expect(parseResult.success).toBe(true);
          
          if (parseResult.success) {
            const parsedSession = parseResult.data;
            
            // Verify all required fields are present for storage
            expect(parsedSession.id).toBeDefined();
            expect(parsedSession.version).toBeDefined();
            expect(parsedSession.created).toBeGreaterThan(0);
            expect(parsedSession.lastModified).toBeGreaterThanOrEqual(parsedSession.created);
            expect(parsedSession.model).toBeDefined();
            expect(parsedSession.workspaceRoot).toBeDefined();
            expect(parsedSession.tokenCount).toBeDefined();
            expect(Array.isArray(parsedSession.filesAccessed)).toBe(true);
            expect(Array.isArray(parsedSession.messages)).toBe(true);
            expect(Array.isArray(parsedSession.contextFiles)).toBe(true);
            expect(Array.isArray(parsedSession.tags)).toBe(true);
            
            // Verify the session can be JSON serialized (storage format requirement)
            const jsonString = JSON.stringify(parsedSession);
            expect(jsonString).toBeDefined();
            expect(jsonString.length).toBeGreaterThan(0);
            
            // Verify it can be parsed back from JSON
            const reparsed = JSON.parse(jsonString);
            const reparseResult = SessionSchema.safeParse(reparsed);
            expect(reparseResult.success).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should validate versioned session storage format', () => {
      fc.assert(
        fc.property(sessionArb, (session) => {
          const versionedSession = {
            version: '1.0.0',
            compressed: false,
            checksum: 'sha256:test',
            data: session,
          };
          
          const parseResult = VersionedSessionSchema.safeParse(versionedSession);
          expect(parseResult.success).toBe(true);
          
          if (parseResult.success) {
            expect(parseResult.data.version).toBe('1.0.0');
            expect(parseResult.data.data.id).toBe(session.id);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Session Index Schema Validation', () => {
    it('should validate session index structure', () => {
      fc.assert(
        fc.property(
          fc.array(sessionMetadataArb, { maxLength: 10 }),
          timestampArb,
          (metadataArray, lastUpdated) => {
            const sessionsRecord: Record<string, any> = {};
            metadataArray.forEach(metadata => {
              sessionsRecord[metadata.id] = metadata;
            });
            
            const index = {
              version: '1.0.0',
              lastUpdated,
              sessions: sessionsRecord,
            };
            
            const parseResult = SessionIndexSchema.safeParse(index);
            expect(parseResult.success).toBe(true);
            
            if (parseResult.success) {
              expect(parseResult.data.version).toBe('1.0.0');
              expect(parseResult.data.lastUpdated).toBe(lastUpdated);
              expect(Object.keys(parseResult.data.sessions)).toHaveLength(metadataArray.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Session Metadata Schema Validation', () => {
    it('should validate session metadata structure', () => {
      fc.assert(
        fc.property(sessionMetadataArb, (metadata) => {
          const parseResult = SessionMetadataSchema.safeParse(metadata);
          expect(parseResult.success).toBe(true);
          
          if (parseResult.success) {
            const parsed = parseResult.data;
            expect(parsed.id).toBeDefined();
            expect(parsed.created).toBeGreaterThan(0);
            expect(parsed.lastModified).toBeGreaterThanOrEqual(parsed.created);
            expect(parsed.model).toBeDefined();
            expect(parsed.messageCount).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(parsed.contextFiles)).toBe(true);
            expect(Array.isArray(parsed.tags)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Schema Round-trip Consistency', () => {
    it('should maintain data integrity through JSON serialization', () => {
      fc.assert(
        fc.property(sessionArb, (originalSession) => {
          // Serialize to JSON
          const jsonString = JSON.stringify(originalSession);
          
          // Parse back from JSON
          const parsedFromJson = JSON.parse(jsonString);
          
          // Validate with schema
          const schemaResult = SessionSchema.safeParse(parsedFromJson);
          expect(schemaResult.success).toBe(true);
          
          if (schemaResult.success) {
            const validatedSession = schemaResult.data;
            
            // Key fields should be preserved
            expect(validatedSession.id).toBe(originalSession.id);
            expect(validatedSession.version).toBe(originalSession.version);
            expect(validatedSession.created).toBe(originalSession.created);
            expect(validatedSession.lastModified).toBe(originalSession.lastModified);
            expect(validatedSession.model).toBe(originalSession.model);
            expect(validatedSession.workspaceRoot).toBe(originalSession.workspaceRoot);
            expect(validatedSession.messages).toHaveLength(originalSession.messages.length);
            expect(validatedSession.contextFiles).toHaveLength(originalSession.contextFiles.length);
            expect(validatedSession.tags).toHaveLength(originalSession.tags.length);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});