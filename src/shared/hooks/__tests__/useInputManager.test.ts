/**
 * @fileoverview Tests for useInputManager hook
 * @module shared/hooks/__tests__/useInputManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// Mock ink's useInput before importing the module
vi.mock('ink', () => ({
  useInput: vi.fn(),
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
import { useInputManager, useInputHandler, InputManagerProvider } from '../useInputManager.js';

describe('useInputManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create input manager context', () => {
    // Test that the context can be created without errors
    const provider = React.createElement(InputManagerProvider, { children: null });
    expect(provider).toBeDefined();
    expect(provider.type).toBe(InputManagerProvider);
  });

  it('should export all required functions', () => {
    expect(typeof useInputManager).toBe('function');
    expect(typeof useInputHandler).toBe('function');
    expect(typeof InputManagerProvider).toBe('function');
  });
});

describe('Input Manager Core Functionality', () => {
  it('should provide centralized input management', () => {
    // Test that the input manager provides the expected interface
    expect(useInputManager).toBeDefined();
    expect(useInputHandler).toBeDefined();
    expect(InputManagerProvider).toBeDefined();
  });
});

describe('useInputHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provide hook interface', () => {
    // Test that the hook exists and can be imported
    expect(typeof useInputHandler).toBe('function');
  });
});