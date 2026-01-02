/**
 * @fileoverview Test for MessageList useInput handler stability
 * @module shared/components/Layout/__tests__/MessageList-handler-stability
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { MessageList } from '../MessageList.js';
import type { Message } from '../../../types/index.js';

// Mock useInput to track handler registration
const mockUseInput = vi.fn();
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useInput: mockUseInput,
  };
});

describe('MessageList useInput Handler Stability', () => {
  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Test message',
      timestamp: Date.now(),
    },
  ];

  beforeEach(() => {
    mockUseInput.mockClear();
  });

  it('should not re-register handler on every render', () => {
    const onScrollChange = vi.fn();
    
    const { rerender } = render(
      <MessageList
        messages={mockMessages}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
        scrollPosition={0}
        onScrollChange={onScrollChange}
      />
    );

    // Handler should be registered once
    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const firstHandler = mockUseInput.mock.calls[0][0];

    // Re-render with same props
    rerender(
      <MessageList
        messages={mockMessages}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
        scrollPosition={0}
        onScrollChange={onScrollChange}
      />
    );

    // Handler should still be registered only once (useCallback should prevent re-registration)
    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // The handler function reference should be the same (stable)
    expect(firstHandler).toBe(secondHandler);
  });

  it('should re-register handler only when dependencies change', () => {
    const onScrollChange1 = vi.fn();
    const onScrollChange2 = vi.fn();
    
    const { rerender } = render(
      <MessageList
        messages={mockMessages}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
        scrollPosition={0}
        onScrollChange={onScrollChange1}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(1);
    const firstHandler = mockUseInput.mock.calls[0][0];

    // Re-render with different onScrollChange (dependency change)
    rerender(
      <MessageList
        messages={mockMessages}
        streamingText=""
        isStreaming={false}
        width={80}
        height={20}
        scrollPosition={0}
        onScrollChange={onScrollChange2}
      />
    );

    expect(mockUseInput).toHaveBeenCalledTimes(2);
    const secondHandler = mockUseInput.mock.calls[1][0];
    
    // Handler should be different when dependencies change
    expect(firstHandler).not.toBe(secondHandler);
  });
});