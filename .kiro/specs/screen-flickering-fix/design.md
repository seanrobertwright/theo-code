# Screen Flickering Fix - Design Document

## Overview

This design document provides detailed technical solutions for fixing the screen flickering issue that occurs during "New Session" selection. The design focuses on proper React Ink hook management, state batching, and render cycle optimization to ensure a stable terminal UI experience.

## Architecture

### Problem Analysis

The screen flickering issue is caused by a cascade of re-renders triggered during session initialization:

```mermaid
graph TD
    A[User Selects "New Session"] --> B[initializeNewSession Called]
    B --> C[Multiple State Updates]
    C --> D[Component Re-renders]
    D --> E[useInput Re-registers]
    E --> F[Stale Closure Created]
    F --> G[Handler Fires Again]
    G --> H[More State Updates]
    H --> D
    
    style D fill:#ff9999
    style E fill:#ff9999
    style F fill:#ff9999
    style G fill:#ff9999
    style H fill:#ff9999
```

### Solution Architecture

The fix implements a controlled render cycle with proper hook dependencies:

```mermaid
graph TD
    A[User Selects "New Session"] --> B[initializeNewSession Called]
    B --> C[Batched State Update]
    C --> D[Single Re-render]
    D --> E[Stable useInput Handler]
    E --> F[User Input Ready]
    
    style C fill:#99ff99
    style D fill:#99ff99
    style E fill:#99ff99
    style F fill:#99ff99
```

## Component Analysis and Fixes

### 1. InputArea Component Fix

**Current Problem:**
```typescript
// src/shared/components/Layout/InputArea.tsx
useInput((input, key) => {
  // Handler logic without dependency array
  // This re-registers on every render, creating stale closures
});
```

**Solution:**
```typescript
// Fixed version with proper dependencies
const handleInput = useCallback((input: string, key: Key) => {
  // Handler logic
}, [/* proper dependencies */]);

useInput(handleInput);
```

**Implementation Details:**
- Add `useCallback` to memoize the input handler
- Identify all variables used within the handler that come from props or state
- Include only necessary dependencies to prevent unnecessary re-registrations
- Ensure the handler function reference remains stable across renders

### 2. Session Initialization Batching

**Current Problem:**
```typescript
// src/app.tsx - Multiple separate state updates
const initializeNewSession = () => {
  setCurrentSession(null);
  setMessages([]);
  setIsLoading(true);
  setSessionId(generateId());
  // Each setState causes a re-render
};
```

**Solution:**
```typescript
// Batched state update using functional updates
const initializeNewSession = useCallback(() => {
  // Use React's automatic batching or explicit batching
  startTransition(() => {
    setAppState(prevState => ({
      ...prevState,
      currentSession: null,
      messages: [],
      isLoading: true,
      sessionId: generateId()
    }));
  });
}, []);
```

**Implementation Details:**
- Combine multiple state updates into a single state object update
- Use `startTransition` for non-urgent updates to prevent blocking
- Implement functional state updates to ensure consistency
- Use `useCallback` to prevent the function from changing on every render

### 3. Layout Calculation Stabilization

**Current Problem:**
```typescript
// src/shared/components/Layout/FullScreenLayout.tsx
const FullScreenLayout = ({ children }) => {
  const { width, height } = useTerminalSize();
  
  // Recalculates on every render
  const layoutConfig = {
    contextWidth: Math.floor(width * 0.7),
    sidebarWidth: width - Math.floor(width * 0.7),
    // ... more calculations
  };
  
  return <Box>{children}</Box>;
};
```

**Solution:**
```typescript
// Memoized layout calculations
const FullScreenLayout = ({ children }) => {
  const { width, height } = useTerminalSize();
  
  const layoutConfig = useMemo(() => ({
    contextWidth: Math.floor(width * 0.7),
    sidebarWidth: width - Math.floor(width * 0.7),
    // ... more calculations
  }), [width, height]);
  
  // Debounce dimension changes during initialization
  const debouncedLayout = useMemo(() => 
    debounce(layoutConfig, 100), [layoutConfig]
  );
  
  return <Box>{children}</Box>;
};
```

**Implementation Details:**
- Use `useMemo` to memoize expensive layout calculations
- Implement debouncing for rapid dimension changes
- Separate layout logic from rendering logic
- Cache layout configurations to prevent recalculation

