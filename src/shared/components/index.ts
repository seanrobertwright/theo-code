/**
 * @fileoverview Public API for shared components
 * @module shared/components
 */

export { Spinner, type SpinnerProps } from './Spinner/index.js';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog/index.js';
export { DiffView, type DiffViewProps } from './DiffView/index.js';
export { 
  SessionRestoration, 
  SessionDetectionLoading, 
  SessionDetectionError,
  type SessionRestorationProps,
  type SessionDetectionErrorProps 
} from './SessionRestoration/index.js';
export { 
  ProviderSelection, 
  ProviderStatus, 
  ProviderConfigWizard,
  type ProviderSelectionProps,
  type ProviderStatusProps,
  type ProviderConfigWizardProps,
} from './ProviderSelection/index.js';

// Layout components
export {
  FullScreenLayout,
  ProjectHeader,
  ConnectedProjectHeader,
  ContextArea,
  TaskSidebar,
  ResizableDivider,
  StatusFooter,
  MessageList,
  ScrollIndicator,
  type FullScreenLayoutProps,
  type ProjectHeaderProps,
  type ConnectedProjectHeaderProps,
  type ContextAreaProps,
  type TaskSidebarProps,
  type ResizableDividerProps,
  type StatusFooterProps,
  type MessageListProps,
  type ScrollIndicatorProps,
  type LayoutConfig,
  type ColorScheme,
  type TaskItem,
  type UILayoutState,
  calculateSectionDimensions,
  deriveProjectName,
  getResponsiveLayout,
  createDefaultColorScheme,
  createDefaultLayoutConfig,
} from './Layout/index.js';
