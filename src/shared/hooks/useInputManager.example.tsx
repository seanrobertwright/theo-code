/**
 * @fileoverview Example usage of the centralized Input Manager
 * @module shared/hooks/useInputManager.example
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import { InputManagerProvider, useInputHandler } from './useInputManager.js';

/**
 * Example component that uses the input manager
 */
const ExampleInputComponent: React.FC<{ id: string; priority: number }> = ({ id, priority }) => {
  const [message, setMessage] = React.useState('');

  // Define the input handler
  const handleInput = React.useCallback((input: string, key: any) => {
    if (key.return) {
      setMessage(`${id} received: Enter key`);
    } else if (key.escape) {
      setMessage(`${id} received: Escape key`);
    } else if (input) {
      setMessage(`${id} received: "${input}"`);
    }
  }, [id]);

  // Register the input handler with the centralized manager
  const { isActive, activate } = useInputHandler(
    id,
    handleInput,
    'ExampleInputComponent',
    {
      priority,
      autoActivate: priority === 10, // Auto-activate highest priority
      dependencies: [handleInput],
    }
  );

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={isActive ? 'green' : 'gray'}>
        {id} (Priority: {priority}) - {isActive ? 'ACTIVE' : 'inactive'}
      </Text>
      <Text>{message || 'Waiting for input...'}</Text>
      {!isActive && (
        <Text color="yellow" dimColor>
          Press 'a' to activate this handler
        </Text>
      )}
    </Box>
  );
};

/**
 * Example app demonstrating the input manager
 */
const ExampleApp: React.FC = () => {
  return (
    <InputManagerProvider>
      <Box flexDirection="column" padding={1}>
        <Text bold color="blue">
          Centralized Input Manager Example
        </Text>
        <Text dimColor>
          Multiple components can register input handlers with different priorities.
          Only the active handler receives input events.
        </Text>
        
        <ExampleInputComponent id="HighPriority" priority={10} />
        <ExampleInputComponent id="MediumPriority" priority={5} />
        <ExampleInputComponent id="LowPriority" priority={1} />
        
        <Box marginTop={1}>
          <Text color="cyan">
            The highest priority handler (HighPriority) is automatically active.
            Input conflicts are prevented by the centralized manager.
          </Text>
        </Box>
      </Box>
    </InputManagerProvider>
  );
};

export default ExampleApp;

/**
 * Usage patterns for the Input Manager:
 * 
 * 1. Wrap your app with InputManagerProvider:
 *    <InputManagerProvider>
 *      <YourApp />
 *    </InputManagerProvider>
 * 
 * 2. Use useInputHandler in components:
 *    const { isActive, activate, deactivate } = useInputHandler(
 *      'unique-id',
 *      handleInputFunction,
 *      'ComponentName',
 *      { priority: 5, autoActivate: true }
 *    );
 * 
 * 3. Benefits:
 *    - Prevents input handler conflicts
 *    - Automatic priority-based activation
 *    - Centralized input management
 *    - Proper cleanup on unmount
 *    - Debug capabilities
 * 
 * 4. Priority system:
 *    - Higher numbers = higher priority
 *    - Active handler receives all input
 *    - Automatic fallback to next highest priority
 * 
 * 5. Error handling:
 *    - Graceful error recovery
 *    - Logging for debugging
 *    - Fallback mechanisms
 */