/**
 * @fileoverview Connected ProjectHeader component - Integrates with app store
 * @module shared/components/Layout/ConnectedProjectHeader
 */

import * as React from 'react';
import { ProjectHeader } from './ProjectHeader.js';
import { deriveProjectName, createDefaultColorScheme } from './utils.js';
import { useAppStore } from '../../store/index.js';
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
 * Props for ConnectedProjectHeader component.
 */
export interface ConnectedProjectHeaderProps {
  /** Header width */
  width: number;
  /** Optional color scheme override */
  colorScheme?: ColorScheme;
}

/**
 * Connected ProjectHeader component that integrates with the app store.
 * 
 * Automatically extracts project name from workspace root and session information
 * from the current session state.
 * 
 * Features:
 * - Derives project name from workspace root path
 * - Displays current session information (model, provider, duration)
 * - Updates duration in real-time
 * - Handles cases where session information is not available
 */
export const ConnectedProjectHeader: React.FC<ConnectedProjectHeaderProps> = ({
  width,
  colorScheme = createDefaultColorScheme(),
}) => {
  // Get data from store
  const workspaceRoot = useAppStore((state) => state.workspaceRoot);
  const session = useAppStore((state) => state.session);
  const currentModel = useAppStore((state) => state.currentModel);
  const currentProvider = useAppStore((state) => state.currentProvider);

  // Derive project name from workspace root
  const projectName = React.useMemo(() => {
    return deriveProjectName(workspaceRoot);
  }, [workspaceRoot]);

  // Create session info object
  const sessionInfo = React.useMemo(() => {
    if (!session) {
      // If no session, show current model and provider without duration
      return {
        model: currentModel,
        provider: currentProvider,
        duration: '0s',
      };
    }

    return {
      model: session.model,
      provider: session.provider || currentProvider,
      duration: formatSessionDuration(session.created),
    };
  }, [session, currentModel, currentProvider]);

  // Update duration every second for real-time display
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate();
    }, 1000);

    return () => clearInterval(interval);
  }, [forceUpdate]);

  return (
    <ProjectHeader
      projectName={projectName}
      sessionInfo={sessionInfo}
      width={width}
      colorScheme={colorScheme}
    />
  );
};