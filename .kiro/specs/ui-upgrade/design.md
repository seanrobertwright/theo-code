# Design Document: UI Upgrade

## Overview

This design transforms the current single-column terminal interface into a sophisticated full-screen layout with distinct sections for project information, conversation history, task management, and system status. The new design leverages React Ink's layout capabilities to create a professional development environment that maximizes information density while maintaining usability.

The upgrade introduces a four-section layout: a project header, main context area, task sidebar, and status footer. Each section is visually separated with box outlines and supports responsive behavior for different terminal sizes.

## Architecture

### Component Hierarchy

The new UI architecture follows a hierarchical component structure:

```
App
├── FullScreenLayout
│   ├── ProjectHeader
│   ├── MainContent
│   │   ├── ContextArea
│   │   │   ├── MessageList
│   │   │   ├── ScrollIndicator
│   │   │   └── InputArea
│   │   ├── ResizableDivider
│   │   └── TaskSidebar
│   │       ├── TaskList
│   │       └── ScrollIndicator
│   └── StatusFooter
└── [Existing dialogs and overlays]
```

### Layout System

The layout uses Ink's flexbox system with the following structure:
- **Vertical Layout**: Header (1 line) → Content (flexible) → Footer (3 lines)
- **Horizontal Layout**: Context Area (70% default, min 50%) → Divider → Task Sidebar (remaining)

### State Management Integration

The design extends the existing Zustand store with new UI state:

```typescript
interface UILayoutState {
  contextAreaWidth: number; // Percentage of total width
  taskSidebarCollapsed: boolean;
  scrollPositions: {
    context: number;
    tasks: number;
  };
  colorScheme: ColorScheme;
}
```

## Components and Interfaces

### FullScreenLayout Component

**Purpose**: Root layout component that manages terminal dimensions and section positioning.

**Props**:
```typescript
interface FullScreenLayoutProps {
  children: React.ReactNode;
  terminalWidth: number;
  terminalHeight: number;
}
```

**Responsibilities**:
- Calculate section dimensions based on terminal size
- Handle terminal resize events
- Manage responsive breakpoints
- Coordinate section visibility

### ProjectHeader Component

**Purpose**: Displays project name and basic session information.

**Props**:
```typescript
interface ProjectHeaderProps {
  projectName: string;
  sessionInfo?: {
    model: string;
    provider: string;
    duration: string;
  };
}
```

**Implementation**:
- Derives project name from `path.basename(workspaceRoot)`
- Uses single-line box with padding
- Displays session metadata on the right side

### ContextArea Component

**Purpose**: Main conversation display with scrolling and color-coded messages.

**Props**:
```typescript
interface ContextAreaProps {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
  width: number;
  height: number;
  onWidthChange: (width: number) => void;
}
```

**Features**:
- Message type detection and color coding
- Scroll position management
- Syntax highlighting for code blocks
- Input area integration

### TaskSidebar Component

**Purpose**: Displays current tasks with status indicators and progress tracking.

**Props**:
```typescript
interface TaskSidebarProps {
  tasks: TaskItem[];
  width: number;
  height: number;
  collapsed?: boolean;
}

interface TaskItem {
  id: string;
  title: string;
  status: 'not-started' | 'in-progress' | 'paused' | 'completed' | 'failed';
  description?: string;
  progress?: number;
}
```

**Status Indicators**:
- 🔴 Not started
- 🟢 In progress
- 🟡 Paused
- ✅ Completed successfully
- ❌ Failed

### ResizableDivider Component

**Purpose**: Interactive divider for adjusting context/task area widths.

**Props**:
```typescript
interface ResizableDividerProps {
  onResize: (contextWidth: number) => void;
  minContextWidth: number; // 50%
  maxContextWidth: number; // 90%
  currentContextWidth: number;
}
```

**Implementation**:
- Mouse interaction handling for terminal environments
- Visual feedback during resize operations
- Constraint enforcement (50% minimum context width)

### StatusFooter Component

**Purpose**: System information display including tokens, time, and context.

**Props**:
```typescript
interface StatusFooterProps {
  tokenCount: SessionTokenCount;
  sessionDuration: string;
  contextFileCount: number;
  currentModel: string;
  connectionStatus: 'connected' | 'disconnected' | 'error';
}
```

**Layout**: Three-line display with organized information sections.

## Data Models

### Color Scheme Configuration

```typescript
interface ColorScheme {
  name: string;
  colors: {
    // Message types
    userMessage: string;
    assistantMessage: string;
    systemMessage: string;
    toolCall: string;
    errorMessage: string;
    
    // UI elements
    border: string;
    header: string;
    status: string;
    taskStatus: {
      notStarted: string;
      inProgress: string;
      paused: string;
      completed: string;
      failed: string;
    };
    
    // Syntax highlighting
    code: string;
    keyword: string;
    string: string;
    comment: string;
  };
}
```

