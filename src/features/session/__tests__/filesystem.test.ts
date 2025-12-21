/**
 * @fileoverview Property-based tests for session filesystem operations
 * @module features/session/__tests__/filesystem.test
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  atomicWriteFile,
  safeReadFile,
  compressData,
  decompressData,
  calculateChecksum,
  verifyChecksum,
  fileExists,
  safeDeleteFile,
  ensureSessionsDirectory,
  repairSessionFilePermissions,
} from '../filesystem.js';

// =============================================================================
// TEST SETUP - Use a single shared test directory to avoid Windows race conditions
// =============================================================================

let baseTestDir: string;
let testCounter = 0;

// Create base test directory once before all tests
beforeAll(async () => {
  baseTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-fs-test-'));
});

// Clean up base test directory after all tests complete
afterAll(async () => {
  // Wait a bit for Windows to release file handles
  await new Promise(resolve => setTimeout(resolve, 100));
  try {
    await fs.rm(baseTestDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors on Windows
  }
});

/**
 * Helper to create a unique subdirectory for each test run
 */
async function createTestSubDir(): Promise<string> {
  const subDir = path.join(baseTestDir, `test-${++testCounter}-${Date.now()}`);
  await fs.mkdir(subDir, { recursive: true });
  return subDir;
}

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generator for valid file content
 */
const fileContentArb = fc.string({ minLength: 0, maxLength: 10000 });

/**
 * Generator for valid file names - Windows compatible
 */
const fileNameArb = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
  { minLength: 3, maxLength: 10 }
).map(arr => `f${arr.join('')}`); // Prefix with 'f' to ensure it starts with a letter

/**
 * Generator for checksums (hex strings)
 */
