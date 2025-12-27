/**
 * @fileoverview useArchonMCP hook - React hook for Archon MCP integration
 * @module shared/hooks/useArchonMCP
 */

import * as React from 'react';
import { ArchonMCPClient, defaultArchonMCPConfig, type ArchonMCPConfig, type ArchonConnectionStatus, type ArchonProject, type ArchonTask } from '../services/archon-mcp-client.js';
import type { TaskItem } from '../components/Layout/types.js';

/**
 * Return type for useArchonMCP hook
 */
export interface UseArchonMCPReturn {
  /** Current tasks from Archon MCP server */
  tasks: TaskItem[];
  /** Available projects from Archon MCP server */
  projects: ArchonProject[];
  /** Current connection status */
  connectionStatus: ArchonConnectionStatus;
  /** Whether currently loading data */
  isLoading: boolean;
  /** Refresh tasks from server */
  refreshTasks: () => Promise<void>;
  /** Refresh projects from server */
  refreshProjects: () => Promise<void>;
  /** Update task status */
  updateTaskStatus: (taskId: string, status: TaskItem['status']) => Promise<boolean>;
  /** Test connection to Archon MCP server */
  testConnection: () => Promise<boolean>;
  /** Update configuration */
  updateConfig: (config: Partial<ArchonMCPConfig>) => void;
  /** Current configuration */
  config: ArchonMCPConfig;
}

/**
 * React hook for Archon MCP integration.
 * 
 * Provides task management functionality with automatic synchronization,
 * connection monitoring, and fallback handling.
 */
