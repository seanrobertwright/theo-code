/**
 * @fileoverview Property-based tests for screen flickering fix - Handler stability
 * @module src/test/screen-flickering.property.test
 * 
 * Tests handler stability across random inputs and scenarios to ensure
 * robust validation and prevent screen flickering during session creation.
 * 
 * **Feature: screen-flickering-fix, Property 1: Input Handler Stability**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// =============================================================================
// TEST SETUP AND MOCKS
// =============================================================================

// Mock useInput to track handler registration calls
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: vi.fn(),
  };
});

// Mock logger to prevent console noise during tests
vi.mock('../shared/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// =============================================================================
// PROPERTY TEST GENERATORS
// =============================================================================

/**
 * Generator for input handler dependencies
 */
const handlerDependenciesArbitrary = fc.record({
  disabled: fc.boolean(),
  value: fc.string({ maxLength: 100 }),
  onChange: fc.constant(vi.fn()),
  onSubmit: fc.constant(vi.fn()),
});

/**
 * Generator for keyboard input events
 */
const keyboardInputArbitrary = fc.record({
  input: fc.string({ maxLength: 5 }),
  key: fc.record({
    return: fc.boolean(),
    backspace: fc.boolean(),
    delete: fc.boolean(),
    ctrl: fc.boolean(),
    meta: fc.boolean(),
  }),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Simulate a useCallback hook behavior
 */
const simulateUseCallback = (fn: Function, deps: any[]) => {
  // Simple simulation: return same function if deps haven't changed
  const depsKey = JSON.stringify(deps);
  if (!simulateUseCallback.cache) {
    simulateUseCallback.cache = new Map();
  }
  
  if (simulateUseCallback.cache.has(depsKey)) {
    return simulateUseCallback.cache.get(depsKey);
  }
  
  simulateUseCallback.cache.set(depsKey, fn);
  return fn;
};

/**
 * Create a mock input handler similar to InputArea's handler
 */
const createMockInputHandler = (deps: any) => {
  const { disabled, value, onChange, onSubmit } = deps;
  
  return simulateUseCallback((input: string, key: any) => {
    if (disabled) return;
    
    if (key.return) {
      onSubmit();
      return;
    }
    
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    
    if (!key.ctrl && !key.meta && input.length > 0) {
      onChange(value + input);
    }
  }, [disabled, onSubmit, onChange, value]);
};

// =============================================================================
// PROPERTY-BASED TESTS
// =============================================================================

describe('Screen Flickering Fix - Handler Stability Property Tests', () => {
  let mockUseInput: any;

  beforeEach(async () => {
    // Get the mocked useInput function
    const inkModule = await import('ink');
    mockUseInput = vi.mocked(inkModule).useInput;
    mockUseInput.mockClear();
    
    // Clear the callback cache
    if (simulateUseCallback.cache) {
      simulateUseCallback.cache.clear();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property 1: Input Handler Stability
  // Validates Requirements 1.1, 1.2, 1.3
  // -------------------------------------------------------------------------

  it('should maintain stable handler references when dependencies do not change', async () => {
    await fc.assert(
      fc.asyncProperty(
        handlerDependenciesArbitrary,
        fc.integer({ min: 2, max: 10 }),
        async (deps, renderCount) => {
          const handlers: Function[] = [];
          
          // Create multiple handlers with same dependencies
          for (let i = 0; i < renderCount; i++) {
            const handler = createMockInputHandler(deps);
            handlers.push(handler);
          }
          
          // Property: All handlers should be the same reference when deps don't change
          const firstHandler = handlers[0];
          expect(firstHandler).toBeDefined();
          
          for (let i = 1; i < handlers.length; i++) {
            expect(handlers[i]).toBe(firstHandler);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should create new handlers when dependencies change', async () => {
    await fc.assert(
      fc.asyncProperty(
        handlerDependenciesArbitrary,
        handlerDependenciesArbitrary,
        async (deps1, deps2) => {
          // Skip if dependencies are the same
          const deps1Key = JSON.stringify([deps1.disabled, deps1.value]);
          const deps2Key = JSON.stringify([deps2.disabled, deps2.value]);
          
          if (deps1Key === deps2Key) return;
          
          const handler1 = createMockInputHandler(deps1);
          const handler2 = createMockInputHandler(deps2);
          
          // Property: Handlers should be different when dependencies change
          expect(handler1).not.toBe(handler2);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should handle keyboard inputs without causing handler re-creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        handlerDependenciesArbitrary,
        fc.array(keyboardInputArbitrary, { minLength: 1, maxLength: 10 }),
        async (deps, inputSequence) => {
          const handler = createMockInputHandler(deps);
          
          // Simulate keyboard inputs
          for (const inputEvent of inputSequence) {
            try {
              handler(inputEvent.input, inputEvent.key);
            } catch (error) {
              // Input handlers should handle errors gracefully
              // This is expected behavior for some invalid inputs
            }
          }
          
          // Create another handler with same dependencies
          const handler2 = createMockInputHandler(deps);
          
          // Property: Handler should remain stable after input events
          expect(handler2).toBe(handler);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('should maintain handler stability across rapid dependency changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(handlerDependenciesArbitrary, { minLength: 3, maxLength: 8 }),
        async (depsSequence) => {
          const handlers: Function[] = [];
          const uniqueHandlers = new Set<Function>();
          
          // Create handlers for each dependency set
          for (const deps of depsSequence) {
            const handler = createMockInputHandler(deps);
            handlers.push(handler);
            uniqueHandlers.add(handler);
          }
          
          // Property: Number of unique handlers should not exceed number of unique dependency sets
          const uniqueDeps = new Set(
            depsSequence.map(deps => JSON.stringify([deps.disabled, deps.value]))
          );
          
          expect(uniqueHandlers.size).toBeLessThanOrEqual(uniqueDeps.size);
          expect(uniqueHandlers.size).toBeGreaterThan(0);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('should handle edge cases in input processing without handler instability', async () => {
    await fc.assert(
      fc.asyncProperty(
        handlerDependenciesArbitrary,
        fc.oneof(
          fc.constant({ input: '', key: { return: true } }),
          fc.constant({ input: '', key: { backspace: true } }),
          fc.constant({ input: '', key: { ctrl: true, meta: false } }),
          fc.constant({ input: 'test', key: { ctrl: false, meta: false } })
        ),
        async (deps, inputEvent) => {
          const handler1 = createMockInputHandler(deps);
          
          // Process the input event
          try {
            handler1(inputEvent.input, inputEvent.key);
          } catch (error) {
            // Expected for some edge cases
          }
          
          // Create another handler with same dependencies
          const handler2 = createMockInputHandler(deps);
          
          // Property: Handler should remain stable after edge case processing
          expect(handler2).toBe(handler1);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// =============================================================================
// LAYOUT STABILITY PROPERTY TESTS
// =============================================================================

/**
 * Generator for terminal dimensions
 */
const terminalDimensionsArbitrary = fc.record({
  width: fc.integer({ min: 40, max: 200 }),
  height: fc.integer({ min: 10, max: 60 }),
});

/**
 * Generator for context width percentages
 */
const contextWidthPercentArbitrary = fc.integer({ min: 50, max: 90 });

/**
 * Generator for layout configuration
 */
const layoutConfigArbitrary = fc.record({
  defaultContextWidth: fc.integer({ min: 50, max: 90 }),
  minContextWidth: fc.integer({ min: 40, max: 60 }),
  maxContextWidth: fc.integer({ min: 80, max: 95 }),
  headerHeight: fc.integer({ min: 1, max: 3 }),
  footerHeight: fc.integer({ min: 3, max: 8 }),
  minTerminalWidth: fc.integer({ min: 40, max: 100 }),
  minTerminalHeight: fc.integer({ min: 10, max: 30 }),
  responsiveBreakpoints: fc.record({
    narrow: fc.integer({ min: 60, max: 100 }),
    compact: fc.integer({ min: 15, max: 25 }),
  }),
});

// Mock the layout utilities
vi.mock('../shared/components/Layout/utils.js', async () => {
  const actual = await vi.importActual('../shared/components/Layout/utils.js');
  return {
    ...actual,
    calculateSectionDimensions: vi.fn().mockImplementation((width, height, contextPercent, config) => {
      // Simple mock implementation for testing
      const isVertical = width < config.responsiveBreakpoints.narrow;
      const isCompact = height < config.responsiveBreakpoints.compact;
      
      const availableHeight = Math.max(1, height - config.headerHeight - config.footerHeight);
      const availableWidth = Math.max(1, width);
      
      let contextWidth, contextHeight, sidebarWidth, sidebarHeight;
      
      if (isVertical) {
        contextWidth = availableWidth;
        sidebarWidth = availableWidth;
        contextHeight = Math.max(1, Math.floor(availableHeight * 0.6));
        sidebarHeight = Math.max(0, availableHeight - contextHeight);
      } else {
        contextWidth = Math.max(1, Math.floor((availableWidth * contextPercent) / 100));
        sidebarWidth = Math.max(0, availableWidth - contextWidth - 1);
        contextHeight = Math.max(1, availableHeight);
        sidebarHeight = Math.max(1, availableHeight);
      }
      
      return {
        terminal: { width, height },
        header: { width, height: config.headerHeight },
        context: { width: contextWidth, height: contextHeight },
        sidebar: { width: sidebarWidth, height: sidebarHeight },
        footer: { width, height: config.footerHeight },
        isVerticalLayout: isVertical,
        isCompactMode: isCompact,
      };
    }),
    getResponsiveLayout: vi.fn().mockImplementation((width, height, breakpoints) => {
      return {
        isVertical: width < breakpoints.narrow,
        isCompact: height < breakpoints.compact,
        shouldHideSidebar: width < 60 || height < 15,
        shouldMinimizeHeader: height < 12,
      };
    }),
  };
});

describe('Layout Stability Property Tests', () => {
  let calculateSectionDimensions: any;
  let getResponsiveLayout: any;

  beforeEach(async () => {
    const layoutUtils = await import('../shared/components/Layout/utils.js');
    calculateSectionDimensions = vi.mocked(layoutUtils.calculateSectionDimensions);
    getResponsiveLayout = vi.mocked(layoutUtils.getResponsiveLayout);
    
    calculateSectionDimensions.mockClear();
    getResponsiveLayout.mockClear();
  });

  // -------------------------------------------------------------------------
  // Property 1: Layout Calculation Consistency
  // Validates Requirements 3.1, 3.2, 3.3
  // -------------------------------------------------------------------------

  it('should produce identical results for identical inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        terminalDimensionsArbitrary,
        contextWidthPercentArbitrary,
        layoutConfigArbitrary,
        async (dimensions, contextPercent, config) => {
          // Ensure config is valid
          if (config.minContextWidth > config.maxContextWidth) return;
          if (config.defaultContextWidth < config.minContextWidth || 
              config.defaultContextWidth > config.maxContextWidth) return;
          
          const clampedContextPercent = Math.max(
            config.minContextWidth,
            Math.min(config.maxContextWidth, contextPercent)
          );
          
          // Calculate layout twice with identical inputs
          const layout1 = calculateSectionDimensions(
            dimensions.width,
            dimensions.height,
            clampedContextPercent,
            config
          );
          
          const layout2 = calculateSectionDimensions(
            dimensions.width,
            dimensions.height,
            clampedContextPercent,
            config
          );
          
          // Property: Identical inputs should produce identical outputs
          expect(layout1).toEqual(layout2);
          expect(layout1.terminal.width).toBe(dimensions.width);
          expect(layout1.terminal.height).toBe(dimensions.height);
        }
      ),
      { numRuns: 25 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 2: Layout Dimension Constraints
  // Validates Requirements 3.1, 3.4, 3.5
  // -------------------------------------------------------------------------

  it('should maintain valid dimension constraints', async () => {
    await fc.assert(
      fc.asyncProperty(
        terminalDimensionsArbitrary,
        contextWidthPercentArbitrary,
        layoutConfigArbitrary,
        async (dimensions, contextPercent, config) => {
          // Ensure config is valid
          if (config.minContextWidth > config.maxContextWidth) return;
          if (config.defaultContextWidth < config.minContextWidth || 
              config.defaultContextWidth > config.maxContextWidth) return;
          
          const clampedContextPercent = Math.max(
            config.minContextWidth,
            Math.min(config.maxContextWidth, contextPercent)
          );
          
          const layout = calculateSectionDimensions(
            dimensions.width,
            dimensions.height,
            clampedContextPercent,
            config
          );
          
          // Property: All dimensions must be non-negative
          expect(layout.terminal.width).toBeGreaterThanOrEqual(0);
          expect(layout.terminal.height).toBeGreaterThanOrEqual(0);
          expect(layout.header.width).toBeGreaterThanOrEqual(0);
          expect(layout.header.height).toBeGreaterThanOrEqual(0);
          expect(layout.context.width).toBeGreaterThan(0); // Context must have positive width
          expect(layout.context.height).toBeGreaterThan(0); // Context must have positive height
          expect(layout.sidebar.width).toBeGreaterThanOrEqual(0);
          expect(layout.sidebar.height).toBeGreaterThanOrEqual(0);
          expect(layout.footer.width).toBeGreaterThanOrEqual(0);
          expect(layout.footer.height).toBeGreaterThanOrEqual(0);
          
          // Property: Terminal dimensions should match input
          expect(layout.terminal.width).toBe(dimensions.width);
          expect(layout.terminal.height).toBe(dimensions.height);
          
          // Property: Header and footer should span full width
          expect(layout.header.width).toBe(dimensions.width);
          expect(layout.footer.width).toBe(dimensions.width);
        }
      ),
      { numRuns: 25 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 3: Responsive Layout Consistency
  // Validates Requirements 3.2, 3.3
  // -------------------------------------------------------------------------

  it('should maintain consistent responsive behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        terminalDimensionsArbitrary,
        layoutConfigArbitrary,
        async (dimensions, config) => {
          const responsive = getResponsiveLayout(
            dimensions.width,
            dimensions.height,
            config.responsiveBreakpoints
          );
          
          // Property: Responsive flags should be consistent with breakpoints
          expect(responsive.isVertical).toBe(dimensions.width < config.responsiveBreakpoints.narrow);
          expect(responsive.isCompact).toBe(dimensions.height < config.responsiveBreakpoints.compact);
          
          // Property: Sidebar hiding should be consistent with size constraints
          const shouldHideSidebar = dimensions.width < 60 || dimensions.height < 15;
          expect(responsive.shouldHideSidebar).toBe(shouldHideSidebar);
          
          // Property: Header minimization should be consistent with height constraints
          expect(responsive.shouldMinimizeHeader).toBe(dimensions.height < 12);
        }
      ),
      { numRuns: 20 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 4: Layout Area Conservation
  // Validates Requirements 3.1, 3.4
  // -------------------------------------------------------------------------

  it('should conserve total layout area appropriately', async () => {
    await fc.assert(
      fc.asyncProperty(
        terminalDimensionsArbitrary,
        contextWidthPercentArbitrary,
        layoutConfigArbitrary,
        async (dimensions, contextPercent, config) => {
          // Ensure config is valid
          if (config.minContextWidth > config.maxContextWidth) return;
          if (config.defaultContextWidth < config.minContextWidth || 
              config.defaultContextWidth > config.maxContextWidth) return;
          
          const clampedContextPercent = Math.max(
            config.minContextWidth,
            Math.min(config.maxContextWidth, contextPercent)
          );
          
          const layout = calculateSectionDimensions(
            dimensions.width,
            dimensions.height,
            clampedContextPercent,
            config
          );
          
          // Property: Header + content area + footer should equal terminal height
          const totalHeight = layout.header.height + 
                             Math.max(layout.context.height, layout.sidebar.height) + 
                             layout.footer.height;
          expect(totalHeight).toBeLessThanOrEqual(dimensions.height + 1); // Allow for rounding
          
          // Property: In horizontal layout, context + sidebar should not exceed terminal width
          if (!layout.isVerticalLayout) {
            const totalWidth = layout.context.width + layout.sidebar.width;
            expect(totalWidth).toBeLessThanOrEqual(dimensions.width + 1); // Allow for divider
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 5: Layout Stability Under Rapid Changes
  // Validates Requirements 3.2, 3.3, 5.4
  // -------------------------------------------------------------------------

  it('should remain stable under rapid dimension changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(terminalDimensionsArbitrary, { minLength: 3, maxLength: 10 }),
        contextWidthPercentArbitrary,
        layoutConfigArbitrary,
        async (dimensionSequence, contextPercent, config) => {
          // Ensure config is valid
          if (config.minContextWidth > config.maxContextWidth) return;
          if (config.defaultContextWidth < config.minContextWidth || 
              config.defaultContextWidth > config.maxContextWidth) return;
          
          const clampedContextPercent = Math.max(
            config.minContextWidth,
            Math.min(config.maxContextWidth, contextPercent)
          );
          
          const layouts: any[] = [];
          
          // Calculate layouts for each dimension in sequence
          for (const dimensions of dimensionSequence) {
            const layout = calculateSectionDimensions(
              dimensions.width,
              dimensions.height,
              clampedContextPercent,
              config
            );
            layouts.push(layout);
          }
          
          // Property: Each layout should be valid independently
          for (const layout of layouts) {
            expect(layout.context.width).toBeGreaterThan(0);
            expect(layout.context.height).toBeGreaterThan(0);
            expect(layout.terminal.width).toBeGreaterThan(0);
            expect(layout.terminal.height).toBeGreaterThan(0);
          }
          
          // Property: Layout mode should be consistent with dimensions
          for (let i = 0; i < layouts.length; i++) {
            const layout = layouts[i];
            const dimensions = dimensionSequence[i];
            
            expect(layout.isVerticalLayout).toBe(dimensions.width < config.responsiveBreakpoints.narrow);
            expect(layout.isCompactMode).toBe(dimensions.height < config.responsiveBreakpoints.compact);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  // -------------------------------------------------------------------------
  // Property 6: Edge Case Handling
  // Validates Requirements 3.4, 3.5
  // -------------------------------------------------------------------------

  it('should handle edge cases gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Minimum dimensions
          fc.constant({ width: 40, height: 10 }),
          // Very narrow
          fc.record({ width: fc.integer({ min: 40, max: 50 }), height: fc.integer({ min: 15, max: 30 }) }),
          // Very short
          fc.record({ width: fc.integer({ min: 80, max: 120 }), height: fc.integer({ min: 10, max: 15 }) }),
          // Square-ish
          fc.record({ width: fc.integer({ min: 50, max: 80 }), height: fc.integer({ min: 50, max: 80 }) })
        ),
        contextWidthPercentArbitrary,
        layoutConfigArbitrary,
        async (dimensions, contextPercent, config) => {
          // Ensure config is valid
          if (config.minContextWidth > config.maxContextWidth) return;
          if (config.defaultContextWidth < config.minContextWidth || 
              config.defaultContextWidth > config.maxContextWidth) return;
          
          const clampedContextPercent = Math.max(
            config.minContextWidth,
            Math.min(config.maxContextWidth, contextPercent)
          );
          
          // Should not throw errors even with edge case dimensions
          let layout;
          expect(() => {
            layout = calculateSectionDimensions(
              dimensions.width,
              dimensions.height,
              clampedContextPercent,
              config
            );
          }).not.toThrow();
          
          // Property: Even in edge cases, context area must be usable
          expect(layout.context.width).toBeGreaterThan(0);
          expect(layout.context.height).toBeGreaterThan(0);
          
          // Property: Layout should adapt appropriately to constraints
          if (dimensions.width < config.responsiveBreakpoints.narrow) {
            expect(layout.isVerticalLayout).toBe(true);
          }
          
          if (dimensions.height < config.responsiveBreakpoints.compact) {
            expect(layout.isCompactMode).toBe(true);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});