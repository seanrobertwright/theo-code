/**
 * @fileoverview Performance optimization utilities for UI components
 * @module shared/components/Layout/performance-optimizations
 */

import * as React from 'react';

// =============================================================================
// DEBOUNCING UTILITIES
// =============================================================================

/**
 * Enhanced debounce hook with cleanup and immediate execution option.
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  options: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
  } = {}
): T {
  const { leading = false, trailing = true, maxWait } = options;
  
  const timeoutRef = React.useRef<NodeJS.Timeout>();
  const maxTimeoutRef = React.useRef<NodeJS.Timeout>();
  const lastCallTimeRef = React.useRef<number>(0);
  const lastInvokeTimeRef = React.useRef<number>(0);
  const argsRef = React.useRef<Parameters<T>>();
  const funcRef = React.useRef(callback);
  
  // Update function reference
  funcRef.current = callback;
  
  const invokeFunc = React.useCallback((time: number) => {
    const args = argsRef.current;
    lastInvokeTimeRef.current = time;
    argsRef.current = undefined;
    return funcRef.current(...(args as Parameters<T>));
  }, []);
  
  const remainingWait = React.useCallback((time: number) => {
    const timeSinceLastCall = time - lastCallTimeRef.current;
    const timeSinceLastInvoke = time - lastInvokeTimeRef.current;
    const timeWaiting = delay - timeSinceLastCall;
    
    return maxWait !== undefined
      ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting;
  }, [delay, maxWait]);
  
  const shouldInvoke = React.useCallback((time: number) => {
    const timeSinceLastCall = time - lastCallTimeRef.current;
    const timeSinceLastInvoke = time - lastInvokeTimeRef.current;
    
    return (
      lastCallTimeRef.current === 0 ||
      timeSinceLastCall >= delay ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  }, [delay, maxWait]);
  
  const trailingEdge = React.useCallback((time: number) => {
    timeoutRef.current = undefined;
    
    if (trailing && argsRef.current) {
      return invokeFunc(time);
    }
    argsRef.current = undefined;
    return undefined;
  }, [trailing, invokeFunc]);
  
  const timerExpired = React.useCallback((): unknown => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timeoutRef.current = setTimeout(timerExpired, remainingWait(time));
    return undefined;
  }, [shouldInvoke, remainingWait, trailingEdge]);
  
  const leadingEdge = React.useCallback((time: number) => {
    lastInvokeTimeRef.current = time;
    timeoutRef.current = setTimeout(timerExpired, delay);
    return leading ? invokeFunc(time) : undefined;
  }, [delay, leading, invokeFunc, timerExpired]);
  
  const cancel = React.useCallback((): void => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = undefined;
    }
    lastInvokeTimeRef.current = 0;
    lastCallTimeRef.current = 0;
    argsRef.current = undefined;
  }, []);
  
  const flush = React.useCallback(() => {
    return timeoutRef.current === undefined ? undefined : trailingEdge(Date.now());
  }, [trailingEdge]);
  
  const debounced = React.useCallback((...args: Parameters<T>) => {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);
    
    lastCallTimeRef.current = time;
    argsRef.current = args;
    
    if (isInvoking) {
      if (timeoutRef.current === undefined) {
        return leadingEdge(lastCallTimeRef.current);
      }
      if (maxWait !== undefined) {
        timeoutRef.current = setTimeout(timerExpired, delay);
        maxTimeoutRef.current = setTimeout(timerExpired, maxWait);
        return leading ? invokeFunc(lastCallTimeRef.current) : undefined;
      }
    }
    if (timeoutRef.current === undefined) {
      timeoutRef.current = setTimeout(timerExpired, delay);
    }
    return undefined;
  }, [shouldInvoke, leadingEdge, delay, maxWait, leading, invokeFunc, timerExpired]) as T;
  
  // Attach cancel and flush methods
  (debounced as T & { cancel: () => void; flush: () => unknown }).cancel = cancel;
  (debounced as T & { cancel: () => void; flush: () => unknown }).flush = flush;
  
  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);
  
  return debounced;
}

/**
 * Throttle hook for limiting function execution frequency.
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  return useDebounce(callback, delay, { leading: true, trailing: false });
}

// =============================================================================
// MEMOIZATION UTILITIES
// =============================================================================

/**
 * Deep comparison hook for complex objects.
 */
export function useDeepMemo<T>(factory: () => T, deps: React.DependencyList): T {
  const ref = React.useRef<{ deps: React.DependencyList; value: T }>();
  
  if (!ref.current || !deepEqual(ref.current.deps, deps)) {
    ref.current = { deps, value: factory() };
  }
  
  return ref.current.value;
}

/**
 * Stable callback hook that doesn't change reference unless dependencies change.
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: React.DependencyList
): T {
  const callbackRef = React.useRef(callback);
  const stableCallback = React.useRef<T & { _deps?: React.DependencyList }>();
  
  // Update callback reference
  callbackRef.current = callback;
  
  // Create stable callback if it doesn't exist or deps changed
  if (!stableCallback.current || !shallowEqual(stableCallback.current._deps, deps)) {
    stableCallback.current = ((...args: Parameters<T>) => {
      return callbackRef.current(...args);
    }) as T & { _deps?: React.DependencyList };
    stableCallback.current._deps = deps;
  }
  
  return stableCallback.current;
}

/**
 * Memoized component creator with display name preservation.
 */
