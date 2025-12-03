/**
 * @fileoverview DiffView component for showing file changes
 * @module shared/components/DiffView
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { type ReactElement } from 'react';
import { Box, Text } from 'ink';
import { diffLines, type Change } from 'diff';

/**
 * Props for the DiffView component.
 */
export interface DiffViewProps {
  /** Original file content */
  oldContent: string;
  /** New file content */
  newContent: string;
  /** File path for display */
  filePath: string;
  /** Maximum lines to show */
  maxLines?: number;
}

/**
 * DiffView component for showing file changes.
 *
 * @param props - Component props
 * @returns React element
 *
 * @example
 * ```tsx
 * <DiffView
 *   oldContent="const x = 1;"
 *   newContent="const x = 2;"
 *   filePath="src/file.ts"
 * />
 * ```
 */
export const DiffView = ({
  oldContent,
  newContent,
  filePath,
  maxLines = 50,
}: DiffViewProps): ReactElement => {
  const diff = diffLines(oldContent, newContent);

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;
  diff.forEach((part) => {
    if (part.added === true) {
      additions += part.count ?? 0;
    }
    if (part.removed === true) {
      deletions += part.count ?? 0;
    }
  });

  // Format diff lines
  const formatDiffLine = (part: Change, index: number): ReactElement[] => {
    const lines = part.value.split('\n').filter((line) => line.length > 0);

    return lines.map((line, lineIndex) => {
      const key = `${index}-${lineIndex}`;

      if (part.added === true) {
        return (
          <Text key={key} color="green">
            + {line}
          </Text>
        );
      }

      if (part.removed === true) {
        return (
          <Text key={key} color="red">
            - {line}
          </Text>
        );
      }

      return (
        <Text key={key} color="gray">
          {'  '}{line}
        </Text>
      );
    });
  };

  // Flatten and limit lines
  const allLines = diff.flatMap((part, index) => formatDiffLine(part, index));
  const displayLines = allLines.slice(0, maxLines);
  const hasMore = allLines.length > maxLines;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>{filePath}</Text>
        <Text>
          <Text color="green">+{additions}</Text>
          <Text> </Text>
          <Text color="red">-{deletions}</Text>
        </Text>
      </Box>

      {/* Diff content */}
      <Box flexDirection="column">
        {displayLines}
        {hasMore && (
          <Text color="gray" italic>
            ... and {allLines.length - maxLines} more lines
          </Text>
        )}
      </Box>
    </Box>
  );
};
