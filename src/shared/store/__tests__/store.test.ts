/**
 * @fileoverview Tests for Zustand store
 * @module shared/store/__tests__/store.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../index.js';

describe('AppStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
  });

  describe('Session Management', () => {
    it('should create a new session', () => {
      const store = useAppStore.getState();
      const session = store.createNewSession('gpt-4o');

      expect(session).toBeDefined();
      expect(session.model).toBe('gpt-4o');
      expect(session.messages).toHaveLength(0);
      expect(session.tokenCount.total).toBe(0);
    });

    it('should set and clear session', () => {
      const store = useAppStore.getState();
      const session = store.createNewSession('gpt-4o');

      // Need to get fresh state after createNewSession modifies it
      expect(useAppStore.getState().session).toEqual(session);

      store.setSession(null);
      expect(useAppStore.getState().session).toBeNull();
    });
  });

  describe('Message Management', () => {
    it('should add messages', () => {
      const store = useAppStore.getState();
      store.createNewSession('gpt-4o');

      const message = store.addMessage({
        role: 'user',
        content: 'Hello!',
      });

      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello!');
      expect(message.timestamp).toBeGreaterThan(0);

      expect(useAppStore.getState().messages).toHaveLength(1);
    });

    it('should update messages', () => {
      const store = useAppStore.getState();
      store.createNewSession('gpt-4o');

      const message = store.addMessage({
        role: 'assistant',
        content: 'Hello',
      });

      store.updateMessage(message.id, { content: 'Updated content' });

      const updatedMessages = useAppStore.getState().messages;
      expect(updatedMessages[0]?.content).toBe('Updated content');
    });

    it('should delete messages', () => {
      const store = useAppStore.getState();
      store.createNewSession('gpt-4o');

      const message = store.addMessage({
        role: 'user',
        content: 'To delete',
      });

      expect(useAppStore.getState().messages).toHaveLength(1);

      store.deleteMessage(message.id);

      expect(useAppStore.getState().messages).toHaveLength(0);
    });

    it('should clear all messages', () => {
      const store = useAppStore.getState();
      store.createNewSession('gpt-4o');

      store.addMessage({ role: 'user', content: 'Message 1' });
      store.addMessage({ role: 'assistant', content: 'Message 2' });

      expect(useAppStore.getState().messages).toHaveLength(2);

      store.clearMessages();

      expect(useAppStore.getState().messages).toHaveLength(0);
    });
  });

  describe('Streaming State', () => {
    it('should toggle streaming state', () => {
      const store = useAppStore.getState();

      expect(store.isStreaming).toBe(false);

      store.setStreaming(true);
      expect(useAppStore.getState().isStreaming).toBe(true);

      store.setStreaming(false);
      expect(useAppStore.getState().isStreaming).toBe(false);
    });

    it('should append and clear streaming text', () => {
      const store = useAppStore.getState();

      store.appendStreamingText('Hello');
      expect(useAppStore.getState().streamingText).toBe('Hello');

      store.appendStreamingText(' World');
      expect(useAppStore.getState().streamingText).toBe('Hello World');

      store.clearStreamingText();
      expect(useAppStore.getState().streamingText).toBe('');
    });
  });

  describe('Context Files', () => {
    it('should add and remove context files', () => {
      const store = useAppStore.getState();
      store.createNewSession('gpt-4o');

      store.addContextFile('/src/file.ts', 'const x = 1;');

      expect(useAppStore.getState().contextFiles.size).toBe(1);
      expect(useAppStore.getState().contextFiles.get('/src/file.ts')).toBe('const x = 1;');

      store.removeContextFile('/src/file.ts');
      expect(useAppStore.getState().contextFiles.size).toBe(0);
    });

    it('should track files accessed in session', () => {
      const store = useAppStore.getState();
      store.createNewSession('gpt-4o');

      store.addContextFile('/src/a.ts', 'a');
      store.addContextFile('/src/b.ts', 'b');

      const session = useAppStore.getState().session;
      expect(session?.filesAccessed).toContain('/src/a.ts');
      expect(session?.filesAccessed).toContain('/src/b.ts');
    });
  });

  describe('Error State', () => {
    it('should set and clear errors', () => {
      const store = useAppStore.getState();

      store.setError('Something went wrong');
      expect(useAppStore.getState().error).toBe('Something went wrong');

      store.setError(null);
      expect(useAppStore.getState().error).toBeNull();
    });
  });

  describe('Reset', () => {
    it('should reset all state', () => {
      const store = useAppStore.getState();
      store.createNewSession('gpt-4o');
      store.addMessage({ role: 'user', content: 'Test' });
      store.addContextFile('/file.ts', 'content');
      store.setError('error');

      store.reset();

      const newState = useAppStore.getState();
      expect(newState.session).toBeNull();
      expect(newState.messages).toHaveLength(0);
      expect(newState.contextFiles.size).toBe(0);
      expect(newState.error).toBeNull();
    });
  });
});
