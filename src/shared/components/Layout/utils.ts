/**
 * @fileoverview Layout utilities and helper functions
 * @module shared/components/Layout/utils
 */

import * as path from 'node:path';
import type {
  LayoutConfig,
  ColorScheme,
  SectionDimensions,
  ResponsiveBreakpoints,
  TaskStatusColors,
} from './types.js';

// =============================================================================
// LAYOUT CALCULATIONS
// =============================================================================

/**
 * Calculate section dimensions based on terminal size and configuration.
 */
export function calculateSectionDimensions(
  terminalWidth: number,
  terminalHeight: number,
  contextWidthPercent: number,
  config: LayoutConfig
): SectionDimensions {
  // Validate inputs to prevent division by zero and other calculation errors
  if (!Number.isFinite(terminalWidth) || !Number.isFinite(terminalHeight)) {
    throw new Error(`Invalid terminal dimensions: width=${terminalWidth}, height=${terminalHeight}`);
  }
  
  if (terminalWidth <= 0 || terminalHeight <= 0) {
    throw new Error(`Terminal dimensions must be positive: width=${terminalWidth}, height=${terminalHeight}`);
  }
  
  if (!Number.isFinite(contextWidthPercent) || contextWidthPercent < 0 || contextWidthPercent > 100) {
    throw new Error(`Invalid context width percentage: ${contextWidthPercent}`);
  }

  // Determine layout mode based on breakpoints
  const isVerticalLayout = terminalWidth < config.responsiveBreakpoints.narrow;
  const isCompactMode = terminalHeight < config.responsiveBreakpoints.compact;

  // Calculate available space with bounds checking
  const availableHeight = Math.max(1, terminalHeight - config.headerHeight - config.footerHeight);
  const availableWidth = Math.max(1, terminalWidth);

  // Ensure context width is within bounds
  const clampedContextWidth = Math.max(
    config.minContextWidth,
    Math.min(config.maxContextWidth, contextWidthPercent)
  );

  let contextWidth: number;
  let contextHeight: number;
  let sidebarWidth: number;
  let sidebarHeight: number;

  if (isVerticalLayout) {
    // Vertical stacking - full width for both sections
    // Requirements: vertical stacking for narrow terminals
    contextWidth = availableWidth;
    sidebarWidth = availableWidth;
    
    if (isCompactMode) {
      // Prioritize context area in compact mode (80% vs 20%)
      // Requirements: context area prioritization for short terminals
      contextHeight = Math.max(1, Math.floor(availableHeight * 0.8));
      sidebarHeight = Math.max(0, availableHeight - contextHeight);
    } else {
      // Normal vertical split (60% context, 40% sidebar)
      contextHeight = Math.max(1, Math.floor(availableHeight * 0.6));
      sidebarHeight = Math.max(0, availableHeight - contextHeight);
    }
  } else {
    // Horizontal layout for normal terminals
    contextWidth = Math.max(1, Math.floor((availableWidth * clampedContextWidth) / 100));
    sidebarWidth = Math.max(0, availableWidth - contextWidth - 1); // -1 for divider
    contextHeight = Math.max(1, availableHeight);
    sidebarHeight = Math.max(1, availableHeight);
  }

  // Ensure minimum dimensions for graceful degradation
  // Requirements: graceful handling of extreme dimensions
  const result: SectionDimensions = {
    terminal: {
      width: terminalWidth,
      height: terminalHeight,
    },
    header: {
      width: terminalWidth,
      height: config.headerHeight,
    },
    context: {
      width: Math.max(1, contextWidth),
      height: Math.max(1, contextHeight),
    },
    sidebar: {
      width: Math.max(0, sidebarWidth), // Sidebar can be 0 width in extreme cases
      height: Math.max(0, sidebarHeight), // Sidebar can be 0 height in extreme cases
    },
    footer: {
      width: terminalWidth,
      height: config.footerHeight,
    },
    isVerticalLayout,
    isCompactMode,
  };

  // Validate the result to catch any calculation errors
  if (result.context.width <= 0 || result.context.height <= 0) {
    throw new Error(`Invalid context dimensions calculated: ${result.context.width}x${result.context.height}`);
  }

  return result;
}

