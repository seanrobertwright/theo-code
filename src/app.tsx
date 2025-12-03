/**
 * @fileoverview Main React Ink application component
 * @module app
 *
 * This is the root component for the theo-code TUI application.
 * It provides the main layout and orchestrates all UI components.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { type ReactElement, useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { MergedConfig } from './config/index.js';
import { useAppStore } from './shared/store/index.js';
import { formatTokenCount } from './shared/utils/index.js';

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

  // Store actions
  const setWorkspaceRoot = useAppStore((state) => state.setWorkspaceRoot);
  const setCurrentModel = useAppStore((state) => state.setCurrentModel);
  const createNewSession = useAppStore((state) => state.createNewSession);
  const addMessage = useAppStore((state) => state.addMessage);
  const setError = useAppStore((state) => state.setError);

  // Initialize store on mount
  useEffect(() => {
    setWorkspaceRoot(workspaceRoot);
    setCurrentModel(initialModel);
    createNewSession(initialModel);

    // Load AGENTS.md as system prompt if available
    if (config.agentsInstructions !== undefined) {
      addMessage({
        role: 'system',
        content: config.agentsInstructions,
      });
    }
  }, [workspaceRoot, initialModel, config, setWorkspaceRoot, setCurrentModel, createNewSession, addMessage]);

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

    // TODO: Trigger agent loop here
    // For now, just echo back
    addMessage({
      role: 'assistant',
      content: `[Echo] You said: ${trimmedInput}\n\n(Agent loop not yet implemented - this is the Phase 1 scaffold)`,
    });
  }, [inputValue, addMessage, handleCommand]);

  // Calculate terminal dimensions
  const terminalHeight = stdout?.rows ?? 24;
  const headerHeight = 3;
  const inputHeight = 3;
  const statusHeight = 1;
  const messageListHeight = terminalHeight - headerHeight - inputHeight - statusHeight - 2;

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
