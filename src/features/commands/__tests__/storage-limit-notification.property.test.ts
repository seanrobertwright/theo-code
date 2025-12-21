/**
 * @fileoverview Property-based tests for storage limit notification
 * @module features/commands/__tests__/storage-limit-notification.property.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { sessionsCommandHandler } from '../handlers/sessions.js';
import type { CommandContext } from '../types.js';
// Remove unused imports

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
    await fc.assert(
      fc.asyncProperty(
        storageInfoArb,
        storageLimitsArb,
        exceededLimitsArb,
        async (storageInfo, limits, exceeded) => {
          // Arrange - Create storage state that matches the exceeded flags
          const adjustedStorageInfo = {
            ...storageInfo,
            totalSessions: exceeded.sessionCountExceeded ? 
              limits.maxSessions + 10 : 
              Math.min(storageInfo.totalSessions, limits.maxSessions - 1),
            totalSizeBytes: exceeded.totalSizeExceeded ? 
              limits.maxTotalSize + 1000000 : 
              Math.min(storageInfo.totalSizeBytes, limits.maxTotalSize - 1000),
            availableDiskSpace: exceeded.diskSpaceExceeded ? 
              limits.minDiskSpace - 1000000 : 
              Math.max(storageInfo.availableDiskSpace, limits.minDiskSpace + 1000000),
          };

          const limitCheckResult = {
            withinLimits: !exceeded.sessionCountExceeded && !exceeded.totalSizeExceeded && !exceeded.diskSpaceExceeded,
            sessionCountExceeded: exceeded.sessionCountExceeded,
            totalSizeExceeded: exceeded.totalSizeExceeded,
            diskSpaceExceeded: exceeded.diskSpaceExceeded,
            warningThresholdReached: exceeded.warningThresholdReached,
            suggestedActions: [] as string[],
            estimatedSpaceSavings: 0,
          };

          // Add suggested actions based on what's exceeded
          if (exceeded.sessionCountExceeded) {
            limitCheckResult.suggestedActions.push('Delete old sessions');
            limitCheckResult.estimatedSpaceSavings += 1000000;
          }
          if (exceeded.totalSizeExceeded) {
            limitCheckResult.suggestedActions.push('Enable compression');
            limitCheckResult.estimatedSpaceSavings += 5000000;
          }
          if (exceeded.diskSpaceExceeded) {
            limitCheckResult.suggestedActions.push('Free up disk space');
          }
          if (exceeded.oldSessionsPresent) {
            limitCheckResult.suggestedActions.push('Run cleanup command');
          }

          mockSessionManager.getStorageInfo.mockResolvedValue(adjustedStorageInfo);
          mockSessionManager.checkStorageLimits.mockResolvedValue(limitCheckResult);

          // Act - Trigger a command that should check storage limits
          await sessionsCommandHandler(['list'], mockContext);

          // Assert
          expect(mockSessionManager.checkStorageLimits).toHaveBeenCalled();

          const messageCall = (mockContext.addMessage as any).mock.calls[0];
          const content = messageCall[0].content;

          if (!limitCheckResult.withinLimits) {
            // Should contain notification about exceeded limits
            if (exceeded.sessionCountExceeded) {
              expect(content).toMatch(/❌.*session.*limit.*exceeded|❌.*too many sessions/i);
            }
            if (exceeded.totalSizeExceeded) {
              expect(content).toMatch(/❌.*storage.*limit.*exceeded|❌.*storage.*full/i);
            }
            if (exceeded.diskSpaceExceeded) {
              expect(content).toMatch(/❌.*disk.*space.*low|❌.*insufficient.*space/i);
            }

            // Should contain suggested actions
            limitCheckResult.suggestedActions.forEach(action => {
              expect(content).toMatch(new RegExp(action.replace(/\s+/g, '.*').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            });

            // Should show estimated space savings if available
            if (limitCheckResult.estimatedSpaceSavings > 0) {
              expect(content).toMatch(/save|free|recover/i);
            }
          }

          if (exceeded.warningThresholdReached && limitCheckResult.withinLimits) {
            // Should show warning even if not exceeded
            expect(content).toMatch(/⚠️.*(?:warning|approaching|limit|nearly)/i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Storage notifications should be proportional to severity
   * 
   * For any storage limit violation, the notification severity should match
   * the severity of the limit breach (warning vs error).
   */
  it('should show appropriate notification severity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionCountPercent: fc.float({ min: Math.fround(0), max: Math.fround(1.5) }), // 0% to 150%
          storageSizePercent: fc.float({ min: Math.fround(0), max: Math.fround(1.5) }),
          diskSpacePercent: fc.float({ min: Math.fround(0), max: Math.fround(1.5) }),
        }),
        async (usage) => {
          // Arrange
          const isWarningLevel = (
            usage.sessionCountPercent > 0.8 && usage.sessionCountPercent < 1.0
          ) || (
            usage.storageSizePercent > 0.8 && usage.storageSizePercent < 1.0
          ) || (
            usage.diskSpacePercent > 0.8 && usage.diskSpacePercent < 1.0
          );

          const isErrorLevel = 
            usage.sessionCountPercent >= 1.0 || 
            usage.storageSizePercent >= 1.0 || 
            usage.diskSpacePercent >= 1.0;

          const limitCheckResult = {
            withinLimits: !isErrorLevel,
            sessionCountExceeded: usage.sessionCountPercent >= 1.0,
            totalSizeExceeded: usage.storageSizePercent >= 1.0,
            diskSpaceExceeded: usage.diskSpacePercent >= 1.0,
            warningThresholdReached: isWarningLevel && !isErrorLevel,
            suggestedActions: isErrorLevel || isWarningLevel ? ['cleanup'] : [],
            estimatedSpaceSavings: 1000000,
          };

          mockSessionManager.checkStorageLimits.mockResolvedValue(limitCheckResult);
          mockSessionManager.listSessions.mockResolvedValue([]);

          // Act
          await sessionsCommandHandler(['list'], mockContext);

          // Assert
          const messageCall = (mockContext.addMessage as any).mock.calls[0];
          const content = messageCall[0].content;

          if (isErrorLevel) {
            // Should show error-level indicators
            expect(content).toMatch(/❌.*(?:session|storage|disk).*(?:limit|exceeded)|⛔|🚨|error|critical/i);
          } else if (isWarningLevel) {
            // Should show warning-level indicators
            expect(content).toMatch(/⚠️.*(?:warning|approaching|nearly|limit)/i);
          } else {
            // Should not show any limit notifications for normal usage
            expect(content).not.toMatch(/❌.*(?:session|storage|disk).*(?:limit|exceeded)|⚠️.*(?:warning|approaching|limit)|⛔|🚨|critical/i);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Cleanup suggestions should be actionable
   * 
   * For any storage limit notification, suggested cleanup actions should
   * be specific, actionable, and include estimated space savings.
   */
  it('should provide actionable cleanup suggestions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          oldSessionCount: fc.integer({ min: 0, max: 100 }),
          largeSessionCount: fc.integer({ min: 0, max: 50 }),
          uncompressedSize: fc.integer({ min: 0, max: 100000000 }),
          duplicateFiles: fc.integer({ min: 0, max: 20 }),
        }),
        async (cleanupOpportunities) => {
          // Arrange
          const suggestedActions: string[] = [];
          let estimatedSavings = 0;

          if (cleanupOpportunities.oldSessionCount > 0) {
            suggestedActions.push(`Delete ${cleanupOpportunities.oldSessionCount} old sessions`);
            estimatedSavings += cleanupOpportunities.oldSessionCount * 50000; // 50KB per session
          }

          if (cleanupOpportunities.largeSessionCount > 0) {
            suggestedActions.push(`Compress ${cleanupOpportunities.largeSessionCount} large sessions`);
            estimatedSavings += cleanupOpportunities.largeSessionCount * 200000; // 200KB per session
          }

          if (cleanupOpportunities.uncompressedSize > 1000000) {
            suggestedActions.push('Enable compression for future sessions');
            estimatedSavings += Math.floor(cleanupOpportunities.uncompressedSize * 0.6); // 60% compression
          }

          if (cleanupOpportunities.duplicateFiles > 0) {
            suggestedActions.push(`Remove ${cleanupOpportunities.duplicateFiles} duplicate backup files`);
            estimatedSavings += cleanupOpportunities.duplicateFiles * 25000; // 25KB per duplicate
          }

          const limitCheckResult = {
            withinLimits: false,
            sessionCountExceeded: true,
            totalSizeExceeded: false,
            diskSpaceExceeded: false,
            warningThresholdReached: false,
            suggestedActions,
            estimatedSpaceSavings: estimatedSavings,
          };

          mockSessionManager.checkStorageLimits.mockResolvedValue(limitCheckResult);
          mockSessionManager.listSessions.mockResolvedValue([]);

          // Act
          await sessionsCommandHandler(['list'], mockContext);

          // Assert
          const messageCall = (mockContext.addMessage as any).mock.calls[0];
          const content = messageCall[0].content;

          if (suggestedActions.length > 0) {
            // Should contain specific action suggestions
            suggestedActions.forEach(action => {
              const escapedAction = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '.*');
              expect(content).toMatch(new RegExp(escapedAction, 'i'));
            });

            // Should show estimated space savings
            if (estimatedSavings > 0) {
              expect(content).toMatch(/\d+.*(?:KB|MB|GB)|save.*space|free.*up/i);
            }

            // Should include actionable commands
            expect(content).toMatch(/\/sessions.*cleanup|cleanup.*command|Use.*sessions.*cleanup/i);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Storage notifications should be contextual
   * 
   * For any command that could affect storage, the system should check
   * limits and show appropriate notifications based on the command context.
   */
  it('should show contextual storage notifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('list', 'search', 'export', 'cleanup'),
        fc.boolean(), // Whether limits are exceeded
        async (command, limitsExceeded) => {
          // Arrange
          const limitCheckResult = {
            withinLimits: !limitsExceeded,
            sessionCountExceeded: limitsExceeded,
            totalSizeExceeded: false,
            diskSpaceExceeded: false,
            warningThresholdReached: false,
            suggestedActions: limitsExceeded ? ['Run cleanup', 'Delete old sessions'] : [],
            estimatedSpaceSavings: limitsExceeded ? 5000000 : 0,
          };

          mockSessionManager.checkStorageLimits.mockResolvedValue(limitCheckResult);
          mockSessionManager.listSessions.mockResolvedValue([]);
          mockSessionManager.cleanupOldSessions.mockResolvedValue({
            deletedSessions: [],
            deletedByAge: 0,
            deletedByCount: 0,
            spaceFree: 0,
            errors: [],
          });

          // For export command, make sure session exists and set up storage conditions
          if (command === 'export') {
            mockSessionManager.sessionExists.mockResolvedValue(true);
            mockSessionManager.exportSession = vi.fn().mockResolvedValue({
              size: 1024,
              format: 'json-pretty',
              sanitized: true,
              warnings: [],
            });
            // Only show storage warnings when disk space is actually exceeded
            if (limitsExceeded) {
              limitCheckResult.diskSpaceExceeded = true;
            }
          }

          // Act
          const args = command === 'cleanup' ? [command] : 
                      command === 'search' ? [command, 'test'] :
                      command === 'export' ? [command, 'test-id'] :
                      [command];
          
          await sessionsCommandHandler(args, mockContext);

          // Assert
          const messageCall = (mockContext.addMessage as any).mock.calls[0];
          const content = messageCall[0].content;

          if (limitsExceeded) {
            // Should show storage notification for commands that could be affected
            if (command === 'list' || command === 'search') {
              expect(content).toMatch(/storage.*limit|session.*limit|cleanup.*recommended/i);
            }
            
            // Export command should warn about additional storage usage
            if (command === 'export') {
              expect(content).toMatch(/warning.*low.*disk.*space|disk.*space.*low|export.*storage/i);
            }
            
            // Cleanup command should show current status
            if (command === 'cleanup') {
              expect(content).toMatch(/cleanup|storage|sessions.*deleted/i);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
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