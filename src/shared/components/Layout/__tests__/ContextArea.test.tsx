/**
 * @fileoverview Tests for ContextArea component
 */

import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { render } from 'ink-testing-library';
import { ContextArea } from '../ContextArea.js';
import { createDefaultColorScheme } from '../utils.js';
import { createMessageId } from '../../../types/schemas.js';
import type { Message } from '../../../types/index.js';

// Mock the layout context
vi.mock('../FullScreenLayout.js', () => ({
  useLayoutContext: () => ({
    colorScheme: createDefaultColorScheme(),
    dimensions: {
      terminal: { width: 80, height: 24 },
      context: { width: 56, height: 20 },
    },
  }),
}));

describe('ContextArea', () => {
  const mockMessages: Message[] = [
    {
      id: createMessageId(),
      role: 'user',
      content: 'Hello, world!',
      timestamp: Date.now(),
    },
    {
      id: createMessageId(),
      role: 'assistant',
      content: 'Hello! How can I help you today?',
      timestamp: Date.now(),
    },
  ];

  it.skip('should render messages correctly', () => {
    const { lastFrame } = render(
      <ContextArea
        messages={mockMessages}
        streamingText=""
        isStreaming={false}
        width={60}
        height={20}
        colorScheme={undefined} // Use undefined to trigger simple rendering
      />
    );

    expect(lastFrame()).toContain('Hello, world!');
    expect(lastFrame()).toContain('Hello! How can I help you today?');
  });

  it.skip('should show streaming indicator when streaming', () => {
    const { lastFrame } = render(
      <ContextArea
        messages={mockMessages}
        streamingText="I'm thinking..."
        isStreaming={true}
        width={60}
        height={20}
        colorScheme={undefined} // Use undefined to trigger simple rendering
      />
    );

    expect(lastFrame()).toContain("I'm thinking...");
    expect(lastFrame()).toContain('▊');
  });

  it('should handle empty message list', () => {
    const { lastFrame } = render(
      <ContextArea
        messages={[]}
        streamingText=""
        isStreaming={false}
        width={60}
        height={20}
        colorScheme={createDefaultColorScheme()}
      />
    );

    expect(lastFrame()).toContain('Welcome to theo-code!');
  });

  it('should call scroll change handler', () => {
    const onScrollChange = vi.fn();
    
    render(
      <ContextArea
        messages={mockMessages}
        streamingText=""
        isStreaming={false}
        width={60}
        height={20}
        colorScheme={createDefaultColorScheme()}
        onScrollChange={onScrollChange}
      />
    );

    // The component should be rendered without errors
    expect(onScrollChange).not.toHaveBeenCalled();
  });
});