/**
 * @fileoverview Request Queue for managing concurrent AI requests
 * @module features/model/request-queue
 *
 * Provides a queue system for AI requests to manage:
 * - Concurrency limits per provider
 * - Rate limit adherence
 * - Request prioritization
 * - Retries and timeouts
 * - Background processing
 */

import type { ModelProvider } from '../../shared/types/models.js';
import { logger } from '../../shared/utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Request priority levels.
 */
export enum RequestPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Queued request internal structure.
 */
interface QueuedRequest<T = any, R = any> {
  id: string;
  provider: ModelProvider;
  priority: RequestPriority;
  data: T;
  resolve: (value: R) => void;
  reject: (reason: any) => void;
  timestamp: number;
  retryCount: number;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Request queue configuration.
 */
export interface RequestQueueConfig {
  maxConcurrentPerProvider: number;
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

// =============================================================================
// REQUEST QUEUE
// =============================================================================

/**
 * Manages concurrent AI requests across multiple providers.
 */
export class RequestQueue {
  private readonly config: RequestQueueConfig;
  private readonly queue: QueuedRequest[] = [];
  private readonly runningCount = new Map<ModelProvider, number>();
  private readonly requestProcessor: (data: any) => Promise<any>;

  constructor(
    requestProcessor: (data: any) => Promise<any>,
    config: Partial<RequestQueueConfig> = {}
  ) {
    this.requestProcessor = requestProcessor;
    this.config = {
      maxConcurrentPerProvider: config.maxConcurrentPerProvider ?? 5,
      defaultTimeout: config.defaultTimeout ?? 60000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * Enqueue a new request.
   */
  async enqueue<T = any, R = any>(
    provider: ModelProvider,
    data: T,
    priority: RequestPriority = RequestPriority.MEDIUM
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const id = this.generateRequestId();
      const request: QueuedRequest<T, R> = {
        id,
        provider,
        priority,
        data,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0,
      };

      // Set timeout
      request.timeoutId = setTimeout(() => {
        this.handleTimeout(id);
      }, this.config.defaultTimeout);

      this.insertIntoQueue(request);
      logger.debug(`[RequestQueue] Enqueued request ${id} for ${provider} (priority: ${priority})`);
      
      this.processQueue();
    });
  }

  /**
   * Process pending requests in the queue.
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    // Identify requests that can be run
    for (let i = 0; i < this.queue.length; i++) {
      const request = this.queue[i];
      const running = this.runningCount.get(request.provider) ?? 0;

      if (running < this.config.maxConcurrentPerProvider) {
        // Start this request
        this.queue.splice(i, 1);
        i--; // Adjust index after splice
        
        this.runRequest(request);
      }
    }
  }

  /**
   * Execute a single request.
   */
  private async runRequest(request: QueuedRequest): Promise<void> {
    const provider = request.provider;
    this.runningCount.set(provider, (this.runningCount.get(provider) ?? 0) + 1);

    try {
      // Clear timeout as processing has started
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
        request.timeoutId = undefined;
      }

      logger.debug(`[RequestQueue] Running request ${request.id} for ${provider}`);
      const result = await this.requestProcessor(request.data);
      request.resolve(result);
    } catch (error) {
      this.handleRequestError(request, error);
    } finally {
      this.runningCount.set(provider, (this.runningCount.get(provider) ?? 1) - 1);
      this.processQueue();
    }
  }

  /**
   * Handle errors during request execution with retry logic.
   */
  private handleRequestError(request: QueuedRequest, error: any): void {
    if (request.retryCount < this.config.maxRetries) {
      request.retryCount++;
      const delay = this.config.retryDelay * Math.pow(2, request.retryCount - 1);
      
      logger.warn(`[RequestQueue] Request ${request.id} failed, retrying in ${delay}ms (attempt ${request.retryCount}):`, error);
      
      setTimeout(() => {
        this.insertIntoQueue(request);
        this.processQueue();
      }, delay);
    } else {
      logger.error(`[RequestQueue] Request ${request.id} failed after ${request.retryCount} retries:`, error);
      request.reject(error);
    }
  }

  /**
   * Handle request timeouts.
   */
  private handleTimeout(requestId: string): void {
    const index = this.queue.findIndex(r => r.id === requestId);
    if (index !== -1) {
      const request = this.queue.splice(index, 1)[0];
      logger.warn(`[RequestQueue] Request ${requestId} timed out while in queue`);
      request.reject(new Error('Request timed out in queue'));
    }
  }

  /**
   * Insert request into queue based on priority.
   */
  private insertIntoQueue(request: QueuedRequest): void {
    const index = this.queue.findIndex(r => r.priority < request.priority);
    if (index === -1) {
      this.queue.push(request);
    } else {
      this.queue.splice(index, 0, request);
    }
  }

  /**
   * Generate a unique request ID.
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear the queue and reject all pending requests.
   */
  clear(): void {
    while (this.queue.length > 0) {
      const request = this.queue.pop()!;
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Request queue cleared'));
    }
    this.runningCount.clear();
    logger.info('[RequestQueue] Queue cleared');
  }

  /**
   * Get queue statistics.
   */
  getStats(): { queued: number; running: Record<string, number> } {
    const running: Record<string, number> = {};
    for (const [provider, count] of this.runningCount.entries()) {
      running[provider] = count;
    }
    
    return {
      queued: this.queue.length,
      running,
    };
  }
}
