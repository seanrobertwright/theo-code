/**
 * @fileoverview ContextArea component - Main content area with message display
 * @module shared/components/Layout/ContextArea
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { ContextAreaProps } from './types.js';
import { MessageList } from './MessageList.js';
import { ScrollIndicator } from './ScrollIndicator.js';
import { useLayoutContext } from './FullScreenLayout.js';
import { safeLayoutCalculation } from './error-handling.js';
import { logger } from '../../utils/logger.js';
import {
  useStableCallback,
  createMemoComponent,
  usePerformanceMonitor,
  useThrottle,
  useDeepMemo,
} from './performance-optimizations.js';

/**
 * Main content area component with scrollable message display and performance optimizations.
 * 
 * This component provides the primary conversation interface with:
 * - Scrollable message list with proper dimensions
 * - Scrollbar indicators for overflow content
 * - Integration with existing message rendering
 * - Color-coded message types
 * - Comprehensive error handling and graceful degradation
 * - Performance optimizations with throttling and memoization
 * 
 * Features:
 * - Responsive message display
 * - Scroll position management with throttling
 * - Message type color coding
 * - Syntax highlighting for code blocks
 * - Streaming message support
 * - Error boundary for message rendering failures
 * - Dimension validation and fallback handling
 * - Performance monitoring and optimization
 */
