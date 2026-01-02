/**
 * @fileoverview Integration test for input handler error boundaries
 * @module shared/components/Layout/__tests__/input-error-integration
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InputArea } from '../InputArea.js';

// Mock Ink components
vi.mock('ink', () => ({
  Box: ({ children }: { children: React.ReactNode }) => <div data-testid="box">{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span data-testid="text">{children}</span>,
  useInput: vi.fn(),
}));

describe('Input Handler Error Boundaries Integration', () => {
  it('should render InputArea without crashing when error boundaries are applied', () => {
    const mockOnChange = vi.fn();
    const mockOnSubmit = vi.fn();

    expect(() => {
      render(
        <InputArea
          value="test"
          onChange={mockOnChange}
          onSubmit={mockOnSubmit}
          width={80}
        />
      );
    }).not.toThrow();
  });

  it('should handle props correctly even with error boundaries', () => {
    const mockOnChange = vi.fn();
    const mockOnSubmit = vi.fn();

    const { getByTestId } = render(
      <InputArea
        value="test input"
        onChange={mockOnChange}
        onSubmit={mockOnSubmit}
        width={80}
        disabled={false}
      />
    );

    // Should render without errors
    expect(getByTestId('box')).toBeDefined();
  });

  it('should handle disabled state correctly with error boundaries', () => {
    const mockOnChange = vi.fn();
    const mockOnSubmit = vi.fn();

    const { getByTestId } = render(
      <InputArea
        value="test input"
        onChange={mockOnChange}
        onSubmit={mockOnSubmit}
        width={80}
        disabled={true}
      />
    );

    // Should render without errors even when disabled
    expect(getByTestId('box')).toBeDefined();
  });
});