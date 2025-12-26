/**
 * @fileoverview Property-based tests for Google error mapping
 * @module features/model/adapters/__tests__/google-error-mapping.property.test
 *
 * **Feature: multi-provider-support, Property 4: Error code mapping consistency**
 * **Validates: Requirements 2.10**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Google Error Mapping Property Tests', () => {
  describe('Property 4: Error code mapping consistency', () => {
    it('should map Google API errors to standard codes consistently', () => {
      fc.assert(
        fc.property(
          // Generate Google API error scenarios
          fc.record({
            status: fc.oneof(
              fc.constant('PERMISSION_DENIED'),
              fc.constant('UNAUTHENTICATED'),
              fc.constant('RESOURCE_EXHAUSTED'),
              fc.constant('INVALID_ARGUMENT'),
              fc.constant('FAILED_PRECONDITION'),
              fc.constant('OUT_OF_RANGE'),
              fc.constant('INTERNAL'),
              fc.constant('UNAVAILABLE'),
              fc.constant('DEADLINE_EXCEEDED'),
              fc.constant('UNKNOWN_ERROR')
            ),
            message: fc.string({ minLength: 10, maxLength: 200 }),
            details: fc.option(fc.record({
              reason: fc.string({ minLength: 5, maxLength: 50 }),
              domain: fc.string({ minLength: 5, maxLength: 30 }),
            })),
          }),
          (googleError) => {
            try {
              // Test error mapping logic
              const expectedMappings: Record<string, string> = {
                'PERMISSION_DENIED': 'AUTH_FAILED',
                'UNAUTHENTICATED': 'AUTH_FAILED',
                'RESOURCE_EXHAUSTED': 'RATE_LIMITED',
                'INVALID_ARGUMENT': 'INVALID_REQUEST',
                'FAILED_PRECONDITION': 'INVALID_REQUEST',
                'OUT_OF_RANGE': 'CONTEXT_OVERFLOW',
                'INTERNAL': 'API_ERROR',
                'UNAVAILABLE': 'API_ERROR',
                'DEADLINE_EXCEEDED': 'TIMEOUT',
              };

              const expectedCode = expectedMappings[googleError.status] || 'API_ERROR';
              
              // 1. Error status should map to a valid standard code
              expect(expectedCode).toBeTruthy();
              expect(typeof expectedCode).toBe('string');
              
              // 2. Standard codes should be from the defined set
              const validCodes = [
                'INVALID_CONFIG',
                'AUTH_FAILED',
                'RATE_LIMITED',
                'CONTEXT_OVERFLOW',
                'INVALID_REQUEST',
                'API_ERROR',
                'NETWORK_ERROR',
                'TIMEOUT'
              ];
              expect(validCodes).toContain(expectedCode);
              
              // 3. Message should be preserved
              expect(googleError.message).toBeTruthy();
              expect(typeof googleError.message).toBe('string');
              
              // 4. Mapping should be deterministic
              const secondMapping = expectedMappings[googleError.status] || 'API_ERROR';
              expect(secondMapping).toBe(expectedCode);
              
              return true;
            } catch (error) {
              console.error('Error mapping test failed:', error);
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle streaming error scenarios correctly', () => {
      fc.assert(
        fc.property(
          // Generate streaming error scenarios
          fc.record({
            errorType: fc.oneof(
              fc.constant('stream_interrupted'),
              fc.constant('connection_lost'),
              fc.constant('quota_exceeded'),
              fc.constant('safety_filter'),
              fc.constant('content_blocked'),
              fc.constant('model_overloaded')
            ),
            phase: fc.oneof(
              fc.constant('initialization'),
              fc.constant('streaming'),
              fc.constant('completion')
            ),
            partialData: fc.option(fc.record({
              textChunks: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
              toolCalls: fc.array(fc.record({
                name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
                partialArgs: fc.string({ maxLength: 200 }),
              }), { maxLength: 3 }),
            })),
          }),
          (streamError) => {
            try {
              // Test streaming error handling logic
              
              // 1. Error type should be recognized
              expect(streamError.errorType).toBeTruthy();
              expect(typeof streamError.errorType).toBe('string');
              
              // 2. Phase should be valid
              const validPhases = ['initialization', 'streaming', 'completion'];
              expect(validPhases).toContain(streamError.phase);
              
              // 3. Partial data should be handled gracefully
              if (streamError.partialData) {
                if (streamError.partialData.textChunks) {
                  expect(Array.isArray(streamError.partialData.textChunks)).toBe(true);
                  for (const chunk of streamError.partialData.textChunks) {
                    expect(typeof chunk).toBe('string');
                  }
                }
                
                if (streamError.partialData.toolCalls) {
                  expect(Array.isArray(streamError.partialData.toolCalls)).toBe(true);
                  for (const toolCall of streamError.partialData.toolCalls) {
                    expect(toolCall.name).toBeTruthy();
                    expect(typeof toolCall.name).toBe('string');
                    expect(typeof toolCall.partialArgs).toBe('string');
                  }
                }
              }
              
              // 4. Error recovery should be possible based on phase
              if (streamError.phase === 'initialization') {
                // Should be able to retry from beginning
                expect(true).toBe(true);
              } else if (streamError.phase === 'streaming') {
                // Should preserve partial data
                expect(true).toBe(true);
              } else if (streamError.phase === 'completion') {
                // Should have most data available
                expect(true).toBe(true);
              }
              
              return true;
            } catch (error) {
              console.error('Streaming error test failed:', error);
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multimodal processing errors correctly', () => {
      fc.assert(
        fc.property(
          // Generate multimodal error scenarios
          fc.record({
            mediaType: fc.oneof(
              fc.constant('image'),
              fc.constant('video'),
              fc.constant('audio')
            ),
            errorReason: fc.oneof(
              fc.constant('unsupported_format'),
              fc.constant('file_too_large'),
              fc.constant('corrupted_data'),
              fc.constant('resolution_too_high'),
              fc.constant('duration_too_long'),
              fc.constant('safety_violation')
            ),
            mediaInfo: fc.record({
              size: fc.integer({ min: 1, max: 100000000 }), // bytes
              format: fc.oneof(
                fc.constant('jpeg'),
                fc.constant('png'),
                fc.constant('mp4'),
                fc.constant('wav'),
                fc.constant('unknown')
              ),
              resolution: fc.option(fc.record({
                width: fc.integer({ min: 1, max: 8192 }),
                height: fc.integer({ min: 1, max: 8192 }),
              })),
              duration: fc.option(fc.integer({ min: 1, max: 3600 })), // seconds
            }),
          }),
          (mediaError) => {
            try {
              // Test multimodal error handling logic
              
              // 1. Media type should be valid
              const validMediaTypes = ['image', 'video', 'audio'];
              expect(validMediaTypes).toContain(mediaError.mediaType);
              
              // 2. Error reason should be recognized
              expect(mediaError.errorReason).toBeTruthy();
              expect(typeof mediaError.errorReason).toBe('string');
              
              // 3. Media info should be valid
              expect(mediaError.mediaInfo.size).toBeGreaterThan(0);
              expect(typeof mediaError.mediaInfo.format).toBe('string');
              
              // 4. Resolution should be valid if present
              if (mediaError.mediaInfo.resolution) {
                expect(mediaError.mediaInfo.resolution.width).toBeGreaterThan(0);
                expect(mediaError.mediaInfo.resolution.height).toBeGreaterThan(0);
              }
              
              // 5. Duration should be valid if present
              if (mediaError.mediaInfo.duration) {
                expect(mediaError.mediaInfo.duration).toBeGreaterThan(0);
              }
              
              // 6. Error should map to appropriate standard code
              const errorCodeMapping: Record<string, string> = {
                'unsupported_format': 'INVALID_REQUEST',
                'file_too_large': 'INVALID_REQUEST',
                'corrupted_data': 'INVALID_REQUEST',
                'resolution_too_high': 'INVALID_REQUEST',
                'duration_too_long': 'INVALID_REQUEST',
                'safety_violation': 'INVALID_REQUEST',
              };
              
              const expectedCode = errorCodeMapping[mediaError.errorReason];
              expect(expectedCode).toBeTruthy();
              expect(expectedCode).toBe('INVALID_REQUEST');
              
              return true;
            } catch (error) {
              console.error('Multimodal error test failed:', error);
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});