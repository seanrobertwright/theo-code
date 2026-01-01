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
  // Debug logging for render tracking
  React.useEffect(() => {
    console.log('🎨 InputArea: Rendered with value:', value, 'disabled:', disabled);
  });

  // Handle keyboard input with stable callback to prevent re-registration
  const handleInput = React.useCallback((input: string, key: any) => {
    console.log('⌨️  InputArea: Input received:', input, 'key:', key);
    if (disabled) {
      console.log('⌨️  InputArea: Input ignored (disabled)');
      return;
    }

    if (key.return) {
      console.log('⌨️  InputArea: Submit triggered');
      onSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      console.log('⌨️  InputArea: Backspace/delete');
      onChange(value.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && input.length > 0) {
      console.log('⌨️  InputArea: Adding character:', input);
      onChange(value + input);
    }
  }, [disabled, onSubmit, onChange, value]);

  React.useEffect(() => {
    console.log('🔄 InputArea: useInput handler updated');
  }, [handleInput]);

  useInput(handleInput);

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
