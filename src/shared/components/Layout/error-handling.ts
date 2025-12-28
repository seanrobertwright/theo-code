/**
 * @fileoverview Error handling utilities for UI layout components
 * @module shared/components/Layout/error-handling
 */

import { logger } from '../../utils/logger.js';
import type { LayoutConfig, ColorScheme, SectionDimensions } from './types.js';
import { createDefaultLayoutConfig, createDefaultColorScheme } from './utils.js';

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Base class for layout-related errors.
 */
export class LayoutError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'LayoutError';
  }
}

/**
 * Error thrown when terminal dimensions are invalid.
 */
export class TerminalDimensionError extends LayoutError {
  constructor(width: number, height: number, minWidth = 40, minHeight = 10) {
    super(
      `Terminal dimensions ${width}x${height} are below minimum requirements (${minWidth}x${minHeight})`,
      'TERMINAL_TOO_SMALL'
    );
  }
}

/**
 * Error thrown when layout calculations fail.
 */
export class LayoutCalculationError extends LayoutError {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message, 'LAYOUT_CALCULATION_FAILED');
  }
}

/**
 * Error thrown when color scheme validation fails.
 */
export class ColorSchemeError extends LayoutError {
  constructor(message: string, public readonly schemeName?: string) {
    super(message, 'COLOR_SCHEME_INVALID');
  }
}

/**
 * Error thrown when terminal capabilities are insufficient.
 */
export class TerminalCapabilityError extends LayoutError {
  constructor(capability: string, fallback?: string) {
    super(
      `Terminal does not support ${capability}${fallback ? `, falling back to ${fallback}` : ''}`,
      'TERMINAL_CAPABILITY_MISSING'
    );
  }
}

// =============================================================================
// TERMINAL VALIDATION
// =============================================================================

/**
 * Validates terminal dimensions and throws appropriate errors.
 */
export function validateTerminalDimensions(
  width: number,
  height: number,
  config: LayoutConfig = createDefaultLayoutConfig()
): void {
  // Check for invalid dimensions
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new LayoutCalculationError(
      `Terminal dimensions must be integers, got width: ${width}, height: ${height}`,
      { width, height }
    );
  }

  if (width <= 0 || height <= 0) {
    throw new LayoutCalculationError(
      `Terminal dimensions must be positive, got width: ${width}, height: ${height}`,
      { width, height }
    );
  }

  // Check minimum requirements
  const minWidth = Math.max(40, config.minTerminalWidth);
  const minHeight = Math.max(10, config.minTerminalHeight);

  if (width < minWidth || height < minHeight) {
    throw new TerminalDimensionError(width, height, minWidth, minHeight);
  }

  // Log warnings for suboptimal dimensions
  if (width < 80) {
    logger.warn(`Terminal width ${width} is below recommended minimum of 80 characters`);
  }

  if (height < 24) {
    logger.warn(`Terminal height ${height} is below recommended minimum of 24 lines`);
  }
}

/**
 * Safely validates terminal dimensions without throwing.
 */
