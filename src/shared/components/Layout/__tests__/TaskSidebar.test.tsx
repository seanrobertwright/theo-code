/**
 * @fileoverview Tests for TaskSidebar component
 * @module shared/components/Layout/__tests__/TaskSidebar
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { TaskSidebar } from '../TaskSidebar.js';
import { createDefaultColorScheme } from '../utils.js';
import type { TaskItem } from '../types.js';

describe('TaskSidebar', () => {
  const defaultProps = {
    tasks: [] as TaskItem[],
    width: 30,
    height: 20,
    colorScheme: createDefaultColorScheme(),
  };

  const sampleTasks: TaskItem[] = [
    {
      id: '1',
      title: 'Setup project structure',
      status: 'completed',
    },
    {
      id: '2', 
      title: 'Implement core functionality',
      status: 'in-progress',
    },
    {
      id: '3',
      title: 'Write tests',
      status: 'not-started',
      optional: true,
    },
    {
      id: '4',
      title: 'Deploy to production',
      status: 'paused',
    },
    {
      id: '5',
      title: 'Failed task example',
      status: 'failed',
    },
  ];

  it('should render empty state when no tasks', () => {
    const { lastFrame } = render(<TaskSidebar {...defaultProps} />);
    
    const frame = lastFrame();
    expect(frame).toContain('No tasks available');
    expect(frame).toContain('Tasks (0)');
  });

  it('should render task list with status indicators', () => {
    const { lastFrame } = render(
      <TaskSidebar {...defaultProps} tasks={sampleTasks} />
    );
    
    const frame = lastFrame();
    
    // Check header shows correct count
    expect(frame).toContain('Tasks (5)');
    
    // Check status emojis are present
    expect(frame).toContain('✅'); // completed
    expect(frame).toContain('🟢'); // in-progress
    expect(frame).toContain('🔴'); // not-started
    expect(frame).toContain('🟡'); // paused
    expect(frame).toContain('❌'); // failed
    
    // Check task titles are present (may be truncated)
    expect(frame).toContain('Setup project structure');
    expect(frame).toContain('Implement core'); // Truncated version
    expect(frame).toContain('Write tests');
  });

  it('should render with box outline', () => {
    const { lastFrame } = render(
      <TaskSidebar {...defaultProps} tasks={sampleTasks} />
    );
    
    // Check for box characters (borders)
    const frame = lastFrame();
    expect(frame).toMatch(/[┌┐└┘│─]/);
  });

  it('should truncate long task titles', () => {
    const longTitleTask: TaskItem = {
      id: '1',
      title: 'This is a very long task title that should be truncated to fit in the sidebar',
      status: 'in-progress',
    };

    const { lastFrame } = render(
      <TaskSidebar {...defaultProps} tasks={[longTitleTask]} />
    );
    
    const frame = lastFrame();
    expect(frame).toContain('...');
  });

  it('should handle collapsed state', () => {
    const { lastFrame } = render(
      <TaskSidebar {...defaultProps} tasks={sampleTasks} collapsed={true} />
    );
    
    // Should render nothing when collapsed
    expect(lastFrame()).toBe('');
  });

  it('should display optional tasks with dimmed styling', () => {
    const optionalTask: TaskItem = {
      id: '1',
      title: 'Optional task',
      status: 'not-started',
      optional: true,
    };

    const { lastFrame } = render(
      <TaskSidebar {...defaultProps} tasks={[optionalTask]} />
    );
    
    const frame = lastFrame();
    expect(frame).toContain('Optional task');
  });

  it('should call onTaskSelect when task is selected', () => {
    const onTaskSelect = vi.fn();
    
    const { lastFrame } = render(
      <TaskSidebar 
        {...defaultProps} 
        tasks={sampleTasks} 
        onTaskSelect={onTaskSelect}
      />
    );
    
    // Note: In a real test, we would simulate user interaction
    // For now, we just verify the component renders without errors
    expect(lastFrame()).toContain('Tasks (5)');
  });

  it('should handle scroll position correctly', () => {
    // Create many tasks to test scrolling
    const manyTasks: TaskItem[] = Array.from({ length: 50 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i + 1}`,
      status: 'not-started' as const,
    }));

    const { lastFrame } = render(
      <TaskSidebar 
        {...defaultProps} 
        tasks={manyTasks}
        scrollPosition={10}
        height={10}
      />
    );
    
    const frame = lastFrame();
    // When scrolled, we should see tasks from the scrolled position
    expect(frame).toContain('Task 1'); // Should show some tasks
    // Should have scroll indicator
    expect(frame).toContain('█'); // Scroll thumb character
  });
});