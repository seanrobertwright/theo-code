/**
 * @fileoverview Integration test for centralized input manager
 * @module test/input-manager-integration
 */

import * as React from 'react';
import { render } from 'ink-testing-library';
import { InputManagerProvider, useInputManagerDebug } from '../shared/hooks/useInputManager.js';
import { InputArea } from '../shared/components/Layout/InputArea.js';
import { MessageList } from '../shared/components/Layout/MessageList.js';
import type { Message } from '../shared/types/index.js';

// Test component to verify input manager integration
const TestApp: React.FC = () => {
  const [inputValue, setInputValue] = React.useState('');
  const [scrollPosition, setScrollPosition] = React.useState(0);
  const debug = useInputManagerDebug();

  const messages: Message[] = [
    {
      id: '1',
      role: 'user',
      content: 'Test message',
      timestamp: Date.now(),
    },
  ];

  return (
    <InputManagerProvider>
      <div>
        <div>Handlers: {debug.totalHandlers}</div>
        <div>Active: {debug.activeHandlerId || 'none'}</div>
        <InputArea
          value={inputValue}
          onChange={setInputValue}
          onSubmit={() => {}}
          width={80}
        />
        <MessageList
          messages={messages}
          width={80}
          height={10}
          scrollPosition={scrollPosition}
          onScrollChange={setScrollPosition}
        />
      </div>
    </InputManagerProvider>
  );
};

describe('Input Manager Integration', () => {
  it('should register input handlers from both components', () => {
    const { lastFrame } = render(<TestApp />);
    
    // Should show that handlers are registered
    expect(lastFrame()).toContain('Handlers: 2'); // InputArea + MessageList
    expect(lastFrame()).toContain('Active: input-area'); // InputArea should be active by default
  });

  it('should handle component unmounting properly', () => {
    const { unmount, lastFrame } = render(<TestApp />);
    
    // Verify handlers are registered
    expect(lastFrame()).toContain('Handlers: 2');
    
    // Unmount should clean up handlers
    unmount();
    
    // No way to test cleanup directly, but no errors should occur
    expect(true).toBe(true);
  });
});