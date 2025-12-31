# Screen Flickering Fix - Requirements Document

## Overview

This specification addresses a critical UI bug where the terminal interface continuously redraws and flickers when users select "New Session", causing loss of control and poor user experience. The issue stems from improper useInput hook dependencies, cascading state updates, and layout recalculation loops during session initialization.

## Problem Statement

### Current Issue
When a user selects "New Session" from the session selection interface, the terminal screen begins flickering continuously with rapid redraws, making the interface unusable. The user loses control of input, and the application becomes unresponsive until manually terminated.

### Root Causes Identified
Based on code analysis, the flickering is caused by:

1. **InputArea useInput handler** lacks proper dependency array, causing stale closures and repeated handler registration
2. **Cascading state updates** during session initialization trigger multiple re-renders in sequence
3. **Layout recalculation** during session creation causes dimension-based re-renders
4. **Multiple useInput handlers** firing simultaneously without proper cleanup

## Glossary

- **Screen_Flickering**: Rapid, continuous redrawing of the terminal interface causing visual instability
- **useInput_Handler**: React Ink hook for capturing keyboard input that can cause re-render loops if improperly configured
- **Session_Initialization**: The process of creating a new session that currently triggers the flickering
- **Dependency_Array**: React hook dependency list that controls when effects and handlers re-register
- **State_Batching**: Combining multiple state updates into a single re-render cycle
- **Layout_Recalculation**: Process of recalculating component dimensions that can trigger cascading re-renders

## Requirements

### Requirement 1: Stable Input Handler Management

**User Story:** As a user, I want input handlers to be properly managed so that selecting "New Session" doesn't cause screen flickering.

#### Acceptance Criteria

1. THE InputArea useInput hook SHALL have a proper dependency array to prevent stale closures
2. THE useInput handler SHALL only re-register when its dependencies actually change
3. THE input handler registration SHALL not occur on every render cycle
4. WHEN session initialization occurs, THE input handlers SHALL remain stable and not conflict
5. THE system SHALL ensure only one active input handler at any given time

### Requirement 2: Batched Session Initialization

**User Story:** As a user, I want session creation to complete smoothly without causing multiple screen redraws.

#### Acceptance Criteria

1. THE session initialization process SHALL batch all state updates into a single re-render cycle
2. THE `initializeNewSession()` function SHALL combine multiple setState calls into one atomic operation
3. WHEN a new session is created, THE UI SHALL render once and remain stable
4. THE session initialization SHALL not trigger cascading state updates
5. THE system SHALL complete session setup before allowing user interaction

### Requirement 3: Stable Layout Calculations

**User Story:** As a user, I want the layout to remain stable during session creation without unnecessary recalculations.

#### Acceptance Criteria

1. THE FullScreenLayout component SHALL memoize layout calculations to prevent unnecessary recalculation
2. THE responsive layout decisions SHALL be debounced during session initialization
3. THE dimension changes during session creation SHALL not trigger layout re-renders
4. THE layout calculations SHALL be stable and predictable during state transitions
5. THE system SHALL prevent layout thrashing during session initialization

### Requirement 4: Input Handler Cleanup and Coordination

**User Story:** As a user, I want input handlers to be properly cleaned up so they don't conflict with each other.

#### Acceptance Criteria

1. THE system SHALL ensure proper cleanup of input handlers when components unmount
2. THE multiple useInput handlers SHALL not fire simultaneously during session creation
3. THE input handler conflicts SHALL be prevented through proper coordination
4. THE system SHALL maintain a single source of truth for input handling
5. THE input handlers SHALL be properly scoped to their respective components

### Requirement 5: Render Loop Prevention

**User Story:** As a user, I want the interface to render once and remain stable without infinite render loops.

#### Acceptance Criteria

1. THE system SHALL prevent infinite render loops during session initialization
2. THE component re-renders SHALL be controlled and predictable
3. THE useEffect hooks SHALL have proper dependency arrays to prevent unnecessary executions
4. THE state updates SHALL not trigger cascading re-renders
5. THE system SHALL maintain render stability throughout the session creation process

## Technical Requirements

### Performance Requirements

1. **Single Render Cycle**: Session initialization must complete in a single render cycle
2. **Input Responsiveness**: Input handlers must respond within 50ms without triggering re-renders
3. **Layout Stability**: Layout calculations must be memoized and not recalculate during session creation
4. **Memory Efficiency**: Input handlers must be properly cleaned up to prevent memory leaks

### Reliability Requirements

1. **No Infinite Loops**: The system must never enter infinite render loops
2. **Graceful Error Handling**: Input handler errors must not cause screen flickering
3. **State Consistency**: Application state must remain consistent during session initialization
4. **Recovery Capability**: The system must recover gracefully from any render issues

### Usability Requirements

1. **Immediate Response**: "New Session" selection must provide immediate visual feedback
2. **Control Retention**: Users must maintain control of input throughout session creation
3. **Visual Stability**: The interface must remain visually stable without flickering
4. **Predictable Behavior**: Session creation must behave consistently across different scenarios

## Specific Bug Fixes Required