/**
 * Get responsive layout configuration based on terminal dimensions.
 */
export function getResponsiveLayout(
  terminalWidth: number,
  terminalHeight: number,
  breakpoints: ResponsiveBreakpoints
): {
  isVertical: boolean;
  isCompact: boolean;
  shouldHideSidebar: boolean;
  shouldMinimizeHeader: boolean;
} {
  // Validate inputs
  if (!Number.isFinite(terminalWidth) || !Number.isFinite(terminalHeight)) {
    throw new Error(`Invalid terminal dimensions for responsive layout: width=${terminalWidth}, height=${terminalHeight}`);
  }
  
  if (terminalWidth <= 0 || terminalHeight <= 0) {
    throw new Error(`Terminal dimensions must be positive for responsive layout: width=${terminalWidth}, height=${terminalHeight}`);
  }

  // Vertical stacking for narrow terminals (< 80 chars as per requirements)
  const isVertical = terminalWidth < breakpoints.narrow;
  
  // Compact mode for short terminals (< 20 lines as per requirements)
  const isCompact = terminalHeight < breakpoints.compact;
  
  // Hide sidebar for very small terminals to ensure usability
  // Requirements: graceful handling of extreme dimensions
  const shouldHideSidebar = terminalWidth < 60 || terminalHeight < 15;
  
  // Minimize header in very compact mode to prioritize content
  // Requirements: context area prioritization for short terminals
  const shouldMinimizeHeader = terminalHeight < 12;

  return {
    isVertical,
    isCompact,
    shouldHideSidebar,
    shouldMinimizeHeader,
  };
}

// =============================================================================
// PROJECT NAME UTILITIES
// =============================================================================

/**
 * Derive project name from workspace root path.
 */
export function deriveProjectName(workspaceRoot: string): string {
  // Handle invalid or empty paths
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    return 'Unknown Project';
  }

  // Handle root directory
  if (workspaceRoot === '/' || workspaceRoot === '\\') {
    return 'Root Directory';
  }

  try {
    const basename = path.basename(workspaceRoot);
    
    // Handle common cases
    if (basename === '.' || basename === '') {
      return 'Current Directory';
    }

    // Convert kebab-case and snake_case to Title Case
    return basename
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch (error) {
    // Handle path parsing errors
    return 'Unknown Project';
  }
}

// =============================================================================
// COLOR SCHEME UTILITIES
// =============================================================================

/**
 * Create default color scheme.
 */
export function createDefaultColorScheme(): ColorScheme {
  const taskStatusColors: TaskStatusColors = {
    notStarted: 'red',
    inProgress: 'green',
    paused: 'yellow',
    completed: 'cyan',
    failed: 'magenta',
  };

  return {
    name: 'default',
    colors: {
      // Message types
      userMessage: 'blue',
      assistantMessage: 'green',
      systemMessage: 'gray',
      toolCall: 'magenta',
      errorMessage: 'red',
      
      // UI elements
      border: 'gray',
      header: 'cyan',
      status: 'yellow',
      taskStatus: taskStatusColors,
      
      // Syntax highlighting
      code: 'cyan',
      keyword: 'blue',
      string: 'green',
      comment: 'gray',
      
      // Interactive elements
      divider: 'gray',
      dividerActive: 'cyan',
      scrollbar: 'gray',
      focus: 'yellow',
    },
  };
}

/**
 * Create dark color scheme variant.
 */
export function createDarkColorScheme(): ColorScheme {
  const taskStatusColors: TaskStatusColors = {
    notStarted: 'redBright',
    inProgress: 'greenBright',
    paused: 'yellowBright',
    completed: 'cyanBright',
    failed: 'magentaBright',
  };

  return {
    name: 'dark',
    colors: {
      // Message types
      userMessage: 'blueBright',
      assistantMessage: 'greenBright',
      systemMessage: 'gray',
      toolCall: 'magentaBright',
      errorMessage: 'redBright',
      
      // UI elements
      border: 'gray',
      header: 'cyanBright',
      status: 'yellowBright',
      taskStatus: taskStatusColors,
      
      // Syntax highlighting
      code: 'cyanBright',
      keyword: 'blueBright',
      string: 'greenBright',
      comment: 'gray',
      
      // Interactive elements
      divider: 'gray',
      dividerActive: 'cyanBright',
      scrollbar: 'gray',
      focus: 'yellowBright',
    },
  };
}

