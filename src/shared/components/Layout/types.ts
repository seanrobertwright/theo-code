/**
 * @fileoverview TypeScript interfaces for layout configuration
 * @module shared/components/Layout/types
 */

import type { ReactNode } from 'react';
import type { Message, SessionTokenCount } from '../../types/index.js';

// =============================================================================
// LAYOUT CONFIGURATION
// =============================================================================

/**
 * Layout configuration for the full-screen UI.
 */
export interface LayoutConfig {
  /** Default context area width as percentage (0-100) */
  defaultContextWidth: number;
  /** Minimum context area width as percentage (0-100) */
  minContextWidth: number;
  /** Maximum context area width as percentage (0-100) */
  maxContextWidth: number;
  /** Header height in lines */
  headerHeight: number;
  /** Footer height in lines */
  footerHeight: number;
  /** Minimum terminal width for horizontal layout */
  minTerminalWidth: number;
  /** Minimum terminal height for full layout */
  minTerminalHeight: number;
  /** Responsive breakpoints */
  responsiveBreakpoints: ResponsiveBreakpoints;
}

/**
 * Responsive breakpoint configuration.
 */
export interface ResponsiveBreakpoints {
  /** Width below which sections stack vertically */
  narrow: number;
  /** Height below which context area gets priority */
  compact: number;
}

/**
 * Calculated section dimensions.
 */
export interface SectionDimensions {
  /** Terminal dimensions */
  terminal: {
    width: number;
    height: number;
  };
  /** Header dimensions */
  header: {
    width: number;
    height: number;
  };
  /** Context area dimensions */
  context: {
    width: number;
    height: number;
  };
  /** Task sidebar dimensions */
  sidebar: {
    width: number;
    height: number;
  };
  /** Footer dimensions */
  footer: {
    width: number;
    height: number;
  };
  /** Whether layout is stacked vertically */
  isVerticalLayout: boolean;
  /** Whether layout is in compact mode */
  isCompactMode: boolean;
}

// =============================================================================
// COLOR SCHEME
// =============================================================================

/**
 * Color scheme configuration for the UI.
 */
export interface ColorScheme {
  /** Color scheme name */
  name: string;
  /** Color definitions */
  colors: {
    // Message types
    userMessage: string;
    assistantMessage: string;
    systemMessage: string;
    toolCall: string;
    errorMessage: string;
    
    // UI elements
    border: string;
    header: string;
    status: string;
    taskStatus: TaskStatusColors;
    
    // Syntax highlighting
    code: string;
    keyword: string;
    string: string;
    comment: string;
    
    // Interactive elements
    divider: string;
    dividerActive: string;
    scrollbar: string;
    focus: string;
  };
}

/**
 * Task status color configuration.
 */
export interface TaskStatusColors {
  notStarted: string;
  inProgress: string;
  paused: string;
  completed: string;
  failed: string;
}

// =============================================================================
// TASK MANAGEMENT
// =============================================================================

/**
 * Task item for the sidebar.
 */
export interface TaskItem {
  /** Unique task identifier */
  id: string;
  /** Task title */
  title: string;
  /** Task status */
  status: TaskStatus;
  /** Optional task description */
  description?: string;
  /** Optional progress percentage (0-100) */
  progress?: number;
  /** Optional subtasks */
  subtasks?: TaskItem[];
  /** Whether task is optional */
  optional?: boolean;
}

/**
 * Task status enumeration.
 */
export type TaskStatus = 
  | 'not-started'
  | 'in-progress' 
  | 'paused'
  | 'completed'
  | 'failed';

/**
 * Task status emoji mapping.
 */
export interface TaskStatusEmojis {
  'not-started': '🔴';
  'in-progress': '🟢';
  'paused': '🟡';
  'completed': '✅';
  'failed': '❌';
}

// =============================================================================
// UI STATE
// =============================================================================

/**
 * UI layout state for the store.
 */
