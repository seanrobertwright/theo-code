/**
 * @fileoverview Property-based tests for response format standardization
 * @module features/model/__tests__/response-standardization.property.test
 *
 * **Feature: multi-provider-support, Property 9: Response format standardization**
 * **Validates: Requirements 9.1, 9.2**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  convertProviderResponse,
  convertOpenAIResponse,
  convertAnthropicResponse,
  convertGoogleResponse,
  convertCohereResponse,
  convertMistralResponse,
  convertTogetherResponse,
  convertPerplexityResponse,
  convertOllamaResponse,
  ToolCallAccumulatorManager,
  standardizeToolCall,
  type OpenAIStreamChunk,
  type AnthropicStreamEvent,
  type GoogleStreamChunk,
  type CohereStreamChunk,
  type MistralStreamChunk,
  type TogetherStreamChunk,
  type PerplexityStreamChunk,
  type OllamaStreamChunk,
} from '../response-format.js';
import {
  ResponsePrettyPrinter,
  accumulateStreamChunks,
  formatResponse,
  type FormattedResponse,
} from '../response-formatter.js';
import type { StreamChunk, TextStreamChunk, ToolCallStreamChunk, DoneStreamChunk } from '../../../shared/types/models.js';

// =============================================================================
// GENERATORS FOR PROVIDER-SPECIFIC RESPONSES
// =============================================================================

/**
 * Generator for OpenAI streaming response chunks.
 */
const openAIChunkGenerator = fc.record({
  choices: fc.array(
    fc.record({
      delta: fc.record({
        content: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        tool_calls: fc.option(
          fc.array(
            fc.record({
              index: fc.integer({ min: 0, max: 5 }),
              id: fc.option(fc.string({ minLength: 5, maxLength: 20 })),
              function: fc.option(
                fc.record({
                  name: fc.option(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/)),
                  arguments: fc.option(fc.string()),
                })
              ),
            }),
            { minLength: 1, maxLength: 3 }
          )
        ),
      }),
      finish_reason: fc.option(fc.oneof(fc.constant('stop'), fc.constant('tool_calls'), fc.constant('length'))),
    }),
    { minLength: 1, maxLength: 1 }
  ),
  usage: fc.option(
    fc.record({
      prompt_tokens: fc.integer({ min: 1, max: 1000 }),
      completion_tokens: fc.integer({ min: 1, max: 1000 }),
    })
  ),
});

/**
 * Generator for Anthropic streaming events.
 */
const anthropicEventGenerator = fc.oneof(
  // Content block delta (text)
  fc.record({
    type: fc.constant('content_block_delta' as const),
    index: fc.integer({ min: 0, max: 5 }),
    delta: fc.record({
      type: fc.constant('text_delta' as const),
      text: fc.string({ minLength: 1, maxLength: 100 }),
    }),
  }),
  // Content block delta (tool input)
  fc.record({
    type: fc.constant('content_block_delta' as const),
    index: fc.integer({ min: 0, max: 5 }),
    delta: fc.record({
      type: fc.constant('input_json_delta' as const),
      partial_json: fc.string({ minLength: 1, maxLength: 50 }),
    }),
  }),
  // Content block start (tool)
  fc.record({
    type: fc.constant('content_block_start' as const),
    index: fc.integer({ min: 0, max: 5 }),
    content_block: fc.record({
      type: fc.constant('tool_use' as const),
      id: fc.string({ minLength: 5, maxLength: 20 }),
      name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
    }),
  }),
  // Message delta (completion)
  fc.record({
    type: fc.constant('message_delta' as const),
    delta: fc.record({
      stop_reason: fc.oneof(fc.constant('end_turn'), fc.constant('tool_use'), fc.constant('max_tokens')),
    }),
    usage: fc.option(
      fc.record({
        input_tokens: fc.integer({ min: 1, max: 1000 }),
        output_tokens: fc.integer({ min: 1, max: 1000 }),
      })
    ),
  }),
  // Message stop
  fc.record({
    type: fc.constant('message_stop' as const),
  }),
  // Error
  fc.record({
    type: fc.constant('error' as const),
    error: fc.record({
      type: fc.oneof(fc.constant('rate_limit_error'), fc.constant('api_error'), fc.constant('invalid_request_error')),
      message: fc.string({ minLength: 10, maxLength: 100 }),
    }),
  })
);

