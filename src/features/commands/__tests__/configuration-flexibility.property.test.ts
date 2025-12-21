/**
 * @fileoverview Property-based tests for configuration flexibility
 * @module features/commands/__tests__/configuration-flexibility.property.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { sessionsCommandHandler } from '../handlers/sessions.js';
import type { CommandContext } from '../types.js';

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

const createMockSessionManager = () => ({
  getConfiguration: vi.fn(),
  setConfiguration: vi.fn(),
  validateConfigChange: vi.fn(),
  resetConfiguration: vi.fn(),
  validateConfiguration: vi.fn(),
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
 * Generates valid configuration keys.
 */
const configKeyArb = fc.constantFrom(
  'max-sessions',
  'max-age-days',
  'auto-save-interval',
  'compression',
  'sanitize-exports',
  'audit-logging',
  'sessions-dir'
);

/**
 * Generates valid configuration values for each key type.
 */
const configValueArb = (key: string) => {
  switch (key) {
    case 'max-sessions':
      return fc.integer({ min: 1, max: 1000 }).map(String);
    case 'max-age-days':
      return fc.integer({ min: 1, max: 365 }).map(String);
    case 'auto-save-interval':
      return fc.integer({ min: 5, max: 300 }).map(String);
    case 'compression':
    case 'sanitize-exports':
    case 'audit-logging':
      return fc.constantFrom('true', 'false');
    case 'sessions-dir':
      return fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
        !s.includes('\0') && !s.includes('<') && !s.includes('>')
      );
    default:
      return fc.string();
  }
};

/**
 * Generates valid configuration key-value pairs.
 */
const configPairArb = configKeyArb.chain(key => 
  configValueArb(key).map(value => ({ key, value }))
);

/**
 * Generates invalid configuration values.
 */
