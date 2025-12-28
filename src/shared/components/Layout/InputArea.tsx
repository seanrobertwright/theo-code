/**
 * @fileoverview InputArea component - User input interface
 * @module shared/components/Layout/InputArea
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ColorScheme } from './types.js';
import { createDefaultColorScheme } from './utils.js';

/**
 * Props for InputArea component.
 */
export interface InputAreaProps {
  /** Current input value */
  value: string;
  /** Input change handler */
  onChange: (value: string) => void;
  /** Submit handler */
  onSubmit: () => void;
  /** Whether input is disabled (e.g., during streaming) */
  disabled?: boolean;
  /** Input area width */
  width: number;
  /** Color scheme */
  colorScheme?: ColorScheme;
}

/**
 * Input area component for user messages.
 * 
 * This component provides:
 * - Text input with keyboard handling
 * - Visual feedback for streaming state
 * - Proper styling and borders
 * - Integration with existing input logic
 */
export const InputArea: React.FC<InputAreaProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  width,
  colorScheme = createDefaultColorScheme(),
}) => {
  // Handle keyboard input
  useInput((input, key) => {
    if (disabled) {
      return;
    }

    if (key.return) {
      onSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && input.length > 0) {
      onChange(value + input);
    }
  });

  return (
    <Box
      width={width}
      borderStyle="single"
      borderColor={colorScheme.colors.border}
      paddingX={1}
    >
      <Text color={colorScheme.colors.userMessage}>&gt; </Text>
      <Text>{value}</Text>
      {!disabled && <Text color={colorScheme.colors.focus}>▊</Text>}
      {disabled && <Text color={colorScheme.colors.comment}> (streaming...)</Text>}
    </Box>
  );
};