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
import { ConfirmDialog, SessionRestoration, SessionDetectionLoading, SessionDetectionError, SessionRestorationErrorBoundary, SessionDetectionErrorBoundary } from './shared/components/index.js';
import { createSessionManager } from './features/session/index.js';
import { createSafeSessionManager } from './features/session/safe-session-manager.js';
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
    'detecting' | 'validating' | 'prompting' | 'restoring' | 'error' | 'complete'
  >('detecting');
  const [availableSessions, setAvailableSessions] = useState<SessionMetadata[]>([]);
  const [sessionRestoreError, setSessionRestoreError] = useState<string | null>(null);
  const [validationProgress, setValidationProgress] = useState<{
    current: number;
    total: number;
    currentSession?: string;
  }>({ current: 0, total: 0 });

  // Agent loop ref
  const agentRef = useRef<AgentLoop | null>(null);
  
  // Session manager ref - use safe session manager
  const sessionManagerRef = useRef(createSafeSessionManager());

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
        
        // Use safe session detection with validation progress
        const safeDetectionResult = await sessionManagerRef.current.detectAvailableSessionsSafely({
          limit: 10,
          sortBy: 'lastModified',
          sortOrder: 'desc',
        });
        
        // Show validation progress if there were sessions to validate
        if (safeDetectionResult.validSessions.length > 0 || safeDetectionResult.invalidSessions.length > 0) {
          setSessionRestoreState('validating');
          setValidationProgress({
            current: safeDetectionResult.validSessions.length + safeDetectionResult.invalidSessions.length,
            total: safeDetectionResult.validSessions.length + safeDetectionResult.invalidSessions.length,
          });
          
          // Brief delay to show validation progress
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Handle warnings from validation
        if (safeDetectionResult.warnings.length > 0) {
          logger.warn(`Session detection warnings: ${safeDetectionResult.warnings.join('; ')}`);
        }
        
        if (safeDetectionResult.validSessions.length > 0) {
          setAvailableSessions(safeDetectionResult.validSessions);
          setSessionRestoreState('prompting');
        } else {
          // No valid sessions found, proceed with graceful fallback to new session
          logger.info('No valid sessions found, creating new session');
          setSessionRestoreState('complete');
          initializeNewSession();
        }
      } catch (error) {
        console.error('Session detection failed:', error);
        
        // Graceful fallback: if detection fails completely, create new session
        logger.error(`Session detection failed, falling back to new session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setSessionRestoreError(`Session detection failed: ${error instanceof Error ? error.message : 'Unknown error'}. Creating new session instead.`);
        
        // Don't show error state, just proceed with new session
        setSessionRestoreState('complete');
        initializeNewSession();
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
      
      // Use safe session restoration with error recovery
      const safeRestorationResult = await sessionManagerRef.current.restoreSessionSafely(sessionId as SessionId);
      
      if (safeRestorationResult.success && safeRestorationResult.session) {
        // Update store with restored session
        setWorkspaceRoot(safeRestorationResult.session.workspaceRoot);
        setCurrentModel(safeRestorationResult.session.model);
        
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
        
        // Show restoration success message with context file status
        const contextStatus = safeRestorationResult.contextFilesStatus;
        const contextMessage = contextStatus 
          ? (contextStatus.missing.length > 0 
              ? `\n\n⚠️ Warning: ${contextStatus.missing.length} context file(s) are no longer available.`
              : '')
          : '';
        
        addMessage({
          role: 'assistant',
          content: `✓ Session restored successfully!\n\nModel: ${safeRestorationResult.session.model}\nMessages: ${safeRestorationResult.session.messages.length}\nTokens: ${safeRestorationResult.session.tokenCount.total.toLocaleString()}${contextMessage}`,
        });
        
        setSessionRestoreState('complete');
      } else {
        // Restoration failed - implement progressive recovery escalation
        const error = safeRestorationResult.error || new Error('Session restoration failed');
        logger.error(`Session restoration failed for ${sessionId}: ${error.message}`);
        
        // Check if we have recovery options
        if (safeRestorationResult.recoveryOptions && safeRestorationResult.recoveryOptions.length > 0) {
          // Find the most appropriate recovery option
          const recommendedOption = safeRestorationResult.recoveryOptions.find(opt => opt.isRecommended);
          const fallbackOption = safeRestorationResult.recoveryOptions.find(opt => opt.type === 'new-session');
          const skipOption = safeRestorationResult.recoveryOptions.find(opt => opt.type === 'skip');
          
          // Progressive escalation: try recommended option, then fallback, then skip
          if (recommendedOption && recommendedOption.type === 'retry') {
            // Don't auto-retry to avoid infinite loops - let user decide
            setSessionRestoreError(`Session restoration failed: ${error.message}. You can try again or create a new session.`);
            setSessionRestoreState('error');
          } else if (fallbackOption) {
            // Graceful fallback to new session creation
            logger.info('Using fallback recovery option: creating new session');
            await fallbackOption.action();
            setSessionRestoreState('complete');
            initializeNewSession();
          } else if (skipOption) {
            // Skip this session and show alternatives
            logger.info('Using skip recovery option');
            await skipOption.action();
            // Go back to session selection with remaining sessions
            const updatedSessions = availableSessions.filter(s => s.id !== sessionId);
            if (updatedSessions.length > 0) {
              setAvailableSessions(updatedSessions);
              setSessionRestoreState('prompting');
            } else {
              // No more sessions available, create new session
              setSessionRestoreState('complete');
              initializeNewSession();
            }
          } else {
            // No suitable recovery options, fallback to new session
            logger.warn('No suitable recovery options available, falling back to new session');
            setSessionRestoreState('complete');
            initializeNewSession();
          }
        } else {
          // No recovery options available, graceful fallback to new session
          logger.warn('No recovery options available, falling back to new session');
          setSessionRestoreError(`Session restoration failed: ${error.message}. Creating new session instead.`);
          setSessionRestoreState('complete');
          initializeNewSession();
        }
      }
    } catch (error) {
      console.error('Session restoration failed:', error);
      
      // Ultimate fallback: if everything fails, create new session
      logger.error(`Session restoration completely failed, falling back to new session: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSessionRestoreError(`Session restoration failed: ${error instanceof Error ? error.message : 'Unknown error'}. Creating new session instead.`);
      setSessionRestoreState('complete');
      initializeNewSession();
    }
  }, [setWorkspaceRoot, setCurrentModel, addMessage, availableSessions, initializeNewSession]);

  // Handle new session selection
  const handleNewSession = useCallback(() => {
    setSessionRestoreState('complete');
    initializeNewSession();
  }, [initializeNewSession]);

  // Handle session detection error retry
  const handleRetryDetection = useCallback(() => {
    setSessionRestoreError(null);
    setSessionRestoreState('detecting');
    
    // Re-run safe detection
    const detectSessions = async () => {
      try {
        const safeDetectionResult = await sessionManagerRef.current.detectAvailableSessionsSafely({
          limit: 10,
          sortBy: 'lastModified',
          sortOrder: 'desc',
        });
        
        // Show validation progress if there were sessions to validate
        if (safeDetectionResult.validSessions.length > 0 || safeDetectionResult.invalidSessions.length > 0) {
          setSessionRestoreState('validating');
          setValidationProgress({
            current: safeDetectionResult.validSessions.length + safeDetectionResult.invalidSessions.length,
            total: safeDetectionResult.validSessions.length + safeDetectionResult.invalidSessions.length,
          });
          
          // Brief delay to show validation progress
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (safeDetectionResult.validSessions.length > 0) {
          setAvailableSessions(safeDetectionResult.validSessions);
          setSessionRestoreState('prompting');
        } else {
          setSessionRestoreState('complete');
          initializeNewSession();
        }
      } catch (error) {
        console.error('Session detection failed:', error);
        
        // Graceful fallback on retry failure too
        logger.error(`Session detection retry failed, falling back to new session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setSessionRestoreState('complete');
        initializeNewSession();
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
        {sessionRestoreState === 'detecting' && (
          <SessionDetectionErrorBoundary
            onFallbackToNewSession={handleNewSession}
            onRetryDetection={handleRetryDetection}
            onError={(error, errorInfo) => {
              logger.error('Session detection error boundary caught error', {
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                context: 'session-detection',
              });
            }}
          >
            <SessionDetectionLoading />
          </SessionDetectionErrorBoundary>
        )}
        
        {sessionRestoreState === 'validating' && (
          <SessionDetectionErrorBoundary
            onFallbackToNewSession={handleNewSession}
            onRetryDetection={handleRetryDetection}
            onError={(error, errorInfo) => {
              logger.error('Session validation error boundary caught error', {
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                context: 'session-validation',
              });
            }}
          >
            <Box flexDirection="column" padding={1}>
              <Text color="cyan">Validating sessions...</Text>
              <Text color="gray">
                Validated {validationProgress.current} of {validationProgress.total} sessions
              </Text>
              {validationProgress.currentSession && (
                <Text color="gray">Current: {validationProgress.currentSession}</Text>
              )}
            </Box>
          </SessionDetectionErrorBoundary>
        )}
        
        {sessionRestoreState === 'prompting' && (
          <SessionRestorationErrorBoundary
            onFallbackToNewSession={handleNewSession}
            onError={(error, errorInfo) => {
              logger.error('Session restoration UI error boundary caught error', {
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                context: 'session-restoration-ui',
              });
            }}
          >
            <SessionRestoration
              sessions={availableSessions}
              onSessionSelected={handleSessionSelected}
              onNewSession={handleNewSession}
              showDetails={false}
              maxDisplaySessions={8}
            />
          </SessionRestorationErrorBoundary>
        )}
        
        {sessionRestoreState === 'restoring' && (
          <SessionRestorationErrorBoundary
            onFallbackToNewSession={handleNewSession}
            onError={(error, errorInfo) => {
              logger.error('Session restoration process error boundary caught error', {
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                context: 'session-restoration-process',
              });
            }}
          >
            <Box flexDirection="column" padding={1}>
              <Text color="cyan">Restoring session...</Text>
            </Box>
          </SessionRestorationErrorBoundary>
        )}
        
        {sessionRestoreState === 'error' && (
          <SessionDetectionErrorBoundary
            onFallbackToNewSession={handleNewSession}
            onRetryDetection={handleRetryDetection}
            onError={(error, errorInfo) => {
              logger.error('Session error display error boundary caught error', {
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                context: 'session-error-display',
              });
            }}
          >
            <SessionDetectionError
              error={sessionRestoreError ?? 'Unknown error'}
              onRetry={handleRetryDetection}
              onContinue={handleNewSession}
            />
          </SessionDetectionErrorBoundary>
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
