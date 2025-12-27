/**
 * @fileoverview Property-based tests for backward compatibility in session migration
 * @module features/session/__tests__/migration-compatibility.property.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  MigrationFramework,
  createMigrationFramework,
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_VERSIONS,
  MIN_SUPPORTED_VERSION,
  MAX_BACKWARD_COMPATIBILITY_VERSIONS,
  validateBackwardCompatibilitySupport,
  getOldestSupportedVersion,
  isWithinCompatibilityWindow,
  type VersionCompatibility,
} from '../migration.js';
import {
  createSessionId,
  type SessionId,
} from '../../../shared/types/index.js';

// =============================================================================
// TEST GENERATORS
// =============================================================================

/**
 * Generates a session for any supported version.
 */
const supportedVersionSessionGen = fc.record({
  id: fc.string().map(() => createSessionId()),
  version: fc.constantFrom(...SUPPORTED_VERSIONS),
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
    content: fc.string({ minLength: 1, maxLength: 500 }),
    timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
  }), { minLength: 0, maxLength: 5 }),
});

/**
 * Generates an unsupported (too old) version.
 */
const unsupportedVersionGen = fc.constantFrom('0.1.0', '0.5.0', '0.6.0', '0.6.5');

/**
 * Generates a future version (not yet supported).
 */
const futureVersionGen = fc.constantFrom('1.1.0', '2.0.0', '3.0.0');

// =============================================================================
// BACKWARD COMPATIBILITY PROPERTY TESTS
// =============================================================================

