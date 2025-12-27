/**
 * @fileoverview Tests for StatusFooter component
 * @module shared/components/Layout/__tests__/StatusFooter
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { StatusFooter } from '../StatusFooter.js';
import { createDefaultColorScheme } from '../utils.js';
import type { SessionTokenCount } from '../../../types/index.js';

describe('StatusFooter', () => {
  const defaultProps = {
    tokenCount: { total: 1500, input: 800, output: 700 } as SessionTokenCount,
    sessionDuration: '5m 30s',
    contextFileCount: 3,
    currentModel: 'gpt-4o',
    connectionStatus: 'connected' as const,
    width: 80,
    colorScheme: createDefaultColorScheme(),
  };

  it('should render with box outline', () => {
    const { lastFrame } = render(<StatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('┌');
    expect(frame).toContain('└');
    expect(frame).toContain('│');
  });

  it('should display token information correctly', () => {
    const { lastFrame } = render(<StatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('1.5K tokens');
    expect(frame).toContain('800 in');
    expect(frame).toContain('700 out');
  });

  it('should display model and connection status', () => {
    const { lastFrame } = render(<StatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('Model: gpt-4o');
    expect(frame).toContain('🟢 Connected');
  });

  it('should display context files and session duration', () => {
    const { lastFrame } = render(<StatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('3 context files');
    expect(frame).toContain('Session: 5m 30s');
  });

  it('should handle zero tokens correctly', () => {
    const props = {
      ...defaultProps,
      tokenCount: { total: 0, input: 0, output: 0 } as SessionTokenCount,
    };
    
    const { lastFrame } = render(<StatusFooter {...props} />);
    
    const frame = lastFrame();
    expect(frame).toContain('No tokens used');
  });

  it('should handle large token counts with K/M formatting', () => {
    const props = {
      ...defaultProps,
      tokenCount: { total: 1500000, input: 800000, output: 700000 } as SessionTokenCount,
    };
    
    const { lastFrame } = render(<StatusFooter {...props} />);
    
    const frame = lastFrame();
    expect(frame).toContain('1.5M tokens');
    expect(frame).toContain('800.0K in');
    expect(frame).toContain('700.0K out');
  });

  it('should handle different connection statuses', () => {
    const disconnectedProps = {
      ...defaultProps,
      connectionStatus: 'disconnected' as const,
    };
    
    const { lastFrame: disconnectedFrame } = render(<StatusFooter {...disconnectedProps} />);
    expect(disconnectedFrame()).toContain('🔴 Disconnected');

    const errorProps = {
      ...defaultProps,
      connectionStatus: 'error' as const,
    };
    
    const { lastFrame: errorFrame } = render(<StatusFooter {...errorProps} />);
    expect(errorFrame()).toContain('🟡 Error');
  });

  it('should handle single context file correctly', () => {
    const props = {
      ...defaultProps,
      contextFileCount: 1,
    };
    
    const { lastFrame } = render(<StatusFooter {...props} />);
    
    const frame = lastFrame();
    expect(frame).toContain('1 context file');
  });

  it('should handle no context files correctly', () => {
    const props = {
      ...defaultProps,
      contextFileCount: 0,
    };
    
    const { lastFrame } = render(<StatusFooter {...props} />);
    
    const frame = lastFrame();
    expect(frame).toContain('No context files');
  });

  it('should respect the specified width', () => {
    const props = {
      ...defaultProps,
      width: 40,
    };
    
    const { lastFrame } = render(<StatusFooter {...props} />);
    
    const frame = lastFrame();
    expect(frame).toBeDefined();
    const lines = frame!.split('\n');
    
    // Check that no line exceeds the specified width
    lines.forEach(line => {
      expect(line.length).toBeLessThanOrEqual(40);
    });
  });

  it('should truncate long text when width is limited', () => {
    const props = {
      ...defaultProps,
      width: 30, // Very narrow width
      currentModel: 'very-long-model-name-that-exceeds-available-space',
    };
    
    const { lastFrame } = render(<StatusFooter {...props} />);
    
    const frame = lastFrame();
    expect(frame).toBeDefined();
    // Should contain truncation indicator
    expect(frame!).toContain('...');
  });

  it('should be exactly 3 content lines high with borders', () => {
    const { lastFrame } = render(<StatusFooter {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toBeDefined();
    const lines = frame!.split('\n').filter(line => line.trim() !== '');
    
    // Should have exactly 5 lines (3 content + 2 border lines)
    expect(lines).toHaveLength(5);
  });
});