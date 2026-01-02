/**
 * @fileoverview Tests for state update error handling utilities
 * @module shared/components/Layout/__tests__/state-error-handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSafeStateSetter,
  createSafeFunctionalStateSetter,
  executeBatchStateUpdates,
  createNullValidator,
  createObjectValidator,
  createArrayValidator,
  StateUpdateError,
  InvalidStateError,
  StateValidationError,
} from '../state-error-handling.js';

// Mock logger
vi.mock('../../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('State Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSafeStateSetter', () => {
    it('should handle successful state updates', () => {
      const mockSetter = vi.fn();
      const safeSetter = createSafeStateSetter(mockSetter, {
        componentName: 'TestComponent',
        stateName: 'testState',
      });

      safeSetter('test value');

      expect(mockSetter).toHaveBeenCalledWith('test value');
    });

    it('should handle state update errors with fallback', () => {
      const mockSetter = vi.fn().mockImplementation(() => {
        throw new Error('State update failed');
      });
      
      const safeSetter = createSafeStateSetter(mockSetter, {
        componentName: 'TestComponent',
        stateName: 'testState',
        fallbackState: 'fallback value',
      });

      safeSetter('test value');

      // Should try original value first, then fallback
      expect(mockSetter).toHaveBeenCalledWith('test value');
      expect(mockSetter).toHaveBeenCalledWith('fallback value');
    });

    it('should validate state before update', () => {
      const mockSetter = vi.fn();
      const validator = vi.fn().mockReturnValue('Validation failed');
      
      const safeSetter = createSafeStateSetter(mockSetter, {
        componentName: 'TestComponent',
        stateName: 'testState',
        validator,
        fallbackState: 'fallback value',
      });

      safeSetter('invalid value');

      expect(validator).toHaveBeenCalledWith('invalid value');
      expect(mockSetter).toHaveBeenCalledWith('fallback value');
    });
  });

  describe('createSafeFunctionalStateSetter', () => {
    it('should handle functional state updates', () => {
      const mockSetter = vi.fn();
      const safeSetter = createSafeFunctionalStateSetter(mockSetter, {
        componentName: 'TestComponent',
        stateName: 'testState',
      });

      const updater = (prev: string) => prev + ' updated';
      safeSetter(updater);

      expect(mockSetter).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle direct value updates', () => {
      const mockSetter = vi.fn();
      const safeSetter = createSafeFunctionalStateSetter(mockSetter, {
        componentName: 'TestComponent',
        stateName: 'testState',
      });

      safeSetter('direct value');

      expect(mockSetter).toHaveBeenCalledWith('direct value');
    });
  });

  describe('executeBatchStateUpdates', () => {
    it('should execute all updates successfully', async () => {
      const update1 = vi.fn();
      const update2 = vi.fn();
      const update3 = vi.fn();

      const result = await executeBatchStateUpdates(
        [update1, update2, update3],
        { componentName: 'TestComponent' }
      );

      expect(result.success).toBe(true);
      expect(update1).toHaveBeenCalled();
      expect(update2).toHaveBeenCalled();
      expect(update3).toHaveBeenCalled();
    });

    it('should handle batch update failures', async () => {
      const update1 = vi.fn();
      const update2 = vi.fn().mockImplementation(() => {
        throw new Error('Update 2 failed');
      });
      const update3 = vi.fn();

      const result = await executeBatchStateUpdates(
        [update1, update2, update3],
        { componentName: 'TestComponent' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(StateUpdateError);
      expect(update1).toHaveBeenCalled();
      expect(update2).toHaveBeenCalled();
      expect(update3).not.toHaveBeenCalled(); // Should stop on first error
    });

    it('should continue on error when configured', async () => {
      const update1 = vi.fn();
      const update2 = vi.fn().mockImplementation(() => {
        throw new Error('Update 2 failed');
      });
      const update3 = vi.fn();

      const result = await executeBatchStateUpdates(
        [update1, update2, update3],
        { 
          componentName: 'TestComponent',
          continueOnError: true 
        }
      );

      expect(result.success).toBe(false); // Still false because there were errors
      expect(update1).toHaveBeenCalled();
      expect(update2).toHaveBeenCalled();
      expect(update3).toHaveBeenCalled(); // Should continue despite error
    });
  });

  describe('Validators', () => {
    describe('createNullValidator', () => {
      it('should reject null values by default', () => {
        const validator = createNullValidator();
        expect(validator(null)).toBe('State cannot be null');
        expect(validator(undefined)).toBe('State cannot be undefined');
        expect(validator('valid')).toBe(true);
      });

      it('should allow null when configured', () => {
        const validator = createNullValidator(true, false);
        expect(validator(null)).toBe(true);
        expect(validator(undefined)).toBe('State cannot be undefined');
      });
    });

    describe('createObjectValidator', () => {
      it('should validate required properties', () => {
        const validator = createObjectValidator(['name', 'age']);
        
        expect(validator({ name: 'John', age: 30 })).toBe(true);
        expect(validator({ name: 'John' })).toBe('Missing required property: age');
        expect(validator(null)).toBe('State must be an object');
      });
    });

    describe('createArrayValidator', () => {
      it('should validate array length', () => {
        const validator = createArrayValidator(1, 3);
        
        expect(validator([1, 2])).toBe(true);
        expect(validator([])).toBe('Array must have at least 1 items');
        expect(validator([1, 2, 3, 4])).toBe('Array must have at most 3 items');
        expect(validator('not array')).toBe('State must be an array');
      });
    });
  });

  describe('Error Types', () => {
    it('should create proper error types', () => {
      const stateError = new StateUpdateError('Test error', 'TEST_CODE');
      expect(stateError).toBeInstanceOf(StateUpdateError);
      expect(stateError.code).toBe('TEST_CODE');

      const invalidError = new InvalidStateError('Invalid state');
      expect(invalidError).toBeInstanceOf(InvalidStateError);
      expect(invalidError.code).toBe('INVALID_STATE');

      const validationError = new StateValidationError('Validation failed');
      expect(validationError).toBeInstanceOf(StateValidationError);
      expect(validationError.code).toBe('STATE_VALIDATION_FAILED');
    });
  });
});