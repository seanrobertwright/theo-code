/**
 * @fileoverview Tests for ConnectedProjectHeader component
 * @module shared/components/Layout/__tests__/ConnectedProjectHeader
 */

import * as React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectedProjectHeader } from '../ConnectedProjectHeader.js';
import { useAppStore } from '../../../store/index.js';
import { createDefaultColorScheme } from '../utils.js';

// Mock the store
vi.mock('../../../store/index.js');

describe('ConnectedProjectHeader', () => {
  const mockUseAppStore = vi.mocked(useAppStore);

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Default store state
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        workspaceRoot: '/path/to/test-project',
        session: {
          id: 'test-session-id',
          model: 'gpt-4o',
          provider: 'openai',
          created: Date.now() - 300000, // 5 minutes ago
        },
        currentModel: 'gpt-4o',
        currentProvider: 'openai',
      };
      return selector(state as any);
    });
  });

  const defaultProps = {
    width: 80,
    colorScheme: createDefaultColorScheme(),
  };

  it('should derive project name from workspace root', () => {
    const { lastFrame } = render(<ConnectedProjectHeader {...defaultProps} />);
    
    expect(lastFrame()).toContain('Test Project');
  });

  it('should display session information from store', () => {
    const { lastFrame } = render(<ConnectedProjectHeader {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('gpt-4o');
    expect(frame).toContain('openai');
    // Should contain some duration (format may vary)
    expect(frame).toMatch(/\d+[ms]/);
  });

  it('should handle missing session gracefully', () => {
    // Mock store with no session
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        workspaceRoot: '/path/to/test-project',
        session: null,
        currentModel: 'gpt-4o',
        currentProvider: 'openai',
      };
      return selector(state as any);
    });

    const { lastFrame } = render(<ConnectedProjectHeader {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('Test Project');
    expect(frame).toContain('gpt-4o');
    expect(frame).toContain('openai');
    expect(frame).toContain('0s'); // Should show 0s duration
  });

  it('should handle different workspace root formats', () => {
    // Test with different workspace root formats
    const testCases = [
      { root: '/path/to/my-awesome-project', expected: 'My Awesome Project' },
      { root: '/home/user/workspace/simple', expected: 'Simple' },
      { root: 'C:\\Users\\Dev\\projects\\windows_project', expected: 'Windows Project' },
      { root: '/current/directory/.', expected: 'Current Directory' },
    ];

    testCases.forEach(({ root, expected }) => {
      mockUseAppStore.mockImplementation((selector) => {
        const state = {
          workspaceRoot: root,
          session: null,
          currentModel: 'gpt-4o',
          currentProvider: 'openai',
        };
        return selector(state as any);
      });

      const { lastFrame } = render(<ConnectedProjectHeader {...defaultProps} />);
      expect(lastFrame()).toContain(expected);
    });
  });

  it('should use session provider over current provider when available', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const state = {
        workspaceRoot: '/path/to/test-project',
        session: {
          id: 'test-session-id',
          model: 'claude-3-sonnet',
          provider: 'anthropic',
          created: Date.now() - 60000, // 1 minute ago
        },
        currentModel: 'gpt-4o',
        currentProvider: 'openai',
      };
      return selector(state as any);
    });

    const { lastFrame } = render(<ConnectedProjectHeader {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('claude-3-sonnet');
    expect(frame).toContain('anthropic');
    expect(frame).not.toContain('gpt-4o');
    expect(frame).not.toContain('openai');
  });
});