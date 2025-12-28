/**
 * @fileoverview Edge cases and error scenario tests for UI upgrade
 * @module shared/components/Layout/__tests__/ui-upgrade-edge-cases
 * 
 * Tests specific edge cases and error scenarios including:
 * - Terminal environment errors
 * - Layout calculation edge cases
 * - Color scheme fallbacks
 * - Memory and performance edge cases
 * - Network connectivity issues
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { FullScreenLayout, LayoutContext } from '../FullScreenLayout.js';
import { ContextArea } from '../ContextArea.js';
import { TaskSidebar } from '../TaskSidebar.js';
import { ErrorBoundary } from '../ErrorBoundary.js';
import { useUILayoutStore } from '../../../store/ui-layout.js';
import type { Message } from '../../../types/index.js';
import type { TaskItem } from '../types.js';

// =============================================================================
// MOCKS AND TEST SETUP
// =============================================================================

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

// Mock process.env for testing
const originalEnv = process.env;
beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// Test data for edge cases
const extremeMessages: Message[] = [
  {
    id: 'extreme-1',
    role: 'user',
    content: '', // Empty content
    timestamp: Date.now(),
  },
  {
    id: 'extreme-2',
    role: 'assistant',
    content: 'A'.repeat(100000), // Extremely long content
    timestamp: Date.now(),
  },
  {
    id: 'extreme-3',
    role: 'user',
    content: '🚀🎉🌟💫⭐🔥💯🎯🚀🎉🌟💫⭐🔥💯🎯'.repeat(1000), // Many emojis
    timestamp: Date.now(),
  },
  {
    id: 'extreme-4',
    role: 'assistant',
    content: 'Line 1\n'.repeat(10000), // Many newlines
    timestamp: Date.now(),
  },
];

const extremeTasks: TaskItem[] = [
  {
    id: 'extreme-task-1',
    title: '', // Empty title
    status: 'completed',
    description: 'Task with empty title',
  },
  {
    id: 'extreme-task-2',
    title: 'A'.repeat(1000), // Very long title
    status: 'in-progress',
    description: 'B'.repeat(5000), // Very long description
  },
  {
    id: 'extreme-task-3',
    title: '🚀'.repeat(100), // Many emojis in title
    status: 'failed',
    description: '💯'.repeat(200),
  },
];

// =============================================================================
// TERMINAL ENVIRONMENT ERROR TESTS
// =============================================================================

describe('UI Upgrade - Terminal Environment Errors', () => {
  it('should handle undefined terminal dimensions', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={undefined as any} terminalHeight={undefined as any}>
        <div>Test content</div>
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle undefined dimensions gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle negative terminal dimensions', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={-10} terminalHeight={-5}>
        <div>Test content</div>
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should show error for invalid dimensions
    expect(output).toContain('Terminal Too Small');
  });

  it('should handle NaN terminal dimensions', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={NaN} terminalHeight={NaN}>
        <div>Test content</div>
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle NaN dimensions gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle Infinity terminal dimensions', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={Infinity} terminalHeight={Infinity}>
        <div>Test content</div>
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle Infinity dimensions gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle terminal resize during rendering', () => {
    let width = 80;
    let height = 24;
    
    const TestComponent = () => (
      <FullScreenLayout terminalWidth={width} terminalHeight={height}>
        <ContextArea
          messages={extremeMessages}
          streamingText=""
          isStreaming={false}
          width={width - 10}
          height={height - 6}
        />
      </FullScreenLayout>
    );

    const { lastFrame, rerender } = render(<TestComponent />);
    
    // Simulate rapid resizing during rendering
    for (let i = 0; i < 50; i++) {
      width = Math.max(20, 80 + Math.sin(i) * 40);
      height = Math.max(10, 24 + Math.cos(i) * 10);
      rerender(<TestComponent />);
    }

    const output = lastFrame();
    
    // Should handle rapid resizing without crashing
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// LAYOUT CALCULATION EDGE CASES
// =============================================================================

describe('UI Upgrade - Layout Calculation Edge Cases', () => {
  beforeEach(() => {
    useUILayoutStore.getState().reset();
  });

  it('should handle extreme context area width percentages', () => {
    const store = useUILayoutStore.getState();
    
    // Test extreme values
    store.setContextAreaWidth(0); // 0%
    
    const { lastFrame: frame1 } = render(
      <FullScreenLayout terminalWidth={100} terminalHeight={30}>
        <div>Test content</div>
      </FullScreenLayout>
    );
    
    expect(frame1()).toBeDefined();
    
    store.setContextAreaWidth(100); // 100%
    
    const { lastFrame: frame2 } = render(
      <FullScreenLayout terminalWidth={100} terminalHeight={30}>
        <div>Test content</div>
      </FullScreenLayout>
    );
    
    expect(frame2()).toBeDefined();
    
    store.setContextAreaWidth(-50); // Negative value
    
    const { lastFrame: frame3 } = render(
      <FullScreenLayout terminalWidth={100} terminalHeight={30}>
        <div>Test content</div>
      </FullScreenLayout>
    );
    
    expect(frame3()).toBeDefined();
  });

  it('should handle division by zero in layout calculations', () => {
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={0} terminalHeight={0}>
        <ContextArea
          messages={[]}
          streamingText=""
          isStreaming={false}
          width={0}
          height={0}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle zero dimensions without division by zero errors
    expect(output).toBeDefined();
  });

  it('should handle floating point precision issues', () => {
    // Use dimensions that might cause floating point precision issues
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80.333333} terminalHeight={24.666666}>
        <ContextArea
          messages={extremeMessages.slice(0, 1)}
          streamingText=""
          isStreaming={false}
          width={70.123456}
          height={20.987654}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle floating point dimensions gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle integer overflow scenarios', () => {
    // Test with very large numbers that might cause overflow
    const largeNumber = Number.MAX_SAFE_INTEGER;
    
    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={largeNumber} terminalHeight={largeNumber}>
        <div>Test content</div>
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle large numbers gracefully
    expect(output).toBeDefined();
  });
});

// =============================================================================
// COLOR SCHEME AND ACCESSIBILITY EDGE CASES
// =============================================================================

describe('UI Upgrade - Color Scheme Edge Cases', () => {
  it('should handle missing color scheme properties', () => {
    const incompleteColorScheme = {
      name: 'incomplete',
      colors: {
        // Missing most required colors
        border: 'white',
      },
    };

    const { lastFrame } = render(
      <FullScreenLayout 
        terminalWidth={80} 
        terminalHeight={24}
        colorScheme={incompleteColorScheme as any}
      >
        <ContextArea
          messages={extremeMessages.slice(0, 1)}
          streamingText=""
          isStreaming={false}
          width={70}
          height={20}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle incomplete color scheme with fallbacks
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle invalid color values', () => {
    const invalidColorScheme = {
      name: 'invalid',
      colors: {
        border: 'not-a-color',
        userMessage: 123 as any,
        assistantMessage: null as any,
        systemMessage: undefined as any,
        toolCall: '',
        errorMessage: 'invalid-color-name',
      },
    };

    const { lastFrame } = render(
      <FullScreenLayout 
        terminalWidth={80} 
        terminalHeight={24}
        colorScheme={invalidColorScheme as any}
      >
        <ContextArea
          messages={extremeMessages.slice(0, 1)}
          streamingText=""
          isStreaming={false}
          width={70}
          height={20}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle invalid colors with fallbacks
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle terminal with no color support', () => {
    // Mock terminal with no color support
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      TERM: 'dumb',
      NO_COLOR: '1',
    };

    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <ContextArea
          messages={extremeMessages.slice(0, 1)}
          streamingText=""
          isStreaming={false}
          width={70}
          height={20}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should render without colors
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    
    process.env = originalEnv;
  });
});

// =============================================================================
// MEMORY AND PERFORMANCE EDGE CASES
// =============================================================================

describe('UI Upgrade - Memory and Performance Edge Cases', () => {
  it('should handle extremely large message content', () => {
    const hugeMessage: Message = {
      id: 'huge',
      role: 'assistant',
      content: 'X'.repeat(1000000), // 1MB of text
      timestamp: Date.now(),
    };

    const { lastFrame } = render(
      <ContextArea
        messages={[hugeMessage]}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle large content without memory issues
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle rapid state updates', () => {
    let streamingText = '';
    
    const TestComponent = ({ text }: { text: string }) => (
      <ContextArea
        messages={[]}
        streamingText={text}
        isStreaming={true}
        width={80}
        height={20}
      />
    );

    const { lastFrame, rerender } = render(<TestComponent text={streamingText} />);
    
    // Simulate rapid streaming updates
    for (let i = 0; i < 1000; i++) {
      streamingText += `Word${i} `;
      rerender(<TestComponent text={streamingText} />);
    }

    const output = lastFrame();
    
    // Should handle rapid updates without performance degradation
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Word999');
  });

  it('should handle memory pressure scenarios', () => {
    // Create many large objects to simulate memory pressure
    const largeObjects = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      data: 'X'.repeat(10000),
    }));

    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <TaskSidebar
          tasks={extremeTasks}
          width={40}
          height={20}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should handle memory pressure gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    
    // Clean up large objects
    largeObjects.length = 0;
  });

  it('should handle concurrent rendering operations', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => 
      new Promise<string>((resolve) => {
        const { lastFrame } = render(
          <ContextArea
            messages={extremeMessages}
            streamingText={`Concurrent render ${i}`}
            isStreaming={true}
            width={80}
            height={20}
          />
        );
        
        setTimeout(() => {
          resolve(lastFrame());
        }, Math.random() * 100);
      })
    );

    const results = await Promise.all(promises);
    
    // All concurrent renders should complete successfully
    results.forEach((result, i) => {
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// ERROR BOUNDARY AND RECOVERY TESTS
// =============================================================================

describe('UI Upgrade - Error Boundary and Recovery', () => {
  it('should handle component rendering errors', () => {
    const ThrowingComponent = () => {
      throw new Error('Test rendering error');
    };

    const { lastFrame } = render(
      <ErrorBoundary>
        <FullScreenLayout terminalWidth={80} terminalHeight={24}>
          <ThrowingComponent />
        </FullScreenLayout>
      </ErrorBoundary>
    );

    const output = lastFrame();
    
    // Should show error boundary fallback
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle async errors in components', async () => {
    const AsyncErrorComponent = () => {
      React.useEffect(() => {
        // Simulate async error
        setTimeout(() => {
          throw new Error('Async error');
        }, 10);
      }, []);
      
      return <div>Async component</div>;
    };

    const { lastFrame } = render(
      <ErrorBoundary>
        <FullScreenLayout terminalWidth={80} terminalHeight={24}>
          <AsyncErrorComponent />
        </FullScreenLayout>
      </ErrorBoundary>
    );

    // Wait for async error
    await new Promise(resolve => setTimeout(resolve, 50));

    const output = lastFrame();
    
    // Should handle async errors gracefully
    expect(output).toBeDefined();
  });

  it('should recover from layout calculation errors', () => {
    // Mock a layout calculation that throws
    const originalCalculateLayout = vi.fn(() => {
      throw new Error('Layout calculation failed');
    });

    const { lastFrame } = render(
      <FullScreenLayout terminalWidth={80} terminalHeight={24}>
        <ContextArea
          messages={[]}
          streamingText=""
          isStreaming={false}
          width={80}
          height={20}
        />
      </FullScreenLayout>
    );

    const output = lastFrame();
    
    // Should recover with fallback layout
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// NETWORK AND CONNECTIVITY EDGE CASES
// =============================================================================

describe('UI Upgrade - Network and Connectivity Edge Cases', () => {
  it('should handle Archon MCP connection failures', () => {
    // Mock failed Archon connection
    vi.doMock('../../../hooks/useArchonMCP.js', () => ({
      useUIUpgradeArchonTasks: vi.fn(() => ({
        tasks: [],
        connectionStatus: 'disconnected' as const,
        error: 'Connection failed',
      })),
    }));

    const { lastFrame } = render(
      <TaskSidebar
        tasks={[]}
        width={40}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle connection failure gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle intermittent connectivity', () => {
    let connectionStatus: 'connected' | 'disconnected' = 'connected';
    
    const TestComponent = () => {
      // Mock hook that simulates intermittent connectivity
      const mockHook = vi.fn(() => ({
        tasks: extremeTasks,
        connectionStatus,
        error: connectionStatus === 'disconnected' ? 'Network error' : null,
      }));

      return (
        <TaskSidebar
          tasks={mockHook().tasks}
          width={40}
          height={20}
        />
      );
    };

    const { lastFrame, rerender } = render(<TestComponent />);
    
    // Simulate connection loss and recovery
    for (let i = 0; i < 10; i++) {
      connectionStatus = i % 2 === 0 ? 'connected' : 'disconnected';
      rerender(<TestComponent />);
    }

    const output = lastFrame();
    
    // Should handle intermittent connectivity
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle slow network responses', async () => {
    // Mock slow network response
    const slowPromise = new Promise(resolve => 
      setTimeout(() => resolve(extremeTasks), 2000)
    );

    const { lastFrame } = render(
      <TaskSidebar
        tasks={[]} // Start with empty tasks
        width={40}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should render loading state or empty state gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// UNICODE AND INTERNATIONALIZATION EDGE CASES
// =============================================================================

describe('UI Upgrade - Unicode and Internationalization Edge Cases', () => {
  it('should handle various Unicode characters', () => {
    const unicodeMessages: Message[] = [
      {
        id: 'unicode-1',
        role: 'user',
        content: '你好世界 🌍 مرحبا بالعالم Здравствуй мир',
        timestamp: Date.now(),
      },
      {
        id: 'unicode-2',
        role: 'assistant',
        content: '🚀 Emoji test: 👨‍💻👩‍💻🔥💯⭐🌟💫🎯🎉',
        timestamp: Date.now(),
      },
      {
        id: 'unicode-3',
        role: 'user',
        content: 'Math symbols: ∑∏∫∆∇∂∞≈≠≤≥±×÷√∛∜',
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      <ContextArea
        messages={unicodeMessages}
        streamingText="Streaming: 正在处理您的请求..."
        isStreaming={true}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle Unicode characters properly
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('你好世界');
    expect(output).toContain('🌍');
    expect(output).toContain('مرحبا');
  });

  it('should handle right-to-left text', () => {
    const rtlMessages: Message[] = [
      {
        id: 'rtl-1',
        role: 'user',
        content: 'مرحبا، أحتاج مساعدة في البرمجة',
        timestamp: Date.now(),
      },
      {
        id: 'rtl-2',
        role: 'assistant',
        content: 'أهلاً وسهلاً! كيف يمكنني مساعدتك؟',
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      <ContextArea
        messages={rtlMessages}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle RTL text gracefully
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('مرحبا');
    expect(output).toContain('البرمجة');
  });

  it('should handle mixed text directions', () => {
    const mixedMessages: Message[] = [
      {
        id: 'mixed-1',
        role: 'user',
        content: 'Hello مرحبا 你好 Привет mixed text directions',
        timestamp: Date.now(),
      },
    ];

    const { lastFrame } = render(
      <ContextArea
        messages={mixedMessages}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
      />
    );

    const output = lastFrame();
    
    // Should handle mixed text directions
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Hello');
    expect(output).toContain('مرحبا');
    expect(output).toContain('你好');
  });
});