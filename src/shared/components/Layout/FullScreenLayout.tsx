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
import {
  safeValidateTerminalDimensions,
  validateLayoutConfig,
  validateSectionDimensions,
  safeLayoutCalculation,
  safeApplyColorScheme,
  detectTerminalColorCapabilities,
  createFallbackColorScheme,
  recoverFromLayoutError,
  TerminalDimensionError,
  LayoutCalculationError,
} from './error-handling.js';
import { logger } from '../../utils/logger.js';
import {
  useDebounce,
  useStableCallback,
  createMemoComponent,
  usePerformanceMonitor,
  useDeepMemo,
} from './performance-optimizations.js';

/**
 * Root layout component that manages terminal dimensions and section positioning.
 * 
 * This component serves as the foundation for the full-screen UI upgrade,
 * providing responsive layout management and section coordination with comprehensive
 * error handling and graceful degradation.
 * 
 * Features:
 * - Terminal size detection and responsive breakpoints
 * - Layout calculation utilities for section sizing
 * - Terminal resize event handling with enhanced debouncing
 * - Graceful degradation for small terminal sizes
 * - Comprehensive error handling and recovery
 * - Fallback color schemes for limited terminals
 * - Layout calculation validation
 * - Performance optimizations with memoization and debouncing
 */
const FullScreenLayoutComponent: React.FC<FullScreenLayoutProps> = ({
  children,
  terminalWidth: propTerminalWidth,
  terminalHeight: propTerminalHeight,
  config = createDefaultLayoutConfig(),
  colorScheme = createDefaultColorScheme(),
}) => {
  const { stdout } = useStdout();
  const { measure } = usePerformanceMonitor('FullScreenLayout', process.env['NODE_ENV'] === 'development');
  
  // Get layout state from store with stable selectors
  const contextAreaWidth = useUILayoutStore((state) => state.contextAreaWidth);
  const layoutConfig = useUILayoutStore((state) => state.layoutConfig);
  
  // Use provided dimensions or fall back to stdout dimensions
  const terminalWidth = propTerminalWidth || stdout?.columns || 80;
  const terminalHeight = propTerminalHeight || stdout?.rows || 24;
  
  // State for debounced dimensions with enhanced debouncing
  const [debouncedDimensions, setDebouncedDimensions] = React.useState({
    width: terminalWidth,
    height: terminalHeight,
  });
  
  // State for error handling
  const [layoutError, setLayoutError] = React.useState<string | null>(null);
  const [layoutWarnings, setLayoutWarnings] = React.useState<string[]>([]);
  const [fallbackMode, setFallbackMode] = React.useState(false);
  
  // Enhanced debounced resize handler with performance optimization and stable reference
  const handleDimensionsChange = React.useCallback((newDimensions: { width: number; height: number }) => {
    measure(() => {
      setDebouncedDimensions(newDimensions);
    });
  }, [measure]);

  // Memoize the debounced function to prevent recreation on every render
  const debouncedSetDimensions = React.useMemo(() => {
    return useDebounce(
      useStableCallback((...args: unknown[]) => {
        const [newDimensions] = args as [{ width: number; height: number }];
        handleDimensionsChange(newDimensions);
      }, [handleDimensionsChange]),
      100, // 100ms debounce delay for stable layout during session creation
      {
        leading: false,
        trailing: true,
        maxWait: 300, // Reduced maximum wait to ensure better responsiveness during session initialization
      }
    );
  }, [handleDimensionsChange]);
  
  // Update dimensions with enhanced debouncing
  React.useEffect(() => {
    debouncedSetDimensions({
      width: terminalWidth,
      height: terminalHeight,
    });
  }, [terminalWidth, terminalHeight, debouncedSetDimensions]);
  
  // Validate and apply color scheme with enhanced memoization to prevent unnecessary recalculations
  const validatedColorScheme = React.useMemo(() => {
    const { colorScheme: validScheme, warnings } = safeApplyColorScheme(colorScheme);
    
    if (warnings.length > 0) {
      setLayoutWarnings(prev => [...prev, ...warnings]);
      logger.warn('Color scheme validation warnings', { warnings });
    }
    
    return validScheme;
  }, [colorScheme]);
  
  // Validate layout configuration with enhanced memoization to prevent unnecessary recalculations
  const configValidation = React.useMemo(() => {
    try {
      validateLayoutConfig(config);
      return { isValid: true, error: null };
    } catch (error) {
      if (error instanceof LayoutCalculationError) {
        const errorMessage = `Layout configuration error: ${error.message}`;
        logger.error('Layout configuration validation failed', { error: error.message, config });
        return { isValid: false, error: errorMessage };
      }
      return { isValid: false, error: 'Unknown configuration error' };
    }
  }, [config]);
  
  // Update layout error based on config validation
  React.useEffect(() => {
    setLayoutError(configValidation.error);
  }, [configValidation.error]);
  
  // Validate terminal dimensions and handle errors with enhanced memoization to prevent unnecessary recalculations
  const terminalValidation = React.useMemo(() => {
    return safeValidateTerminalDimensions(
      debouncedDimensions.width,
      debouncedDimensions.height,
      config
    );
  }, [debouncedDimensions.width, debouncedDimensions.height, config]);
  
  // Calculate section dimensions with enhanced memoization to prevent unnecessary recalculations
  const sectionDimensions: SectionDimensions = React.useMemo(() => {
    return measure(() => {
      // If terminal validation failed, try to recover
      if (!terminalValidation.isValid && terminalValidation.error) {
        const recovery = recoverFromLayoutError(terminalValidation.error);
        
        if (recovery.recovered && recovery.fallbackDimensions) {
          setFallbackMode(true);
          setLayoutWarnings(prev => [...prev, ...recovery.warnings]);
          logger.warn('Using fallback dimensions due to terminal validation failure', {
            error: terminalValidation.error.message,
            warnings: recovery.warnings,
          });
          return recovery.fallbackDimensions;
        } else {
          // Could not recover - use absolute minimum
          setLayoutError(`Terminal validation failed: ${terminalValidation.error.message}`);
          setFallbackMode(true);
          
          return {
            terminal: { width: 40, height: 10 },
            header: { width: 40, height: 1 },
            context: { width: 38, height: 6 },
            sidebar: { width: 0, height: 0 },
            footer: { width: 40, height: 3 },
            isVerticalLayout: true,
            isCompactMode: true,
          };
        }
      }
      
      // Normal calculation with error handling
      const { result: dimensions, error, warnings } = safeLayoutCalculation(
        () => {
          const dims = calculateSectionDimensions(
            debouncedDimensions.width,
            debouncedDimensions.height,
            contextAreaWidth,
            config
          );
          
          // Validate the calculated dimensions
          validateSectionDimensions(dims);
          return dims;
        },
        // Fallback dimensions
        {
          terminal: { width: debouncedDimensions.width, height: debouncedDimensions.height },
          header: { width: debouncedDimensions.width, height: 1 },
          context: { width: Math.max(1, debouncedDimensions.width - 2), height: Math.max(1, debouncedDimensions.height - 4) },
          sidebar: { width: 0, height: 0 },
          footer: { width: debouncedDimensions.width, height: 3 },
          isVerticalLayout: true,
          isCompactMode: true,
        },
        'section dimension calculation'
      );
      
      if (error) {
        setLayoutError(`Layout calculation failed: ${error.message}`);
        setFallbackMode(true);
      }
      
      if (warnings.length > 0) {
        setLayoutWarnings(prev => [...prev, ...warnings]);
      }
      
      return dimensions;
    });
  }, [debouncedDimensions.width, debouncedDimensions.height, contextAreaWidth, config, terminalValidation.isValid, terminalValidation.error, measure]);
  
  // Get responsive layout information with enhanced memoization to prevent unnecessary recalculations
  const responsiveLayout = React.useMemo(() => {
    const { result, error, warnings } = safeLayoutCalculation(
      () => getResponsiveLayout(
        debouncedDimensions.width,
        debouncedDimensions.height,
        config.responsiveBreakpoints
      ),
      // Fallback responsive layout
      {
        isVertical: true,
        isCompact: true,
        shouldHideSidebar: true,
        shouldMinimizeHeader: true,
      },
      'responsive layout calculation'
    );
    
    if (error) {
      logger.warn('Responsive layout calculation failed, using fallback', { error: error.message });
    }
    
    if (warnings.length > 0) {
      setLayoutWarnings(prev => [...prev, ...warnings]);
    }
    
    return result;
  }, [debouncedDimensions.width, debouncedDimensions.height, config.responsiveBreakpoints]);
  
  // Handle minimum size graceful degradation (memoized)
  const isTerminalTooSmall = React.useMemo(() => {
    return debouncedDimensions.width < 40 || debouncedDimensions.height < 10;
  }, [debouncedDimensions.width, debouncedDimensions.height]);
  
  // Clear warnings after a delay with cleanup
  React.useEffect(() => {
    if (layoutWarnings.length > 0) {
      const timer = setTimeout(() => {
        setLayoutWarnings([]);
      }, 10000); // Clear warnings after 10 seconds
      
      return () => clearTimeout(timer);
    }
    
    // Return undefined for the case when there are no warnings
    return undefined;
  }, [layoutWarnings]);
  
  // Provide layout context to children through React context with enhanced memoization to prevent unnecessary recalculations
  const layoutContext = React.useMemo(() => ({
    dimensions: sectionDimensions,
    responsive: responsiveLayout,
    colorScheme: validatedColorScheme,
    config,
    errorState: {
      hasError: Boolean(layoutError),
      error: layoutError,
      warnings: layoutWarnings,
      fallbackMode,
    },
  }), [sectionDimensions, responsiveLayout, validatedColorScheme, config, layoutError, layoutWarnings, fallbackMode]);
  
  // If terminal is too small, show a comprehensive error message
  if (isTerminalTooSmall) {
    const capabilities = detectTerminalColorCapabilities();
    const errorColorScheme = createFallbackColorScheme(capabilities);
    
    return (
      <Box
        flexDirection="column"
        width={debouncedDimensions.width}
        height={debouncedDimensions.height}
        justifyContent="center"
        alignItems="center"
      >
        <Box borderStyle="single" borderColor={errorColorScheme.colors.errorMessage} padding={1}>
          <Box flexDirection="column" alignItems="center">
            <Box marginBottom={1}>
              <Text color={errorColorScheme.colors.errorMessage}>⚠️ Terminal Too Small</Text>
            </Box>
            <Box marginBottom={1}>
              <Text color={errorColorScheme.colors.border}>Minimum: 40x10</Text>
            </Box>
            <Box marginBottom={1}>
              <Text color={errorColorScheme.colors.border}>Current: {debouncedDimensions.width}x{debouncedDimensions.height}</Text>
            </Box>
            {layoutError && (
              <Box marginTop={1}>
                <Text color={errorColorScheme.colors.errorMessage}>Error: {layoutError}</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text color={errorColorScheme.colors.comment}>Please resize your terminal</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }
  
  // Show warnings if in fallback mode
  const showWarnings = fallbackMode && layoutWarnings.length > 0;
  
  return (
    <LayoutContext.Provider value={layoutContext}>
      <Box
        flexDirection="column"
        width={sectionDimensions.terminal.width}
        height={sectionDimensions.terminal.height}
      >
        {/* Show warnings banner if needed */}
        {showWarnings && (
          <Box
            width={sectionDimensions.terminal.width}
            borderStyle="single"
            borderColor={validatedColorScheme.colors.errorMessage}
            marginBottom={1}
          >
            <Box padding={1}>
              <Text color={validatedColorScheme.colors.errorMessage}>
                ⚠️ Layout warnings: {layoutWarnings.slice(-2).join(', ')}
              </Text>
            </Box>
          </Box>
        )}
        
        {/* Main content */}
        {children}
      </Box>
    </LayoutContext.Provider>
  );
};

// Create memoized version of the component for performance
export const FullScreenLayout = createMemoComponent(FullScreenLayoutComponent, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.terminalWidth === nextProps.terminalWidth &&
    prevProps.terminalHeight === nextProps.terminalHeight &&
    prevProps.config === nextProps.config &&
    prevProps.colorScheme === nextProps.colorScheme &&
    prevProps.children === nextProps.children
  );
});

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
  errorState: {
    hasError: boolean;
    error: string | null;
    warnings: string[];
    fallbackMode: boolean;
  };
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