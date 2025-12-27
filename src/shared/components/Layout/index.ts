/**
 * @fileoverview Layout components public API
 * @module shared/components/Layout
 */

// Core layout components
export { FullScreenLayout, useLayoutContext } from './FullScreenLayout.js';
export { ProjectHeader } from './ProjectHeader.js';
export { ConnectedProjectHeader } from './ConnectedProjectHeader.js';
export { ContextArea } from './ContextArea.js';
export { TaskSidebar } from './TaskSidebar.js';
export { ConnectedTaskSidebar } from './ConnectedTaskSidebar.js';
export { StatusFooter } from './StatusFooter.js';
export { ConnectedStatusFooter } from './ConnectedStatusFooter.js';
export { MessageList } from './MessageList.js';
export { ScrollIndicator } from './ScrollIndicator.js';
export { ResizableDivider } from './ResizableDivider.js';
export { 
  ColorCodedMessage,
  createMessageColorScheme,
  getMessageColors,
  getRoleDisplayInfo,
  applySyntaxHighlighting,
  SYNTAX_CONFIGS,
} from './MessageColorCoding.js';

// Types
export type {
  LayoutConfig,
  ColorScheme,
  SectionDimensions,
  ResponsiveBreakpoints,
  TaskItem,
  TaskStatus,
  TaskStatusColors,
  TaskStatusEmojis,
  UILayoutState,
  FullScreenLayoutProps,
  ProjectHeaderProps,
  ContextAreaProps,
  TaskSidebarProps,
  ResizableDividerProps,
  StatusFooterProps,
  MessageListProps,
  ScrollIndicatorProps,
  MessageColorScheme,
  SyntaxHighlightConfig,
  ColorCodedMessageProps,
} from './types.js';

// Component-specific types
export type { ConnectedProjectHeaderProps } from './ConnectedProjectHeader.js';
export type { ConnectedStatusFooterProps } from './ConnectedStatusFooter.js';
export type { ConnectedTaskSidebarProps } from './ConnectedTaskSidebar.js';

// Utilities
export {
  calculateSectionDimensions,
  getResponsiveLayout,
  deriveProjectName,
  createDefaultColorScheme,
  createDarkColorScheme,
  validateColorScheme,
  createDefaultLayoutConfig,
  validateLayoutConfig,
  getTaskStatusEmoji,
  getTaskStatusColor,
  clamp,
  percentage,
  fromPercentage,
} from './utils.js';