export function safeValidateTerminalDimensions(
  width: number,
  height: number,
  config?: LayoutConfig
): { isValid: boolean; error?: LayoutError; warnings: string[] } {
  const warnings: string[] = [];

  try {
    validateTerminalDimensions(width, height, config);
    
    // Add warnings for suboptimal but valid dimensions
    if (width < 80) {
      warnings.push(`Terminal width ${width} is below recommended 80 characters`);
    }
    if (height < 24) {
      warnings.push(`Terminal height ${height} is below recommended 24 lines`);
    }

    return { isValid: true, warnings };
  } catch (error) {
    if (error instanceof LayoutError) {
      return { isValid: false, error, warnings };
    }
    
    // Unexpected error
    const layoutError = new LayoutCalculationError(
      `Unexpected error during terminal validation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error }
    );
    return { isValid: false, error: layoutError, warnings };
  }
}

// =============================================================================
// LAYOUT CALCULATION VALIDATION
// =============================================================================

/**
 * Validates layout configuration for consistency and safety.
 */
export function validateLayoutConfig(config: LayoutConfig): void {
  // Validate width percentages
  if (config.minContextWidth < 10 || config.minContextWidth > 90) {
    throw new LayoutCalculationError(
      `minContextWidth must be between 10 and 90, got ${config.minContextWidth}`,
      { config }
    );
  }

  if (config.maxContextWidth < config.minContextWidth || config.maxContextWidth > 95) {
    throw new LayoutCalculationError(
      `maxContextWidth must be between minContextWidth (${config.minContextWidth}) and 95, got ${config.maxContextWidth}`,
      { config }
    );
  }

  if (config.defaultContextWidth < config.minContextWidth || config.defaultContextWidth > config.maxContextWidth) {
    throw new LayoutCalculationError(
      `defaultContextWidth must be between minContextWidth (${config.minContextWidth}) and maxContextWidth (${config.maxContextWidth}), got ${config.defaultContextWidth}`,
      { config }
    );
  }

  // Validate dimensions
  if (config.headerHeight < 1 || config.footerHeight < 1) {
    throw new LayoutCalculationError(
      `Header and footer heights must be at least 1, got header: ${config.headerHeight}, footer: ${config.footerHeight}`,
      { config }
    );
  }

  if (config.minTerminalWidth < 40 || config.minTerminalHeight < 10) {
    throw new LayoutCalculationError(
      `Minimum terminal dimensions must be at least 40x10, got ${config.minTerminalWidth}x${config.minTerminalHeight}`,
      { config }
    );
  }

  // Validate breakpoints
  if (config.responsiveBreakpoints.narrow < 40) {
    throw new LayoutCalculationError(
      `Narrow breakpoint must be at least 40, got ${config.responsiveBreakpoints.narrow}`,
      { config }
    );
  }

  if (config.responsiveBreakpoints.compact < 10) {
    throw new LayoutCalculationError(
      `Compact breakpoint must be at least 10, got ${config.responsiveBreakpoints.compact}`,
      { config }
    );
  }
}

/**
 * Validates section dimensions for mathematical consistency.
 */
export function validateSectionDimensions(dimensions: SectionDimensions): void {
  const { terminal, header, context, sidebar, footer } = dimensions;

  // Validate terminal dimensions
  if (terminal.width <= 0 || terminal.height <= 0) {
    throw new LayoutCalculationError(
      `Terminal dimensions must be positive, got ${terminal.width}x${terminal.height}`,
      { dimensions }
    );
  }

  // Validate section dimensions are positive
  const sections = { header, context, sidebar, footer };
  for (const [name, section] of Object.entries(sections)) {
    if (section.width <= 0 || section.height <= 0) {
      throw new LayoutCalculationError(
        `${name} dimensions must be positive, got ${section.width}x${section.height}`,
        { dimensions, section: name }
      );
    }
  }

  // Validate height consistency
  const totalHeight = header.height + footer.height + (dimensions.isVerticalLayout 
    ? context.height + sidebar.height 
    : Math.max(context.height, sidebar.height));

  if (totalHeight > terminal.height) {
    throw new LayoutCalculationError(
      `Total section height ${totalHeight} exceeds terminal height ${terminal.height}`,
      { dimensions, totalHeight }
    );
  }

  // Validate width consistency for horizontal layout
  if (!dimensions.isVerticalLayout) {
    const totalWidth = context.width + sidebar.width + 1; // +1 for divider
    if (totalWidth > terminal.width) {
      throw new LayoutCalculationError(
        `Total section width ${totalWidth} exceeds terminal width ${terminal.width}`,
        { dimensions, totalWidth }
      );
    }
  }
}

// =============================================================================
// COLOR SCHEME VALIDATION
// =============================================================================

/**
 * Validates color scheme completeness and terminal compatibility.
 */
export function validateColorScheme(colorScheme: ColorScheme): void {
  const requiredColors = [
    'userMessage', 'assistantMessage', 'systemMessage', 'toolCall', 'errorMessage',
    'border', 'header', 'status', 'code', 'keyword', 'string', 'comment',
    'divider', 'dividerActive', 'scrollbar', 'focus'
  ];

  const requiredTaskColors = [
    'notStarted', 'inProgress', 'paused', 'completed', 'failed'
  ];

  // Check main colors
  for (const color of requiredColors) {
    if (!(color in colorScheme.colors)) {
      throw new ColorSchemeError(
        `Missing required color '${color}' in color scheme '${colorScheme.name}'`,
        colorScheme.name
      );
    }
  }

  // Check task status colors
  for (const taskColor of requiredTaskColors) {
    if (!(taskColor in colorScheme.colors.taskStatus)) {
      throw new ColorSchemeError(
        `Missing required task status color '${taskColor}' in color scheme '${colorScheme.name}'`,
        colorScheme.name
      );
    }
  }
}

/**
 * Detects terminal color capabilities and returns appropriate fallback scheme.
 */
export function detectTerminalColorCapabilities(): {
  supportsColor: boolean;
  supports256Colors: boolean;
  supportsTrueColor: boolean;
  recommendedScheme: 'default' | 'monochrome' | 'limited';
} {
  // Check environment variables for color support
  const colorTerm = process.env['COLORTERM'];
  const term = process.env['TERM'];
  const forceColor = process.env['FORCE_COLOR'];

  // True color support
  const supportsTrueColor = Boolean(
    colorTerm === 'truecolor' || 
    colorTerm === '24bit' ||
    forceColor === '3'
  );

  // 256 color support
  const supports256Colors = Boolean(
    supportsTrueColor ||
    term?.includes('256') ||
    term?.includes('xterm') ||
    forceColor === '2'
  );

  // Basic color support
  const supportsColor = Boolean(
    supports256Colors ||
    term !== 'dumb' &&
    forceColor !== '0' &&
    (forceColor === '1' || process.stdout.isTTY)
  );

  // Determine recommended scheme
  let recommendedScheme: 'default' | 'monochrome' | 'limited';
  if (!supportsColor) {
    recommendedScheme = 'monochrome';
  } else if (!supports256Colors) {
    recommendedScheme = 'limited';
  } else {
    recommendedScheme = 'default';
  }

  return {
    supportsColor,
    supports256Colors,
    supportsTrueColor,
    recommendedScheme,
  };
}

/**
 * Creates a fallback color scheme for terminals with limited color support.
 */
export function createFallbackColorScheme(capabilities: ReturnType<typeof detectTerminalColorCapabilities>): ColorScheme {
  if (!capabilities.supportsColor) {
    // Monochrome fallback
    return {
      name: 'monochrome',
      colors: {
        // Message types - use different styles instead of colors
        userMessage: 'white',
        assistantMessage: 'white',
        systemMessage: 'gray',
        toolCall: 'white',
        errorMessage: 'white',
        
        // UI elements
        border: 'white',
        header: 'white',
        status: 'white',
        taskStatus: {
          notStarted: 'white',
          inProgress: 'white',
          paused: 'white',
          completed: 'white',
          failed: 'white',
        },
        
        // Syntax highlighting - minimal
        code: 'white',
        keyword: 'white',
        string: 'white',
        comment: 'gray',
        
        // Interactive elements
        divider: 'white',
        dividerActive: 'white',
        scrollbar: 'gray',
        focus: 'white',
      },
    };
  }

  if (!capabilities.supports256Colors) {
    // Limited color fallback (8/16 colors)
    return {
      name: 'limited',
      colors: {
        // Message types
        userMessage: 'blue',
        assistantMessage: 'green',
        systemMessage: 'white',
        toolCall: 'magenta',
        errorMessage: 'red',
        
        // UI elements
        border: 'white',
        header: 'cyan',
        status: 'yellow',
        taskStatus: {
          notStarted: 'red',
          inProgress: 'green',
          paused: 'yellow',
          completed: 'cyan',
          failed: 'magenta',
        },
        
        // Syntax highlighting
        code: 'cyan',
        keyword: 'blue',
        string: 'green',
        comment: 'white',
        
        // Interactive elements
        divider: 'white',
        dividerActive: 'cyan',
        scrollbar: 'white',
        focus: 'yellow',
      },
    };
  }

  // Full color support - return default scheme
  return createDefaultColorScheme();
}

// =============================================================================
// ERROR RECOVERY
// =============================================================================

/**
 * Attempts to recover from layout errors by providing safe fallback values.
 */
export function recoverFromLayoutError(
  error: LayoutError,
  fallbackConfig?: Partial<LayoutConfig>
): {
  recovered: boolean;
  fallbackDimensions?: SectionDimensions;
  fallbackConfig?: LayoutConfig;
  fallbackColorScheme?: ColorScheme;
  warnings: string[];
} {
  const warnings: string[] = [];

  try {
    switch (error.code) {
      case 'TERMINAL_TOO_SMALL': {
        // Provide minimal fallback dimensions
        const minWidth = 40;
        const minHeight = 10;
        const config = { ...createDefaultLayoutConfig(), ...fallbackConfig };
        
        const fallbackDimensions: SectionDimensions = {
          terminal: { width: minWidth, height: minHeight },
          header: { width: minWidth, height: 1 },
          context: { width: minWidth - 2, height: minHeight - 4 },
          sidebar: { width: 0, height: 0 }, // Hide sidebar in minimal mode
          footer: { width: minWidth, height: 3 },
          isVerticalLayout: true,
          isCompactMode: true,
        };

        warnings.push('Terminal too small - using minimal layout');
        return {
          recovered: true,
          fallbackDimensions,
          fallbackConfig: config,
          warnings,
        };
      }

      case 'COLOR_SCHEME_INVALID': {
        const capabilities = detectTerminalColorCapabilities();
        const fallbackColorScheme = createFallbackColorScheme(capabilities);
        
        warnings.push(`Invalid color scheme - using ${capabilities.recommendedScheme} fallback`);
        return {
          recovered: true,
          fallbackColorScheme,
          warnings,
        };
      }

      case 'LAYOUT_CALCULATION_FAILED': {
        const config = createDefaultLayoutConfig();
        warnings.push('Layout calculation failed - using default configuration');
        return {
          recovered: true,
          fallbackConfig: config,
          warnings,
        };
      }

      case 'TERMINAL_CAPABILITY_MISSING': {
        const capabilities = detectTerminalColorCapabilities();
        const fallbackColorScheme = createFallbackColorScheme(capabilities);
        
        warnings.push('Terminal capability missing - using compatible fallback');
        return {
          recovered: true,
          fallbackColorScheme,
          warnings,
        };
      }

      default:
        warnings.push(`Unknown layout error: ${error.message}`);
        return {
          recovered: false,
          warnings,
        };
    }
  } catch (recoveryError) {
    warnings.push(`Error recovery failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`);
    return {
      recovered: false,
      warnings,
    };
  }
}

// =============================================================================
// SAFE WRAPPERS
// =============================================================================

/**
 * Safely executes a layout calculation with error handling and recovery.
 */
export function safeLayoutCalculation<T>(
  calculation: () => T,
  fallbackValue: T,
  context?: string
): { result: T; error?: LayoutError; warnings: string[] } {
  try {
    const result = calculation();
    return { result, warnings: [] };
  } catch (error) {
    const warnings: string[] = [];
    
    if (error instanceof LayoutError) {
      warnings.push(`Layout calculation failed${context ? ` in ${context}` : ''}: ${error.message}`);
      logger.warn(`Layout calculation error: ${error.message}`, { context, code: error.code });
      return { result: fallbackValue, error, warnings };
    }
    
    // Unexpected error
    const layoutError = new LayoutCalculationError(
      `Unexpected error during layout calculation${context ? ` in ${context}` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error, context }
    );
    
    warnings.push(`Unexpected layout error - using fallback`);
    logger.error(`Unexpected layout calculation error: ${layoutError.message}`, { context });
    
    return { result: fallbackValue, error: layoutError, warnings };
  }
}

/**
 * Safely validates and applies a color scheme with fallback.
 */
export function safeApplyColorScheme(
  colorScheme: ColorScheme
): { colorScheme: ColorScheme; warnings: string[] } {
  const warnings: string[] = [];

  try {
    validateColorScheme(colorScheme);
    return { colorScheme, warnings };
  } catch (error) {
    if (error instanceof ColorSchemeError) {
      warnings.push(`Invalid color scheme: ${error.message}`);
      logger.warn(`Color scheme validation failed: ${error.message}`);
      
      const capabilities = detectTerminalColorCapabilities();
      const fallbackScheme = createFallbackColorScheme(capabilities);
      
      warnings.push(`Using ${capabilities.recommendedScheme} fallback color scheme`);
      return { colorScheme: fallbackScheme, warnings };
    }
    
    // Unexpected error
    warnings.push('Unexpected color scheme error - using default');
    logger.error(`Unexpected color scheme error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return { colorScheme: createDefaultColorScheme(), warnings };
  }
}