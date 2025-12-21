/**
 * @fileoverview Session restoration component for app startup
 * @module shared/components/SessionRestoration
 *
 * Provides an interactive UI for users to select and restore previous sessions
 * on application startup, implementing the requirements for session restoration.
 */

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionMetadata } from '../../types/index.js';
import { formatSessionForDisplay } from '../../../features/session/startup.js';

// =============================================================================
// INTERFACES
// =============================================================================

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
}

// =============================================================================
// SESSION RESTORATION COMPONENT
// =============================================================================

/**
 * Interactive session restoration component.
 * 
 * Displays a list of available sessions and allows the user to select one
 * for restoration or choose to start a new session.
 */
export const SessionRestoration: React.FC<SessionRestorationProps> = ({
  sessions,
  onSessionSelected,
  onNewSession,
  onCancel,
  showDetails = false,
  maxDisplaySessions = 10,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showingDetails, setShowingDetails] = useState(showDetails);
  
  // Limit displayed sessions
  const displaySessions = sessions.slice(0, maxDisplaySessions);
  
  // Calculate total options (sessions + "New Session" + "Cancel" if available)
  const totalOptions = displaySessions.length + 1 + (onCancel ? 1 : 0);
  
  // Handle keyboard input
  useInput(
    useCallback(
      (input, key) => {
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
        } else if (key.downArrow) {
          setSelectedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
        } else if (key.return) {
          handleSelection();
        } else if (input === 'd' || input === 'D') {
          setShowingDetails((prev) => !prev);
        } else if (key.escape && onCancel) {
          onCancel();
        }
      },
      [totalOptions, onCancel]
    )
  );
  
  // Handle selection
  const handleSelection = useCallback(() => {
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
  }, [selectedIndex, displaySessions, onSessionSelected, onNewSession, onCancel]);
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Session Restoration
        </Text>
      </Box>
      
      {/* Instructions */}
      <Box marginBottom={1}>
        <Text color="gray">
          Found {sessions.length} previous session{sessions.length !== 1 ? 's' : ''}. 
          Use ↑/↓ to navigate, Enter to select{showDetails ? '' : ', D for details'}.
        </Text>
      </Box>
      
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
      
      {/* Footer */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          {showingDetails ? 'D: Hide details' : 'D: Show details'} | 
          Enter: Select | 
          {onCancel ? 'Esc: Cancel' : '↑/↓: Navigate'}
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
}

export const SessionDetectionError: React.FC<SessionDetectionErrorProps> = ({
  error,
  onRetry,
  onContinue,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const totalOptions = onRetry ? 2 : 1;
  
  useInput(
    useCallback(
      (_input, key) => {
        if (key.upArrow || key.downArrow) {
          setSelectedIndex((prev) => (prev === 0 ? totalOptions - 1 : 0));
        } else if (key.return) {
          if (selectedIndex === 0) {
            onContinue();
          } else if (onRetry) {
            onRetry();
          }
        }
      },
      [selectedIndex, totalOptions, onContinue, onRetry]
    )
  );
  
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
      
      <Box flexDirection="column">
        <Box>
          <Text 
            color={selectedIndex === 0 ? 'black' : 'white'} 
            {...(selectedIndex === 0 ? { backgroundColor: 'cyan' } : {})}
          >
            {selectedIndex === 0 ? '► ' : '  '}
            Continue with New Session
          </Text>
        </Box>
        
        {onRetry && (
          <Box>
            <Text 
              color={selectedIndex === 1 ? 'black' : 'white'} 
              {...(selectedIndex === 1 ? { backgroundColor: 'cyan' } : {})}
            >
              {selectedIndex === 1 ? '► ' : '  '}
              Retry Detection
            </Text>
          </Box>
        )}
      </Box>
      
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          ↑/↓: Navigate | Enter: Select
        </Text>
      </Box>
    </Box>
  );
};