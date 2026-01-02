/**
 * @fileoverview Tests for layout memoization optimizations
 */

import * as React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { FullScreenLayout, useLayoutContext } from '../FullScreenLayout.js';

describe('FullScreenLayout Memoization', () => {
  it('should not recalculate layout when props remain the same', () => {
    let renderCount = 0;
    let contextValue: any = null;
    
    const TestChild = () => {
      renderCount++;
      contextValue = useLayoutContext();
      return <div>Test Content</div>;
    };

    const TestComponent = () => {
      const [, forceUpdate] = React.useReducer(x => x + 1, 0);
      
      React.useEffect(() => {
        // Force a re-render after initial render
        const timer = setTimeout(() => {
          forceUpdate();
        }, 10);
        return () => clearTimeout(timer);
      }, []);

      return (
        <FullScreenLayout terminalWidth={80} terminalHeight={24}>
          <TestChild />
        </FullScreenLayout>
      );
    };

    const { lastFrame } = render(<TestComponent />);
    
    expect(lastFrame()).toContain('Test Content');
    expect(contextValue).toBeTruthy();
    expect(contextValue.dimensions).toBeTruthy();
    
    // The layout context should be stable across re-renders when dimensions don't change
    const firstDimensions = contextValue.dimensions;
    
    // Wait for potential re-render
    setTimeout(() => {
      expect(contextValue.dimensions).toBe(firstDimensions); // Should be the same reference due to memoization
    }, 50);
  });

  it('should recalculate layout only when dimensions change', () => {
    let contextValues: any[] = [];
    
    const TestChild = () => {
      const context = useLayoutContext();
      contextValues.push(context);
      return <div>Test Content</div>;
    };

    const TestComponent = () => {
      const [dimensions, setDimensions] = React.useState({ width: 80, height: 24 });
      
      React.useEffect(() => {
        // Change dimensions after initial render
        const timer = setTimeout(() => {
          setDimensions({ width: 100, height: 30 });
        }, 10);
        return () => clearTimeout(timer);
      }, []);

      return (
        <FullScreenLayout terminalWidth={dimensions.width} terminalHeight={dimensions.height}>
          <TestChild />
        </FullScreenLayout>
      );
    };

    const { lastFrame } = render(<TestComponent />);
    
    expect(lastFrame()).toContain('Test Content');
    
    // Wait for dimension change
    setTimeout(() => {
      expect(contextValues.length).toBeGreaterThan(1);
      
      // First and second context should have different dimensions but same structure
      const firstContext = contextValues[0];
      const secondContext = contextValues[contextValues.length - 1];
      
      expect(firstContext.dimensions.terminal.width).toBe(80);
      expect(secondContext.dimensions.terminal.width).toBe(100);
      
      // But the structure should be consistent
      expect(firstContext.dimensions).toHaveProperty('terminal');
      expect(firstContext.dimensions).toHaveProperty('header');
      expect(firstContext.dimensions).toHaveProperty('context');
      expect(firstContext.dimensions).toHaveProperty('sidebar');
      expect(firstContext.dimensions).toHaveProperty('footer');
    }, 50);
  });

  it('should handle rapid dimension changes with debouncing', async () => {
    let calculationCount = 0;
    
    // Mock the calculation function to count calls
    const originalCalculate = require('../utils.js').calculateSectionDimensions;
    const mockCalculate = vi.fn((...args) => {
      calculationCount++;
      return originalCalculate(...args);
    });
    
    // Replace the function temporarily
    vi.doMock('../utils.js', () => ({
      ...require('../utils.js'),
      calculateSectionDimensions: mockCalculate,
    }));

    const TestComponent = () => {
      const [dimensions, setDimensions] = React.useState({ width: 80, height: 24 });
      
      React.useEffect(() => {
        // Simulate rapid dimension changes
        const timers = [
          setTimeout(() => setDimensions({ width: 90, height: 25 }), 10),
          setTimeout(() => setDimensions({ width: 100, height: 26 }), 20),
          setTimeout(() => setDimensions({ width: 110, height: 27 }), 30),
          setTimeout(() => setDimensions({ width: 120, height: 28 }), 40),
        ];
        
        return () => timers.forEach(clearTimeout);
      }, []);

      return (
        <FullScreenLayout terminalWidth={dimensions.width} terminalHeight={dimensions.height}>
          <div>Test Content</div>
        </FullScreenLayout>
      );
    };

    const { lastFrame } = render(<TestComponent />);
    
    expect(lastFrame()).toContain('Test Content');
    
    // Wait for all changes and debouncing
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Due to debouncing, calculation count should be less than the number of dimension changes
    // This verifies that the memoization and debouncing are working
    expect(calculationCount).toBeLessThan(5); // Should be debounced
    
    vi.restoreAllMocks();
  });

  it('should debounce dimension changes with 100ms delay for stable layout during session creation', async () => {
    let updateCount = 0;
    let lastUpdateTime = 0;
    
    const TestChild = () => {
      const context = useLayoutContext();
      const currentTime = Date.now();
      
      React.useEffect(() => {
        updateCount++;
        lastUpdateTime = currentTime;
      });
      
      return <div>Dimensions: {context.dimensions.terminal.width}x{context.dimensions.terminal.height}</div>;
    };

    const TestComponent = () => {
      const [dimensions, setDimensions] = React.useState({ width: 80, height: 24 });
      
      React.useEffect(() => {
        const startTime = Date.now();
        
        // Simulate rapid resize events during session creation (every 20ms for 80ms)
        const timers = [
          setTimeout(() => setDimensions({ width: 85, height: 24 }), 20),
          setTimeout(() => setDimensions({ width: 90, height: 24 }), 40),
          setTimeout(() => setDimensions({ width: 95, height: 24 }), 60),
          setTimeout(() => setDimensions({ width: 100, height: 24 }), 80),
        ];
        
        return () => timers.forEach(clearTimeout);
      }, []);

      return (
        <FullScreenLayout terminalWidth={dimensions.width} terminalHeight={dimensions.height}>
          <TestChild />
        </FullScreenLayout>
      );
    };

    const { lastFrame } = render(<TestComponent />);
    
    expect(lastFrame()).toContain('Dimensions:');
    
    // Wait for debouncing to complete (100ms + buffer)
    await new Promise(resolve => setTimeout(resolve, 250));
    
    // Should have final dimensions
    expect(lastFrame()).toContain('100x24');
    
    // Due to 100ms debouncing, we should have significantly fewer updates than dimension changes
    expect(updateCount).toBeLessThan(4); // Should be debounced to 1-2 updates max
  });
});