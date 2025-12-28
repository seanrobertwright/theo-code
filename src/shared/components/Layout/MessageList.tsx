/**
 * @fileoverview MessageList component - Scrollable message display with performance optimizations
 * @module shared/components/Layout/MessageList
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import type { MessageListProps, ColorScheme } from './types.js';
import type { Message } from '../../types/index.js';
import { ColorCodedMessage, createMessageColorScheme, getRoleDisplayInfo } from './MessageColorCoding.js';
import {
  useVirtualScrolling,
  useStableCallback,
  createMemoComponent,
  usePerformanceMonitor,
  useThrottle,
  useDeepMemo,
} from './performance-optimizations.js';

/**
 * Individual message component with memoization for performance.
 */
const MessageItem = createMemoComponent<{
  message: Message;
  index: number;
  colorScheme?: ColorScheme;
}>(({ message, index, colorScheme }) => {
  // Simple fallback rendering for debugging
  return (
    <Box key={message.id} flexDirection="column">
      <Text bold>You:</Text>
      <Box paddingLeft={2}>
        <Text>
          {typeof message.content === 'string'
            ? message.content
            : message.content
                .filter((block) => block.type === 'text')
                .map((block) => (block.type === 'text' ? block.text : ''))
                .join('\n')}
        </Text>
      </Box>
    </Box>
  );
});

/**
 * Streaming message component with memoization.
 */
const StreamingMessage = createMemoComponent<{
  streamingText: string;
  isStreaming: boolean;
}>(({ streamingText, isStreaming }) => {
  if (!isStreaming || !streamingText) {
    return null;
  }
  
  return (
    <Box key="streaming" flexDirection="column">
      <Box>
        <Text>🤖 Assistant:</Text>
      </Box>
      <Box paddingLeft={3}>
        <Text>{streamingText}</Text>
        <Text>▊</Text>
      </Box>
    </Box>
  );
});

/**
 * Scrollable message list component with performance optimizations.
 * 
 * This component handles:
 * - Message rendering with enhanced color coding
 * - Scroll position management with throttling
 * - Keyboard navigation (arrow keys, page up/down) with debouncing
 * - Content height calculation with memoization
 * - Streaming message display
 * - Syntax highlighting for code blocks
 * - Virtual scrolling for large message lists
 * - Performance monitoring and optimization
 */
