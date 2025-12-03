/**
 * @fileoverview Vitest global test setup
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

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});
