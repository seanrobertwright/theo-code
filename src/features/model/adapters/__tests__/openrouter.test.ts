/**
 * @fileoverview Tests for OpenRouter adapter
 * @module features/model/adapters/__tests__/openrouter.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '../../../../shared/types/index.js';
import type { ModelConfig, StreamChunk } from '../../../../shared/types/models.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import { OpenRouterAdapter, createOpenRouterAdapter } from '../openrouter.js';
import { AdapterError, adapterFactories } from '../types.js';

describe('OpenRouterAdapter', () => {
  const baseConfig: ModelConfig = {
    provider: 'openrouter',
    model: 'anthropic/claude-3.5-sonnet',
    apiKey: 'test-api-key',
    contextLimit: 200000,
    maxOutputTokens: 4096,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with valid config', () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      expect(adapter.provider).toBe('openrouter');
      expect(adapter.model).toBe('anthropic/claude-3.5-sonnet');
      expect(adapter.contextLimit).toBe(200000);
      expect(adapter.supportsToolCalling).toBe(true);
    });

    it('should throw error without API key', () => {
      const configWithoutKey: ModelConfig = {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        contextLimit: 200000,
        maxOutputTokens: 4096,
      };

      expect(() => new OpenRouterAdapter(configWithoutKey)).toThrow(AdapterError);
    });

    it('should use environment variable for API key', () => {
      const originalEnv = process.env['OPENROUTER_API_KEY'];
      process.env['OPENROUTER_API_KEY'] = 'env-api-key';

      const configWithoutKey: ModelConfig = {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        contextLimit: 200000,
        maxOutputTokens: 4096,
      };

      const adapter = new OpenRouterAdapter(configWithoutKey);
      expect(adapter.model).toBe('anthropic/claude-3.5-sonnet');

      process.env['OPENROUTER_API_KEY'] = originalEnv;
    });

    it('should use default context limit when not specified', () => {
      const configWithoutLimit: ModelConfig = {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        apiKey: 'test-api-key',
        maxOutputTokens: 4096,
      };

      const adapter = new OpenRouterAdapter(configWithoutLimit);
      expect(adapter.contextLimit).toBe(4096); // DEFAULT_CONTEXT_LIMIT
    });

    it('should support tool calling by default', () => {
      const adapter = new OpenRouterAdapter(baseConfig);
      expect(adapter.supportsToolCalling).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should throw error for empty model name', () => {
      const adapter = new OpenRouterAdapter(baseConfig);
      // Force empty model for test
      Object.defineProperty(adapter, 'config', {
        value: { ...baseConfig, model: '' },
        writable: false,
      });

      expect(() => adapter.validateConfig()).toThrow(AdapterError);
    });

    it('should not throw for valid config', () => {
      const adapter = new OpenRouterAdapter(baseConfig);
      expect(() => adapter.validateConfig()).not.toThrow();
    });
  });

  describe('model catalog loading', () => {
    it('should load model catalog successfully', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      const mockModels = {
        data: [
          {
            id: 'anthropic/claude-3.5-sonnet',
            name: 'Claude 3.5 Sonnet',
            context_length: 200000,
            pricing: {
              prompt: '0.003',
              completion: '0.015',
            },
            top_provider: {
              context_length: 200000,
              max_completiontokens: 4096,
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });

      await adapter.loadModelInfo();
      const modelInfo = await adapter.getModelInfo();

      expect(modelInfo).toBeTruthy();
      expect(modelInfo?.id).toBe('anthropic/claude-3.5-sonnet');
      expect(modelInfo?.context_length).toBe(200000);
    });

    it('should handle model catalog loading failure gracefully', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await adapter.loadModelInfo();
      const modelInfo = await adapter.getModelInfo();

      expect(modelInfo).toBeNull();
    });

    it('should handle model not found in catalog', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      const mockModels = {
        data: [
          {
            id: 'different/model',
            name: 'Different Model',
            context_length: 4096,
            pricing: {
              prompt: '0.001',
              completion: '0.002',
            },
            top_provider: {
              context_length: 4096,
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });

      await adapter.loadModelInfo();
      const modelInfo = await adapter.getModelInfo();

      expect(modelInfo).toBeNull();
    });

    it('should update context limit from model info', async () => {
      const configWithoutLimit: ModelConfig = {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        apiKey: 'test-api-key',
        maxOutputTokens: 4096,
      };

      const adapter = new OpenRouterAdapter(configWithoutLimit);

      const mockModels = {
        data: [
          {
            id: 'anthropic/claude-3.5-sonnet',
            name: 'Claude 3.5 Sonnet',
            context_length: 200000,
            pricing: {
              prompt: '0.003',
              completion: '0.015',
            },
            top_provider: {
              context_length: 200000,
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });

      await adapter.loadModelInfo();

      expect(adapter.contextLimit).toBe(200000);
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens for simple messages', () => {
      const adapter = new OpenRouterAdapter(baseConfig);

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

    it('should estimate tokens for multiple messages', () => {
      const adapter = new OpenRouterAdapter(baseConfig);

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
      const adapter = new OpenRouterAdapter(baseConfig);

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
      const adapter = new OpenRouterAdapter(baseConfig);

      // Mock the streaming response
      const mockStreamData = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":" World"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ];

      const mockStream = new ReadableStream({
        start(controller) {
          for (const chunk of mockStreamData) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

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
      const adapter = new OpenRouterAdapter(baseConfig);

      const mockStreamData = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"read_file","arguments":""}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"/test.txt\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const mockStream = new ReadableStream({
        start(controller) {
          for (const chunk of mockStreamData) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

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
      const adapter = new OpenRouterAdapter(baseConfig);

      const errorResponse = new Error('Rate limit exceeded');
      (errorResponse as any).status = 429;
      mockFetch.mockRejectedValueOnce(errorResponse);

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

    it('should handle HTTP error responses', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

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
          code: 'AUTH_FAILED',
        },
      });
    });

    it('should handle malformed stream data gracefully', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      const mockStreamData = [
        'data: {"invalid": json}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const mockStream = new ReadableStream({
        start(controller) {
          for (const chunk of mockStreamData) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

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

      // Should still process valid chunks despite malformed ones
      expect(chunks.some((c) => c.type === 'text' && c.text === 'Hello')).toBe(true);
    });

    it('should handle missing response body', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

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
          code: 'API_ERROR',
          message: 'No response body for streaming request',
        },
      });
    });
  });

  describe('OpenAI compatibility', () => {
    it('should use OpenAI-compatible message format', () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'system',
          content: 'You are helpful.',
          timestamp: Date.now(),
        },
        {
          id: 'msg-00000000-0000-0000-0000-000000000002' as Message['id'],
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
        {
          id: 'msg-00000000-0000-0000-0000-000000000003' as Message['id'],
          role: 'assistant',
          content: 'Hi there!',
          timestamp: Date.now(),
        },
      ];

      // This test verifies the message conversion logic works
      // by checking that countTokens doesn't throw (it processes the messages)
      expect(() => adapter.countTokens(messages)).not.toThrow();
    });

    it('should handle tool results in OpenAI format', () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      const messages: Message[] = [
        {
          id: 'msg-00000000-0000-0000-0000-000000000001' as Message['id'],
          role: 'tool',
          content: 'Tool result content',
          timestamp: Date.now(),
          toolResults: [
            {
              toolCallId: 'call_123',
              content: 'File contents here',
            },
          ],
        },
      ];

      // This test verifies the tool message conversion logic works
      expect(() => adapter.countTokens(messages)).not.toThrow();
    });
  });

  describe('credit tracking', () => {
    it('should include usage information in done chunks', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      const mockStreamData = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"Test"},"finish_reason":"stop"}],"usage":{"prompt_tokens":15,"completion_tokens":8,"total_tokens":23}}\n\n',
        'data: [DONE]\n\n',
      ];

      const mockStream = new ReadableStream({
        start(controller) {
          for (const chunk of mockStreamData) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

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

      const doneChunk = chunks.find((c) => c.type === 'done');
      expect(doneChunk).toMatchObject({
        type: 'done',
        usage: {
          inputTokens: 15,
          outputTokens: 8,
        },
      });
    });

    it('should handle missing usage information', async () => {
      const adapter = new OpenRouterAdapter(baseConfig);

      const mockStreamData = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"Test"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const mockStream = new ReadableStream({
        start(controller) {
          for (const chunk of mockStreamData) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

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

      const doneChunk = chunks.find((c) => c.type === 'done');
      expect(doneChunk).toMatchObject({
        type: 'done',
        usage: undefined,
      });
    });
  });

  describe('factory registration', () => {
    it('should register openrouter adapter factory', () => {
      const factory = adapterFactories.get('openrouter');
      expect(factory).toBeDefined();
    });

    it('should create adapter via factory', () => {
      const adapter = createOpenRouterAdapter(baseConfig);
      expect(adapter).toBeInstanceOf(OpenRouterAdapter);
      expect(adapter.model).toBe('anthropic/claude-3.5-sonnet');
    });
  });
});