### Layout Configuration

```typescript
interface LayoutConfig {
  defaultContextWidth: number; // 70%
  minContextWidth: number; // 50%
  maxContextWidth: number; // 90%
  headerHeight: number; // 1
  footerHeight: number; // 3
  minTerminalWidth: number; // 80
  minTerminalHeight: number; // 20
  responsiveBreakpoints: {
    narrow: number; // 80 chars
    compact: number; // 120 chars
  };
}
```

### Task Integration Model

```typescript
interface TaskIntegration {
  // Archon MCP integration
  archonConnection: {
    enabled: boolean;
    serverUrl?: string;
    apiKey?: string;
  };
  
  // Local task tracking
  localTasks: TaskItem[];
  
  // Sync configuration
  syncSettings: {
    autoSync: boolean;
    syncInterval: number; // milliseconds
    conflictResolution: 'local' | 'remote' | 'prompt';
  };
}
```

## Correctness Properties

Now I'll analyze the acceptance criteria to determine testable properties.

<function_calls>
<invoke name="prework">
<parameter name="featureName">ui-upgrade

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

After analyzing the acceptance criteria, I've identified the following testable properties. Some properties have been consolidated to eliminate redundancy and provide comprehensive validation coverage.

### Property Reflection

Several properties were consolidated to eliminate redundancy:
- Layout dimension properties (1.1, 2.5, 5.6) were combined into a comprehensive layout consistency property
- Scrolling properties (3.6, 3.7, 4.8, 4.9) were combined into a unified scroll behavior property
- Box outline properties (2.3, 3.2, 4.2, 5.2, 6.1) were combined into a visual consistency property
- Responsive behavior properties (1.2, 1.3, 7.1, 7.2, 7.4) were combined into comprehensive responsive properties

### Core Layout Properties

**Property 1: Full-screen layout consistency**
*For any* terminal dimensions, the UI layout should occupy the entire available screen space with proper section positioning and no unused areas
**Validates: Requirements 1.1, 2.5, 5.6**

**Property 2: Responsive layout adaptation**
*For any* terminal resize event or dimension change, the UI should maintain proper proportions and gracefully adapt to new dimensions without breaking layout
**Validates: Requirements 1.2, 1.3, 7.4, 7.5**

**Property 3: Minimum size graceful degradation**
*For any* terminal dimensions below minimum thresholds, the UI should handle small windows gracefully without crashes or unusable states
**Validates: Requirements 1.4, 7.3**

### Project Header Properties

**Property 4: Project name derivation**
*For any* valid workspace root path, the project name should be correctly derived from the directory name
**Validates: Requirements 2.1, 2.2**

**Property 5: Header visual consistency**
*For any* rendered header, it should be exactly 1 line high with proper box outline and distinct coloring
**Validates: Requirements 2.3, 2.4**

### Context Area Properties

**Property 6: Context area proportional layout**
*For any* terminal width, the context area should default to 70% width and maintain the 50% minimum constraint during resize operations
**Validates: Requirements 3.3, 3.4, 3.5**

**Property 7: Scroll behavior consistency**
*For any* content that exceeds visible area dimensions, scrolling should work correctly and scrollbar indicators should appear when needed
**Validates: Requirements 3.6, 3.7, 4.8, 4.9**

**Property 8: Message color coding**
*For any* message type (user, assistant, tool call, system, error), the appropriate distinct color should be applied consistently
**Validates: Requirements 3.9**

### Task Sidebar Properties

**Property 9: Task status indicator consistency**
*For any* task with a given status, the correct emoji indicator should be displayed (🔴 not-started, 🟢 in-progress, 🟡 paused, ✅ completed, ❌ failed)
**Validates: Requirements 4.5, 4.6**

**Property 10: Resizable divider constraints**
*For any* divider resize operation, the context area width should remain within bounds (50%-90%) and respond to mouse interactions
**Validates: Requirements 4.3, 4.4**

### Status Footer Properties

**Property 11: Status information completeness**
*For any* application state, the status footer should display all required information (tokens, time, context files, model, connection status) in the correct 3-line format
**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.7**

### Visual Design Properties

**Property 12: Visual consistency and accessibility**
*For any* UI section, box outlines should be present, colors should differ from reference image, spacing should be consistent, and contrast should meet readability standards
**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Responsive Behavior Properties

