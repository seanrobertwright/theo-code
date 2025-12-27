/**
 * @fileoverview ScrollIndicator component - Visual scrollbar for content areas
 * @module shared/components/Layout/ScrollIndicator
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { ScrollIndicatorProps } from './types.js';

/**
 * Visual scroll indicator component.
 * 
 * This component provides:
 * - Visual indication of scrollable content
 * - Current scroll position representation
 * - Proportional scrollbar thumb size
 * - Responsive to content and viewport changes
 */
export const ScrollIndicator: React.FC<ScrollIndicatorProps> = ({
  hasScroll,
  scrollPosition,
  contentHeight,
  visibleHeight,
  width,
  height,
  colorScheme,
}) => {
  // Don't render if no scroll is needed
  if (!hasScroll || height <= 1) {
    return null;
  }
  
  // Calculate scrollbar dimensions
  const scrollbarHeight = Math.max(1, height);
  const thumbHeight = Math.max(1, Math.floor((visibleHeight / contentHeight) * scrollbarHeight));
  const thumbPosition = Math.floor(scrollPosition * (scrollbarHeight - thumbHeight));
  
  // Generate scrollbar elements
  const scrollbarElements: React.ReactNode[] = [];
  
  for (let i = 0; i < scrollbarHeight; i++) {
    const isThumb = i >= thumbPosition && i < thumbPosition + thumbHeight;
    const char = isThumb ? '█' : '│';
    const color = isThumb ? colorScheme?.colors.scrollbar || 'gray' : colorScheme?.colors.border || 'gray';
    
    scrollbarElements.push(
      <Box key={i} width={width}>
        <Text color={color}>{char}</Text>
      </Box>
    );
  }
  
  return (
    <Box width={width} height={height} flexDirection="column">
      {scrollbarElements}
    </Box>
  );
};

export type { ScrollIndicatorProps };