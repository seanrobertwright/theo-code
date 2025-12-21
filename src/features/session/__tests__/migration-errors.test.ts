/**
 * @fileoverview Unit tests for migration error scenarios and rollback functionality
 * @module features/session/__tests__/migration-errors.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  MigrationFramework,
  createMigrationFramework,
  MigrationError,
  MigrationErrorType,
  type MigrationDefinition,
} from '../migration.js';
import {
  createSessionId,
  type SessionId,
} from '../../../shared/types/index.js';
import { fileExists, safeReadFile, atomicWriteFile } from '../filesystem.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Migration Error Handling Tests', () => {
  let framework: MigrationFramework;
  let tempDir: string;
  let sessionId: SessionId;
  
  beforeEach(async () => {
    framework = createMigrationFramework();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'migration-test-'));
    sessionId = createSessionId();
  });
  
  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  // -------------------------------------------------------------------------
  // Unsupported Version Tests
  // -------------------------------------------------------------------------
  
  describe('Unsupported Version Handling', () => {
    it('should reject unsupported old versions', async () => {
      const unsupportedSession = {
        id: sessionId,
        version: '0.1.0', // Too old
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        tokenCount: { total: 0, input: 0, output: 0 },
        messages: [],
      };
      
      const result = await framework.migrateSession(sessionId, unsupportedSession);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported schema version');
      expect(result.errorType).toBe(MigrationErrorType.UNSUPPORTED_VERSION);
      expect(result.rollback).toBeDefined();
      expect(result.rollback!.canRollback).toBe(false);
      expect(result.rollback!.rollbackWarnings).toContain('No rollback possible for unsupported versions');
    });
    
    it('should reject future versions', async () => {
      const futureSession = {
        id: sessionId,
        version: '2.0.0', // Future version
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        tokenCount: { total: 0, input: 0, output: 0 },
        messages: [],
      };
      
      const result = await framework.migrateSession(sessionId, futureSession);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported schema version');
      expect(result.errorType).toBe(MigrationErrorType.UNSUPPORTED_VERSION);
    });
  });
  
  // -------------------------------------------------------------------------
  // Migration Path Tests
  // -------------------------------------------------------------------------
  
  describe('Migration Path Errors', () => {
    it('should handle missing migration path gracefully', () => {
      // This test uses the framework's built-in logic
      // In practice, this shouldn't happen with the current implementation
      // but tests the error handling path
      const path = framework.getMigrationPath('0.1.0', '1.0.0');
      expect(path).toBeNull(); // No path for unsupported version
    });
  });
  
  // -------------------------------------------------------------------------
  // Backup Failure Tests
  // -------------------------------------------------------------------------
  
  describe('Backup Failure Handling', () => {
    it('should continue migration with warning when backup fails', async () => {
      // Mock the backup creation to fail
      const originalCreateBackup = framework['createMigrationBackup'];
      framework['createMigrationBackup'] = vi.fn().mockRejectedValue(new Error('Disk full'));
      
      const session = {
        id: sessionId,
        version: '0.7.0',
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        tokenCount: { total: 0, input: 0, output: 0 },
        messages: [],
      };
      
      const result = await framework.migrateSession(sessionId, session);
      
      expect(result.success).toBe(true); // Migration should still succeed
      expect(result.warnings).toContain('Failed to create backup: Disk full');
      expect(result.rollback).toBeDefined();
      expect(result.rollback!.canRollback).toBe(false);
      
      // Restore original method
      framework['createMigrationBackup'] = originalCreateBackup;
    });
  });
  
  // -------------------------------------------------------------------------
  // Migration Validation Tests
  // -------------------------------------------------------------------------
  
  describe('Migration Validation Errors', () => {
    it('should handle validation failures during migration', async () => {
      // Create a custom migration framework with a failing validation
      const testFramework = new MigrationFramework();
      
      // Clear existing migrations and register only the failing one
      testFramework['migrations'].clear();
      
      // Register a migration with validation that always fails
      const failingMigration: MigrationDefinition = {
        fromVersion: '0.7.0',
        toVersion: '0.8.0',
        description: 'Test migration with failing validation',
        reversible: false,
        migrate: async (data: any) => ({
          ...data,
          version: '0.8.0',
          workspaceRoot: '/test',
        }),
        validate: () => false, // Always fail validation
      };
      
      testFramework.registerMigration(failingMigration);
      
      const session = {
        id: sessionId,
        version: '0.7.0',
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        tokenCount: { total: 0, input: 0, output: 0 },
        messages: [],
      };
      
      const result = await testFramework.migrateSession(sessionId, session);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration validation failed');
      expect(result.errorType).toBe(MigrationErrorType.VALIDATION_FAILED);
      expect(result.rollback).toBeDefined();
    });
  });
  
  // -------------------------------------------------------------------------
  // Corrupted Data Tests
  // -------------------------------------------------------------------------
  
  describe('Corrupted Data Handling', () => {
    it('should handle corrupted session data gracefully', async () => {
      const corruptedSession = {
        id: sessionId,
        version: '0.7.0',
        // Missing required fields to cause validation failure
        model: 'gpt-4o',
        // Missing created, lastModified, tokenCount, messages
      };
      
      const result = await framework.migrateSession(sessionId, corruptedSession);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Final validation failed');
      expect(result.errorType).toBe(MigrationErrorType.VALIDATION_FAILED);
    });
  });
  
  // -------------------------------------------------------------------------
  // Rollback Tests
  // -------------------------------------------------------------------------
  
  describe('Rollback Functionality', () => {
    it('should successfully rollback from a valid backup', async () => {
      const backupPath = path.join(tempDir, 'test-backup.json');
      const originalSession = {
        id: sessionId,
        version: '0.7.0',
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        tokenCount: { total: 0, input: 0, output: 0 },
        messages: [],
      };
      
      // Create a backup file
      await atomicWriteFile(backupPath, JSON.stringify(originalSession, null, 2));
      
      const result = await framework.rollbackMigration(sessionId, backupPath);
      
      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe('0.7.0');
      expect(result.toVersion).toBe('0.7.0');
      expect(result.warnings).toContain('Session rolled back to backup version');
    });
    
    it('should fail rollback when backup file does not exist', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent-backup.json');
      
      const result = await framework.rollbackMigration(sessionId, nonExistentPath);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Backup file not found');
      expect(result.errorType).toBe(MigrationErrorType.ROLLBACK_FAILED);
    });
    
    it('should fail rollback when backup file is corrupted', async () => {
      const corruptedBackupPath = path.join(tempDir, 'corrupted-backup.json');
      
      // Create a corrupted backup file
      await atomicWriteFile(corruptedBackupPath, 'invalid json content');
      
      const result = await framework.rollbackMigration(sessionId, corruptedBackupPath);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Backup file is corrupted');
      expect(result.errorType).toBe(MigrationErrorType.CORRUPTED_DATA);
    });
  });
  
  // -------------------------------------------------------------------------
  // Error Creation Tests
  // -------------------------------------------------------------------------
  
  describe('Migration Error Creation', () => {
    it('should create properly categorized migration errors', () => {
      const error = framework.createMigrationError(
        MigrationErrorType.UNSUPPORTED_VERSION,
        'Test error message',
        new Error('Original error')
      );
      
      expect(error).toBeInstanceOf(MigrationError);
      expect(error.type).toBe(MigrationErrorType.UNSUPPORTED_VERSION);
      expect(error.message).toBe('Test error message');
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.recoveryOptions).toBeDefined();
      expect(error.recoveryOptions!.length).toBeGreaterThan(0);
    });
    
    it('should provide appropriate recovery options for each error type', () => {
      const errorTypes = [
        MigrationErrorType.UNSUPPORTED_VERSION,
        MigrationErrorType.NO_MIGRATION_PATH,
        MigrationErrorType.MIGRATION_FAILED,
        MigrationErrorType.VALIDATION_FAILED,
        MigrationErrorType.BACKUP_FAILED,
        MigrationErrorType.ROLLBACK_FAILED,
        MigrationErrorType.CORRUPTED_DATA,
      ];
      
      for (const errorType of errorTypes) {
        const error = framework.createMigrationError(errorType, 'Test message');
        
        expect(error.recoveryOptions).toBeDefined();
        expect(error.recoveryOptions!.length).toBeGreaterThan(0);
        expect(error.recoveryOptions!.every(option => typeof option === 'string')).toBe(true);
      }
    });
  });
  
  // -------------------------------------------------------------------------
  // Integration Error Tests
  // -------------------------------------------------------------------------
  
  describe('Integration Error Scenarios', () => {
    it('should handle complete migration failure with proper error information', async () => {
      const session = {
        id: sessionId,
        version: '0.7.0',
        created: Date.now(),
        lastModified: Date.now(),
        model: 'gpt-4o',
        tokenCount: { total: 0, input: 0, output: 0 },
        messages: [],
      };
      
      // Mock a migration step to fail
      const originalMigration = framework['getMigration']('0.7.0', '0.8.0');
      if (originalMigration) {
        const failingMigration: MigrationDefinition = {
          ...originalMigration,
          migrate: async () => {
            throw new Error('Simulated migration failure');
          },
        };
        
        framework['migrations'].set('0.7.0->0.8.0', failingMigration);
        
        const result = await framework.migrateSession(sessionId, session);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('Simulated migration failure');
        expect(result.errorType).toBe(MigrationErrorType.MIGRATION_FAILED);
        expect(result.rollback).toBeDefined();
        expect(result.rollback!.rollbackSteps.length).toBeGreaterThan(0);
        
        // Restore original migration
        framework['migrations'].set('0.7.0->0.8.0', originalMigration);
      }
    });
    
    it('should provide detailed error logging information', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        const session = {
          id: sessionId,
          version: '0.1.0', // Unsupported
          created: Date.now(),
          lastModified: Date.now(),
          model: 'gpt-4o',
          tokenCount: { total: 0, input: 0, output: 0 },
          messages: [],
        };
        
        const result = await framework.migrateSession(sessionId, session);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.errorType).toBeDefined();
        expect(result.rollback).toBeDefined();
        
        // Verify error contains useful information for debugging
        expect(result.error).toContain('0.1.0');
        expect(result.rollback!.rollbackSteps.length).toBeGreaterThan(0);
        
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });
  
  // -------------------------------------------------------------------------
  // Error Recovery Tests
  // -------------------------------------------------------------------------
  
  describe('Error Recovery Scenarios', () => {
    it('should provide actionable recovery steps for backup failures', () => {
      const error = framework.createMigrationError(
        MigrationErrorType.BACKUP_FAILED,
        'Failed to create backup'
      );
      
      expect(error.recoveryOptions).toContain('Ensure sufficient disk space');
      expect(error.recoveryOptions).toContain('Check file permissions');
    });
    
    it('should provide actionable recovery steps for rollback failures', () => {
      const error = framework.createMigrationError(
        MigrationErrorType.ROLLBACK_FAILED,
        'Failed to rollback migration'
      );
      
      expect(error.recoveryOptions).toContain('Manually restore from backup');
      expect(error.recoveryOptions).toContain('Contact support for recovery assistance');
    });
    
    it('should provide actionable recovery steps for corrupted data', () => {
      const error = framework.createMigrationError(
        MigrationErrorType.CORRUPTED_DATA,
        'Data corruption detected'
      );
      
      expect(error.recoveryOptions).toContain('Use alternative backup if available');
      expect(error.recoveryOptions).toContain('Attempt manual data recovery');
    });
  });
});