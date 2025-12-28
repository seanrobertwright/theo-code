/**
 * @fileoverview Minimal integration test for UI upgrade
 * @module shared/components/Layout/__tests__/minimal-integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { FullScreenLayout } from '../FullScreenLayout.js';
import { ContextArea } from '../ContextArea.js';
import { TaskSidebar } from '../TaskSidebar.js';
import type { Message } from '../../../types/index.js';
import type { TaskItem } from '../types.js';

// Mock console to prevent noise in tests
beforeEach(() => {
  global.console = {
    ...console,
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  };
});

// Test data
const mockMessages: Message[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, test message',
    timestamp: Date.now(),
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Hello, this is a response',
    timestamp: Date.now(),
  },
];

const mockTasks: TaskItem[] = [
  {
    id: 'task-1',
    title: 'Test task 1',
    status: 'completed',
    description: 'First test task',
  },
  {
    id: 'task-2',
    title: 'Test task 2',
    status: 'in-progress',
    description: 'Second test task',
  },
];

describe('Minimal UI Integration Tests', () => {
  it('should render FullScreenLayout without errors', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <div>Test content</div>
      </FullScreenLayout>
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should render ContextArea with messages', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <ContextArea
          messages={mockMessages}
          streamingText=""
          isStreaming={false}
          width={60}
          height={15}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Hello, test message');
  });

  it('should render TaskSidebar with tasks', () => {
    const { lastFrame } = render(
      <TaskSidebar
        tasks={mockTasks}
        width={30}
        height={15}
      />
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Test task 1');
  });

  it('should handle empty data gracefully', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <ContextArea
          messages={[]}
          streamingText=""
          isStreaming={false}
          width={60}
          height={15}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle small terminal dimensions', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={20} terminalHeight={5}>
        <div>Small terminal test</div>
      </FullScreenLayout>
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    // Should show error for too small terminal
    expect(output).toContain('⚠️ Terminal Too');
  });
});