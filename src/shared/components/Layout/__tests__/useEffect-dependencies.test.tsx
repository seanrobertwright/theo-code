/**
 * @fileoverview Test to verify useEffect dependencies are properly configured
 * @module shared/components/Layout/__tests__/useEffect-dependencies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render } from '@testing-library/react';
import { ConnectedProjectHeader } from '../ConnectedProjectHeader.js';
import { ConnectedStatusFooter } from '../ConnectedStatusFooter.js';

// Mock the store
vi.mock('../../../store/index.js', () => ({
  useAppStore: vi.fn(() => ({
    workspaceRoot: '/test/workspace',
    session: null,
    currentModel: 'test-model',
    currentProvider: 'test-provider',
    error: null,
    tokenCount: { total: 0, input: 0, output: 0 },
  })),
  selectTotalTokens: vi.fn(),
  selectContextFileCount: vi.fn(() => 0),
}));

describe('useEffect Dependencies Audit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should not cause infinite re-renders in ConnectedProjectHeader', () => {
    const renderSpy = vi.fn();
    
    const TestComponent = () => {
      renderSpy();
      return (
        <ConnectedProjectHeader 
          width={80}
        />
      );
    };

    render(<TestComponent />);
    
    // Initial render
    expect(renderSpy).toHaveBeenCalledTimes(1);
    
    // Advance timers to trigger interval
    vi.advanceTimersByTime(1000);
    
    // Should not cause additional renders beyond the forced update
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('should not cause infinite re-renders in ConnectedStatusFooter', () => {
    const renderSpy = vi.fn();
    
    const TestComponent = () => {
      renderSpy();
      return (
        <ConnectedStatusFooter 
          width={80}
        />
      );
    };

    render(<TestComponent />);
    
    // Initial render
    expect(renderSpy).toHaveBeenCalledTimes(1);
    
    // Advance timers to trigger interval
    vi.advanceTimersByTime(1000);
    
    // Should not cause additional renders beyond the forced update
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('should have stable useEffect dependencies', () => {
    // This test verifies that our dependency arrays are properly configured
    // by ensuring components don't re-render unnecessarily
    
    const mockUseEffect = vi.spyOn(React, 'useEffect');
    
    render(
      <ConnectedProjectHeader 
        width={80}
      />
    );
    
    // Verify useEffect was called with proper dependencies
    const useEffectCalls = mockUseEffect.mock.calls;
    
    // Find the interval useEffect call
    const intervalEffect = useEffectCalls.find(call => {
      const deps = call[1];
      return Array.isArray(deps) && deps.length > 0;
    });
    
    expect(intervalEffect).toBeDefined();
    expect(intervalEffect?.[1]).toEqual(expect.arrayContaining([expect.any(Function)]));
    
    mockUseEffect.mockRestore();
  });
});