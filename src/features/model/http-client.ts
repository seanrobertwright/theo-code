/**
 * @fileoverview HTTP client with connection pooling for model adapters
 * @module features/model/http-client
 *
 * Provides an HTTP client that uses connection pooling to improve performance
 * and reduce connection overhead for AI provider API calls.
 */

import { ConnectionPool, globalConnectionPool, type ConnectionPoolConfig } from './connection-pool.js';
import { logger } from '../../shared/utils/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * HTTP client configuration.
 */
export interface HttpClientConfig {
  /** Connection pool configuration */
  connectionPool?: Partial<ConnectionPoolConfig>;
  /** Default request timeout in milliseconds */
  timeoutMs?: number;
  /** Default headers to include in all requests */
  defaultHeaders?: Record<string, string>;
  /** Whether to use the global connection pool */
  useGlobalPool?: boolean;
}

/**
 * HTTP request options.
 */
export interface HttpRequestOptions extends Omit<RequestInit, 'signal'> {
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to use connection pooling for this request */
  useConnectionPool?: boolean;
}

/**
 * HTTP response with connection metadata.
 */
export interface HttpResponse extends Response {
  /** Connection ID used for this request */
  connectionId?: string;
  /** Whether the connection was reused */
  connectionReused?: boolean;
}

// =============================================================================
// HTTP CLIENT
// =============================================================================

/**
 * HTTP client with connection pooling support for AI provider APIs.
 *
 * @example
 * ```typescript
 * const client = new HttpClient({
 *   connectionPool: { maxConnectionsPerHost: 5 },
 *   timeoutMs: 30000,
 * });
 *
 * const response = await client.fetch('https://api.openai.com/v1/chat/completions', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(requestData),
 * });
 * ```
 */
export class HttpClient {
  private readonly config: HttpClientConfig;
  private readonly connectionPool: ConnectionPool;
  private readonly ownedPool: boolean;

  constructor(config: HttpClientConfig = {}) {
    this.config = {
      timeoutMs: 30000,
      useGlobalPool: true,
      ...config,
    };

    if (this.config.useGlobalPool) {
      this.connectionPool = globalConnectionPool;
      this.ownedPool = false;
    } else {
      this.connectionPool = new ConnectionPool(this.config.connectionPool);
      this.ownedPool = true;
    }

    logger.debug('[HttpClient] Initialized with config:', {
      timeoutMs: this.config.timeoutMs,
      useGlobalPool: this.config.useGlobalPool,
      hasDefaultHeaders: !!this.config.defaultHeaders,
    });
  }

  // =============================================================================
  // HTTP METHODS
  // =============================================================================

  /**
   * Makes an HTTP request with connection pooling.
   */
  async fetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const {
      timeoutMs = this.config.timeoutMs,
      useConnectionPool = true,
      ...fetchOptions
    } = options;

    // Merge default headers
    const headers = {
      ...this.config.defaultHeaders,
      ...fetchOptions.headers,
    };

    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    let connection: any = null;
    let connectionReused = false;