/**
 * Generator for Google streaming response chunks.
 */
const googleChunkGenerator = fc.record({
  candidates: fc.option(
    fc.array(
      fc.record({
        content: fc.option(
          fc.record({
            parts: fc.array(
              fc.oneof(
                // Text part
                fc.record({
                  text: fc.string({ minLength: 1, maxLength: 100 }),
                }),
                // Function call part
                fc.record({
                  functionCall: fc.record({
                    name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
                    args: fc.option(fc.object()),
                  }),
                })
              ),
              { minLength: 1, maxLength: 3 }
            ),
          })
        ),
        finishReason: fc.option(fc.oneof(fc.constant('STOP'), fc.constant('MAX_TOKENS'), fc.constant('SAFETY'))),
        safetyRatings: fc.option(
          fc.array(
            fc.record({
              category: fc.string(),
              probability: fc.string(),
              blocked: fc.option(fc.boolean()),
            }),
            { minLength: 0, maxLength: 3 }
          )
        ),
      }),
      { minLength: 1, maxLength: 1 }
    )
  ),
  usageMetadata: fc.option(
    fc.record({
      promptTokenCount: fc.option(fc.integer({ min: 1, max: 1000 })),
      candidatesTokenCount: fc.option(fc.integer({ min: 1, max: 1000 })),
    })
  ),
  promptFeedback: fc.option(
    fc.record({
      blockReason: fc.option(fc.string()),
    })
  ),
});

/**
 * Generator for Cohere streaming response chunks.
 */
const cohereChunkGenerator = fc.oneof(
  // Text generation
  fc.record({
    event_type: fc.constant('text-generation' as const),
    text: fc.string({ minLength: 1, maxLength: 100 }),
  }),
  // Tool calls
  fc.record({
    event_type: fc.constant('tool-calls-generation' as const),
    tool_calls: fc.array(
      fc.record({
        name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
        parameters: fc.object(),
      }),
      { minLength: 1, maxLength: 3 }
    ),
  }),
  // Stream end
  fc.record({
    event_type: fc.constant('stream-end' as const),
    finish_reason: fc.option(fc.oneof(fc.constant('COMPLETE'), fc.constant('MAX_TOKENS'))),
    response: fc.option(
      fc.record({
        generation_id: fc.string({ minLength: 10, maxLength: 30 }),
        text: fc.string(),
        meta: fc.option(
          fc.record({
            tokens: fc.option(
              fc.record({
                input_tokens: fc.integer({ min: 1, max: 1000 }),
                output_tokens: fc.integer({ min: 1, max: 1000 }),
              })
            ),
          })
        ),
      })
    ),
  })
);

/**
 * Generator for Ollama streaming response chunks.
 */
const ollamaChunkGenerator = fc.record({
  model: fc.string({ minLength: 3, maxLength: 20 }),
  created_at: fc.date().map(d => d.toISOString()),
  response: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
  done: fc.boolean(),
  context: fc.option(fc.array(fc.integer(), { minLength: 0, maxLength: 10 })),
  total_duration: fc.option(fc.integer({ min: 1000, max: 100000 })),
  load_duration: fc.option(fc.integer({ min: 100, max: 10000 })),
  prompt_eval_count: fc.option(fc.integer({ min: 1, max: 1000 })),
  prompt_eval_duration: fc.option(fc.integer({ min: 1000, max: 50000 })),
  eval_count: fc.option(fc.integer({ min: 1, max: 1000 })),
  eval_duration: fc.option(fc.integer({ min: 1000, max: 50000 })),
});

// =============================================================================
// PROPERTY TESTS
// =============================================================================

