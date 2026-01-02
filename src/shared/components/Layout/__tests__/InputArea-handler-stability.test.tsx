/**
 * @fileoverview Test for InputArea useInput handler stability
 * @module shared/components/Layout/__tests__/InputArea-handler-stability
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { InputArea } from '../InputArea.js';

// Mock useInput to track handler registration
const mockUseInput = vi.fn();
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('InputArea useInput Handler Stability', () => {
  beforeEach(() => {
    mockUseInput.mockClear();
  });

  it('should not re-register handler on every render', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    
    const { rerender } = render(
      <InputArea
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        width={80}
        disabled={false}
      />
    );

    // Handler should be registered once
    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const firstHandler = mockUseInput.mock.calls[0][0];

    // Re-render with same props
    rerender(
      <InputArea
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        width={80}
        disabled={false}
      />
    );

    // Handler should still be registered only once (useCallback should prevent re-registration)
    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // The handler function reference should be the same (stable)
    expect(firstHandler).toBe(secondHandler);
  });

  it('should re-register handler only when dependencies change', () => {
    const onChange1 = vi.fn();
    const onChange2 = vi.fn();
    const onSubmit = vi.fn();
    
    const { rerender } = render(
      <InputArea
        value="test1"
        onChange={onChange1}
        onSubmit={onSubmit}
        width={80}
        disabled={false}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const firstHandler = mockUseInput.mock.calls[0][0];

    // Re-render with different onChange (dependency change)
    rerender(
      <InputArea
        value="test2"
        onChange={onChange2}
        onSubmit={onSubmit}
        width={80}
        disabled={false}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // Handler should be different when dependencies change
    expect(firstHandler).not.toBe(secondHandler);
  });

  it('should maintain stable handler when non-dependency props change', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    
    const { rerender } = render(
      <InputArea
        value="test"
        onChange={onChange}
        onSubmit={onSubmit}
        width={80}
        disabled={false}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const firstHandler = mockUseInput.mock.calls[0][0];

    // Re-render with different width (non-dependency)
    rerender(
      <InputArea
        value="test"
        onChange={onChange}
        onSubmit={onSubmit}
        width={100}
        disabled={false}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // Handler should be the same when non-dependencies change
    expect(firstHandler).toBe(secondHandler);
  });
});