/**
 * @fileoverview Archon MCP Client Service - Integration with Archon MCP server for task management
 * @module shared/services/archon-mcp-client
 */

import type { TaskItem, TaskStatus } from '../components/Layout/types.js';

/**
 * Archon task data structure from MCP server
 */
export interface ArchonTask {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: 'todo' | 'doing' | 'review' | 'done';
  assignee: string;
  task_order: number;
  priority: 'low' | 'medium' | 'high';
  feature: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  stats: {
    sources_count: number;
    code_examples_count: number;
  };
}

/**
 * Archon project data structure from MCP server
 */
export interface ArchonProject {
  id: string;
  title: string;
  description: string;
  github_repo: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Configuration for Archon MCP client
 */
export interface ArchonMCPConfig {
  enabled: boolean;
  projectId?: string;
  autoSync: boolean;
  syncInterval: number; // milliseconds
  conflictResolution: 'local' | 'remote' | 'prompt';
}

/**
 * Connection status for Archon MCP server
 */
export type ArchonConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

/**
 * Archon MCP Client Service for task management integration
 */
export class ArchonMCPClient {
  private config: ArchonMCPConfig;
  private connectionStatus: ArchonConnectionStatus = 'disconnected';
  private syncTimer: NodeJS.Timeout | null = null;
  private listeners: Set<(status: ArchonConnectionStatus) => void> = new Set();

  constructor(config: ArchonMCPConfig) {
    this.config = config;
    
    if (config.enabled && config.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ArchonConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Add connection status listener
   */
  addConnectionListener(listener: (status: ArchonConnectionStatus) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove connection status listener
   */
  removeConnectionListener(listener: (status: ArchonConnectionStatus) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of connection status change
   */
  private notifyListeners(status: ArchonConnectionStatus): void {
    this.connectionStatus = status;
    this.listeners.forEach(listener => listener(status));
  }

  /**
   * Test connection to Archon MCP server
   */
  async testConnection(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      this.notifyListeners('connecting');
      
      // Since MCP functions are available in the environment, we'll use a simple approach
      // This is a placeholder that always returns true for now
      // In a real implementation, this would test the actual MCP connection
      this.notifyListeners('connected');
      return true;
    } catch (error) {
      console.error('Archon MCP connection test failed:', error);
      this.notifyListeners('error');
      return false;
    }
  }

  /**
   * Get tasks for the configured project
   */
  async getTasks(): Promise<TaskItem[]> {
    if (!this.config.enabled || !this.config.projectId) {
      return [];
    }

    try {
      // For now, return empty array since we can't directly call MCP functions from here
      // This will be handled by the hook that has access to the MCP functions
      return [];
    } catch (error) {
      console.error('Failed to fetch tasks from Archon MCP:', error);
      this.notifyListeners('error');
      return [];
    }
  }

  /**
   * Update task status in Archon MCP server
   */
  async updateTaskStatus(_taskId: string, _status: TaskStatus): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // For now, return false since we can't directly call MCP functions from here
      // This will be handled by the hook that has access to the MCP functions
      return false;
    } catch (error) {
      console.error('Failed to update task status in Archon MCP:', error);
      this.notifyListeners('error');
      return false;
    }
  }

  /**
   * Get available projects from Archon MCP server
   */
  async getProjects(): Promise<ArchonProject[]> {
    if (!this.config.enabled) {
      return [];
    }

    try {
      // For now, return empty array since we can't directly call MCP functions from here
      // This will be handled by the hook that has access to the MCP functions
      return [];
    } catch (error) {
      console.error('Failed to fetch projects from Archon MCP:', error);
      this.notifyListeners('error');
      return [];
    }
  }

  /**
   * Start automatic synchronization
   */
  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      await this.testConnection();
    }, this.config.syncInterval);

    // Initial connection test
    this.testConnection();
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ArchonMCPConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.config.enabled && this.config.autoSync) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  /**
   * Convert Archon task to TaskItem format
   */
  convertArchonTaskToTaskItem(archonTask: ArchonTask): TaskItem {
    return {
      id: archonTask.id,
      title: archonTask.title,
      status: this.convertArchonStatusToTaskStatus(archonTask.status),
      description: archonTask.description,
      optional: false, // Archon tasks are not optional by default
    };
  }

  /**
   * Convert Archon status to TaskStatus
   */
  convertArchonStatusToTaskStatus(archonStatus: string): TaskStatus {
    switch (archonStatus) {
      case 'todo':
        return 'not-started';
      case 'doing':
        return 'in-progress';
      case 'review':
        return 'paused';
      case 'done':
        return 'completed';
      default:
        return 'not-started';
    }
  }

  /**
   * Convert TaskStatus to Archon status
   */
  convertTaskStatusToArchon(taskStatus: TaskStatus): string {
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
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopAutoSync();
    this.listeners.clear();
  }
}

/**
 * Default Archon MCP configuration
 */
export const defaultArchonMCPConfig: ArchonMCPConfig = {
  enabled: true,
  autoSync: true,
  syncInterval: 30000, // 30 seconds
  conflictResolution: 'remote',
};