/**
 * Validate color scheme completeness.
 */
export function validateColorScheme(colorScheme: ColorScheme): boolean {
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
      return false;
    }
  }

  // Check task status colors
  for (const taskColor of requiredTaskColors) {
    if (!(taskColor in colorScheme.colors.taskStatus)) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// LAYOUT CONFIGURATION UTILITIES
// =============================================================================

/**
 * Create default layout configuration.
 */
export function createDefaultLayoutConfig(): LayoutConfig {
  return {
    defaultContextWidth: 70,
    minContextWidth: 50,
    maxContextWidth: 90,
    headerHeight: 2, // ProjectHeader renders as 2 terminal rows with border
    footerHeight: 5, // 3 content lines + 2 border lines
    minTerminalWidth: 80,
    minTerminalHeight: 20,
    responsiveBreakpoints: {
      narrow: 80,
      compact: 20,
    },
  };
}

/**
 * Validate layout configuration.
 */
export function validateLayoutConfig(config: LayoutConfig): boolean {
  // Check width percentages
  if (config.minContextWidth < 10 || config.minContextWidth > 90) {
    return false;
  }
  
  if (config.maxContextWidth < config.minContextWidth || config.maxContextWidth > 95) {
    return false;
  }
  
  if (config.defaultContextWidth < config.minContextWidth || 
      config.defaultContextWidth > config.maxContextWidth) {
    return false;
  }

  // Check dimensions
  if (config.headerHeight < 1 || config.footerHeight < 1) {
    return false;
  }
  
  if (config.minTerminalWidth < 40 || config.minTerminalHeight < 10) {
    return false;
  }

  // Check breakpoints
  if (config.responsiveBreakpoints.narrow < 40 || 
      config.responsiveBreakpoints.compact < 10) {
    return false;
  }

  return true;
}

// =============================================================================
// TASK STATUS UTILITIES
// =============================================================================

/**
 * Get emoji for task status.
 */
export function getTaskStatusEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    'not-started': '🔴',
    'in-progress': '🟢',
    'paused': '🟡',
    'completed': '✅',
    'failed': '❌',
  };

  return emojiMap[status] || '⚪';
}

/**
 * Get color for task status.
 */
export function getTaskStatusColor(status: string, colorScheme: ColorScheme): string {
  const statusMap: Record<string, keyof TaskStatusColors> = {
    'not-started': 'notStarted',
    'in-progress': 'inProgress',
    'paused': 'paused',
    'completed': 'completed',
    'failed': 'failed',
  };
  
  const statusKey = statusMap[status];
  return statusKey ? colorScheme.colors.taskStatus[statusKey] : colorScheme.colors.border;
}

// =============================================================================
// DIMENSION UTILITIES
// =============================================================================

/**
 * Clamp value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  // Handle invalid inputs
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`Invalid clamp parameters: value=${value}, min=${min}, max=${max}`);
  }
  
  if (min > max) {
    throw new Error(`Invalid clamp range: min (${min}) must be <= max (${max})`);
  }
  
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate percentage of total.
 */
export function percentage(value: number, total: number): number {
  // Handle invalid inputs
  if (!Number.isFinite(value) || !Number.isFinite(total)) {
    return 0;
  }
  
  if (total === 0) {
    return 0;
  }
  
  const result = (value / total) * 100;
  return Number.isFinite(result) ? Math.round(result) : 0;
}

/**
 * Convert percentage to absolute value.
 */
export function fromPercentage(percent: number, total: number): number {
  // Handle invalid inputs
  if (!Number.isFinite(percent) || !Number.isFinite(total)) {
    return 0;
  }
  
  if (total <= 0) {
    return 0;
  }
  
  const result = (percent / 100) * total;
  return Number.isFinite(result) ? Math.floor(result) : 0;
}
