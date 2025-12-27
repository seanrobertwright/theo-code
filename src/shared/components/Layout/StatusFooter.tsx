/**
 * @fileoverview StatusFooter component - System information display
 * @module shared/components/Layout/StatusFooter
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { StatusFooterProps } from './types.js';
import { createDefaultColorScheme } from './utils.js';

/**
 * Format token count with appropriate units and formatting.
 */
function formatTokenCount(tokenCount: { total: number; input: number; output: number }): string {
  const { total, input, output } = tokenCount;
  
  if (total === 0) {
    return 'No tokens used';
  }
  
  // Format large numbers with K/M suffixes
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };
  
  const totalFormatted = formatNumber(total);
  const inputFormatted = formatNumber(input);
  const outputFormatted = formatNumber(output);
  
  return `${totalFormatted} tokens (${inputFormatted} in, ${outputFormatted} out)`;
}

/**
 * Get connection status display with appropriate styling.
 */
function getConnectionStatusDisplay(status: 'connected' | 'disconnected' | 'error'): {
  text: string;
  color: string;
} {
  switch (status) {
    case 'connected':
      return { text: '🟢 Connected', color: 'green' };
    case 'disconnected':
      return { text: '🔴 Disconnected', color: 'red' };
    case 'error':
      return { text: '🟡 Error', color: 'yellow' };
    default:
      return { text: '⚪ Unknown', color: 'gray' };
  }
}

/**
 * Footer component displaying system information.
 * 
 * Shows token usage, session duration, context information, and connection status
 * in a 3-line format with real-time updates.
 * 
 * Layout:
 * Line 1: Token usage information with input/output breakdown
 * Line 2: Model information and connection status  
 * Line 3: Context information (files loaded) and session duration
 */
export const StatusFooter: React.FC<StatusFooterProps> = ({
  tokenCount,
  sessionDuration,
  contextFileCount,
  currentModel,
  connectionStatus,
  width,
  colorScheme = createDefaultColorScheme(),
}) => {
  // Format token information
  const tokenInfo = React.useMemo(() => {
    return formatTokenCount(tokenCount);
  }, [tokenCount]);
  
  // Get connection status display
  const connectionDisplay = React.useMemo(() => {
    return getConnectionStatusDisplay(connectionStatus);
  }, [connectionStatus]);
  
  // Format context information
  const contextInfo = React.useMemo(() => {
    if (contextFileCount === 0) {
      return 'No context files';
    } else if (contextFileCount === 1) {
      return '1 context file';
    } else {
      return `${contextFileCount} context files`;
    }
  }, [contextFileCount]);
  
  // Calculate available width for content (accounting for padding and borders)
  const contentWidth = Math.max(1, width - 4); // 2 for borders + 2 for padding
  
  // Truncate text if it exceeds available width
  const truncateText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) {
      return text;
    }
    return text.slice(0, maxWidth - 3) + '...';
  };
  
  return (
    <Box
      width={width}
      minHeight={5} // 3 content lines + 2 border lines
      borderStyle="single"
      borderColor={colorScheme.colors.border}
      flexDirection="column"
      paddingX={1}
    >
      {/* Line 1: Token usage information */}
      <Text color={colorScheme.colors.status}>
        {truncateText(tokenInfo, contentWidth)}
      </Text>
      
      {/* Line 2: Model and connection status */}
      <Text>
        <Text color={colorScheme.colors.status}>Model: {currentModel}</Text>
        <Text color={colorScheme.colors.status}> • </Text>
        <Text color={connectionDisplay.color}>{connectionDisplay.text}</Text>
      </Text>
      
      {/* Line 3: Context files and session duration */}
      <Text color={colorScheme.colors.status}>
        {truncateText(`${contextInfo} • Session: ${sessionDuration}`, contentWidth)}
      </Text>
    </Box>
  );
};

export type { StatusFooterProps };