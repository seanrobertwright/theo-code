/**
 * @fileoverview Commands feature public API
 * @module features/commands
 */

export type {
  CommandContext,
  CommandHandler,
  CommandDefinition,
  CommandResult,
  SessionRestoreResult,
  SessionListResult,
  SessionSearchResult,
  SessionListDisplayOptions,
  SessionSearchDisplayOptions,
  SessionFilterDisplayOptions,
} from './types.js';

export {
  CommandRegistry,
  createDefaultCommandRegistry,
} from './registry.js';

export {
  resumeCommandHandler,
} from './handlers/resume.js';

export {
  sessionsCommandHandler,
} from './handlers/sessions.js';

export {
  providerCommandHandler,
} from './handlers/provider.js';

export {
  formatSessionList,
  formatSingleSession,
  formatSessionPreview,
  formatSearchResults,
  formatFilterResults,
  formatTokenCount,
  highlightSearchTerms,
  formatFileSize,
  formatDuration,
} from './utils/formatting.js';
