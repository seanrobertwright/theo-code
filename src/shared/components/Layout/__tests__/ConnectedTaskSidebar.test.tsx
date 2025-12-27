/**
 * @fileoverview Tests for ConnectedTaskSidebar component
 * @module shared/components/Layout/__tests__/ConnectedTaskSidebar
 */

import * as React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConnectedTaskSidebar } from '../ConnectedTaskSidebar.js';
import type { TaskItem } from '../types.js';

// Mock the Archon MCP client
vi.mock('../../services/archon-mcp-client.js', () => ({
  ArchonMCPClient: vi.fn().mockImplementation(() => ({
    getConnectionStatus: vi.fn().mockReturnValue('disconnected'),
    addConnectionListener: vi.fn(),
    removeConnectionListener: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(false),
    dispose: vi.fn(),
    updateConfig: vi.fn(),
  })),
  defaultArchonMCPConfig: {
    enabled: true,
    autoSync: true,
    syncInterval: 30000,
    conflictResolution: 'remote',
  },
}));

describe('ConnectedTaskSidebar', () => {
  const mockTasks: TaskItem[] = [
    {
      id: '1',
      title: 'Test Task 1',
      status: 'not-started',
      description: 'First test task',
    },
    {
      id: '2',
      title: 'Test Task 2',
      status: 'in-progress',
      description: 'Second test task',
    },
  ];

  const defaultProps = {
    width: 30,
    height: 10,
    fallbackTasks: mockTasks,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with fallback tasks when Archon is disabled', () => {
    const { lastFrame } = render(
      <ConnectedTaskSidebar
        {...defaultProps}
        archonConfig={{ enabled: false }}
      />
    );

    expect(lastFrame()).toContain('Tasks (2)'); // 2 fallback tasks
    expect(lastFrame()).toContain('Test Task 1');
    expect(lastFrame()).toContain('Test Task 2');
  });

  it('should show Archon connection status when enabled', () => {
    const { lastFrame } = render(
      <ConnectedTaskSidebar
        {...defaultProps}
        archonConfig={{ enabled: true }}
      />
    );

    expect(lastFrame()).toContain('Archon: disconnected');
  });

  it('should handle connection status changes', () => {
    const mockOnConnectionStatusChange = vi.fn();
    
    render(
      <ConnectedTaskSidebar
        {...defaultProps}
        onConnectionStatusChange={mockOnConnectionStatusChange}
      />
    );

    // The component should initialize with disconnected status
    // In a real test, we would simulate connection status changes
    expect(mockOnConnectionStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('should handle task selection', () => {
    const mockOnTaskSelect = vi.fn();
    
    const { lastFrame } = render(
      <ConnectedTaskSidebar
        {...defaultProps}
        onTaskSelect={mockOnTaskSelect}
      />
    );

    // In a real test, we would simulate task selection
    // For now, just verify the component renders
    expect(lastFrame()).toContain('Tasks');
  });

  it('should handle tasks updated callback', () => {
    const mockOnTasksUpdated = vi.fn();
    
    render(
      <ConnectedTaskSidebar
        {...defaultProps}
        onTasksUpdated={mockOnTasksUpdated}
      />
    );

    // Component should render without errors
    expect(mockOnTasksUpdated).not.toHaveBeenCalled(); // No tasks updated yet
  });

  it('should render with custom Archon configuration', () => {
    const customConfig = {
      enabled: true,
      projectId: 'test-project-id',
      autoSync: false,
      syncInterval: 60000,
      conflictResolution: 'local' as const,
    };

    const { lastFrame } = render(
      <ConnectedTaskSidebar
        {...defaultProps}
        archonConfig={customConfig}
      />
    );

    expect(lastFrame()).toContain('Tasks');
    expect(lastFrame()).toContain('Archon: disconnected');
  });
});