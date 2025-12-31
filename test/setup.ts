/**
 * @fileoverview Vitest global test setup with memory management
 * @module test/setup
 */

import { vi } from 'vitest';

// Mock console methods to prevent noise in tests
globalThis.console = {
  ...console,
  // Suppress logs during tests unless explicitly needed
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Global memory management for property-based tests
let testCleanupTasks: Array<() => Promise<void> | void> = [];

// Helper to register cleanup tasks
globalThis.registerTestCleanup = (task: () => Promise<void> | void) => {
  testCleanupTasks.push(task);
};

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  testCleanupTasks = [];
});

// Enhanced cleanup after each test with memory management
afterEach(async () => {
  // Run all registered cleanup tasks
  for (const task of testCleanupTasks) {
    try {
      await task();
    } catch (error) {
      // Ignore cleanup errors to prevent test failures
      console.warn('Cleanup task failed:', error);
    }
  }
  
  // Clear cleanup tasks
  testCleanupTasks = [];
  
  // Force garbage collection if available (for Node.js with --expose-gc)
  if (typeof global !== 'undefined' && global.gc) {
    global.gc();
  }
  
  // Small delay to allow async cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 1));
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
  
  // Final garbage collection
  if (typeof global !== 'undefined' && global.gc) {
    global.gc();
  }
});

// Declare global types for TypeScript
declare global {
  function registerTestCleanup(task: () => Promise<void> | void): void;
  namespace NodeJS {
    interface Global {
      gc?: () => void;
    }
  }
}