export function useArchonMCP(
  initialConfig: Partial<ArchonMCPConfig> = {},
  fallbackTasks: TaskItem[] = []
): UseArchonMCPReturn {
  const [tasks, setTasks] = React.useState<TaskItem[]>(fallbackTasks);
  const [projects, setProjects] = React.useState<ArchonProject[]>([]);
  const [connectionStatus, setConnectionStatus] = React.useState<ArchonConnectionStatus>('disconnected');
  const [isLoading, setIsLoading] = React.useState(false);
  const [config, setConfig] = React.useState<ArchonMCPConfig>(() => ({
    ...defaultArchonMCPConfig,
    ...initialConfig,
  }));

  const archonClientRef = React.useRef<ArchonMCPClient | null>(null);

  // Initialize Archon MCP client
  React.useEffect(() => {
    if (config.enabled) {
      archonClientRef.current = new ArchonMCPClient(config);
      
      // Add connection status listener
      const handleConnectionStatusChange = (status: ArchonConnectionStatus) => {
        setConnectionStatus(status);
        
        // Auto-fetch data when connected
        if (status === 'connected') {
          refreshTasks();
          refreshProjects();
        } else if (status === 'error' || status === 'disconnected') {
          // Fall back to provided fallback tasks
          setTasks(fallbackTasks);
        }
      };

      archonClientRef.current.addConnectionListener(handleConnectionStatusChange);

      // Initial connection test
      archonClientRef.current.testConnection();

      return () => {
        archonClientRef.current?.removeConnectionListener(handleConnectionStatusChange);
        archonClientRef.current?.dispose();
        archonClientRef.current = null;
      };
    } else {
      // Use fallback tasks when disabled
      setTasks(fallbackTasks);
      setConnectionStatus('disconnected');
    }
  }, [config]);

  // Update fallback tasks when they change
  React.useEffect(() => {
    if (connectionStatus !== 'connected' || !config.enabled) {
      setTasks(fallbackTasks);
    }
  }, [fallbackTasks, connectionStatus, config.enabled]);

  // Refresh tasks from Archon MCP server
  const refreshTasks = React.useCallback(async () => {
    if (!config.enabled || !config.projectId) {
      return;
    }

    try {
      setIsLoading(true);
      
      // Call MCP function directly since it's available in the environment
      const response = await (globalThis as any).mcp_archon_find_tasks?.({
        project_id: config.projectId
      });

      if (response?.success && Array.isArray(response.tasks)) {
        const archonTasks = response.tasks.map((task: ArchonTask) => 
          archonClientRef.current?.convertArchonTaskToTaskItem(task) || {
            id: task.id,
            title: task.title,
            status: 'not-started' as const,
            description: task.description,
          }
        );
        setTasks(archonTasks);
      } else {
        // Use fallback tasks if no Archon tasks found
        setTasks(fallbackTasks);
      }
    } catch (error) {
      console.error('Failed to refresh tasks from Archon:', error);
      setTasks(fallbackTasks);
    } finally {
      setIsLoading(false);
    }
  }, [config.enabled, config.projectId, fallbackTasks]);

  // Refresh projects from Archon MCP server
  const refreshProjects = React.useCallback(async () => {
    if (!config.enabled) {
      return;
    }

    try {
      setIsLoading(true);
      
      // Call MCP function directly since it's available in the environment
      const response = await (globalThis as any).mcp_archon_find_projects?.({});

      if (response?.success && Array.isArray(response.projects)) {
        setProjects(response.projects);
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error('Failed to refresh projects from Archon:', error);
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [config.enabled]);

  // Update task status
  const updateTaskStatus = React.useCallback(async (taskId: string, status: TaskItem['status']): Promise<boolean> => {
    if (!config.enabled) {
      return false;
    }

    try {
      // Convert TaskStatus to Archon status
      const convertTaskStatusToArchon = (taskStatus: TaskItem['status']): string => {
        switch (taskStatus) {
          case 'not-started':
            return 'todo';
          case 'in-progress':
            return 'doing';
          case 'paused':
            return 'review';
          case 'completed':
            return 'done';
          case 'failed':
            return 'todo'; // Reset failed tasks to todo
          default:
            return 'todo';
        }
      };

      const archonStatus = convertTaskStatusToArchon(status);
      
      // Call MCP function directly since it's available in the environment
      const response = await (globalThis as any).mcp_archon_manage_task?.({
        action: 'update',
        task_id: taskId,
        status: archonStatus
      });

      if (response?.success) {
        // Refresh tasks to reflect the change
        await refreshTasks();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to update task status:', error);
      return false;
    }
  }, [config.enabled, refreshTasks]);

  // Test connection
  const testConnection = React.useCallback(async (): Promise<boolean> => {
    if (!config.enabled) {
      return false;
    }

    try {
      // Call MCP function directly since it's available in the environment
      const response = await (globalThis as any).mcp_archon_health_check?.();
      
      if (response?.success) {
        setConnectionStatus('connected');
        return true;
      } else {
        setConnectionStatus('error');
        return false;
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
      return false;
    }
  }, [config.enabled]);

  // Update configuration
  const updateConfig = React.useCallback((newConfig: Partial<ArchonMCPConfig>) => {
    setConfig(prevConfig => {
      const updatedConfig = { ...prevConfig, ...newConfig };
      
      // Update client config if it exists
      if (archonClientRef.current) {
        archonClientRef.current.updateConfig(newConfig);
      }
      
      return updatedConfig;
    });
  }, []);

  return {
    tasks,
    projects,
    connectionStatus,
    isLoading,
    refreshTasks,
    refreshProjects,
    updateTaskStatus,
    testConnection,
    updateConfig,
    config,
  };
}

/**
 * Hook for getting UI Upgrade project tasks specifically
 */
export function useUIUpgradeArchonTasks(fallbackTasks: TaskItem[] = []): UseArchonMCPReturn {
  // UI Upgrade project ID from Archon
  const uiUpgradeProjectId = '75bb8c80-f1c0-4752-a535-480e6a956fd1';
  
  return useArchonMCP({
    enabled: true,
    projectId: uiUpgradeProjectId,
    autoSync: true,
    syncInterval: 30000, // 30 seconds
    conflictResolution: 'remote',
  }, fallbackTasks);
}