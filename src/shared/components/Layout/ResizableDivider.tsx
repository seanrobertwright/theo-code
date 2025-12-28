/**
 * @fileoverview ResizableDivider component - Interactive divider for width adjustment
 * @module shared/components/Layout/ResizableDivider
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ResizableDividerProps } from './types.js';
import { createDefaultColorScheme, clamp } from './utils.js';
import { safeLayoutCalculation } from './error-handling.js';
import { logger } from '../../utils/logger.js';
import {
  useStableCallback,
  createMemoComponent,
  useThrottle,
  useDeepMemo,
} from './performance-optimizations.js';

/**
 * Interactive divider component for adjusting context/task area widths with performance optimizations.
 * 
 * Features:
 * - Horizontal resize functionality with keyboard interaction
 * - Visual feedback during resize operations
 * - Width constraint enforcement (50% minimum context width)
 * - Keyboard-based resize support for accessibility
 * - Comprehensive error handling and input validation
 * - Graceful degradation for invalid resize operations
 * - Performance optimizations with throttling and memoization
 */
const ResizableDividerComponent: React.FC<ResizableDividerProps> = ({
  currentContextWidth,
  minContextWidth,
  maxContextWidth,
  height,
  colorScheme = createDefaultColorScheme(),
  onResize,
}) => {
  const [isActive, setIsActive] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [resizeError, setResizeError] = React.useState<string | null>(null);
  
  // Validate props on mount and when they change (memoized)
  const propValidation = useDeepMemo(() => {
    const { result: isValid, error } = safeLayoutCalculation(
      () => {
        // Validate width constraints
        if (!Number.isFinite(currentContextWidth) || !Number.isFinite(minContextWidth) || !Number.isFinite(maxContextWidth)) {
          throw new Error(`Invalid width values: current=${currentContextWidth}, min=${minContextWidth}, max=${maxContextWidth}`);
        }
        
        if (minContextWidth < 0 || maxContextWidth < 0 || currentContextWidth < 0) {
          throw new Error(`Width values must be non-negative: current=${currentContextWidth}, min=${minContextWidth}, max=${maxContextWidth}`);
        }
        
        if (minContextWidth > maxContextWidth) {
          throw new Error(`Invalid width range: min (${minContextWidth}) must be <= max (${maxContextWidth})`);
        }
        
        if (currentContextWidth < minContextWidth || currentContextWidth > maxContextWidth) {
          throw new Error(`Current width (${currentContextWidth}) is outside valid range [${minContextWidth}, ${maxContextWidth}]`);
        }
        
        // Validate height
        if (!Number.isFinite(height) || height <= 0) {
          throw new Error(`Invalid height: ${height}`);
        }
        
        return true;
      },
      false,
      'ResizableDivider prop validation'
    );
    
    return { isValid, error };
  }, [currentContextWidth, minContextWidth, maxContextWidth, height]);
  
  // Update resize error based on prop validation
  React.useEffect(() => {
    if (propValidation.error) {
      setResizeError(`Configuration error: ${propValidation.error.message}`);
      logger.error('ResizableDivider prop validation failed', { 
        error: propValidation.error.message,
        currentContextWidth,
        minContextWidth,
        maxContextWidth,
        height,
      });
    } else {
      setResizeError(null);
    }
  }, [propValidation.error, currentContextWidth, minContextWidth, maxContextWidth, height]);
  
  // Throttled resize handler with validation and error handling
  const throttledResize = useThrottle(
    useStableCallback((newWidth: number) => {
      const { result: success, error } = safeLayoutCalculation(
        () => {
          // Validate new width
          if (!Number.isFinite(newWidth)) {
            throw new Error(`Invalid resize width: ${newWidth}`);
          }
          
          // Clamp to valid range
          const clampedWidth = clamp(newWidth, minContextWidth, maxContextWidth);
          
          // Only call onResize if the width actually changed
          if (Math.abs(clampedWidth - currentContextWidth) > 0.1) {
            onResize(clampedWidth);
          }
          
          return true;
        },
        false,
        'resize operation'
      );
      
      if (error) {
        setResizeError(`Resize failed: ${error.message}`);
        logger.warn('ResizableDivider resize operation failed', { 
          error: error.message,
          newWidth,
          currentContextWidth,
          minContextWidth,
          maxContextWidth,
        });
        
        // Clear error after a delay
        setTimeout(() => setResizeError(null), 3000);
      }
    }, [currentContextWidth, minContextWidth, maxContextWidth, onResize]),
    50 // 50ms throttling for resize operations
  );
  
  // Handle keyboard input for resize operations with throttling
  useInput(
    useThrottle((input, key) => {
      if (!isActive || resizeError) {
        return;
      }
      
      try {
        // Handle arrow keys for resize
        if (key.leftArrow) {
          const newWidth = Math.max(minContextWidth, currentContextWidth - 2);
          throttledResize(newWidth);
        } else if (key.rightArrow) {
          const newWidth = Math.min(maxContextWidth, currentContextWidth + 2);
          throttledResize(newWidth);
        } else if (key.escape) {
          setIsActive(false);
          setIsDragging(false);
        } else if (input === ' ' || key.return) {
          setIsActive(!isActive);
        }
      } catch (error) {
        setResizeError(`Input handling error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        logger.error('ResizableDivider input handling failed', { error });
        
        // Clear error after a delay
        setTimeout(() => setResizeError(null), 3000);
      }
    }, 100) // 100ms throttling for keyboard input
  );
  
  // Visual feedback based on state with error handling (memoized)
  const getDividerChar = useStableCallback((index: number): string => {
    try {
      if (resizeError) {
        return '!'; // Error indicator
      } else if (isDragging) {
        return '║'; // Double line when dragging
      } else if (isActive) {
        return '┃'; // Thick line when active/focused
      } else {
        // Alternating pattern for visual appeal
        return index % 3 === 1 ? '│' : '┊';
      }
    } catch (error) {
      logger.warn('Error in getDividerChar', { error, index });
      return '│'; // Fallback character
    }
  }, [isDragging, isActive, resizeError]);
  
  const getDividerColor = useStableCallback((): string => {
    try {
      if (resizeError) {
        return colorScheme.colors.errorMessage;
      } else if (isDragging) {
        return colorScheme.colors.dividerActive;
      } else if (isActive) {
        return colorScheme.colors.focus;
      } else {
        return colorScheme.colors.divider;
      }
    } catch (error) {
      logger.warn('Error in getDividerColor', { error });
      return 'gray'; // Fallback color
    }
  }, [isDragging, isActive, resizeError, colorScheme]);
  
  // Calculate safe height for rendering (memoized)
  const safeHeight = React.useMemo(() => {
    return Math.max(1, Math.floor(height));
  }, [height]);
  
  // Generate divider elements (memoized)
  const dividerElements = useDeepMemo(() => {
    return Array.from({ length: safeHeight }, (_, i) => {
      const char = getDividerChar(i);
      const color = getDividerColor();
      const isMiddle = i === Math.floor(safeHeight / 2);
      
      return (
        <Box key={i} width={1}>
          <Text color={color}>
            {isActive && isMiddle && !resizeError ? '↔' : char}
          </Text>
        </Box>
      );
    });
  }, [safeHeight, getDividerChar, getDividerColor, isActive, resizeError]);
  
  return (
    <Box
      width={1}
      height={safeHeight}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      {dividerElements}
    </Box>
  );
};

// Create memoized version for performance
export const ResizableDivider = createMemoComponent(ResizableDividerComponent, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.currentContextWidth === nextProps.currentContextWidth &&
    prevProps.minContextWidth === nextProps.minContextWidth &&
    prevProps.maxContextWidth === nextProps.maxContextWidth &&
    prevProps.height === nextProps.height &&
    prevProps.colorScheme === nextProps.colorScheme
  );
});