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
