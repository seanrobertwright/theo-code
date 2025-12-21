/**
 * @fileoverview Unit tests for audit logging system
 * @module features/session/__tests__/audit-logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { 
  AuditLogger, 
  getAuditLogger, 
  resetAuditLogger, 
  logOperation,
  type AuditLogLevel,
  type AuditLogDestination,
  type AuditLogEntry,
  type AuditLoggerConfig 
} from '../audit.js';
import type { SessionId } from '../../../shared/types/index.js';

// Mock the config module
vi.mock('../../../config/index.js', () => ({
  getSessionsDir: () => '/tmp/test-sessions',
}));

// Mock fs operations
vi.mock('node:fs/promises');
const mockFs = vi.mocked(fs);

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleWarn: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    resetAuditLogger();
    
    // Mock console methods
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock fs operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.appendFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('');
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({ size: 1000 } as any);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    
    auditLogger = new AuditLogger({
      enabled: true,
      level: 'info',
      destination: 'file',
      maxFileSize: 1024 * 1024,
      maxFiles: 3,
      includeContext: true,
      consoleOutput: false,
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultLogger = new AuditLogger();
      const config = defaultLogger.getConfig();
      
      expect(config.enabled).toBe(false);
      expect(config.level).toBe('info');
      expect(config.destination).toBe('file');
      expect(config.maxFileSize).toBe(10 * 1024 * 1024);
      expect(config.maxFiles).toBe(5);
      expect(config.includeContext).toBe(true);
      expect(config.consoleOutput).toBe(false);
    });

    it('should update configuration', () => {
      const newConfig: Partial<AuditLoggerConfig> = {
        enabled: false,
        level: 'error',
        destination: 'console',
      };
      
      auditLogger.updateConfig(newConfig);
      const config = auditLogger.getConfig();
      
      expect(config.enabled).toBe(false);
      expect(config.level).toBe('error');
      expect(config.destination).toBe('console');
    });
  });

  describe('Logging Operations', () => {
    it('should log successful operations', async () => {
      const sessionId = 'test-session-123' as SessionId;
      const context = { messageCount: 5, tokenCount: 100 };
      
      await auditLogger.logSuccess('session.create', sessionId, context, 150);
      
      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('audit.log'),
        expect.stringContaining('"operation":"session.create"'),
        'utf-8'
      );
    });

    it('should log failed operations', async () => {
      const sessionId = 'test-session-123' as SessionId;
      const error = new Error('Test error');
      const context = { attemptedAction: 'create' };
      
      await auditLogger.logFailure('session.create', error, sessionId, context);
      
      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('audit.log'),
        expect.stringContaining('"result":"failure"'),
        'utf-8'
      );
    });

    it('should log warnings', async () => {
      const sessionId = 'test-session-123' as SessionId;
      const message = 'Session file corrupted, attempting recovery';
      
      await auditLogger.logWarning('session.load', message, sessionId);
      
      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('audit.log'),
        expect.stringContaining('"level":"warn"'),
        'utf-8'
      );
    });

    it('should not log when disabled', async () => {
      auditLogger.updateConfig({ enabled: false });
      
      await auditLogger.logSuccess('session.create');
      
      expect(mockFs.appendFile).not.toHaveBeenCalled();
    });

    it('should respect log level filtering', async () => {
      auditLogger.updateConfig({ level: 'error' });
      
      // Info level should be filtered out
      await auditLogger.log({
        timestamp: Date.now(),
        level: 'info',
        operation: 'session.create',
        actor: 'system',
        result: 'success',
      });
      
      expect(mockFs.appendFile).not.toHaveBeenCalled();
      
      // Error level should be logged
      await auditLogger.log({
        timestamp: Date.now(),
        level: 'error',
        operation: 'session.create',
        actor: 'system',
        result: 'failure',
        error: 'Test error',
      });
      
      expect(mockFs.appendFile).toHaveBeenCalled();
    });
  });

  describe('Log Destinations', () => {
    it('should write to console when destination is console', async () => {
      auditLogger.updateConfig({ destination: 'console' });
      
      await auditLogger.logSuccess('session.create');
      
      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockFs.appendFile).not.toHaveBeenCalled();
    });

    it('should write to both file and console when destination is both', async () => {
      auditLogger.updateConfig({ destination: 'both' });
      
      await auditLogger.logSuccess('session.create');
      
      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockFs.appendFile).toHaveBeenCalled();
    });

    it('should write to console for errors regardless of destination', async () => {
      auditLogger.updateConfig({ destination: 'file', consoleOutput: true });
      
      await auditLogger.logFailure('session.create', 'Test error');
      
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockFs.appendFile).toHaveBeenCalled();
    });
  });

  describe('Log Rotation', () => {
    it('should rotate log file when size limit is exceeded', async () => {
      // Mock file size to exceed limit
      mockFs.stat.mockResolvedValue({ size: 2 * 1024 * 1024 } as any);
      
      await auditLogger.logSuccess('session.create');
      
      expect(mockFs.rename).toHaveBeenCalled();
    });

    it('should clean up old log files beyond maxFiles limit', async () => {
      // Mock directory with old log files
      mockFs.readdir.mockResolvedValue([
        'audit-1000.log',
        'audit-2000.log',
        'audit-3000.log',
        'audit-4000.log', // This should be deleted
        'other-file.txt', // This should be ignored
      ]);
      
      // Mock file size to trigger rotation
      mockFs.stat.mockResolvedValue({ size: 2 * 1024 * 1024 } as any);
      
      await auditLogger.logSuccess('session.create');
      
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('audit-1000.log')
      );
    });
  });

  describe('Log Retrieval', () => {
    it('should retrieve recent log entries', async () => {
      const logContent = [
        '{"timestamp":"2024-01-01T00:00:00.000Z","level":"info","operation":"session.create","result":"success"}',
        '{"timestamp":"2024-01-01T00:01:00.000Z","level":"warn","operation":"session.load","result":"success"}',
        '{"timestamp":"2024-01-01T00:02:00.000Z","level":"error","operation":"session.delete","result":"failure"}',
      ].join('\n');
      
      mockFs.readFile.mockResolvedValue(logContent);
      
      const logs = await auditLogger.getRecentLogs(10);
      
      expect(logs).toHaveLength(3);
      expect(logs[0].operation).toBe('session.create');
      expect(logs[1].level).toBe('warn');
      expect(logs[2].result).toBe('failure');
    });

    it('should filter logs by level', async () => {
      const logContent = [
        '{"timestamp":"2024-01-01T00:00:00.000Z","level":"info","operation":"session.create","result":"success"}',
        '{"timestamp":"2024-01-01T00:01:00.000Z","level":"error","operation":"session.delete","result":"failure"}',
      ].join('\n');
      
      mockFs.readFile.mockResolvedValue(logContent);
      
      const errorLogs = await auditLogger.getRecentLogs(10, 'error');
      
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
    });

    it('should handle missing log file gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));
      
      const logs = await auditLogger.getRecentLogs(10);
      
      expect(logs).toHaveLength(0);
    });
  });

  describe('Log Cleanup', () => {
    it('should clear all log files', async () => {
      mockFs.readdir.mockResolvedValue([
        'audit-1000.log',
        'audit-2000.log',
        'other-file.txt',
      ]);
      
      const deletedCount = await auditLogger.clearLogs();
      
      expect(deletedCount).toBe(2);
      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.readdir.mockResolvedValue(['audit-1000.log']);
      mockFs.unlink.mockRejectedValue(new Error('Permission denied'));
      
      const deletedCount = await auditLogger.clearLogs();
      
      expect(deletedCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should not throw errors when logging fails', async () => {
      mockFs.appendFile.mockRejectedValue(new Error('Disk full'));
      
      // Should not throw
      await expect(auditLogger.logSuccess('session.create')).resolves.toBeUndefined();
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Failed to write to audit log file:',
        expect.any(Error)
      );
    });

    it('should handle invalid JSON in log files', async () => {
      mockFs.readFile.mockResolvedValue('invalid json\n{"valid":"json"}');
      
      const logs = await auditLogger.getRecentLogs(10);
      
      expect(logs).toHaveLength(1);
      expect(logs[0].valid).toBe('json');
    });
  });
});

describe('Singleton Functions', () => {
  beforeEach(() => {
    resetAuditLogger();
  });

  it('should return singleton instance', () => {
    const logger1 = getAuditLogger();
    const logger2 = getAuditLogger();
    
    expect(logger1).toBe(logger2);
  });

  it('should update configuration on existing instance', () => {
    const logger1 = getAuditLogger({ enabled: true });
    const logger2 = getAuditLogger({ level: 'error' });
    
    expect(logger1).toBe(logger2);
    expect(logger1.getConfig().enabled).toBe(true);
    expect(logger1.getConfig().level).toBe('error');
  });

  it('should reset singleton instance', () => {
    const logger1 = getAuditLogger();
    resetAuditLogger();
    const logger2 = getAuditLogger();
    
    expect(logger1).not.toBe(logger2);
  });
});

describe('logOperation Helper', () => {
  beforeEach(() => {
    resetAuditLogger();
    vi.clearAllMocks();
    
    // Mock fs operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.appendFile.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 1000 } as any);
  });

  it('should log successful operations with timing', async () => {
    // Enable audit logging for this test
    getAuditLogger({ enabled: true });
    
    const sessionId = 'test-session' as SessionId;
    const context = { test: 'data' };
    
    const result = await logOperation(
      'test.operation',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      },
      sessionId,
      context
    );
    
    expect(result).toBe('success');
    expect(mockFs.appendFile).toHaveBeenCalledWith(
      expect.stringContaining('audit.log'),
      expect.stringContaining('"operation":"test.operation"'),
      'utf-8'
    );
  });

  it('should log failed operations and re-throw error', async () => {
    // Enable audit logging for this test
    getAuditLogger({ enabled: true });
    
    const sessionId = 'test-session' as SessionId;
    const testError = new Error('Test error');
    
    await expect(
      logOperation(
        'test.operation',
        async () => {
          throw testError;
        },
        sessionId
      )
    ).rejects.toThrow('Test error');
    
    expect(mockFs.appendFile).toHaveBeenCalledWith(
      expect.stringContaining('audit.log'),
      expect.stringContaining('"result":"failure"'),
      'utf-8'
    );
  });

  it('should work without audit logging enabled', async () => {
    // Audit logging is disabled by default
    const result = await logOperation(
      'test.operation',
      async () => 'success'
    );
    
    expect(result).toBe('success');
    // Should not attempt to write to file when disabled
    expect(mockFs.appendFile).not.toHaveBeenCalled();
  });
});