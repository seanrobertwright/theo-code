/**
 * @fileoverview Tests for ConnectedStatusFooter component
 * @module shared/components/Layout/__tests__/ConnectedStatusFooter
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectedStatusFooter } from '../ConnectedStatusFooter.js';
import { useAppStore } from '../../../store/index.js';
import { createDefaultColorScheme } from '../utils.js';

// Mock the store
vi.mock('../../../store/index.js');
const mockUseAppStore = vi.mocked(useAppStore);

describe('ConnectedStatusFooter', () => {
  const defaultProps = {
    width: 80,
    colorScheme: createDefaultColorScheme(),
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default store state
    mockUseAppStore.mockImplementation((selector) => {
      const mockState = {
        session: {
          created: Date.now() - 330000, // 5.5 minutes ago
          tokenCount: { total: 1500, input: 800, output: 700 },
        },
        currentModel: 'gpt-4o',
        isStreaming: false,
        error: null,
        contextFiles: new Map([
          ['file1.ts', 'content1'],
          ['file2.ts', 'content2'],
          ['file3.ts', 'content3'],
        ]),
      };
      
      return selector(mockState as any);
    });
  });

  it('should render with data from store', () => {
    const { lastFrame } = render(<ConnectedStatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('1.5K tokens');
    expect(frame).toContain('Model: gpt-4o');
    expect(frame).toContain('🟢 Connected');
    expect(frame).toContain('3 context files');
    expect(frame).toContain('Session:');
  });

  it('should show disconnected status when no session', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const mockState = {
        session: null,
        currentModel: 'gpt-4o',
        isStreaming: false,
        error: null,
        contextFiles: new Map(),
      };
      
      return selector(mockState as any);
    });

    const { lastFrame } = render(<ConnectedStatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('🔴 Disconnected');
    expect(frame).toContain('No tokens used');
    expect(frame).toContain('No context files');
  });

  it('should show error status when there is an error', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const mockState = {
        session: {
          created: Date.now() - 60000,
          tokenCount: { total: 100, input: 50, output: 50 },
        },
        currentModel: 'gpt-4o',
        isStreaming: false,
        error: 'Connection failed',
        contextFiles: new Map(),
      };
      
      return selector(mockState as any);
    });

    const { lastFrame } = render(<ConnectedStatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('🟡 Error');
  });

  it('should handle missing token count gracefully', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const mockState = {
        session: {
          created: Date.now() - 60000,
          // No tokenCount property
        },
        currentModel: 'gpt-4o',
        isStreaming: false,
        error: null,
        contextFiles: new Map(),
      };
      
      return selector(mockState as any);
    });

    const { lastFrame } = render(<ConnectedStatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('No tokens used');
  });

  it('should format session duration correctly', () => {
    const now = Date.now();
    mockUseAppStore.mockImplementation((selector) => {
      const mockState = {
        session: {
          created: now - 3900000, // 65 minutes ago (1h 5m)
          tokenCount: { total: 0, input: 0, output: 0 },
        },
        currentModel: 'gpt-4o',
        isStreaming: false,
        error: null,
        contextFiles: new Map(),
      };
      
      return selector(mockState as any);
    });

    const { lastFrame } = render(<ConnectedStatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    // Should show hours and minutes
    expect(frame).toMatch(/1h \d+m/);
  });

  it('should handle streaming state', () => {
    mockUseAppStore.mockImplementation((selector) => {
      const mockState = {
        session: {
          created: Date.now() - 60000,
          tokenCount: { total: 100, input: 50, output: 50 },
        },
        currentModel: 'gpt-4o',
        isStreaming: true,
        error: null,
        contextFiles: new Map(),
      };
      
      return selector(mockState as any);
    });

    const { lastFrame } = render(<ConnectedStatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('🟢 Connected'); // Should still show connected when streaming
  });
});