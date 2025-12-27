/**
 * @fileoverview Tests for ResizableDivider component
 */

import * as React from 'react';
import { render } from 'ink-testing-library';
import { vi } from 'vitest';
import { ResizableDivider } from '../ResizableDivider.js';
import { createDefaultColorScheme } from '../utils.js';

describe('ResizableDivider', () => {
  const defaultProps = {
    currentContextWidth: 70,
    minContextWidth: 50,
    maxContextWidth: 90,
    height: 10,
    colorScheme: createDefaultColorScheme(),
    onResize: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render divider with correct height', () => {
    const { lastFrame } = render(
      <ResizableDivider {...defaultProps} />
    );

    const output = lastFrame();
    // Count the number of lines (should match height)
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    expect(lines.length).toBe(defaultProps.height);
  });

  it('should render divider characters', () => {
    const { lastFrame } = render(
      <ResizableDivider {...defaultProps} />
    );

    const output = lastFrame();
    // Should contain divider characters
    expect(output).toMatch(/[│┊]/);
  });

  it('should handle different heights', () => {
    const { lastFrame } = render(
      <ResizableDivider {...defaultProps} height={5} />
    );

    const output = lastFrame();
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    expect(lines.length).toBe(5);
  });

  it('should use provided color scheme', () => {
    const customColorScheme = {
      ...createDefaultColorScheme(),
      colors: {
        ...createDefaultColorScheme().colors,
        divider: 'red',
      },
    };

    const { lastFrame } = render(
      <ResizableDivider 
        {...defaultProps} 
        colorScheme={customColorScheme}
      />
    );

    // Component should render without errors with custom color scheme
    expect(lastFrame()).toBeDefined();
  });

  it('should handle resize constraints', () => {
    const onResize = vi.fn();
    
    render(
      <ResizableDivider 
        {...defaultProps} 
        onResize={onResize}
        minContextWidth={40}
        maxContextWidth={80}
      />
    );

    // Component should render without errors with different constraints
    expect(onResize).not.toHaveBeenCalled(); // No automatic resize on render
  });

  it('should render with minimum required props', () => {
    const minimalProps = {
      currentContextWidth: 60,
      minContextWidth: 50,
      maxContextWidth: 90,
      height: 3,
      onResize: vi.fn(),
    };

    const { lastFrame } = render(
      <ResizableDivider {...minimalProps} />
    );

    expect(lastFrame()).toBeDefined();
    const lines = lastFrame().split('\n').filter(line => line.trim().length > 0);
    expect(lines.length).toBe(3);
  });
});