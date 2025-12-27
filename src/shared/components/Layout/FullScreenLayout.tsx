/**
 * @fileoverview FullScreenLayout component - Root layout container
 * @module shared/components/Layout/FullScreenLayout
 */

import * as React from 'react';
import { Box, useStdout, Text } from 'ink';
import type { FullScreenLayoutProps, SectionDimensions } from './types.js';
import { 
  createDefaultLayoutConfig, 
  createDefaultColorScheme,
  calculateSectionDimensions,
  getResponsiveLayout,
} from './utils.js';
import { useUILayoutStore } from '../../store/ui-layout.js';

/**
 * Root layout component that manages terminal dimensions and section positioning.
 * 
 * This component serves as the foundation for the full-screen UI upgrade,
 * providing responsive layout management and section coordination.
 * 
 * Features:
 * - Terminal size detection and responsive breakpoints
 * - Layout calculation utilities for section sizing
 * - Terminal resize event handling with debouncing
 * - Graceful degradation for small terminal sizes
 */
export const FullScreenLayout: React.FC<FullScreenLayoutProps> = ({
  children,
  terminalWidth: propTerminalWidth,
  terminalHeight: propTerminalHeight,
  config = createDefaultLayoutConfig(),
  colorScheme = createDefaultColorScheme(),
}) => {
  const { stdout } = useStdout();
  
  // Get layout state from store
  const contextAreaWidth = useUILayoutStore((state) => state.contextAreaWidth);
  const layoutConfig = useUILayoutStore((state) => state.layoutConfig);
  
  // Use provided dimensions or fall back to stdout dimensions
  const terminalWidth = propTerminalWidth || stdout?.columns || 80;
  const terminalHeight = propTerminalHeight || stdout?.rows || 24;
  
  // State for debounced dimensions
  const [debouncedDimensions, setDebouncedDimensions] = React.useState({
    width: terminalWidth,
    height: terminalHeight,
  });
  
  // Debounce resize events to prevent layout thrashing
  const debounceTimeoutRef = React.useRef<NodeJS.Timeout>();
  
  React.useEffect(() => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Set new timeout for debounced update
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedDimensions({
        width: terminalWidth,
        height: terminalHeight,
      });
    }, 100); // 100ms debounce
    
    // Cleanup timeout on unmount
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [terminalWidth, terminalHeight]);
  
  // Calculate section dimensions based on current state
  const sectionDimensions: SectionDimensions = React.useMemo(() => {
    return calculateSectionDimensions(
      debouncedDimensions.width,
      debouncedDimensions.height,
      contextAreaWidth,
      config
    );
  }, [debouncedDimensions.width, debouncedDimensions.height, contextAreaWidth, config]);
  
  // Get responsive layout information
  const responsiveLayout = React.useMemo(() => {
    return getResponsiveLayout(
      debouncedDimensions.width,
      debouncedDimensions.height,
      config.responsiveBreakpoints
    );
  }, [debouncedDimensions.width, debouncedDimensions.height, config.responsiveBreakpoints]);
  
  // Handle minimum size graceful degradation
  const isTerminalTooSmall = React.useMemo(() => {
    return debouncedDimensions.width < 40 || debouncedDimensions.height < 10;
  }, [debouncedDimensions.width, debouncedDimensions.height]);
  
  // If terminal is too small, show a minimal error message
  if (isTerminalTooSmall) {
    return (
      <Box
        flexDirection="column"
        width={debouncedDimensions.width}
        height={debouncedDimensions.height}
        justifyContent="center"
        alignItems="center"
      >
        <Box borderStyle="single" borderColor="red" padding={1}>
          <Box flexDirection="column" alignItems="center">
            <Box marginBottom={1}>
              <Text color="red">⚠️ Terminal Too Small</Text>
            </Box>
            <Box>
              <Text color="gray">Minimum: 40x10</Text>
            </Box>
            <Box>
              <Text color="gray">Current: {debouncedDimensions.width}x{debouncedDimensions.height}</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }
  
  // Provide layout context to children through React context
  const layoutContext = React.useMemo(() => ({
    dimensions: sectionDimensions,
    responsive: responsiveLayout,
    colorScheme,
    config,
  }), [sectionDimensions, responsiveLayout, colorScheme, config]);
  
  return (
    <LayoutContext.Provider value={layoutContext}>
      <Box
        flexDirection="column"
        width={sectionDimensions.terminal.width}
        height={sectionDimensions.terminal.height}
      >
        {children}
      </Box>
    </LayoutContext.Provider>
  );
};

// =============================================================================
// LAYOUT CONTEXT
// =============================================================================

/**
 * Layout context for sharing layout information with child components.
 */
export interface LayoutContextValue {
  dimensions: SectionDimensions;
  responsive: {
    isVertical: boolean;
    isCompact: boolean;
    shouldHideSidebar: boolean;
    shouldMinimizeHeader: boolean;
  };
  colorScheme: ReturnType<typeof createDefaultColorScheme>;
  config: ReturnType<typeof createDefaultLayoutConfig>;
}

export const LayoutContext = React.createContext<LayoutContextValue | null>(null);

/**
 * Hook to access layout context.
 */
export function useLayoutContext(): LayoutContextValue {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutContext must be used within a LayoutContext.Provider');
  }
  return context;
}

export type { FullScreenLayoutProps };