**Property 13: Responsive breakpoint behavior**
*For any* terminal width below 80 characters, sections should stack vertically; for height below 20 lines, context area should receive priority
**Validates: Requirements 7.1, 7.2**

### Integration Properties

**Property 14: Backward compatibility preservation**
*For any* existing functionality (commands, message history, input handling, session management, keyboard shortcuts), it should continue to work unchanged with the new UI
**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

## Error Handling

### Terminal Environment Errors

**Insufficient Terminal Size**: When terminal dimensions are below minimum usable size (< 40 chars width or < 10 lines height), display a clear error message with minimum requirements.

**Color Support Detection**: Gracefully degrade color schemes based on terminal capabilities. Provide fallback monochrome styling for terminals without color support.

**Resize Event Handling**: Handle rapid resize events without causing layout thrashing. Debounce resize operations to prevent performance issues.

### Task Integration Errors

**Archon Connection Failures**: When Archon MCP server is unavailable, fall back to local task display with clear offline indicators.

**Task Data Corruption**: Validate task data structure and provide default values for missing or corrupted task information.

**Sync Conflicts**: When local and remote task states conflict, provide user-friendly resolution options.

### Layout Calculation Errors

**Division by Zero**: Prevent division by zero in percentage calculations when terminal width is zero or negative.

**Integer Overflow**: Handle extremely large terminal dimensions gracefully without integer overflow in layout calculations.

**Floating Point Precision**: Round layout calculations to prevent sub-pixel positioning issues in terminal environments.

## Testing Strategy

### Dual Testing Approach

The testing strategy employs both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points between components. Test concrete scenarios like specific terminal dimensions, particular message types, and known task configurations.

**Property Tests**: Verify universal properties across all inputs using randomized testing. Generate random terminal dimensions, message sequences, and task lists to validate that properties hold across the entire input space.

### Property-Based Testing Configuration

- **Testing Library**: fast-check for TypeScript property-based testing
- **Minimum Iterations**: 100 iterations per property test
- **Test Tagging**: Each property test references its design document property using the format: **Feature: ui-upgrade, Property {number}: {property_text}**

### Code Quality and Linting

**ESLint Configuration**: All new UI components must pass existing ESLint rules including React hooks, TypeScript, and SonarJS quality checks.

**Prettier Formatting**: Code formatting must be consistent with existing Prettier configuration.

**Type Safety**: All components must have complete TypeScript type coverage with no `any` types.

### Test Categories

**Unit Tests**: Test individual component behavior in isolation
- Specific terminal dimensions (80x24, 120x40, etc.)
- Individual component rendering and props handling
- State management actions and selectors
- Utility function behavior

**Component Tests**: Test component integration and user interactions
- Component interaction scenarios using React Testing Library
- User event simulation (keyboard, mouse interactions)
- Component lifecycle and effect testing
- Props validation and error boundaries

**Integration Tests**: Test system-level behavior and component coordination
- Store state synchronization across components
- Layout coordination between sections
- Terminal resize event handling
- Session management integration

**Property-Based Tests**: Verify universal properties across all inputs
- Random terminal dimensions within reasonable bounds
- Message rendering with random content types
- Task list generation with various configurations
- Layout calculation edge cases

**Performance Tests**: Ensure UI responsiveness under load
- Rapid resize operations
- Large message history rendering
- Extensive task list scrolling
- Memory usage during extended sessions

**Accessibility Tests**: Verify usability standards
- Color contrast ratio validation
- Keyboard navigation support
- Screen reader compatibility (where applicable for terminal UI)
- Focus management and visual indicators

### Test Execution Strategy

**Continuous Integration**: All tests (unit, component, integration, property-based) will be created and run as part of the development process.

**Test Commands**:
- `npm run test` - Run all tests including unit, component, integration, and property-based tests
- `npm run test:watch` - Run tests in watch mode during development
- `npm run lint` - Run ESLint checks on all code
- `npm run format:check` - Verify Prettier formatting compliance
- `npm run type-check` - Run TypeScript type checking

**Test Coverage Requirements**: Maintain existing coverage standards while adding comprehensive tests for all new UI components.

**Test Organization**: Tests will be co-located with components using `.test.tsx` and `.property.test.ts` suffixes for easy identification and maintenance.

### Mock and Test Data Strategy

**Message Generation**: Generate realistic message sequences with various content types (text, code, tool calls) for comprehensive testing.

**Task Data Generation**: Create random task configurations with different statuses and content for sidebar testing.

**Store State Mocking**: Mock Zustand store states to test component behavior in isolation while maintaining realistic data relationships.

The testing approach avoids excessive mocking in favor of testing real functionality, ensuring that tests validate actual user-facing behavior rather than implementation details.