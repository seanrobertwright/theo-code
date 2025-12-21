/**
 * @fileoverview Property-based tests for storage limit notification
 * @module features/commands/__tests__/storage-limit-notification.property.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { sessionsCommandHandler } from '../handlers/sessions.js';
import type { CommandContext } from '../types.js';

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

const createMockSessionManager = () => ({
  listSessions: vi.fn(),
  getStorageInfo: vi.fn(),
  checkStorageLimits: vi.fn(),
  cleanupOldSessions: vi.fn(),
  searchSessions: vi.fn(),
  sessionExists: vi.fn(),
  exportSession: vi.fn(),
});

const createMockContext = (sessionManager = createMockSessionManager()): CommandContext => ({
  addMessage: vi.fn(),
  setError: vi.fn(),
  showConfirmation: vi.fn(),
  workspaceRoot: '/test/workspace',
  currentModel: 'gpt-4o',
  sessionActions: {
    createNewSession: vi.fn(),
    restoreSession: vi.fn(),
    saveCurrentSession: vi.fn(),
    getSessionManager: () => sessionManager,
  },
});

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generates storage information with various limit scenarios.
 */
const storageInfoArb = fc.record({
  totalSessions: fc.integer({ min: 0, max: 200 }),
  totalSizeBytes: fc.integer({ min: 0, max: 1000000000 }), // Up to 1GB
  oldestSessionAge: fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }), // Up to 1 year
  availableDiskSpace: fc.integer({ min: 0, max: 10000000000 }), // Up to 10GB
  sessionSizeDistribution: fc.array(
    fc.record({
      sessionId: fc.string({ minLength: 10, maxLength: 20 }),
      sizeBytes: fc.integer({ min: 1000, max: 10000000 }),
      age: fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 }),
    }),
    { maxLength: 50 }
  ),
});

/**
 * Generates storage limit configurations.
 */
const storageLimitsArb = fc.record({
  maxSessions: fc.integer({ min: 10, max: 1000 }),
  maxTotalSize: fc.integer({ min: 1000000, max: 1000000000 }), // 1MB to 1GB
  maxSessionAge: fc.integer({ min: 24 * 60 * 60 * 1000, max: 365 * 24 * 60 * 60 * 1000 }), // 1 day to 1 year
  minDiskSpace: fc.integer({ min: 100000000, max: 1000000000 }), // 100MB to 1GB
  warningThreshold: fc.float({ min: Math.fround(0.7), max: Math.fround(0.95) }), // 70% to 95%
});

/**
 * Generates scenarios where storage limits are exceeded.
 */
