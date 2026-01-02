/**
 * @fileoverview Enhanced session restoration component for app startup
 * @module shared/components/SessionRestoration
 *
 * Provides an interactive UI for users to select and restore previous sessions
 * on application startup, implementing the requirements for session restoration
 * with enhanced error handling, validation summaries, and recovery options.
 */

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionMetadata, SessionId } from '../../types/index.js';
import { formatSessionForDisplay } from '../../../features/session/startup.js';
import type { RecoveryOption } from '../../../features/session/error-recovery.js';
import { createSafeInputHandlerWithDefaults } from '../Layout/input-error-handling.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Validation summary for session operations.
 */
export interface ValidationSummary {
  /** Total number of sessions found */
  totalSessions: number;
  /** Number of valid sessions */
  validSessions: number;
  /** Session IDs that failed validation */
  invalidSessions: SessionId[];
  /** Orphaned entries found in index */
  orphanedEntries: SessionId[];
  /** Orphaned files found on disk */
  orphanedFiles: string[];
  /** Whether cleanup was performed */
  cleanupPerformed: boolean;
  /** Warnings generated during validation */
  warnings: string[];
}

/**
 * Cleanup operation result.
 */
export interface CleanupResult {
  /** Number of sessions removed */
  sessionsRemoved: number;
  /** Number of entries fixed */
  entriesFixed: number;
  /** Number of files deleted */
  filesDeleted: number;
  /** Whether a backup was created */
  backupCreated: boolean;
  /** Errors encountered during cleanup */
  errors: string[];
  /** Warnings generated during cleanup */
  warnings: string[];
}

/**
 * Props for the SessionRestoration component.
 */
export interface SessionRestorationProps {
  /** Available sessions to choose from */
  sessions: SessionMetadata[];
  
  /** Callback when a session is selected for restoration */
  onSessionSelected: (sessionId: string) => void;
  
  /** Callback when user chooses to start a new session */
  onNewSession: () => void;
  
  /** Callback when user cancels restoration */
  onCancel?: () => void;
  
  /** Whether to show detailed session information */
  showDetails?: boolean;
  
  /** Maximum number of sessions to display */
  maxDisplaySessions?: number;

  /** Validation summary to display (if available) */
  validationSummary?: ValidationSummary;

  /** Cleanup result to display (if available) */
  cleanupResult?: CleanupResult;

  /** Callback to show validation summary details */
  onShowValidationSummary?: () => void;

  /** Recovery options available (if in error recovery mode) */
  recoveryOptions?: RecoveryOption[];

  /** Callback when a recovery option is selected */
  onRecoveryOptionSelected?: (option: RecoveryOption) => void;

  /** Error message to display (if in error state) */
  errorMessage?: string;

  /** Whether the component is in error recovery mode */
  isErrorRecovery?: boolean;
}

// =============================================================================
// SESSION RESTORATION COMPONENT
// =============================================================================

/**
 * Interactive session restoration component with enhanced error handling.
 * 
 * Displays a list of available sessions and allows the user to select one
 * for restoration or choose to start a new session. Includes validation
 * summaries, cleanup results, and recovery options.
 */
