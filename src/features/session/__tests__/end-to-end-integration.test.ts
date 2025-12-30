/**
 * @fileoverview End-to-end integration tests for session restoration robustness
 * @module features/session/__tests__/end-to-end-integration
 * 
 * Tests complete session restoration workflows, error recovery scenarios,
 * and cleanup operations as specified in task 14.1.
 * 
 * Requirements: All requirements from session-restoration-robustness spec
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Import components under test
import { App } from '../../../app.js';
import { SessionRestoration, SessionDetectionLoading, SessionDetectionError } from '../../../shared/components/index.js';
import { createSafeSessionManager, type ISafeSessionManager } from '../safe-session-manager.js';
import { SessionValidator } from '../validation.js';
import { ErrorRecoverySystem } from '../error-recovery.js';
import { detectAvailableSessions, restoreSessionOnStartup, performStartupInitialization } from '../startup.js';
import { useAppStore } from '../../../shared/store/index.js';
import type { SessionMetadata, SessionId, Session } from '../../../shared/types/index.js';
import type { MergedConfig } from '../../../config/index.js';

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Creates a temporary test workspace with session files.
 */
async function createTestWorkspace(): Promise<{
  workspaceRoot: string;
  sessionDataDir: string;
  cleanup: () => Promise<void>;
}> {
  const workspaceRoot = join(tmpdir(), `test-workspace-${randomUUID()}`);
  const sessionDataDir = join(workspaceRoot, 'session_data');
  
  await fs.mkdir(sessionDataDir, { recursive: true });
  
  const cleanup = async () => {
    try {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  };
  
  return { workspaceRoot, sessionDataDir, cleanup };
}

/**
 * Creates a test session file with optional corruption.
 */
async function createTestSession(
  sessionDataDir: string,
  sessionId: SessionId,
  options: {
    corrupt?: boolean;
    missing?: boolean;
    validStructure?: boolean;
  } = {}
): Promise<Session> {
  const session: Session = {
    id: sessionId,
    version: '1.0.0',
    created: Date.now() - 1000 * 60 * 60,
    lastModified: Date.now() - 1000 * 60 * 30,
    model: 'gpt-4o',
    workspaceRoot: '/test/workspace',
    messages: [
      { id: 'msg-1', role: 'user', content: 'Test message', timestamp: Date.now() },
      { id: 'msg-2', role: 'assistant', content: 'Test response', timestamp: Date.now() + 1000 },
    ],
    contextFiles: ['test.ts', 'types.ts'],
    tokenCount: { total: 1000, input: 500, output: 500 },
    tags: ['test'],
    notes: 'Test session for integration testing',
  };
  
  if (!options.missing) {
    const sessionPath = join(sessionDataDir, `${sessionId}.json`);
    
    if (options.corrupt) {
      // Write corrupted JSON
      await fs.writeFile(sessionPath, '{ invalid json content', 'utf-8');
    } else if (options.validStructure === false) {
      // Write valid JSON but invalid session structure
      await fs.writeFile(sessionPath, JSON.stringify({ invalid: 'structure' }), 'utf-8');
    } else {
      // Write valid session
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    }
  }
  
  return session;
}

/**
 * Creates a test session index with optional orphaned entries.
 */
async function createTestIndex(
  sessionDataDir: string,
  sessions: SessionMetadata[],
  options: {
    includeOrphanedEntries?: SessionId[];
    excludeValidSessions?: SessionId[];
  } = {}
): Promise<void> {
  const indexPath = join(sessionDataDir, 'index.json');
  
  // Start with provided sessions
  let indexSessions = [...sessions];
  
  // Add orphaned entries (sessions that don't have files)
  if (options.includeOrphanedEntries) {
    for (const orphanedId of options.includeOrphanedEntries) {
      indexSessions.push({
        id: orphanedId,
        created: Date.now() - 1000 * 60 * 60 * 2,
        lastModified: Date.now() - 1000 * 60 * 60,
        model: 'gpt-4o',
        messageCount: 3,
        tokenCount: { total: 750, input: 375, output: 375 },
        workspaceRoot: '/test/workspace',
        contextFiles: ['orphaned.ts'],
        tags: ['orphaned'],
        preview: 'This session file is missing',
        title: 'Orphaned Session',
      });
    }
  }
  
  // Remove sessions that should be excluded from index
  if (options.excludeValidSessions) {
    indexSessions = indexSessions.filter(s => !options.excludeValidSessions!.includes(s.id));
  }
  
  const indexData = {
    sessions: indexSessions,
    lastUpdated: Date.now(),
    version: '1.0.0',
  };
  
  await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
}

/**
 * Creates a mock config for testing.
 */
function createTestConfig(): MergedConfig {
  return {
    global: {
      defaultProvider: 'openai',
      openai: {
        apiKey: 'test-key',
      },
    },
    agentsInstructions: 'Test instructions',
  } as MergedConfig;
}

// =============================================================================
// END-TO-END INTEGRATION TESTS
// =============================================================================

describe('End-to-End Session Restoration Integration Tests', () => {
  let testWorkspace: Awaited<ReturnType<typeof createTestWorkspace>>;
  let safeSessionManager: ISafeSessionManager;
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(async () => {
    // Create test workspace
    testWorkspace = await createTestWorkspace();
    
    // Set up environment for session storage
    originalEnv = { ...process.env };
    process.env.SESSION_DATA_DIR = testWorkspace.sessionDataDir;
    
    // Create safe session manager
    safeSessionManager = createSafeSessionManager();
    
    // Reset app store
    useAppStore.getState().reset();
  });
  
  afterEach(async () => {
    // Restore environment
    process.env = originalEnv;
    
    // Cleanup test workspace
    await testWorkspace.cleanup();
    
    // Clear mocks
    vi.clearAllMocks();
  });

  describe('Complete Session Restoration Workflows', () => {
    it('should complete full startup flow with valid sessions', async () => {
      // Arrange: Create valid test sessions
      const sessionId1 = 'session-12345678-1234-1234-1234-123456789012' as SessionId;
      const sessionId2 = 'session-87654321-4321-4321-4321-210987654321' as SessionId;
      
      const session1 = await createTestSession(testWorkspace.sessionDataDir, sessionId1);
      const session2 = await createTestSession(testWorkspace.sessionDataDir, sessionId2);
      
      const sessionMetadata: SessionMetadata[] = [
        {
          id: sessionId1,
          created: session1.created,
          lastModified: session1.lastModified,
          model: session1.model,
          messageCount: session1.messages.length,
          tokenCount: session1.tokenCount,
          workspaceRoot: session1.workspaceRoot,
          contextFiles: session1.contextFiles,
          tags: session1.tags,
          preview: 'Test session 1',
          title: 'Test Session 1',
        },
        {
          id: sessionId2,
          created: session2.created,
          lastModified: session2.lastModified,
          model: session2.model,
          messageCount: session2.messages.length,
          tokenCount: session2.tokenCount,
          workspaceRoot: session2.workspaceRoot,
          contextFiles: session2.contextFiles,
          tags: session2.tags,
          preview: 'Test session 2',
          title: 'Test Session 2',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act & Assert: Test complete workflow
      
      // Step 1: Startup initialization
      const initResult = await performStartupInitialization(safeSessionManager);
      expect(initResult.success).toBe(true);
      expect(initResult.systemHealth.indexHealthy).toBe(true);
      expect(initResult.systemHealth.validSessions).toBe(2);
      expect(initResult.systemHealth.issuesResolved).toBe(0);
      
      // Step 2: Session detection
      const detectionResult = await detectAvailableSessions(safeSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(true);
      expect(detectionResult.recentSessions).toHaveLength(2);
      expect(detectionResult.totalSessionCount).toBe(2);
      expect(detectionResult.validationInfo?.invalidSessionsRemoved).toBe(0);
      expect(detectionResult.validationInfo?.cleanupPerformed).toBe(false);
      
      // Step 3: Session restoration
      const restorationResult = await restoreSessionOnStartup(safeSessionManager, sessionId1);
      expect(restorationResult.success).toBe(true);
      expect(restorationResult.session).toBeDefined();
      expect(restorationResult.session?.id).toBe(sessionId1);
      expect(restorationResult.session?.messages).toHaveLength(2);
      expect(restorationResult.contextFilesFound).toEqual(['test.ts', 'types.ts']);
      expect(restorationResult.contextFilesMissing).toHaveLength(0);
      expect(restorationResult.error).toBeUndefined();
      
      // Step 4: Verify session is set as current
      const currentSession = safeSessionManager.getCurrentSession();
      expect(currentSession).toBeDefined();
      expect(currentSession?.id).toBe(sessionId1);
    });

    it('should handle startup with mixed valid and invalid sessions', async () => {
      // Arrange: Create mix of valid, corrupted, and missing sessions
      const validSessionId = 'valid-session-1234-1234-1234-123456789012' as SessionId;
      const corruptedSessionId = 'corrupt-session-1234-1234-1234-123456789012' as SessionId;
      const missingSessionId = 'missing-session-1234-1234-1234-123456789012' as SessionId;
      
      // Create valid session
      const validSession = await createTestSession(testWorkspace.sessionDataDir, validSessionId);
      
      // Create corrupted session
      await createTestSession(testWorkspace.sessionDataDir, corruptedSessionId, { corrupt: true });
      
      // Create session metadata including missing session
      const sessionMetadata: SessionMetadata[] = [
        {
          id: validSessionId,
          created: validSession.created,
          lastModified: validSession.lastModified,
          model: validSession.model,
          messageCount: validSession.messages.length,
          tokenCount: validSession.tokenCount,
          workspaceRoot: validSession.workspaceRoot,
          contextFiles: validSession.contextFiles,
          tags: validSession.tags,
          preview: 'Valid session',
          title: 'Valid Session',
        },
        {
          id: corruptedSessionId,
          created: Date.now() - 1000 * 60 * 60,
          lastModified: Date.now() - 1000 * 60 * 30,
          model: 'gpt-4o',
          messageCount: 2,
          tokenCount: { total: 500, input: 250, output: 250 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['corrupt.ts'],
          tags: ['corrupted'],
          preview: 'Corrupted session',
          title: 'Corrupted Session',
        },
        {
          id: missingSessionId,
          created: Date.now() - 1000 * 60 * 60 * 2,
          lastModified: Date.now() - 1000 * 60 * 60,
          model: 'gpt-4o',
          messageCount: 1,
          tokenCount: { total: 300, input: 150, output: 150 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['missing.ts'],
          tags: ['missing'],
          preview: 'Missing session',
          title: 'Missing Session',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act & Assert: Test workflow with cleanup
      
      // Step 1: Startup initialization should detect and resolve issues
      const initResult = await performStartupInitialization(safeSessionManager);
      expect(initResult.success).toBe(true);
      expect(initResult.systemHealth.issuesResolved).toBeGreaterThan(0);
      
      // Step 2: Session detection should only return valid sessions
      const detectionResult = await detectAvailableSessions(safeSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(true);
      expect(detectionResult.recentSessions).toHaveLength(1);
      expect(detectionResult.recentSessions[0].id).toBe(validSessionId);
      expect(detectionResult.validationInfo?.invalidSessionsRemoved).toBe(2);
      expect(detectionResult.validationInfo?.cleanupPerformed).toBe(true);
      expect(detectionResult.validationInfo?.warnings).toBeDefined();
      
      // Step 3: Valid session should restore successfully
      const restorationResult = await restoreSessionOnStartup(safeSessionManager, validSessionId);
      expect(restorationResult.success).toBe(true);
      expect(restorationResult.session?.id).toBe(validSessionId);
    });

    it('should handle startup with no valid sessions', async () => {
      // Arrange: Create only invalid sessions
      const corruptedSessionId = 'corrupt-only-1234-1234-1234-123456789012' as SessionId;
      
      await createTestSession(testWorkspace.sessionDataDir, corruptedSessionId, { corrupt: true });
      
      const sessionMetadata: SessionMetadata[] = [
        {
          id: corruptedSessionId,
          created: Date.now() - 1000 * 60 * 60,
          lastModified: Date.now() - 1000 * 60 * 30,
          model: 'gpt-4o',
          messageCount: 1,
          tokenCount: { total: 200, input: 100, output: 100 },
          workspaceRoot: '/test/workspace',
          contextFiles: [],
          tags: [],
          preview: 'Corrupted session',
          title: 'Corrupted Session',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act & Assert: Test graceful fallback
      
      // Step 1: Startup initialization should clean up invalid sessions
      const initResult = await performStartupInitialization(safeSessionManager);
      expect(initResult.success).toBe(true);
      expect(initResult.systemHealth.validSessions).toBe(0);
      expect(initResult.systemHealth.issuesResolved).toBe(1);
      
      // Step 2: Session detection should return no valid sessions
      const detectionResult = await detectAvailableSessions(safeSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(false);
      expect(detectionResult.recentSessions).toHaveLength(0);
      expect(detectionResult.validationInfo?.cleanupPerformed).toBe(true);
      
      // Step 3: App should gracefully handle no sessions (this would trigger new session creation)
      expect(detectionResult.totalSessionCount).toBe(0);
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle session restoration failure with recovery options', async () => {
      // Arrange: Create a session that will fail during restoration
      const failingSessionId = 'failing-session-1234-1234-1234-123456789012' as SessionId;
      const validSessionId = 'valid-session-1234-1234-1234-123456789012' as SessionId;
      
      // Create a session with invalid structure (valid JSON but wrong schema)
      await createTestSession(testWorkspace.sessionDataDir, failingSessionId, { validStructure: false });
      const validSession = await createTestSession(testWorkspace.sessionDataDir, validSessionId);
      
      const sessionMetadata: SessionMetadata[] = [
        {
          id: failingSessionId,
          created: Date.now() - 1000 * 60 * 60,
          lastModified: Date.now() - 1000 * 60 * 30,
          model: 'gpt-4o',
          messageCount: 1,
          tokenCount: { total: 200, input: 100, output: 100 },
          workspaceRoot: '/test/workspace',
          contextFiles: [],
          tags: [],
          preview: 'Failing session',
          title: 'Failing Session',
        },
        {
          id: validSessionId,
          created: validSession.created,
          lastModified: validSession.lastModified,
          model: validSession.model,
          messageCount: validSession.messages.length,
          tokenCount: validSession.tokenCount,
          workspaceRoot: validSession.workspaceRoot,
          contextFiles: validSession.contextFiles,
          tags: validSession.tags,
          preview: 'Valid session',
          title: 'Valid Session',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act & Assert: Test error recovery
      
      // Step 1: Attempt to restore failing session
      const restorationResult = await restoreSessionOnStartup(safeSessionManager, failingSessionId);
      expect(restorationResult.success).toBe(false);
      expect(restorationResult.error).toBeDefined();
      expect(restorationResult.recoveryOptions).toBeDefined();
      expect(restorationResult.recoveryOptions!.length).toBeGreaterThan(0);
      
      // Step 2: Verify recovery options include expected types
      const recoveryTypes = restorationResult.recoveryOptions!.map(opt => opt.type);
      expect(recoveryTypes).toContain('new-session');
      
      // Step 3: Verify error recovery system tracks the failure
      const errorRecovery = safeSessionManager.getErrorRecovery();
      expect(errorRecovery.isSessionProblematic(failingSessionId)).toBe(true);
      
      // Step 4: Subsequent attempts should be blocked
      const secondAttempt = await restoreSessionOnStartup(safeSessionManager, failingSessionId);
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error?.message).toContain('problematic');
    });

    it('should implement progressive recovery escalation', async () => {
      // Arrange: Create sessions for testing escalation
      const problematicSessionId = 'problematic-1234-1234-1234-123456789012' as SessionId;
      const alternativeSessionId = 'alternative-1234-1234-1234-123456789012' as SessionId;
      
      await createTestSession(testWorkspace.sessionDataDir, problematicSessionId, { corrupt: true });
      const alternativeSession = await createTestSession(testWorkspace.sessionDataDir, alternativeSessionId);
      
      const sessionMetadata: SessionMetadata[] = [
        {
          id: problematicSessionId,
          created: Date.now() - 1000 * 60 * 60,
          lastModified: Date.now() - 1000 * 60 * 30,
          model: 'gpt-4o',
          messageCount: 1,
          tokenCount: { total: 200, input: 100, output: 100 },
          workspaceRoot: '/test/workspace',
          contextFiles: [],
          tags: [],
          preview: 'Problematic session',
          title: 'Problematic Session',
        },
        {
          id: alternativeSessionId,
          created: alternativeSession.created,
          lastModified: alternativeSession.lastModified,
          model: alternativeSession.model,
          messageCount: alternativeSession.messages.length,
          tokenCount: alternativeSession.tokenCount,
          workspaceRoot: alternativeSession.workspaceRoot,
          contextFiles: alternativeSession.contextFiles,
          tags: alternativeSession.tags,
          preview: 'Alternative session',
          title: 'Alternative Session',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act & Assert: Test progressive escalation
      
      const errorRecovery = safeSessionManager.getErrorRecovery();
      
      // Step 1: First failure should offer retry
      const firstAttempt = await restoreSessionOnStartup(safeSessionManager, problematicSessionId);
      expect(firstAttempt.success).toBe(false);
      expect(firstAttempt.recoveryOptions).toBeDefined();
      
      // Step 2: Multiple failures should escalate to different options
      // Simulate multiple failures
      for (let i = 0; i < 3; i++) {
        errorRecovery.recordFailure(problematicSessionId, new Error(`Failure ${i + 1}`));
      }
      
      const escalatedAttempt = await restoreSessionOnStartup(safeSessionManager, problematicSessionId);
      expect(escalatedAttempt.success).toBe(false);
      expect(escalatedAttempt.recoveryOptions).toBeDefined();
      
      // Should offer alternatives like new session or select different
      const recoveryTypes = escalatedAttempt.recoveryOptions!.map(opt => opt.type);
      expect(recoveryTypes).toContain('new-session');
      
      // Step 3: Session should be marked as problematic
      expect(errorRecovery.isSessionProblematic(problematicSessionId)).toBe(true);
    });

    it('should handle complete system failure gracefully', async () => {
      // Arrange: Create a scenario where everything fails
      // Don't create any session files or index
      
      // Act & Assert: Test graceful degradation
      
      // Step 1: Startup initialization should handle missing index
      const initResult = await performStartupInitialization(safeSessionManager);
      expect(initResult.success).toBe(true); // Should succeed even with no sessions
      expect(initResult.systemHealth.validSessions).toBe(0);
      
      // Step 2: Session detection should handle empty state
      const detectionResult = await detectAvailableSessions(safeSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(false);
      expect(detectionResult.recentSessions).toHaveLength(0);
      expect(detectionResult.totalSessionCount).toBe(0);
      
      // Step 3: System should be ready for new session creation
      expect(detectionResult.validationInfo?.cleanupPerformed).toBe(false);
      expect(detectionResult.validationInfo?.warnings).toBeDefined();
    });
  });

  describe('Cleanup and Validation Operations', () => {
    it('should perform comprehensive cleanup of orphaned entries and files', async () => {
      // Arrange: Create complex scenario with various orphaned items
      const validSessionId = 'valid-session-1234-1234-1234-123456789012' as SessionId;
      const orphanedEntryId = 'orphaned-entry-1234-1234-1234-123456789012' as SessionId;
      const orphanedFileId = 'orphaned-file-1234-1234-1234-123456789012' as SessionId;
      
      // Create valid session
      const validSession = await createTestSession(testWorkspace.sessionDataDir, validSessionId);
      
      // Create orphaned file (file exists but no index entry)
      await createTestSession(testWorkspace.sessionDataDir, orphanedFileId);
      
      // Create index with valid session and orphaned entry (entry exists but no file)
      const sessionMetadata: SessionMetadata[] = [
        {
          id: validSessionId,
          created: validSession.created,
          lastModified: validSession.lastModified,
          model: validSession.model,
          messageCount: validSession.messages.length,
          tokenCount: validSession.tokenCount,
          workspaceRoot: validSession.workspaceRoot,
          contextFiles: validSession.contextFiles,
          tags: validSession.tags,
          preview: 'Valid session',
          title: 'Valid Session',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata, {
        includeOrphanedEntries: [orphanedEntryId],
        excludeValidSessions: [orphanedFileId], // Exclude orphaned file from index
      });
      
      // Act & Assert: Test comprehensive cleanup
      
      // Step 1: Startup initialization should detect and resolve all issues
      const initResult = await performStartupInitialization(safeSessionManager);
      expect(initResult.success).toBe(true);
      expect(initResult.systemHealth.issuesResolved).toBeGreaterThan(0);
      
      // Step 2: Session detection should clean up orphaned items
      const detectionResult = await detectAvailableSessions(safeSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(true);
      expect(detectionResult.recentSessions).toHaveLength(1);
      expect(detectionResult.recentSessions[0].id).toBe(validSessionId);
      expect(detectionResult.validationInfo?.cleanupPerformed).toBe(true);
      
      // Step 3: Manual cleanup should report comprehensive results
      const cleanupResult = await safeSessionManager.cleanupInvalidSessions();
      expect(cleanupResult.deletedSessions).toBeDefined();
      expect(cleanupResult.spaceFree).toBeGreaterThan(0);
      
      // Step 4: Verify only valid session remains
      const finalDetection = await detectAvailableSessions(safeSessionManager);
      expect(finalDetection.recentSessions).toHaveLength(1);
      expect(finalDetection.recentSessions[0].id).toBe(validSessionId);
    });

    it('should create and restore from index backups during cleanup', async () => {
      // Arrange: Create sessions that will trigger backup creation
      const sessionId1 = 'session-1-1234-1234-1234-123456789012' as SessionId;
      const sessionId2 = 'session-2-1234-1234-1234-123456789012' as SessionId;
      const orphanedId = 'orphaned-1234-1234-1234-123456789012' as SessionId;
      
      await createTestSession(testWorkspace.sessionDataDir, sessionId1);
      await createTestSession(testWorkspace.sessionDataDir, sessionId2);
      
      const sessionMetadata: SessionMetadata[] = [
        {
          id: sessionId1,
          created: Date.now() - 1000 * 60 * 60,
          lastModified: Date.now() - 1000 * 60 * 30,
          model: 'gpt-4o',
          messageCount: 2,
          tokenCount: { total: 500, input: 250, output: 250 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['test1.ts'],
          tags: ['test'],
          preview: 'Session 1',
          title: 'Session 1',
        },
        {
          id: sessionId2,
          created: Date.now() - 1000 * 60 * 60 * 2,
          lastModified: Date.now() - 1000 * 60 * 60,
          model: 'gpt-4o',
          messageCount: 3,
          tokenCount: { total: 750, input: 375, output: 375 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['test2.ts'],
          tags: ['test'],
          preview: 'Session 2',
          title: 'Session 2',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata, {
        includeOrphanedEntries: [orphanedId],
      });
      
      // Act & Assert: Test backup creation and restoration
      
      // Step 1: Verify backup is created during cleanup
      const validator = safeSessionManager.getValidator();
      const backupPath = await validator.createIndexBackup();
      expect(backupPath).toBeDefined();
      
      // Verify backup file exists
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
      
      // Step 2: Perform cleanup that should use backup
      const cleanupResult = await validator.cleanupOrphanedEntries();
      expect(cleanupResult.backupCreated).toBe(true);
      expect(cleanupResult.orphanedEntriesRemoved).toBe(1);
      
      // Step 3: Verify cleanup preserved valid sessions
      const detectionResult = await detectAvailableSessions(safeSessionManager);
      expect(detectionResult.recentSessions).toHaveLength(2);
      expect(detectionResult.recentSessions.map(s => s.id)).toContain(sessionId1);
      expect(detectionResult.recentSessions.map(s => s.id)).toContain(sessionId2);
      expect(detectionResult.recentSessions.map(s => s.id)).not.toContain(orphanedId);
    });

    it('should validate session file structure and content integrity', async () => {
      // Arrange: Create sessions with various validation issues
      const validSessionId = 'valid-1234-1234-1234-123456789012' as SessionId;
      const invalidStructureId = 'invalid-struct-1234-1234-1234-123456789012' as SessionId;
      const corruptedJsonId = 'corrupted-json-1234-1234-1234-123456789012' as SessionId;
      
      // Create valid session
      await createTestSession(testWorkspace.sessionDataDir, validSessionId);
      
      // Create session with invalid structure
      await createTestSession(testWorkspace.sessionDataDir, invalidStructureId, { validStructure: false });
      
      // Create session with corrupted JSON
      await createTestSession(testWorkspace.sessionDataDir, corruptedJsonId, { corrupt: true });
      
      const sessionMetadata: SessionMetadata[] = [
        {
          id: validSessionId,
          created: Date.now() - 1000 * 60 * 60,
          lastModified: Date.now() - 1000 * 60 * 30,
          model: 'gpt-4o',
          messageCount: 2,
          tokenCount: { total: 500, input: 250, output: 250 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['valid.ts'],
          tags: ['valid'],
          preview: 'Valid session',
          title: 'Valid Session',
        },
        {
          id: invalidStructureId,
          created: Date.now() - 1000 * 60 * 60 * 2,
          lastModified: Date.now() - 1000 * 60 * 60,
          model: 'gpt-4o',
          messageCount: 1,
          tokenCount: { total: 200, input: 100, output: 100 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['invalid.ts'],
          tags: ['invalid'],
          preview: 'Invalid structure session',
          title: 'Invalid Structure Session',
        },
        {
          id: corruptedJsonId,
          created: Date.now() - 1000 * 60 * 60 * 3,
          lastModified: Date.now() - 1000 * 60 * 60 * 2,
          model: 'gpt-4o',
          messageCount: 1,
          tokenCount: { total: 150, input: 75, output: 75 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['corrupted.ts'],
          tags: ['corrupted'],
          preview: 'Corrupted JSON session',
          title: 'Corrupted JSON Session',
        },
      ];
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act & Assert: Test comprehensive validation
      
      // Step 1: Individual session validation
      const validator = safeSessionManager.getValidator();
      
      const validResult = await validator.validateSessionFile(validSessionId);
      expect(validResult.isValid).toBe(true);
      expect(validResult.fileExists).toBe(true);
      expect(validResult.isReadable).toBe(true);
      expect(validResult.hasValidStructure).toBe(true);
      expect(validResult.errors).toHaveLength(0);
      
      const invalidStructureResult = await validator.validateSessionFile(invalidStructureId);
      expect(invalidStructureResult.isValid).toBe(false);
      expect(invalidStructureResult.fileExists).toBe(true);
      expect(invalidStructureResult.isReadable).toBe(true);
      expect(invalidStructureResult.hasValidStructure).toBe(false);
      expect(invalidStructureResult.errors.length).toBeGreaterThan(0);
      
      const corruptedResult = await validator.validateSessionFile(corruptedJsonId);
      expect(corruptedResult.isValid).toBe(false);
      expect(corruptedResult.fileExists).toBe(true);
      expect(corruptedResult.isReadable).toBe(false);
      expect(corruptedResult.errors.length).toBeGreaterThan(0);
      
      // Step 2: Bulk validation through safe detection
      const detectionResult = await safeSessionManager.detectAvailableSessionsSafely();
      expect(detectionResult.validSessions).toHaveLength(1);
      expect(detectionResult.validSessions[0].id).toBe(validSessionId);
      expect(detectionResult.invalidSessions).toHaveLength(2);
      expect(detectionResult.invalidSessions).toContain(invalidStructureId);
      expect(detectionResult.invalidSessions).toContain(corruptedJsonId);
      expect(detectionResult.cleanupPerformed).toBe(true);
    });
  });

  describe('UI Component Integration', () => {
    it('should render session restoration UI with validation summaries', () => {
      // Arrange: Create test data for UI
      const mockSessions: SessionMetadata[] = [
        {
          id: 'ui-test-session-1234-1234-1234-123456789012' as SessionId,
          created: Date.now() - 1000 * 60 * 60,
          lastModified: Date.now() - 1000 * 60 * 30,
          model: 'gpt-4o',
          messageCount: 5,
          tokenCount: { total: 1000, input: 500, output: 500 },
          workspaceRoot: '/test/workspace',
          contextFiles: ['ui-test.ts'],
          tags: ['ui', 'test'],
          preview: 'UI test session',
          title: 'UI Test Session',
        },
      ];
      
      const validationSummary = {
        totalSessions: 3,
        validSessions: 1,
        invalidSessions: ['invalid-1', 'invalid-2'] as SessionId[],
        orphanedEntries: ['orphaned-1'] as SessionId[],
        orphanedFiles: ['orphaned-file.json'],
        cleanupPerformed: true,
        warnings: ['Warning 1', 'Warning 2'],
      };
      
      const cleanupResult = {
        sessionsRemoved: 2,
        entriesFixed: 1,
        filesDeleted: 1,
        backupCreated: true,
        errors: [],
        warnings: ['Cleanup warning'],
      };
      
      // Act: Render component
      const mockOnSessionSelected = vi.fn();
      const mockOnNewSession = vi.fn();
      const mockOnShowValidationSummary = vi.fn();
      
      const { lastFrame } = render(
        React.createElement(SessionRestoration, {
          sessions: mockSessions,
          onSessionSelected: mockOnSessionSelected,
          onNewSession: mockOnNewSession,
          onShowValidationSummary: mockOnShowValidationSummary,
          validationSummary,
          cleanupResult,
          showDetails: true,
        })
      );
      
      const output = lastFrame();
      
      // Assert: Verify UI elements
      expect(output).toContain('Session Restoration');
      expect(output).toContain('UI Test Session');
      expect(output).toContain('gpt-4o');
      expect(output).toContain('5 messages');
      expect(output).toContain('Start New Session');
      
      // Verify cleanup result display
      expect(output).toContain('Cleanup Summary');
      expect(output).toContain('2 sessions removed');
      expect(output).toContain('1 entries fixed');
      expect(output).toContain('1 files deleted');
      expect(output).toContain('Backup created before cleanup');
    });

    it('should render error recovery UI with recovery options', () => {
      // Arrange: Create error recovery scenario
      const recoveryOptions = [
        {
          type: 'retry' as const,
          label: 'Retry Session Restoration',
          description: 'Try to restore the session again',
          action: vi.fn(),
          isRecommended: false,
        },
        {
          type: 'new-session' as const,
          label: 'Create New Session',
          description: 'Start with a fresh session',
          action: vi.fn(),
          isRecommended: true,
        },
        {
          type: 'select-different' as const,
          label: 'Select Different Session',
          description: 'Choose another session to restore',
          action: vi.fn(),
          isRecommended: false,
        },
      ];
      
      // Act: Render error recovery UI
      const mockOnRecoveryOptionSelected = vi.fn();
      
      const { lastFrame } = render(
        React.createElement(SessionRestoration, {
          sessions: [],
          onSessionSelected: vi.fn(),
          onNewSession: vi.fn(),
          onRecoveryOptionSelected: mockOnRecoveryOptionSelected,
          recoveryOptions,
          errorMessage: 'Session file is corrupted and cannot be restored',
          isErrorRecovery: true,
        })
      );
      
      const output = lastFrame();
      
      // Assert: Verify error recovery UI
      expect(output).toContain('Session Restoration Error');
      expect(output).toContain('Session file is corrupted and cannot be restored');
      expect(output).toContain('Retry Session Restoration');
      expect(output).toContain('Create New Session');
      expect(output).toContain('(Recommended)');
      expect(output).toContain('Select Different Session');
      expect(output).toContain('Select a recovery option below');
    });

    it('should render session detection loading and error states', () => {
      // Test loading state
      const { lastFrame: loadingFrame } = render(
        React.createElement(SessionDetectionLoading)
      );
      
      expect(loadingFrame()).toContain('Detecting previous sessions');
      
      // Test error state
      const mockOnRetry = vi.fn();
      const mockOnContinue = vi.fn();
      
      const { lastFrame: errorFrame } = render(
        React.createElement(SessionDetectionError, {
          error: 'Permission denied accessing session storage',
          onRetry: mockOnRetry,
          onContinue: mockOnContinue,
          errorType: 'permission-error',
          sessionId: 'error-session-1234' as SessionId,
          attemptCount: 2,
        })
      );
      
      const errorOutput = errorFrame();
      expect(errorOutput).toContain('Session Detection Failed');
      expect(errorOutput).toContain('Permission denied accessing session storage');
      expect(errorOutput).toContain('Continue with New Session');
      expect(errorOutput).toContain('Retry Detection');
      expect(errorOutput).toContain('Session: error-session-1234');
      expect(errorOutput).toContain('Attempt #2');
      expect(errorOutput).toContain('Error type: permission-error');
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle large numbers of sessions efficiently', async () => {
      // Arrange: Create many sessions to test performance
      const sessionCount = 50;
      const sessionIds: SessionId[] = [];
      const sessionMetadata: SessionMetadata[] = [];
      
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = `perf-session-${i.toString().padStart(4, '0')}-1234-1234-123456789012` as SessionId;
        sessionIds.push(sessionId);
        
        await createTestSession(testWorkspace.sessionDataDir, sessionId);
        
        sessionMetadata.push({
          id: sessionId,
          created: Date.now() - 1000 * 60 * 60 * i,
          lastModified: Date.now() - 1000 * 60 * 30 * i,
          model: 'gpt-4o',
          messageCount: Math.floor(Math.random() * 10) + 1,
          tokenCount: { total: Math.floor(Math.random() * 1000) + 100, input: 50, output: 50 },
          workspaceRoot: '/test/workspace',
          contextFiles: [`perf-${i}.ts`],
          tags: ['performance', 'test'],
          preview: `Performance test session ${i}`,
          title: `Performance Test Session ${i}`,
        });
      }
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act & Assert: Test performance
      const startTime = Date.now();
      
      // Step 1: Startup initialization should complete quickly
      const initResult = await performStartupInitialization(safeSessionManager);
      expect(initResult.success).toBe(true);
      expect(initResult.systemHealth.validSessions).toBe(sessionCount);
      
      // Step 2: Session detection should handle large numbers efficiently
      const detectionResult = await detectAvailableSessions(safeSessionManager);
      expect(detectionResult.hasAvailableSessions).toBe(true);
      expect(detectionResult.totalSessionCount).toBe(sessionCount);
      
      // Step 3: Session restoration should work with large session sets
      const firstSessionId = sessionIds[0];
      const restorationResult = await restoreSessionOnStartup(safeSessionManager, firstSessionId);
      expect(restorationResult.success).toBe(true);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Performance assertion: should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for 50 sessions
      
      console.log(`Performance test completed in ${totalTime}ms for ${sessionCount} sessions`);
    });

    it('should handle concurrent session operations safely', async () => {
      // Arrange: Create sessions for concurrent testing
      const concurrentCount = 10;
      const sessionIds: SessionId[] = [];
      const sessionMetadata: SessionMetadata[] = [];
      
      for (let i = 0; i < concurrentCount; i++) {
        const sessionId = `concurrent-${i}-1234-1234-1234-123456789012` as SessionId;
        sessionIds.push(sessionId);
        
        await createTestSession(testWorkspace.sessionDataDir, sessionId);
        
        sessionMetadata.push({
          id: sessionId,
          created: Date.now() - 1000 * 60 * i,
          lastModified: Date.now() - 1000 * 30 * i,
          model: 'gpt-4o',
          messageCount: 2,
          tokenCount: { total: 400, input: 200, output: 200 },
          workspaceRoot: '/test/workspace',
          contextFiles: [`concurrent-${i}.ts`],
          tags: ['concurrent'],
          preview: `Concurrent test session ${i}`,
          title: `Concurrent Test Session ${i}`,
        });
      }
      
      await createTestIndex(testWorkspace.sessionDataDir, sessionMetadata);
      
      // Act: Perform concurrent operations
      const concurrentOperations = sessionIds.map(async (sessionId, index) => {
        // Mix of different operations
        if (index % 3 === 0) {
          return safeSessionManager.detectAvailableSessionsSafely();
        } else if (index % 3 === 1) {
          return safeSessionManager.restoreSessionSafely(sessionId);
        } else {
          return safeSessionManager.getValidator().validateSessionFile(sessionId);
        }
      });
      
      // Assert: All operations should complete successfully
      const results = await Promise.allSettled(concurrentOperations);
      
      const successfulOperations = results.filter(result => result.status === 'fulfilled');
      const failedOperations = results.filter(result => result.status === 'rejected');
      
      expect(successfulOperations.length).toBe(concurrentCount);
      expect(failedOperations.length).toBe(0);
      
      // Verify system remains in consistent state
      const finalDetection = await detectAvailableSessions(safeSessionManager);
      expect(finalDetection.totalSessionCount).toBe(concurrentCount);
    });
  });
});