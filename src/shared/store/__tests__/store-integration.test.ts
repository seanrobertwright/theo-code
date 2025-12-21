/**
 * @fileoverview Unit tests for store session persistence integration
 * @module shared/store/__tests__/store-integration.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../index.js';

describe('Store Session Integration - Unit Tests', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
  });

  afterEach(() => {
    // Clean up any auto-save timers
    useAppStore.getState().disableAutoSave();
  });

  describe('Basic Integration', () => {
    it('should create session and sync with SessionManager', () => {
      const store = useAppStore.getState();
      const sessionManager = store.getSessionManager();
      
      // Initially no session
      expect(store.session).toBeNull();
      expect(sessionManager.getCurrentSession()).toBeNull();
      
      // Create session
      const session = store.createNewSession('gpt-4o');
      
      // Debug: log the actual state
      console.log('Created session:', session);
      console.log('Store session:', store.session);
      console.log('Fresh store session:', useAppStore.getState().session);
      
      // Verify store state - need to get fresh state
      const freshStore = useAppStore.getState();
      expect(freshStore.session).toBeTruthy();
      expect(freshStore.session?.id).toBe(session.id);
      expect(freshStore.session?.model).toBe('gpt-4o');
      
      // Verify SessionManager sync
      const managerSession = sessionManager.getCurrentSession();
      expect(managerSession).toBeTruthy();
      expect(managerSession?.id).toBe(session.id);
      expect(managerSession?.model).toBe('gpt-4o');
    });

    it('should maintain session ID consistency during updates', () => {
      const store = useAppStore.getState();
      const sessionManager = store.getSessionManager();
      
      // Create session
      const session = store.createNewSession('gpt-4o');
      const originalId = session.id;
      
      // Add message
      store.addMessage({
        role: 'user',
        content: 'Test message',
      });
      
      // Get fresh state to verify session ID hasn't changed
      let freshStore = useAppStore.getState();
      expect(freshStore.session?.id).toBe(originalId);
      expect(sessionManager.getCurrentSession()?.id).toBe(originalId);
      
      // Update tokens
      store.updateSessionTokens({
        total: 100,
        input: 50,
        output: 50,
      });
      
      // Get fresh state to verify session ID still hasn't changed
      freshStore = useAppStore.getState();
      expect(freshStore.session?.id).toBe(originalId);
      expect(sessionManager.getCurrentSession()?.id).toBe(originalId);
      
      // Add context file
      store.addContextFile('test.ts', 'test content');
      
      // Get fresh state to verify session ID still hasn't changed
      freshStore = useAppStore.getState();
      expect(freshStore.session?.id).toBe(originalId);
      expect(sessionManager.getCurrentSession()?.id).toBe(originalId);
    });

    it('should sync session data between store and manager', () => {
      const store = useAppStore.getState();
      const sessionManager = store.getSessionManager();
      
      // Create session
      store.createNewSession('gpt-4o');
      
      // Add message
      store.addMessage({
        role: 'user',
        content: 'Hello',
      });
      
      // Get fresh state to verify both store and manager have the message
      let freshStore = useAppStore.getState();
      expect(freshStore.messages).toHaveLength(1);
      expect(freshStore.session?.messages).toHaveLength(1);
      expect(sessionManager.getCurrentSession()?.messages).toHaveLength(1);
      
      // Add context file
      store.addContextFile('test.ts', 'content');
      
      // Get fresh state to verify both store and manager have the context file
      freshStore = useAppStore.getState();
      expect(freshStore.contextFiles.size).toBe(1);
      expect(freshStore.session?.contextFiles).toHaveLength(1);
      expect(sessionManager.getCurrentSession()?.contextFiles).toHaveLength(1);
      
      // Update tokens
      store.updateSessionTokens({ total: 100 });
      
      // Get fresh state to verify both store and manager have updated tokens
      freshStore = useAppStore.getState();
      expect(freshStore.session?.tokenCount.total).toBe(100);
      expect(sessionManager.getCurrentSession()?.tokenCount.total).toBe(100);
    });

    it('should handle session reset properly', () => {
      const store = useAppStore.getState();
      const sessionManager = store.getSessionManager();
      
      // Create session with data
      store.createNewSession('gpt-4o');
      store.addMessage({ role: 'user', content: 'Test' });
      store.addContextFile('test.ts', 'content');
      
      // Get fresh state to verify data exists
      let freshStore = useAppStore.getState();
      expect(freshStore.session).toBeTruthy();
      expect(freshStore.messages).toHaveLength(1);
      expect(freshStore.contextFiles.size).toBe(1);
      expect(sessionManager.getCurrentSession()).toBeTruthy();
      
      // Reset
      store.reset();
      
      // Get fresh state to verify everything is cleared
      freshStore = useAppStore.getState();
      expect(freshStore.session).toBeNull();
      expect(freshStore.messages).toHaveLength(0);
      expect(freshStore.contextFiles.size).toBe(0);
      expect(sessionManager.getCurrentSession()).toBeNull();
    });
  });

  describe('Auto-save Integration', () => {
    it('should enable and disable auto-save', () => {
      const store = useAppStore.getState();
      
      // Initially auto-save might not be enabled (depends on config)
      // Let's test the enable/disable functionality
      
      // Enable auto-save
      store.enableAutoSave(5000);
      expect(store.isAutoSaveEnabled()).toBe(true);
      
      // Disable auto-save
      store.disableAutoSave();
      expect(store.isAutoSaveEnabled()).toBe(false);
      
      // Enable again with different interval
      store.enableAutoSave(10000);
      expect(store.isAutoSaveEnabled()).toBe(true);
    });
  });
});