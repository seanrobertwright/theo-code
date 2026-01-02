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
import { logger } from '../utils/logger.js';

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
      try {
        const { layoutConfig } = get();
        const clampedWidth = clamp(
          width,
          layoutConfig.minContextWidth,
          layoutConfig.maxContextWidth
        );
        
        set({ contextAreaWidth: clampedWidth });
      } catch (error) {
        logger.error('Failed to set context area width in UILayoutStore', {
          error: error instanceof Error ? error.message : String(error),
          width,
          context: 'ui-layout-state-update'
        });
        
        // Fallback: use default width
        try {
          set({ contextAreaWidth: 70 });
        } catch (fallbackError) {
          logger.error('Fallback context area width update also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    toggleTaskSidebar: (): void => {
      try {
        set((state) => ({
          taskSidebarCollapsed: !state.taskSidebarCollapsed,
        }));
      } catch (error) {
        logger.error('Failed to toggle task sidebar in UILayoutStore', {
          error: error instanceof Error ? error.message : String(error),
          context: 'ui-layout-state-update'
        });
        
        // Fallback: try to set to false (expanded)
        try {
          set({ taskSidebarCollapsed: false });
        } catch (fallbackError) {
          logger.error('Fallback task sidebar toggle also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    setTaskSidebarCollapsed: (collapsed: boolean): void => {
      try {
        set({ taskSidebarCollapsed: collapsed });
      } catch (error) {
        logger.error('Failed to set task sidebar collapsed state in UILayoutStore', {
          error: error instanceof Error ? error.message : String(error),
          collapsed,
          context: 'ui-layout-state-update'
        });
        
        // Fallback: use default state (expanded)
        try {
          set({ taskSidebarCollapsed: false });
        } catch (fallbackError) {
          logger.error('Fallback task sidebar collapsed update also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    // -------------------------------------------------------------------------
    // Scroll Actions
    // -------------------------------------------------------------------------

    setContextScrollPosition: (position: number): void => {
      try {
        set((state) => ({
          scrollPositions: {
            ...state.scrollPositions,
            context: Math.max(0, position),
          },
        }));
      } catch (error) {
        logger.error('Failed to set context scroll position in UILayoutStore', {
          error: error instanceof Error ? error.message : String(error),
          position,
          context: 'ui-layout-state-update'
        });
        
        // Fallback: reset scroll position to 0
        try {
          set((state) => ({
            scrollPositions: {
              ...state.scrollPositions,
              context: 0,
            },
          }));
        } catch (fallbackError) {
          logger.error('Fallback context scroll position update also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    setTaskScrollPosition: (position: number): void => {
      try {
        set((state) => ({
          scrollPositions: {
            ...state.scrollPositions,
            tasks: Math.max(0, position),
          },
        }));
      } catch (error) {
        logger.error('Failed to set task scroll position in UILayoutStore', {
          error: error instanceof Error ? error.message : String(error),
          position,
          context: 'ui-layout-state-update'
        });
        
        // Fallback: reset scroll position to 0
        try {
          set((state) => ({
            scrollPositions: {
              ...state.scrollPositions,
              tasks: 0,
            },
          }));
        } catch (fallbackError) {
          logger.error('Fallback task scroll position update also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    // -------------------------------------------------------------------------
    // Configuration Actions
    // -------------------------------------------------------------------------

    setColorScheme: (colorScheme: ColorScheme): void => {
      try {
        if (validateColorScheme(colorScheme)) {
          set({ colorScheme });
        } else {
          logger.warn('Invalid color scheme provided, keeping current scheme', {
            colorScheme: colorScheme.name,
            context: 'ui-layout-validation'
          });
          
          // Fallback: use default color scheme
          const defaultScheme = createDefaultColorScheme();
          set({ colorScheme: defaultScheme });
        }
      } catch (error) {
        logger.error('Failed to set color scheme in UILayoutStore', {
          error: error instanceof Error ? error.message : String(error),
          colorScheme: colorScheme.name,
          context: 'ui-layout-state-update'
        });
        
        // Fallback: use default color scheme
        try {
          const defaultScheme = createDefaultColorScheme();
          set({ colorScheme: defaultScheme });
        } catch (fallbackError) {
          logger.error('Fallback color scheme update also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    setLayoutConfig: (config: LayoutConfig): void => {
      try {
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
          logger.warn('Invalid layout config provided, keeping current config', {
            context: 'ui-layout-validation'
          });
          
          // Fallback: use default layout config
          const defaultConfig = createDefaultLayoutConfig();
          set({ layoutConfig: defaultConfig });
        }
      } catch (error) {
        logger.error('Failed to set layout config in UILayoutStore', {
          error: error instanceof Error ? error.message : String(error),
          context: 'ui-layout-state-update'
        });
        
        // Fallback: use default layout config
        try {
          const defaultConfig = createDefaultLayoutConfig();
          set({ layoutConfig: defaultConfig });
        } catch (fallbackError) {
          logger.error('Fallback layout config update also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    // -------------------------------------------------------------------------
    // Utility Actions
    // -------------------------------------------------------------------------

    resetToDefaults: (): void => {
      try {
        set({
          ...initialState,
          colorScheme: createDefaultColorScheme(),
          layoutConfig: createDefaultLayoutConfig(),
        });
      } catch (error) {
        logger.error('Failed to reset UI layout to defaults', {
          error: error instanceof Error ? error.message : String(error),
          context: 'ui-layout-state-update'
        });
        
        // Fallback: try to set individual properties
        try {
          set({ contextAreaWidth: 70 });
          set({ taskSidebarCollapsed: false });
          set({ scrollPositions: { context: 0, tasks: 0 } });
        } catch (fallbackError) {
          logger.error('Fallback reset to defaults also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }
    },

    validateConfiguration: (): boolean => {
      try {
        const { colorScheme, layoutConfig } = get();
        return validateColorScheme(colorScheme) && validateLayoutConfig(layoutConfig);
      } catch (error) {
        logger.error('Failed to validate UI layout configuration', {
          error: error instanceof Error ? error.message : String(error),
          context: 'ui-layout-validation'
        });
        return false;
      }
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