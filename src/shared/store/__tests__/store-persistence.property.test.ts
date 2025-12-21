/**
 * @fileoverview Property-based tests for store session persistence integration
 * @module shared/store/__tests__/store-persistence.property.test
 *
 * Tests the integration between Zustand store and SessionManager for:
 * - Crash recovery data preservation
 * - Session state synchronization
 * - Auto-save functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { useAppStore } from '../index.js';
import type { Session, Message } from '../../types/index.js';
import { createSessionId, createMessageId } from '../../types/index.js';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Store Session Persistence - Property Tests', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any auto-save timers
    useAppStore.getState().disableAutoSave();
  });

  // -------------------------------------------------------------------------
  // Property 3: Crash recovery data preservation
  // -------------------------------------------------------------------------

  describe('Property 3: Crash recovery data preservation', () => {
    /**
     * **Feature: session-persistence, Property 3: Crash recovery data preservation**
     * **Validates: Requirements 1.3**
     * 
     * For any unexpected termination, all session data up to the last auto-save point 
     * should be preserved and recoverable
     */
    it('should preserve session data through simulated crash scenarios', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate test data for crash recovery scenarios
          fc.record({
            model: fc.constantFrom('gpt-4o', 'gpt-4', 'claude-3-opus'),
            messageCount: fc.integer({ min: 1, max: 3 }), // Reduced for faster testing
            contextFileCount: fc.integer({ min: 0, max: 2 }), // Reduced for faster testing
            tokenUpdates: fc.integer({ min: 0, max: 1 }), // Reduced for faster testing
          }),
          async (testData) => {
            const store = useAppStore.getState();
            const sessionManager = store.getSessionManager();
            
            // Create a session with test data
            const session = store.createNewSession(testData.model);
            const sessionId = session.id;
            
            // Track what data we add for verification
            const addedMessages: Message[] = [];
            const addedContextFiles: string[] = [];
            let finalTokenCount = { total: 0, input: 0, output: 0 };
            
            // Add messages
            for (let i = 0; i < testData.messageCount; i++) {
              const message = store.addMessage({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Test message ${i + 1}`,
              });
              addedMessages.push(message);
            }
            
            // Add context files
            for (let i = 0; i < testData.contextFileCount; i++) {
              const filePath = `test-file-${i + 1}.ts`;
              const content = `// Test file ${i + 1} content`;
              store.addContextFile(filePath, content);
              addedContextFiles.push(filePath);
            }
            
            // Update tokens
            for (let i = 0; i < testData.tokenUpdates; i++) {
              finalTokenCount = {
                total: (i + 1) * 100,
                input: (i + 1) * 40,
                output: (i + 1) * 60,
              };
              store.updateSessionTokens(finalTokenCount);
            }
            
            // Force save to ensure all data is persisted before crash
            await store.saveCurrentSession();
            
            // Get the state before "crash"
            const precrashStore = useAppStore.getState();
            const precrashSession = precrashStore.session;
            
            // Verify we have data before crash
            expect(precrashSession).toBeTruthy();
            expect(precrashSession?.id).toBe(sessionId);
            
            // Simulate crash by clearing store state (but not persisted data)
            store.reset();
            
            // Verify crash simulation worked
            const postCrashStore = useAppStore.getState();
            expect(postCrashStore.session).toBeNull();
            expect(postCrashStore.messages).toHaveLength(0);
            expect(postCrashStore.contextFiles.size).toBe(0);
            
            // Simulate recovery by loading the session from storage
            const recoveredSession = await sessionManager.loadSession(sessionId);
            
            // Verify crash recovery preserved all data
            expect(recoveredSession).toBeTruthy();
            expect(recoveredSession.id).toBe(sessionId);
            expect(recoveredSession.model).toBe(testData.model);
            
            // Verify messages were preserved
            expect(recoveredSession.messages).toHaveLength(addedMessages.length);
            for (let i = 0; i < addedMessages.length; i++) {
              expect(recoveredSession.messages[i]?.content).toBe(addedMessages[i]?.content);
              expect(recoveredSession.messages[i]?.role).toBe(addedMessages[i]?.role);
            }
            
            // Verify context files were preserved
            expect(recoveredSession.contextFiles).toHaveLength(addedContextFiles.length);
            for (const filePath of addedContextFiles) {
              expect(recoveredSession.contextFiles).toContain(filePath);
            }
            
            // Verify token counts were preserved (if any updates were made)
            if (testData.tokenUpdates > 0) {
              expect(recoveredSession.tokenCount.total).toBe(finalTokenCount.total);
              expect(recoveredSession.tokenCount.input).toBe(finalTokenCount.input);
              expect(recoveredSession.tokenCount.output).toBe(finalTokenCount.output);
            }
            
            // Verify timestamps are consistent
            expect(recoveredSession.created).toBe(session.created);
            expect(recoveredSession.lastModified).toBeGreaterThanOrEqual(session.created);
            
            // Verify session can be restored to store state
            await store.loadSession(sessionId);
            const restoredStore = useAppStore.getState();
            
            expect(restoredStore.session?.id).toBe(sessionId);
            expect(restoredStore.messages).toHaveLength(addedMessages.length);
            expect(restoredStore.contextFiles.size).toBe(addedContextFiles.length);
            
            // Verify SessionManager is synchronized after recovery
            const finalManagerSession = sessionManager.getCurrentSession();
            expect(finalManagerSession?.id).toBe(sessionId);
            expect(finalManagerSession?.messages).toHaveLength(addedMessages.length);
            expect(finalManagerSession?.contextFiles).toHaveLength(addedContextFiles.length);
          }
        ),
        { numRuns: 20, timeout: 5000 } // Reduced runs and added timeout
      );
    }, 15000); // Increased test timeout

    it('should maintain session state consistency during operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate test data
          fc.record({
            model: fc.constantFrom('gpt-4o', 'gpt-4', 'claude-3-opus'),
            messageCount: fc.integer({ min: 0, max: 5 }),
            contextFileCount: fc.integer({ min: 0, max: 3 }),
          }),
          async (testData) => {
            const store = useAppStore.getState();
            
            // Create a session with test data
            const session = store.createNewSession(testData.model);
            
            // Add messages
            const addedMessages: Message[] = [];
            for (let i = 0; i < testData.messageCount; i++) {
              const message = store.addMessage({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Test message ${i + 1}`,
              });
              addedMessages.push(message);
            }
            
            // Add context files
            const contextFiles: string[] = [];
            for (let i = 0; i < testData.contextFileCount; i++) {
              const filePath = `test-file-${i + 1}.ts`;
              const content = `// Test file ${i + 1} content`;
              store.addContextFile(filePath, content);
              contextFiles.push(filePath);
            }
            
            // Get fresh state to verify consistency
            const freshStore = useAppStore.getState();
            const currentSession = freshStore.session;
            const currentMessages = freshStore.messages;
            const currentContextFiles = Array.from(freshStore.contextFiles.keys());
            
            // Verify state consistency
            expect(currentSession).toBeTruthy();
            expect(currentMessages).toHaveLength(testData.messageCount);
            expect(currentContextFiles).toHaveLength(testData.contextFileCount);
            
            if (currentSession) {
              // Verify session contains all messages
              expect(currentSession.messages).toHaveLength(testData.messageCount);
              expect(currentSession.contextFiles).toHaveLength(testData.contextFileCount);
              
              // Verify SessionManager is synchronized
              const sessionManager = store.getSessionManager();
              const managerSession = sessionManager.getCurrentSession();
              expect(managerSession?.id).toBe(currentSession.id);
              expect(managerSession?.messages).toHaveLength(testData.messageCount);
              expect(managerSession?.contextFiles).toHaveLength(testData.contextFileCount);
              
              // Verify data integrity
              for (let i = 0; i < testData.messageCount; i++) {
                expect(currentSession.messages[i]?.content).toBe(`Test message ${i + 1}`);
                expect(currentMessages[i]?.content).toBe(`Test message ${i + 1}`);
              }
              
              for (let i = 0; i < testData.contextFileCount; i++) {
                const expectedPath = `test-file-${i + 1}.ts`;
                expect(currentSession.contextFiles).toContain(expectedPath);
                expect(currentContextFiles).toContain(expectedPath);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle session operations without data loss', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            model: fc.constantFrom('gpt-4o', 'gpt-4'),
            operations: fc.array(
              fc.oneof(
                fc.constant('addMessage'),
                fc.constant('updateTokens'),
                fc.constant('addContextFile')
              ),
              { minLength: 1, maxLength: 5 }
            ),
          }),
          async (testData) => {
            const store = useAppStore.getState();
            const sessionManager = store.getSessionManager();
            
            // Create initial session
            const session = store.createNewSession(testData.model);
            const initialSessionId = session.id;
            
            // Perform operations and track state
            let messageCount = 0;
            let contextFileCount = 0;
            
            for (const operation of testData.operations) {
              switch (operation) {
                case 'addMessage':
                  store.addMessage({
                    role: 'user',
                    content: `Message ${messageCount + 1}`,
                  });
                  messageCount++;
                  break;
                  
                case 'updateTokens':
                  store.updateSessionTokens({
                    total: Math.floor(Math.random() * 1000),
                    input: Math.floor(Math.random() * 500),
                    output: Math.floor(Math.random() * 500),
                  });
                  break;
                  
                case 'addContextFile':
                  store.addContextFile(
                    `file-${contextFileCount + 1}.ts`,
                    'test content'
                  );
                  contextFileCount++;
                  break;
              }
              
              // Get fresh state to verify consistency after each operation
              const freshStore = useAppStore.getState();
              const currentSession = freshStore.session;
              const managerSession = sessionManager.getCurrentSession();
              
              expect(currentSession).toBeTruthy();
              expect(currentSession?.id).toBe(initialSessionId); // Session ID should never change
              expect(managerSession?.id).toBe(initialSessionId);
              
              // Verify counts match
              expect(freshStore.messages).toHaveLength(messageCount);
              expect(freshStore.contextFiles.size).toBe(contextFileCount);
              expect(currentSession?.messages).toHaveLength(messageCount);
              expect(currentSession?.contextFiles).toHaveLength(contextFileCount);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Additional Integration Properties
  // -------------------------------------------------------------------------

  describe('Session Manager Synchronization', () => {
    it('should keep SessionManager in sync with store state', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            model: fc.constantFrom('gpt-4o', 'claude-3-opus'),
            messageCount: fc.integer({ min: 1, max: 3 }),
            contextFileCount: fc.integer({ min: 1, max: 2 }),
          }),
          async (testData) => {
            const store = useAppStore.getState();
            const sessionManager = store.getSessionManager();
            
            // Create initial session
            const session = store.createNewSession(testData.model);
            const initialSessionId = session.id;
            
            // Verify initial sync
            expect(sessionManager.getCurrentSession()?.id).toBe(initialSessionId);
            
            // Add messages
            for (let i = 0; i < testData.messageCount; i++) {
              store.addMessage({
                role: 'user',
                content: `Test message ${i + 1}`,
              });
              
              // Get fresh state to verify sync after adding message
              const freshStore = useAppStore.getState();
              const currentStoreSession = freshStore.session;
              const currentManagerSession = sessionManager.getCurrentSession();
              
              expect(currentManagerSession?.id).toBe(currentStoreSession?.id);
              expect(currentManagerSession?.id).toBe(initialSessionId); // ID should never change
              expect(currentManagerSession?.messages).toHaveLength(i + 1);
            }
            
            // Add context files
            for (let i = 0; i < testData.contextFileCount; i++) {
              store.addContextFile(`file-${i + 1}.ts`, 'test content');
              
              // Get fresh state to verify sync after adding context file
              const freshStore = useAppStore.getState();
              const currentStoreSession = freshStore.session;
              const currentManagerSession = sessionManager.getCurrentSession();
              
              expect(currentManagerSession?.id).toBe(currentStoreSession?.id);
              expect(currentManagerSession?.id).toBe(initialSessionId); // ID should never change
              expect(currentManagerSession?.contextFiles).toHaveLength(i + 1);
            }
            
            // Update tokens
            store.updateSessionTokens({
              total: 100,
              input: 50,
              output: 50,
            });
            
            // Get fresh state to verify sync after token update
            const finalStore = useAppStore.getState();
            const finalStoreSession = finalStore.session;
            const finalManagerSession = sessionManager.getCurrentSession();
            
            expect(finalManagerSession?.id).toBe(finalStoreSession?.id);
            expect(finalManagerSession?.id).toBe(initialSessionId); // ID should never change
            expect(finalManagerSession?.tokenCount.total).toBe(100);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Auto-save Integration', () => {
    it('should respect auto-save configuration', async () => {
      const store = useAppStore.getState();
      const sessionManager = store.getSessionManager();
      
      // Test enabling auto-save
      store.enableAutoSave(5000); // 5 seconds
      expect(store.isAutoSaveEnabled()).toBe(true);
      expect(sessionManager.isAutoSaveEnabled()).toBe(true);
      
      // Test disabling auto-save
      store.disableAutoSave();
      expect(store.isAutoSaveEnabled()).toBe(false);
      expect(sessionManager.isAutoSaveEnabled()).toBe(false);
      
      // Test with different intervals
      const intervals = [1000, 10000, 30000];
      for (const interval of intervals) {
        store.enableAutoSave(interval);
        expect(store.isAutoSaveEnabled()).toBe(true);
        
        const config = sessionManager.getAutoSaveConfig();
        expect(config?.intervalMs).toBe(interval);
        expect(config?.enabled).toBe(true);
      }
    });
  });
});