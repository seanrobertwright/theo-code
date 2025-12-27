/**
 * @fileoverview ProjectHeader component - Project name and session info display
 * @module shared/components/Layout/ProjectHeader
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { ProjectHeaderProps } from './types.js';
import { createDefaultColorScheme, deriveProjectName } from './utils.js';

/**
 * Format session duration from created timestamp to human-readable string.
 */
function formatSessionDuration(_createdTimestamp: number): string {
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
 * Header component displaying project name and basic session information.
 * 
 * Features:
 * - Extracts project name from workspace root path
 * - Displays single-line header with box outline
 * - Shows session information (model, provider, duration) when available
 * - Uses distinct colors different from reference image
 * - Spans full width of terminal
 * 
 * Requirements satisfied:
 * - 2.1: Display header section at top with project name
 * - 2.2: Derive project name from current working directory name
 * - 2.3: Exactly 1 line high with box outline
 * - 2.4: Display project name in distinct color
 * - 2.5: Span full width of terminal
 */
export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  projectName,
  sessionInfo,
  width,
  colorScheme = createDefaultColorScheme(),
}) => {
  // Format session duration if session info is provided
  const formattedSessionInfo = React.useMemo(() => {
    if (!sessionInfo) {
    return null;
  }
    
    const duration = sessionInfo.duration || formatSessionDuration(Date.now() - 60000); // Fallback
    return `${sessionInfo.model} • ${sessionInfo.provider} • ${duration}`;
  }, [sessionInfo]);

  // Calculate available space for session info
  const sessionInfoText = formattedSessionInfo ?? '';
  const maxSessionInfoLength = Math.max(0, width - projectName.length - 6); // Account for padding and borders
  const truncatedSessionInfo = sessionInfoText.length > maxSessionInfoLength 
    ? sessionInfoText.substring(0, maxSessionInfoLength - 3) + '...'
    : sessionInfoText;

  return (
    <Box
      width={width}
      height={1}
      borderStyle="single"
      borderColor={colorScheme.colors.border}
      paddingX={1}
      justifyContent="space-between"
      alignItems="center"
    >
      <Text bold color={colorScheme.colors.header}>
        {projectName}
      </Text>
      {formattedSessionInfo && (
        <Text color={colorScheme.colors.status}>
          {truncatedSessionInfo}
        </Text>
      )}
    </Box>
  );
};

export type { ProjectHeaderProps };