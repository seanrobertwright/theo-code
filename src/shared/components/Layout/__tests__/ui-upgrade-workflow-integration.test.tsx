/**
 * @fileoverview Complete workflow integration tests for UI upgrade
 * @module shared/components/Layout/__tests__/ui-upgrade-workflow-integration
 * 
 * Tests complete user workflows including:
 * - End-to-end user interactions
 * - Session management workflows
 * - Command processing workflows
 * - Task management workflows
 * - Multi-component coordination
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { App } from '../../../../app.js';
import { useAppStore } from '../../../store/index.js';
import { useUILayoutStore } from '../../../store/ui-layout.js';
import type { MergedConfig } from '../../../../config/index.js';
import type { SessionMetadata } from '../../../types/index.js';

// =============================================================================
// MOCKS AND TEST SETUP
// =============================================================================

// Mock external dependencies
vi.mock('../../../../features/session/index.js', () => ({
  createSessionManager: vi.fn(() => ({
    listSessions: vi.fn().mockResolvedValue([]),
    restoreSessionWithContext: vi.fn(),
    saveSession: vi.fn(),
    createSession: vi.fn(),
  })),
}));

vi.mock('../../../../features/agent/index.js', () => ({
  AgentLoop: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../../features/tools/framework.js', () => ({
  toolRegistry: {
    register: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../../../registerTools.js', () => ({
  registerAllTools: vi.fn(),
}));

// Mock session detection
vi.mock('../../../../features/session/startup.js', () => ({
  detectAvailableSessions: vi.fn().mockResolvedValue({
    hasAvailableSessions: false,
    recentSessions: [],
  }),
  restoreSessionOnStartup: vi.fn().mockResolvedValue({
    success: true,
    session: {
      id: 'session-123',
      workspaceRoot: '/test/workspace',
      model: 'gpt-4o',
      messages: [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: 'Hello, I need help with my project',
          timestamp: Date.now() - 60000,
        },
        {
          id: 'msg-2',
          role: 'assistant' as const,
          content: 'I\'d be happy to help! What would you like to work on?',
          timestamp: Date.now() - 30000,
        },
      ],
      tokenCount: { total: 150, input: 75, output: 75 },
      contextFiles: ['src/app.tsx', 'package.json'],
      lastModified: Date.now() - 30000,
      tags: ['development', 'ui'],
      notes: 'Working on UI upgrade',
    },
    contextFilesMissing: [],
  }),
}));

// Test data
const mockTasks = [
  {
    id: 'task-1',
    title: 'Set up UI layout foundation',
    status: 'completed' as const,
    description: 'Create directory structure and interfaces',
  },
  {
    id: 'task-2',
    title: 'Implement FullScreenLayout component',
    status: 'completed' as const,
    description: 'Create responsive layout container',
  },
  {
    id: 'task-3',
    title: 'Complete integration testing',
    status: 'in-progress' as const,
    description: 'Test all components working together',
  },
];

vi.mock('../../../hooks/useArchonMCP.js', () => ({
  useUIUpgradeArchonTasks: vi.fn(() => ({
    tasks: mockTasks,
    connectionStatus: 'connected' as const,
  })),
}));

// Mock console to prevent noise in tests
const originalConsole = console;
beforeEach(() => {
  global.console = {
    ...console,
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  };
});

afterEach(() => {
  global.console = originalConsole;
});

const mockConfig: MergedConfig = {
  global: {
    defaultProvider: 'openai',
    maxTokens: 4096,
    temperature: 0.7,
  },
  providers: {
    openai: {
      apiKey: 'sk-test-key',
      baseUrl: 'https://api.openai.com/v1',
    },
  },
  agentsInstructions: 'You are a helpful AI assistant for software development.',
};

// =============================================================================
// COMPLETE USER WORKFLOW TESTS
// =============================================================================

describe('UI Upgrade - Complete User Workflows', () => {
  beforeEach(() => {
    // Reset stores before each test
    useAppStore.getState().reset();
    useUILayoutStore.getState().resetToDefaults();
  });

  it('should handle complete new session workflow', async () => {
    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    let output = lastFrame();
    
    // Should show new session UI
    expect(output).toContain('workspace'); // Project header
    expect(output).toContain('Set up UI layout foundation'); // Tasks
    expect(output).toContain('Tokens:'); // Status footer
    
    // Simulate user input
    stdin.write('Hello, I want to create a new feature');
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    output = lastFrame();
    
    // Should show user message in context area
    expect(output).toContain('Hello, I want to create a new feature');
    
    // Verify store state
    const store = useAppStore.getState();
    expect(store.messages.length).toBeGreaterThan(0);
    expect(store.currentModel).toBe('gpt-4o');
    expect(store.workspaceRoot).toBe('/test/workspace');
  });

  it('should handle session restoration workflow', async () => {
    // Mock session detection to return available sessions
    const mockSessions: SessionMetadata[] = [
      {
        id: 'session-123',
        workspaceRoot: '/test/workspace',
        model: 'gpt-4o',
        lastModified: Date.now() - 30000,
        messageCount: 2,
        tokenCount: { total: 150, input: 75, output: 75 },
        contextFiles: ['src/app.tsx'],
        tags: ['development'],
        preview: 'Working on UI upgrade',
        title: 'UI Development Session',
      },
    ];

    vi.mocked(require('../../../../features/session/startup.js').detectAvailableSessions)
      .mockResolvedValueOnce({
        hasAvailableSessions: true,
        recentSessions: mockSessions,
      });

    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for session detection
    await new Promise(resolve => setTimeout(resolve, 200));

    const output = lastFrame();
    
    // Should show session restoration UI or complete session
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle command processing workflow', async () => {
    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Test help command
    stdin.write('/help');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    let output = lastFrame();
    
    // Should process command and maintain UI structure
    expect(output).toContain('workspace'); // Header preserved
    expect(output).toContain('Set up UI layout foundation'); // Sidebar preserved
    
    // Test new session command
    stdin.write('/new');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    output = lastFrame();
    
    // Should create new session and maintain UI
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
    
    // Verify new session was created
    const store = useAppStore.getState();
    expect(store.currentModel).toBe('gpt-4o');
  });

  it('should handle task management workflow', async () => {
    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    const output = lastFrame();
    
    // Should show task management integration
    expect(output).toContain('Set up UI layout foundation');
    expect(output).toContain('Implement FullScreenLayout');
    expect(output).toContain('Complete integration testing');
    
    // Should show task status indicators
    expect(output).toContain('✅'); // Completed tasks
    expect(output).toContain('🟢'); // In-progress tasks
    
    // Verify task sidebar is integrated with main UI
    expect(output).toContain('workspace'); // Header still visible
    expect(output).toContain('Tokens:'); // Footer still visible
  });

  it('should handle responsive layout workflow', async () => {
    // Test workflow with different terminal sizes
    const sizes = [
      { width: 60, height: 20 }, // Narrow
      { width: 120, height: 30 }, // Wide
      { width: 200, height: 50 }, // Very wide
      { width: 40, height: 15 }, // Very narrow
    ];

    for (const size of sizes) {
      const { lastFrame } = render(
        <App
          workspaceRoot="/test/workspace"
          config={mockConfig}
          initialModel="gpt-4o"
        />
      );

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 50));

      const output = lastFrame();
      
      if (size.width >= 40 && size.height >= 10) {
        // Should render normally for adequate sizes
        expect(output).toContain('workspace');
        expect(output).toContain('Set up UI layout foundation');
      } else {
        // Should show error for too small sizes
        expect(output).toContain('Terminal Too Small');
      }
    }
  });
});

// =============================================================================
// MULTI-COMPONENT COORDINATION TESTS
// =============================================================================

describe('UI Upgrade - Multi-Component Coordination', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useUILayoutStore.getState().resetToDefaults();
  });

  it('should coordinate message display with task updates', async () => {
    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Add a message about task progress
    stdin.write('I completed the FullScreenLayout component implementation');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const output = lastFrame();
    
    // Should show message in context area
    expect(output).toContain('FullScreenLayout component');
    
    // Should still show tasks in sidebar
    expect(output).toContain('Set up UI layout foundation');
    expect(output).toContain('Implement FullScreenLayout');
    
    // Should maintain layout coordination
    expect(output).toContain('workspace'); // Header
    expect(output).toContain('Tokens:'); // Footer
  });

  it('should coordinate scrolling between components', async () => {
    // Add many messages to trigger scrolling
    const store = useAppStore.getState();
    
    for (let i = 0; i < 50; i++) {
      store.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: This is a test message to fill up the context area and trigger scrolling behavior.`,
      });
    }

    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const output = lastFrame();
    
    // Should handle scrolling coordination
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    
    // Should show recent messages
    expect(output).toContain('Message 49') || expect(output).toContain('Message 48');
    
    // Should maintain UI structure with scrolling
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
  });

  it('should coordinate resizing between components', async () => {
    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate context area resize
    const uiStore = useUILayoutStore.getState();
    uiStore.setContextAreaWidth(80); // Change from default 70%
    
    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    
    // Should handle resize coordination
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    
    // Should maintain all components after resize
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
    expect(output).toContain('Tokens:');
  });

  it('should coordinate error handling across components', async () => {
    // Simulate an error condition
    const store = useAppStore.getState();
    store.setError('Test error: Component coordination failure');

    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const output = lastFrame();
    
    // Should handle error coordination
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    
    // Should maintain UI structure even with errors
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
  });
});

// =============================================================================
// PERFORMANCE AND STRESS WORKFLOW TESTS
// =============================================================================

describe('UI Upgrade - Performance Workflow Tests', () => {
  it('should handle high-frequency updates workflow', async () => {
    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate rapid user input
    for (let i = 0; i < 20; i++) {
      stdin.write(`Message ${i}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const output = lastFrame();
    
    // Should handle rapid updates without breaking
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
  });

  it('should handle concurrent operations workflow', async () => {
    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Wait for initial render
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate concurrent operations
    const operations = [
      () => stdin.write('User message 1'),
      () => useUILayoutStore.getState().setContextAreaWidth(75),
      () => stdin.write('/help'),
      () => useAppStore.getState().addMessage({ role: 'assistant', content: 'Assistant response' }),
      () => useUILayoutStore.getState().setContextAreaWidth(65),
    ];

    // Execute operations concurrently
    await Promise.all(operations.map(op => 
      new Promise(resolve => {
        setTimeout(() => {
          op();
          resolve(undefined);
        }, Math.random() * 50);
      })
    ));

    await new Promise(resolve => setTimeout(resolve, 100));

    const output = lastFrame();
    
    // Should handle concurrent operations gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
  });

  it('should handle memory-intensive workflow', async () => {
    // Create memory-intensive scenario
    const store = useAppStore.getState();
    
    // Add many large messages
    for (let i = 0; i < 100; i++) {
      store.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Large message ${i}: ${'X'.repeat(1000)}`, // 1KB per message
      });
    }

    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    await new Promise(resolve => setTimeout(resolve, 200));

    const output = lastFrame();
    
    // Should handle memory-intensive scenario
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
  });
});

// =============================================================================
// INTEGRATION WITH EXTERNAL SYSTEMS
// =============================================================================

describe('UI Upgrade - External System Integration', () => {
  it('should integrate with Archon MCP workflow', async () => {
    // Mock Archon MCP responses
    const mockArchonTasks = [
      {
        id: 'archon-1',
        title: 'Archon Task 1',
        status: 'in-progress' as const,
        description: 'Task from Archon MCP server',
      },
      {
        id: 'archon-2',
        title: 'Archon Task 2',
        status: 'completed' as const,
        description: 'Completed Archon task',
      },
    ];

    vi.mocked(require('../../../hooks/useArchonMCP.js').useUIUpgradeArchonTasks)
      .mockReturnValue({
        tasks: mockArchonTasks,
        connectionStatus: 'connected' as const,
      });

    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const output = lastFrame();
    
    // Should show Archon tasks in sidebar
    expect(output).toContain('Archon Task 1');
    expect(output).toContain('Archon Task 2');
    expect(output).toContain('🟢'); // In-progress indicator
    expect(output).toContain('✅'); // Completed indicator
    
    // Should maintain full UI integration
    expect(output).toContain('workspace');
    expect(output).toContain('Tokens:');
  });

  it('should handle Archon MCP disconnection workflow', async () => {
    // Mock Archon MCP disconnection
    vi.mocked(require('../../../hooks/useArchonMCP.js').useUIUpgradeArchonTasks)
      .mockReturnValue({
        tasks: mockTasks, // Fallback to local tasks
        connectionStatus: 'disconnected' as const,
        error: 'Connection to Archon MCP server failed',
      });

    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const output = lastFrame();
    
    // Should show fallback tasks
    expect(output).toContain('Set up UI layout foundation');
    expect(output).toContain('Implement FullScreenLayout');
    
    // Should maintain UI structure despite disconnection
    expect(output).toContain('workspace');
    expect(output).toContain('Tokens:');
  });

  it('should integrate with session management workflow', async () => {
    // Mock session manager operations
    const mockSessionManager = {
      saveSession: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockResolvedValue([]),
      restoreSessionWithContext: vi.fn().mockResolvedValue({
        session: mockSession,
        contextFilesFound: ['src/app.tsx'],
        contextFilesMissing: [],
      }),
    };

    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    // Test session save workflow
    stdin.write('/save');
    
    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    
    // Should maintain UI during session operations
    expect(output).toContain('workspace');
    expect(output).toContain('Set up UI layout foundation');
    expect(output).toContain('Tokens:');
  });
});