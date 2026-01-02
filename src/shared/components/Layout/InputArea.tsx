/**
 * @fileoverview InputArea component - User input interface
 * @module shared/components/Layout/InputArea
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { ColorScheme } from './types.js';
import { createDefaultColorScheme } from './utils.js';
import { createSafeInputHandlerWithDefaults } from './input-error-handling.js';
import { logger } from '../../utils/logger.js';
import { useInputHandler } from '../../hooks/useInputManager.js';

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
 * - Text input with keyboard handling via centralized input manager
 * - Visual feedback for streaming state
 * - Proper styling and borders
 * - Integration with existing input logic
 * - Automatic conflict resolution through input manager
 */
export const InputArea: React.FC<InputAreaProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  width,
  colorScheme = createDefaultColorScheme(),
}) => {
  // Handle keyboard input with stable callback to prevent re-registration
  const handleInput = React.useCallback((input: string, key: any) => {
    if (disabled) {
      return;
    }

    if (key.return) {
      onSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      // Use safe state update for input changes
      try {
        onChange(value.slice(0, -1));
      } catch (error) {
        logger.error('Input change error during backspace in InputArea', {
          error: error instanceof Error ? error.message : String(error),
          value,
          context: 'input-backspace-handling'
        });
        // Fallback: try to clear the input entirely
        try {
          onChange('');
        } catch (fallbackError) {
          logger.error('Fallback input clear also failed in InputArea', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
          // If even clearing fails, just ignore to prevent crashes
        }
      }
      return;
    }

    if (!key.ctrl && !key.meta && input.length > 0) {
      // Use safe state update for input changes
      try {
        onChange(value + input);
      } catch (error) {
        logger.error('Input change error during text input in InputArea', {
          error: error instanceof Error ? error.message : String(error),
          value,
          input,
          context: 'input-text-handling'
        });
        // Fallback: try to set just the new input
        try {
          onChange(input);
        } catch (fallbackError) {
          logger.error('Fallback input set also failed in InputArea', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            input
          });
          // If even fallback fails, just ignore to prevent crashes
        }
      }
    }
  }, [disabled, onSubmit, onChange, value]);

  // Wrap the input handler with error boundary protection
  const safeHandleInput = React.useMemo(
    () => createSafeInputHandlerWithDefaults(handleInput, 'InputArea'),
    [handleInput]
  );

  // Use centralized input manager instead of direct useInput
  const { isActive, activate } = useInputHandler(
    'input-area',
    safeHandleInput,
    'InputArea',
    {
      priority: 10, // High priority for input area
      autoActivate: !disabled, // Auto-activate when not disabled
      dependencies: [safeHandleInput, disabled]
    }
  );

  // Activate handler when component becomes enabled
  React.useEffect(() => {
    if (!disabled && !isActive) {
      activate();
    }
  }, [disabled, isActive, activate]);

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
