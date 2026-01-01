# Screen Flickering Fix - Concise Task List

## Overview
Fix screen flickering during "New Session" selection by stabilizing React Ink hooks, batching state updates, and optimizing render cycles.

## Critical Tasks (Must Complete)

### Phase 1: Hook Stabilization
- [ ] **Fix InputArea useInput Handler** (15 min)
  - Add useCallback wrapper with proper dependencies
  - File: `src/shared/components/Layout/InputArea.tsx`
  - Test: Handler reference remains stable across renders

- [ ] **Fix MessageList useInput Handler** (10 min)
  - Add useCallback wrapper and cleanup
  - File: `src/shared/components/Layout/MessageList.tsx`
  - Test: No handler conflicts between components

- [ ] **Batch Session State Updates** (20 min)
  - Combine multiple setState calls in initializeNewSession
  - File: `src/app.tsx`
  - Test: Single render cycle during session creation

### Phase 2: Layout Optimization
- [ ] **Memoize Layout Calculations** (15 min)
  - Add useMemo to FullScreenLayout calculations
  - File: `src/shared/components/Layout/FullScreenLayout.tsx`
  - Test: No unnecessary recalculations

- [ ] **Add Dimension Change Debouncing** (15 min)
  - Debounce rapid resize events (100ms delay)
  - File: `src/shared/components/Layout/FullScreenLayout.tsx`
  - Test: Stable layout during session creation

- [ ] **Audit useEffect Dependencies** (20 min)
  - Review and fix dependency arrays in layout components
  - Files: `src/shared/components/Layout/*.tsx`
  - Test: ESLint exhaustive-deps rule passes

### Phase 3: Error Handling
- [ ] **Add Input Handler Error Boundaries** (15 min)
  - Wrap handlers with try-catch and fallbacks
  - Files: Components with input handlers
  - Test: Graceful error handling

- [ ] **Add State Update Error Handling** (10 min)
  - Safe state updates with error recovery
  - Files: Components with state updates
  - Test: App remains functional after errors

### Phase 4: Testing & Validation
- [ ] **Create Handler Stability Test** (15 min)
  - Unit test for input handler reference stability
  - File: `src/test/input-handler-stability.test.tsx`
  - Verify: Handler doesn't re-register unnecessarily

- [ ] **Create Session Creation Integration Test** (20 min)
  - End-to-end test for "New Session" workflow
  - File: `src/test/session-creation.test.tsx`
  - Verify: No flickering, single render cycle

- [ ] **Manual Testing Validation** (10 min)
  - Test "New Session" in actual terminal
  - Verify: No visual flickering, responsive input
  - Test: Multiple terminal sizes and environments

## Enhancement Tasks (Optional)

### Advanced Input Management
- [ ] **Create Centralized Input Manager** (45 min)
  - Single source of truth for input handlers
  - File: `src/shared/hooks/useInputManager.ts`
  - Benefit: Prevents handler conflicts

- [ ] **Integrate Input Manager** (30 min)
  - Update components to use centralized manager
  - Files: InputArea.tsx, MessageList.tsx
  - Benefit: Automatic conflict resolution

### Performance Monitoring
- [ ] **Add Render Cycle Counter** (20 min)
  - Track render cycles during operations
  - File: `src/shared/utils/performanceMonitor.ts`
  - Benefit: Performance regression detection

- [ ] **Add Memory Usage Monitor** (15 min)
  - Monitor for memory leaks
  - File: `src/shared/utils/performanceMonitor.ts`
  - Benefit: Long-term stability validation

### Property-Based Testing
- [ ] **Create Handler Stability Property Test** (25 min)
  - Test handler stability across random inputs
  - File: `src/test/screen-flickering.property.test.ts`
  - Benefit: Robust validation across scenarios

- [ ] **Create Layout Stability Property Test** (25 min)
  - Test layout with random dimensions
  - File: `src/test/screen-flickering.property.test.ts`
  - Benefit: Comprehensive layout validation

## Success Criteria

### Must Achieve
- ✅ Zero screen flickering during "New Session"
- ✅ Session initialization in single render cycle
- ✅ Input handlers remain stable
- ✅ No console errors during session creation

### Performance Targets
- Session initialization: < 100ms
- Input response time: < 50ms
- Memory usage: No leaks during extended sessions
- Layout calculations: Minimal recalculation

## Risk Mitigation

### High-Risk Changes
- **State Batching**: Test incrementally, maintain rollback plan
- **Input Manager**: Implement as enhancement, keep backward compatibility

### Testing Strategy
- Run full test suite after each phase
- Manual testing on multiple terminal environments
- Performance regression testing before merge

## Quick Reference

### Files to Modify
- `src/shared/components/Layout/InputArea.tsx`
- `src/shared/components/Layout/MessageList.tsx`
- `src/app.tsx`
- `src/shared/components/Layout/FullScreenLayout.tsx`

### Key Patterns
```typescript
// useCallback for handlers
const handleInput = useCallback((input: string, key: Key) => {
  // handler logic
}, [dependencies]);

// State batching
startTransition(() => {
  setState(prev => ({ ...prev, updates }));
});

// Layout memoization
const layout = useMemo(() => calculateLayout(width, height), [width, height]);
```

### Test Commands
```bash
# Run specific tests
npx vitest run src/test/input-handler-stability.test.tsx
npx vitest run src/test/session-creation.test.tsx

# Run all tests
npx vitest run

# Check ESLint dependencies
npx eslint . --ext ts,tsx --max-warnings 0
```

---

**Total Estimated Time**: 3-4 hours for critical tasks, 6-8 hours including enhancements
**Priority**: Complete Phase 1-3 first, then add enhancements as needed