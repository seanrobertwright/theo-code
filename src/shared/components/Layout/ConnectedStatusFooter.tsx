/**
 * @fileoverview Connected StatusFooter component - Integrates with app store
 * @module shared/components/Layout/ConnectedStatusFooter
 */

import * as React from 'react';
import { StatusFooter } from './StatusFooter.js';
import { createDefaultColorScheme } from './utils.js';
import { useAppStore, selectTotalTokens, selectContextFileCount } from '../../store/index.js';
import type { ColorScheme } from './types.js';

/**
 * Format session duration from created timestamp to human-readable string.
 */
function formatSessionDuration(createdTimestamp: number): string {
  const now = Date.now();
  const elapsed = now - createdTimestamp;
  
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Determine connection status based on current app state.
 */
function determineConnectionStatus(
  error: string | null,
  session: any
): 'connected' | 'disconnected' | 'error' {
  if (error) {
    return 'error';
  }
  
  if (!session) {
    return 'disconnected';
  }
  
  // If we have a session, we're connected
  return 'connected';
}

/**
 * Props for ConnectedStatusFooter component.
 */
export interface ConnectedStatusFooterProps {
  /** Footer width */
  width: number;
  /** Optional color scheme override */
  colorScheme?: ColorScheme;
}

/**
 * Connected StatusFooter component that integrates with the app store.
 * 
 * Automatically extracts all status information from the current app state
 * and provides real-time updates.
 * 
 * Features:
 * - Real-time token count updates from session state
 * - Live session duration calculation and updates
 * - Context file count from loaded files
 * - Connection status based on app state
 * - Automatic refresh every second for duration updates
 */
export const ConnectedStatusFooter: React.FC<ConnectedStatusFooterProps> = ({
  width,
  colorScheme = createDefaultColorScheme(),
}) => {
  // Get data from store
  const session = useAppStore((state) => state.session);
  const currentModel = useAppStore((state) => state.currentModel);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const error = useAppStore((state) => state.error);
  const contextFileCount = useAppStore(selectContextFileCount);

  // Get token count from session or provide defaults
  const tokenCount = React.useMemo(() => {
    if (session?.tokenCount) {
      return session.tokenCount;
    }
    return { total: 0, input: 0, output: 0 };
  }, [session?.tokenCount]);

  // Calculate session duration
  const sessionDuration = React.useMemo(() => {
    if (!session?.created) {
      return '0s';
    }
    return formatSessionDuration(session.created);
  }, [session?.created]);

  // Determine connection status
  const connectionStatus = React.useMemo(() => {
    return determineConnectionStatus(error, session);
  }, [error, session]);

  // Update duration every second for real-time display
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate();
    }, 1000);

    return () => clearInterval(interval);
  }, [forceUpdate]);

  return (
    <StatusFooter
      tokenCount={tokenCount}
      sessionDuration={sessionDuration}
      contextFileCount={contextFileCount}
      currentModel={currentModel}
      connectionStatus={connectionStatus}
      width={width}
      colorScheme={colorScheme}
    />
  );
};