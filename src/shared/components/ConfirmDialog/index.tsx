/**
 * @fileoverview ConfirmDialog component for user confirmations
 * @module shared/components/ConfirmDialog
 */

import { type ReactElement, useState } from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * Props for the ConfirmDialog component.
 */
export interface ConfirmDialogProps {
  /** Message to display */
  message: string;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Whether to show the dialog */
  isVisible: boolean;
  /** Optional additional details */
  details?: string;
}

/**
 * ConfirmDialog component for user confirmations.
 *
 * @param props - Component props
 * @returns React element
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   message="Delete this file?"
 *   onConfirm={() => deleteFile()}
 *   onCancel={() => setShowDialog(false)}
 *   isVisible={showDialog}
 * />
 * ```
 */
export const ConfirmDialog = ({
  message,
  onConfirm,
  onCancel,
  isVisible,
  details,
}: ConfirmDialogProps): ReactElement | null => {
  const [selected, setSelected] = useState<'yes' | 'no'>('no');

  useInput(
    (input, key) => {
      if (!isVisible) {
        return;
      }

      if (key.leftArrow || key.rightArrow || input === 'y' || input === 'n') {
        if (input === 'y') {
          setSelected('yes');
        } else if (input === 'n') {
          setSelected('no');
        } else {
          setSelected((prev) => (prev === 'yes' ? 'no' : 'yes'));
        }
      }

      if (key.return) {
        if (selected === 'yes') {
          onConfirm();
        } else {
          onCancel();
        }
      }

      if (key.escape) {
        onCancel();
      }
    },
    { isActive: isVisible }
  );

  if (!isVisible) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow">
        ⚠️ Confirmation Required
      </Text>

      <Box marginY={1}>
        <Text>{message}</Text>
      </Box>

      {details !== undefined && (
        <Box marginBottom={1}>
          <Text color="gray">{details}</Text>
        </Box>
      )}

      <Box gap={2}>
        {selected === 'yes' ? (
          <Text backgroundColor="green" color="white">
            {' [Y]es '}
          </Text>
        ) : (
          <Text color="gray">{' [Y]es '}</Text>
        )}
        {selected === 'no' ? (
          <Text backgroundColor="red" color="white">
            {' [N]o '}
          </Text>
        ) : (
          <Text color="gray">{' [N]o '}</Text>
        )}
      </Box>

      <Text color="gray" dimColor>
        Press Y/N or Enter to confirm, Escape to cancel
      </Text>
    </Box>
  );
};
