/**
 * @fileoverview Comprehensive integration tests for UI upgrade
 * @module shared/components/Layout/__tests__/ui-upgrade-integration
 * 
 * Tests complete system integration including:
 * - All components working together
 * - Existing functionality preservation
 * - Edge cases and error scenarios
 * - Complete system integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { App } from '../../../../app.js';
import { FullScreenLayout } from '../FullScreenLayout.js';
import { ResponsiveLayoutContent } from '../ResponsiveLayoutContent.js';
import { ContextArea } from '../ContextArea.js';
import { TaskSidebar } from '../TaskSidebar.js';
import { ResizableDivider } from '../ResizableDivider.js';
import { useAppStore } from '../../../store/index.js';
import { useUILayoutStore } from '../../../store/ui-layout.js';
import type { Message } from '../../../types/index.js';
import type { TaskItem } from '../types.js';
import type { MergedConfig } from '../../../../config/index.js';

// =============================================================================
// MOCKS AND TEST DATA
// =============================================================================

// Mock external dependencies
vi.mock('../../../../features/session/index.js', () => ({
  createSessionManager: vi.fn(() => ({
    listSessions: vi.fn().mockResolvedValue([]),
    restoreSessionWithContext: vi.fn(),
    saveSession: vi.fn(),
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

// Test data
const mockMessages: Message[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, I need help with my project',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'I\'d be happy to help! What specific aspect of your project would you like to work on?',
    timestamp: Date.now() - 30000,
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'I want to implement a new feature for user authentication',
    timestamp: Date.now() - 15000,
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content: 'Great! Let\'s start by analyzing your current authentication system. Here\'s what I recommend:\n\n```typescript\ninterface AuthConfig {\n  provider: string;\n  apiKey: string;\n  redirectUrl: string;\n}\n```\n\nThis will give us a solid foundation.',
    timestamp: Date.now(),
  },
];

const mockTasks: TaskItem[] = [
  {
    id: 'task-1',
    title: 'Set up UI layout foundation',
    status: 'completed',
    description: 'Create directory structure and interfaces',
  },
  {
    id: 'task-2',
    title: 'Implement FullScreenLayout component',
    status: 'completed',
    description: 'Create responsive layout container',
  },
  {
    id: 'task-3',
    title: 'Integrate new UI with existing App',
    status: 'in-progress',
    description: 'Replace existing layout with FullScreenLayout',
  },
  {
    id: 'task-4',
    title: 'Add responsive breakpoint behavior',
    status: 'not-started',
    description: 'Implement vertical stacking for narrow terminals',
  },
  {
    id: 'task-5',
    title: 'Complete integration testing',
    status: 'in-progress',
    description: 'Test all components working together',
  },
];

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
  agentsInstructions: 'You are a helpful AI assistant.',
};

// =============================================================================
// FULL SYSTEM INTEGRATION TESTS
// =============================================================================

describe('UI Upgrade - Full System Integration', () => {
  beforeEach(() => {
    // Reset stores before each test
    useAppStore.getState().reset();
    useUILayoutStore.getState().reset();
    
    // Set up initial state
    useAppStore.getState().setWorkspaceRoot('/test/workspace');
    useAppStore.getState().setCurrentModel('gpt-4o');
    useAppStore.getState().createNewSession('gpt-4o');
    
    // Add test messages
    mockMessages.forEach(message => {
      useAppStore.getState().addMessage(message);
    });
  });

  it('should render complete UI with all sections', () => {
    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    const output = lastFrame();
    
    // Should contain all major UI sections
    expect(output).toContain('workspace'); // Project header
    expect(output).toContain('Hello, I need help'); // Context area with messages
    expect(output).toContain('Set up UI layout foundation'); // Task sidebar
    expect(output).toContain('Tokens:'); // Status footer
  });

  it('should preserve all existing functionality', () => {
    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    const output = lastFrame();
    
    // Verify message display functionality is preserved
    expect(output).toContain('Hello, I need help with my project');
    expect(output).toContain('I\'d be happy to help!');
    expect(output).toContain('user authentication');
    expect(output).toContain('interface AuthConfig');
    
    // Verify task management functionality is preserved
    expect(output).toContain('✅'); // Completed tasks
    expect(output).toContain('🟢'); // In-progress tasks
    expect(output).toContain('🔴'); // Not-started tasks
    
    // Verify status information is preserved
    expect(output).toContain('gpt-4o'); // Current model
  });

  it('should handle session management integration', () => {
    // Test that session state is properly integrated with new UI
    const store = useAppStore.getState();
    
    expect(store.messages).toHaveLength(4);
    expect(store.currentModel).toBe('gpt-4o');
    expect(store.workspaceRoot).toBe('/test/workspace');
    
    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    const output = lastFrame();
    
    // Verify session data is displayed correctly
    expect(output).toContain('workspace');
    expect(output).toContain('gpt-4o');
    expect(output).toContain('4'); // Message count or similar session info
  });

  it('should handle command processing integration', () => {
    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Simulate command input (this tests that input handling is preserved)
    stdin.write('/help');
    
    const output = lastFrame();
    
    // Should still show the UI structure even when processing commands
    expect(output).toContain('workspace'); // Header still visible
    expect(output).toContain('Set up UI layout foundation'); // Sidebar still visible
  });
});

// =============================================================================
// COMPONENT INTEGRATION TESTS
// =============================================================================

describe('UI Upgrade - Component Integration', () => {
  beforeEach(() => {
    useUILayoutStore.getState().reset();
  });

  it('should integrate FullScreenLayout with all child components', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={120} terminalHeight={30}>
        <ResponsiveLayoutContent
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          inputValue=""
          onInputChange={vi.fn()}
          onInputSubmit={vi.fn()}
          tasks={mockTasks}
          terminalWidth={120}
          terminalHeight={30}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should render all integrated components
    expect(output).toContain('Hello, I need help'); // Messages from ContextArea
    expect(output).toContain('Set up UI layout foundation'); // Tasks from TaskSidebar
    expect(output).toContain('workspace'); // Project name from header
    expect(output).toContain('Tokens:'); // Status from footer
  });

  it('should handle responsive layout integration', () => {
    // Test narrow terminal (should trigger vertical layout)
    const { lastFrame: narrowFrame } = render(
      <FullScreenLayout terminalWidth={60} terminalHeight={20}>
        <ResponsiveLayoutContent
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          inputValue=""
          onInputChange={vi.fn()}
          onInputSubmit={vi.fn()}
          tasks={mockTasks}
          terminalWidth={60}
          terminalHeight={20}
        />
      </FullScreenLayout>
    );

    const narrowOutput = narrowFrame();
    
    // Should still render content but in vertical layout
    expect(narrowOutput).toContain('Hello, I need help');
    expect(narrowOutput).toContain('Set up UI layout foundation');
    
    // Test wide terminal (should use horizontal layout)
    const { lastFrame: wideFrame } = render(
      <FullScreenLayout terminalWidth={150} terminalHeight={40}>
        <ResponsiveLayoutContent
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          inputValue=""
          onInputChange={vi.fn()}
          onInputSubmit={vi.fn()}
          tasks={mockTasks}
          terminalWidth={150}
          terminalHeight={40}
        />
      </FullScreenLayout>
    );

    const wideOutput = wideFrame();
    
    // Should render with horizontal layout
    expect(wideOutput).toContain('Hello, I need help');
    expect(wideOutput).toContain('Set up UI layout foundation');
  });

  it('should integrate ContextArea with MessageList and scrolling', () => {
    const onScrollChange = vi.fn();
    
    const { lastFrame } = render(
      <ContextArea
        messages={mockMessages}
        streamingText="Currently typing..."
        isStreaming={true}
        width={80}
        height={20}
        onScrollChange={onScrollChange}
      />
    );

    const output = lastFrame();
    
    // Should display messages with proper integration
    expect(output).toContain('Hello, I need help');
    expect(output).toContain('I\'d be happy to help!');
    expect(output).toContain('interface AuthConfig');
    expect(output).toContain('Currently typing...');
  });

  it('should integrate TaskSidebar with task status management', () => {
    const { lastFrame } = render(
      <TaskSidebar
        tasks={mockTasks}
        width={40}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should display tasks with proper status indicators
    expect(output).toContain('✅'); // Completed
    expect(output).toContain('🟢'); // In progress
    expect(output).toContain('🔴'); // Not started
    expect(output).toContain('Set up UI layout foundation');
    expect(output).toContain('Implement FullScreenLayout');
  });

  it('should integrate ResizableDivider with layout management', () => {
    const onResize = vi.fn();
    
    const { lastFrame } = render(
      <ResizableDivider
        onResize={onResize}
        minContextWidth={50}
        maxContextWidth={90}
        currentContextWidth={70}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should render divider (may be minimal visual representation)
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// ERROR HANDLING AND EDGE CASES
// =============================================================================

describe('UI Upgrade - Error Handling and Edge Cases', () => {
  it('should handle extremely small terminal dimensions', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={20} terminalHeight={5}>
        <ResponsiveLayoutContent
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          inputValue=""
          onInputChange={vi.fn()}
          onInputSubmit={vi.fn()}
          tasks={mockTasks}
          terminalWidth={20}
          terminalHeight={5}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should show error message for too small terminal
    expect(output).toContain('Terminal Too Small');
    expect(output).toContain('Minimum: 40x10');
    expect(output).toContain('Current: 20x5');
  });

  it('should handle invalid terminal dimensions', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={0} terminalHeight={0}>
        <ResponsiveLayoutContent
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          inputValue=""
          onInputChange={vi.fn()}
          onInputSubmit={vi.fn()}
          tasks={mockTasks}
          terminalWidth={0}
          terminalHeight={0}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle gracefully with error message
    expect(output).toContain('Terminal Too Small');
  });

  it('should handle empty message list', () => {
    const { lastFrame } = render(
      <ContextArea
        messages={[]}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should render empty context area without errors
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle empty task list', () => {
    const { lastFrame } = render(
      <TaskSidebar
        tasks={[]}
        width={40}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should render empty task sidebar without errors
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle malformed messages', () => {
    const malformedMessages: Message[] = [
      {
        id: 'bad-1',
        role: 'user',
        content: '', // Empty content
        timestamp: Date.now(),
      },
      {
        id: 'bad-2',
        role: 'assistant',
        content: 'A'.repeat(10000), // Very long content
        timestamp: Date.now(),
      },
      // @ts-expect-error - Testing malformed message
      {
        id: 'bad-3',
        role: 'invalid-role',
        content: 'Test message',
        timestamp: 'invalid-timestamp',
      },
    ];

    const { lastFrame } = render(
      <ContextArea
        messages={malformedMessages}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle malformed messages gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle malformed tasks', () => {
    const malformedTasks: TaskItem[] = [
      {
        id: 'bad-task-1',
        title: '', // Empty title
        status: 'completed',
        description: 'Test task',
      },
      // @ts-expect-error - Testing malformed task
      {
        id: 'bad-task-2',
        title: 'Test task',
        status: 'invalid-status',
        description: undefined,
      },
    ];

    const { lastFrame } = render(
      <TaskSidebar
        tasks={malformedTasks}
        width={40}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle malformed tasks gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle rapid terminal resizing', () => {
    let currentWidth = 80;
    let currentHeight = 24;
    
    const TestComponent = () => (
      <FullScreenLayout terminalWidth={currentWidth} terminalHeight={currentHeight}>
        <ResponsiveLayoutContent
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          inputValue=""
          onInputChange={vi.fn()}
          onInputSubmit={vi.fn()}
          tasks={mockTasks}
          terminalWidth={currentWidth}
          terminalHeight={currentHeight}
        />
      </FullScreenLayout>
    );

    const { lastFrame, rerender } = render(<TestComponent />);
    
    // Simulate rapid resizing
    for (let i = 0; i < 10; i++) {
      currentWidth = 80 + (i * 10);
      currentHeight = 24 + (i * 2);
      rerender(<TestComponent />);
    }

    const output = lastFrame();
    
    // Should handle rapid resizing without errors
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Hello, I need help'); // Content should still be visible
  });

  it('should handle streaming text edge cases', () => {
    const { lastFrame } = render(
      <ContextArea
        messages={mockMessages}
        streamingText="🚀 Processing your request with special characters: áéíóú ñ 中文 🎉"
        isStreaming={true}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle special characters in streaming text
    expect(output).toContain('Processing your request');
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// PERFORMANCE AND STRESS TESTS
// =============================================================================

describe('UI Upgrade - Performance and Stress Tests', () => {
  it('should handle large message history', () => {
    const largeMessageList: Message[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}: This is a test message with some content to simulate real usage.`,
      timestamp: Date.now() - (1000 - i) * 1000,
    }));

    const { lastFrame } = render(
      <ContextArea
        messages={largeMessageList}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle large message list without errors
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle large task list', () => {
    const largeTaskList: TaskItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}: Complete implementation step`,
      status: ['not-started', 'in-progress', 'completed', 'failed'][i % 4] as TaskItem['status'],
      description: `Description for task ${i} with detailed information about what needs to be done.`,
    }));

    const { lastFrame } = render(
      <TaskSidebar
        tasks={largeTaskList}
        width={40}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle large task list without errors
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle complex message content', () => {
    const complexMessages: Message[] = [
      {
        id: 'complex-1',
        role: 'user',
        content: 'Can you help me with this code?\n\n```typescript\ninterface ComplexType<T extends Record<string, unknown>> = {\n  data: T;\n  meta: {\n    timestamp: number;\n    version: string;\n  };\n  transform<U>(fn: (data: T) => U): ComplexType<U>;\n};\n```',
        timestamp: Date.now(),
      },
      {
        id: 'complex-2',
        role: 'assistant',
        content: 'I can help you with that TypeScript interface! Here\'s an improved version:\n\n```typescript\ninterface ComplexType<T extends Record<string, unknown>> {\n  readonly data: T;\n  readonly meta: {\n    readonly timestamp: number;\n    readonly version: string;\n  };\n  transform<U extends Record<string, unknown>>(\n    fn: (data: T) => U\n  ): ComplexType<U>;\n  validate(): boolean;\n  serialize(): string;\n}\n```\n\nKey improvements:\n1. Added `readonly` modifiers for immutability\n2. Constrained the generic `U` type\n3. Added validation and serialization methods\n4. Better formatting for readability',
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      <ContextArea
        messages={complexMessages}
        streamingText=""
        isStreaming={false}
        width={100}
        height={25}
      />
    );

    const output = lastFrame();
    
    // Should handle complex code content
    expect(output).toContain('ComplexType');
    expect(output).toContain('typescript');
    expect(output).toContain('readonly');
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// BACKWARD COMPATIBILITY TESTS
// =============================================================================

describe('UI Upgrade - Backward Compatibility', () => {
  it('should maintain existing store structure', () => {
    const store = useAppStore.getState();
    
    // Verify all existing store methods are still available
    expect(typeof store.addMessage).toBe('function');
    expect(typeof store.setCurrentModel).toBe('function');
    expect(typeof store.createNewSession).toBe('function');
    expect(typeof store.setWorkspaceRoot).toBe('function');
    expect(typeof store.setError).toBe('function');
    expect(typeof store.reset).toBe('function');
    
    // Verify store state structure
    expect(store).toHaveProperty('messages');
    expect(store).toHaveProperty('currentModel');
    expect(store).toHaveProperty('workspaceRoot');
    expect(store).toHaveProperty('isStreaming');
    expect(store).toHaveProperty('streamingText');
  });

  it('should maintain existing message format', () => {
    const store = useAppStore.getState();
    
    // Add a message using existing format
    store.addMessage({
      role: 'user',
      content: 'Test message for backward compatibility',
    });

    const messages = store.messages;
    const lastMessage = messages[messages.length - 1];
    
    // Verify message structure is preserved
    expect(lastMessage).toHaveProperty('id');
    expect(lastMessage).toHaveProperty('role');
    expect(lastMessage).toHaveProperty('content');
    expect(lastMessage).toHaveProperty('timestamp');
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content).toBe('Test message for backward compatibility');
  });

  it('should maintain existing session management', () => {
    const store = useAppStore.getState();
    
    // Test session creation (existing functionality)
    store.createNewSession('gpt-4o');
    
    expect(store.currentModel).toBe('gpt-4o');
    expect(store.messages).toHaveLength(0); // New session should be empty
    
    // Test adding messages to session
    store.addMessage({ role: 'user', content: 'Hello' });
    store.addMessage({ role: 'assistant', content: 'Hi there!' });
    
    expect(store.messages).toHaveLength(2);
  });

  it('should maintain existing keyboard shortcuts and interactions', () => {
    // This test verifies that the App component still handles input correctly
    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={mockConfig}
        initialModel="gpt-4o"
      />
    );

    // Test that input handling is preserved
    stdin.write('test input');
    
    const output = lastFrame();
    
    // Should still render the UI structure
    expect(output).toContain('workspace');
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});