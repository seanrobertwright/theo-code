/**
 * @fileoverview Property-based tests for session migration framework
 * @module features/session/__tests__/migration.property.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  MigrationFramework,
  createMigrationFramework,
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_VERSIONS,
  type MigrationDefinition,
  type MigrationResult,
} from '../migration.js';
import {
  createSessionId,
  type Session,
  type SessionId,
} from '../../../shared/types/index.js';

// =============================================================================
// TEST GENERATORS
// =============================================================================

/**
 * Generates a valid legacy session (version 0.7.0).
 */
const legacySessionGen = fc.record({
  id: fc.string().map(() => createSessionId()),
  created: fc.integer({ min: 1000000000000, max: Date.now() }),
  lastModified: fc.integer({ min: 1000000000000, max: Date.now() }),
  model: fc.constantFrom('gpt-4o', 'gpt-4', 'claude-3-sonnet'),
  tokenCount: fc.record({
    total: fc.integer({ min: 0, max: 100000 }),
    input: fc.integer({ min: 0, max: 50000 }),
    output: fc.integer({ min: 0, max: 50000 }),
  }),
  messages: fc.array(fc.record({
    id: fc.string().map(() => createSessionId()),
    role: fc.constantFrom('user', 'assistant', 'system'),
    content: fc.string({ minLength: 1, maxLength: 1000 }),
    timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
  }), { minLength: 0, maxLength: 10 }),
});

/**
 * Generates a session with version 0.8.0 (has workspaceRoot).
 */
const v08SessionGen = legacySessionGen.map(session => ({
  ...session,
  version: '0.8.0',
  workspaceRoot: '/test/workspace',
}));

/**
 * Generates a session with version 0.9.0 (has contextFiles and tags).
 */
const v09SessionGen = v08SessionGen.map(session => ({
  ...session,
  version: '0.9.0',
  contextFiles: ['/test/file1.ts', '/test/file2.ts'],
  tags: ['test', 'migration'],
}));

/**
 * Generates a current version session (1.0.0).
 */
const currentSessionGen = v09SessionGen.map(session => ({
  ...session,
  version: '1.0.0',
  filesAccessed: ['/test/accessed1.ts'],
  title: 'Test Session',
  notes: 'Test notes',
}));

/**
 * Generates a session with any supported version.
 */
const anyVersionSessionGen = fc.oneof(
  legacySessionGen,
  v08SessionGen,
  v09SessionGen,
  currentSessionGen
);

/**
 * Generates a versioned session wrapper.
 */