### 4. Input Handler Coordination

**Current Problem:**
```typescript
// Multiple components with useInput handlers
// InputArea.tsx
useInput((input, key) => { /* handler 1 */ });

// MessageList.tsx  
useInput((input, key) => { /* handler 2 */ });

// Both handlers can fire simultaneously
```

**Solution:**
```typescript
// Centralized input management
interface InputManager {
  registerHandler(id: string, handler: InputHandler): void;
  unregisterHandler(id: string): void;
  setActiveHandler(id: string): void;
}

// In each component
const InputArea = () => {
  const inputManager = useInputManager();
  
  useEffect(() => {
    const handler = (input: string, key: Key) => {
      // Handler logic
    };
    
    inputManager.registerHandler('input-area', handler);
    inputManager.setActiveHandler('input-area');
    
    return () => inputManager.unregisterHandler('input-area');
  }, [inputManager]);
};
```

**Implementation Details:**
- Create a centralized input management system
- Implement handler registration and cleanup
- Ensure only one handler is active at a time
- Use proper cleanup in useEffect return functions

## Data Models

### State Management Structure

```typescript
interface AppState {
  // Session state
  currentSession: Session | null;
  sessionId: string | null;
  messages: Message[];
  
  // UI state
  isLoading: boolean;
  isInitializing: boolean;
  
  // Input state
  activeInputHandler: string | null;
  inputHandlers: Map<string, InputHandler>;
}

interface SessionInitializationState {
  phase: 'idle' | 'initializing' | 'complete' | 'error';
  startTime: number;
  error?: Error;
}
```

### Input Handler Management

```typescript
interface InputHandler {
  id: string;
  handler: (input: string, key: Key) => void;
  priority: number;
  isActive: boolean;
}

interface InputManagerState {
  handlers: Map<string, InputHandler>;
  activeHandlerId: string | null;
  isProcessing: boolean;
}
```

## Implementation Strategy

### Phase 1: Critical Hook Fixes

1. **Fix InputArea useInput Dependencies**
   ```typescript
   // Before
   useInput((input, key) => {
     onInput(input, key);
   });
   
   // After
   const handleInput = useCallback((input: string, key: Key) => {
     onInput(input, key);
   }, [onInput]);
   
   useInput(handleInput);
   ```

2. **Implement State Batching**
   ```typescript
   // Before
   const initializeNewSession = () => {
     setCurrentSession(null);
     setMessages([]);
     setIsLoading(true);
   };
   
   // After
   const initializeNewSession = useCallback(() => {
     startTransition(() => {
       setAppState(prev => ({
         ...prev,
         currentSession: null,
         messages: [],
         isLoading: true
       }));
     });
   }, []);
   ```

### Phase 2: Layout Optimization

1. **Memoize Layout Calculations**
   ```typescript
   const layoutConfig = useMemo(() => {
     return calculateLayout(width, height, options);
   }, [width, height, options]);
   ```

2. **Implement Debouncing**
   ```typescript
   const debouncedResize = useMemo(() => 
     debounce((w: number, h: number) => {
       setDimensions({ width: w, height: h });
     }, 100), []
   );
   ```

### Phase 3: Input Management

1. **Create Input Manager Hook**
   ```typescript
   const useInputManager = () => {
     const [state, setState] = useState<InputManagerState>({
       handlers: new Map(),
       activeHandlerId: null,
       isProcessing: false
     });
     
     const registerHandler = useCallback((id: string, handler: InputHandler) => {
       setState(prev => ({
         ...prev,
         handlers: new Map(prev.handlers).set(id, handler)
       }));
     }, []);
     
     return { registerHandler, /* other methods */ };
   };
   ```

## Error Handling Strategy

### Input Handler Errors

```typescript
const safeInputHandler = (handler: InputHandler) => {
  return (input: string, key: Key) => {
    try {
      handler(input, key);
    } catch (error) {
      console.error('Input handler error:', error);
      // Fallback to default behavior
      defaultInputHandler(input, key);
    }
  };
};
```

### State Update Errors

