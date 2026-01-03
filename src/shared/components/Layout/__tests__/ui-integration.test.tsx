/**
 * @fileoverview Comprehensive integration tests for UI upgrade
 * @module shared/components/Layout/__tests__/ui-integration
 * 
 * Tests full user workflows with new UI, session management integration,
 * and command processing with new layout to ensure end-to-end functionality.
 */

import * as React from 'react';
import { render, type RenderResult } from 'ink-testing-library';
import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { FullScreenLayout } from '../FullScreenLayout.js';
import { ResponsiveLayoutContent } from '../ResponsiveLayoutContent.js';
import { ProjectHeader } from '../ProjectHeader.js';
import { ContextArea } from '../ContextArea.js';
import { TaskSidebar } from '../TaskSidebar.js';
import { ConnectedStatusFooter } from '../ConnectedStatusFooter.js';
import type { TaskItem } from '../types.js';

// =============================================================================
// MOCKS
// =============================================================================

// Mock stdout for terminal dimensions
const mockStdout = {
  columns: 120,
  rows: 30,
};

vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useStdout: () => ({ stdout: mockStdout }),
  };
});

// =============================================================================
// TEST DATA
// =============================================================================

const mockTasks: TaskItem[] = [
  {
    id: '1',
    title: 'Set up UI layout foundation',
    status: 'completed',
    description: 'Create directory structure and interfaces',
  },
  {
    id: '2',
    title: 'Implement FullScreenLayout component',
    status: 'in-progress',
    description: 'Create responsive layout container',
  },
  {
    id: '3',
    title: 'Add responsive breakpoint behavior',
    status: 'not-started',
    description: 'Implement vertical stacking for narrow terminals',
  },
];