export const SessionRestoration: React.FC<SessionRestorationProps> = ({
  sessions,
  onSessionSelected,
  onNewSession,
  onCancel,
  showDetails = false,
  maxDisplaySessions = 10,
  validationSummary,
  cleanupResult,
  onShowValidationSummary,
  recoveryOptions,
  onRecoveryOptionSelected,
  errorMessage,
  isErrorRecovery = false,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showingDetails, setShowingDetails] = useState(showDetails);
  const [showingValidationSummary, setShowingValidationSummary] = useState(false);
  
  // Limit displayed sessions
  const displaySessions = sessions.slice(0, maxDisplaySessions);
  
  // Calculate total options based on mode
  let totalOptions: number;
  if (isErrorRecovery && recoveryOptions) {
    totalOptions = recoveryOptions.length;
  } else {
    totalOptions = displaySessions.length + 1 + (onCancel ? 1 : 0);
  }
  
  // Handle keyboard input
  const handleInput = useCallback(
    (input: string, key: any) => {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
      } else if (key.return) {
        handleSelection();
      } else if (input === 'd' || input === 'D') {
        if (!isErrorRecovery) {
          setShowingDetails((prev) => !prev);
        }
      } else if (input === 'v' || input === 'V') {
        if (validationSummary && onShowValidationSummary) {
          setShowingValidationSummary((prev) => !prev);
        }
      } else if (key.escape && onCancel) {
        onCancel();
      }
    },
    [totalOptions, onCancel, isErrorRecovery, validationSummary, onShowValidationSummary]
  );

  // Wrap the input handler with error boundary protection
  const safeHandleInput = React.useMemo(
    () => createSafeInputHandlerWithDefaults(handleInput, 'SessionRestoration'),
    [handleInput]
  );

  useInput(safeHandleInput);
  
  // Handle selection
  const handleSelection = useCallback(() => {
    if (isErrorRecovery && recoveryOptions) {
      // Error recovery mode - select recovery option
      const selectedOption = recoveryOptions[selectedIndex];
      if (selectedOption && onRecoveryOptionSelected) {
        onRecoveryOptionSelected(selectedOption);
      }
    } else {
      // Normal mode - select session or action
      if (selectedIndex < displaySessions.length) {
        // Session selected
        const session = displaySessions[selectedIndex];
        if (session) {
          onSessionSelected(session.id);
        }
      } else if (selectedIndex === displaySessions.length) {
        // New session selected
        onNewSession();
      } else if (onCancel) {
        // Cancel selected
        onCancel();
      }
    }
  }, [selectedIndex, displaySessions, onSessionSelected, onNewSession, onCancel, isErrorRecovery, recoveryOptions, onRecoveryOptionSelected]);
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={isErrorRecovery ? "red" : "cyan"}>
          {isErrorRecovery ? "Session Restoration Error" : "Session Restoration"}
        </Text>
      </Box>

      {/* Error message (if in error recovery mode) */}
      {isErrorRecovery && errorMessage && (
        <Box marginBottom={1} borderStyle="single" borderColor="red" paddingX={1}>
          <Text color="red">
            Error: {errorMessage}
          </Text>
        </Box>
      )}

      {/* Validation Summary (if available and showing) */}
      {validationSummary && showingValidationSummary && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">Validation Summary</Text>
          <Text color="gray">
            Found {validationSummary.totalSessions} sessions, {validationSummary.validSessions} valid
          </Text>
          {validationSummary.invalidSessions.length > 0 && (
            <Text color="red">
              {validationSummary.invalidSessions.length} invalid sessions removed
            </Text>
          )}
          {validationSummary.orphanedEntries.length > 0 && (
            <Text color="yellow">
              {validationSummary.orphanedEntries.length} orphaned entries cleaned
            </Text>
          )}
          {validationSummary.cleanupPerformed && (
            <Text color="green">
              Cleanup completed successfully
            </Text>
          )}
          {validationSummary.warnings.length > 0 && (
            <Box flexDirection="column" marginLeft={2}>
              <Text color="yellow">Warnings:</Text>
              {validationSummary.warnings.slice(0, 3).map((warning, index) => (
                <Text key={index} color="gray" dimColor>
                  • {warning}
                </Text>
              ))}
              {validationSummary.warnings.length > 3 && (
                <Text color="gray" dimColor>
                  ... and {validationSummary.warnings.length - 3} more
                </Text>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Cleanup Result (if available) */}
      {cleanupResult && (cleanupResult.sessionsRemoved > 0 || cleanupResult.entriesFixed > 0 || cleanupResult.filesDeleted > 0) && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="green" paddingX={1}>
          <Text bold color="green">Cleanup Summary</Text>
          {cleanupResult.sessionsRemoved > 0 && (
            <Text color="gray">
              {cleanupResult.sessionsRemoved} sessions removed
            </Text>
          )}
          {cleanupResult.entriesFixed > 0 && (
            <Text color="gray">
              {cleanupResult.entriesFixed} entries fixed
            </Text>
          )}
          {cleanupResult.filesDeleted > 0 && (
            <Text color="gray">
              {cleanupResult.filesDeleted} files deleted
            </Text>
          )}
          {cleanupResult.backupCreated && (
            <Text color="cyan">
              Backup created before cleanup
            </Text>
          )}
        </Box>
      )}

      {/* Instructions */}
      <Box marginBottom={1}>
        {isErrorRecovery ? (
          <Text color="gray">
            Select a recovery option below. Use ↑/↓ to navigate, Enter to select.
          </Text>
        ) : (
          <Text color="gray">
            Found {sessions.length} previous session{sessions.length !== 1 ? 's' : ''}. 
            Use ↑/↓ to navigate, Enter to select{showDetails ? '' : ', D for details'}
            {validationSummary ? ', V for validation summary' : ''}.
          </Text>
        )}
      </Box>

      {/* Recovery Options (if in error recovery mode) */}
      {isErrorRecovery && recoveryOptions ? (
        <Box flexDirection="column" marginBottom={1}>
          {recoveryOptions.map((option, index) => {
            const isSelected = selectedIndex === index;
            
            return (
              <Box key={index} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text 
                    color={isSelected ? 'black' : 'white'} 
                    {...(isSelected ? { backgroundColor: 'cyan' } : {})}
                  >
                    {isSelected ? '► ' : '  '}
                    {option.label}
                    {option.isRecommended ? ' (Recommended)' : ''}
                  </Text>
                </Box>
                
                <Box marginLeft={2}>
                  <Text color={isSelected ? 'cyan' : 'gray'}>
                    {option.description}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        <>
          {/* Session list */}
          <Box flexDirection="column" marginBottom={1}>
            {displaySessions.map((session, index) => {
              const isSelected = selectedIndex === index;
              const formatted = formatSessionForDisplay(session, { showDetails: showingDetails });
              
              return (
                <Box key={session.id} flexDirection="column" marginBottom={showingDetails ? 1 : 0}>
                  <Box>
                    <Text 
                      color={isSelected ? 'black' : 'white'} 
                      {...(isSelected ? { backgroundColor: 'cyan' } : {})}
                    >
                      {isSelected ? '► ' : '  '}
                      {formatted.title}
                    </Text>
                  </Box>
                  
                  <Box marginLeft={2}>
                    <Text color={isSelected ? 'cyan' : 'gray'}>
                      {formatted.subtitle}
                    </Text>
                  </Box>
                  
                  {showingDetails && formatted.details && (
                    <Box flexDirection="column" marginLeft={4} marginTop={0}>
                      {formatted.details.map((detail, detailIndex) => (
                        <Text key={detailIndex} color="gray" dimColor>
                          {detail}
                        </Text>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
            
            {/* Show truncation notice if needed */}
            {sessions.length > maxDisplaySessions && (
              <Box marginLeft={2}>
                <Text color="gray" dimColor>
                  ... and {sessions.length - maxDisplaySessions} more session{sessions.length - maxDisplaySessions !== 1 ? 's' : ''}
                </Text>
              </Box>
            )}
          </Box>
          
          {/* New session option */}
          <Box marginBottom={onCancel ? 0 : 1}>
            <Text 
              color={selectedIndex === displaySessions.length ? 'black' : 'white'} 
              {...(selectedIndex === displaySessions.length ? { backgroundColor: 'cyan' } : {})}
            >
              {selectedIndex === displaySessions.length ? '► ' : '  '}
              Start New Session
            </Text>
          </Box>
          
          {/* Cancel option */}
          {onCancel && (
            <Box marginBottom={1}>
              <Text 
                color={selectedIndex === displaySessions.length + 1 ? 'black' : 'white'} 
                {...(selectedIndex === displaySessions.length + 1 ? { backgroundColor: 'cyan' } : {})}
              >
                {selectedIndex === displaySessions.length + 1 ? '► ' : '  '}
                Cancel
              </Text>
            </Box>
          )}
        </>
      )}

      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          {isErrorRecovery ? (
            'Enter: Select recovery option'
          ) : (
            <>
              {showingDetails ? 'D: Hide details' : 'D: Show details'} | 
              {validationSummary ? (showingValidationSummary ? ' V: Hide validation' : ' V: Show validation') + ' |' : ''} 
              Enter: Select | 
              {onCancel ? 'Esc: Cancel' : '↑/↓: Navigate'}
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
};

// =============================================================================
// LOADING COMPONENT
// =============================================================================

/**
 * Loading component shown while detecting sessions.
 */
export const SessionDetectionLoading: React.FC = () => {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan">
        Detecting previous sessions{dots}
      </Text>
    </Box>
  );
};

// =============================================================================
// ERROR COMPONENT
// =============================================================================

/**
 * Error component shown when session detection fails.
 */
export interface SessionDetectionErrorProps {
  error: string;
  onRetry?: () => void;
  onContinue: () => void;
  errorType?: string;
  sessionId?: SessionId;
  attemptCount?: number;
  onSelectDifferent?: () => void;
}

export const SessionDetectionError: React.FC<SessionDetectionErrorProps> = ({
  error,
  onRetry,
  onContinue,
  errorType,
  sessionId,
  attemptCount,
  onSelectDifferent,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Build options array
  const options: Array<{ label: string; action: () => void; description: string }> = [];
  
  options.push({
    label: 'Continue with New Session',
    action: onContinue,
    description: 'Start fresh without restoring any session',
  });
  
  if (onRetry) {
    options.push({
      label: 'Retry Detection',
      action: onRetry,
      description: 'Try to detect sessions again',
    });
  }
  
  if (onSelectDifferent) {
    options.push({
      label: 'Select Different Session',
      action: onSelectDifferent,
      description: 'Choose a different session to restore',
    });
  }
  
  const totalOptions = options.length;
  
  const handleInput = useCallback(
    (_input: string, key: any) => {
      if (key.upArrow || key.downArrow) {
        setSelectedIndex((prev) => {
          if (key.upArrow) {
            return prev > 0 ? prev - 1 : totalOptions - 1;
          } else {
            return prev < totalOptions - 1 ? prev + 1 : 0;
          }
        });
      } else if (key.return) {
        const selectedOption = options[selectedIndex];
        if (selectedOption) {
          selectedOption.action();
        }
      }
    },
    [selectedIndex, totalOptions, options]
  );

  // Wrap the input handler with error boundary protection
  const safeHandleInput = React.useMemo(
    () => createSafeInputHandlerWithDefaults(handleInput, 'SessionDetectionError'),
    [handleInput]
  );

  useInput(safeHandleInput);
  
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="red">
          Session Detection Failed
        </Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color="gray">
          {error}
        </Text>
      </Box>

      {/* Additional context information */}
      {sessionId && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Session: {sessionId}
          </Text>
        </Box>
      )}

      {attemptCount && attemptCount > 1 && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Attempt #{attemptCount}
          </Text>
        </Box>
      )}

      {errorType && (
        <Box marginBottom={1}>
          <Text color="gray">
            Error type: {errorType}
          </Text>
        </Box>
      )}
      
      <Box flexDirection="column" marginBottom={1}>
        {options.map((option, index) => {
          const isSelected = selectedIndex === index;
          
          return (
            <Box key={index} flexDirection="column" marginBottom={1}>
              <Box>
                <Text 
                  color={isSelected ? 'black' : 'white'} 
                  {...(isSelected ? { backgroundColor: 'cyan' } : {})}
                >
                  {isSelected ? '► ' : '  '}
                  {option.label}
                </Text>
              </Box>
              
              <Box marginLeft={2}>
                <Text color={isSelected ? 'cyan' : 'gray'}>
                  {option.description}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          ↑/↓: Navigate | Enter: Select
        </Text>
      </Box>
    </Box>
  );
};
// =============================================================================
// ERROR BOUNDARY EXPORTS
// =============================================================================

// Export error boundary components
export {
  SessionRestorationErrorBoundary,
  DefaultSessionRestorationErrorFallback,
  useSessionRestorationErrorHandler,
  withSessionRestorationErrorBoundary,
} from './ErrorBoundary.js';

export type {
  SessionRestorationErrorBoundaryProps,
  SessionRestorationErrorFallbackProps,
} from './ErrorBoundary.js';

export {
  SessionDetectionErrorBoundary,
  DefaultSessionDetectionErrorFallback,
} from './SessionDetectionErrorBoundary.js';

export type {
  SessionDetectionErrorBoundaryProps,
  SessionDetectionErrorFallbackProps,
} from './SessionDetectionErrorBoundary.js';