/**
 * @fileoverview Integration test for "New Session" workflow
 * @module src/test/session-creation
 * 
 * This test verifies that the "New Session" workflow completes without
 * screen flickering and in a single render cycle, addressing the critical
 * UI bug where session creation caused continuous screen redraws.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../app.js';
import type { MergedConfig } from '../config/index.js';
import { useAppStore } from '../shared/store/index.js';

// Mock the session manager to control session detection
const mockSessionManager = {
  detectAvailableSessionsSafely: vi.fn(),
  restoreSessionSafely: vi.fn(),
  setCurrentSession: vi.fn(),
};

vi.mock('../features/session/safe-session-manager.js', () => ({
  createSafeSessionManager: () => mockSessionManager,
}));

// Mock the agent loop to prevent actual API calls
vi.mock('../features/agent/index.js', () => ({
  AgentLoop: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock tool registry to prevent filesystem operations
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

// Mock Archon MCP integration
vi.mock('../shared/hooks/useArchonMCP.js', () => ({
  useUIUpgradeArchonTasks: vi.fn().mockReturnValue({
    tasks: [],
    connectionStatus: 'disconnected',
  }),
}));

// Mock double Ctrl+C handler
vi.mock('../shared/hooks/useDoubleCtrlC.js', () => ({
  useDoubleCtrlC: vi.fn(),
}));

// Create a minimal test configuration
const createTestConfig = (): MergedConfig => ({
  global: {
    defaultProvider: 'openai',
    openai: {
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
    },
    session: {
      autoSaveInterval: 30000,
      maxSessions: 50,
      sessionsDir: './sessions',
    },
  },
  agentsInstructions: 'Test system prompt',
});

describe('Session Creation Integration Test', () => {
  let renderCount = 0;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset render count
    renderCount = 0;
    
    // Mock console.log to track render cycles
    originalConsoleLog = console.log;
    console.log = vi.fn((...args) => {
      if (args[0]?.includes?.('🎨 App: Render #')) {
        renderCount++;
      }
      // Call original for other logs
      originalConsoleLog(...args);
    });

    // Reset store state
    useAppStore.getState().reset();
    
    // Mock session detection to return no sessions (triggers "New Session" flow)
    mockSessionManager.detectAvailableSessionsSafely.mockResolvedValue({
      validSessions: [],
      invalidSessions: [],
      warnings: [],
    });
  });

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog;
  });

  it('should complete "New Session" workflow without flickering', async () => {
    const config = createTestConfig();
    
    // Render the App component
    const { lastFrame, rerender } = render(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Wait for session detection to complete
    await vi.waitFor(() => {
      expect(mockSessionManager.detectAvailableSessionsSafely).toHaveBeenCalled();
    }, { timeout: 1000 });

    // Wait for the app to reach the complete state
    await vi.waitFor(() => {
      const frame = lastFrame();
      // The app should show the main UI (not session restoration UI)
      expect(frame).not.toContain('Session Restoration');
      expect(frame).not.toContain('Detecting previous sessions');
    }, { timeout: 2000 });

    // Verify session was created
    const store = useAppStore.getState();
    expect(store.session).toBeDefined();
    expect(store.session?.model).toBe('gpt-4o');
    expect(store.session?.workspaceRoot).toBe('/test/workspace');
    expect(store.messages).toEqual([
      {
        role: 'system',
        content: 'Test system prompt',
      },
    ]);

    // Verify the session manager was updated
    expect(mockSessionManager.setCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
      })
    );

    // Test that re-renders don't cause additional session creation
    const initialSessionId = store.session?.id;
    
    rerender(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Session should remain the same
    expect(useAppStore.getState().session?.id).toBe(initialSessionId);
  });

  it('should handle session restoration UI to new session flow', async () => {
    const config = createTestConfig();
    
    // Mock session detection to return available sessions
    mockSessionManager.detectAvailableSessionsSafely.mockResolvedValue({
      validSessions: [
        {
          id: 'test-session-1',
          created: Date.now() - 86400000, // 1 day ago
          lastModified: Date.now() - 3600000, // 1 hour ago
          model: 'gpt-4o',
          provider: 'openai',
          workspaceRoot: '/test/workspace',
          tokenCount: { total: 100, input: 50, output: 50 },
          messageCount: 5,
          tags: [],
        },
      ],
      invalidSessions: [],
      warnings: [],
    });

    const { lastFrame, stdin } = render(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Wait for session restoration UI to appear
    await vi.waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Session Restoration');
      expect(frame).toContain('Start New Session');
    }, { timeout: 1000 });

    // Navigate to "Start New Session" option and select it
    // First, navigate down to the "Start New Session" option
    stdin.write('\u001B[B'); // Down arrow
    
    // Wait a bit for the UI to update
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Press Enter to select "Start New Session"
    stdin.write('\r'); // Enter key

    // Wait for the new session to be created and UI to update
    await vi.waitFor(() => {
      const frame = lastFrame();
      // Should no longer show session restoration UI
      expect(frame).not.toContain('Session Restoration');
      expect(frame).not.toContain('Detecting previous sessions');
    }, { timeout: 2000 });

    // Verify new session was created
    const store = useAppStore.getState();
    expect(store.session).toBeDefined();
    expect(store.session?.model).toBe('gpt-4o');
    expect(store.session?.workspaceRoot).toBe('/test/workspace');
    
    // Should have system message
    expect(store.messages).toEqual([
      {
        role: 'system',
        content: 'Test system prompt',
      },
    ]);
  });

  it('should maintain stable input handlers during session creation', async () => {
    const config = createTestConfig();
    
    // Track useInput calls to verify handler stability
    const mockUseInput = vi.fn();
    
    // Mock ink's useInput to track handler registration
    vi.doMock('ink', async () => {
      const actual = await vi.importActual('ink');
      return {
        ...actual,
        useInput: mockUseInput,
      };
    });

    render(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Wait for session detection and creation to complete
    await vi.waitFor(() => {
      expect(mockSessionManager.detectAvailableSessionsSafely).toHaveBeenCalled();
    }, { timeout: 1000 });

    await vi.waitFor(() => {
      const store = useAppStore.getState();
      expect(store.session).toBeDefined();
    }, { timeout: 2000 });

    // Verify that input handlers were registered but not excessively
    // During session creation, we should see some useInput calls but they should be stable
    expect(mockUseInput).toHaveBeenCalled();
    
    // The exact number may vary, but it shouldn't be excessive (like hundreds of calls)
    expect(mockUseInput.mock.calls.length).toBeLessThan(20);
  });

  it('should batch state updates during session initialization', async () => {
    const config = createTestConfig();
    
    // Track state changes
    const stateChanges: string[] = [];
    const originalSet = useAppStore.setState;
    
    useAppStore.setState = vi.fn((partial, replace) => {
      stateChanges.push(`setState called with: ${JSON.stringify(Object.keys(partial))}`);
      return originalSet(partial, replace);
    });

    render(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Wait for session creation to complete
    await vi.waitFor(() => {
      const store = useAppStore.getState();
      expect(store.session).toBeDefined();
    }, { timeout: 2000 });

    // Restore original setState
    useAppStore.setState = originalSet;

    // Verify that state updates were batched (not excessive individual updates)
    expect(stateChanges.length).toBeLessThan(10); // Should be reasonable number of updates
    
    // Should have created a session
    const store = useAppStore.getState();
    expect(store.session).toBeDefined();
    expect(store.workspaceRoot).toBe('/test/workspace');
    expect(store.currentModel).toBe('gpt-4o');
  });

  it('should handle errors gracefully during session creation', async () => {
    const config = createTestConfig();
    
    // Mock session detection to fail
    mockSessionManager.detectAvailableSessionsSafely.mockRejectedValue(
      new Error('Session detection failed')
    );

    const { lastFrame } = render(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Wait for error handling to complete and fallback to new session
    await vi.waitFor(() => {
      const store = useAppStore.getState();
      expect(store.session).toBeDefined();
    }, { timeout: 3000 });

    // Should have fallen back to creating a new session
    const store = useAppStore.getState();
    expect(store.session).toBeDefined();
    expect(store.session?.model).toBe('gpt-4o');
    
    // Should not be stuck in error state
    const frame = lastFrame();
    expect(frame).not.toContain('Session Detection Failed');
  });

  it('should prevent infinite render loops during session creation', async () => {
    const config = createTestConfig();
    
    render(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Wait for session creation to complete
    await vi.waitFor(() => {
      const store = useAppStore.getState();
      expect(store.session).toBeDefined();
    }, { timeout: 2000 });

    // Wait a bit more to see if renders continue
    await new Promise(resolve => setTimeout(resolve, 500));

    // Render count should be reasonable (not infinite)
    expect(renderCount).toBeLessThan(20); // Should not have excessive renders
    expect(renderCount).toBeGreaterThan(0); // Should have rendered at least once
  });

  it('should complete session initialization within performance targets', async () => {
    const config = createTestConfig();
    
    const startTime = Date.now();
    
    render(
      <App
        workspaceRoot="/test/workspace"
        config={config}
        initialModel="gpt-4o"
      />
    );

    // Wait for session creation to complete
    await vi.waitFor(() => {
      const store = useAppStore.getState();
      expect(store.session).toBeDefined();
    }, { timeout: 2000 });

    const endTime = Date.now();
    const initializationTime = endTime - startTime;

    // Should complete within reasonable time (allowing for test overhead)
    expect(initializationTime).toBeLessThan(1000); // 1 second max for tests
    
    // Verify session was properly initialized
    const store = useAppStore.getState();
    expect(store.session).toBeDefined();
    expect(store.session?.workspaceRoot).toBe('/test/workspace');
    expect(store.session?.model).toBe('gpt-4o');
  });
});