describe('Migration Backward Compatibility Property Tests', () => {
  let framework: MigrationFramework;
  
  beforeEach(() => {
    framework = createMigrationFramework();
  });
  
  /**
   * **Feature: session-persistence, Property 19: Backward compatibility maintenance**
   * **Validates: Requirements 6.3**
   * 
   * For any session from the last 3 schema versions, the system should be 
   * able to load and migrate it successfully.
   */
  it('Property 19: Backward compatibility maintenance - supports exactly 3 previous versions', () => {
    // Test that we support exactly the required number of versions
    const supportedCount = SUPPORTED_VERSIONS.length;
    const expectedCount = MAX_BACKWARD_COMPATIBILITY_VERSIONS + 1; // +1 for current version
    
    expect(supportedCount).toBe(expectedCount);
    expect(supportedCount).toBe(4); // 3 previous + 1 current
    
    // Test that the framework validates its own backward compatibility
    expect(() => framework.validateBackwardCompatibility()).not.toThrow();
    
    // Test utility function
    expect(validateBackwardCompatibilitySupport(framework)).toBe(true);
  });
  
  /**
   * Property: All supported versions can migrate to current version.
   */
  it('Property: All supported versions have migration paths to current', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_VERSIONS),
        (version) => {
          if (version === CURRENT_SCHEMA_VERSION) {
            // Current version should have single-item path to itself
            const path = framework.getMigrationPath(version, CURRENT_SCHEMA_VERSION);
            expect(path).toEqual([version]);
          } else {
            // Older versions should have valid migration paths
            const path = framework.getMigrationPath(version, CURRENT_SCHEMA_VERSION);
            expect(path).not.toBeNull();
            expect(path![0]).toBe(version);
            expect(path![path!.length - 1]).toBe(CURRENT_SCHEMA_VERSION);
            expect(path!.length).toBeGreaterThan(1);
          }
          
          return true;
        }
      ),
      { numRuns: 20 } // Test all supported versions multiple times
    );
  });
  
  /**
   * Property: Supported version detection is accurate.
   */
  it('Property: Supported version detection - accurately identifies supported versions', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(...SUPPORTED_VERSIONS),
          unsupportedVersionGen,
          futureVersionGen
        ),
        (version) => {
          const isSupported = framework.isSupportedVersion(version);
          const shouldBeSupported = SUPPORTED_VERSIONS.includes(version);
          
          expect(isSupported).toBe(shouldBeSupported);
          
          // Test utility function consistency
          expect(isWithinCompatibilityWindow(version)).toBe(shouldBeSupported);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  /**
   * Property: Migration success for all supported versions.
   */
  it('Property: Migration success - all supported versions migrate successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SUPPORTED_VERSIONS.slice(0, -1)), // Only test versions that need migration
        async (version) => {
          const sessionId = createSessionId();
          
          // Create a properly structured session for the specified version
          const session: any = {
            id: sessionId,
            version,
            created: Date.now(),
            lastModified: Date.now(),
            model: 'gpt-4o',
            tokenCount: { total: 0, input: 0, output: 0 },
            messages: [],
          };
          
          // Add version-specific fields
          if (version === '0.8.0' || version === '0.9.0' || version === '1.0.0') {
            session.workspaceRoot = '/test/workspace';
          }
          
          if (version === '0.9.0' || version === '1.0.0') {
            session.contextFiles = [];
            session.tags = [];
          }
          
          if (version === '1.0.0') {
            session.filesAccessed = [];
            session.title = null;
            session.notes = null;
          }
          
          const result = await framework.migrateSession(sessionId, session);
          
          // Migration should succeed for all supported versions
          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();
          expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
          
          // Migration path should be valid
          expect(result.migrationPath).toContain(version);
          expect(result.migrationPath).toContain(CURRENT_SCHEMA_VERSION);
          expect(result.migrationPath.length).toBeGreaterThan(1);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  /**
   * Property: Unsupported versions are rejected.
   */
  it('Property: Unsupported version rejection - rejects versions outside compatibility window', async () => {
    await fc.assert(
      fc.asyncProperty(
        unsupportedVersionGen,
        async (unsupportedVersion) => {
          const sessionId = createSessionId();
          const session = {
            id: sessionId,
            version: unsupportedVersion,
            created: Date.now(),
            lastModified: Date.now(),
            model: 'gpt-4o',
            tokenCount: { total: 0, input: 0, output: 0 },
            messages: [],
          };
          
          // Unsupported versions should be rejected
          expect(framework.isSupportedVersion(unsupportedVersion)).toBe(false);
          
          const result = await framework.migrateSession(sessionId, session);
          expect(result.success).toBe(false);
          expect(result.error).toContain('Unsupported schema version');
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
  
  /**
   * Property: Version compatibility information is accurate.
   */
  it('Property: Version compatibility information - provides accurate version details', () => {
    const compatibilityInfo = framework.getVersionCompatibility();
    
    // Should have info for all supported versions
    expect(compatibilityInfo).toHaveLength(SUPPORTED_VERSIONS.length);
    
    // Each supported version should have compatibility info
    for (const version of SUPPORTED_VERSIONS) {
      const info = framework.getVersionInfo(version);
      expect(info).not.toBeNull();
      expect(info!.version).toBe(version);
      expect(info!.supported).toBe(true);
      expect(typeof info!.description).toBe('string');
      expect(Array.isArray(info!.changes)).toBe(true);
      
      // Current version should not be migratable (already current)
      if (version === CURRENT_SCHEMA_VERSION) {
        expect(info!.migratable).toBe(false);
      } else {
        expect(info!.migratable).toBe(true);
      }
    }
  });
  
  /**
   * Property: Migration support information is consistent.
   */
  it('Property: Migration support information - provides consistent framework details', () => {
    const supportInfo = framework.getMigrationSupportInfo();
    
    expect(supportInfo.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(supportInfo.supportedVersions).toEqual(SUPPORTED_VERSIONS);
    expect(supportInfo.minSupportedVersion).toBe(MIN_SUPPORTED_VERSION);
    expect(supportInfo.maxBackwardVersions).toBe(MAX_BACKWARD_COMPATIBILITY_VERSIONS);
    
    // Should have migrations for all version transitions
    expect(supportInfo.availableMigrations.length).toBe(SUPPORTED_VERSIONS.length - 1);
    
    // Each migration should connect consecutive versions
    for (let i = 0; i < SUPPORTED_VERSIONS.length - 1; i++) {
      const fromVersion = SUPPORTED_VERSIONS[i];
      const toVersion = SUPPORTED_VERSIONS[i + 1];
      
      const migration = supportInfo.availableMigrations.find(
        m => m.from === fromVersion && m.to === toVersion
      );
      
      expect(migration).toBeDefined();
      expect(migration!.description).toBeTruthy();
    }
  });
  
  /**
   * Property: Oldest supported version consistency.
   */
  it('Property: Oldest supported version - utility functions are consistent', () => {
    const oldestFromFramework = SUPPORTED_VERSIONS[0];
    const oldestFromUtility = getOldestSupportedVersion();
    const minSupported = MIN_SUPPORTED_VERSION;
    
    expect(oldestFromFramework).toBe(oldestFromUtility);
    expect(oldestFromFramework).toBe(minSupported);
    
    // Oldest version should be exactly MAX_BACKWARD_COMPATIBILITY_VERSIONS behind current
    const versionIndex = SUPPORTED_VERSIONS.indexOf(oldestFromFramework);
    const currentIndex = SUPPORTED_VERSIONS.indexOf(CURRENT_SCHEMA_VERSION);
    
    expect(currentIndex - versionIndex).toBe(MAX_BACKWARD_COMPATIBILITY_VERSIONS);
  });
  
  /**
   * Property: Sequential version migration chain.
   */
  it('Property: Sequential migration chain - versions form valid sequence', () => {
    // Test that versions are in proper sequence
    for (let i = 0; i < SUPPORTED_VERSIONS.length - 1; i++) {
      const currentVersion = SUPPORTED_VERSIONS[i];
      const nextVersion = SUPPORTED_VERSIONS[i + 1];
      
      // Should have direct migration between consecutive versions
      const path = framework.getMigrationPath(currentVersion, nextVersion);
      expect(path).toEqual([currentVersion, nextVersion]);
      
      // Should be able to migrate from any version to any later version
      for (let j = i + 1; j < SUPPORTED_VERSIONS.length; j++) {
        const targetVersion = SUPPORTED_VERSIONS[j];
        const fullPath = framework.getMigrationPath(currentVersion, targetVersion);
        
        expect(fullPath).not.toBeNull();
        expect(fullPath![0]).toBe(currentVersion);
        expect(fullPath![fullPath!.length - 1]).toBe(targetVersion);
        expect(fullPath!.length).toBe(j - i + 1);
      }
    }
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Backward Compatibility Integration Tests', () => {
  /**
   * Property: End-to-end backward compatibility validation.
   */
  it('Property: End-to-end compatibility - framework initialization validates compatibility', () => {
    // Creating a new framework should validate backward compatibility
    expect(() => createMigrationFramework()).not.toThrow();
    
    // Framework should pass all compatibility checks
    const framework = createMigrationFramework();
    expect(validateBackwardCompatibilitySupport(framework)).toBe(true);
    expect(framework.validateBackwardCompatibility()).toBe(true);
  });
  
  /**
   * Property: Cross-version data preservation.
   */
  it('Property: Cross-version data preservation - essential data preserved across all migrations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SUPPORTED_VERSIONS.slice(0, -1)), // Exclude current version
        fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0), // Ensure non-empty content
        fc.constantFrom('gpt-4o', 'gpt-4', 'claude-3-sonnet'),
        async (version, testContent, model) => {
          const framework = createMigrationFramework();
          const sessionId = createSessionId();
          
          // Create a properly structured session for the specified version
          const session: any = {
            id: sessionId,
            version,
            created: Date.now() - 86400000, // 1 day ago
            lastModified: Date.now(),
            model,
            tokenCount: { total: 100, input: 50, output: 50 },
            messages: [{
              id: createSessionId(),
              role: 'user' as const,
              content: testContent.trim(),
              timestamp: Date.now(),
            }],
          };
          
          // Add version-specific fields
          if (version === '0.8.0' || version === '0.9.0' || version === '1.0.0') {
            session.workspaceRoot = '/test/workspace';
          }
          
          if (version === '0.9.0' || version === '1.0.0') {
            session.contextFiles = [];
            session.tags = [];
          }
          
          if (version === '1.0.0') {
            session.filesAccessed = [];
            session.title = null;
            session.notes = null;
          }
          
          // Store original values
          const originalId = session.id;
          const originalCreated = session.created;
          const originalModel = session.model;
          const originalMessageContent = session.messages[0].content;
          
          // Migrate to current version
          const result = await framework.migrateSession(sessionId, session);
          
          // Migration should succeed for all supported versions
          expect(result.success).toBe(true);
          
          // Essential data should be preserved
          expect(session.id).toBe(originalId);
          expect(session.created).toBe(originalCreated);
          expect(session.model).toBe(originalModel);
          expect(session.messages[0].content).toBe(originalMessageContent);
          
          // Version should be updated
          expect(session.version).toBe(CURRENT_SCHEMA_VERSION);
          
          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});