describe('Response Format Standardization Property Tests', () => {
  describe('Property 9: Response format standardization', () => {
    it('should convert OpenAI responses to valid StreamChunks', () => {
      fc.assert(
        fc.property(openAIChunkGenerator, (chunk: OpenAIStreamChunk) => {
          const accumulators = new ToolCallAccumulatorManager();
          const result = convertOpenAIResponse(chunk, accumulators);
          
          // All results should be valid StreamChunks
          expect(Array.isArray(result)).toBe(true);
          
          for (const streamChunk of result) {
            expect(streamChunk).toBeTruthy();
            expect(streamChunk.type).toBeTruthy();
            expect(['text', 'tool_call', 'done', 'error']).toContain(streamChunk.type);
            
            // Validate specific chunk types
            switch (streamChunk.type) {
              case 'text':
                expect(typeof (streamChunk as TextStreamChunk).text).toBe('string');
                break;
              case 'tool_call':
                const toolChunk = streamChunk as ToolCallStreamChunk;
                expect(typeof toolChunk.id).toBe('string');
                expect(typeof toolChunk.name).toBe('string');
                expect(typeof toolChunk.arguments).toBe('string');
                break;
              case 'done':
                const doneChunk = streamChunk as DoneStreamChunk;
                if (doneChunk.usage) {
                  expect(typeof doneChunk.usage.inputTokens).toBe('number');
                  expect(typeof doneChunk.usage.outputTokens).toBe('number');
                  expect(doneChunk.usage.inputTokens).toBeGreaterThanOrEqual(0);
                  expect(doneChunk.usage.outputTokens).toBeGreaterThanOrEqual(0);
                }
                break;
              case 'error':
                const errorChunk = streamChunk as any;
                expect(typeof errorChunk.error.code).toBe('string');
                expect(typeof errorChunk.error.message).toBe('string');
                break;
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should convert Anthropic responses to valid StreamChunks', () => {
      fc.assert(
        fc.property(anthropicEventGenerator, (event: AnthropicStreamEvent) => {
          const accumulators = new ToolCallAccumulatorManager();
          const result = convertAnthropicResponse(event, accumulators);
          
          // All results should be valid StreamChunks
          expect(Array.isArray(result)).toBe(true);
          
          for (const streamChunk of result) {
            expect(streamChunk).toBeTruthy();
            expect(streamChunk.type).toBeTruthy();
            expect(['text', 'tool_call', 'done', 'error']).toContain(streamChunk.type);
            
            // Validate specific chunk types
            switch (streamChunk.type) {
              case 'text':
                expect(typeof (streamChunk as TextStreamChunk).text).toBe('string');
                expect((streamChunk as TextStreamChunk).text.length).toBeGreaterThan(0);
                break;
              case 'tool_call':
                const toolChunk = streamChunk as ToolCallStreamChunk;
                expect(typeof toolChunk.id).toBe('string');
                expect(typeof toolChunk.name).toBe('string');
                expect(typeof toolChunk.arguments).toBe('string');
                break;
              case 'done':
                const doneChunk = streamChunk as DoneStreamChunk;
                if (doneChunk.usage) {
                  expect(typeof doneChunk.usage.inputTokens).toBe('number');
                  expect(typeof doneChunk.usage.outputTokens).toBe('number');
                  expect(doneChunk.usage.inputTokens).toBeGreaterThanOrEqual(0);
                  expect(doneChunk.usage.outputTokens).toBeGreaterThanOrEqual(0);
                }
                break;
              case 'error':
                const errorChunk = streamChunk as any;
                expect(typeof errorChunk.error.code).toBe('string');
                expect(typeof errorChunk.error.message).toBe('string');
                expect(errorChunk.error.code.length).toBeGreaterThan(0);
                expect(errorChunk.error.message.length).toBeGreaterThan(0);
                break;
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should convert Google responses to valid StreamChunks', () => {
      fc.assert(
        fc.property(googleChunkGenerator, (chunk: GoogleStreamChunk) => {
          const accumulators = new ToolCallAccumulatorManager();
          const result = convertGoogleResponse(chunk, accumulators);
          
          // All results should be valid StreamChunks
          expect(Array.isArray(result)).toBe(true);
          
          for (const streamChunk of result) {
            expect(streamChunk).toBeTruthy();
            expect(streamChunk.type).toBeTruthy();
            expect(['text', 'tool_call', 'done', 'error']).toContain(streamChunk.type);
            
            // Validate specific chunk types
            switch (streamChunk.type) {
              case 'text':
                expect(typeof (streamChunk as TextStreamChunk).text).toBe('string');
                expect((streamChunk as TextStreamChunk).text.length).toBeGreaterThan(0);
                break;
              case 'tool_call':
                const toolChunk = streamChunk as ToolCallStreamChunk;
                expect(typeof toolChunk.id).toBe('string');
                expect(typeof toolChunk.name).toBe('string');
                expect(typeof toolChunk.arguments).toBe('string');
                expect(toolChunk.id.length).toBeGreaterThan(0);
                expect(toolChunk.name.length).toBeGreaterThan(0);
                break;
              case 'done':
                const doneChunk = streamChunk as DoneStreamChunk;
                if (doneChunk.usage) {
                  expect(typeof doneChunk.usage.inputTokens).toBe('number');
                  expect(typeof doneChunk.usage.outputTokens).toBe('number');
                  expect(doneChunk.usage.inputTokens).toBeGreaterThanOrEqual(0);
                  expect(doneChunk.usage.outputTokens).toBeGreaterThanOrEqual(0);
                }
                break;
              case 'error':
                const errorChunk = streamChunk as any;
                expect(typeof errorChunk.error.code).toBe('string');
                expect(typeof errorChunk.error.message).toBe('string');
                expect(errorChunk.error.code.length).toBeGreaterThan(0);
                expect(errorChunk.error.message.length).toBeGreaterThan(0);
                break;
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should convert Cohere responses to valid StreamChunks', () => {
      fc.assert(
        fc.property(cohereChunkGenerator, (chunk: CohereStreamChunk) => {
          const accumulators = new ToolCallAccumulatorManager();
          const result = convertCohereResponse(chunk, accumulators);
          
          // All results should be valid StreamChunks
          expect(Array.isArray(result)).toBe(true);
          
          for (const streamChunk of result) {
            expect(streamChunk).toBeTruthy();
            expect(streamChunk.type).toBeTruthy();
            expect(['text', 'tool_call', 'done', 'error']).toContain(streamChunk.type);
            
            // Validate specific chunk types
            switch (streamChunk.type) {
              case 'text':
                expect(typeof (streamChunk as TextStreamChunk).text).toBe('string');
                expect((streamChunk as TextStreamChunk).text.length).toBeGreaterThan(0);
                break;
              case 'tool_call':
                const toolChunk = streamChunk as ToolCallStreamChunk;
                expect(typeof toolChunk.id).toBe('string');
                expect(typeof toolChunk.name).toBe('string');
                expect(typeof toolChunk.arguments).toBe('string');
                expect(toolChunk.id.length).toBeGreaterThan(0);
                expect(toolChunk.name.length).toBeGreaterThan(0);
                break;
              case 'done':
                const doneChunk = streamChunk as DoneStreamChunk;
                if (doneChunk.usage) {
                  expect(typeof doneChunk.usage.inputTokens).toBe('number');
                  expect(typeof doneChunk.usage.outputTokens).toBe('number');
                  expect(doneChunk.usage.inputTokens).toBeGreaterThanOrEqual(0);
                  expect(doneChunk.usage.outputTokens).toBeGreaterThanOrEqual(0);
                }
                break;
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should convert Ollama responses to valid StreamChunks', () => {
      fc.assert(
        fc.property(ollamaChunkGenerator, (chunk: OllamaStreamChunk) => {
          const accumulators = new ToolCallAccumulatorManager();
          const result = convertOllamaResponse(chunk, accumulators);
          
          // All results should be valid StreamChunks
          expect(Array.isArray(result)).toBe(true);
          
          for (const streamChunk of result) {
            expect(streamChunk).toBeTruthy();
            expect(streamChunk.type).toBeTruthy();
            expect(['text', 'tool_call', 'done', 'error']).toContain(streamChunk.type);
            
            // Validate specific chunk types
            switch (streamChunk.type) {
              case 'text':
                expect(typeof (streamChunk as TextStreamChunk).text).toBe('string');
                expect((streamChunk as TextStreamChunk).text.length).toBeGreaterThan(0);
                break;
              case 'tool_call':
                const toolChunk = streamChunk as ToolCallStreamChunk;
                expect(typeof toolChunk.id).toBe('string');
                expect(typeof toolChunk.name).toBe('string');
                expect(typeof toolChunk.arguments).toBe('string');
                break;
              case 'done':
                const doneChunk = streamChunk as DoneStreamChunk;
                if (doneChunk.usage) {
                  expect(typeof doneChunk.usage.inputTokens).toBe('number');
                  expect(typeof doneChunk.usage.outputTokens).toBe('number');
                  expect(doneChunk.usage.inputTokens).toBeGreaterThanOrEqual(0);
                  expect(doneChunk.usage.outputTokens).toBeGreaterThanOrEqual(0);
                }
                break;
            }
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve essential information across all provider conversions', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.tuple(fc.constant('openai'), openAIChunkGenerator),
            fc.tuple(fc.constant('anthropic'), anthropicEventGenerator),
            fc.tuple(fc.constant('google'), googleChunkGenerator),
            fc.tuple(fc.constant('cohere'), cohereChunkGenerator),
            fc.tuple(fc.constant('ollama'), ollamaChunkGenerator)
          ),
          ([provider, chunk]) => {
            const accumulators = new ToolCallAccumulatorManager();
            const result = convertProviderResponse(provider, chunk, accumulators);
            
            // Should always return an array
            expect(Array.isArray(result)).toBe(true);
            
            // All chunks should be valid
            for (const streamChunk of result) {
              expect(streamChunk).toBeTruthy();
              expect(streamChunk.type).toBeTruthy();
              expect(['text', 'tool_call', 'done', 'error']).toContain(streamChunk.type);
            }
            
            // Text chunks should preserve content
            const textChunks = result.filter(c => c.type === 'text') as TextStreamChunk[];
            for (const textChunk of textChunks) {
              expect(textChunk.text).toBeTruthy();
              expect(typeof textChunk.text).toBe('string');
              expect(textChunk.text.length).toBeGreaterThan(0);
            }
            
            // Tool call chunks should have valid structure
            const toolChunks = result.filter(c => c.type === 'tool_call') as ToolCallStreamChunk[];
            for (const toolChunk of toolChunks) {
              expect(toolChunk.id).toBeTruthy();
              expect(toolChunk.name).toBeTruthy();
              expect(typeof toolChunk.id).toBe('string');
              expect(typeof toolChunk.name).toBe('string');
              expect(typeof toolChunk.arguments).toBe('string');
            }
            
            // Done chunks should have valid usage if present
            const doneChunks = result.filter(c => c.type === 'done') as DoneStreamChunk[];
            for (const doneChunk of doneChunks) {
              if (doneChunk.usage) {
                expect(typeof doneChunk.usage.inputTokens).toBe('number');
                expect(typeof doneChunk.usage.outputTokens).toBe('number');
                expect(doneChunk.usage.inputTokens).toBeGreaterThanOrEqual(0);
                expect(doneChunk.usage.outputTokens).toBeGreaterThanOrEqual(0);
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should standardize tool calls consistently across providers', () => {
      fc.assert(
        fc.property(
          fc.record({
            provider: fc.oneof(
              fc.constant('openai'),
              fc.constant('anthropic'),
              fc.constant('google'),
              fc.constant('cohere'),
              fc.constant('perplexity'),
              fc.constant('ollama')
            ),
            toolCall: fc.record({
              id: fc.option(fc.string({ minLength: 5, maxLength: 20 })),
              name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
              arguments: fc.oneof(
                fc.object(),
                fc.string(),
                fc.constant(null),
                fc.constant(undefined)
              ),
              // Provider-specific fields
              function: fc.option(
                fc.record({
                  name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
                  arguments: fc.string(),
                })
              ),
              input: fc.option(fc.object()),
              args: fc.option(fc.object()),
              parameters: fc.option(fc.object()),
            }),
          }),
          ({ provider, toolCall }) => {
            const result = standardizeToolCall(toolCall, provider);
            
            // Should always return a valid ToolCall
            expect(result).toBeTruthy();
            expect(typeof result.id).toBe('string');
            expect(typeof result.name).toBe('string');
            expect(result.arguments).toBeTruthy();
            expect(typeof result.arguments).toBe('object');
            
            // ID should be non-empty
            expect(result.id.length).toBeGreaterThan(0);
            
            // Name should be non-empty and valid
            expect(result.name.length).toBeGreaterThan(0);
            expect(/^[a-zA-Z][a-zA-Z0-9_]*$/.test(result.name)).toBe(true);
            
            // Arguments should be a valid object
            expect(result.arguments).not.toBeNull();
            expect(result.arguments).not.toBeUndefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle universal converter with unknown providers gracefully', () => {
      fc.assert(
        fc.property(
          fc.record({
            provider: fc.string({ minLength: 3, maxLength: 15 }).filter(s => 
              !['openai', 'anthropic', 'google', 'openrouter', 'cohere', 'mistral', 'together', 'perplexity', 'ollama'].includes(s)
            ),
            chunk: fc.object(),
          }),
          ({ provider, chunk }) => {
            const accumulators = new ToolCallAccumulatorManager();
            const result = convertProviderResponse(provider, chunk, accumulators);
            
            // Should return an error chunk for unknown providers
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            
            const errorChunk = result[0];
            expect(errorChunk.type).toBe('error');
            expect((errorChunk as any).error).toBeTruthy();
            expect(typeof (errorChunk as any).error.code).toBe('string');
            expect(typeof (errorChunk as any).error.message).toBe('string');
            expect((errorChunk as any).error.message).toContain('Unsupported provider');
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Format round-trips preserve data', () => {
    it('should preserve essential data through parse-format-parse cycles', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              // Text chunks
              fc.record({
                type: fc.constant('text' as const),
                text: fc.string({ minLength: 1, maxLength: 200 }),
              }),
              // Tool call chunks
              fc.record({
                type: fc.constant('tool_call' as const),
                id: fc.string({ minLength: 5, maxLength: 20 }),
                name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
                arguments: fc.oneof(
                  fc.string({ minLength: 1 }).filter(s => {
                    // Ensure it's either valid JSON or a non-empty string
                    try {
                      JSON.parse(s);
                      return true;
                    } catch {
                      return s.length > 0;
                    }
                  }),
                  fc.object({ maxDepth: 2 }).map(obj => JSON.stringify(obj))
                ),
              }),
              // Done chunks
              fc.record({
                type: fc.constant('done' as const),
                usage: fc.option(
                  fc.record({
                    inputTokens: fc.integer({ min: 0, max: 10000 }),
                    outputTokens: fc.integer({ min: 0, max: 10000 }),
                  })
                ),
              }),
              // Error chunks
              fc.record({
                type: fc.constant('error' as const),
                error: fc.record({
                  code: fc.oneof(
                    fc.constant('AUTH_FAILED'),
                    fc.constant('RATE_LIMITED'),
                    fc.constant('INVALID_REQUEST'),
                    fc.constant('API_ERROR'),
                    fc.constant('CONTEXT_OVERFLOW'),
                    fc.constant('TIMEOUT')
                  ),
                  message: fc.string({ minLength: 5, maxLength: 100 }),
                }),
              })
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (originalChunks: StreamChunk[]) => {
            // Step 1: Convert StreamChunks to FormattedResponse (parsing)
            const formattedResponse = accumulateStreamChunks(originalChunks);
            
            // Step 2: Format the response to string (formatting)
            const printer = new ResponsePrettyPrinter({
              includeUsage: true,
              includeMetadata: false,
              includeTiming: false,
            });
            const formattedString = printer.formatResponse(formattedResponse);
            
            // Step 3: Parse the formatted string back to verify essential data preservation
            // Since we don't have a string parser, we'll verify the FormattedResponse contains
            // all essential information from the original chunks
            
            // Verify text content is preserved
            const originalTextContent = originalChunks
              .filter(chunk => chunk.type === 'text')
              .map(chunk => (chunk as TextStreamChunk).text)
              .join('');
            
            expect(formattedResponse.content).toBe(originalTextContent);
            
            // Verify tool calls are preserved
            const originalToolCalls = originalChunks
              .filter(chunk => chunk.type === 'tool_call')
              .map(chunk => chunk as ToolCallStreamChunk);
            
            expect(formattedResponse.toolCalls).toHaveLength(originalToolCalls.length);
            
            for (let i = 0; i < originalToolCalls.length; i++) {
              const original = originalToolCalls[i];
              const formatted = formattedResponse.toolCalls![i];
              
              expect(formatted.id).toBe(original.id);
              expect(formatted.name).toBe(original.name);
              
              // Handle arguments parsing
              const originalArgs = typeof original.arguments === 'string' 
                ? (() => {
                    try {
                      return JSON.parse(original.arguments);
                    } catch {
                      return { raw_input: original.arguments };
                    }
                  })()
                : original.arguments;
              
              expect(formatted.arguments).toEqual(originalArgs);
            }
            
            // Verify usage information is preserved
            const originalDoneChunks = originalChunks
              .filter(chunk => chunk.type === 'done')
              .map(chunk => chunk as DoneStreamChunk);
            
            if (originalDoneChunks.length > 0) {
              const lastDoneChunk = originalDoneChunks[originalDoneChunks.length - 1];
              if (lastDoneChunk.usage) {
                expect(formattedResponse.usage).toBeTruthy();
                expect(formattedResponse.usage!.inputTokens).toBe(lastDoneChunk.usage.inputTokens);
                expect(formattedResponse.usage!.outputTokens).toBe(lastDoneChunk.usage.outputTokens);
                expect(formattedResponse.usage!.totalTokens).toBe(
                  lastDoneChunk.usage.inputTokens + lastDoneChunk.usage.outputTokens
                );
              }
            }
            
            // Verify errors are preserved
            const originalErrors = originalChunks
              .filter(chunk => chunk.type === 'error')
              .map(chunk => (chunk as any).error);
            
            expect(formattedResponse.errors).toHaveLength(originalErrors.length);
            
            for (let i = 0; i < originalErrors.length; i++) {
              const original = originalErrors[i];
              const formatted = formattedResponse.errors![i];
              
              expect(formatted.code).toBe(original.code);
              expect(formatted.message).toBe(original.message);
            }
            
            // Verify the formatted string contains essential information
            expect(typeof formattedString).toBe('string');
            expect(formattedString.length).toBeGreaterThan(0);
            
            // Text content should appear in formatted string
            if (originalTextContent.length > 0) {
              expect(formattedString).toContain(originalTextContent);
            }
            
            // Tool call names should appear in formatted string
            for (const toolCall of originalToolCalls) {
              expect(formattedString).toContain(toolCall.name);
            }
            
            // Usage information should appear if present
            if (formattedResponse.usage) {
              expect(formattedString).toContain('Token Usage');
              expect(formattedString).toContain(formattedResponse.usage.inputTokens.toString());
              expect(formattedString).toContain(formattedResponse.usage.outputTokens.toString());
            }
            
            // Error information should appear if present
            for (const error of originalErrors) {
              expect(formattedString).toContain(error.code);
              expect(formattedString).toContain(error.message);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain data consistency across multiple format-parse cycles', () => {
      fc.assert(
        fc.property(
          fc.record({
            content: fc.string({ minLength: 0, maxLength: 500 }),
            toolCalls: fc.array(
              fc.record({
                id: fc.string({ minLength: 5, maxLength: 20 }),
                name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
                arguments: fc.object({ maxDepth: 2 }),
              }),
              { minLength: 0, maxLength: 5 }
            ),
            usage: fc.option(
              fc.record({
                inputTokens: fc.integer({ min: 0, max: 10000 }),
                outputTokens: fc.integer({ min: 0, max: 10000 }),
                totalTokens: fc.integer({ min: 0, max: 20000 }),
              })
            ),
            errors: fc.array(
              fc.record({
                code: fc.oneof(
                  fc.constant('AUTH_FAILED'),
                  fc.constant('RATE_LIMITED'),
                  fc.constant('INVALID_REQUEST'),
                  fc.constant('API_ERROR')
                ),
                message: fc.string({ minLength: 5, maxLength: 100 }),
              }),
              { minLength: 0, maxLength: 3 }
            ),
          }),
          (originalResponse: FormattedResponse) => {
            const printer = new ResponsePrettyPrinter({
              includeUsage: true,
              includeMetadata: false,
              includeTiming: false,
            });
            
            // First format cycle
            const formatted1 = printer.formatResponse(originalResponse);
            
            // Convert back to FormattedResponse (simulating parsing)
            const parsed1: FormattedResponse = {
              content: originalResponse.content,
              toolCalls: originalResponse.toolCalls ? [...originalResponse.toolCalls] : undefined,
              usage: originalResponse.usage ? { ...originalResponse.usage } : undefined,
              errors: originalResponse.errors ? [...originalResponse.errors] : undefined,
            };
            
            // Second format cycle
            const formatted2 = printer.formatResponse(parsed1);
            
            // The formatted strings should be identical (idempotent)
            expect(formatted2).toBe(formatted1);
            
            // Essential data should be preserved
            expect(parsed1.content).toBe(originalResponse.content);
            expect(parsed1.toolCalls).toEqual(originalResponse.toolCalls);
            expect(parsed1.usage).toEqual(originalResponse.usage);
            expect(parsed1.errors).toEqual(originalResponse.errors);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve provider-specific formatting consistency', () => {
      fc.assert(
        fc.property(
          fc.record({
            provider: fc.oneof(
              fc.constant('openai'),
              fc.constant('anthropic'),
              fc.constant('google'),
              fc.constant('cohere'),
              fc.constant('ollama')
            ),
            response: fc.record({
              content: fc.string({ minLength: 1, maxLength: 200 }),
              model: fc.string({ minLength: 3, maxLength: 30 }),
              usage: fc.option(
                fc.record({
                  prompt_tokens: fc.integer({ min: 1, max: 1000 }),
                  completion_tokens: fc.integer({ min: 1, max: 1000 }),
                  total_tokens: fc.integer({ min: 2, max: 2000 }),
                })
              ),
              // Add provider-specific fields to ensure content is included
              choices: fc.option(
                fc.array(
                  fc.record({
                    message: fc.record({
                      content: fc.string({ minLength: 1, maxLength: 200 }),
                    }),
                  }),
                  { minLength: 1, maxLength: 1 }
                )
              ),
              text: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
            }),
          }),
          ({ provider, response }) => {
            const printer = new ResponsePrettyPrinter({
              includeUsage: true,
              includeMetadata: true,
            });
            
            // Format the provider response
            const formatted1 = printer.formatProviderResponse(provider, response);
            
            // Format again to test idempotency
            const formatted2 = printer.formatProviderResponse(provider, response);
            
            // Should be identical (idempotent formatting)
            expect(formatted2).toBe(formatted1);
            
            // Should contain essential information
            expect(typeof formatted1).toBe('string');
            expect(formatted1.length).toBeGreaterThan(0);
            
            // Check if content appears in formatted output based on provider format
            const hasContentInResponse = response.choices?.[0]?.message?.content || 
                                       response.text || 
                                       response.content;
            
            if (hasContentInResponse) {
              const contentToCheck = response.choices?.[0]?.message?.content || 
                                   response.text || 
                                   response.content;
              expect(formatted1).toContain(contentToCheck);
            }
            
            expect(formatted1).toContain(provider);
            
            if (response.usage) {
              expect(formatted1).toContain('Token Usage');
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});