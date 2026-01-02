/**
 * @fileoverview Unit test for input handler reference stability
 * @module src/test/input-handler-stability
 * 
 * This test verifies that input handlers don't re-register unnecessarily,
 * which is critical for preventing screen flickering during session creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { InputArea } from '../shared/components/Layout/InputArea.js';

// Mock useInput to track handler registration calls
const mockUseInput = vi.fn();

vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('Input Handler Stability', () => {
  beforeEach(() => {
    mockUseInput.mockClear();
  });

  it('should maintain stable handler reference across renders with same props', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    
    const { rerender } = render(
      <InputArea
        value="test input"
        onChange={onChange}
        onSubmit={onSubmit}
        width={80}
        disabled={false}
      />
    );

    // Verify handler is registered once on initial render
    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const initialHandler = mockUseInput.mock.calls[0][0];

    // Re-render with identical props
    rerender(
      <InputArea
        value="test input"
        onChange={onChange}
        onSubmit={onSubmit}
        width={80}
        disabled={false}
      />
    );

    // Handler should be registered again (due to re-render) but with same reference
    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // Critical: Handler reference should be stable (same function reference)
    expect(initialHandler).toBe(secondHandler);
  });

  it('should not re-register handler unnecessarily during multiple renders', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    
    const { rerender } = render(
      <InputArea
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        width={80}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const firstHandler = mockUseInput.mock.calls[0][0];

    // Multiple re-renders with same props
    for (let i = 0; i < 3; i++) {
      rerender(
        <InputArea
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          width={80}
        />
      );
    }

    // Should have been called 4 times total (1 initial + 3 re-renders)
    expect(mockUseInput).toHaveBeenCalledTimes(4);
    
    // All handler references should be the same
    const allHandlers = mockUseInput.mock.calls.map(call => call[0]);
    allHandlers.forEach(handler => {
      expect(handler).toBe(firstHandler);
    });
  });

  it('should create new handler only when dependencies actually change', () => {
    const onChange1 = vi.fn();
    const onChange2 = vi.fn();
    const onSubmit = vi.fn();
    
    const { rerender } = render(
      <InputArea
        value="initial"
        onChange={onChange1}
        onSubmit={onSubmit}
        width={80}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const firstHandler = mockUseInput.mock.calls[0][0];

    // Re-render with different onChange callback (dependency change)
    rerender(
      <InputArea
        value="updated"
        onChange={onChange2}
        onSubmit={onSubmit}
        width={80}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // Handler should be different when dependencies change
    expect(firstHandler).not.toBe(secondHandler);
  });

  it('should maintain handler stability when non-dependency props change', () => {
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

    // Re-render with different width (non-dependency prop)
    rerender(
      <InputArea
        value="test"
        onChange={onChange}
        onSubmit={onSubmit}
        width={120}
        disabled={false}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // Handler should remain stable when non-dependencies change
    expect(firstHandler).toBe(secondHandler);
  });

  it('should handle disabled state changes without unnecessary handler re-registration', () => {
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

    // Re-render with disabled state change (this is a dependency)
    rerender(
      <InputArea
        value="test"
        onChange={onChange}
        onSubmit={onSubmit}
        width={80}
        disabled={true}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // Handler should be different when disabled state changes (it's a dependency)
    expect(firstHandler).not.toBe(secondHandler);
  });
});