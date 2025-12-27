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

/**
 * Main content area component with scrollable message display.
 * 
 * This component provides the primary conversation interface with:
 * - Scrollable message list with proper dimensions
 * - Scrollbar indicators for overflow content
 * - Integration with existing message rendering
 * - Color-coded message types
 * 
 * Features:
 * - Responsive message display
 * - Scroll position management
 * - Message type color coding
 * - Syntax highlighting for code blocks
 * - Streaming message support
 */
export const ContextArea: React.FC<ContextAreaProps> = ({
  messages,
  streamingText,
  isStreaming,
  width,
  height,
  scrollPosition = 0,
  colorScheme,
  onWidthChange,
  onScrollChange,
}) => {
  const layoutContext = useLayoutContext();
  const effectiveColorScheme = colorScheme || layoutContext.colorScheme;
  
  // Calculate content dimensions
  const contentWidth = Math.max(1, width - 2); // Account for border
  const contentAreaHeight = Math.max(1, height - 2); // Account for border
  
  // State for scroll management
  const [localScrollPosition, setLocalScrollPosition] = React.useState(scrollPosition);
  const [totalContentHeight, setTotalContentHeight] = React.useState(0);
  const [hasScrollableContent, setHasScrollableContent] = React.useState(false);
  
  // Update local scroll position when prop changes
  React.useEffect(() => {
    setLocalScrollPosition(scrollPosition);
  }, [scrollPosition]);
  
  // Handle scroll position changes
  const handleScrollChange = React.useCallback((newPosition: number) => {
    setLocalScrollPosition(newPosition);
    onScrollChange?.(newPosition);
  }, [onScrollChange]);
  
  // Handle content height changes from MessageList
  const handleContentHeightChange = React.useCallback((newContentHeight: number) => {
    setTotalContentHeight(newContentHeight);
    setHasScrollableContent(newContentHeight > contentAreaHeight);
  }, [contentAreaHeight]);
  
  // Calculate scroll indicator properties
  const scrollIndicatorProps = React.useMemo(() => {
    if (!hasScrollableContent) {
      return {
        hasScroll: false,
        scrollPosition: 0,
        contentHeight: 0,
        visibleHeight: contentAreaHeight,
      };
    }
    
    const scrollRatio = totalContentHeight > 0 ? localScrollPosition / Math.max(1, totalContentHeight - contentAreaHeight) : 0;
    
    return {
      hasScroll: true,
      scrollPosition: Math.max(0, Math.min(1, scrollRatio)),
      contentHeight: totalContentHeight,
      visibleHeight: contentAreaHeight,
    };
  }, [hasScrollableContent, localScrollPosition, totalContentHeight, contentAreaHeight]);
  
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
          onScrollChange={handleScrollChange}
          onContentHeightChange={handleContentHeightChange}
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

export type { ContextAreaProps };