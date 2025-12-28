/**
 * @fileoverview UI Layout state management
 * @module shared/store/ui-layout
 */

import * as React from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  UILayoutState,
  LayoutConfig,
  ColorScheme,
} from '../components/Layout/types.js';
import {
  createDefaultLayoutConfig,
  createDefaultColorScheme,
  validateLayoutConfig,
  validateColorScheme,
  clamp,
  calculateSectionDimensions,
  getResponsiveLayout,
} from '../components/Layout/utils.js';
import {
  useDeepMemo,
  useStableCallback,
} from '../components/Layout/performance-optimizations.js';

// =============================================================================
// UI LAYOUT STORE INTERFACE
// =============================================================================

/**
 * UI Layout store interface.
 */
export interface UILayoutStore extends UILayoutState {
  // Layout actions
  setContextAreaWidth: (width: number) => void;
  toggleTaskSidebar: () => void;
  setTaskSidebarCollapsed: (collapsed: boolean) => void;
  
  // Scroll actions
  setContextScrollPosition: (position: number) => void;
  setTaskScrollPosition: (position: number) => void;
  
  // Configuration actions
  setColorScheme: (colorScheme: ColorScheme) => void;
  setLayoutConfig: (config: LayoutConfig) => void;
  
  // Utility actions
  resetToDefaults: () => void;
  validateConfiguration: () => boolean;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: UILayoutState = {
  contextAreaWidth: 70, // 70% default
  taskSidebarCollapsed: false,
  scrollPositions: {
    context: 0,
    tasks: 0,
  },
  colorScheme: createDefaultColorScheme(),
  layoutConfig: createDefaultLayoutConfig(),
};

// =============================================================================
// STORE CREATION
// =============================================================================

/**
 * UI Layout store for managing layout state and configuration.
 *
 * @example
 * ```typescript
 * // In a React component
 * const contextWidth = useUILayoutStore((state) => state.contextAreaWidth);
 * const setContextWidth = useUILayoutStore((state) => state.setContextAreaWidth);
 *
 * // Adjust context area width
 * setContextWidth(80);
 *
 * // Toggle task sidebar
 * const toggleSidebar = useUILayoutStore((state) => state.toggleTaskSidebar);
 * toggleSidebar();
 * ```
 */
export const useUILayoutStore = create<UILayoutStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // -------------------------------------------------------------------------
    // Layout Actions
    // -------------------------------------------------------------------------

    setContextAreaWidth: (width: number): void => {
      const { layoutConfig } = get();
      const clampedWidth = clamp(
        width,
        layoutConfig.minContextWidth,
        layoutConfig.maxContextWidth
      );
      
      set({ contextAreaWidth: clampedWidth });
    },

    toggleTaskSidebar: (): void => {
      set((state) => ({
        taskSidebarCollapsed: !state.taskSidebarCollapsed,
      }));
    },

    setTaskSidebarCollapsed: (collapsed: boolean): void => {
      set({ taskSidebarCollapsed: collapsed });
    },

    // -------------------------------------------------------------------------
    // Scroll Actions
    // -------------------------------------------------------------------------

    setContextScrollPosition: (position: number): void => {
      set((state) => ({
        scrollPositions: {
          ...state.scrollPositions,
          context: Math.max(0, position),
        },
      }));
    },

    setTaskScrollPosition: (position: number): void => {
      set((state) => ({
        scrollPositions: {
          ...state.scrollPositions,
          tasks: Math.max(0, position),
        },
      }));
    },

    // -------------------------------------------------------------------------
    // Configuration Actions
    // -------------------------------------------------------------------------

    setColorScheme: (colorScheme: ColorScheme): void => {
      if (validateColorScheme(colorScheme)) {
        set({ colorScheme });
      } else {
        console.warn('Invalid color scheme provided, keeping current scheme');
      }
    },

    setLayoutConfig: (config: LayoutConfig): void => {
      if (validateLayoutConfig(config)) {
        set({ layoutConfig: config });
        
        // Ensure current context width is within new bounds
        const { contextAreaWidth } = get();
        const clampedWidth = clamp(
          contextAreaWidth,
          config.minContextWidth,
          config.maxContextWidth
        );
        
        if (clampedWidth !== contextAreaWidth) {
          set({ contextAreaWidth: clampedWidth });
        }
      } else {
        console.warn('Invalid layout config provided, keeping current config');
      }
    },

