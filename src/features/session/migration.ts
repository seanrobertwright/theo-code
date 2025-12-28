/**
 * @fileoverview Session migration framework for schema version management
 * @module features/session/migration
 *
 * Provides automatic schema migration capabilities for session persistence:
 * - Schema version detection and validation
 * - Migration chain execution for multiple version jumps
 * - Backward compatibility for multiple schema versions
 * - Migration validation and error handling
 */

import * as path from 'node:path';
import type {
  Session,
  SessionId,
  VersionedSession,
} from '../../shared/types/index.js';
import {
  SessionSchema,
  VersionedSessionSchema,
} from '../../shared/types/index.js';
import { safeReadFile, atomicWriteFile, fileExists, getSessionFilePath } from './filesystem.js';
import { getSessionsDir } from '../../config/loader.js';

// =============================================================================
// MIGRATION TYPES AND INTERFACES
// =============================================================================

/**
 * Schema version identifier.
 */
export type SchemaVersion = string;

/**
 * Migration function signature.
 * 
 * @param data - Session data in the source version format
 * @returns Promise resolving to migrated session data
 */
export type MigrationFunction = (data: any) => Promise<any>;

/**
 * Migration definition for a specific version transition.
 */
export interface MigrationDefinition {
  /** Source schema version */
  fromVersion: SchemaVersion;
  
  /** Target schema version */
  toVersion: SchemaVersion;
  
  /** Migration function */
  migrate: MigrationFunction;
  
  /** Human-readable description of changes */
  description: string;
  
  /** Whether this migration is reversible */
  reversible: boolean;
  
  /** Optional validation function for migrated data */
  validate?: (data: any) => boolean;
}

/**
 * Migration error types for better error categorization.
 */
export enum MigrationErrorType {
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  NO_MIGRATION_PATH = 'NO_MIGRATION_PATH',
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  BACKUP_FAILED = 'BACKUP_FAILED',
  ROLLBACK_FAILED = 'ROLLBACK_FAILED',
  CORRUPTED_DATA = 'CORRUPTED_DATA',
}

/**
 * Enhanced migration error with categorization and recovery information.
 */
