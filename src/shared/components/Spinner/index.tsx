/**
 * @fileoverview Spinner component for loading states
 * @module shared/components/Spinner
 */

import * as React from 'react';
import { type ReactElement } from 'react';
import { Text } from 'ink';
import InkSpinner from 'ink-spinner';

/**
 * Props for the Spinner component.
 */
export interface SpinnerProps {
  /** Text to display next to spinner */
  text?: string;
  /** Spinner color */
  color?: string;
}

/**
 * Spinner component for showing loading states.
 *
 * @param props - Component props
 * @returns React element
 *
 * @example
 * ```tsx
 * <Spinner text="Loading..." />
 * ```
 */
export const Spinner = ({ text, color = 'cyan' }: SpinnerProps): ReactElement => {
  return (
    <Text>
      <Text color={color}>
        <InkSpinner type="dots" />
      </Text>
      {text !== undefined && <Text> {text}</Text>}
    </Text>
  );
};
