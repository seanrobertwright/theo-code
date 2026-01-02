/**
 * @fileoverview Tests for session initialization batching
 * @module src/__tests__/session-initialization
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { App } from '../app.js';
import type { MergedConfig } from '../config/index.js';

// Mock dependencies
vi.mock('../features/agent/index.js', () => ({
  AgentLoop: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../features/tools/framework.js', () => ({
  toolRegistry: {
    register: vi.fn(),
  },
}));

vi.mock('../features/tools/index.js', () => ({
  createFileSystemTools: vi.fn().mockReturnValue([]),
  createAstGrepTool: vi.fn(),
  createAstGrepRewriteTool: vi.fn(),
  createLSPTools: vi.fn().mockReturnValue([]),
  createGitTools: vi.fn().mockReturnValue([]),
}));

vi.mock('../registerTools.js', () => ({
  registerAllTools: vi.fn(),
}));

vi.mock('../features/session/index.js', () => ({
  createSessionManager: vi.fn().mockReturnValue({
    detectAvailableSessionsSafely: vi.fn().mockResolvedValue({
      validSessions: [],
      invalidSessions: [],
      warnings: [],
    }),
    restoreSessionSafely: vi.fn(),
    setCurrentSession: vi.fn(),
  }),
}));

vi.mock('../features/session/safe-session-manager.js', () => ({
  createSafeSessionManager: vi.fn().mockReturnValue({
    detectAvailableSessionsSafely: vi.fn().mockResolvedValue({
      validSessions: [],
      invalidSessions: [],
      warnings: [],
    }),
    restoreSessionSafely: vi.fn(),
    setCurrentSession: vi.fn(),
  }),
}));

vi.mock('../features/commands/index.js', () => ({
  createDefaultCommandRegistry: vi.fn().mockReturnValue({
    has: vi.fn().mockReturnValue(false),
    execute: vi.fn(),
    generateHelp: vi.fn().mockReturnValue('Help text'),
  }),
}));

vi.mock('../shared/hooks/useArchonMCP.js', () => ({
  useUIUpgradeArchonTasks: vi.fn().mockReturnValue({
    tasks: [],
    connectionStatus: 'disconnected',
  }),
}));

vi.mock('../shared/hooks/useDoubleCtrlC.js', () => ({
  useDoubleCtrlC: vi.fn(),
}));

// Mock Ink components
vi.mock('ink', () => ({
  Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  useApp: vi.fn().mockReturnValue({ exit: vi.fn() }),
  useInput: vi.fn(),
  useStdout: vi.fn().mockReturnValue({ stdout: { columns: 80, rows: 24 } }),
}));

// Mock layout components
vi.mock('../shared/components/Layout/FullScreenLayout.js', () => ({
  FullScreenLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="full-screen-layout">{children}</div>,
}));

vi.mock('../shared/components/Layout/ErrorBoundary.js', () => ({
  LayoutErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../shared/components/Layout/ResponsiveLayoutContent.js', () => ({
  ResponsiveLayoutContent: () => <div data-testid="responsive-layout-content" />,
}));

vi.mock('../shared/components/index.js', () => ({
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
  SessionRestoration: () => <div data-testid="session-restoration" />,
  SessionDetectionLoading: () => <div data-testid="session-detection-loading" />,
  SessionDetectionError: () => <div data-testid="session-detection-error" />,
  SessionRestorationErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SessionDetectionErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Session Initialization Batching', () => {
  let mockConfig: MergedConfig;
  let renderSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create a spy to track renders
    renderSpy = vi.fn();
    
    // Mock config
    mockConfig = {
      global: {
        defaultProvider: 'openai' as const,
        openai: {
          apiKey: 'test-key',
        },
      },
      agentsInstructions: 'Test instructions',
    } as MergedConfig;

    // Mock React.startTransition to track when it's called
    vi.spyOn(React, 'startTransition').mockImplementation((callback) => {
      callback();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should batch session initialization state updates into a single render cycle', async () => {
    // Create a wrapper component that tracks renders
    const TestWrapper = (props: any) => {
      renderSpy();
      return <App {...props} />;
    };

    // Render the app
    await act(async () => {
      render(
        <TestWrapper
          workspaceRoot="/test/workspace"
          config={mockConfig}
          initialModel="gpt-4o"
        />
      );
      
      // Wait for session detection to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Verify that React.startTransition was called for batching
    expect(React.startTransition).toHaveBeenCalled();

    // The component should render initially, then once more after session initialization
    // Due to the batching, we should not see multiple renders for each state update
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it('should use React.startTransition for batching state updates', async () => {
    const startTransitionSpy = vi.spyOn(React, 'startTransition');

    await act(async () => {
      render(
        <App
          workspaceRoot="/test/workspace"
          config={mockConfig}
          initialModel="gpt-4o"
        />
      );
      
      // Wait for session detection to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Verify that startTransition was called to batch the state updates
    expect(startTransitionSpy).toHaveBeenCalled();
  });

  it('should complete session initialization without multiple re-renders', async () => {
    let renderCount = 0;
    
    // Create a component that tracks renders during initialization
    const RenderTracker = (props: any) => {
      renderCount++;
      console.log(`Render #${renderCount}`);
      return <App {...props} />;
    };

    await act(async () => {
      render(
        <RenderTracker
          workspaceRoot="/test/workspace"
          config={mockConfig}
          initialModel="gpt-4o"
        />
      );
      
      // Wait for session detection and initialization to complete
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // With proper batching, we should have minimal renders:
    // 1. Initial render
    // 2. After session detection completes
    // The batched state updates should not cause additional renders
    expect(renderCount).toBeLessThanOrEqual(3);
  });
});