const invalidConfigValueArb = (key: string) => {
  switch (key) {
    case 'max-sessions':
    case 'max-age-days':
      return fc.oneof(
        fc.constant('0'),
        fc.constant('-1'),
        fc.string().filter(s => isNaN(Number(s))),
        fc.constant('not-a-number')
      );
    case 'auto-save-interval':
      return fc.oneof(
        fc.constant('4'), // Below minimum
        fc.constant('301'), // Above maximum
        fc.string().filter(s => isNaN(Number(s)))
      );
    case 'compression':
    case 'sanitize-exports':
    case 'audit-logging':
      return fc.string().filter(s => s !== 'true' && s !== 'false');
    case 'sessions-dir':
      return fc.oneof(
        fc.constant(''),
        fc.constant('\0'),
        fc.constant('<invalid>'),
        fc.constant('>')
      );
    default:
      return fc.string();
  }
};

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Configuration Flexibility Property Tests', () => {
  let mockContext: CommandContext;
  let mockSessionManager: ReturnType<typeof createMockSessionManager>;

  beforeEach(() => {
    mockSessionManager = createMockSessionManager();
    mockContext = createMockContext(mockSessionManager);
  });

  /**
   * **Feature: session-persistence, Property 23: Configuration flexibility**
   * **Validates: Requirements 8.1, 8.2**
   * 
   * For any valid configuration key-value pair, the system should accept
   * the configuration change and store it properly.
   */
  it('should accept all valid configuration changes', async () => {
    await fc.assert(
      fc.asyncProperty(configPairArb, async ({ key, value }) => {
        // Arrange
        mockSessionManager.validateConfigChange.mockResolvedValue({
          valid: true,
          currentValue: 'old-value',
          requiresConfirmation: false,
        });
        mockSessionManager.setConfiguration.mockResolvedValue(undefined);
        (mockContext.showConfirmation as any).mockResolvedValue(true);

        // Act
        await sessionsCommandHandler(['config', 'set', key, value], mockContext);

        // Assert
        expect(mockSessionManager.validateConfigChange).toHaveBeenCalledWith(key, value);
        expect(mockSessionManager.setConfiguration).toHaveBeenCalledWith(key, value);
        expect(mockContext.addMessage).toHaveBeenCalledWith({
          role: 'assistant',
          content: expect.stringContaining('✅ **Configuration Updated**'),
        });
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Configuration validation should reject invalid values
   * 
   * For any invalid configuration value, the system should reject the change
   * and provide helpful error messages.
   */
  it('should reject invalid configuration values', async () => {
    await fc.assert(
      fc.asyncProperty(
        configKeyArb.chain(key => 
          invalidConfigValueArb(key).map(value => ({ key, value }))
        ),
        async ({ key, value }) => {
          // Arrange
          mockSessionManager.validateConfigChange.mockResolvedValue({
            valid: false,
            error: `Invalid value for ${key}: ${value}`,
            currentValue: 'current-value',
            suggestions: ['valid-option-1', 'valid-option-2'],
          });

          // Act
          await sessionsCommandHandler(['config', 'set', key, value], mockContext);

          // Assert
          expect(mockSessionManager.validateConfigChange).toHaveBeenCalledWith(key, value);
          expect(mockSessionManager.setConfiguration).not.toHaveBeenCalled();
          expect(mockContext.addMessage).toHaveBeenCalledWith({
            role: 'assistant',
            content: expect.stringContaining('❌ **Invalid Configuration Value**'),
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Configuration reset should restore defaults
   * 
   * For any configuration key, resetting it should restore the default value
   * and the system should confirm the change.
   */
  it('should reset configuration keys to defaults', async () => {
    await fc.assert(
      fc.asyncProperty(configKeyArb, async (key) => {
        // Arrange
        mockSessionManager.resetConfiguration.mockResolvedValue({
          oldValue: 'custom-value',
          newValue: 'default-value',
          restartRequired: false,
        });
        (mockContext.showConfirmation as any).mockResolvedValue(true);

        // Act
        await sessionsCommandHandler(['config', 'reset', key], mockContext);

        // Assert
        expect(mockSessionManager.resetConfiguration).toHaveBeenCalledWith(key);
        expect(mockContext.addMessage).toHaveBeenCalledWith({
          role: 'assistant',
          content: expect.stringContaining('✅ **Configuration Reset**'),
        });
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Configuration display should show all settings
   * 
   * For any configuration state, displaying the configuration should show
   * all relevant settings in a structured format.
   */
  it('should display configuration consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sessionsDir: fc.string({ minLength: 1, maxLength: 50 }),
          maxSessions: fc.integer({ min: 1, max: 1000 }),
          maxAgeMs: fc.integer({ min: 86400000, max: 31536000000 }), // 1 day to 1 year
          compressionEnabled: fc.boolean(),
          autoSaveEnabled: fc.boolean(),
          autoSaveInterval: fc.integer({ min: 5000, max: 300000 }),
          sanitizeExports: fc.boolean(),
          auditLogging: fc.boolean(),
          indexCaching: fc.boolean(),
          backgroundCleanup: fc.boolean(),
        }),
        async (config) => {
          // Reset mocks for this iteration
          vi.clearAllMocks();
          
          // Arrange
          mockSessionManager.getConfiguration.mockResolvedValue(config);

          // Act
          await sessionsCommandHandler(['config', 'show'], mockContext);

          // Assert
          expect(mockSessionManager.getConfiguration).toHaveBeenCalled();
          
          const messageCall = (mockContext.addMessage as any).mock.calls[0];
          const content = messageCall[0].content;
          
          // Verify all configuration sections are present
          expect(content).toContain('⚙️ **Session Configuration**');
          expect(content).toContain('**Storage Settings:**');
          expect(content).toContain('**Auto-Save Settings:**');
          expect(content).toContain('**Security Settings:**');
          expect(content).toContain('**Performance Settings:**');
          
          // Verify specific values are displayed
          expect(content).toContain(`Directory: \`${config.sessionsDir}\``);
          expect(content).toContain(`Max Sessions: ${config.maxSessions}`);
          expect(content).toContain(`Compression: ${config.compressionEnabled ? 'Enabled' : 'Disabled'}`);
          expect(content).toContain(`Enabled: ${config.autoSaveEnabled ? 'Yes' : 'No'}`);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Configuration validation should be comprehensive
   * 
   * For any configuration state, validation should check all settings
   * and report issues consistently.
   */
  it('should validate configuration comprehensively', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          valid: fc.boolean(),
          checkedSettings: fc.integer({ min: 1, max: 20 }),
          issues: fc.array(
            fc.record({
              setting: configKeyArb,
              error: fc.string({ minLength: 1, maxLength: 100 }),
            }),
            { maxLength: 5 }
          ),
          warnings: fc.array(
            fc.record({
              setting: configKeyArb,
              message: fc.string({ minLength: 1, maxLength: 100 }),
            }),
            { maxLength: 3 }
          ),
        }),
        async (validationResult) => {
          // Reset mocks for this iteration
          vi.clearAllMocks();
          
          // Arrange
          mockSessionManager.validateConfiguration.mockResolvedValue(validationResult);

          // Act
          await sessionsCommandHandler(['config', 'validate'], mockContext);

          // Assert
          expect(mockSessionManager.validateConfiguration).toHaveBeenCalled();
          
          const messageCall = (mockContext.addMessage as any).mock.calls[0];
          const content = messageCall[0].content;
          
          if (validationResult.valid) {
            expect(content).toContain('✅ **Configuration Valid**');
            expect(content).toContain(`${validationResult.checkedSettings} settings validated`);
          } else {
            expect(content).toContain('⚠️ **Configuration Issues Found**');
            
            if (validationResult.issues && validationResult.issues.length > 0) {
              expect(content).toContain('**Errors:**');
              validationResult.issues.forEach(issue => {
                expect(content).toContain(issue.setting);
                expect(content).toContain(issue.error);
              });
            }
            
            if (validationResult.warnings && validationResult.warnings.length > 0) {
              expect(content).toContain('**Warnings:**');
              validationResult.warnings.forEach(warning => {
                expect(content).toContain(warning.setting);
                expect(content).toContain(warning.message);
              });
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Configuration changes requiring confirmation should prompt user
   * 
   * For any configuration change that requires confirmation, the system should
   * show a confirmation dialog before applying the change.
   */
  it('should handle confirmation for disruptive changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        configPairArb,
        fc.boolean(),
        async ({ key, value }, userConfirms) => {
          // Reset mocks for this iteration
          vi.clearAllMocks();
          
          // Arrange
          mockSessionManager.validateConfigChange.mockResolvedValue({
            valid: true,
            currentValue: 'old-value',
            requiresConfirmation: true,
            warning: 'This change may affect existing sessions',
          });
          mockSessionManager.setConfiguration.mockResolvedValue(undefined);
          (mockContext.showConfirmation as any).mockResolvedValue(userConfirms);

          // Act
          await sessionsCommandHandler(['config', 'set', key, value], mockContext);

          // Assert
          expect(mockContext.showConfirmation).toHaveBeenCalledWith(
            `Change ${key} to "${value}"?`,
            expect.stringContaining('This change may affect existing sessions')
          );

          if (userConfirms) {
            expect(mockSessionManager.setConfiguration).toHaveBeenCalledWith(key, value);
            expect(mockContext.addMessage).toHaveBeenCalledWith({
              role: 'assistant',
              content: expect.stringContaining('✅ **Configuration Updated**'),
            });
          } else {
            expect(mockSessionManager.setConfiguration).not.toHaveBeenCalled();
            expect(mockContext.addMessage).toHaveBeenCalledWith({
              role: 'assistant',
              content: '⏹️ **Configuration Change Cancelled**',
            });
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});