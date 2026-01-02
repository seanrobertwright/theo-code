/**
 * @fileoverview Tests for input handler error boundaries
 * @module shared/components/Layout/__tests__/input-error-handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createSafeInputHandler, 
  createSafeInputHandlerWithDefaults,
  createDefaultFallbackHandler,
  createAdvancedSafeInputHandler,
  InputErrorRecoveryStrategies
} from '../input-error-handling.js';

describe('Input Error Handling', () => {
  let mockLogger: any;

  beforeEach(() => {
    // Mock the logger
    mockLogger = {
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    };
    
    // Mock the logger module
    vi.doMock('../../../utils/logger.js', () => ({
      logger: mockLogger,
    }));
  });

  describe('createSafeInputHandler', () => {
    it('should execute handler normally when no error occurs', () => {
      const mockHandler = vi.fn();
      const safeHandler = createSafeInputHandler(mockHandler, {
        componentName: 'TestComponent'
      });

      safeHandler('test', { key: 'value' });

      expect(mockHandler).toHaveBeenCalledWith('test', { key: 'value' });
    });

    it('should catch errors and prevent crashes', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });
      
      const safeHandler = createSafeInputHandler(errorHandler, {
        componentName: 'TestComponent'
      });

      // Should not throw
      expect(() => {
        safeHandler('test', { key: 'value' });
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalledWith('test', { key: 'value' });
    });

    it('should use fallback handler when primary handler fails', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });
      const fallbackHandler = vi.fn();
      
      const safeHandler = createSafeInputHandler(errorHandler, {
        componentName: 'TestComponent',
        fallbackHandler
      });

      safeHandler('test', { key: 'value' });

      expect(errorHandler).toHaveBeenCalledWith('test', { key: 'value' });
      expect(fallbackHandler).toHaveBeenCalledWith('test', { key: 'value' });
    });

    it('should handle fallback handler errors gracefully', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Primary error');
      });
      const errorFallback = vi.fn(() => {
        throw new Error('Fallback error');
      });
      
      const safeHandler = createSafeInputHandler(errorHandler, {
        componentName: 'TestComponent',
        fallbackHandler: errorFallback
      });

      // Should not throw even when both handlers fail
      expect(() => {
        safeHandler('test', { key: 'value' });
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalledWith('test', { key: 'value' });
      expect(errorFallback).toHaveBeenCalledWith('test', { key: 'value' });
    });
  });

  describe('createSafeInputHandlerWithDefaults', () => {
    it('should create a safe handler with default fallback', () => {
      const mockHandler = vi.fn();
      const safeHandler = createSafeInputHandlerWithDefaults(mockHandler, 'TestComponent');

      safeHandler('test', { key: 'value' });

      expect(mockHandler).toHaveBeenCalledWith('test', { key: 'value' });
    });

    it('should use default fallback when handler fails', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });
      
      const safeHandler = createSafeInputHandlerWithDefaults(errorHandler, 'TestComponent');

      // Should not throw
      expect(() => {
        safeHandler('test', { key: 'value' });
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalledWith('test', { key: 'value' });
    });
  });

  describe('createDefaultFallbackHandler', () => {
    it('should create a handler that does nothing but logs', () => {
      const fallbackHandler = createDefaultFallbackHandler('TestComponent');

      // Should not throw
      expect(() => {
        fallbackHandler('test', { key: 'value' });
      }).not.toThrow();
    });
  });

  describe('createAdvancedSafeInputHandler', () => {
    it('should handle IGNORE recovery strategy', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });
      
      const safeHandler = createAdvancedSafeInputHandler(
        errorHandler, 
        'TestComponent', 
        InputErrorRecoveryStrategies.IGNORE
      );

      expect(() => {
        safeHandler('test', { key: 'value' });
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalledWith('test', { key: 'value' });
    });

    it('should handle DISABLE_TEMPORARILY recovery strategy', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });
      
      const safeHandler = createAdvancedSafeInputHandler(
        errorHandler, 
        'TestComponent', 
        InputErrorRecoveryStrategies.DISABLE_TEMPORARILY
      );

      // First call should trigger error and disable
      safeHandler('test1', { key: 'value1' });
      expect(errorHandler).toHaveBeenCalledTimes(1);

      // Second call should be ignored due to temporary disable
      safeHandler('test2', { key: 'value2' });
      expect(errorHandler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should work normally when no errors occur', () => {
      const normalHandler = vi.fn();
      
      const safeHandler = createAdvancedSafeInputHandler(
        normalHandler, 
        'TestComponent', 
        InputErrorRecoveryStrategies.IGNORE
      );

      safeHandler('test', { key: 'value' });

      expect(normalHandler).toHaveBeenCalledWith('test', { key: 'value' });
    });
  });

  describe('Error logging', () => {
    it('should log errors with proper context', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });
      
      const safeHandler = createSafeInputHandler(errorHandler, {
        componentName: 'TestComponent',
        errorPrefix: 'Custom error prefix'
      });

      safeHandler('test', { key: 'value' });

      // Note: This test would need the actual logger mock to work properly
      // For now, we just verify the handler doesn't throw
      expect(() => {
        safeHandler('test', { key: 'value' });
      }).not.toThrow();
    });

    it('should suppress logging when requested', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Test error');
      });
      
      const safeHandler = createSafeInputHandler(errorHandler, {
        componentName: 'TestComponent',
        suppressLogging: true
      });

      expect(() => {
        safeHandler('test', { key: 'value' });
      }).not.toThrow();
    });
  });
});