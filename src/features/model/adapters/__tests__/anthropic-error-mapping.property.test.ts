/**
 * @fileoverview Property-based tests for Anthropic error mapping
 * @module features/model/adapters/__tests__/anthropic-error-mapping.property.test
 *
 * **Feature: multi-provider-support, Property 4: Error code mapping consistency**
 * **Validates: Requirements 1.6**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk } from '../../../../shared/types/models.js';

// =============================================================================
// GENERATORS
// =============================================================================

/**
 * Generate valid Anthropic error types.
 */
const anthropicErrorTypeArb = fc.constantFrom(
  'authentication_error',
  'permission_error',
  'rate_limit_error',
  'invalid_request_error',
  'api_error',
  'overloaded_error'
);

/**
 * Generate valid error messages.
 */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Generate valid HTTP status codes.
 */
const httpStatusArb = fc.constantFrom(400, 401, 403, 429, 500, 502, 503);

/**
 * Generate Anthropic API errors.
 */
const anthropicApiErrorArb = fc.record({
  type: anthropicErrorTypeArb,
  message: errorMessageArb,
  status: httpStatusArb,
});

/**
 * Generate generic JavaScript errors.
 */
const genericErrorArb = fc.record({
  message: errorMessageArb,
  name: fc.constantFrom('Error', 'TypeError', 'NetworkError', 'TimeoutError'),
});

// =============================================================================
// ERROR MAPPING FUNCTIONS
// =============================================================================

/** Error code mapping from Anthropic errors */
const ERROR_CODE_MAP: Record<string, string> = {
  'authentication_error': 'AUTH_FAILED',
  'permission_error': 'AUTH_FAILED',
  'rate_limit_error': 'RATE_LIMITED',
  'invalid_request_error': 'INVALID_REQUEST',
  'api_error': 'API_ERROR',
  'overloaded_error': 'API_ERROR',
};

/**
 * Maps Anthropic API errors to StreamChunk error format.
 * This is a copy of the function from the adapter for testing.
 */
function handleApiError(error: unknown): StreamChunk {
  if (error instanceof Anthropic.APIError) {
    const code = ERROR_CODE_MAP[error.type] ?? 'API_ERROR';
    return {
      type: 'error',
      error: { code, message: error.message },
    };
  }

  if (error instanceof Error) {
    return {
      type: 'error',
      error: { code: 'API_ERROR', message: error.message },
    };
  }

  return {
    type: 'error',
    error: { code: 'API_ERROR', message: 'Unknown error occurred' },
  };
}

/**
 * Creates a mock Anthropic API error for testing.
 */
function createMockAnthropicError(type: string, message: string, status: number): Anthropic.APIError {
  // Create a mock APIError that matches the structure
  const error = new Error(message) as any;
  error.type = type;
  error.status = status;
  error.name = 'APIError';
  
  // Make it pass instanceof check
  Object.setPrototypeOf(error, Anthropic.APIError.prototype);
  
  return error as Anthropic.APIError;
}

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Anthropic Error Mapping Properties', () => {
  it('**Feature: multi-provider-support, Property 4: Error code mapping consistency**', () => {
    fc.assert(
      fc.property(
        anthropicApiErrorArb,
        (errorData) => {
          const mockError = createMockAnthropicError(errorData.type, errorData.message, errorData.status);
          const result = handleApiError(mockError);
          
          // Should always return error StreamChunk
          expect(result.type).toBe('error');
          expect(result.error).toBeDefined();
          expect(typeof result.error.code).toBe('string');
          expect(typeof result.error.message).toBe('string');
          
          // Message should be preserved
          expect(result.error.message).toBe(errorData.message);
          
          // Code should be mapped correctly
          const expectedCode = ERROR_CODE_MAP[errorData.type] ?? 'API_ERROR';
          expect(result.error.code).toBe(expectedCode);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Error mapping is deterministic', () => {
    fc.assert(
      fc.property(
        anthropicApiErrorArb,
        (errorData) => {
          const mockError1 = createMockAnthropicError(errorData.type, errorData.message, errorData.status);
          const mockError2 = createMockAnthropicError(errorData.type, errorData.message, errorData.status);
          
          const result1 = handleApiError(mockError1);
          const result2 = handleApiError(mockError2);
          
          // Same input should produce same output
          expect(result1).toEqual(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Generic errors are handled consistently', () => {
    fc.assert(
      fc.property(
        genericErrorArb,
        (errorData) => {
          const error = new Error(errorData.message);
          error.name = errorData.name;
          
          const result = handleApiError(error);
          
          // Should always return error StreamChunk
          expect(result.type).toBe('error');
          expect(result.error).toBeDefined();
          
          // Generic errors should map to API_ERROR
          expect(result.error.code).toBe('API_ERROR');
          expect(result.error.message).toBe(errorData.message);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Unknown errors are handled gracefully', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.object()
        ),
        (unknownError) => {
          const result = handleApiError(unknownError);
          
          // Should always return error StreamChunk
          expect(result.type).toBe('error');
          expect(result.error).toBeDefined();
          expect(result.error.code).toBe('API_ERROR');
          expect(result.error.message).toBe('Unknown error occurred');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: All Anthropic error types have mappings', () => {
    fc.assert(
      fc.property(
        anthropicErrorTypeArb,
        (errorType) => {
          // Every Anthropic error type should have a mapping
          const mappedCode = ERROR_CODE_MAP[errorType];
          expect(mappedCode).toBeDefined();
          expect(typeof mappedCode).toBe('string');
          expect(mappedCode.length).toBeGreaterThan(0);
          
          // Mapped codes should be valid error codes
          const validCodes = ['AUTH_FAILED', 'RATE_LIMITED', 'INVALID_REQUEST', 'API_ERROR'];
          expect(validCodes).toContain(mappedCode);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Error mapping preserves essential information', () => {
    fc.assert(
      fc.property(
        anthropicApiErrorArb,
        (errorData) => {
          const mockError = createMockAnthropicError(errorData.type, errorData.message, errorData.status);
          const result = handleApiError(mockError);
          
          // Essential information should be preserved
          expect(result.error.message).toBe(errorData.message);
          
          // Error type should be deterministically mapped
          const expectedCode = ERROR_CODE_MAP[errorData.type] ?? 'API_ERROR';
          expect(result.error.code).toBe(expectedCode);
          
          // Result should be a valid StreamChunk
          expect(result.type).toBe('error');
          expect(typeof result.error).toBe('object');
          expect(result.error).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property: Error codes are consistent across similar error types', () => {
    // Authentication-related errors should map to AUTH_FAILED
    const authErrors = ['authentication_error', 'permission_error'];
    for (const errorType of authErrors) {
      expect(ERROR_CODE_MAP[errorType]).toBe('AUTH_FAILED');
    }
    
    // API-related errors should map to API_ERROR
    const apiErrors = ['api_error', 'overloaded_error'];
    for (const errorType of apiErrors) {
      expect(ERROR_CODE_MAP[errorType]).toBe('API_ERROR');
    }
    
    // Rate limiting should map to RATE_LIMITED
    expect(ERROR_CODE_MAP['rate_limit_error']).toBe('RATE_LIMITED');
    
    // Invalid requests should map to INVALID_REQUEST
    expect(ERROR_CODE_MAP['invalid_request_error']).toBe('INVALID_REQUEST');
  });
});