const versionedSessionGen = fc.record({
  version: fc.constantFrom(...SUPPORTED_VERSIONS),
  compressed: fc.boolean(),
  checksum: fc.option(fc.string(), { nil: undefined }),
  data: anyVersionSessionGen,
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Migration Framework Property Tests', () => {
  let framework: MigrationFramework;
  
  beforeEach(() => {
    framework = createMigrationFramework();
  });
  
  /**
   * **Feature: session-persistence, Property 17: Migration completeness**
   * **Validates: Requirements 6.1, 6.4, 6.5**
   * 
   * For any session with an older schema version, automatic migration should 
   * preserve all data while updating the version marker.
   */
  it('Property 17: Migration completeness - preserves all data during migration', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyVersionSessionGen,
        async (originalSession) => {
          // Skip if already current version
          const sessionVersion = originalSession.version || '0.7.0';
          if (sessionVersion === CURRENT_SCHEMA_VERSION) {
            return true;
          }
          
          const sessionId = createSessionId();
          
          // Perform migration
          const result = await framework.migrateSession(sessionId, originalSession);
          
          // Migration should succeed
          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();
          
          // Version should be updated to current
          expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
          expect(result.fromVersion).toBe(sessionVersion);
          
          // Migration path should be valid
          expect(result.migrationPath).toContain(sessionVersion);
          expect(result.migrationPath).toContain(CURRENT_SCHEMA_VERSION);
          expect(result.migrationPath.length).toBeGreaterThan(0);
          
          // Core data should be preserved
          expect(originalSession.id).toBeDefined();
          expect(originalSession.created).toBeDefined();
          expect(originalSession.lastModified).toBeDefined();
          expect(originalSession.model).toBeDefined();
          expect(originalSession.tokenCount).toBeDefined();
          expect(originalSession.messages).toBeDefined();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property: Migration idempotence - migrating twice produces same result.
   */
  it('Property: Migration idempotence - multiple migrations produce consistent results', async () => {
    await fc.assert(
      fc.asyncProperty(
        legacySessionGen,
        async (originalSession) => {
          const sessionId = createSessionId();
          
          // First migration
          const result1 = await framework.migrateSession(sessionId, originalSession);
          expect(result1.success).toBe(true);
          
          // Second migration on already migrated data
          const result2 = await framework.migrateSession(sessionId, originalSession);
          
          // Second migration should be a no-op
          expect(result2.success).toBe(true);
          expect(result2.fromVersion).toBe(result2.toVersion);
          expect(result2.migrationPath).toHaveLength(1);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  /**
   * Property: Version detection accuracy - framework correctly identifies versions.
   */
  it('Property: Version detection accuracy - correctly identifies session versions', () => {
    fc.assert(
      fc.property(
        versionedSessionGen,
        (versionedSession) => {
          const detectedVersion = framework.getDataVersion(versionedSession);
          const expectedVersion = versionedSession.version || '0.7.0';
          
          expect(detectedVersion).toBe(expectedVersion);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property: Migration path validity - all migration paths are valid sequences.
   */
  it('Property: Migration path validity - generates valid migration sequences', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_VERSIONS),
        fc.constantFrom(...SUPPORTED_VERSIONS),
        (fromVersion, toVersion) => {
          const path = framework.getMigrationPath(fromVersion, toVersion);
          
          if (fromVersion === toVersion) {
            // Same version should return single-item path
            expect(path).toEqual([fromVersion]);
          } else {
            const fromIndex = SUPPORTED_VERSIONS.indexOf(fromVersion);
            const toIndex = SUPPORTED_VERSIONS.indexOf(toVersion);
            
            if (fromIndex <= toIndex) {
              // Forward migration should have valid path
              expect(path).not.toBeNull();
              expect(path![0]).toBe(fromVersion);
              expect(path![path!.length - 1]).toBe(toVersion);
              
              // Path should be sequential
              for (let i = 0; i < path!.length - 1; i++) {
                const currentIndex = SUPPORTED_VERSIONS.indexOf(path![i]);
                const nextIndex = SUPPORTED_VERSIONS.indexOf(path![i + 1]);
                expect(nextIndex).toBe(currentIndex + 1);
              }
            } else {
              // Backward migration should return null
              expect(path).toBeNull();
            }
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  /**
   * Property: Supported version validation - correctly validates version support.
   */
  it('Property: Supported version validation - correctly identifies supported versions', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (version) => {
          const isSupported = framework.isSupportedVersion(version);
          const shouldBeSupported = SUPPORTED_VERSIONS.includes(version);
          
          expect(isSupported).toBe(shouldBeSupported);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property: Migration need detection - correctly identifies when migration is needed.
   */
  it('Property: Migration need detection - accurately determines migration necessity', () => {
    fc.assert(
      fc.property(
        anyVersionSessionGen,
        (session) => {
          const needsMigration = framework.needsMigration(session);
          const sessionVersion = session.version || '0.7.0';
          const shouldNeedMigration = sessionVersion !== CURRENT_SCHEMA_VERSION;
          
          expect(needsMigration).toBe(shouldNeedMigration);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property: Migration result consistency - migration results are consistent.
   */
  it('Property: Migration result consistency - results contain expected information', async () => {
    await fc.assert(
      fc.asyncProperty(
        legacySessionGen,
        async (session) => {
          const sessionId = createSessionId();
          const result = await framework.migrateSession(sessionId, session);
          
          // Result should have required fields
          expect(result).toHaveProperty('success');
          expect(result).toHaveProperty('fromVersion');
          expect(result).toHaveProperty('toVersion');
          expect(result).toHaveProperty('migrationPath');
          expect(result).toHaveProperty('warnings');
          
          // If successful, should have valid version info
          if (result.success) {
            expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
            expect(result.migrationPath.length).toBeGreaterThan(0);
            expect(result.error).toBeUndefined();
          } else {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
          }
          
          // Warnings should be an array
          expect(Array.isArray(result.warnings)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// INTEGRATION TESTS WITH STORAGE
// =============================================================================

describe('Migration Integration Property Tests', () => {
  /**
   * Property: End-to-end migration preservation - full migration cycle preserves data.
   */
  it('Property: End-to-end migration preservation - complete migration preserves essential data', async () => {
    await fc.assert(
      fc.asyncProperty(
        legacySessionGen,
        async (originalSession) => {
          const framework = createMigrationFramework();
          const sessionId = createSessionId();
          
          // Store original values
          const originalId = originalSession.id;
          const originalCreated = originalSession.created;
          const originalModel = originalSession.model;
          const originalMessageCount = originalSession.messages.length;
          
          // Perform migration
          const result = await framework.migrateSession(sessionId, originalSession);
          
          if (result.success) {
            // Essential data should be preserved
            expect(originalSession.id).toBe(originalId);
            expect(originalSession.created).toBe(originalCreated);
            expect(originalSession.model).toBe(originalModel);
            expect(originalSession.messages.length).toBe(originalMessageCount);
            
            // New fields should be added with appropriate defaults
            if (result.toVersion === '1.0.0') {
              expect(originalSession).toHaveProperty('workspaceRoot');
              expect(originalSession).toHaveProperty('contextFiles');
              expect(originalSession).toHaveProperty('tags');
              expect(originalSession).toHaveProperty('filesAccessed');
            }
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });
});