export interface UILayoutState {
  /** Context area width as percentage */
  contextAreaWidth: number;
  /** Whether task sidebar is collapsed */
  taskSidebarCollapsed: boolean;
  /** Scroll positions for different areas */
  scrollPositions: {
    context: number;
    tasks: number;
  };
  /** Current color scheme */
  colorScheme: ColorScheme;
  /** Layout configuration */
  layoutConfig: LayoutConfig;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

/**
 * Props for FullScreenLayout component.
 */
export interface FullScreenLayoutProps {
  /** Child components */
  children: ReactNode;
  /** Terminal width */
  terminalWidth: number;
  /** Terminal height */
  terminalHeight: number;
  /** Layout configuration */
  config?: LayoutConfig;
  /** Color scheme */
  colorScheme?: ColorScheme;
}

/**
 * Props for ProjectHeader component.
 */
export interface ProjectHeaderProps {
  /** Project name */
  projectName: string;
  /** Optional session information */
  sessionInfo?: {
    model: string;
    provider: string;
    duration: string;
  };
  /** Header width */
  width: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
}

/**
 * Props for ContextArea component.
 */
export interface ContextAreaProps {
  /** Message history */
  messages: Message[];
  /** Current streaming text */
  streamingText: string;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Area width */
  width: number;
  /** Area height */
  height: number;
  /** Scroll position */
  scrollPosition?: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
  /** Callback for width changes */
  onWidthChange?: (width: number) => void;
  /** Callback for scroll changes */
  onScrollChange?: (position: number) => void;
}

/**
 * Props for TaskSidebar component.
 */
export interface TaskSidebarProps {
  /** Task list */
  tasks: TaskItem[];
  /** Sidebar width */
  width: number;
  /** Sidebar height */
  height: number;
  /** Whether collapsed */
  collapsed?: boolean;
  /** Scroll position */
  scrollPosition?: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
  /** Callback for scroll changes */
  onScrollChange?: (position: number) => void;
  /** Callback for task selection */
  onTaskSelect?: (taskId: string) => void;
}

/**
 * Props for ResizableDivider component.
 */
export interface ResizableDividerProps {
  /** Current context width percentage */
  currentContextWidth: number;
  /** Minimum context width percentage */
  minContextWidth: number;
  /** Maximum context width percentage */
  maxContextWidth: number;
  /** Divider height */
  height: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
  /** Callback for resize */
  onResize: (contextWidth: number) => void;
}

/**
 * Props for StatusFooter component.
 */
export interface StatusFooterProps {
  /** Token count information */
  tokenCount: SessionTokenCount;
  /** Session duration */
  sessionDuration: string;
  /** Number of context files */
  contextFileCount: number;
  /** Current model */
  currentModel: string;
  /** Connection status */
  connectionStatus: 'connected' | 'disconnected' | 'error';
  /** Footer width */
  width: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
}

/**
 * Props for MessageList component.
 */
export interface MessageListProps {
  /** Message history */
  messages: Message[];
  /** Current streaming text */
  streamingText: string;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** List width */
  width: number;
  /** List height */
  height: number;
  /** Scroll position */
  scrollPosition?: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
  /** Callback for scroll changes */
  onScrollChange?: (position: number) => void;
  /** Callback for content height changes */
  onContentHeightChange?: (height: number) => void;
}

/**
 * Props for ScrollIndicator component.
 */
export interface ScrollIndicatorProps {
  /** Whether content is scrollable */
  hasScroll: boolean;
  /** Current scroll position (0-1) */
  scrollPosition: number;
  /** Total content height */
  contentHeight: number;
  /** Visible area height */
  visibleHeight: number;
  /** Indicator width */
  width: number;
  /** Indicator height */
  height: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
}

// Re-export types from MessageColorCoding
export type {
  MessageColorScheme,
  SyntaxHighlightConfig,
  ColorCodedMessageProps,
} from './MessageColorCoding.js';