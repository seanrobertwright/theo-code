/**
 * @fileoverview ResponsiveLayoutContent component - Handles responsive layout switching
 * @module shared/components/Layout/ResponsiveLayoutContent
 */

import * as React from 'react';
import { Box } from 'ink';
import type { TaskItem } from './types.js';
import type { Message } from '../../types/index.js';
import { ConnectedProjectHeader } from './ConnectedProjectHeader.js';
import { ContextArea } from './ContextArea.js';
import { ResizableDivider } from './ResizableDivider.js';
import { ConnectedTaskSidebar } from './ConnectedTaskSidebar.js';
import { ConnectedStatusFooter } from './ConnectedStatusFooter.js';
import { InputArea } from './InputArea.js';
import { useLayoutContext } from './FullScreenLayout.js';
import { useUILayoutStore } from '../../store/ui-layout.js';

/**
 * Props for ResponsiveLayoutContent component.
 */
export interface ResponsiveLayoutContentProps {
  /** Message history */
  messages: Message[];
  /** Current streaming text */
  streamingText: string;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Current input value */
  inputValue: string;
  /** Input change handler */
  onInputChange: (value: string) => void;
  /** Input submit handler */
  onInputSubmit: () => void;
  /** Task list */
  tasks: TaskItem[];
  /** Terminal width */
  terminalWidth: number;
  /** Terminal height */
  terminalHeight: number;
}

/**
 * Responsive layout content component that handles different layout modes.
 * 
 * This component implements the responsive breakpoint behavior:
 * - Vertical stacking for narrow terminals (< 80 chars)
 * - Context area prioritization for short terminals (< 20 lines)
 * - Graceful handling of extreme dimensions
 * - Sidebar hiding for very small terminals
 * - Header minimization for compact mode
 */
export const ResponsiveLayoutContent: React.FC<ResponsiveLayoutContentProps> = ({
  messages,
  streamingText,
  isStreaming,
  inputValue,
  onInputChange,
  onInputSubmit,
  tasks,
  terminalWidth: _terminalWidth,
  terminalHeight: _terminalHeight,
}) => {
  const layoutContext = useLayoutContext();
  const { dimensions, responsive } = layoutContext;
  
  // UI layout store state
  const contextAreaWidth = useUILayoutStore((state) => state.contextAreaWidth);
  const setContextAreaWidth = useUILayoutStore((state) => state.setContextAreaWidth);
  const contextScrollPosition = useUILayoutStore((state) => state.scrollPositions.context);
  const setContextScrollPosition = useUILayoutStore((state) => state.setContextScrollPosition);
  const taskScrollPosition = useUILayoutStore((state) => state.scrollPositions.tasks);
  const setTaskScrollPosition = useUILayoutStore((state) => state.setTaskScrollPosition);

  // Calculate content area height (terminal - header - footer)
  const contentAreaHeight = dimensions.terminal.height - dimensions.header.height - dimensions.footer.height;
  
  // Render header (may be minimized in compact mode)
  const renderHeader = () => {
    if (responsive.shouldMinimizeHeader) {
      // In very compact mode, show minimal header or hide it
      return null;
    }
    
    return (
      <ConnectedProjectHeader 
        width={dimensions.header.width}
      />
    );
  };

  // Render main content based on layout mode
  const renderMainContent = () => {
    if (responsive.isVertical) {
      // Vertical stacking layout for narrow terminals
      return renderVerticalLayout();
    } else {
      // Horizontal layout for normal terminals
      return renderHorizontalLayout();
    }
  };

  // Render vertical stacked layout
  const renderVerticalLayout = () => {
    const contextHeight = responsive.isCompact 
      ? Math.floor(contentAreaHeight * 0.8) // Prioritize context in compact mode
      : Math.floor(contentAreaHeight * 0.6); // Normal split
    
    const sidebarHeight = contentAreaHeight - contextHeight;
    
    return (
      <Box flexDirection="column" height={contentAreaHeight}>
        {/* Context Area - Full width, prioritized height */}
        <Box flexDirection="column" height={contextHeight}>
          <ContextArea
            messages={messages}
            streamingText={streamingText}
            isStreaming={isStreaming}
            width={dimensions.terminal.width}
            height={contextHeight - 2} // Reserve space for input
            scrollPosition={contextScrollPosition}
            onScrollChange={setContextScrollPosition}
          />
          
          {/* Input Area */}
          <InputArea
            value={inputValue}
            onChange={onInputChange}
            onSubmit={onInputSubmit}
            disabled={isStreaming}
            width={dimensions.terminal.width}
          />
        </Box>
        
        {/* Task Sidebar - Full width, remaining height */}
        {!responsive.shouldHideSidebar && sidebarHeight > 3 && (
          <ConnectedTaskSidebar
            fallbackTasks={tasks}
            width={dimensions.terminal.width}
            height={sidebarHeight}
            scrollPosition={taskScrollPosition}
            onScrollChange={setTaskScrollPosition}
          />
        )}
      </Box>
    );
  };

  // Render horizontal layout
  const renderHorizontalLayout = () => {
    const contextWidth = Math.floor((dimensions.terminal.width * contextAreaWidth) / 100);
    const sidebarWidth = dimensions.terminal.width - contextWidth - 1; // -1 for divider
    
    return (
      <Box flexDirection="row" height={contentAreaHeight}>
        {/* Context Area with Messages and Input */}
        <Box flexDirection="column" width={contextWidth}>
          <ContextArea
            messages={messages}
            streamingText={streamingText}
            isStreaming={isStreaming}
            width={contextWidth}
            height={contentAreaHeight - 2} // Reserve space for input
            scrollPosition={contextScrollPosition}
            onScrollChange={setContextScrollPosition}
          />
          
          {/* Input Area */}
          <InputArea
            value={inputValue}
            onChange={onInputChange}
            onSubmit={onInputSubmit}
            disabled={isStreaming}
            width={contextWidth}
          />
        </Box>
        
        {/* Resizable Divider - Only show in horizontal mode */}
        {!responsive.shouldHideSidebar && (
          <ResizableDivider
            currentContextWidth={contextAreaWidth}
            minContextWidth={50}
            maxContextWidth={90}
            height={contentAreaHeight}
            onResize={setContextAreaWidth}
          />
        )}
        
        {/* Task Sidebar */}
        {!responsive.shouldHideSidebar && (
          <ConnectedTaskSidebar
            fallbackTasks={tasks}
            width={sidebarWidth}
            height={contentAreaHeight}
            scrollPosition={taskScrollPosition}
            onScrollChange={setTaskScrollPosition}
          />
        )}
      </Box>
    );
  };

  // Render footer
  const renderFooter = () => {
    return (
      <ConnectedStatusFooter 
        width={dimensions.footer.width}
      />
    );
  };

  return (
    <Box flexDirection="column" width={dimensions.terminal.width} height={dimensions.terminal.height}>
      {/* Header */}
      {renderHeader()}
      
      {/* Main Content */}
      {renderMainContent()}
      
      {/* Footer */}
      {renderFooter()}
    </Box>
  );
};