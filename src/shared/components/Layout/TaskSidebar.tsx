/**
 * @fileoverview TaskSidebar component - Task list display with status indicators
 * @module shared/components/Layout/TaskSidebar
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { TaskSidebarProps, TaskItem } from './types.js';
import { createDefaultColorScheme, getTaskStatusEmoji, getTaskStatusColor } from './utils.js';
import { ScrollIndicator } from './ScrollIndicator.js';

/**
 * Individual task item component with status indicator and title.
 */
const TaskItemComponent: React.FC<{
  task: TaskItem;
  colorScheme: ReturnType<typeof createDefaultColorScheme>;
  onSelect?: (taskId: string) => void;
}> = ({ task, colorScheme, onSelect }) => {
  const statusEmoji = getTaskStatusEmoji(task.status);
  const statusColor = getTaskStatusColor(task.status, colorScheme);
  
  // Truncate long titles to fit in sidebar
  const maxTitleLength = 25; // Adjust based on typical sidebar width
  const displayTitle = task.title.length > maxTitleLength 
    ? `${task.title.substring(0, maxTitleLength - 3)}...`
    : task.title;

  const handleClick = React.useCallback(() => {
    if (onSelect) {
      onSelect(task.id);
    }
  }, [onSelect, task.id]);

  return (
    <Box
      flexDirection="row"
      paddingX={1}
    >
      <Text color={statusColor}>{statusEmoji}</Text>
      <Text> </Text>
      <Text 
        color={task.optional ? 'gray' : 'white'}
        dimColor={task.optional || false}
      >
        {displayTitle}
      </Text>
    </Box>
  );
};

/**
 * Sidebar component displaying current tasks with status indicators.
 * 
 * Shows tasks with emoji status indicators and supports scrolling for long lists.
 */
export const TaskSidebar: React.FC<TaskSidebarProps> = ({
  tasks,
  width,
  height,
  collapsed = false,
  scrollPosition = 0,
  colorScheme = createDefaultColorScheme(),
  onScrollChange,
  onTaskSelect,
}) => {
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  
  // Don't render if collapsed
  if (collapsed) {
    return null;
  }

  // Calculate visible area (subtract border and padding)
  const visibleHeight = Math.max(1, height - 2); // -2 for top and bottom borders
  const contentHeight = tasks.length;
  const hasScroll = contentHeight > visibleHeight;
  
  // Calculate which tasks to show based on scroll position
  const startIndex = Math.max(0, Math.floor(scrollPosition));
  const endIndex = Math.min(tasks.length, startIndex + visibleHeight);
  const visibleTasks = tasks.slice(startIndex, endIndex);

  // Handle task selection
  const handleTaskSelect = React.useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    if (onTaskSelect) {
      onTaskSelect(taskId);
    }
  }, [onTaskSelect]);

  // Handle scroll changes
  const handleScrollChange = React.useCallback((newPosition: number) => {
    if (onScrollChange) {
      onScrollChange(newPosition);
    }
  }, [onScrollChange]);

  return (
    <Box
      width={width}
      height={height}
      borderStyle="single"
      borderColor={colorScheme.colors.border}
      flexDirection="column"
    >
      {/* Header */}
      <Box paddingX={1} borderBottom borderColor={colorScheme.colors.border}>
        <Text color={colorScheme.colors.header} bold>
          Tasks ({tasks.length})
        </Text>
      </Box>

      {/* Task list content */}
      <Box flexDirection="column" flexGrow={1}>
        {tasks.length === 0 ? (
          <Box paddingX={1} paddingY={1}>
            <Text color="gray" dimColor>
              No tasks available
            </Text>
          </Box>
        ) : (
          <>
            {visibleTasks.map((task) => (
              <TaskItemComponent
                key={task.id}
                task={task}
                colorScheme={colorScheme}
                onSelect={handleTaskSelect}
              />
            ))}
            
            {/* Fill remaining space if needed */}
            {visibleTasks.length < visibleHeight && (
              <Box flexGrow={1} />
            )}
          </>
        )}
      </Box>

      {/* Scroll indicator */}
      {hasScroll && (
        <ScrollIndicator
          hasScroll={hasScroll}
          scrollPosition={scrollPosition / Math.max(1, contentHeight - visibleHeight)}
          contentHeight={contentHeight}
          visibleHeight={visibleHeight}
          width={1}
          height={visibleHeight}
          colorScheme={colorScheme}
        />
      )}
    </Box>
  );
};

export type { TaskSidebarProps };