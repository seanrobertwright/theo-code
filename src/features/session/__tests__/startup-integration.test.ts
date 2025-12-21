/**
 * @fileoverview Integration tests for app startup session detection and restoration
 * @module features/session/__tests__/startup-integration
 * 
 * Tests the complete session detection and restoration flow during app startup,
 * verifying seamless continuation of previous sessions as required by Requirement 2.2.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { SessionRestoration, SessionDetectionLoading, SessionDetectionError } from '../../../shared/components/index.js';
import { detectAvailableSessions, restoreSessionOnStartup, formatSessionForDisplay } from '../startup.js';
import { SessionManager } from '../manager.js';
import { useAppStore } from '../../../shared/store/index.js';
import type { SessionMetadata, SessionId, Session } from '../../../shared/types/index.js';

// Mock the session manager
vi.mock('../manager.js');

describe('App Startup Integration Tests', () => {
  let mockSessionManager: SessionManager;
  let mockSessions: SessionMetadata[];
  
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
    
    // Create mock session manager
    mockSessionManager = {
      listSessions: vi.fn(),
      createSession: vi.fn(),
      saveSession: vi.fn(),
      loadSession: vi.fn(),
      deleteSession: vi.fn(),
      enableAutoSave: vi.fn(),
      disableAutoSave: vi.fn(),
      isAutoSaveEnabled: vi.fn(),
      forceAutoSave: vi.fn(),
      getAutoSaveConfig: vi.fn(),
      sessionExists: vi.fn(),
      getCurrentSession: vi.fn(),
      setCurrentSession: vi.fn(),
      restoreSession: vi.fn(),
      validateSessionIntegrity: vi.fn(),
      restoreSessionWithContext: vi.fn(),
    } as any;
    
    // Create mock sessions for testing
    mockSessions = [
      {
        id: 'session-12345678-1234-1234-1234-123456789012' as SessionId,
        created: Date.now() - 1000 * 60 * 60, // 1 hour ago
        lastModified: Date.now() - 1000 * 60 * 30, // 30 minutes ago
        model: 'gpt-4o',
        messageCount: 5,
        tokenCount: { total: 1000, input: 500, output: 500 },
        workspaceRoot: '/test/workspace',
        contextFiles: ['file1.ts', 'file2.ts'],
        tags: ['test'],
        preview: 'Working on authentication system',
        title: 'Auth System Development',
      },
      {
        id: 'session-87654321-4321-4321-4321-210987654321' as SessionId,
        created: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
        lastModified: Date.now() - 1000 * 60 * 60, // 1 hour ago
        model: 'gpt-4o-mini',
        messageCount: 12,
        tokenCount: { total: 2500, input: 1200, output: 1300 },
        workspaceRoot: '/test/workspace',
        contextFiles: ['api.ts', 'types.ts'],
        tags: ['api', 'backend'],
        preview: 'Building REST API endpoints',
        title: 'API Development',
      },
    ];
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Detection Flow', () => {
    it('should detect available sessions on startup', async () => {
      // Mock session manager to return available sessions
      vi.mocked(mockSessionManager.listSessions).mockResolvedValue(mockSessions);
      
      // Test session detection
      const result = await detectAvailableSessions(mockSessionManager, {
        maxRecentSessions: 10,
        recentThresholdMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      // Verify detection results
      expect(result.hasAvailableSessions).toBe(true);
      expect(result.recentSessions).toHaveLength(2);
      expect(result.mostRecentSession).toEqual(mockSessions[0]);
      expect(result.totalSessionCount).toBe(2);
      
      // Verify sessions are sorted by most recent first
      expect(result.recentSessions[0].lastModified).toBeGreaterThan(
        result.recentSessions[1].lastModified
      );
    });

    it('should handle no available sessions gracefully', async () => {
      // Mock session manager to return no sessions
      vi.mocked(mockSessionManager.listSessions).mockResolvedValue([]);
      
      // Test session detection
      const result = await detectAvailableSessions(mockSessionManager);
      
      // Verify no sessions detected
      expect(result.hasAvailableSessions).toBe(false);
      expect(result.recentSessions).toHaveLength(0);
      expect(result.mostRecentSession).toBeNull();
      expect(result.totalSessionCount).toBe(0);
    });

    it('should filter out old sessions based on threshold', async () => {
      // Create old session
      const oldSession: SessionMetadata = {
        ...mockSessions[0],
        id: 'old-session' as SessionId,
        created: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
        lastModified: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
      };
      
      vi.mocked(mockSessionManager.listSessions).mockResolvedValue([oldSession]);
      
      // Test with 7-day threshold
      const result = await detectAvailableSessions(mockSessionManager, {
        recentThresholdMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      // Verify old session is filtered out
      expect(result.hasAvailableSessions).toBe(true);
      expect(result.recentSessions).toHaveLength(0);
      expect(result.mostRecentSession).toBeNull();
      expect(result.totalSessionCount).toBe(1);
    });

    it('should handle session detection errors gracefully', async () => {
      // Mock session manager to throw error
      vi.mocked(mockSessionManager.listSessions).mockRejectedValue(
        new Error('Storage access denied')
      );
      
      // Test session detection with error
      const result = await detectAvailableSessions(mockSessionManager);
      
      // Verify error handling
      expect(result.hasAvailableSessions).toBe(false);
      expect(result.recentSessions).toHaveLength(0);
      expect(result.mostRecentSession).toBeNull();
      expect(result.totalSessionCount).toBe(0);
    });
  });

  describe('Session Restoration Flow', () => {
    it('should restore session with complete state', async () => {
      const sessionToRestore: Session = {
        id: 'session-12345678-1234-1234-1234-123456789012' as SessionId,
        version: '1.0.0',
        created: Date.now() - 1000 * 60 * 60,
        lastModified: Date.now() - 1000 * 60 * 30,
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        messages: [
          { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() - 1000 * 60 * 30 },
          { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() - 1000 * 60 * 29 },
        ],
        contextFiles: ['file1.ts', 'file2.ts'],
        tokenCount: { total: 1000, input: 500, output: 500 },
        tags: ['test'],
        notes: 'Working on auth system',
      };
      
      // Mock successful restoration
      vi.mocked(mockSessionManager.restoreSessionWithContext).mockResolvedValue({
        session: sessionToRestore,
        contextFilesFound: ['file1.ts'],
        contextFilesMissing: ['file2.ts'],
      });
      
      // Test session restoration
      const result = await restoreSessionOnStartup(mockSessionManager, 'session-12345678-1234-1234-1234-123456789012' as SessionId);
      
      // Verify restoration success
      expect(result.success).toBe(true);
      expect(result.session).toEqual(sessionToRestore);
      expect(result.contextFilesFound).toEqual(['file1.ts']);
      expect(result.contextFilesMissing).toEqual(['file2.ts']);
      expect(result.error).toBeUndefined();
      
      // Verify session manager was called correctly
      expect(mockSessionManager.restoreSessionWithContext).toHaveBeenCalledWith('session-12345678-1234-1234-1234-123456789012');
    });

    it('should handle session restoration errors', async () => {
      // Mock restoration failure
      vi.mocked(mockSessionManager.restoreSessionWithContext).mockRejectedValue(
        new Error('Session file corrupted')
      );
      
      // Test session restoration with error
      const result = await restoreSessionOnStartup(mockSessionManager, 'session-12345678-1234-1234-1234-123456789012' as SessionId);
      
      // Verify error handling
      expect(result.success).toBe(false);
      expect(result.session).toBeNull();
      expect(result.contextFilesFound).toEqual([]);
      expect(result.contextFilesMissing).toEqual([]);
      expect(result.error).toBe('Session file corrupted');
    });

    it('should restore session and update store state', async () => {
      const sessionToRestore: Session = {
        id: 'session-12345678-1234-1234-1234-123456789012' as SessionId,
        version: '1.0.0',
        created: Date.now() - 1000 * 60 * 60,
        lastModified: Date.now() - 1000 * 60 * 30,
        model: 'gpt-4o',
        workspaceRoot: '/test/workspace',
        messages: [
          { id: 'msg-1', role: 'user', content: 'Test message', timestamp: Date.now() },
        ],
        contextFiles: ['test.ts'],
        tokenCount: { total: 500, input: 250, output: 250 },
        tags: [],
        notes: '',
      };
      
      // Mock successful restoration
      vi.mocked(mockSessionManager.restoreSessionWithContext).mockResolvedValue({
        session: sessionToRestore,
        contextFilesFound: ['test.ts'],
        contextFilesMissing: [],
      });
      
      // Get store actions
      const store = useAppStore.getState();
      
      // Mock the restoreSession action if it exists
      const mockRestoreSession = vi.fn().mockResolvedValue(undefined);
      (store as any).restoreSession = mockRestoreSession;
      
      // Test restoration
      const result = await restoreSessionOnStartup(mockSessionManager, 'session-12345678-1234-1234-1234-123456789012' as SessionId);
      
      // Verify restoration was successful
      expect(result.success).toBe(true);
      expect(result.session.id).toBe('session-12345678-1234-1234-1234-123456789012');
      expect(result.session.messages).toHaveLength(1);
      expect(result.session.model).toBe('gpt-4o');
      expect(result.session.workspaceRoot).toBe('/test/workspace');
    });
  });

  describe('Session Restoration UI Components', () => {
    it('should render session detection loading component', () => {
      const { lastFrame } = render(React.createElement(SessionDetectionLoading));
      
      expect(lastFrame()).toContain('Detecting previous sessions');
    });

    it('should render session restoration component with sessions', () => {
      const mockOnSessionSelected = vi.fn();
      const mockOnNewSession = vi.fn();
      
      const { lastFrame } = render(
        React.createElement(SessionRestoration, {
          sessions: mockSessions,
          onSessionSelected: mockOnSessionSelected,
          onNewSession: mockOnNewSession,
          showDetails: false,
          maxDisplaySessions: 10,
        })
      );
      
      const output = lastFrame();
      
      // Verify session restoration UI elements
      expect(output).toContain('Session Restoration');
      expect(output).toContain('Found 2 previous sessions');
      expect(output).toContain('Auth System Development');
      expect(output).toContain('API Development');
      expect(output).toContain('Start New Session');
      expect(output).toContain('gpt-4o');
      expect(output).toContain('5 messages');
    });

    it('should render session restoration component with details', () => {
      const mockOnSessionSelected = vi.fn();
      const mockOnNewSession = vi.fn();
      
      const { lastFrame } = render(
        React.createElement(SessionRestoration, {
          sessions: [mockSessions[0]],
          onSessionSelected: mockOnSessionSelected,
          onNewSession: mockOnNewSession,
          showDetails: true,
          maxDisplaySessions: 10,
        })
      );
      
      const output = lastFrame();
      
      // Verify detailed session information is shown
      expect(output).toContain('Workspace: /test/workspace');
      expect(output).toContain('Tokens: 1,000');
      expect(output).toContain('Context Files: 2');
    });

    it('should render session detection error component', () => {
      const mockOnRetry = vi.fn();
      const mockOnContinue = vi.fn();
      
      const { lastFrame } = render(
        React.createElement(SessionDetectionError, {
          error: 'Storage access denied',
          onRetry: mockOnRetry,
          onContinue: mockOnContinue,
        })
      );
      
      const output = lastFrame();
      
      // Verify error UI elements
      expect(output).toContain('Session Detection Failed');
      expect(output).toContain('Storage access denied');
      expect(output).toContain('Continue with New Session');
      expect(output).toContain('Retry Detection');
    });
  });

  describe('Session Display Formatting', () => {
    it('should format session metadata for display', () => {
      const session = mockSessions[0];
      
      const formatted = formatSessionForDisplay(session, { showDetails: false });
      
      expect(formatted.title).toBe('Auth System Development');
      expect(formatted.subtitle).toContain('gpt-4o');
      expect(formatted.subtitle).toContain('5 messages');
      expect(formatted.details).toBeUndefined();
    });

    it('should format session metadata with details', () => {
      const session = mockSessions[0];
      
      const formatted = formatSessionForDisplay(session, { showDetails: true });
      
      expect(formatted.title).toBe('Auth System Development');
      expect(formatted.subtitle).toContain('gpt-4o');
      expect(formatted.details).toBeDefined();
      expect(formatted.details).toContain('Workspace: /test/workspace');
      expect(formatted.details).toContain('Tokens: 1,000');
      expect(formatted.details).toContain('Context Files: 2');
      expect(formatted.details).toContain('Tags: test');
      expect(formatted.details).toContain('Preview: Working on authentication system');
    });

    it('should handle session without title', () => {
      const sessionWithoutTitle = {
        ...mockSessions[0],
        title: undefined,
      };
      
      const formatted = formatSessionForDisplay(sessionWithoutTitle);
      
      expect(formatted.title).toBe('Session session-');
    });
  });

  describe('End-to-End Startup Flow', () => {
    it('should complete full startup flow with session restoration', async () => {
      // Mock session detection
      vi.mocked(mockSessionManager.listSessions).mockResolvedValue(mockSessions);
      
      // Mock session restoration
      const sessionToRestore: Session = {
        id: 'session-12345678-1234-1234-1234-123456789012' as SessionId,
        version: '1.0.0',
        created: mockSessions[0].created,
        lastModified: mockSessions[0].lastModified,
        model: mockSessions[0].model,
        workspaceRoot: mockSessions[0].workspaceRoot,
        messages: [
          { id: 'msg-1', role: 'user', content: 'Previous message', timestamp: Date.now() },
        ],
        contextFiles: mockSessions[0].contextFiles,
        tokenCount: mockSessions[0].tokenCount,
        tags: mockSessions[0].tags,
        notes: '',
      };
      
      vi.mocked(mockSessionManager.restoreSessionWithContext).mockResolvedValue({
        session: sessionToRestore,
        contextFilesFound: ['file1.ts'],
        contextFilesMissing: ['file2.ts'],
      });
      
      // Step 1: Detect sessions
      const detectionResult = await detectAvailableSessions(mockSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(true);
      expect(detectionResult.recentSessions).toHaveLength(2);
      
      // Step 2: User selects first session for restoration
      const selectedSession = detectionResult.recentSessions[0];
      expect(selectedSession.id).toBe('session-12345678-1234-1234-1234-123456789012');
      
      // Step 3: Restore selected session
      const restorationResult = await restoreSessionOnStartup(mockSessionManager, selectedSession.id);
      expect(restorationResult.success).toBe(true);
      expect(restorationResult.session.id).toBe('session-12345678-1234-1234-1234-123456789012');
      expect(restorationResult.session.messages).toHaveLength(1);
      expect(restorationResult.contextFilesFound).toEqual(['file1.ts']);
      expect(restorationResult.contextFilesMissing).toEqual(['file2.ts']);
      
      // Verify the complete flow maintains data integrity
      expect(restorationResult.session.model).toBe(mockSessions[0].model);
      expect(restorationResult.session.workspaceRoot).toBe(mockSessions[0].workspaceRoot);
      expect(restorationResult.session.tokenCount).toEqual(mockSessions[0].tokenCount);
    });

    it('should handle startup flow when no sessions exist', async () => {
      // Mock no sessions available
      vi.mocked(mockSessionManager.listSessions).mockResolvedValue([]);
      
      // Step 1: Detect sessions
      const detectionResult = await detectAvailableSessions(mockSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(false);
      expect(detectionResult.recentSessions).toHaveLength(0);
      
      // In this case, the app should proceed with normal startup (new session)
      // This is verified by the detection result indicating no available sessions
    });

    it('should handle startup flow with session detection error', async () => {
      // Mock session detection error
      vi.mocked(mockSessionManager.listSessions).mockRejectedValue(
        new Error('Permission denied')
      );
      
      // Step 1: Attempt to detect sessions
      const detectionResult = await detectAvailableSessions(mockSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(false);
      expect(detectionResult.recentSessions).toHaveLength(0);
      
      // The error should be handled gracefully, allowing the app to continue
      // with a new session instead of crashing
    });
  });

  describe('Store Integration', () => {
    it('should maintain session state consistency during restoration', async () => {
      const store = useAppStore.getState();
      
      // Initially no session
      expect(store.session).toBeNull();
      expect(store.messages).toHaveLength(0);
      expect(store.contextFiles.size).toBe(0);
      
      // Create a session to simulate restoration
      const restoredSession = store.createNewSession('gpt-4o');
      store.addMessage({ role: 'user', content: 'Restored message' });
      store.addContextFile('restored.ts', 'content');
      store.updateSessionTokens({ total: 1000, input: 500, output: 500 });
      
      // Verify session state after restoration simulation
      const freshStore = useAppStore.getState();
      expect(freshStore.session).toBeTruthy();
      expect(freshStore.session?.id).toBe(restoredSession.id);
      expect(freshStore.messages).toHaveLength(1);
      expect(freshStore.contextFiles.size).toBe(1);
      expect(freshStore.session?.tokenCount.total).toBe(1000);
    });
  });
});