/**
 * @fileoverview Tests for OpenAI adapter
 * @module features/model/adapters/__tests__/openai.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '../../../../shared/types/index.js';
import type { ModelConfig, StreamChunk } from '../../../../shared/types/models.js';

// Store the mock create function
const mockCreate = vi.fn();

// Mock the OpenAI SDK before importing the module
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock tiktoken
vi.mock('tiktoken', () => ({
  encoding_for_model: vi.fn(() => ({
    encode: vi.fn((text: string) => new Array(Math.ceil(text.length / 4))),
    free: vi.fn(),
  })),
}));

// Import after mocks
import { OpenAIAdapter, createOpenAIAdapter } from '../openai.js';
import { AdapterError, adapterFactories } from '../types.js';

describe('OpenAIAdapter', () => {
  const baseConfig: ModelConfig = {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'test-api-key',
    contextLimit: 128000,
    maxOutputTokens: 4096,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with valid config', () => {
      const adapter = new OpenAIAdapter(baseConfig);

      expect(adapter.provider).toBe('openai');
      expect(adapter.model).toBe('gpt-4o');
      expect(adapter.contextLimit).toBe(128000);
      expect(adapter.supportsToolCalling).toBe(true);
    });

    it('should throw error without API key', () => {
      const configWithoutKey: ModelConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        contextLimit: 128000,
        maxOutputTokens: 4096,
      };

      expect(() => new OpenAIAdapter(configWithoutKey)).toThrow(AdapterError);
    });

    it('should use environment variable for API key', () => {
      const originalEnv = process.env['OPENAI_API_KEY'];
      process.env['OPENAI_API_KEY'] = 'env-api-key';

      const configWithoutKey: ModelConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        contextLimit: 128000,
        maxOutputTokens: 4096,
      };

      const adapter = new OpenAIAdapter(configWithoutKey);
      expect(adapter.model).toBe('gpt-4o');

      process.env['OPENAI_API_KEY'] = originalEnv;
    });

    it('should detect tool calling support correctly', () => {
      const gpt4Adapter = new OpenAIAdapter({ ...baseConfig, model: 'gpt-4o' });
      expect(gpt4Adapter.supportsToolCalling).toBe(true);

      const o1Adapter = new OpenAIAdapter({ ...baseConfig, model: 'o1' });
      expect(o1Adapter.supportsToolCalling).toBe(false);
    });

    it('should use config context limit', () => {
      const customConfig: ModelConfig = {
        ...baseConfig,
        contextLimit: 50000,
      };

      const adapter = new OpenAIAdapter(customConfig);
      expect(adapter.contextLimit).toBe(50000);
    });
  });

  describe('validateConfig', () => {
    it('should throw error for empty model name', () => {
      const adapter = new OpenAIAdapter(baseConfig);
      // Force empty model for test
      Object.defineProperty(adapter, 'config', {
        value: { ...baseConfig, model: '' },
        writable: false,
      });

      expect(() => adapter.validateConfig()).toThrow(AdapterError);
    });

    it('should not throw for valid config', () => {
      const adapter = new OpenAIAdapter(baseConfig);
      expect(() => adapter.validateConfig()).not.toThrow();
    });
  });

  describe('countTokens', () => {
    it('should count tokens for simple messages', () => {
      const adapter = new OpenAIAdapter(baseConfig);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'user',
          content: 'Hello, how are you?',
          timestamp: Date.now(),
        },
      ];

      const count = adapter.countTokens(messages);
      expect(count).toBeGreaterThan(0);
    });

    it('should count tokens for multiple messages', () => {
      const adapter = new OpenAIAdapter(baseConfig);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'system',
          content: 'You are a helpful assistant.',
          timestamp: Date.now(),
        },
        {
          id: 'msg-00000000-0000-0000-0000-000000000002' as Message['id'],
          role: 'user',
          content: 'Tell me a joke.',
          timestamp: Date.now(),
        },
      ];

      const count = adapter.countTokens(messages);
      expect(count).toBeGreaterThan(0);
    });

    it('should handle content blocks', () => {
      const adapter = new OpenAIAdapter(baseConfig);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'user',
          content: [{ type: 'text', text: 'Hello there!' }],
          timestamp: Date.now(),
        },
      ];

      const count = adapter.countTokens(messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('generateStream', () => {
    it('should yield text chunks from stream', async () => {
      const adapter = new OpenAIAdapter(baseConfig);

      // Mock the stream
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{
              delta: { content: 'Hello' },
              finish_reason: null,
            }],
          };
          yield {
            choices: [{
              delta: { content: ' World' },
              finish_reason: null,
            }],
          };
          yield {
            choices: [{
              delta: {},
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'user',
          content: 'Say hello',
          timestamp: Date.now(),
        },
      ];

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'text', text: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'text', text: ' World' });
      expect(chunks[2]).toEqual({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 5 },
      });
    });

    it('should accumulate and yield tool calls', async () => {
      const adapter = new OpenAIAdapter(baseConfig);

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_123',
                  function: { name: 'read_file', arguments: '' },
                }],
              },
              finish_reason: null,
            }],
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  function: { arguments: '{"path":' },
                }],
              },
              finish_reason: null,
            }],
          };
          yield {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  function: { arguments: '"/test.txt"}' },
                }],
              },
              finish_reason: null,
            }],
          };
          yield {
            choices: [{
              delta: {},
              finish_reason: 'tool_calls',
            }],
          };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'user',
          content: 'Read test.txt',
          timestamp: Date.now(),
        },
      ];

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.type === 'tool_call')).toBe(true);
      const toolCallChunk = chunks.find((c) => c.type === 'tool_call');
      expect(toolCallChunk).toMatchObject({
        type: 'tool_call',
        id: 'call_123',
        name: 'read_file',
        arguments: '{"path":"/test.txt"}',
      });
    });

    it('should handle API errors gracefully', async () => {
      const adapter = new OpenAIAdapter(baseConfig);

      mockCreate.mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), { status: 429 })
      );

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        type: 'error',
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded',
        },
      });
    });

    it('should handle unknown errors', async () => {
      const adapter = new OpenAIAdapter(baseConfig);

      mockCreate.mockRejectedValue('unknown');

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks[0]).toMatchObject({
        type: 'error',
        error: {
          code: 'API_ERROR',
          message: 'Unknown error occurred',
        },
      });
    });

    it('should skip empty deltas', async () => {
      const adapter = new OpenAIAdapter(baseConfig);

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{}] }; // No delta
          yield {
            choices: [{
              delta: { content: 'Hi' },
              finish_reason: null,
            }],
          };
          yield {
            choices: [{
              delta: {},
              finish_reason: 'stop',
            }],
          };
        },
      };

      mockCreate.mockResolvedValue(mockStream);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'user',
          content: 'Test',
          timestamp: Date.now(),
        },
      ];

      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'text', text: 'Hi' });
    });
  });

  describe('factory registration', () => {
    it('should register openai adapter factory', () => {
      const factory = adapterFactories.get('openai');
      expect(factory).toBeDefined();
    });

    it('should create adapter via factory', () => {
      const adapter = createOpenAIAdapter(baseConfig);
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
      expect(adapter.model).toBe('gpt-4o');
    });
  });
});

describe('AdapterError', () => {
  it('should create error with correct properties', () => {
    const error = new AdapterError('AUTH_FAILED', 'openai', 'Invalid API key');

    expect(error.code).toBe('AUTH_FAILED');
    expect(error.provider).toBe('openai');
    expect(error.message).toBe('[openai] Invalid API key');
    expect(error.name).toBe('AdapterError');
  });

  it('should be instanceof Error', () => {
    const error = new AdapterError('API_ERROR', 'openai', 'Test');
    expect(error).toBeInstanceOf(Error);
  });
});
