# Centralized Input Manager

The `useInputManager` hook provides a centralized solution for managing input handlers in React Ink applications, preventing conflicts and ensuring only one handler is active at a time.

## Problem Solved

Before the centralized input manager, multiple components using `useInput` directly could cause:
- Screen flickering due to handler conflicts
- Multiple handlers firing simultaneously
- Stale closures and memory leaks
- Unpredictable input behavior

## Features

- **Single Source of Truth**: One master input handler delegates to active component handlers
- **Priority System**: Handlers are prioritized, highest priority becomes active
- **Automatic Cleanup**: Handlers are properly registered/unregistered on mount/unmount
- **Error Handling**: Graceful error recovery with logging
- **Debug Support**: Built-in debugging utilities
- **Performance**: Prevents unnecessary re-registrations

## Basic Usage

### 1. Wrap Your App

```tsx
import { InputManagerProvider } from './shared/hooks/useInputManager.js';

function App() {
  return (
    <InputManagerProvider>
      <YourComponents />
    </InputManagerProvider>
  );
}
```

### 2. Use in Components

```tsx
import { useInputHandler } from './shared/hooks/useInputManager.js';

function MyComponent() {
  const handleInput = useCallback((input: string, key: any) => {
    if (key.return) {
      // Handle enter key
    }
    // Handle other input
  }, []);

  const { isActive, activate, deactivate } = useInputHandler(
    'my-component',           // Unique ID
    handleInput,              // Handler function
    'MyComponent',            // Component name (for debugging)
    {
      priority: 5,            // Priority (higher = more important)
      autoActivate: true,     // Auto-activate on mount
      dependencies: [handleInput] // Dependencies for useCallback
    }
  );

  return (
    <Box>
      <Text color={isActive ? 'green' : 'gray'}>
        {isActive ? 'Active' : 'Inactive'}
      </Text>
    </Box>
  );
}
```

## Advanced Usage

### Manual Input Manager Control

```tsx
import { useInputManager } from './shared/hooks/useInputManager.js';

function AdvancedComponent() {
  const inputManager = useInputManager();

  const handleSpecialCase = () => {
    // Get current active handler
    const activeHandler = inputManager.getActiveHandler();
    
    // Get all handlers
    const allHandlers = inputManager.getAllHandlers();
    
    // Set specific handler as active
    inputManager.setActiveHandler('specific-handler-id');
    
    // Check if handler is active
    const isActive = inputManager.isHandlerActive('my-handler');
  };

  return <Box>{/* Your component */}</Box>;
}
```

### Debugging

```tsx
import { useInputManagerDebug } from './shared/hooks/useInputManager.js';

function DebugComponent() {
  const debug = useInputManagerDebug();

  useEffect(() => {
    console.log('Total handlers:', debug.totalHandlers);
    console.log('Active handler:', debug.activeHandlerId);
    console.log('Is processing:', debug.isProcessing);
    
    // Log full state
    debug.logState();
  }, [debug]);

  return <Box>{/* Your component */}</Box>;
}
```

## Priority System

Handlers are automatically prioritized:

- **Higher numbers = Higher priority**
- **Active handler receives all input**
- **Automatic fallback** to next highest priority when handler is removed

```tsx
// This handler will be active (highest priority)
useInputHandler('high', handler, 'High', { priority: 10 });

// This handler will be inactive
useInputHandler('medium', handler, 'Medium', { priority: 5 });

// This handler will be inactive
useInputHandler('low', handler, 'Low', { priority: 1 });
```

## Error Handling

The input manager includes comprehensive error handling:

```tsx
const handleInput = useCallback((input: string, key: any) => {
  try {
    // Your input logic
  } catch (error) {
    // Errors are caught and logged by the input manager
    // The app continues to function
  }
}, []);
```

## Migration from Direct useInput

### Before (Problematic)

```tsx
import { useInput } from 'ink';

function Component() {
  useInput((input, key) => {
    // Handler logic - can conflict with other components
  });
  
  return <Box>Content</Box>;
}
```

### After (Fixed)

```tsx
import { useInputHandler } from './shared/hooks/useInputManager.js';

function Component() {
  const handleInput = useCallback((input: string, key: any) => {
    // Handler logic - managed centrally, no conflicts
  }, []);

  useInputHandler('component-id', handleInput, 'Component');
  
  return <Box>Content</Box>;
}
```

## API Reference

### InputManagerProvider

Provider component that must wrap your app.

```tsx
<InputManagerProvider>
  <App />
</InputManagerProvider>
```

### useInputManager()

Returns the input manager instance with full control methods.

```tsx
const {
  registerHandler,
  unregisterHandler,
  setActiveHandler,
  getActiveHandler,
  getAllHandlers,
  isHandlerActive,
  state
} = useInputManager();
```

### useInputHandler(id, handler, component, options?)

Registers an input handler with the centralized manager.

**Parameters:**
- `id: string` - Unique identifier for the handler
- `handler: (input: string, key: any) => void` - Input handler function
- `component: string` - Component name for debugging
- `options?: object` - Configuration options
  - `priority?: number` - Handler priority (default: 0)
  - `autoActivate?: boolean` - Auto-activate on mount (default: false)
  - `dependencies?: any[]` - Dependencies for useCallback (default: [])

**Returns:**
```tsx
{
  isActive: boolean,
  activate: () => void,
  deactivate: () => void
}
```

### useInputManagerDebug()

Returns debugging information about the input manager state.

```tsx
const {
  totalHandlers,
  activeHandlerId,
  isProcessing,
  lastInputTime,
  handlers,
  logState
} = useInputManagerDebug();
```

## Best Practices

1. **Always use unique IDs** for handlers
2. **Set appropriate priorities** based on component importance
3. **Use useCallback** for handler functions to prevent re-registrations
4. **Include proper dependencies** in the dependencies array
5. **Use descriptive component names** for easier debugging
6. **Test handler conflicts** in development
7. **Monitor debug output** during development

## Performance Considerations

- Handlers are memoized to prevent unnecessary re-registrations
- Only one master `useInput` hook is used regardless of component count
- Automatic cleanup prevents memory leaks
- Priority-based activation is O(n) where n is the number of handlers

## Troubleshooting

### Handler Not Receiving Input

1. Check if handler is active: `isActive`
2. Verify unique ID is used
3. Check priority compared to other handlers
4. Ensure component is wrapped in `InputManagerProvider`

### Multiple Handlers Firing

This should not happen with the centralized manager. If it does:

1. Verify all components use `useInputHandler` instead of direct `useInput`
2. Check for duplicate handler IDs
3. Enable debug logging to investigate

### Memory Leaks

The input manager automatically handles cleanup, but ensure:

1. Handler functions are properly memoized with `useCallback`
2. Dependencies array is correct
3. Components properly unmount

## Testing

The input manager includes comprehensive tests. Run them with:

```bash
npx vitest run src/shared/hooks/__tests__/useInputManager.test.ts
```

## Example

See `useInputManager.example.tsx` for a complete working example demonstrating multiple components with different priorities.