/**
 * @fileoverview Connected TaskSidebar component - TaskSidebar with Archon MCP integration
 * @module shared/components/Layout/ConnectedTaskSidebar
 */

import * as React from 'react';
import { TaskSidebar } from './TaskSidebar.js';
import { ArchonMCPClient, defaultArchonMCPConfig, type ArchonMCPConfig, type ArchonConnectionStatus } from '../../services/archon-mcp-client.js';
import type { TaskSidebarProps, TaskItem } from './types.js';
import { createDefaultColorScheme } from './utils.js';

const EMPTY_TASKS: TaskItem[] = [];
const EMPTY_ARCHON_CONFIG: Partial<ArchonMCPConfig> = {};

/**
 * Props for ConnectedTaskSidebar component
 */
export interface ConnectedTaskSidebarProps extends Omit<TaskSidebarProps, 'tasks'> {
  /** Local fallback tasks when Archon is offline */
  fallbackTasks?: TaskItem[];
  /** Archon MCP configuration */
  archonConfig?: Partial<ArchonMCPConfig>;
  /** Callback when connection status changes */
  onConnectionStatusChange?: (status: ArchonConnectionStatus) => void;
  /** Callback when tasks are updated from Archon */
  onTasksUpdated?: (tasks: TaskItem[]) => void;
}

/**
 * TaskSidebar component with Archon MCP integration.
 * 
 * Automatically fetches tasks from Archon MCP server when available,
 * falls back to local tasks when offline, and provides real-time synchronization.
 */
export const ConnectedTaskSidebar: React.FC<ConnectedTaskSidebarProps> = ({
  fallbackTasks = EMPTY_TASKS,
  archonConfig = EMPTY_ARCHON_CONFIG,
  onConnectionStatusChange,
  onTasksUpdated,
  onTaskSelect,
  ...taskSidebarProps
}) => {
  const [tasks, setTasks] = React.useState<TaskItem[]>(fallbackTasks);
  const [connectionStatus, setConnectionStatus] = React.useState<ArchonConnectionStatus>('disconnected');
  const [isLoading, setIsLoading] = React.useState(false);
  const archonClientRef = React.useRef<ArchonMCPClient | null>(null);

  // Merge config with defaults
  const config = React.useMemo(() => ({
    ...defaultArchonMCPConfig,
    ...archonConfig,
  }), [archonConfig]);

  // Fetch tasks from Archon MCP server
  const fetchTasks = React.useCallback(async () => {
    if (!archonClientRef.current || !config.enabled) {
      return;
    }

    try {
      setIsLoading(true);
      const archonTasks = await archonClientRef.current.getTasks();
      
      if (archonTasks.length > 0) {
        setTasks(archonTasks);
        onTasksUpdated?.(archonTasks);
      } else {
        // Use fallback tasks if no Archon tasks found
        setTasks(fallbackTasks);
      }
    } catch (error) {
      console.error('Failed to fetch tasks from Archon:', error);
      setTasks(fallbackTasks);
    } finally {
      setIsLoading(false);
    }
  }, [config.enabled, fallbackTasks, onTasksUpdated]);

  // Initialize Archon MCP client
  React.useEffect(() => {
    if (config.enabled) {
      archonClientRef.current = new ArchonMCPClient(config);

      // Emit initial status for callers/tests
      onConnectionStatusChange?.('disconnected');
      
      // Add connection status listener
      const handleConnectionStatusChange = (status: ArchonConnectionStatus) => {
        setConnectionStatus(status);
        onConnectionStatusChange?.(status);
        
        // Fetch tasks when connected
        if (status === 'connected') {
          fetchTasks();
        } else if (status === 'error' || status === 'disconnected') {
          // Fall back to local tasks when connection fails
          setTasks(fallbackTasks);
        }
      };

      archonClientRef.current.addConnectionListener(handleConnectionStatusChange);

      // Initial connection test and task fetch
      archonClientRef.current.testConnection();

      return () => {
        archonClientRef.current?.removeConnectionListener(handleConnectionStatusChange);
        archonClientRef.current?.dispose();
        archonClientRef.current = null;
      };
    } else {
      // Use fallback tasks when Archon is disabled
      setTasks(fallbackTasks);
      setConnectionStatus('disconnected');
      
      // No cleanup needed when disabled
      return undefined;
    }
  }, [config, fallbackTasks, onConnectionStatusChange, fetchTasks]);

  // Handle task selection with optional status update
  const handleTaskSelect = React.useCallback(async (taskId: string) => {
    // Call the original onTaskSelect callback
    onTaskSelect?.(taskId);

    // Optionally update task status in Archon when selected
    if (archonClientRef.current && connectionStatus === 'connected') {
      try {
        // Find the selected task
        const selectedTask = tasks.find(task => task.id === taskId);
        if (selectedTask && selectedTask.status === 'not-started') {
          // Mark as in-progress when selected
          await archonClientRef.current.updateTaskStatus(taskId, 'in-progress');
          
          // Refresh tasks to reflect the change
          await fetchTasks();
        }
      } catch (error) {
        console.error('Failed to update task status in Archon:', error);
      }
    }
  }, [onTaskSelect, connectionStatus, tasks, fetchTasks]);

  // Refresh tasks periodically or on demand
  const refreshTasks = React.useCallback(() => {
    if (connectionStatus === 'connected') {
      fetchTasks();
    }
  }, [connectionStatus, fetchTasks]);

  // Add connection status indicator to tasks
  const tasksWithStatus = React.useMemo(() => {
    if (!config.enabled) {
      return tasks;
    }

    // Add a status indicator task at the top
    const statusTask: TaskItem = {
      id: '__archon_status__',
      title: `Archon: ${connectionStatus}${isLoading ? ' (syncing...)' : ''}`,
      status: connectionStatus === 'connected' ? 'completed' : 
              connectionStatus === 'connecting' ? 'in-progress' :
              connectionStatus === 'error' ? 'failed' : 'not-started',
      description: `Archon MCP server status: ${connectionStatus}`,
      optional: true,
    };

    return [statusTask, ...tasks];
  }, [tasks, connectionStatus, isLoading, config.enabled]);

  // Create enhanced color scheme with connection status colors
  const colorScheme = React.useMemo(() => {
    const defaultScheme = createDefaultColorScheme();
    return {
      ...defaultScheme,
      colors: {
        ...defaultScheme.colors,
        // Add connection status colors
        archonConnected: 'green',
        archonDisconnected: 'gray',
        archonError: 'red',
        archonConnecting: 'yellow',
      },
    };
  }, []);

  return (
    <TaskSidebar
      {...taskSidebarProps}
      tasks={tasksWithStatus}
      colorScheme={colorScheme}
      onTaskSelect={handleTaskSelect}
    />
  );
};
