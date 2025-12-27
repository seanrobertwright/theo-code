/**
 * @fileoverview Tests for FullScreenLayout component
 */

import * as React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { FullScreenLayout, useLayoutContext } from '../FullScreenLayout.js';

describe('FullScreenLayout', () => {
  it('should render children in a layout container', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <div>Test Content</div>
      </FullScreenLayout>
    );

    expect(lastFrame()).toContain('Test Content');
  });

  it('should show error message for terminal too small', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={30} terminalHeight={8}>
        <div>Test Content</div>
      </FullScreenLayout>
    );

    expect(lastFrame()).toContain('Terminal Too Small');
    expect(lastFrame()).toContain('Minimum: 40x10');
    expect(lastFrame()).toContain('Current: 30x8');
  });

  it('should provide layout context to children', () => {
    let contextValue: any = null;
    
    const TestChild = () => {
      contextValue = useLayoutContext();
      return <div>Test</div>;
    };

    render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <TestChild />
      </FullScreenLayout>
    );

    expect(contextValue).toBeTruthy();
    expect(contextValue.dimensions).toBeTruthy();
    expect(contextValue.responsive).toBeTruthy();
    expect(contextValue.colorScheme).toBeTruthy();
    expect(contextValue.config).toBeTruthy();
  });

  it('should handle terminal resize with debouncing', async () => {
    const TestComponent = () => {
      const [dimensions, setDimensions] = React.useState({ width: 80, height: 24 });
      
      React.useEffect(() => {
        const timer = setTimeout(() => {
          setDimensions({ width: 120, height: 30 });
        }, 50);
        return () => clearTimeout(timer);
      }, []);

      return (
        <FullScreenLayout terminalWidth={dimensions.width} terminalHeight={dimensions.height}>
          <div>Test Content</div>
        </FullScreenLayout>
      );
    };

    const { lastFrame } = render(<TestComponent />);
    
    // Should render without errors
    expect(lastFrame()).toContain('Test Content');
    
    // Wait for debounced update
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Should still render content after resize
    expect(lastFrame()).toContain('Test Content');
  });
});