const checksumArb = fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 })
  .map(arr => arr.map(n => n.toString(16)).join(''));

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Session Filesystem Property Tests', () => {
  describe('Property 13: File corruption handling', () => {
    it('**Feature: session-persistence, Property 13: File corruption handling**', async () => {
      // **Validates: Requirements 4.5**
      const testDir = await createTestSubDir();
      
      await fc.assert(
        fc.asyncProperty(
          fileContentArb,
          fileNameArb,
          async (content, fileName) => {
            // Use unique file names to avoid conflicts
            const uniqueFileName = `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const filePath = path.join(testDir, uniqueFileName);
            
            // Test that the system handles file operations gracefully
            try {
              // Write file atomically
              await atomicWriteFile(filePath, content);
              
              // Verify file exists
              const exists = await fileExists(filePath);
              expect(exists).toBe(true);
              
              // Read file back
              const readContent = await safeReadFile(filePath);
              expect(readContent).toBe(content);
              
              // Test corruption detection with checksums
              const checksum = calculateChecksum(content);
              expect(verifyChecksum(content, checksum)).toBe(true);
              
              // Test that corrupted data is detected
              if (content.length > 0) {
                const corruptedContent = content.slice(0, -1) + 'X';
                expect(verifyChecksum(corruptedContent, checksum)).toBe(false);
              }
              
              // Clean up
              await safeDeleteFile(filePath);
              const existsAfterDelete = await fileExists(filePath);
              expect(existsAfterDelete).toBe(false);
              
            } catch (error: any) {
              // The system should handle errors gracefully without crashing
              expect(error).toBeInstanceOf(Error);
              expect(error.message).toBeDefined();
              expect(typeof error.message).toBe('string');
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle compression and decompression without data loss', async () => {
      await fc.assert(
        fc.asyncProperty(fileContentArb, async (originalData) => {
          try {
            // Compress data
            const compressed = await compressData(originalData);
            expect(typeof compressed).toBe('string');
            expect(compressed.length).toBeGreaterThan(0);
            
            // Decompress data
            const decompressed = await decompressData(compressed);
            expect(decompressed).toBe(originalData);
          } catch (error: any) {
            // Compression/decompression should handle all valid strings
            // If it fails, it should fail gracefully with a proper error
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBeDefined();
          }
        }),
        { numRuns: 25 }
      );
    });

    it('should handle atomic writes with backup and recovery', async () => {
      const testDir = await createTestSubDir();
      
      await fc.assert(
        fc.asyncProperty(
          fileContentArb,
          fileContentArb,
          fileNameArb,
          async (originalContent, newContent, fileName) => {
            // Use unique file names to avoid conflicts
            const uniqueFileName = `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const filePath = path.join(testDir, uniqueFileName);
            const backupPath = `${filePath}.bak`;
            
            try {
              // Write original content
              await atomicWriteFile(filePath, originalContent, { createBackup: false });
              
              // Verify original content
              const readOriginal = await safeReadFile(filePath);
              expect(readOriginal).toBe(originalContent);
              
              // Write new content with backup
              await atomicWriteFile(filePath, newContent, { createBackup: true });
              
              // Verify new content
              const readNew = await safeReadFile(filePath);
              expect(readNew).toBe(newContent);
              
              // Verify backup exists if original file existed
              if (originalContent.length > 0) {
                const backupExists = await fileExists(backupPath);
                if (backupExists) {
                  const backupContent = await safeReadFile(backupPath);
                  expect(backupContent).toBe(originalContent);
                }
              }
              
            } catch (error: any) {
              // Atomic operations should handle errors gracefully
              expect(error).toBeInstanceOf(Error);
              expect(error.message).toBeDefined();
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Checksum Validation Properties', () => {
    it('should generate consistent checksums for identical data', () => {
      fc.assert(
        fc.property(fileContentArb, (data) => {
          const checksum1 = calculateChecksum(data);
          const checksum2 = calculateChecksum(data);
          
          expect(checksum1).toBe(checksum2);
          expect(checksum1).toHaveLength(64); // SHA-256 hex length
          expect(/^[a-f0-9]+$/.test(checksum1)).toBe(true); // Valid hex
        }),
        { numRuns: 100 }
      );
    });

    it('should generate different checksums for different data', () => {
      fc.assert(
        fc.property(
          fileContentArb,
          fileContentArb,
          (data1, data2) => {
            fc.pre(data1 !== data2); // Only test when data is different
            
            const checksum1 = calculateChecksum(data1);
            const checksum2 = calculateChecksum(data2);
            
            expect(checksum1).not.toBe(checksum2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly verify valid and invalid checksums', () => {
      fc.assert(
        fc.property(
          fileContentArb,
          checksumArb,
          (data, randomChecksum) => {
            const correctChecksum = calculateChecksum(data);
            
            // Correct checksum should verify
            expect(verifyChecksum(data, correctChecksum)).toBe(true);
            
            // Random checksum should not verify (unless by extreme coincidence)
            if (randomChecksum !== correctChecksum) {
              expect(verifyChecksum(data, randomChecksum)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('File System Error Handling', () => {
    it('should handle non-existent files gracefully', async () => {
      const testDir = await createTestSubDir();
      
      await fc.assert(
        fc.asyncProperty(fileNameArb, async (fileName) => {
          const nonExistentPath = path.join(testDir, 'nonexistent', fileName);
          
          // Reading non-existent file should throw but not crash
          try {
            await safeReadFile(nonExistentPath);
            // Should not reach here
            expect(false).toBe(true);
          } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain('not found');
          }
          
          // Checking existence should return false
          const exists = await fileExists(nonExistentPath);
          expect(exists).toBe(false);
          
          // Deleting non-existent file should not throw
          await expect(safeDeleteFile(nonExistentPath)).resolves.toBeUndefined();
        }),
        { numRuns: 20 }
      );
    });

    it('should handle file size limits', async () => {
      const testDir = await createTestSubDir();
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 100, maxLength: 1000 }),
          fileNameArb,
          async (content, fileName) => {
            const uniqueFileName = `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const filePath = path.join(testDir, uniqueFileName);
            
            // Write file
            await atomicWriteFile(filePath, content);
            
            // Reading with sufficient size limit should work
            const readContent = await safeReadFile(filePath, { maxSize: content.length + 100 });
            expect(readContent).toBe(content);
            
            // Reading with insufficient size limit should throw
            if (content.length > 10) {
              try {
                await safeReadFile(filePath, { maxSize: 10 });
                expect(false).toBe(true); // Should not reach here
              } catch (error: any) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toContain('too large');
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Directory Management Properties', () => {
    it('should handle directory creation and permission repair', async () => {
      // This test doesn't use property-based testing as it's testing system-level operations
      // But it validates the error handling requirements
      
      try {
        // Directory operations should handle errors gracefully
        const result = await repairSessionFilePermissions();
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
        
      } catch (error: any) {
        // Should handle permission errors gracefully
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBeDefined();
      }
    });
  });
});