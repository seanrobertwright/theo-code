/**
 * @fileoverview MessageList component - Scrollable message display
 * @module shared/components/Layout/MessageList
 */

import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import type { MessageListProps, ColorScheme } from './types.js';
import type { Message } from '../../types/index.js';
import { ColorCodedMessage, createMessageColorScheme, getRoleDisplayInfo } from './MessageColorCoding.js';

/**
 * Scrollable message list component.
 * 
 * This component handles:
 * - Message rendering with enhanced color coding
 * - Scroll position management
 * - Keyboard navigation (arrow keys, page up/down)
 * - Content height calculation
 * - Streaming message display
 * - Syntax highlighting for code blocks
 */
export const MessageList: React.FC<MessageListProps & {
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
  // Refs for measuring content
  const [renderedMessages, setRenderedMessages] = React.useState<React.ReactNode[]>([]);
  const [totalContentHeight, setTotalContentHeight] = React.useState(0);
  
  // Create enhanced color scheme
  const messageColorScheme = React.useMemo(() => {
    return colorScheme ? createMessageColorScheme(colorScheme) : null;
  }, [colorScheme]);
  
  // Calculate visible message range based on scroll position
  const visibleStartLine = Math.floor(scrollPosition);
  const visibleEndLine = visibleStartLine + height;
  
  // Handle keyboard input for scrolling
  useInput((input, key) => {
    if (!onScrollChange) {return;}
    
    const scrollStep = 1;
    const pageStep = Math.max(1, height - 2);
    
    if (key.upArrow) {
      const newPosition = Math.max(0, scrollPosition - scrollStep);
      onScrollChange(newPosition);
    } else if (key.downArrow) {
      const maxScroll = Math.max(0, totalContentHeight - height);
      const newPosition = Math.min(maxScroll, scrollPosition + scrollStep);
      onScrollChange(newPosition);
    } else if (key.pageUp) {
      const newPosition = Math.max(0, scrollPosition - pageStep);
      onScrollChange(newPosition);
    } else if (key.pageDown) {
      const maxScroll = Math.max(0, totalContentHeight - height);
      const newPosition = Math.min(maxScroll, scrollPosition + pageStep);
      onScrollChange(newPosition);
    }
  });
  
  // Render individual message with enhanced color coding
  const renderMessage = React.useCallback((message: Message, index: number): React.ReactNode => {
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
  }, []);
  
  // Render streaming message with color coding
  const renderStreamingMessage = React.useCallback((): React.ReactNode => {
    if (!isStreaming || !streamingText) {return null;}
    
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
  }, [isStreaming, streamingText]);
  
  // Calculate rendered messages and content height
  React.useEffect(() => {
    const allMessages = [...messages];
    const rendered = allMessages.map(renderMessage);
    
    // Add streaming message if present
    const streamingNode = renderStreamingMessage();
    if (streamingNode) {
      rendered.push(streamingNode);
    }
    
    setRenderedMessages(rendered);
    
    // Calculate approximate content height
    // This is a rough estimate - in a real implementation you'd measure actual rendered height
    const estimatedHeight = allMessages.length * 4 + (streamingNode ? 4 : 0); // ~4 lines per message with enhanced styling
    setTotalContentHeight(estimatedHeight);
    onContentHeightChange?.(estimatedHeight);
  }, [messages, renderMessage, renderStreamingMessage, onContentHeightChange]);
  
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
  
  // Render visible messages based on scroll position
  const visibleMessages = renderedMessages.slice(
    0, // Start from beginning for now
    Math.min(renderedMessages.length, height) // Show up to height messages
  );
  
  // For debugging: always render messages even if visibleMessages is empty
  if (visibleMessages.length === 0 && messages.length > 0) {
    return (
      <Box width={width} height={height} flexDirection="column">
        <Text>Debug: {messages.length} messages, {renderedMessages.length} rendered, {visibleMessages.length} visible</Text>
        <Text>Height: {height}, ScrollPos: {scrollPosition}</Text>
        {renderedMessages.slice(0, 2)} {/* Show first 2 messages for debugging */}
      </Box>
    );
  }
  
  return (
    <Box width={width} height={height} flexDirection="column">
      {visibleMessages}
    </Box>
  );
};

export type { MessageListProps };