export class MigrationError extends Error {
  constructor(
    public readonly type: MigrationErrorType,
    message: string,
    public readonly originalError?: Error,
    public readonly recoveryOptions?: string[]
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * Migration rollback information.
 */
export interface MigrationRollback {
  /** Whether rollback is possible */
  canRollback: boolean;
  
  /** Path to backup file for rollback */
  backupPath?: string;
  
  /** Steps to perform rollback */
  rollbackSteps: string[];
  
  /** Warnings about rollback consequences */
  rollbackWarnings: string[];
}
export interface MigrationResult {
  /** Whether migration was successful */
  success: boolean;
  
  /** Original schema version */
  fromVersion: SchemaVersion;
  
  /** Final schema version after migration */
  toVersion: SchemaVersion;
  
  /** Migration path taken (list of versions) */
  migrationPath: SchemaVersion[];
  
  /** Backup file path created before migration */
  backupPath?: string;
  
  /** Error message if migration failed */
  error?: string;
  
  /** Categorized error type if migration failed */
  errorType?: MigrationErrorType;
  
  /** Warnings encountered during migration */
  warnings: string[];
  
  /** Rollback information if migration failed */
  rollback?: MigrationRollback;
}

/**
 * Migration framework interface.
 */
export interface IMigrationFramework {
  /** Current schema version */
  getCurrentVersion(): SchemaVersion;
  
  /** Register a migration definition */
  registerMigration(migration: MigrationDefinition): void;
  
  /** Check if migration is needed for a session */
  needsMigration(sessionData: any): boolean;
  
  /** Get the version of session data */
  getDataVersion(sessionData: any): SchemaVersion;
  
  /** Migrate session data to current version */
  migrateSession(sessionId: SessionId, sessionData: any): Promise<MigrationResult>;
  
  /** Get available migration path between versions */
  getMigrationPath(fromVersion: SchemaVersion, toVersion: SchemaVersion): SchemaVersion[] | null;
  
  /** Validate that a version is supported */
  isSupportedVersion(version: SchemaVersion): boolean;
  
  /** Get compatibility information for all versions */
  getVersionCompatibility(): VersionCompatibility[];
  
  /** Get compatibility information for a specific version */
  getVersionInfo(version: SchemaVersion): VersionCompatibility | null;
  
  /** Rollback a failed migration using backup */
  rollbackMigration(sessionId: SessionId, backupPath: string): Promise<MigrationResult>;
  
  /** Create detailed error information for migration failures */
  createMigrationError(type: MigrationErrorType, message: string, originalError?: Error): MigrationError;
}

// =============================================================================
// SCHEMA VERSIONS AND COMPATIBILITY
// =============================================================================

/** Current schema version */
export const CURRENT_SCHEMA_VERSION: SchemaVersion = '1.0.0';

/** Supported schema versions (current + 3 previous versions) */
export const SUPPORTED_VERSIONS: SchemaVersion[] = [
  '0.7.0', // Legacy version - 3 versions back
  '0.8.0', // Added workspaceRoot field - 2 versions back
  '0.9.0', // Added contextFiles and tags - 1 version back
  '1.0.0', // Current version with full feature set
];

/** Minimum supported version */
export const MIN_SUPPORTED_VERSION: SchemaVersion = '0.7.0';

/** Maximum number of previous versions to support */
export const MAX_BACKWARD_COMPATIBILITY_VERSIONS = 3;

/**
 * Version compatibility information.
 */
export interface VersionCompatibility {
  /** Schema version */
  version: SchemaVersion;
  
  /** Whether this version is currently supported */
  supported: boolean;
  
  /** Whether this version can be migrated to current */
  migratable: boolean;
  
  /** Description of this version */
  description: string;
  
  /** Major changes introduced in this version */
  changes: string[];
  
  /** Date when support for this version will be deprecated (if applicable) */
  deprecationDate?: Date;
}

// =============================================================================
// MIGRATION FRAMEWORK IMPLEMENTATION
// =============================================================================

/**
 * Session migration framework for automatic schema version management.
 * 
 * Handles detection of schema versions, execution of migration chains,
 * and validation of migrated data with comprehensive error handling.
 */
export class MigrationFramework implements IMigrationFramework {
  private readonly migrations = new Map<string, MigrationDefinition>();
  
  constructor() {
    this.registerBuiltInMigrations();
    
    // Validate that backward compatibility requirements are met
    try {
      this.validateBackwardCompatibility();
    } catch (error: any) {
      console.error('Migration framework backward compatibility validation failed:', error.message);
      throw error;
    }
  }
  
  // -------------------------------------------------------------------------
  // Core Migration Methods
  // -------------------------------------------------------------------------
  
  /**
   * Gets the current schema version.
   * 
   * @returns Current schema version
   */
  getCurrentVersion(): SchemaVersion {
    return CURRENT_SCHEMA_VERSION;
  }
  
  /**
   * Registers a migration definition.
   * 
   * @param migration - Migration definition to register
   * @throws {Error} If migration is invalid or conflicts with existing migration
   */
  registerMigration(migration: MigrationDefinition): void {
    // Validate migration definition
    if (!migration.fromVersion || !migration.toVersion) {
      throw new Error('Migration must specify both fromVersion and toVersion');
    }
    
    if (!migration.migrate || typeof migration.migrate !== 'function') {
      throw new Error('Migration must provide a migrate function');
    }
    
    if (!migration.description) {
      throw new Error('Migration must provide a description');
    }
    
    // Check for conflicts
    const key = this.getMigrationKey(migration.fromVersion, migration.toVersion);
    if (this.migrations.has(key)) {
      throw new Error(`Migration from ${migration.fromVersion} to ${migration.toVersion} already registered`);
    }
    
    this.migrations.set(key, migration);
  }
  
  /**
   * Checks if migration is needed for session data.
   * 
   * @param sessionData - Session data to check
   * @returns True if migration is needed
   */
  needsMigration(sessionData: any): boolean {
    const dataVersion = this.getDataVersion(sessionData);
    return dataVersion !== CURRENT_SCHEMA_VERSION;
  }
  
  /**
   * Gets the schema version of session data.
   * 
   * @param sessionData - Session data to analyze
   * @returns Schema version string
   */
  getDataVersion(sessionData: any): SchemaVersion {
    // Handle VersionedSession format
    if (sessionData && typeof sessionData === 'object' && 'version' in sessionData && 'data' in sessionData) {
      return sessionData.version || '0.7.0'; // Default to oldest if not specified
    }
    
    // Handle direct Session format
    if (sessionData && typeof sessionData === 'object' && 'version' in sessionData) {
      return sessionData.version || '0.7.0';
    }
    
    // Legacy format without version field
    return '0.7.0';
  }
  
  /**
   * Migrates session data to the current schema version.
   * 
   * @param sessionId - Session identifier for backup purposes
   * @param sessionData - Session data to migrate
   * @returns Promise resolving to migration result
   */
  async migrateSession(sessionId: SessionId, sessionData: any): Promise<MigrationResult> {
    const fromVersion = this.getDataVersion(sessionData);
    const toVersion = CURRENT_SCHEMA_VERSION;
    
    const result: MigrationResult = {
      success: false,
      fromVersion,
      toVersion,
      migrationPath: [],
      warnings: [],
    };
    
    try {
      // Check if migration is needed
      if (fromVersion === toVersion) {
        result.success = true;
        result.migrationPath = [fromVersion];
        return result;
      }
      
      // Check if version is supported
      if (!this.isSupportedVersion(fromVersion)) {
        const error = this.createMigrationError(
          MigrationErrorType.UNSUPPORTED_VERSION,
          `Unsupported schema version: ${fromVersion}. Minimum supported version is ${MIN_SUPPORTED_VERSION}`,
        );
        result.error = error.message;
        result.errorType = error.type;
        result.rollback = this.createRollbackInfo(false, undefined, [
          'No rollback possible for unsupported versions',
          'Consider upgrading from a supported intermediate version',
        ]);
        return result;
      }
      
      // Get migration path
      const migrationPath = this.getMigrationPath(fromVersion, toVersion);
      if (!migrationPath) {
        const error = this.createMigrationError(
          MigrationErrorType.NO_MIGRATION_PATH,
          `No migration path found from ${fromVersion} to ${toVersion}`,
        );
        result.error = error.message;
        result.errorType = error.type;
        result.rollback = this.createRollbackInfo(false, undefined, [
          'No migration path available',
          'Data may need manual conversion',
        ]);
        return result;
      }
      
      result.migrationPath = migrationPath;
      
      // Create backup before migration
      try {
        result.backupPath = await this.createMigrationBackup(sessionId, sessionData);
      } catch (backupError: any) {
        const error = this.createMigrationError(
          MigrationErrorType.BACKUP_FAILED,
          `Failed to create backup: ${backupError.message}`,
          backupError
        );
        result.warnings.push(error.message);
        // Continue without backup, but note the risk
        result.rollback = this.createRollbackInfo(false, undefined, [
          'No backup available - rollback not possible',
          'Migration will proceed without backup',
        ]);
      }
      
      // Execute migration chain
      let currentData = sessionData;
      
      // Handle VersionedSession format
      if (currentData && typeof currentData === 'object' && 'data' in currentData) {
        currentData = currentData.data;
      }
      
      for (let i = 0; i < migrationPath.length - 1; i++) {
        const currentVersion = migrationPath[i];
        const nextVersion = migrationPath[i + 1];
        
        if (!currentVersion || !nextVersion) {
          const error = this.createMigrationError(
            MigrationErrorType.MIGRATION_FAILED,
            `Invalid migration path: undefined version at index ${i}`,
          );
          result.error = error.message;
          result.errorType = error.type;
          result.rollback = this.createRollbackInfo(
            !!result.backupPath,
            result.backupPath,
            [`Migration path contains undefined versions`]
          );
          return result;
        }
        
        const migration = this.getMigration(currentVersion, nextVersion);
        if (!migration) {
          const error = this.createMigrationError(
            MigrationErrorType.MIGRATION_FAILED,
            `Migration not found: ${currentVersion} -> ${nextVersion}`,
          );
          result.error = error.message;
          result.errorType = error.type;
          result.rollback = this.createRollbackInfo(
            !!result.backupPath,
            result.backupPath,
            result.backupPath ? ['Restore from backup to recover original data'] : ['No backup available']
          );
          return result;
        }
        
        try {
          currentData = await migration.migrate(currentData);
          
          // Validate migrated data if validation function is provided
          if (migration.validate && !migration.validate(currentData)) {
            const error = this.createMigrationError(
              MigrationErrorType.VALIDATION_FAILED,
              `Migration validation failed: ${currentVersion} -> ${nextVersion}`,
            );
            result.error = error.message;
            result.errorType = error.type;
            result.rollback = this.createRollbackInfo(
              !!result.backupPath,
              result.backupPath,
              result.backupPath ? ['Restore from backup to recover original data'] : ['No backup available']
            );
            return result;
          }
          
        } catch (migrationError: any) {
          const error = this.createMigrationError(
            MigrationErrorType.MIGRATION_FAILED,
            `Migration failed (${currentVersion} -> ${nextVersion}): ${migrationError.message}`,
            migrationError
          );
          result.error = error.message;
          result.errorType = error.type;
          result.rollback = this.createRollbackInfo(
            !!result.backupPath,
            result.backupPath,
            result.backupPath ? ['Restore from backup to recover original data'] : ['No backup available']
          );
          return result;
        }
      }
      
      // Update the original sessionData object with migrated data
      if (sessionData && typeof sessionData === 'object' && 'data' in sessionData) {
        // VersionedSession format
        sessionData.data = currentData;
        sessionData.version = toVersion;
      } else {
        // Direct session format - copy all properties
        Object.keys(sessionData).forEach(key => delete sessionData[key]);
        Object.assign(sessionData, currentData);
      }
      
      // Final validation with current schema
      try {
        SessionSchema.parse(currentData);
      } catch (validationError: any) {
        const error = this.createMigrationError(
          MigrationErrorType.VALIDATION_FAILED,
          `Final validation failed: ${validationError.message}`,
          validationError
        );
        result.error = error.message;
        result.errorType = error.type;
        result.rollback = this.createRollbackInfo(
          !!result.backupPath,
          result.backupPath,
          result.backupPath ? ['Restore from backup to recover original data'] : ['No backup available']
        );
        return result;
      }
      
      result.success = true;
      return result;
      
    } catch (error: any) {
      const migrationError = this.createMigrationError(
        MigrationErrorType.MIGRATION_FAILED,
        error.message || String(error),
        error
      );
      result.error = migrationError.message;
      result.errorType = migrationError.type;
      result.rollback = this.createRollbackInfo(
        !!result.backupPath,
        result.backupPath,
        result.backupPath ? ['Restore from backup to recover original data'] : ['No backup available']
      );
      return result;
    }
  }
  
  /**
   * Gets the migration path between two versions.
   * 
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @returns Array of versions in migration path, or null if no path exists
   */
  getMigrationPath(fromVersion: SchemaVersion, toVersion: SchemaVersion): SchemaVersion[] | null {
    if (fromVersion === toVersion) {
      return [fromVersion];
    }
    
    // For now, we only support forward migrations in sequence
    const fromIndex = SUPPORTED_VERSIONS.indexOf(fromVersion);
    const toIndex = SUPPORTED_VERSIONS.indexOf(toVersion);
    
    if (fromIndex === -1 || toIndex === -1) {
      return null; // Version not found
    }
    
    if (fromIndex > toIndex) {
      return null; // Backward migration not supported
    }
    
    // Return the path from fromVersion to toVersion
    return SUPPORTED_VERSIONS.slice(fromIndex, toIndex + 1);
  }
  
  /**
   * Validates that a schema version is supported.
   * 
   * @param version - Version to check
   * @returns True if version is supported
   */
  isSupportedVersion(version: SchemaVersion): boolean {
    return SUPPORTED_VERSIONS.includes(version);
  }
  
  /**
   * Gets compatibility information for all supported versions.
   * 
   * @returns Array of version compatibility information
   */
  getVersionCompatibility(): VersionCompatibility[] {
    const compatibilityInfo: VersionCompatibility[] = [
      {
        version: '0.7.0',
        supported: true,
        migratable: true,
        description: 'Legacy session format',
        changes: [
          'Basic session structure with messages',
          'Token counting support',
          'Model tracking',
        ],
      },
      {
        version: '0.8.0',
        supported: true,
        migratable: true,
        description: 'Added workspace context',
        changes: [
          'Added workspaceRoot field for workspace tracking',
          'Improved session organization',
        ],
      },
      {
        version: '0.9.0',
        supported: true,
        migratable: true,
        description: 'Enhanced metadata and tagging',
        changes: [
          'Added contextFiles array for file tracking',
          'Added tags array for session categorization',
          'Improved session discovery',
        ],
      },
      {
        version: '1.0.0',
        supported: true,
        migratable: false, // Already current version
        description: 'Current version with full feature set',
        changes: [
          'Added filesAccessed array for comprehensive file tracking',
          'Added title field for session naming',
          'Added notes field for session annotations',
          'Complete feature parity with design specification',
        ],
      },
    ];
    
    return compatibilityInfo;
  }
  
  /**
   * Gets compatibility information for a specific version.
   * 
   * @param version - Version to get information for
   * @returns Version compatibility information or null if not found
   */
  getVersionInfo(version: SchemaVersion): VersionCompatibility | null {
    const allVersions = this.getVersionCompatibility();
    return allVersions.find(v => v.version === version) || null;
  }
  
  /**
   * Rolls back a failed migration using a backup file.
   * 
   * @param sessionId - Session identifier
   * @param backupPath - Path to backup file
   * @returns Promise resolving to rollback result
   */
  async rollbackMigration(sessionId: SessionId, backupPath: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      fromVersion: 'unknown',
      toVersion: 'unknown',
      migrationPath: [],
      warnings: [],
    };
    
    try {
      if (!await fileExists(backupPath)) {
        const error = this.createMigrationError(
          MigrationErrorType.ROLLBACK_FAILED,
          `Backup file not found: ${backupPath}`,
        );
        result.error = error.message;
        result.errorType = error.type;
        return result;
      }
      
      // Read backup content
      const backupContent = await safeReadFile(backupPath);
      let backupData: any;
      
      try {
        backupData = JSON.parse(backupContent);
      } catch (parseError: any) {
        const error = this.createMigrationError(
          MigrationErrorType.CORRUPTED_DATA,
          `Backup file is corrupted: ${parseError.message}`,
          parseError
        );
        result.error = error.message;
        result.errorType = error.type;
        return result;
      }
      
      // Determine versions
      result.fromVersion = this.getDataVersion(backupData);
      result.toVersion = result.fromVersion; // Rollback to original version
      result.migrationPath = [result.fromVersion];
      
      // Write backup data to session file (this is the rollback)
      const sessionFilePath = getSessionFilePath(sessionId);
      await atomicWriteFile(sessionFilePath, backupContent, { createBackup: false });
      
      result.success = true;
      result.warnings.push('Session rolled back to backup version');
      
      return result;
      
    } catch (error: any) {
      const rollbackError = this.createMigrationError(
        MigrationErrorType.ROLLBACK_FAILED,
        `Rollback failed: ${error.message}`,
        error
      );
      result.error = rollbackError.message;
      result.errorType = rollbackError.type;
      return result;
    }
  }
  
  /**
   * Creates a detailed migration error with categorization.
   * 
   * @param type - Error type category
   * @param message - Error message
   * @param originalError - Original error that caused the migration failure
   * @returns Categorized migration error
   */
  createMigrationError(type: MigrationErrorType, message: string, originalError?: Error): MigrationError {
    const recoveryOptions: string[] = [];
    
    switch (type) {
      case MigrationErrorType.UNSUPPORTED_VERSION:
        recoveryOptions.push('Upgrade to a supported version first');
        recoveryOptions.push('Contact support for migration assistance');
        break;
      case MigrationErrorType.NO_MIGRATION_PATH:
        recoveryOptions.push('Check if intermediate versions are available');
        recoveryOptions.push('Perform manual data conversion');
        break;
      case MigrationErrorType.MIGRATION_FAILED:
      case MigrationErrorType.VALIDATION_FAILED:
        recoveryOptions.push('Restore from backup if available');
        recoveryOptions.push('Check data integrity and retry');
        break;
      case MigrationErrorType.BACKUP_FAILED:
        recoveryOptions.push('Ensure sufficient disk space');
        recoveryOptions.push('Check file permissions');
        break;
      case MigrationErrorType.ROLLBACK_FAILED:
        recoveryOptions.push('Manually restore from backup');
        recoveryOptions.push('Contact support for recovery assistance');
        break;
      case MigrationErrorType.CORRUPTED_DATA:
        recoveryOptions.push('Use alternative backup if available');
        recoveryOptions.push('Attempt manual data recovery');
        break;
    }
    
    return new MigrationError(type, message, originalError, recoveryOptions);
  }
  
  // -------------------------------------------------------------------------
  // Validation and Compatibility Methods
  // -------------------------------------------------------------------------
  
  /**
   * Validates that the migration framework supports the required backward compatibility.
   * 
   * @returns True if backward compatibility requirements are met
   * @throws {Error} If backward compatibility is not properly configured
   */
  validateBackwardCompatibility(): boolean {
    // Check that we support exactly the required number of previous versions
    const supportedCount = SUPPORTED_VERSIONS.length;
    const expectedCount = MAX_BACKWARD_COMPATIBILITY_VERSIONS + 1; // +1 for current version
    
    if (supportedCount !== expectedCount) {
      throw new Error(`Expected ${expectedCount} supported versions, but found ${supportedCount}`);
    }
    
    // Check that current version is the latest
    const lastVersion = SUPPORTED_VERSIONS[SUPPORTED_VERSIONS.length - 1];
    if (lastVersion !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`Current version ${CURRENT_SCHEMA_VERSION} is not the last in supported versions`);
    }
    
    // Check that all migration paths exist
    for (let i = 0; i < SUPPORTED_VERSIONS.length - 1; i++) {
      const fromVersion = SUPPORTED_VERSIONS[i];
      const toVersion = SUPPORTED_VERSIONS[i + 1];
      
      if (!fromVersion || !toVersion) {
        throw new Error(`Invalid supported versions array: undefined version at index ${i}`);
      }
      
      const migration = this.getMigration(fromVersion, toVersion);
      if (!migration) {
        throw new Error(`Missing migration from ${fromVersion} to ${toVersion}`);
      }
    }
    
    // Check that full migration paths exist from all supported versions to current
    for (const version of SUPPORTED_VERSIONS) {
      if (version === CURRENT_SCHEMA_VERSION) {
        continue;
      }
      
      const path = this.getMigrationPath(version, CURRENT_SCHEMA_VERSION);
      if (!path) {
        throw new Error(`No migration path from ${version} to ${CURRENT_SCHEMA_VERSION}`);
      }
    }
    
    return true;
  }
  
