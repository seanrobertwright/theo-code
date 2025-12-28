/**
 * @fileoverview HTTP connection pooling for model adapters
 * @module features/model/connection-pool
 *
 * Provides HTTP connection pooling to improve performance by reusing
 * connections across requests to the same provider endpoints.
 */

// Add logger
const logger = {
  debug: (message: string, ...args: any[]) => console.debug(message, ...args),
  info: (message: string, ...args: any[]) => console.info(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for HTTP connection pooling.
 */
export interface ConnectionPoolConfig {
  /** Maximum number of connections per host */
  maxConnectionsPerHost: number;
  /** Maximum number of total connections */
  maxTotalConnections: number;
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: number;
  /** Keep-alive timeout in milliseconds */
  keepAliveTimeoutMs: number;
  /** Maximum time to wait for a connection from the pool */
  poolTimeoutMs: number;
}

/**
 * Connection pool statistics.
 */
export interface ConnectionPoolStats {
  /** Total number of active connections */
  activeConnections: number;
  /** Total number of idle connections */
  idleConnections: number;
  /** Number of connections per host */
  connectionsByHost: Record<string, number>;
  /** Number of pending requests waiting for connections */
  pendingRequests: number;
  /** Total requests served */
  totalRequests: number;
  /** Total connection reuses */
  connectionReuses: number;
}

/**
 * Connection metadata.
 */
interface Connection {
  id: string;
  host: string;
  createdAt: Date;
  lastUsedAt: Date;
  requestCount: number;
  isActive: boolean;
}

/**
 * Pending request waiting for a connection.
 */
interface PendingRequest {
  host: string;
  resolve: (connection: Connection) => void;
  reject: (error: Error) => void;
  createdAt: Date;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default connection pool configuration.
 */
export const DEFAULT_CONNECTION_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnectionsPerHost: 10,
  maxTotalConnections: 50,
  connectionTimeoutMs: 30000, // 30 seconds
  keepAliveTimeoutMs: 60000,  // 1 minute
  poolTimeoutMs: 5000,        // 5 seconds
};

// =============================================================================
// CONNECTION POOL
// =============================================================================

/**
 * HTTP connection pool for managing persistent connections to AI providers.
 *
 * @example
 * ```typescript
 * const pool = new ConnectionPool({
 *   _maxConnectionsPerHost: 5,
 *   _maxTotalConnections: 25,
 * });
 *
 * const connection = await pool.getConnection('https://api.openai.com');
 * // Use connection for HTTP request
 * pool.releaseConnection(connection);
 * ```
 */
export class ConnectionPool {
  private readonly config: ConnectionPoolConfig;
  private readonly connections = new Map<string, Connection>();
  private readonly connectionsByHost = new Map<string, Set<string>>();
  private readonly idleConnections = new Set<string>();
  private readonly pendingRequests: PendingRequest[] = [];
  private readonly cleanupTimer: NodeJS.Timeout;
  private connectionIdCounter = 0;
  private totalRequests = 0;
  private connectionReuses = 0;

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONNECTION_POOL_CONFIG, ...config };
    
    // Start periodic cleanup of idle connections
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.config.keepAliveTimeoutMs / 2);

    logger.info('[ConnectionPool] Initialized with config:', this.config);
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  /**
   * Gets a connection for the specified host, creating one if necessary.
   */
  async getConnection(url: string): Promise<Connection> {
    const host = this.extractHost(url);
    this.totalRequests++;

    // Try to get an idle connection first
    const idleConnection = this.getIdleConnection(host);
    if (idleConnection) {
      this.markConnectionActive(idleConnection);
      this.connectionReuses++;
      logger.debug(`[ConnectionPool] Reusing connection ${idleConnection.id} for ${host}`);
      return idleConnection;
    }

    // Check if we can create a new connection
    if (this.canCreateConnection(host)) {
      const connection = this.createConnection(host);
      logger.debug(`[ConnectionPool] Created new connection ${connection.id} for ${host}`);
      return connection;
    }

    // Wait for a connection to become available
    logger.debug(`[ConnectionPool] Waiting for connection to ${host}`);
    return this.waitForConnection(host);
  }

  /**
   * Releases a connection back to the pool.
   */
  releaseConnection(connection: Connection): void {
    if (!this.connections.has(connection.id)) {
      logger.warn(`[ConnectionPool] Attempted to release unknown connection ${connection.id}`);
      return;
    }

    connection.isActive = false;
    connection.lastUsedAt = new Date();
    connection.requestCount++;
    
    this.idleConnections.add(connection.id);
    
    logger.debug(`[ConnectionPool] Released connection ${connection.id} for ${connection.host}`);
    
    // Process any pending requests for this host
    this.processPendingRequests(connection.host);
  }

  /**
   * Closes a specific connection and removes it from the pool.
   */
  closeConnection(connection: Connection): void {
    this.removeConnection(connection);
    logger.debug(`[ConnectionPool] Closed connection ${connection.id} for ${connection.host}`);
  }

  /**
   * Closes all connections and shuts down the pool.
   */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    
    // Reject all pending requests
    for (const request of this.pendingRequests) {
      request.reject(new Error('Connection pool is being destroyed'));
    }
    this.pendingRequests.length = 0;
    
    // Close all connections
    for (const connection of this.connections.values()) {
      this.removeConnection(connection);
    }
    
    logger.info('[ConnectionPool] Destroyed');
  }

  // =============================================================================
  // STATISTICS
  // =============================================================================

  /**
   * Gets current connection pool statistics.
   */
  getStats(): ConnectionPoolStats {
    const connectionsByHost: Record<string, number> = {};
    
    for (const [host, connectionIds] of this.connectionsByHost) {
      connectionsByHost[host] = connectionIds.size;
    }

    return {
      activeConnections: this.connections.size - this.idleConnections.size,
      idleConnections: this.idleConnections.size,
      connectionsByHost,
      pendingRequests: this.pendingRequests.length,
      totalRequests: this.totalRequests,
      connectionReuses: this.connectionReuses,
    };
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Extracts the host from a URL.
   */
  private extractHost(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Fallback for invalid URLs
      return url;
    }
  }

  /**
   * Gets an idle connection for the specified host.
   */
  private getIdleConnection(host: string): Connection | null {
    const hostConnections = this.connectionsByHost.get(host);
    if (!hostConnections) {
      return null;
    }

    for (const connectionId of hostConnections) {
      if (this.idleConnections.has(connectionId)) {
        const connection = this.connections.get(connectionId);
        if (connection) {
          return connection;
        }
      }
    }

    return null;
  }

  /**
   * Checks if a new connection can be created for the host.
   */
  private canCreateConnection(host: string): boolean {
    const totalConnections = this.connections.size;
    const hostConnections = this.connectionsByHost.get(host)?.size ?? 0;

    return (
      totalConnections < this.config.maxTotalConnections &&
      hostConnections < this.config.maxConnectionsPerHost
    );
  }

  /**
   * Creates a new connection for the specified host.
   */
  private createConnection(host: string): Connection {
    const connection: Connection = {
      id: `conn_${++this.connectionIdCounter}`,
      host,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      requestCount: 0,
      isActive: true,
    };

    this.connections.set(connection.id, connection);
    
    let hostConnections = this.connectionsByHost.get(host);
    if (!hostConnections) {
      hostConnections = new Set();
      this.connectionsByHost.set(host, hostConnections);
    }
    hostConnections.add(connection.id);

    return connection;
  }

  /**
   * Marks a connection as active.
   */
  private markConnectionActive(connection: Connection): void {
    connection.isActive = true;
    connection.lastUsedAt = new Date();
    this.idleConnections.delete(connection.id);
  }

  /**
   * Waits for a connection to become available for the specified host.
   */
  private async waitForConnection(host: string): Promise<Connection> {
    return new Promise<Connection>((resolve, reject) => {
      const request: PendingRequest = {
        host,
        resolve,
        reject,
        createdAt: new Date(),
      };

      this.pendingRequests.push(request);

      // Set timeout for the request
      setTimeout(() => {
        const index = this.pendingRequests.indexOf(request);
        if (index >= 0) {
          this.pendingRequests.splice(index, 1);
          reject(new Error(`Connection pool timeout after ${this.config.poolTimeoutMs}ms`));
        }
      }, this.config.poolTimeoutMs);
    });
  }

  /**
   * Processes pending requests for a specific host.
   */
  private processPendingRequests(host: string): void {
    const pendingForHost = this.pendingRequests.filter(req => req.host === host);
    
    for (const request of pendingForHost) {
      const connection = this.getIdleConnection(host);
      if (connection) {
        // Remove from pending requests
        const index = this.pendingRequests.indexOf(request);
        if (index >= 0) {
          this.pendingRequests.splice(index, 1);
        }
        
        this.markConnectionActive(connection);
        this.connectionReuses++;
        request.resolve(connection);
      } else {
        break; // No more idle connections available
      }
    }
  }

  /**
   * Removes a connection from all tracking structures.
   */
  private removeConnection(connection: Connection): void {
    this.connections.delete(connection.id);
    this.idleConnections.delete(connection.id);
    
    const hostConnections = this.connectionsByHost.get(connection.host);
    if (hostConnections) {
      hostConnections.delete(connection.id);
      if (hostConnections.size === 0) {
        this.connectionsByHost.delete(connection.host);
      }
    }
  }

  /**
   * Cleans up idle connections that have exceeded the keep-alive timeout.
   */
  private cleanupIdleConnections(): void {
    const now = new Date();
    const connectionsToClose: Connection[] = [];

    for (const connectionId of this.idleConnections) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        const idleTime = now.getTime() - connection.lastUsedAt.getTime();
        if (idleTime > this.config.keepAliveTimeoutMs) {
          connectionsToClose.push(connection);
        }
      }
    }

    for (const connection of connectionsToClose) {
      this.removeConnection(connection);
      logger.debug(`[ConnectionPool] Cleaned up idle connection ${connection.id} for ${connection.host}`);
    }

    if (connectionsToClose.length > 0) {
      logger.debug(`[ConnectionPool] Cleaned up ${connectionsToClose.length} idle connections`);
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Global connection pool instance.
 */
export const globalConnectionPool = new ConnectionPool();