### Fix 1: InputArea useInput Dependencies
**File**: `src/shared/components/Layout/InputArea.tsx`
**Problem**: useInput hook lacks dependency array, causing stale closures
**Solution**: Add proper dependency array to useInput hook
**Expected Outcome**: Input handler only re-registers when dependencies change

### Fix 2: Batch Session Initialization State Updates
**File**: `src/app.tsx`
**Problem**: Multiple state updates during session initialization cause cascading re-renders
**Solution**: Combine multiple state updates in `initializeNewSession()` into single batched update
**Expected Outcome**: Session creation triggers only one re-render

### Fix 3: Stabilize Layout Calculations
**File**: `src/shared/components/Layout/FullScreenLayout.tsx`
**Problem**: Layout recalculation during session creation causes dimension-based re-renders
**Solution**: Memoize responsive layout decisions and debounce dimension changes
**Expected Outcome**: Layout doesn't recalculate during session initialization

### Fix 4: Input Handler Cleanup and Coordination
**Files**: `src/shared/components/Layout/InputArea.tsx`, `src/shared/components/Layout/MessageList.tsx`
**Problem**: Multiple useInput handlers fire simultaneously without proper cleanup
**Solution**: Ensure useInput handlers are properly cleaned up and don't conflict
**Expected Outcome**: Only one input handler active at a time

### Fix 5: Prevent useEffect Dependency Issues
**Files**: Various components with useEffect hooks
**Problem**: Missing or incorrect dependency arrays cause unnecessary effect executions
**Solution**: Audit and fix all useEffect dependency arrays
**Expected Outcome**: Effects only run when their dependencies actually change

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do.*

### Property 1: Input Handler Stability
*For any* session initialization, the useInput handlers must remain stable and not re-register unless their dependencies change.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Single Render Cycle Initialization
*For any* "New Session" selection, the session initialization must complete in exactly one render cycle.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Layout Calculation Stability
*For any* session creation, layout calculations must not trigger additional re-renders.
**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Input Handler Uniqueness
*For any* point in time, there must be exactly one active input handler managing user input.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Render Loop Prevention
*For any* component state change, the system must not enter infinite render loops.
**Validates: Requirements 5.1, 5.2, 5.3**

### Property 6: State Update Atomicity
*For any* session initialization, all related state updates must be batched into a single atomic operation.
**Validates: Requirements 2.4, 2.5**

### Property 7: Effect Dependency Correctness
*For any* useEffect hook, the dependency array must accurately reflect all values used within the effect.
**Validates: Requirements 5.4, 5.5**

## Error Handling

### Input Handler Errors
- **Handler Registration Failure**: Gracefully fall back to previous handler state
- **Multiple Handler Conflict**: Automatically resolve conflicts by prioritizing the most recent handler
- **Handler Cleanup Failure**: Ensure system remains functional with proper error logging

### State Update Errors
- **Batching Failure**: Fall back to individual state updates with controlled timing
- **State Inconsistency**: Implement state validation and recovery mechanisms
- **Initialization Timeout**: Provide user feedback and recovery options

### Layout Calculation Errors
- **Dimension Calculation Failure**: Use safe default dimensions
- **Memoization Errors**: Fall back to direct calculation with performance logging
- **Responsive Breakpoint Errors**: Use conservative layout assumptions

## Testing Strategy

### Unit Tests
- Test individual useInput hook behavior with various dependency arrays
- Test state batching functionality in isolation
- Test layout calculation memoization
- Test input handler cleanup mechanisms

### Integration Tests
- Test complete "New Session" flow without flickering
- Test session initialization with various terminal sizes
- Test input handler coordination between components
- Test error recovery scenarios

### Property-Based Tests
- Generate random session initialization scenarios
- Test input handler stability across various component states
- Validate render cycle counts during session creation
- Test layout stability with random terminal dimensions

### Performance Tests
- Measure render cycle counts during session initialization
- Test input handler response times
- Measure memory usage during extended sessions
- Test layout calculation performance

## Implementation Priority

### Phase 1: Critical Fixes (Immediate)
1. Fix InputArea useInput dependencies
2. Batch session initialization state updates
3. Add input handler cleanup

### Phase 2: Stability Improvements (Short-term)
1. Stabilize layout calculations
2. Fix remaining useEffect dependency arrays
3. Add comprehensive error handling

### Phase 3: Validation and Testing (Medium-term)
1. Implement property-based tests
2. Add performance monitoring
3. Create comprehensive integration tests

## Success Criteria

The screen flickering fix will be considered successful when:

1. **No Flickering**: Users can select "New Session" without any screen flickering
2. **Immediate Response**: Session creation provides immediate visual feedback
3. **Control Retention**: Users maintain control of input throughout the process
4. **Consistent Behavior**: Session creation works consistently across different scenarios
5. **Performance**: Session initialization completes within 100ms
6. **Stability**: No render loops or cascading re-renders occur
7. **Memory Efficiency**: No memory leaks from uncleaned input handlers

## Validation Methods

1. **Manual Testing**: Test "New Session" selection in various terminal environments
2. **Automated Testing**: Run comprehensive test suite covering all scenarios
3. **Performance Monitoring**: Measure render cycles and response times
4. **User Acceptance**: Verify the fix resolves the original user-reported issue
5. **Regression Testing**: Ensure existing functionality remains unaffected