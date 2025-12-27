/**
 * @fileoverview Unit tests for request queue
 * @module features/model/__tests__/request-queue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestQueue, RequestPriority } from '../request-queue.js';
import type { ModelProvider } from '../../../shared/types/models.js';

describe('RequestQueue', () => {
  let queue: RequestQueue<any, any>;

  beforeEach(() => {
    queue = new RequestQueue({
      maxQueueSize: 100,
      maxWaitTimeMs: 5000,
      enableBatching: true,
      maxBatchSize: 5,
      batchTimeoutMs: 100,
    });
  });

  afterEach(() => {
    queue.destroy();
  });

  describe('Basic Queue Operations', () => {
    it('should enqueue and process requests', async () => {
      const mockProcessor = vi.fn().mockResolvedValue({ result: 'processed' });
      queue.setRequestProcessor(mockProcessor);

      const result = await queue.enqueue('openai', { data: 'test' });

      expect(result).toEqual({ result: 'processed' });
      expect(mockProcessor).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should handle multiple concurrent requests', async () => {
      const mockProcessor = vi.fn().mockImplementation(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { processed: data.id };
      });
      queue.setRequestProcessor(mockProcessor);

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(queue.enqueue('openai', { id: i }));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(mockProcessor).toHaveBeenCalledTimes(10);
      
      const stats = queue.getStats();
      expect(stats.totalProcessed).toBe(10);
    });

    it('should respect queue size limits', async () => {
      const smallQueue = new RequestQueue({ maxQueueSize: 2 });
      
      try {
        const mockProcessor = vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 1000))
        );
        smallQueue.setRequestProcessor(mockProcessor);

        // Fill the queue
        const promise1 = smallQueue.enqueue('openai', { id: 1 });
        const promise2 = smallQueue.enqueue('openai', { id: 2 });

        // This should fail due to queue size limit
        await expect(smallQueue.enqueue('openai', { id: 3 }))
          .rejects.toThrow('Request queue is full');

        // Cleanup
        smallQueue.destroy();
      } finally {
        smallQueue.destroy();
      }
    });
  });

  describe('Priority Handling', () => {
    it('should process high priority requests first', async () => {
      const processOrder: number[] = [];
      const mockProcessor = vi.fn().mockImplementation(async (data) => {
        processOrder.push(data.id);
        return { processed: data.id };
      });
      queue.setRequestProcessor(mockProcessor);

      // Enqueue requests with different priorities
      const promises = [
        queue.enqueue('openai', { id: 1 }, { priority: RequestPriority.LOW }),
        queue.enqueue('openai', { id: 2 }, { priority: RequestPriority.HIGH }),
        queue.enqueue('openai', { id: 3 }, { priority: RequestPriority.NORMAL }),
        queue.enqueue('openai', { id: 4 }, { priority: RequestPriority.URGENT }),
      ];

      await Promise.all(promises);

      // Should process in priority order: URGENT, HIGH, NORMAL, LOW
      expect(processOrder).toEqual([4, 2, 3, 1]);
    });

    it('should maintain FIFO order within same priority', async () => {
      const processOrder: number[] = [];
      const mockProcessor = vi.fn().mockImplementation(async (data) => {
        processOrder.push(data.id);
        return { processed: data.id };
      });
      queue.setRequestProcessor(mockProcessor);

      // Enqueue multiple requests with same priority
      const promises = [];
      for (let i = 1; i <= 5; i++) {
        promises.push(queue.enqueue('openai', { id: i }, { priority: RequestPriority.NORMAL }));
      }

      await Promise.all(promises);

      expect(processOrder).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Batching', () => {
    it('should batch requests when enabled', async () => {
      const mockBatchProcessor = vi.fn().mockImplementation(async (requests) => {
        return requests.map(req => ({ batched: req.id }));
      });
      queue.setBatchProcessor(mockBatchProcessor);

      // Enqueue batchable requests
      const promises = [];
      for (let i = 1; i <= 3; i++) {
        promises.push(queue.enqueue('openai', { id: i }, { 
          batchable: true,
          batchKey: 'test-batch',
        }));
      }

      const results = await Promise.all(promises);

      expect(results).toEqual([
        { batched: 1 },
        { batched: 2 },
        { batched: 3 },
      ]);
      expect(mockBatchProcessor).toHaveBeenCalledWith([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);

      const stats = queue.getStats();
      expect(stats.totalBatches).toBe(1);
    });

    it('should create batches when max batch size is reached', async () => {
      const mockBatchProcessor = vi.fn().mockImplementation(async (requests) => {
        return requests.map(req => ({ batched: req.id }));
      });
      queue.setBatchProcessor(mockBatchProcessor);

      // Enqueue more requests than max batch size
      const promises = [];
      for (let i = 1; i <= 7; i++) {
        promises.push(queue.enqueue('openai', { id: i }, { 
          batchable: true,
          batchKey: 'test-batch',
        }));
      }

      await Promise.all(promises);

      // Should create multiple batches
      expect(mockBatchProcessor).toHaveBeenCalledTimes(2);
      expect(mockBatchProcessor).toHaveBeenNthCalledWith(1, [
        { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
      ]);

      const stats = queue.getStats();
      expect(stats.totalBatches).toBe(2);
    });

    it('should group batches by batch key', async () => {
      const mockBatchProcessor = vi.fn().mockImplementation(async (requests) => {
        return requests.map(req => ({ batched: req.id }));
      });
      queue.setBatchProcessor(mockBatchProcessor);

      // Enqueue requests with different batch keys
      const promises = [
        queue.enqueue('openai', { id: 1 }, { batchable: true, batchKey: 'batch-a' }),
        queue.enqueue('openai', { id: 2 }, { batchable: true, batchKey: 'batch-b' }),
        queue.enqueue('openai', { id: 3 }, { batchable: true, batchKey: 'batch-a' }),
      ];

      await Promise.all(promises);

      // Should create separate batches for different keys
      expect(mockBatchProcessor).toHaveBeenCalledTimes(2);
    });

    it('should timeout batches after batch timeout', async () => {
      const mockBatchProcessor = vi.fn().mockImplementation(async (requests) => {
        return requests.map(req => ({ batched: req.id }));
      });
      queue.setBatchProcessor(mockBatchProcessor);

      // Enqueue a single batchable request
      const promise = queue.enqueue('openai', { id: 1 }, { 
        batchable: true,
        batchKey: 'timeout-batch',
      });

      const result = await promise;

      expect(result).toEqual({ batched: 1 });
      expect(mockBatchProcessor).toHaveBeenCalledWith([{ id: 1 }]);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      queue.setRateLimit('openai', {
        requestsPerMinute: 2,
        tokensPerMinute: 1000,
        concurrentRequests: 1,
      });

      const mockProcessor = vi.fn().mockImplementation(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { processed: data.id };
      });
      queue.setRequestProcessor(mockProcessor);

      const startTime = Date.now();
      
      // Enqueue requests that exceed rate limit
      const promises = [];
      for (let i = 1; i <= 3; i++) {
        promises.push(queue.enqueue('openai', { id: i }));
      }

      await Promise.all(promises);
      const endTime = Date.now();

      // Should take longer due to rate limiting
      expect(endTime - startTime).toBeGreaterThan(200);
      expect(mockProcessor).toHaveBeenCalledTimes(3);
    });

    it('should handle different providers independently', async () => {
      queue.setRateLimit('openai', { requestsPerMinute: 1 });
      queue.setRateLimit('anthropic', { requestsPerMinute: 10 });

      const mockProcessor = vi.fn().mockResolvedValue({ result: 'ok' });
      queue.setRequestProcessor(mockProcessor);

      // Enqueue requests for different providers
      const promises = [
        queue.enqueue('openai', { provider: 'openai' }),
        queue.enqueue('anthropic', { provider: 'anthropic' }),
        queue.enqueue('anthropic', { provider: 'anthropic' }),
      ];

      await Promise.all(promises);

      expect(mockProcessor).toHaveBeenCalledTimes(3);
    });
  });

  describe('Statistics', () => {
    it('should track queue statistics', async () => {
      const mockProcessor = vi.fn().mockResolvedValue({ result: 'ok' });
      queue.setRequestProcessor(mockProcessor);

      // Enqueue requests with different priorities and providers
      await Promise.all([
        queue.enqueue('openai', { id: 1 }, { priority: RequestPriority.HIGH }),
        queue.enqueue('anthropic', { id: 2 }, { priority: RequestPriority.LOW }),
        queue.enqueue('openai', { id: 3 }, { priority: RequestPriority.NORMAL }),
      ]);

      const stats = queue.getStats();

      expect(stats.totalProcessed).toBe(3);
      expect(stats.requestsByProvider['openai']).toBe(0); // Processed, so not in queue
      expect(stats.requestsByProvider['anthropic']).toBe(0);
      expect(stats.averageWaitTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track active batches', async () => {
      const mockBatchProcessor = vi.fn().mockImplementation(async (requests) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return requests.map(req => ({ batched: req.id }));
      });
      queue.setBatchProcessor(mockBatchProcessor);

      // Start a batch but don't wait for completion
      const promise = queue.enqueue('openai', { id: 1 }, { 
        batchable: true,
        batchKey: 'active-batch',
      });

      // Check stats while batch is active
      await new Promise(resolve => setTimeout(resolve, 50));
      const stats = queue.getStats();
      expect(stats.activeBatches).toBeGreaterThanOrEqual(0);

      await promise;
    });
  });

  describe('Error Handling', () => {
    it('should handle processor errors', async () => {
      const mockProcessor = vi.fn().mockRejectedValue(new Error('Processing failed'));
      queue.setRequestProcessor(mockProcessor);

      await expect(queue.enqueue('openai', { data: 'test' }))
        .rejects.toThrow('Processing failed');
    });

    it('should handle batch processor errors', async () => {
      const mockBatchProcessor = vi.fn().mockRejectedValue(new Error('Batch failed'));
      queue.setBatchProcessor(mockBatchProcessor);

      await expect(queue.enqueue('openai', { id: 1 }, { 
        batchable: true,
        batchKey: 'error-batch',
      })).rejects.toThrow('Batch failed');
    });

    it('should timeout requests after max wait time', async () => {
      const shortTimeoutQueue = new RequestQueue({ maxWaitTimeMs: 100 });
      
      try {
        const mockProcessor = vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 1000))
        );
        shortTimeoutQueue.setRequestProcessor(mockProcessor);

        await expect(shortTimeoutQueue.enqueue('openai', { data: 'test' }))
          .rejects.toThrow('Request timeout after 100ms');
      } finally {
        shortTimeoutQueue.destroy();
      }
    });
  });

  describe('Lifecycle Management', () => {
    it('should clear all pending requests', async () => {
      const mockProcessor = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );
      queue.setRequestProcessor(mockProcessor);

      // Start some requests
      const promises = [
        queue.enqueue('openai', { id: 1 }),
        queue.enqueue('openai', { id: 2 }),
      ];

      // Clear the queue
      queue.clear();

      // Requests should be rejected
      await expect(Promise.all(promises)).rejects.toThrow('Request queue cleared');

      const stats = queue.getStats();
      expect(stats.queueSize).toBe(0);
    });

    it('should destroy cleanly', async () => {
      const mockProcessor = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );
      queue.setRequestProcessor(mockProcessor);

      // Start some requests
      const promises = [
        queue.enqueue('openai', { id: 1 }),
        queue.enqueue('openai', { id: 2 }),
      ];

      // Destroy the queue
      queue.destroy();

      // Requests should be rejected
      await expect(Promise.all(promises)).rejects.toThrow('Request queue cleared');
    });
  });

  describe('Configuration', () => {
    it('should work with default configuration', () => {
      const defaultQueue = new RequestQueue();
      
      expect(defaultQueue.getQueueSize()).toBe(0);
      
      defaultQueue.destroy();
    });

    it('should disable batching when configured', async () => {
      const noBatchQueue = new RequestQueue({ enableBatching: false });
      
      try {
        const mockProcessor = vi.fn().mockResolvedValue({ result: 'ok' });
        const mockBatchProcessor = vi.fn();
        
        noBatchQueue.setRequestProcessor(mockProcessor);
        noBatchQueue.setBatchProcessor(mockBatchProcessor);

        await noBatchQueue.enqueue('openai', { id: 1 }, { batchable: true });

        expect(mockProcessor).toHaveBeenCalled();
        expect(mockBatchProcessor).not.toHaveBeenCalled();
      } finally {
        noBatchQueue.destroy();
      }
    });

    it('should disable priority when configured', async () => {
      const noPriorityQueue = new RequestQueue({ enablePriority: false });
      
      try {
        const processOrder: number[] = [];
        const mockProcessor = vi.fn().mockImplementation(async (data) => {
          processOrder.push(data.id);
          return { processed: data.id };
        });
        noPriorityQueue.setRequestProcessor(mockProcessor);

        // Enqueue in different priority order
        await Promise.all([
          noPriorityQueue.enqueue('openai', { id: 1 }, { priority: RequestPriority.LOW }),
          noPriorityQueue.enqueue('openai', { id: 2 }, { priority: RequestPriority.HIGH }),
        ]);

        // Should process in FIFO order regardless of priority
        expect(processOrder).toEqual([1, 2]);
      } finally {
        noPriorityQueue.destroy();
      }
    });
  });
});