  /**
   * Gets detailed information about migration support.
   * 
   * @returns Migration support information
   */
  getMigrationSupportInfo(): {
    currentVersion: SchemaVersion;
    supportedVersions: SchemaVersion[];
    minSupportedVersion: SchemaVersion;
    maxBackwardVersions: number;
    availableMigrations: Array<{ from: SchemaVersion; to: SchemaVersion; description: string }>;
  } {
    const availableMigrations: Array<{ from: SchemaVersion; to: SchemaVersion; description: string }> = [];
    
    for (const migration of this.migrations.values()) {
      availableMigrations.push({
        from: migration.fromVersion,
        to: migration.toVersion,
        description: migration.description,
      });
    }
    
    return {
      currentVersion: CURRENT_SCHEMA_VERSION,
      supportedVersions: [...SUPPORTED_VERSIONS],
      minSupportedVersion: MIN_SUPPORTED_VERSION,
      maxBackwardVersions: MAX_BACKWARD_COMPATIBILITY_VERSIONS,
      availableMigrations,
    };
  }
  
  /**
   * Creates rollback information for migration results.
   * 
   * @param canRollback - Whether rollback is possible
   * @param backupPath - Path to backup file
   * @param warnings - Rollback warnings
   * @returns Rollback information
   */
  private createRollbackInfo(
    canRollback: boolean, 
    backupPath?: string, 
    warnings: string[] = []
  ): MigrationRollback {
    const rollbackSteps: string[] = [];
    
    if (canRollback && backupPath) {
      rollbackSteps.push(`Use rollbackMigration() with backup: ${backupPath}`);
      rollbackSteps.push('Verify restored data integrity');
      rollbackSteps.push('Consider alternative migration approach');
    } else {
      rollbackSteps.push('No automatic rollback available');
      rollbackSteps.push('Manual data recovery may be required');
    }
    
    const result: MigrationRollback = {
      canRollback,
      rollbackSteps,
      rollbackWarnings: warnings,
    };
    
    if (backupPath !== undefined) {
      result.backupPath = backupPath;
    }
    
    return result;
  }
  
  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------
  