```typescript
const safeStateUpdate = (updater: StateUpdater) => {
  try {
    startTransition(() => {
      updater();
    });
  } catch (error) {
    console.error('State update error:', error);
    // Implement recovery logic
    recoverFromStateError(error);
  }
};
```

### Layout Calculation Errors

```typescript
const safeLayoutCalculation = (width: number, height: number) => {
  try {
    return calculateLayout(width, height);
  } catch (error) {
    console.error('Layout calculation error:', error);
    return getDefaultLayout();
  }
};
```

## Performance Optimizations

### Render Cycle Optimization

1. **Minimize Re-renders**
   - Use `React.memo` for components that don't need frequent updates
   - Implement proper dependency arrays for all hooks
   - Use `useCallback` and `useMemo` strategically

2. **Batch State Updates**
   - Combine related state updates into single operations
   - Use `startTransition` for non-urgent updates
   - Implement custom batching for complex state changes

3. **Optimize Layout Calculations**
   - Cache expensive calculations with `useMemo`
   - Debounce rapid dimension changes
   - Use efficient algorithms for layout computation

### Memory Management

1. **Proper Cleanup**
   ```typescript
   useEffect(() => {
     const handler = createInputHandler();
     registerHandler(handler);
     
     return () => {
       unregisterHandler(handler);
       cleanup(handler);
     };
   }, []);
   ```

2. **Prevent Memory Leaks**
   - Clear timers and intervals in cleanup functions
   - Remove event listeners properly
   - Dispose of heavy objects when components unmount

## Testing Strategy

### Unit Tests

```typescript
describe('InputArea useInput fix', () => {
  it('should not re-register handler on every render', () => {
    const mockUseInput = jest.fn();
    const { rerender } = render(<InputArea />);
    
    expect(mockUseInput).toHaveBeenCalledTimes(1);
    
    rerender(<InputArea />);
    expect(mockUseInput).toHaveBeenCalledTimes(1); // Should not increase
  });
});
```

### Integration Tests

```typescript
describe('Session initialization', () => {
  it('should complete in single render cycle', () => {
    const renderSpy = jest.fn();
    const { getByText } = render(<App onRender={renderSpy} />);
    
    fireEvent.click(getByText('New Session'));
    
    // Should only render once for initialization
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
```

### Property-Based Tests

```typescript
import fc from 'fast-check';

describe('Layout calculations', () => {
  it('should be stable across multiple calls', () => {
    fc.assert(fc.property(
      fc.integer(80, 200), // width
      fc.integer(20, 50),  // height
      (width, height) => {
        const layout1 = calculateLayout(width, height);
        const layout2 = calculateLayout(width, height);
        expect(layout1).toEqual(layout2);
      }
    ));
  });
});
```

## Validation and Monitoring

### Performance Metrics

1. **Render Cycle Count**: Track number of renders during session initialization
2. **Input Response Time**: Measure time from input to handler execution
3. **Memory Usage**: Monitor memory consumption during extended sessions
4. **Layout Calculation Time**: Measure time spent on layout calculations

### Error Monitoring

1. **Handler Registration Failures**: Track input handler registration errors
2. **State Update Failures**: Monitor state batching failures
3. **Layout Calculation Errors**: Track layout computation errors
4. **Memory Leaks**: Monitor for uncleaned resources

### Success Metrics

1. **Zero Flickering**: No visual flickering during session creation
2. **Single Render**: Session initialization completes in one render cycle
3. **Fast Response**: Input handlers respond within 50ms
4. **Stable Memory**: No memory leaks during extended usage
5. **Consistent Behavior**: Reliable session creation across scenarios

## Implementation Checklist

### Phase 1: Critical Fixes
- [ ] Fix InputArea useInput dependencies
- [ ] Implement state batching for session initialization
- [ ] Add proper input handler cleanup
- [ ] Test basic "New Session" functionality

### Phase 2: Optimization
- [ ] Memoize layout calculations
- [ ] Implement debouncing for dimension changes
- [ ] Fix remaining useEffect dependency arrays
- [ ] Add comprehensive error handling

### Phase 3: Validation
- [ ] Implement property-based tests
- [ ] Add performance monitoring
- [ ] Create integration tests
- [ ] Validate fix across different terminal environments

This design provides a comprehensive approach to fixing the screen flickering issue while maintaining code quality and performance standards.