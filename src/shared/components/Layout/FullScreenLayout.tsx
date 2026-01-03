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

function parseNonNegativeInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

export function getTerminalSafetyRows(): number {
  const override = parseNonNegativeInt(process.env['THEO_UI_SAFETY_ROWS']);
  if (override !== undefined) {
    return override;
  }

  if (process.env['VITEST'] || process.env['NODE_ENV'] === 'test') {
    return 0;
  }

  const isWindowsTerminal =
    process.platform === 'win32' &&
    (process.env['WT_SESSION'] !== undefined || process.env['TERM_PROGRAM'] === 'Windows_Terminal');
  if (isWindowsTerminal) {
    return 2;
  }

  return 1;
}

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
  const { measure } = usePerformanceMonitor('FullScreenLayout', false); // Disabled logging to prevent flickering
  
  // Get layout state from store with stable selectors
  const contextAreaWidth = useUILayoutStore((state) => state.contextAreaWidth);
  const layoutConfig = useUILayoutStore((state) => state.layoutConfig);
  
  // Use provided dimensions or fall back to stdout dimensions
  const terminalWidth = propTerminalWidth || stdout?.columns || 80;
  const terminalHeight = propTerminalHeight || stdout?.rows || 24;
  const terminalSafetyRows = React.useMemo(() => getTerminalSafetyRows(), []);
  
  // State for debounced dimensions with enhanced debouncing
  const [debouncedDimensions, setDebouncedDimensions] = React.useState({
    width: terminalWidth,
    height: terminalHeight,
  });
  
  // Enhanced debounced resize handler with performance optimization and stable reference
  const handleDimensionsChange = React.useCallback((newDimensions: { width: number; height: number }) => {
    measure(() => {
      setDebouncedDimensions(newDimensions);
    });
  }, [measure]);

  // Debounce resize updates to avoid rapid redraws during initialization / resize.
  // Note: `useDebounce` and `useStableCallback` are hooks and must be called at the top level.
  const stableSetDimensions = useStableCallback((...args: unknown[]) => {
    const [newDimensions] = args as [{ width: number; height: number }];
    handleDimensionsChange(newDimensions);
  }, [handleDimensionsChange]);

  const debouncedSetDimensions = useDebounce(stableSetDimensions, 100, {
    leading: false,
    trailing: true,
    maxWait: 300, // Reduced maximum wait to ensure better responsiveness during session initialization
  });
  
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
      logger.warn('Color scheme validation warnings', { warnings });
    }
    
    return { scheme: validScheme, warnings };
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
  
  // Validate terminal dimensions and handle errors with enhanced memoization to prevent unnecessary recalculations
  const terminalValidation = React.useMemo(() => {
    return safeValidateTerminalDimensions(
      debouncedDimensions.width,
      debouncedDimensions.height,
      config
    );
  }, [debouncedDimensions.width, debouncedDimensions.height, config]);

  const safeTerminalHeight = React.useMemo(() => {
    return Math.max(1, debouncedDimensions.height - terminalSafetyRows);
  }, [debouncedDimensions.height, terminalSafetyRows]);
  
  // Calculate section dimensions with enhanced memoization to prevent unnecessary recalculations
  // Returns dimensions AND error/fallback state to avoid side effects in useMemo
  const layoutCalculation = React.useMemo(() => {
    return measure(() => {
      let currentError: string | null = null;
      let currentWarnings: string[] = [];
      let isFallback = false;
      let resultDimensions: SectionDimensions;

      // If terminal validation failed, try to recover
      if (!terminalValidation.isValid && terminalValidation.error) {
        const recovery = recoverFromLayoutError(terminalValidation.error);
        
        if (recovery.recovered && recovery.fallbackDimensions) {
          isFallback = true;
          currentWarnings.push(...recovery.warnings);
          logger.warn('Using fallback dimensions due to terminal validation failure', {
            error: terminalValidation.error.message,
            warnings: recovery.warnings,
          });
          resultDimensions = recovery.fallbackDimensions;
        } else {
          // Could not recover - use absolute minimum
          currentError = `Terminal validation failed: ${terminalValidation.error.message}`;
          isFallback = true;
          
          resultDimensions = {
            terminal: { width: 40, height: 10 },
            header: { width: 40, height: 1 },
            context: { width: 38, height: 6 },
            sidebar: { width: 0, height: 0 },
            footer: { width: 40, height: 3 },
            isVerticalLayout: true,
            isCompactMode: true,
          };
        }
      } else {
         // Normal calculation with error handling
         const { result: dimensions, error, warnings } = safeLayoutCalculation(
           () => {
             const dims = calculateSectionDimensions(
               debouncedDimensions.width,
               safeTerminalHeight,
               contextAreaWidth,
               config
             );
             
             // Validate the calculated dimensions
             validateSectionDimensions(dims);
            return dims;
           },
           // Fallback dimensions
           {
             terminal: { width: debouncedDimensions.width, height: safeTerminalHeight },
             header: { width: debouncedDimensions.width, height: 1 },
             context: { width: Math.max(1, debouncedDimensions.width - 2), height: Math.max(1, safeTerminalHeight - 4) },
             sidebar: { width: 0, height: 0 },
             footer: { width: debouncedDimensions.width, height: 3 },
             isVerticalLayout: true,
             isCompactMode: true,
           },
           'section dimension calculation'
         );
        
        if (error) {
          currentError = `Layout calculation failed: ${error.message}`;
          isFallback = true;
        }
        
        if (warnings.length > 0) {
          currentWarnings.push(...warnings);
        }
        
        resultDimensions = dimensions;
      }
      
      return {
        dimensions: resultDimensions,
        error: currentError,
        warnings: currentWarnings,
        fallbackMode: isFallback
      };
    });
  }, [debouncedDimensions.width, safeTerminalHeight, contextAreaWidth, config, terminalValidation.isValid, terminalValidation.error, measure]);
  
  // Get responsive layout information with enhanced memoization to prevent unnecessary recalculations
  const responsiveLayout = React.useMemo(() => {
    const { result, error, warnings } = safeLayoutCalculation(
      () => getResponsiveLayout(
        debouncedDimensions.width,
        safeTerminalHeight,
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
    
    return { result, warnings };
  }, [debouncedDimensions.width, safeTerminalHeight, config.responsiveBreakpoints]);
  
  // Handle minimum size graceful degradation (memoized)
  const isTerminalTooSmall = React.useMemo(() => {
    return debouncedDimensions.width < 40 || safeTerminalHeight < 10;
  }, [debouncedDimensions.width, safeTerminalHeight]);
  
  // Combine all warnings
  const allWarnings = React.useMemo(() => {
    return [
      ...validatedColorScheme.warnings,
      ...layoutCalculation.warnings,
      ...responsiveLayout.warnings
    ];
  }, [validatedColorScheme.warnings, layoutCalculation.warnings, responsiveLayout.warnings]);
  
  // Provide layout context to children through React context with enhanced memoization to prevent unnecessary recalculations
  const layoutContext = React.useMemo(() => ({
    dimensions: layoutCalculation.dimensions,
    responsive: responsiveLayout.result,
    colorScheme: validatedColorScheme.scheme,
    config,
    errorState: {
      hasError: Boolean(configValidation.error || layoutCalculation.error),
      error: configValidation.error || layoutCalculation.error,
      warnings: allWarnings,
      fallbackMode: layoutCalculation.fallbackMode,
    },
  }), [layoutCalculation, responsiveLayout.result, validatedColorScheme.scheme, config, configValidation.error, allWarnings]);
  
  // If terminal is too small, show a comprehensive error message
  if (isTerminalTooSmall) {
    const capabilities = detectTerminalColorCapabilities();
    const errorColorScheme = createFallbackColorScheme(capabilities);
    
    return (
      <Box
        flexDirection="column"
        width={debouncedDimensions.width}
        height={safeTerminalHeight}
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
            {layoutCalculation.error && (
              <Box marginTop={1}>
                <Text color={errorColorScheme.colors.errorMessage}>Error: {layoutCalculation.error}</Text>
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
  const showWarnings = layoutCalculation.fallbackMode && allWarnings.length > 0;
  
  return (
    <LayoutContext.Provider value={layoutContext}>
      <Box
        flexDirection="column"
        width={layoutCalculation.dimensions.terminal.width}
        height={layoutCalculation.dimensions.terminal.height}
      >
        {/* Show warnings banner if needed */}
        {showWarnings && (
          <Box
            width={layoutCalculation.dimensions.terminal.width}
            borderStyle="single"
            borderColor={validatedColorScheme.scheme.colors.errorMessage}
            marginBottom={1}
          >
            <Box padding={1}>
              <Text color={validatedColorScheme.scheme.colors.errorMessage}>
                ⚠️ Layout warnings: {allWarnings.slice(-2).join(', ')}
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