  /**
   * Gets a migration key for lookup.
   * 
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @returns Migration key string
   */
  private getMigrationKey(fromVersion: SchemaVersion, toVersion: SchemaVersion): string {
    return `${fromVersion}->${toVersion}`;
  }
  
  /**
   * Gets a migration definition.
   * 
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @returns Migration definition or undefined if not found
   */
  private getMigration(fromVersion: SchemaVersion, toVersion: SchemaVersion): MigrationDefinition | undefined {
    const key = this.getMigrationKey(fromVersion, toVersion);
    return this.migrations.get(key);
  }
  
  /**
   * Creates a backup file before migration.
   * 
   * @param sessionId - Session identifier
   * @param sessionData - Session data to backup
   * @returns Promise resolving to backup file path
   */
  private async createMigrationBackup(sessionId: SessionId, sessionData: any): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionsDir = getSessionsDir();
    const backupPath = path.join(sessionsDir, `${sessionId}.migration-backup.${timestamp}.json`);
    
    const backupContent = JSON.stringify(sessionData, null, 2);
    await atomicWriteFile(backupPath, backupContent, { createBackup: false });
    
    return backupPath;
  }
  
  // -------------------------------------------------------------------------
  // Built-in Migrations
  // -------------------------------------------------------------------------
  
  /**
   * Registers all built-in migration definitions.
   */
  private registerBuiltInMigrations(): void {
    // Migration from 0.7.0 to 0.8.0: Add workspaceRoot field
    this.registerMigration({
      fromVersion: '0.7.0',
      toVersion: '0.8.0',
      description: 'Add workspaceRoot field to session schema',
      reversible: false,
      migrate: async (data: any) => {
        // Extract session data if it's in VersionedSession format
        let sessionData = data;
        if (data && typeof data === 'object' && 'data' in data) {
          sessionData = data.data;
        }
        
        return {
          ...sessionData,
          version: '0.8.0',
          workspaceRoot: sessionData.workspaceRoot || process.cwd(), // Default to current directory
        };
      },
      validate: (data: any) => {
        return data && typeof data.workspaceRoot === 'string';
      },
    });
    
    // Migration from 0.8.0 to 0.9.0: Add contextFiles and tags fields
    this.registerMigration({
      fromVersion: '0.8.0',
      toVersion: '0.9.0',
      description: 'Add contextFiles and tags fields to session schema',
      reversible: false,
      migrate: async (data: any) => {
        return {
          ...data,
          version: '0.9.0',
          contextFiles: data.contextFiles || [],
          tags: data.tags || [],
        };
      },
      validate: (data: any) => {
        return data && Array.isArray(data.contextFiles) && Array.isArray(data.tags);
      },
    });
    
    // Migration from 0.9.0 to 1.0.0: Add filesAccessed, title, and notes fields
    this.registerMigration({
      fromVersion: '0.9.0',
      toVersion: '1.0.0',
      description: 'Add filesAccessed, title, and notes fields to session schema',
      reversible: false,
      migrate: async (data: any) => {
        return {
          ...data,
          version: '1.0.0',
          filesAccessed: data.filesAccessed || [],
          title: data.title ?? null,
          notes: data.notes ?? null,
        };
      },
      validate: (data: any) => {
        return data && 
               Array.isArray(data.filesAccessed) && 
               (data.title === null || typeof data.title === 'string') &&
               (data.notes === null || typeof data.notes === 'string');
      },
    });
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a new migration framework instance.
 * 
 * @returns Configured migration framework
 */
export function createMigrationFramework(): MigrationFramework {
  return new MigrationFramework();
}

/**
 * Migrates a session file in place.
 * 
 * @param sessionId - Session identifier
 * @param filePath - Path to session file
 * @returns Promise resolving to migration result
 */
export async function migrateSessionFile(sessionId: SessionId, filePath: string): Promise<MigrationResult> {
  const framework = createMigrationFramework();
  
  if (!await fileExists(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }
  
  // Read session file
  const content = await safeReadFile(filePath);
  let sessionData: any;
  
  try {
    sessionData = JSON.parse(content);
  } catch (error: any) {
    throw new Error(`Invalid JSON in session file: ${error.message}`);
  }
  
  // Check if migration is needed
  if (!framework.needsMigration(sessionData)) {
    return {
      success: true,
      fromVersion: framework.getDataVersion(sessionData),
      toVersion: framework.getCurrentVersion(),
      migrationPath: [framework.getDataVersion(sessionData)],
      warnings: [],
    };
  }
  
  // Perform migration
  const result = await framework.migrateSession(sessionId, sessionData);
  
  if (result.success) {
    // Write migrated data back to file
    const migratedContent = JSON.stringify(sessionData, null, 2);
    await atomicWriteFile(filePath, migratedContent, { createBackup: true });
  }
  
  return result;
}

/**
 * Validates backward compatibility for a specific number of versions.
 * 
 * @param framework - Migration framework to test
 * @param maxVersions - Maximum number of previous versions to support
 * @returns True if backward compatibility is maintained
 */
export function validateBackwardCompatibilitySupport(
  framework: IMigrationFramework, 
  maxVersions: number = MAX_BACKWARD_COMPATIBILITY_VERSIONS
): boolean {
  const supportInfo = (framework as MigrationFramework).getMigrationSupportInfo();
  
  // Check version count
  if (supportInfo.supportedVersions.length !== maxVersions + 1) {
    return false;
  }
  
  // Check that all versions can migrate to current
  for (const version of supportInfo.supportedVersions) {
    if (version === supportInfo.currentVersion) {
      continue;
    }
    
    const path = framework.getMigrationPath(version, supportInfo.currentVersion);
    if (!path) {
      return false;
    }
  }
  
  return true;
}

/**
 * Gets the oldest supported version.
 * 
 * @returns Oldest supported schema version
 */
export function getOldestSupportedVersion(): SchemaVersion {
  return MIN_SUPPORTED_VERSION;
}

/**
 * Checks if a version is within the backward compatibility window.
 * 
 * @param version - Version to check
 * @returns True if version is within compatibility window
 */
export function isWithinCompatibilityWindow(version: SchemaVersion): boolean {
  return SUPPORTED_VERSIONS.includes(version);
}

/**
 * Checks if a session file needs migration.
 * 
 * @param filePath - Path to session file
 * @returns Promise resolving to true if migration is needed
 */
export async function sessionFileNeedsMigration(filePath: string): Promise<boolean> {
  const framework = createMigrationFramework();
  
  if (!await fileExists(filePath)) {
    return false;
  }
  
  try {
    const content = await safeReadFile(filePath);
    const sessionData = JSON.parse(content);
    return framework.needsMigration(sessionData);
  } catch {
    return false; // If we can't read/parse the file, assume no migration needed
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// All types are already exported inline above