const MessageListComponent: React.FC<MessageListProps & {
  onContentHeightChange?: (height: number) => void;
}> = ({
  messages,
  streamingText,
  isStreaming,
  width,
  height,
  scrollPosition = 0,
  colorScheme,
  onScrollChange,
  onContentHeightChange,
}) => {
  const { measure } = usePerformanceMonitor('MessageList', process.env.NODE_ENV === 'development');
  
  // Estimate item height for virtual scrolling
  const ESTIMATED_MESSAGE_HEIGHT = 4; // ~4 lines per message with enhanced styling
  
  // State for content management
  const [totalContentHeight, setTotalContentHeight] = React.useState(0);
  const [hasScrollableContent, setHasScrollableContent] = React.useState(false);
  
  // Create enhanced color scheme (memoized)
  const messageColorScheme = useDeepMemo(() => {
    return colorScheme ? createMessageColorScheme(colorScheme) : null;
  }, [colorScheme]);
  
  // Prepare items for virtual scrolling (memoized)
  const allItems = useDeepMemo(() => {
    const items = [...messages];
    if (isStreaming && streamingText) {
      items.push({
        id: 'streaming',
        role: 'assistant',
        content: streamingText,
        timestamp: Date.now(),
      } as Message);
    }
    return items;
  }, [messages, isStreaming, streamingText]);
  
  // Virtual scrolling for performance with large message lists
  const virtualScrolling = useVirtualScrolling({
    items: allItems,
    itemHeight: ESTIMATED_MESSAGE_HEIGHT,
    containerHeight: height,
    overscan: 3, // Render 3 extra items above/below viewport
    scrollTop: scrollPosition * ESTIMATED_MESSAGE_HEIGHT,
  });
  
  // Throttled scroll change handler for better performance
  const throttledScrollChange = useThrottle(
    useStableCallback((newPosition: number) => {
      if (onScrollChange && Number.isFinite(newPosition) && newPosition >= 0) {
        onScrollChange(newPosition);
      }
    }, [onScrollChange]),
    16 // ~60fps throttling
  );
  
  // Handle keyboard input for scrolling with throttling
  useInput(
    useThrottle((input, key) => {
      if (!onScrollChange) {
        return;
      }
      
      const scrollStep = 1;
      const pageStep = Math.max(1, height - 2);
      
      if (key.upArrow) {
        const newPosition = Math.max(0, scrollPosition - scrollStep);
        throttledScrollChange(newPosition);
      } else if (key.downArrow) {
        const maxScroll = Math.max(0, totalContentHeight - height);
        const newPosition = Math.min(maxScroll, scrollPosition + scrollStep);
        throttledScrollChange(newPosition);
      } else if (key.pageUp) {
        const newPosition = Math.max(0, scrollPosition - pageStep);
        throttledScrollChange(newPosition);
      } else if (key.pageDown) {
        const maxScroll = Math.max(0, totalContentHeight - height);
        const newPosition = Math.min(maxScroll, scrollPosition + pageStep);
        throttledScrollChange(newPosition);
      }
    }, 50) // 50ms throttling for keyboard input
  );
  
  // Render individual message with enhanced color coding (memoized)
  const renderMessage = useStableCallback((message: Message, index: number): React.ReactNode => {
    if (message.id === 'streaming') {
      return (
        <StreamingMessage
          key="streaming"
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
      );
    }
    
    return (
      <MessageItem
        key={message.id}
        message={message}
        index={index}
        colorScheme={colorScheme}
      />
    );
  }, [streamingText, isStreaming, colorScheme]);
  
  // Calculate content height and update state (memoized with performance measurement)
  React.useEffect(() => {
    measure(() => {
      const estimatedHeight = allItems.length * ESTIMATED_MESSAGE_HEIGHT;
      setTotalContentHeight(estimatedHeight);
      setHasScrollableContent(estimatedHeight > height);
      onContentHeightChange?.(estimatedHeight);
    });
  }, [allItems.length, height, onContentHeightChange, measure]);
  
  // Handle empty state
  if (messages.length === 0 && !isStreaming) {
    return (
      <Box
        width={width}
        height={height}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Text color={colorScheme?.colors.comment || 'gray'}>Welcome to theo-code!</Text>
        <Text color={colorScheme?.colors.comment || 'gray'}>Type a message or use /help to see available commands.</Text>
      </Box>
    );
  }
  
  // Use virtual scrolling for performance with large lists
  const shouldUseVirtualScrolling = allItems.length > 50; // Enable virtual scrolling for 50+ messages
  
  if (shouldUseVirtualScrolling) {
    return (
      <Box width={width} height={height} flexDirection="column">
        {/* Virtual scrolling container */}
        <Box height={virtualScrolling.totalHeight} position="relative">
          <Box position="absolute" top={virtualScrolling.offsetY}>
            {virtualScrolling.visibleItems.map((message, index) =>
              renderMessage(message, virtualScrolling.startIndex + index)
            )}
          </Box>
        </Box>
      </Box>
    );
  }
  
  // Regular rendering for smaller lists
  const visibleMessages = allItems.slice(
    0, // Start from beginning for now
    Math.min(allItems.length, height) // Show up to height messages
  );
  
  // For debugging: always render messages even if visibleMessages is empty
  if (visibleMessages.length === 0 && messages.length > 0) {
    return (
      <Box width={width} height={height} flexDirection="column">
        <Text>Debug: {messages.length} messages, {allItems.length} total, {visibleMessages.length} visible</Text>
        <Text>Height: {height}, ScrollPos: {scrollPosition}</Text>
        {allItems.slice(0, 2).map((message, index) => renderMessage(message, index))}
      </Box>
    );
  }
  
  return (
    <Box width={width} height={height} flexDirection="column">
      {visibleMessages.map((message, index) => renderMessage(message, index))}
    </Box>
  );
};

// Create memoized version for performance
export const MessageList = createMemoComponent(MessageListComponent, (prevProps, nextProps) => {
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

export type { MessageListProps };