    try {
      // Get connection from pool if enabled
      if (useConnectionPool) {
        connection = await this.connectionPool.getConnection(url);
        connectionReused = connection.requestCount > 0;
        logger.debug(`[HttpClient] Using connection ${connection.id} for ${url} (reused: ${connectionReused})`);
      }

      // Make the HTTP request
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: abortController.signal,
      });

      // Enhance response with connection metadata
      const enhancedResponse = response as HttpResponse;
      if (connection) {
        enhancedResponse.connectionId = connection.id;
        enhancedResponse.connectionReused = connectionReused;
      }

      logger.debug(`[HttpClient] Request completed: ${response.status} ${url}`);
      return enhancedResponse;

    } catch (error) {
      logger.error(`[HttpClient] Request failed for ${url}:`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
      
      // Release connection back to pool
      if (connection && useConnectionPool) {
        this.connectionPool.releaseConnection(connection);
      }
    }
  }

  /**
   * Makes a GET request.
   */
  async get(url: string, options: Omit<HttpRequestOptions, 'method' | 'body'> = {}): Promise<HttpResponse> {
    return this.fetch(url, { ...options, method: 'GET' });
  }

  /**
   * Makes a POST request.
   */
  async post(url: string, body?: string | ArrayBuffer | Uint8Array | FormData | URLSearchParams | ReadableStream, options: Omit<HttpRequestOptions, 'method' | 'body'> = {}): Promise<HttpResponse> {
    return this.fetch(url, { ...options, method: 'POST', ...(body !== undefined && { body }) });
  }

  /**
   * Makes a PUT request.
   */
  async put(url: string, body?: string | ArrayBuffer | Uint8Array | FormData | URLSearchParams | ReadableStream, options: Omit<HttpRequestOptions, 'method' | 'body'> = {}): Promise<HttpResponse> {
    return this.fetch(url, { ...options, method: 'PUT', ...(body !== undefined && { body }) });
  }

  /**
   * Makes a DELETE request.
   */
  async delete(url: string, options: Omit<HttpRequestOptions, 'method' | 'body'> = {}): Promise<HttpResponse> {
    return this.fetch(url, { ...options, method: 'DELETE' });
  }

  // =============================================================================
  // STREAMING SUPPORT
  // =============================================================================

  /**
   * Makes a streaming request with connection pooling.
   */
  async fetchStream(url: string, options: HttpRequestOptions = {}): Promise<{
    response: HttpResponse;
    stream: ReadableStream<Uint8Array>;
  }> {
    const response = await this.fetch(url, options);
    
    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return {
      response,
      stream: response.body,
    };
  }

  /**
   * Creates a Server-Sent Events stream parser.
   */
  async *parseSSEStream(url: string, options: HttpRequestOptions = {}): AsyncGenerator<string> {
    const { response, stream } = await this.fetchStream(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          yield data;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Gets connection pool statistics.
   */
  getConnectionPoolStats() {
    return this.connectionPool.getStats();
  }

  /**
   * Destroys the HTTP client and cleans up resources.
   */
  destroy(): void {
    if (this.ownedPool) {
      this.connectionPool.destroy();
    }
    logger.debug('[HttpClient] Destroyed');
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Creates an HTTP client configured for a specific AI provider.
 */
export function createProviderHttpClient(
  provider: string,
  config: Partial<HttpClientConfig> = {}
): HttpClient {
  const providerConfig: HttpClientConfig = {
    connectionPool: {
      maxConnectionsPerHost: getProviderConnectionLimit(provider),
    },
    timeoutMs: getProviderTimeout(provider),
    ...config,
  };

  return new HttpClient(providerConfig);
}

/**
 * Gets the recommended connection limit for a provider.
 */
function getProviderConnectionLimit(provider: string): number {
  const limits: Record<string, number> = {
    openai: 10,
    anthropic: 5,
    google: 8,
    openrouter: 15,
    cohere: 5,
    mistral: 5,
    together: 10,
    perplexity: 5,
    ollama: 3, // Local, fewer connections needed
  };

  return limits[provider] ?? 5;
}

/**
 * Gets the recommended timeout for a provider.
 */
function getProviderTimeout(provider: string): number {
  const timeouts: Record<string, number> = {
    openai: 60000,     // 1 minute
    anthropic: 60000,  // 1 minute
    google: 90000,     // 1.5 minutes (can be slower)
    openrouter: 60000, // 1 minute
    cohere: 45000,     // 45 seconds
    mistral: 45000,    // 45 seconds
    together: 60000,   // 1 minute
    perplexity: 45000, // 45 seconds
    ollama: 120000,    // 2 minutes (local processing)
  };

  return timeouts[provider] ?? 60000;
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

/**
 * Global HTTP client instance using the global connection pool.
 */
export const globalHttpClient = new HttpClient({ useGlobalPool: true });