const mockMessages = [
  {
    role: 'system' as const,
    content: 'System initialized',
  },
  {
    role: 'user' as const,
    content: 'Hello, how can you help me?',
  },
  {
    role: 'assistant' as const,
    content: 'I can help you with various development tasks.',
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Wait for async operations to complete
 */
function waitForAsync(ms = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('UI Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Full-Screen Layout Integration', () => {
    it('should render full-screen layout with all sections', async () => {
      const app = render(
        <FullScreenLayout terminalWidth={120} terminalHeight={30}>
          <ResponsiveLayoutContent
            messages={mockMessages}
            streamingText=""
            isStreaming={false}
            inputValue=""
            onInputChange={() => {}}
            onInputSubmit={() => {}}
            tasks={mockTasks}
            terminalWidth={120}
            terminalHeight={30}
          />
        </FullScreenLayout>
      );
      
      await waitForAsync(100);
      
      const frame = app.lastFrame();
      
      // Verify layout is rendered
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);

      // Ensure rendered output fits within the terminal height to prevent scroll/flicker in real terminals
      expect(frame.split('\n').length).toBeLessThanOrEqual(30);
    });

    it('should respect terminal safety rows to avoid scrolling', async () => {
      const prevSafetyRows = process.env['THEO_UI_SAFETY_ROWS'];
      process.env['THEO_UI_SAFETY_ROWS'] = '1';

      try {
        const app = render(
          <FullScreenLayout terminalWidth={120} terminalHeight={30}>
            <ResponsiveLayoutContent
              messages={mockMessages}
              streamingText=""
              isStreaming={false}
              inputValue=""
              onInputChange={() => {}}
              onInputSubmit={() => {}}
              tasks={mockTasks}
              terminalWidth={120}
              terminalHeight={30}
            />
          </FullScreenLayout>
        );

        await waitForAsync(100);

        const frame = app.lastFrame();
        expect(frame).toBeTruthy();
        expect(frame.split('\n').length).toBeLessThanOrEqual(29);
      } finally {
        if (prevSafetyRows === undefined) {
          delete process.env['THEO_UI_SAFETY_ROWS'];
        } else {
          process.env['THEO_UI_SAFETY_ROWS'] = prevSafetyRows;
        }
      }
    });

    it('should handle different terminal sizes', async () => {
      // Test with narrow terminal
      mockStdout.columns = 60;
      mockStdout.rows = 20;
      
      const narrowApp = render(
        <FullScreenLayout terminalWidth={60} terminalHeight={20}>
          <ResponsiveLayoutContent
            messages={mockMessages}
            streamingText=""
            isStreaming={false}
            inputValue=""
            onInputChange={() => {}}
            onInputSubmit={() => {}}
            tasks={mockTasks}
            terminalWidth={60}
            terminalHeight={20}
          />
        </FullScreenLayout>
      );
      
      await waitForAsync(100);
      
      const narrowFrame = narrowApp.lastFrame();
      expect(narrowFrame).toBeTruthy();
      expect(narrowFrame.length).toBeGreaterThan(0);
      
      // Test with wide terminal
      mockStdout.columns = 150;
      mockStdout.rows = 40;
      
      const wideApp = render(
        <FullScreenLayout terminalWidth={150} terminalHeight={40}>
          <ResponsiveLayoutContent
            messages={mockMessages}
            streamingText=""
            isStreaming={false}
            inputValue=""
            onInputChange={() => {}}
            onInputSubmit={() => {}}
            tasks={mockTasks}
            terminalWidth={150}
            terminalHeight={40}
          />
        </FullScreenLayout>
      );
      
      await waitForAsync(100);
      
      const wideFrame = wideApp.lastFrame();
      expect(wideFrame).toBeTruthy();
      expect(wideFrame.length).toBeGreaterThan(0);
    });

    it('should handle minimum terminal size constraints', async () => {
      // Test with terminal too small
      const app = render(
        <FullScreenLayout terminalWidth={30} terminalHeight={8}>
          <ResponsiveLayoutContent
            messages={mockMessages}
            streamingText=""
            isStreaming={false}
            inputValue=""
            onInputChange={() => {}}
            onInputSubmit={() => {}}
            tasks={mockTasks}
            terminalWidth={30}
            terminalHeight={8}
          />
        </FullScreenLayout>
      );
      
      await waitForAsync(100);
      
      const frame = app.lastFrame();
      
      // Should show terminal too small message
      expect(frame).toMatch(/terminal.*too.*small/i);
    });
  });

  describe('Component Integration', () => {
    it('should render project header component', () => {
      const app = render(
        <ProjectHeader
          projectName="test-project"
          sessionInfo={{ model: 'gpt-4', provider: 'openai', duration: '5m 30s' }}
          width={80}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toMatch(/test.*project/i);
    });

    it('should render context area with messages', () => {
      const app = render(
        <ContextArea
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          width={80}
          height={20}
          onWidthChange={() => {}}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);
    });

    it('should render task sidebar with tasks', () => {
      const app = render(
        <TaskSidebar
          tasks={mockTasks}
          width={40}
          height={20}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);
    });

    it('should render status footer', () => {
      const app = render(
        <ConnectedStatusFooter
          tokenCount={{ total: 1500, input: 800, output: 700 }}
          sessionDuration="5m 30s"
          contextFileCount={3}
          currentModel="gpt-4"
          connectionStatus="connected"
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);
    });
  });

  describe('Message Display Integration', () => {
    it('should display different message types correctly', () => {
      const mixedMessages = [
        { role: 'user' as const, content: 'User message' },
        { role: 'assistant' as const, content: 'Assistant response' },
        { role: 'system' as const, content: 'System notification' },
      ];

      const app = render(
        <ContextArea
          messages={mixedMessages}
          streamingText=""
          isStreaming={false}
          width={80}
          height={20}
          onWidthChange={() => {}}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);
    });

    it('should handle streaming text display', () => {
      const app = render(
        <ContextArea
          messages={mockMessages}
          streamingText="This is streaming text..."
          isStreaming={true}
          width={80}
          height={20}
          onWidthChange={() => {}}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);
    });
  });

  describe('Task Management Integration', () => {
    it('should display tasks with different statuses', () => {
      const tasksWithVariousStatuses: TaskItem[] = [
        { id: '1', title: 'Completed task', status: 'completed' },
        { id: '2', title: 'In progress task', status: 'in-progress' },
        { id: '3', title: 'Not started task', status: 'not-started' },
        { id: '4', title: 'Paused task', status: 'paused' },
        { id: '5', title: 'Failed task', status: 'failed' },
      ];

      const app = render(
        <TaskSidebar
          tasks={tasksWithVariousStatuses}
          width={40}
          height={20}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);
    });

    it('should handle empty task list', () => {
      const app = render(
        <TaskSidebar
          tasks={[]}
          width={40}
          height={20}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
    });

    it('should handle long task lists with scrolling', () => {
      const longTaskList: TaskItem[] = Array.from({ length: 20 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i + 1}`,
        status: i % 2 === 0 ? 'completed' : 'not-started' as const,
      }));

      const app = render(
        <TaskSidebar
          tasks={longTaskList}
          width={40}
          height={10}
        />
      );
      
      const frame = app.lastFrame();
      expect(frame).toBeTruthy();
      expect(frame.length).toBeGreaterThan(0);
    });
  });

  describe('Layout Responsiveness Integration', () => {
    it('should adapt to terminal resize events', async () => {
      let terminalWidth = 120;
      let terminalHeight = 30;

      const TestComponent = () => {
        const [dimensions, setDimensions] = React.useState({ 
          width: terminalWidth, 
          height: terminalHeight 
        });
        
        React.useEffect(() => {
          const timer = setTimeout(() => {
            setDimensions({ width: 80, height: 24 });
          }, 50);
          return () => clearTimeout(timer);
        }, []);

        return (
          <FullScreenLayout terminalWidth={dimensions.width} terminalHeight={dimensions.height}>
            <ResponsiveLayoutContent
              messages={mockMessages}
              streamingText=""
              isStreaming={false}
              inputValue=""
              onInputChange={() => {}}
              onInputSubmit={() => {}}
              tasks={mockTasks}
              terminalWidth={dimensions.width}
              terminalHeight={dimensions.height}
            />
          </FullScreenLayout>
        );
      };

      const app = render(<TestComponent />);
      
      // Should render without errors initially
      expect(app.lastFrame()).toBeTruthy();
      
      // Wait for resize
      await waitForAsync(200);
      
      // Should still render after resize
      expect(app.lastFrame()).toBeTruthy();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle component errors gracefully', () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        // Test with invalid props that might cause errors
        const app = render(
          <FullScreenLayout terminalWidth={0} terminalHeight={0}>
            <div>Test Content</div>
          </FullScreenLayout>
        );
        
        // Should handle gracefully
        expect(app.lastFrame()).toBeTruthy();
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('Performance Integration', () => {
    it('should handle rapid re-renders efficiently', async () => {
      let renderCount = 0;
      
      const TestComponent = () => {
        const [counter, setCounter] = React.useState(0);
        renderCount++;
        
        React.useEffect(() => {
          const interval = setInterval(() => {
            setCounter(c => c + 1);
          }, 10);
          
          setTimeout(() => clearInterval(interval), 100);
          
          return () => clearInterval(interval);
        }, []);

        return (
          <FullScreenLayout terminalWidth={120} terminalHeight={30}>
            <ResponsiveLayoutContent
              messages={[...mockMessages, { role: 'system' as const, content: `Counter: ${counter}` }]}
              streamingText=""
              isStreaming={false}
              inputValue=""
              onInputChange={() => {}}
              onInputSubmit={() => {}}
              tasks={mockTasks}
              terminalWidth={120}
              terminalHeight={30}
            />
          </FullScreenLayout>
        );
      };

      const app = render(<TestComponent />);
      
      // Wait for rapid updates
      await waitForAsync(200);
      
      // Should handle rapid updates without crashing
      expect(app.lastFrame()).toBeTruthy();
      expect(renderCount).toBeGreaterThanOrEqual(1);
    });
  });
});
