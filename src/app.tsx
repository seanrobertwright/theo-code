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
import { createFileSystemTools } from './features/tools/filesystem/index.js';
import { ConfirmDialog, SessionRestoration, SessionDetectionLoading, SessionDetectionError } from './shared/components/index.js';
import { createSessionManager } from './features/session/index.js';
import { detectAvailableSessions, restoreSessionOnStartup } from './features/session/startup.js';
import type { ModelConfig } from './shared/types/models.js';
import type { SessionMetadata, SessionId } from './shared/types/index.js';

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
// HEADER COMPONENT
// =============================================================================

/**
 * Header component showing app info and status.
 */
const Header = (): ReactElement => {
  const currentModel = useAppStore((state) => state.currentModel);
  const session = useAppStore((state) => state.session);
  const tokenCount = session?.tokenCount.total ?? 0;

  return (
    <Box
      borderStyle="single"
      borderColor="blue"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold color="cyan">
        theo-code v0.1.0
      </Text>
      <Text>
        Model: <Text color="green">{currentModel}</Text>
      </Text>
      <Text>
        Tokens: <Text color="yellow">{formatTokenCount(tokenCount)}</Text>
      </Text>
    </Box>
  );
};

// =============================================================================
// MESSAGE LIST COMPONENT
// =============================================================================

/**
 * Message list component showing conversation history.
 */
const MessageList = (): ReactElement => {
  const messages = useAppStore((state) => state.messages);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const streamingText = useAppStore((state) => state.streamingText);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.length === 0 ? (
        <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
          <Text color="gray">Welcome to theo-code!</Text>
          <Text color="gray">Type a message or use /help to see available commands.</Text>
        </Box>
      ) : (
        messages.map((message) => (
          <Box key={message.id} marginY={0} flexDirection="column">
            <Text bold color={message.role === 'user' ? 'blue' : 'green'}>
              {message.role === 'user' ? 'You' : 'Assistant'}:
            </Text>
            <Box marginLeft={2}>
              <Text>
                {typeof message.content === 'string'
                  ? message.content
                  : message.content
                      .filter((block) => block.type === 'text')
                      .map((block) => (block.type === 'text' ? block.text : ''))
                      .join('\n')}
              </Text>
            </Box>
          </Box>
        ))
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <Box marginY={0} flexDirection="column">
          <Text bold color="green">
            Assistant:
          </Text>
          <Box marginLeft={2}>
            <Text>{streamingText}</Text>
            <Text color="gray">▊</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// =============================================================================
// INPUT COMPONENT
// =============================================================================

/**
 * Input component for user messages.
 */
const InputArea = ({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (_value: string) => void;
  onSubmit: () => void;
}): ReactElement => {
  const isStreaming = useAppStore((state) => state.isStreaming);

  useInput((input, key) => {
    if (isStreaming) {
      return;
    }

    if (key.return) {
      onSubmit();
      return;
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && input.length > 0) {
      onChange(value + input);
    }
  });

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="cyan">&gt; </Text>
      <Text>{value}</Text>
      {!isStreaming && <Text color="gray">▊</Text>}
      {isStreaming && <Text color="yellow"> (streaming...)</Text>}
    </Box>
  );
};

// =============================================================================
// STATUS BAR COMPONENT
// =============================================================================

/**
 * Status bar showing hints and context.
 */
const StatusBar = (): ReactElement => {
  const contextFiles = useAppStore((state) => state.contextFiles);
  const error = useAppStore((state) => state.error);

  return (
    <Box paddingX={1} justifyContent="space-between">
      {error !== null ? (
        <Text color="red">{error}</Text>
      ) : (
        <>
          <Text color="gray">
            Tab: commands | Ctrl+C: exit | /help for more
          </Text>
          <Text color="gray">
            Context: {contextFiles.size} files
          </Text>
        </>
      )}
    </Box>
  );
};

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

    switch (cmd?.toLowerCase()) {
      case 'help':
        addMessage({
          role: 'assistant',
          content: `**Available Commands:**

/help - Show this help message
/new - Start a new session
/add @path - Add file/directory to context
/drop @path - Remove file from context
/map [depth] - Show directory tree
/model - Switch model (coming soon)
/exit - Exit the application

**Tips:**
- Type your message and press Enter to chat
- Use Ctrl+C to exit at any time`,
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
  const terminalHeight = stdout?.rows ?? 24;
  const headerHeight = 3;
  const inputHeight = 3;
  const statusHeight = 1;
  const messageListHeight = terminalHeight - headerHeight - inputHeight - statusHeight - 2;

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
    <Box flexDirection="column" height={terminalHeight}>
      <Header />

      <Box height={messageListHeight} overflow="hidden">
        <MessageList />
      </Box>

      <InputArea
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
      />

      <StatusBar />
    </Box>
  );
};
