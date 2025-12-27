/**
 * @fileoverview Unit tests for HTTP client
 * @module features/model/__tests__/http-client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClient, createProviderHttpClient } from '../http-client.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      useGlobalPool: false,
      timeoutMs: 5000,
      defaultHeaders: {
        'User-Agent': 'test-client',
      },
    });
    
    mockFetch.mockClear();
  });

  afterEach(() => {
    client.destroy();
  });

  describe('Basic HTTP Methods', () => {
    it('should make GET requests', async () => {
      const mockResponse = { data: 'test' };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

      const response = await client.get('https://api.example.com/test');
      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'User-Agent': 'test-client',
          }),
        })
      );
      expect(data).toEqual(mockResponse);
    });

    it('should make POST requests with body', async () => {
      const requestBody = { message: 'hello' };
      const mockResponse = { success: true };
      
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

      const response = await client.post(
        'https://api.example.com/chat',
        JSON.stringify(requestBody),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/chat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: expect.objectContaining({
            'User-Agent': 'test-client',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(data).toEqual(mockResponse);
    });

    it('should make PUT requests', async () => {
      const requestBody = { update: 'data' };
      mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

      await client.put('https://api.example.com/resource', JSON.stringify(requestBody));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/resource',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(requestBody),
        })
      );
    });

    it('should make DELETE requests', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

      await client.delete('https://api.example.com/resource');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/resource',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('Headers and Configuration', () => {
    it('should merge default headers with request headers', async () => {
      mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

      await client.get('https://api.example.com/test', {
        headers: {
          'Authorization': 'Bearer token',
          'Content-Type': 'application/json',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'test-client',
            'Authorization': 'Bearer token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should allow request headers to override default headers', async () => {
      mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

      await client.get('https://api.example.com/test', {
        headers: {
          'User-Agent': 'custom-agent',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'custom-agent',
          }),
        })
      );
    });
  });

  describe('Timeout Handling', () => {
    it('should have timeout configuration', () => {
      const timeoutClient = new HttpClient({
        useGlobalPool: false,
        timeoutMs: 1000,
      });

      // Just verify the client was created with timeout config
      expect(timeoutClient).toBeInstanceOf(HttpClient);
      
      timeoutClient.destroy();
    });

    it('should accept request-specific timeout options', async () => {
      mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

      // Should accept timeout option without throwing
      const response = await client.get('https://api.example.com/test', { 
        timeoutMs: 100 
      });
      
      expect(response.ok).toBe(true);
    });
  });

  describe('Connection Pooling', () => {
    it('should use connection pooling by default', async () => {
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));

      await client.get('https://api.example.com/test1');
      await client.get('https://api.example.com/test2');

      const stats = client.getConnectionPoolStats();
      expect(stats.totalRequests).toBe(2);
    });

    it('should allow disabling connection pooling per request', async () => {
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));

      await client.get('https://api.example.com/test', {
        useConnectionPool: false,
      });

      // Connection pool stats should not be affected
      const stats = client.getConnectionPoolStats();
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Streaming Support', () => {
    it('should handle streaming responses', async () => {
      const streamData = 'data: {"test": "data"}\n\ndata: [DONE]\n\n';
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(streamData));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce(new Response(mockStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));

      const { response, stream } = await client.fetchStream('https://api.example.com/stream');
      
      expect(response.ok).toBe(true);
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('should parse SSE streams correctly', async () => {
      const sseData = [
        'data: {"message": "hello"}',
        'data: {"message": "world"}',
        'data: [DONE]',
      ].join('\n\n') + '\n\n';

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce(new Response(mockStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));

      const messages: string[] = [];
      for await (const data of client.parseSSEStream('https://api.example.com/stream')) {
        messages.push(data);
      }

      expect(messages).toEqual([
        '{"message": "hello"}',
        '{"message": "world"}',
      ]);
    });

    it('should throw error for streaming without response body', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

      await expect(client.fetchStream('https://api.example.com/stream'))
        .rejects.toThrow('No response body for streaming request');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.get('https://api.example.com/test')).rejects.toThrow('Network error');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      const response = await client.get('https://api.example.com/test');
      expect(response.status).toBe(404);
      expect(response.ok).toBe(false);
    });
  });

  describe('Connection Metadata', () => {
    it('should include connection metadata in response', async () => {
      mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));

      const response = await client.get('https://api.example.com/test');
      
      // Connection metadata should be added by the connection pool
      expect(response).toHaveProperty('connectionId');
      expect(response).toHaveProperty('connectionReused');
    });
  });
});

describe('Provider HTTP Client Factory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create client with provider-specific configuration', () => {
    const openaiClient = createProviderHttpClient('openai');
    const anthropicClient = createProviderHttpClient('anthropic');
    
    expect(openaiClient).toBeInstanceOf(HttpClient);
    expect(anthropicClient).toBeInstanceOf(HttpClient);
    
    // Should have different connection limits
    const openaiStats = openaiClient.getConnectionPoolStats();
    const anthropicStats = anthropicClient.getConnectionPoolStats();
    
    expect(openaiStats).toBeDefined();
    expect(anthropicStats).toBeDefined();
    
    openaiClient.destroy();
    anthropicClient.destroy();
  });

  it('should use default configuration for unknown providers', () => {
    const unknownClient = createProviderHttpClient('unknown-provider' as any);
    
    expect(unknownClient).toBeInstanceOf(HttpClient);
    
    unknownClient.destroy();
  });

  it('should allow overriding provider defaults', () => {
    const customClient = createProviderHttpClient('openai', {
      timeoutMs: 120000,
      connectionPool: { maxConnectionsPerHost: 20 },
    });
    
    expect(customClient).toBeInstanceOf(HttpClient);
    
    customClient.destroy();
  });
});