    // -------------------------------------------------------------------------
    // Utility Actions
    // -------------------------------------------------------------------------

    resetToDefaults: (): void => {
      set({
        ...initialState,
        colorScheme: createDefaultColorScheme(),
        layoutConfig: createDefaultLayoutConfig(),
      });
    },

    validateConfiguration: (): boolean => {
      const { colorScheme, layoutConfig } = get();
      return validateColorScheme(colorScheme) && validateLayoutConfig(layoutConfig);
    },
  }))
);

// =============================================================================
// SELECTORS
// =============================================================================

/**
 * Selector for current context area width percentage.
 */
export const selectContextAreaWidth = (state: UILayoutStore): number =>
  state.contextAreaWidth;

/**
 * Selector for whether task sidebar is collapsed.
 */
export const selectTaskSidebarCollapsed = (state: UILayoutStore): boolean =>
  state.taskSidebarCollapsed;

/**
 * Selector for current color scheme.
 */
export const selectColorScheme = (state: UILayoutStore): ColorScheme =>
  state.colorScheme;

/**
 * Selector for current layout configuration.
 */
export const selectLayoutConfig = (state: UILayoutStore): LayoutConfig =>
  state.layoutConfig;

/**
 * Selector for scroll positions.
 */
export const selectScrollPositions = (state: UILayoutStore) =>
  state.scrollPositions;

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook for layout dimensions calculation with performance optimization.
 */
export function useLayoutDimensions(terminalWidth: number, terminalHeight: number) {
  const contextAreaWidth = useUILayoutStore(selectContextAreaWidth);
  const layoutConfig = useUILayoutStore(selectLayoutConfig);
  
  return useDeepMemo(() => {
    return calculateSectionDimensions(
      terminalWidth,
      terminalHeight,
      contextAreaWidth,
      layoutConfig
    );
  }, [terminalWidth, terminalHeight, contextAreaWidth, layoutConfig]);
}

/**
 * Hook for responsive layout information with performance optimization.
 */
export function useResponsiveLayout(terminalWidth: number, terminalHeight: number) {
  const layoutConfig = useUILayoutStore(selectLayoutConfig);
  
  return useDeepMemo(() => {
    return getResponsiveLayout(
      terminalWidth,
      terminalHeight,
      layoutConfig.responsiveBreakpoints
    );
  }, [terminalWidth, terminalHeight, layoutConfig.responsiveBreakpoints]);
}

/**
 * Performance-optimized hook for stable layout actions.
 */
export function useLayoutActions() {
  const setContextAreaWidth = useUILayoutStore((state) => state.setContextAreaWidth);
  const toggleTaskSidebar = useUILayoutStore((state) => state.toggleTaskSidebar);
  const setTaskSidebarCollapsed = useUILayoutStore((state) => state.setTaskSidebarCollapsed);
  const setContextScrollPosition = useUILayoutStore((state) => state.setContextScrollPosition);
  const setTaskScrollPosition = useUILayoutStore((state) => state.setTaskScrollPosition);
  const setColorScheme = useUILayoutStore((state) => state.setColorScheme);
  const setLayoutConfig = useUILayoutStore((state) => state.setLayoutConfig);
  const resetToDefaults = useUILayoutStore((state) => state.resetToDefaults);
  const validateConfiguration = useUILayoutStore((state) => state.validateConfiguration);
  
  return useDeepMemo(() => ({
    setContextAreaWidth,
    toggleTaskSidebar,
    setTaskSidebarCollapsed,
    setContextScrollPosition,
    setTaskScrollPosition,
    setColorScheme,
    setLayoutConfig,
    resetToDefaults,
    validateConfiguration,
  }), [
    setContextAreaWidth,
    toggleTaskSidebar,
    setTaskSidebarCollapsed,
    setContextScrollPosition,
    setTaskScrollPosition,
    setColorScheme,
    setLayoutConfig,
    resetToDefaults,
    validateConfiguration,
  ]);
}