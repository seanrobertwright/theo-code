/**
 * @fileoverview Unit tests for connection pool
 * @module features/model/__tests__/connection-pool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionPool, DEFAULT_CONNECTION_POOL_CONFIG } from '../connection-pool.js';

describe('ConnectionPool', () => {
  let pool: ConnectionPool;

  beforeEach(() => {
    pool = new ConnectionPool({
      maxConnectionsPerHost: 3,
      maxTotalConnections: 10,
      connectionTimeoutMs: 1000,
      keepAliveTimeoutMs: 2000,
    });
  });

  afterEach(() => {
    pool.destroy();
  });

  describe('Connection Management', () => {
    it('should create new connections when none exist', async () => {
      const connection = await pool.getConnection('https://api.example.com');
      
      expect(connection).toBeDefined();
      expect(connection.host).toBe('https://api.example.com');
      expect(connection.isActive).toBe(true);
      expect(connection.requestCount).toBe(0);
    });

    it('should reuse idle connections', async () => {
      const url = 'https://api.example.com';
      
      // Get and release a connection
      const connection1 = await pool.getConnection(url);
      const originalId = connection1.id;
      pool.releaseConnection(connection1);
      
      // Get another connection - should reuse
      const connection2 = await pool.getConnection(url);
      
      expect(connection2.id).toBe(originalId);
      expect(connection2.requestCount).toBe(1); // Incremented on reuse
    });

    it('should respect per-host connection limits', async () => {
      const url = 'https://api.example.com';
      const connections = [];
      
      // Create connections up to the limit
      for (let i = 0; i < 3; i++) {
        const connection = await pool.getConnection(url);
        connections.push(connection);
      }
      
      // Next connection should wait (we'll timeout quickly)
      const startTime = Date.now();
      try {
        await pool.getConnection(url);
        expect.fail('Should have timed out');
      } catch (error) {
        const waitTime = Date.now() - startTime;
        expect(waitTime).toBeGreaterThanOrEqual(1000); // Should wait for timeout
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('timeout');
      }
      
      // Release connections
      connections.forEach(conn => pool.releaseConnection(conn));
    });

    it('should respect total connection limits', async () => {
      const hosts = [
        'https://api1.example.com',
        'https://api2.example.com',
        'https://api3.example.com',
        'https://api4.example.com',
      ];
      
      const connections = [];
      
      // Create connections across multiple hosts up to total limit
      for (let i = 0; i < 10; i++) {
        const host = hosts[i % hosts.length];
        const connection = await pool.getConnection(host);
        connections.push(connection);
      }
      
      // Next connection should wait
      const startTime = Date.now();
      try {
        await pool.getConnection('https://api5.example.com');
        expect.fail('Should have timed out');
      } catch (error) {
        const waitTime = Date.now() - startTime;
        expect(waitTime).toBeGreaterThanOrEqual(1000);
      }
      
      // Release connections
      connections.forEach(conn => pool.releaseConnection(conn));
    });

    it('should handle connection release correctly', async () => {
      const connection = await pool.getConnection('https://api.example.com');
      
      expect(connection.isActive).toBe(true);
      
      pool.releaseConnection(connection);
      
      expect(connection.isActive).toBe(false);
      expect(connection.requestCount).toBe(1);
      
      const stats = pool.getStats();
      expect(stats.idleConnections).toBe(1);
      expect(stats.activeConnections).toBe(0);
    });

    it('should close specific connections', async () => {
      const connection = await pool.getConnection('https://api.example.com');
      const initialStats = pool.getStats();
      
      pool.closeConnection(connection);
      
      const finalStats = pool.getStats();
      expect(finalStats.activeConnections + finalStats.idleConnections)
        .toBe(initialStats.activeConnections + initialStats.idleConnections - 1);
    });
  });

  describe('Statistics', () => {
    it('should track connection statistics correctly', async () => {
      const hosts = ['https://api1.example.com', 'https://api2.example.com'];
      const connections = [];
      
      // Create connections
      for (const host of hosts) {
        const connection = await pool.getConnection(host);
        connections.push(connection);
      }
      
      const stats = pool.getStats();
      
      expect(stats.activeConnections).toBe(2);
      expect(stats.idleConnections).toBe(0);
      expect(stats.connectionsByHost['https://api1.example.com']).toBe(1);
      expect(stats.connectionsByHost['https://api2.example.com']).toBe(1);
      expect(stats.totalRequests).toBe(2);
      expect(stats.connectionReuses).toBe(0);
      
      // Release and reuse
      pool.releaseConnection(connections[0]);
      const reusedConnection = await pool.getConnection(hosts[0]);
      
      const updatedStats = pool.getStats();
      expect(updatedStats.connectionReuses).toBe(1);
      expect(updatedStats.totalRequests).toBe(3);
      
      // Cleanup
      pool.releaseConnection(reusedConnection);
      pool.releaseConnection(connections[1]);
    });
  });

  describe('URL Parsing', () => {
    it('should extract host correctly from URLs', async () => {
      const testCases = [
        { url: 'https://api.example.com/v1/chat', expectedHost: 'https://api.example.com' },
        { url: 'http://localhost:3000/api', expectedHost: 'http://localhost:3000' },
        { url: 'https://api.openai.com/v1/chat/completions', expectedHost: 'https://api.openai.com' },
      ];
      
      for (const { url, expectedHost } of testCases) {
        const connection = await pool.getConnection(url);
        expect(connection.host).toBe(expectedHost);
        pool.releaseConnection(connection);
      }
    });

    it('should handle invalid URLs gracefully', async () => {
      const invalidUrl = 'not-a-valid-url';
      const connection = await pool.getConnection(invalidUrl);
      
      expect(connection.host).toBe(invalidUrl); // Fallback to original string
      pool.releaseConnection(connection);
    });
  });

  describe('Cleanup and Lifecycle', () => {
    it('should clean up idle connections after timeout', async () => {
      // Use a pool with short keep-alive timeout
      const shortTimeoutPool = new ConnectionPool({
        maxConnectionsPerHost: 5,
        keepAliveTimeoutMs: 100, // 100ms
      });
      
      try {
        const connection = await shortTimeoutPool.getConnection('https://api.example.com');
        shortTimeoutPool.releaseConnection(connection);
        
        const initialStats = shortTimeoutPool.getStats();
        expect(initialStats.idleConnections).toBe(1);
        
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const finalStats = shortTimeoutPool.getStats();
        expect(finalStats.idleConnections).toBe(0);
      } finally {
        shortTimeoutPool.destroy();
      }
    });

    it('should destroy all connections on destroy', async () => {
      const connections = [];
      
      // Create multiple connections
      for (let i = 0; i < 3; i++) {
        const connection = await pool.getConnection(`https://api${i}.example.com`);
        connections.push(connection);
      }
      
      const statsBeforeDestroy = pool.getStats();
      expect(statsBeforeDestroy.activeConnections).toBe(3);
      
      pool.destroy();
      
      const statsAfterDestroy = pool.getStats();
      expect(statsAfterDestroy.activeConnections).toBe(0);
      expect(statsAfterDestroy.idleConnections).toBe(0);
    });
  });

  describe('Pending Requests', () => {
    it('should queue requests when connections are unavailable', async () => {
      const url = 'https://api.example.com';
      const connections = [];
      
      // Fill up all available connections
      for (let i = 0; i < 3; i++) {
        const connection = await pool.getConnection(url);
        connections.push(connection);
      }
      
      // Start a request that should be queued
      const pendingPromise = pool.getConnection(url);
      
      // Check that request is pending
      const stats = pool.getStats();
      expect(stats.pendingRequests).toBe(1);
      
      // Release a connection to fulfill the pending request
      pool.releaseConnection(connections[0]);
      
      const pendingConnection = await pendingPromise;
      expect(pendingConnection).toBeDefined();
      
      // Cleanup
      pool.releaseConnection(pendingConnection);
      connections.slice(1).forEach(conn => pool.releaseConnection(conn));
    });

    it('should reject pending requests on destroy', async () => {
      const url = 'https://api.example.com';
      const connections = [];
      
      // Fill up connections
      for (let i = 0; i < 3; i++) {
        const connection = await pool.getConnection(url);
        connections.push(connection);
      }
      
      // Start pending request
      const pendingPromise = pool.getConnection(url);
      
      // Destroy pool
      pool.destroy();
      
      // Pending request should be rejected
      await expect(pendingPromise).rejects.toThrow('Connection pool is being destroyed');
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when not provided', () => {
      const defaultPool = new ConnectionPool();
      
      // Test that it works with defaults
      expect(async () => {
        const connection = await defaultPool.getConnection('https://api.example.com');
        defaultPool.releaseConnection(connection);
      }).not.toThrow();
      
      defaultPool.destroy();
    });

    it('should merge provided configuration with defaults', () => {
      const customPool = new ConnectionPool({
        maxConnectionsPerHost: 20,
        // Other values should use defaults
      });
      
      // Should work with custom config
      expect(async () => {
        const connection = await customPool.getConnection('https://api.example.com');
        customPool.releaseConnection(connection);
      }).not.toThrow();
      
      customPool.destroy();
    });
  });
});