const ContextAreaComponent: React.FC<ContextAreaProps> = ({
  messages,
  streamingText,
  isStreaming,
  width,
  height,
  scrollPosition = 0,
  colorScheme,
  onWidthChange: _onWidthChange,
  onScrollChange,
}) => {
  const layoutContext = useLayoutContext();
  const effectiveColorScheme = colorScheme || layoutContext.colorScheme;
  const { measure } = usePerformanceMonitor('ContextArea', process.env['NODE_ENV'] === 'development');
  
  // State for error handling
  const [renderError, setRenderError] = React.useState<string | null>(null);
  
  // Calculate content dimensions with error handling (memoized)
  const layoutCalculation = useDeepMemo(() => {
    let currentError: string | null = null;
    let currentWarnings: string[] = [];
    
    const { result, error, warnings } = safeLayoutCalculation(
      () => {
        // Validate input dimensions
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          throw new Error(`Invalid ContextArea dimensions: width=${width}, height=${height}`);
        }
        
        if (width <= 0 || height <= 0) {
          throw new Error(`ContextArea dimensions must be positive: width=${width}, height=${height}`);
        }
        
        const contentWidth = Math.max(1, width - 2); // Account for border
        const contentAreaHeight = Math.max(1, height - 2); // Account for border
        
        return { contentWidth, contentAreaHeight };
      },
      // Fallback dimensions
      { contentWidth: Math.max(1, width - 2), contentAreaHeight: Math.max(1, height - 2) },
      'ContextArea dimension calculation'
    );
    
    if (error) {
      logger.warn('ContextArea dimension calculation failed', { error: error.message, width, height });
      currentError = `Dimension calculation failed: ${error.message}`;
    }
    
    if (warnings.length > 0) {
      logger.warn('ContextArea dimension calculation warnings', { warnings, width, height });
      currentWarnings = warnings;
    }
    
    return { ...result, error: currentError, warnings: currentWarnings };
  }, [width, height]);
  
  const { contentWidth, contentAreaHeight } = layoutCalculation;

  // State for scroll management with error handling
  const [localScrollPosition, setLocalScrollPosition] = React.useState(() => {
    // Validate initial scroll position
    if (!Number.isFinite(scrollPosition) || scrollPosition < 0) {
      logger.warn('Invalid initial scroll position, using 0', { scrollPosition });
      return 0;
    }
    return scrollPosition;
  });
  
  const [totalContentHeight, setTotalContentHeight] = React.useState(0);
  const [hasScrollableContent, setHasScrollableContent] = React.useState(false);
  
  // Update local scroll position when prop changes with validation
  React.useEffect(() => {
    if (Number.isFinite(scrollPosition) && scrollPosition >= 0) {
      setLocalScrollPosition(scrollPosition);
    } else {
      logger.warn('Invalid scroll position prop, ignoring', { scrollPosition });
    }
  }, [scrollPosition]);
  
  // Throttled scroll change handler for better performance
  const handleScrollChange = React.useCallback((newPosition: number) => {
    if (!Number.isFinite(newPosition) || newPosition < 0) {
      logger.warn('Invalid scroll position change, ignoring', { newPosition });
      return;
    }
    
    try {
      setLocalScrollPosition(newPosition);
      onScrollChange?.(newPosition);
    } catch (error) {
      logger.error('Error in scroll change handler', { error: error instanceof Error ? error.message : 'Unknown error' });
      setRenderError('Scroll handling error');
    }
  }, [onScrollChange]);

  const throttledScrollChange = useThrottle(
    useStableCallback((...args: unknown[]) => {
      const [newPosition] = args as [number];
      handleScrollChange(newPosition);
    }, [handleScrollChange]),
    16 // ~60fps throttling
  );
  
  // Handle content height changes from MessageList with validation and throttling
  const handleContentHeightChange = React.useCallback((newContentHeight: number) => {
    if (!Number.isFinite(newContentHeight) || newContentHeight < 0) {
      logger.warn('Invalid content height change, ignoring', { newContentHeight });
      return;
    }
    
    try {
      measure(() => {
        setTotalContentHeight(newContentHeight);
        setHasScrollableContent(newContentHeight > contentAreaHeight);
      });
    } catch (error) {
      logger.error('Error in content height change handler', { error: error instanceof Error ? error.message : 'Unknown error' });
      setRenderError('Content height handling error');
    }
  }, [contentAreaHeight, measure]);

  const throttledContentHeightChange = useThrottle(
    useStableCallback((...args: unknown[]) => {
      const [newContentHeight] = args as [number];
      handleContentHeightChange(newContentHeight);
    }, [handleContentHeightChange]),
    100 // 100ms throttling for content height changes
  );
  
  // Calculate scroll indicator properties with error handling (memoized)
  const scrollIndicatorProps = useDeepMemo(() => {
    const { result, error } = safeLayoutCalculation(
      () => {
        if (!hasScrollableContent) {
          return {
            hasScroll: false,
            scrollPosition: 0,
            contentHeight: 0,
            visibleHeight: contentAreaHeight,
          };
        }
        
        const maxScroll = Math.max(1, totalContentHeight - contentAreaHeight);
        const scrollRatio = totalContentHeight > 0 ? localScrollPosition / maxScroll : 0;
        
        return {
          hasScroll: true,
          scrollPosition: Math.max(0, Math.min(1, scrollRatio)),
          contentHeight: totalContentHeight,
          visibleHeight: contentAreaHeight,
        };
      },
      // Fallback scroll indicator props
      {
        hasScroll: false,
        scrollPosition: 0,
        contentHeight: 0,
        visibleHeight: contentAreaHeight,
      },
      'scroll indicator calculation'
    );
    
    if (error) {
      logger.warn('Scroll indicator calculation failed', { error: error.message });
    }
    
    return result;
  }, [hasScrollableContent, localScrollPosition, totalContentHeight, contentAreaHeight]);
  
  // Clear render error after a delay
  React.useEffect(() => {
    if (renderError) {
      const timer = setTimeout(() => {
        setRenderError(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
    
    // Return undefined for the case when there's no render error
    return undefined;
  }, [renderError]);

  const displayedError = renderError || layoutCalculation.error;
  
  // Show error state if there's a critical error
  if (displayedError && layoutContext.errorState.hasError) {
    return (
      <Box
        width={width}
        height={height}
        borderStyle="single"
        borderColor={effectiveColorScheme.colors.errorMessage}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
      >
        <Text color={effectiveColorScheme.colors.errorMessage}>⚠️ Context Area Error</Text>
        <Text color={effectiveColorScheme.colors.comment}>{displayedError}</Text>
      </Box>
    );
  }
  
  return (
    <Box
      width={width}
      height={height}
      borderStyle="single"
      borderColor={effectiveColorScheme.colors.border}
      flexDirection="row"
    >
      {/* Main message content area */}
      <Box
        width={contentWidth - (hasScrollableContent ? 1 : 0)} // Reserve space for scrollbar
        height={contentAreaHeight}
        flexDirection="column"
      >
        <MessageList
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          width={contentWidth - (hasScrollableContent ? 1 : 0)}
          height={contentAreaHeight}
          scrollPosition={localScrollPosition}
          colorScheme={effectiveColorScheme}
          onScrollChange={(pos) => throttledScrollChange(pos)}
          onContentHeightChange={(height) => throttledContentHeightChange(height)}
        />
      </Box>
      
      {/* Scrollbar indicator */}
      {hasScrollableContent && (
        <Box width={1} height={contentAreaHeight}>
          <ScrollIndicator
            {...scrollIndicatorProps}
            width={1}
            height={contentAreaHeight}
            colorScheme={effectiveColorScheme}
          />
        </Box>
      )}
    </Box>
  );
};

// Create memoized version for performance
export const ContextArea = createMemoComponent(ContextAreaComponent, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.messages === nextProps.messages &&
    prevProps.streamingText === nextProps.streamingText &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.scrollPosition === nextProps.scrollPosition &&
    prevProps.colorScheme === nextProps.colorScheme
  );
});

export type { ContextAreaProps };