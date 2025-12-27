/**
 * @fileoverview ResizableDivider component - Interactive divider for width adjustment
 * @module shared/components/Layout/ResizableDivider
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ResizableDividerProps } from './types.js';
import { createDefaultColorScheme } from './utils.js';

/**
 * Interactive divider component for adjusting context/task area widths.
 * 
 * Features:
 * - Horizontal resize functionality with keyboard interaction
 * - Visual feedback during resize operations
 * - Width constraint enforcement (50% minimum context width)
 * - Keyboard-based resize support for accessibility
 */
export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  currentContextWidth,
  minContextWidth,
  maxContextWidth,
  height,
  colorScheme = createDefaultColorScheme(),
  onResize,
}) => {
  const [isActive, setIsActive] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  
  // Handle keyboard input for resize operations
  useInput((input, key) => {
    if (!isActive) {return;}
    
    // Handle arrow keys for resize
    if (key.leftArrow) {
      const newWidth = Math.max(minContextWidth, currentContextWidth - 2);
      onResize(newWidth);
    } else if (key.rightArrow) {
      const newWidth = Math.min(maxContextWidth, currentContextWidth + 2);
      onResize(newWidth);
    } else if (key.escape) {
      setIsActive(false);
      setIsDragging(false);
    } else if (input === ' ' || key.return) {
      setIsActive(!isActive);
    }
  });
  
  // Visual feedback based on state
  const getDividerChar = (index: number): string => {
    if (isDragging) {
      return '║'; // Double line when dragging
    } else if (isActive) {
      return '┃'; // Thick line when active/focused
    } else {
      // Alternating pattern for visual appeal
      return index % 3 === 1 ? '│' : '┊';
    }
  };
  
  const getDividerColor = (): string => {
    if (isDragging) {
      return colorScheme.colors.dividerActive;
    } else if (isActive) {
      return colorScheme.colors.focus;
    } else {
      return colorScheme.colors.divider;
    }
  };
  
  return (
    <Box
      width={1}
      height={height}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      {Array.from({ length: height }, (_, i) => {
        const char = getDividerChar(i);
        const color = getDividerColor();
        const isMiddle = i === Math.floor(height / 2);
        
        return (
          <Box key={i} width={1}>
            <Text color={color}>
              {isActive && isMiddle ? '↔' : char}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};