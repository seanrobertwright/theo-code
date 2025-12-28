/**
 * @fileoverview Main React Ink application component
 * @module app
 *
 * This is the root component for the theo-code TUI application.
 * It provides the main layout and orchestrates all UI components.
 */

import * as React from 'react';
import { type ReactElement, useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { MergedConfig } from './config/index.js';
import { getApiKey } from './config/index.js';
import { useAppStore } from './shared/store/index.js';
import { formatTokenCount } from './shared/utils/index.js';
import { AgentLoop } from './features/agent/index.js';
import { toolRegistry } from './features/tools/framework.js';
import { 
  createFileSystemTools,
  createAstGrepTool,
  createAstGrepRewriteTool,
  createLSPTools,
  createGitTools
} from './features/tools/index.js';
import { registerAllTools } from './registerTools.js';
import { ConfirmDialog, SessionRestoration, SessionDetectionLoading, SessionDetectionError } from './shared/components/index.js';
import { createSessionManager } from './features/session/index.js';
import { detectAvailableSessions, restoreSessionOnStartup } from './features/session/startup.js';
import { createDefaultCommandRegistry } from './features/commands/index.js';
import type { ModelConfig } from './shared/types/models.js';
import type { SessionMetadata, SessionId } from './shared/types/index.js';
import { logger } from './shared/utils/logger.js';

// Import new layout components
import { FullScreenLayout } from './shared/components/Layout/FullScreenLayout.js';
import { LayoutErrorBoundary } from './shared/components/Layout/ErrorBoundary.js';
import { ResponsiveLayoutContent } from './shared/components/Layout/ResponsiveLayoutContent.js';
import { ConnectedProjectHeader } from './shared/components/Layout/ConnectedProjectHeader.js';
import { ContextArea } from './shared/components/Layout/ContextArea.js';
import { ResizableDivider } from './shared/components/Layout/ResizableDivider.js';
import { TaskSidebar } from './shared/components/Layout/TaskSidebar.js';
import { ConnectedStatusFooter } from './shared/components/Layout/ConnectedStatusFooter.js';
import { InputArea } from './shared/components/Layout/InputArea.js';
import { useUILayoutStore } from './shared/store/ui-layout.js';
import { useUIUpgradeArchonTasks } from './shared/hooks/useArchonMCP.js';

// =============================================================================
// PROPS
// =============================================================================

/**
 * Props for the App component.
 */
export interface AppProps {
  /** Absolute path to workspace root */
  workspaceRoot: string;
  /** Merged configuration */
  config: MergedConfig;
  /** Initial model to use */
  initialModel: string;
}

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================

/**
 * Main application component.
 *
 * Provides the overall layout and state management for the TUI.
 *
 * @param props - Component props
 * @returns React element
 */
export const App = ({ workspaceRoot, config, initialModel }: AppProps): ReactElement => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Local state for input
  const [inputValue, setInputValue] = useState('');

  // Session restoration state
  const [sessionRestoreState, setSessionRestoreState] = useState<
    'detecting' | 'prompting' | 'restoring' | 'error' | 'complete'
  >('detecting');
  const [availableSessions, setAvailableSessions] = useState<SessionMetadata[]>([]);
  const [sessionRestoreError, setSessionRestoreError] = useState<string | null>(null);

  // Agent loop ref
  const agentRef = useRef<AgentLoop | null>(null);
  
  // Session manager ref
  const sessionManagerRef = useRef(createSessionManager(workspaceRoot));

  // Store actions
  const setWorkspaceRoot = useAppStore((state) => state.setWorkspaceRoot);
  const setCurrentModel = useAppStore((state) => state.setCurrentModel);
  const createNewSession = useAppStore((state) => state.createNewSession);
  const addMessage = useAppStore((state) => state.addMessage);
  const setError = useAppStore((state) => state.setError);

  // Store state for new layout
  const messages = useAppStore((state) => state.messages);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const streamingText = useAppStore((state) => state.streamingText);

  // Create model config from app config
  const createModelConfig = useCallback((): ModelConfig | null => {
    const provider = config.global.defaultProvider;
    const apiKey = getApiKey(provider, config);

    if (apiKey === undefined && provider !== 'ollama') {
      return null;
    }

    return {
      provider,
      model: initialModel,
      apiKey,
      contextLimit: 128000,
      maxOutputTokens: 4096,
      baseUrl: provider === 'ollama' ? config.global.ollama?.baseUrl : undefined,
      enabled: true,
      priority: 1,
    };
  }, [config, initialModel]);

  // Initialize agent loop
  useEffect(() => {
    const modelConfig = createModelConfig();
    if (modelConfig !== null) {
      agentRef.current = new AgentLoop({ modelConfig });
    }
  }, [createModelConfig]);

  // Session detection on startup
  useEffect(() => {
    const detectSessions = async () => {
      try {
        setSessionRestoreState('detecting');
        
        const detectionResult = await detectAvailableSessions(sessionManagerRef.current, {
          maxRecentSessions: 10,
          recentThresholdMs: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        
        if (detectionResult.hasAvailableSessions) {
          setAvailableSessions(detectionResult.recentSessions);
          setSessionRestoreState('prompting');
        } else {
          // No sessions found, proceed with normal startup
          setSessionRestoreState('complete');
          initializeNewSession();
        }
      } catch (error) {
        console.error('Session detection failed:', error);
        setSessionRestoreError(error instanceof Error ? error.message : 'Unknown error');
        setSessionRestoreState('error');
      }
    };
    
    void detectSessions();
  }, []);

  // Initialize new session
  const initializeNewSession = useCallback(() => {
    setWorkspaceRoot(workspaceRoot);
    setCurrentModel(initialModel);
    createNewSession(initialModel);

    // Register filesystem tools
    const fileSystemTools = createFileSystemTools();
    for (const tool of fileSystemTools) {
      toolRegistry.register(tool);
    }

    // Load AGENTS.md as system prompt if available
    if (config.agentsInstructions !== undefined) {
      addMessage({
        role: 'system',
        content: config.agentsInstructions,
      });
    }
  }, [workspaceRoot, initialModel, config, setWorkspaceRoot, setCurrentModel, createNewSession, addMessage]);

  // Handle session restoration
  const handleSessionSelected = useCallback(async (sessionId: string) => {
    try {
      setSessionRestoreState('restoring');
      
      const result = await restoreSessionOnStartup(sessionManagerRef.current, sessionId as SessionId);
      
      if (result.success) {
        // Update store with restored session
        setWorkspaceRoot(result.session.workspaceRoot);
        setCurrentModel(result.session.model);
        
        // Use the session manager's restoreSessionWithContext to update the store
        const storeRestoreSession = (useAppStore.getState() as any).restoreSession;
        if (storeRestoreSession) {
          await storeRestoreSession(sessionId);
        }
        
        // Register filesystem tools
        const fileSystemTools = createFileSystemTools();
        for (const tool of fileSystemTools) {
          toolRegistry.register(tool);
        }
        
        // Show restoration success message
        addMessage({
          role: 'assistant',
          content: `✓ Session restored successfully!\n\nModel: ${result.session.model}\nMessages: ${result.session.messages.length}\nTokens: ${result.session.tokenCount.total.toLocaleString()}${
            result.contextFilesMissing.length > 0
              ? `\n\n⚠️ Warning: ${result.contextFilesMissing.length} context file(s) are no longer available.`
              : ''
          }`,
        });
        
        setSessionRestoreState('complete');
      } else {
        throw new Error(result.error ?? 'Failed to restore session');
      }
    } catch (error) {
      console.error('Session restoration failed:', error);
      setSessionRestoreError(error instanceof Error ? error.message : 'Unknown error');
      setSessionRestoreState('error');
    }
  }, [setWorkspaceRoot, setCurrentModel, addMessage]);

  // Handle new session selection
  const handleNewSession = useCallback(() => {
    setSessionRestoreState('complete');
    initializeNewSession();
  }, [initializeNewSession]);

  // Handle session detection error retry
  const handleRetryDetection = useCallback(() => {
    setSessionRestoreError(null);
    setSessionRestoreState('detecting');
    
    // Re-run detection
    const detectSessions = async () => {
      try {
        const detectionResult = await detectAvailableSessions(sessionManagerRef.current, {
          maxRecentSessions: 10,
          recentThresholdMs: 7 * 24 * 60 * 60 * 1000,
        });
        
        if (detectionResult.hasAvailableSessions) {
          setAvailableSessions(detectionResult.recentSessions);
          setSessionRestoreState('prompting');
        } else {
          setSessionRestoreState('complete');
          initializeNewSession();
        }
      } catch (error) {
        console.error('Session detection failed:', error);
        setSessionRestoreError(error instanceof Error ? error.message : 'Unknown error');
        setSessionRestoreState('error');
      }
    };
    
    void detectSessions();
  }, [initializeNewSession]);

  // Handle Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  // Handle slash commands
  const handleCommand = useCallback((command: string): void => {
    const [cmd, ...args] = command.slice(1).split(' ');

    // Create command context
    const commandContext = {
      addMessage,
      setError,
      showConfirmation: useAppStore.getState().showConfirmation,
      workspaceRoot: useAppStore.getState().workspaceRoot,
      currentModel: useAppStore.getState().currentModel,
      sessionActions: {
        createNewSession: useAppStore.getState().createNewSession,
        restoreSession: useAppStore.getState().restoreSession,
        saveCurrentSession: useAppStore.getState().saveCurrentSession,
        getSessionManager: useAppStore.getState().getSessionManager,
      },
    };

    // Try to execute command using registry
    const registry = createDefaultCommandRegistry();
    
    if (registry.has(cmd?.toLowerCase() || '')) {
      registry.execute(cmd?.toLowerCase() || '', args, commandContext).catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Command execution failed';
        setError(errorMessage);
        setTimeout(() => {
          setError(null);
        }, 5000);
      });
      return;
    }

    // Fallback to built-in commands
    switch (cmd?.toLowerCase()) {
      case 'help':
        addMessage({
          role: 'assistant',
          content: registry.generateHelp(),
        });
        break;

      case 'new':
        createNewSession(initialModel);
        addMessage({
          role: 'assistant',
          content: 'Started a new session.',
        });
        break;

      case 'exit':
        exit();
        break;

      case 'map': {
        const depth = parseInt(args[0] ?? '3', 10);
        addMessage({
          role: 'assistant',
          content: `Directory map (depth: ${depth}):\n\n\`\`\`\n${workspaceRoot}\n(Tree generation coming soon)\n\`\`\``,
        });
        break;
      }

      default:
        setError(`Unknown command: /${cmd ?? ''}`);
        setTimeout(() => {
          setError(null);
        }, 3000);
    }
  }, [addMessage, createNewSession, initialModel, exit, workspaceRoot, setError]);

  // Handle input submission
  const handleSubmit = useCallback((): void => {
    const trimmedInput = inputValue.trim();

    if (trimmedInput.length === 0) {
      return;
    }

    // Clear input
    setInputValue('');

    // Check for slash commands
    if (trimmedInput.startsWith('/')) {
      handleCommand(trimmedInput);
      return;
    }

    // Add user message
    addMessage({
      role: 'user',
      content: trimmedInput,
    });

    // Run agent loop if available
    if (agentRef.current !== null) {
      void agentRef.current.run().catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : 'Agent error';
        setError(errorMessage);
        setTimeout(() => {
          setError(null);
        }, 5000);
      });
    } else {
      // No agent available - show configuration hint
      addMessage({
        role: 'assistant',
        content: `⚠️ No API key configured.

**Option 1: Create a .env file in your project:**
\`\`\`
OPENAI_API_KEY=sk-...
\`\`\`

**Option 2: Set environment variable:**
\`\`\`bash
export OPENAI_API_KEY="sk-..."
\`\`\`

**Option 3: Configure in ~/.theo-code/config.yaml**

Then restart theo-code.`,
      });
    }
  }, [inputValue, addMessage, handleCommand, setError]);

  // Calculate terminal dimensions
  const terminalWidth = stdout?.columns ?? 80;
  const terminalHeight = stdout?.rows ?? 24;

  // Create fallback task data for offline scenarios
  const fallbackTasks: import('./shared/components/Layout/types.js').TaskItem[] = [
    {
      id: '1',
      title: 'Set up UI layout foundation',
      status: 'completed',
      description: 'Create directory structure and interfaces',
    },
    {
      id: '2',
      title: 'Implement FullScreenLayout component',
      status: 'completed',
      description: 'Create responsive layout container',
    },
    {
      id: '3',
      title: 'Integrate new UI with existing App',
      status: 'in-progress',
      description: 'Replace existing layout with FullScreenLayout',
    },
    {
      id: '4',
      title: 'Add responsive breakpoint behavior',
      status: 'not-started',
      description: 'Implement vertical stacking for narrow terminals',
    },
  ];

  // Use Archon MCP integration for task management
  const { tasks: archonTasks, connectionStatus } = useUIUpgradeArchonTasks(fallbackTasks);

  // Show session restoration UI if not complete
  if (sessionRestoreState !== 'complete') {
    return (
      <Box flexDirection="column" height={terminalHeight} justifyContent="center">
        {sessionRestoreState === 'detecting' && <SessionDetectionLoading />}
        
        {sessionRestoreState === 'prompting' && (
          <SessionRestoration
            sessions={availableSessions}
            onSessionSelected={handleSessionSelected}
            onNewSession={handleNewSession}
            showDetails={false}
            maxDisplaySessions={8}
          />
        )}
        
        {sessionRestoreState === 'restoring' && (
          <Box flexDirection="column" padding={1}>
            <Text color="cyan">Restoring session...</Text>
          </Box>
        )}
        
        {sessionRestoreState === 'error' && (
          <SessionDetectionError
            error={sessionRestoreError ?? 'Unknown error'}
            onRetry={handleRetryDetection}
            onContinue={handleNewSession}
          />
        )}
      </Box>
    );
  }

  return (
    <LayoutErrorBoundary
      onError={(error, errorInfo) => {
        logger.error('Layout system error in App component', {
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        });
        
        // Set error in store for potential recovery
        setError(`Layout error: ${error.message}`);
      }}
    >
      <FullScreenLayout
        terminalWidth={terminalWidth}
        terminalHeight={terminalHeight}
      >
        <ResponsiveLayoutContent
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onInputSubmit={handleSubmit}
          tasks={archonTasks}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
        />
      </FullScreenLayout>
    </LayoutErrorBoundary>
  );
};