export function createMemoComponent<P extends object>(
  Component: React.ComponentType<P>,
  areEqual?: (prevProps: P, nextProps: P) => boolean
): React.MemoExoticComponent<React.ComponentType<P>> {
  const MemoComponent = React.memo(Component, areEqual);
  MemoComponent.displayName = `Memo(${Component.displayName ?? Component.name})`;
  return MemoComponent;
}

// =============================================================================
// VIRTUAL SCROLLING UTILITIES
// =============================================================================

/**
 * Virtual scrolling hook for large lists.
 */
export function useVirtualScrolling<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
  scrollTop = 0,
}: {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  scrollTop?: number;
}): {
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  visibleItems: T[];
  offsetY: number;
} {
  return React.useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    const visibleItems = items.slice(startIndex, endIndex + 1);
    const offsetY = startIndex * itemHeight;
    
    return {
      totalHeight,
      startIndex,
      endIndex,
      visibleItems,
      offsetY,
    };
  }, [items, itemHeight, containerHeight, overscan, scrollTop]);
}

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

/**
 * Performance monitoring hook.
 */
export function usePerformanceMonitor(name: string, enabled = false): {
  start: () => void;
  end: () => void;
  measure: <T>(fn: () => T) => T;
} {
  const startTimeRef = React.useRef<number>();
  
  const start = React.useCallback(() => {
    if (enabled && typeof performance !== 'undefined') {
      startTimeRef.current = performance.now();
    }
  }, [enabled]);
  
  const end = React.useCallback(() => {
    if (enabled && typeof performance !== 'undefined' && startTimeRef.current !== undefined) {
      const duration = performance.now() - startTimeRef.current;
      // eslint-disable-next-line no-console
      console.info(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
      startTimeRef.current = undefined;
    }
  }, [enabled, name]);
  
  const measure = React.useCallback(<T>(fn: () => T): T => {
    start();
    try {
      return fn();
    } finally {
      end();
    }
  }, [start, end]);
  
  return { start, end, measure };
}

/**
 * Memory usage monitoring hook.
 */
export function useMemoryMonitor(interval = 5000): {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
} {
  const [memoryInfo, setMemoryInfo] = React.useState<{
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  }>({});
  
  React.useEffect(() => {
    if (typeof performance === 'undefined' || !('memory' in performance)) {
      return;
    }
    
    const updateMemoryInfo = (): void => {
      const memory = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (memory) {
        setMemoryInfo({
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        });
      }
    };
    
    updateMemoryInfo();
    const intervalId = setInterval(updateMemoryInfo, interval);
    
    return () => clearInterval(intervalId);
  }, [interval]);
  
  return memoryInfo;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Deep equality check for objects and arrays.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    
    if (keysA.length !== keysB.length) {
      return false;
    }
    
    for (const key of keysA) {
      if (!keysB.includes(key)) {
        return false;
      }
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }
  
  return false;
}

/**
 * Shallow equality check for objects.
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    
    if (keysA.length !== keysB.length) {
      return false;
    }
    
    for (const key of keysA) {
      if (!keysB.includes(key)) {
        return false;
      }
      if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
        return false;
      }
    }
    return true;
  }
  
  return false;
}

/**
 * Batch state updates to prevent excessive re-renders.
 */
export function useBatchedUpdates(): (updateFn: () => void) => void {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
  const pendingUpdatesRef = React.useRef<(() => void)[]>([]);
  const timeoutRef = React.useRef<NodeJS.Timeout>();
  
  const batchUpdate = React.useCallback((updateFn: () => void) => {
    pendingUpdatesRef.current.push(updateFn);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      const updates = pendingUpdatesRef.current;
      pendingUpdatesRef.current = [];
      
      updates.forEach(update => update());
      forceUpdate();
    }, 0);
  }, []);
  
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return batchUpdate;
}

// Simplified exports for intersection observer and animation frame
export const useIntersectionObserver = (): [React.RefCallback<Element>, boolean] => {
  const [isIntersecting, setIsIntersecting] = React.useState(false);
  const ref = React.useCallback((node: Element | null): void => {
    if (node) {
      setIsIntersecting(true);
    }
  }, []);
  
  return [ref, isIntersecting];
};

export const useAnimationFrame = (callback: (deltaTime: number) => void, enabled = true): void => {
  React.useEffect(() => {
    if (!enabled || typeof globalThis === 'undefined' || !('requestAnimationFrame' in globalThis)) {
      return;
    }
    
    let animationId: number;
    let lastTime = 0;
    
    const animate = (currentTime: number): void => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      callback(deltaTime);
      
      if (enabled) {
        animationId = (globalThis as any).requestAnimationFrame(animate);
      }
    };
    
    animationId = (globalThis as any).requestAnimationFrame(animate);
    
    return (): void => {
      if (animationId && 'cancelAnimationFrame' in globalThis) {
        (globalThis as any).cancelAnimationFrame(animationId);
      }
    };
  }, [callback, enabled]);
};