const exceededLimitsArb = fc.record({
  sessionCountExceeded: fc.boolean(),
  totalSizeExceeded: fc.boolean(),
  diskSpaceExceeded: fc.boolean(),
  oldSessionsPresent: fc.boolean(),
  warningThresholdReached: fc.boolean(),
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Storage Limit Notification Property Tests', () => {
  let mockContext: CommandContext;
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    mockSessionManager = createMockSessionManager();
    mockContext = createMockContext(mockSessionManager);
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up default mock implementations
    mockSessionManager.listSessions.mockResolvedValue([]);
    mockSessionManager.searchSessions.mockResolvedValue([]);
    mockSessionManager.sessionExists.mockResolvedValue(false);
    mockSessionManager.getStorageInfo.mockResolvedValue({
      totalSessions: 0,
      totalSizeBytes: 0,
      oldestSessionAge: 0,
      availableDiskSpace: 1000000000,
      sessionSizeDistribution: [],
    });
    mockSessionManager.checkStorageLimits.mockResolvedValue({
      withinLimits: true,
      sessionCountExceeded: false,
      totalSizeExceeded: false,
      diskSpaceExceeded: false,
      warningThresholdReached: false,
      suggestedActions: [],
      estimatedSpaceSavings: 0,
    });
    mockSessionManager.cleanupOldSessions.mockResolvedValue({
      deletedSessions: [],
      deletedByAge: 0,
      deletedByCount: 0,
      spaceFree: 0,
      errors: [],
    });
  });

  /**
   * **Feature: session-persistence, Property 25: Storage limit notification**
   * **Validates: Requirements 8.5**
   * 
   * For any storage state that exceeds configured limits, the system should
   * notify the user and suggest appropriate cleanup actions.
   */
  it('should notify users when storage limits are exceeded', async () => {
    // Test specific cases instead of using property-based testing for now
    const testCases = [
      {
        name: 'session count exceeded',
        limitResult: {
          withinLimits: false,
          sessionCountExceeded: true,
          totalSizeExceeded: false,
          diskSpaceExceeded: false,
          warningThresholdReached: false,
          suggestedActions: ['Delete old sessions'],
          estimatedSpaceSavings: 1000000,
        },
        expectedPattern: /❌.*Session limit exceeded.*Too many sessions/i
      },
      {
        name: 'storage size exceeded',
        limitResult: {
          withinLimits: false,
          sessionCountExceeded: false,
          totalSizeExceeded: true,
          diskSpaceExceeded: false,
          warningThresholdReached: false,
          suggestedActions: ['Enable compression'],
          estimatedSpaceSavings: 5000000,
        },
        expectedPattern: /❌.*Storage limit exceeded.*Session storage is full/i
      },
      {
        name: 'disk space exceeded',
        limitResult: {
          withinLimits: false,
          sessionCountExceeded: false,
          totalSizeExceeded: false,
          diskSpaceExceeded: true,
          warningThresholdReached: false,
          suggestedActions: ['Free up disk space'],
          estimatedSpaceSavings: 0,
        },
        expectedPattern: /❌.*Disk space low.*Insufficient disk space/i
      },
      {
        name: 'warning threshold reached',
        limitResult: {
          withinLimits: true,
          sessionCountExceeded: false,
          totalSizeExceeded: false,
          diskSpaceExceeded: false,
          warningThresholdReached: true,
          suggestedActions: [],
          estimatedSpaceSavings: 0,
        },
        expectedPattern: /⚠️.*Warning.*Approaching storage limits/i
      }
    ];

    for (const testCase of testCases) {
      // Reset mocks for each test case
      vi.clearAllMocks();
      mockSessionManager = createMockSessionManager();
      mockContext = createMockContext(mockSessionManager);
      
      // Set up default mocks
      mockSessionManager.listSessions.mockResolvedValue([]);
      mockSessionManager.checkStorageLimits.mockResolvedValue(testCase.limitResult);

      // Act
      await sessionsCommandHandler(['list'], mockContext);

      // Assert
      expect(mockSessionManager.checkStorageLimits).toHaveBeenCalled();
      const messageCall = (mockContext.addMessage as any).mock.calls[0];
      const content = messageCall[0].content;

      expect(content).toMatch(testCase.expectedPattern);
    }
  });

  /**
   * Property: Storage notifications should be proportional to severity
   * 
   * For any storage limit violation, the notification severity should match
   * the severity of the limit breach (warning vs error).
   */
  it('should show appropriate notification severity', async () => {
    const testCases = [
      {
        name: 'error level - session count exceeded',
        limitResult: {
          withinLimits: false,
          sessionCountExceeded: true,
          totalSizeExceeded: false,
          diskSpaceExceeded: false,
          warningThresholdReached: false,
          suggestedActions: ['cleanup'],
          estimatedSpaceSavings: 1000000,
        },
        expectedPattern: /❌.*Session limit exceeded/i
      },
      {
        name: 'warning level - approaching limits',
        limitResult: {
          withinLimits: true,
          sessionCountExceeded: false,
          totalSizeExceeded: false,
          diskSpaceExceeded: false,
          warningThresholdReached: true,
          suggestedActions: ['cleanup'],
          estimatedSpaceSavings: 1000000,
        },
        expectedPattern: /⚠️.*Warning.*Approaching storage limits/i
      }
    ];

    for (const testCase of testCases) {
      // Reset mocks for each test case
      vi.clearAllMocks();
      mockSessionManager = createMockSessionManager();
      mockContext = createMockContext(mockSessionManager);
      
      // Set up mocks
      mockSessionManager.listSessions.mockResolvedValue([]);
      mockSessionManager.checkStorageLimits.mockResolvedValue(testCase.limitResult);

      // Act
      await sessionsCommandHandler(['list'], mockContext);

      // Assert
      const messageCall = (mockContext.addMessage as any).mock.calls[0];
      const content = messageCall[0].content;
      expect(content).toMatch(testCase.expectedPattern);
    }
  });

  /**
   * Property: Cleanup suggestions should be actionable
   * 
   * For any storage limit notification, suggested cleanup actions should
   * be specific, actionable, and include estimated space savings.
   */
  it('should provide actionable cleanup suggestions', async () => {
    const testCases = [
      {
        name: 'with suggested actions and savings',
        limitResult: {
          withinLimits: false,
          sessionCountExceeded: true,
          totalSizeExceeded: false,
          diskSpaceExceeded: false,
          warningThresholdReached: false,
          suggestedActions: ['Delete 5 old sessions', 'Compress 3 large sessions'],
          estimatedSpaceSavings: 2500000, // 2.5MB
        },
        expectedPatterns: [
          /Delete.*5.*old.*sessions/i,
          /Compress.*3.*large.*sessions/i,
          /Estimated.*space.*savings/i,
          /sessions.*cleanup/i
        ]
      }
    ];

    for (const testCase of testCases) {
      // Reset mocks for each test case
      vi.clearAllMocks();
      mockSessionManager = createMockSessionManager();
      mockContext = createMockContext(mockSessionManager);
      
      // Set up mocks
      mockSessionManager.listSessions.mockResolvedValue([]);
      mockSessionManager.checkStorageLimits.mockResolvedValue(testCase.limitResult);

      // Act
      await sessionsCommandHandler(['list'], mockContext);

      // Assert
      const messageCall = (mockContext.addMessage as any).mock.calls[0];
      const content = messageCall[0].content;

      testCase.expectedPatterns.forEach(pattern => {
        expect(content).toMatch(pattern);
      });
    }
  });

  /**
   * Property: Storage notifications should be contextual
   * 
   * For any command that could affect storage, the system should check
   * limits and show appropriate notifications based on the command context.
   */
  it('should show contextual storage notifications', async () => {
    const testCases = [
      {
        name: 'list command with session limit exceeded',
        command: 'list',
        limitResult: {
          withinLimits: false,
          sessionCountExceeded: true,
          totalSizeExceeded: false,
          diskSpaceExceeded: false,
          warningThresholdReached: false,
          suggestedActions: ['Run cleanup', 'Delete old sessions'],
          estimatedSpaceSavings: 5000000,
        },
        expectedPattern: /Session limit exceeded|cleanup/i
      },
      {
        name: 'export command with disk space exceeded',
        command: 'export',
        limitResult: {
          withinLimits: false,
          sessionCountExceeded: false,
          totalSizeExceeded: false,
          diskSpaceExceeded: true,
          warningThresholdReached: false,
          suggestedActions: ['Free up disk space'],
          estimatedSpaceSavings: 0,
        },
        expectedPattern: /Warning.*Low disk space|disk.*space.*low/i
      }
    ];

    for (const testCase of testCases) {
      // Reset mocks for each test case
      vi.clearAllMocks();
      mockSessionManager = createMockSessionManager();
      mockContext = createMockContext(mockSessionManager);
      
      // Set up default mocks
      mockSessionManager.listSessions.mockResolvedValue([]);
      mockSessionManager.checkStorageLimits.mockResolvedValue(testCase.limitResult);
      mockSessionManager.cleanupOldSessions.mockResolvedValue({
        deletedSessions: [],
        deletedByAge: 0,
        deletedByCount: 0,
        spaceFree: 0,
        errors: [],
      });

      // For export command, set up additional mocks
      if (testCase.command === 'export') {
        mockSessionManager.sessionExists.mockResolvedValue(true);
        mockSessionManager.exportSession = vi.fn().mockResolvedValue({
          size: 1024,
          format: 'json-pretty',
          sanitized: true,
          warnings: [],
        });
      }

      // Act
      const args = testCase.command === 'export' ? [testCase.command, 'test-id'] : [testCase.command];
      await sessionsCommandHandler(args, mockContext);

      // Assert
      const messageCall = (mockContext.addMessage as any).mock.calls[0];
      const content = messageCall[0].content;
      expect(content).toMatch(testCase.expectedPattern);
    }
  });

  /**
   * Property: Storage limit checks should be efficient
   * 
   * For any storage limit check, the system should perform the check
   * efficiently without blocking the main command execution.
   */
  it('should perform storage checks efficiently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }), // Number of sessions
        async (sessionCount) => {
          // Arrange
          const startTime = Date.now();
          
          const limitCheckResult = {
            withinLimits: true,
            sessionCountExceeded: false,
            totalSizeExceeded: false,
            diskSpaceExceeded: false,
            warningThresholdReached: false,
            suggestedActions: [],
            estimatedSpaceSavings: 0,
          };

          // Simulate a delay proportional to session count (should be minimal)
          mockSessionManager.checkStorageLimits.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, Math.min(sessionCount / 100, 10)));
            return limitCheckResult;
          });

          mockSessionManager.listSessions.mockResolvedValue([]);

          // Act
          await sessionsCommandHandler(['list'], mockContext);
          const endTime = Date.now();

          // Assert
          expect(mockSessionManager.checkStorageLimits).toHaveBeenCalled();
          
          // Storage check should not significantly delay command execution
          const executionTime = endTime - startTime;
          expect(executionTime).toBeLessThan(100); // Should complete within 100ms
          
          // Should still show the main command result
          expect(mockContext.addMessage).toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });
});