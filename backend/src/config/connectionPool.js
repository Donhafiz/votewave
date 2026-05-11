const { logger } = require('../utils/logger');
const { MongoClient } = require('mongodb');

class ConnectionPool {
  constructor(options = {}) {
    this.options = {
      minConnections: 5,
      maxConnections: 20,
      maxIdleTime: 30000, // 30 seconds
      acquireTimeout: 10000, // 10 seconds
      retryAttempts: 3,
      retryDelay: 1000, // 1 second
      healthCheckInterval: 30000, // 30 seconds
      ...options
    };

    this.pool = null;
    this.activeConnections = 0;
    this.totalConnections = 0;
    this.queryQueue = [];
    this.metrics = {
      acquired: 0,
      released: 0,
      errors: 0,
      avgWaitTime: 0,
      maxWaitTime: 0,
      activeConnections: 0,
      idleConnections: 0
    };

    this.initializePool();
  }

  // Initialize connection pool
  async initializePool() {
    try {
      const client = new MongoClient(process.env.MONGODB_URI, {
        maxPoolSize: this.options.maxConnections,
        minPoolSize: this.options.minConnections,
        maxIdleTimeMS: this.options.maxIdleTime,
        serverSelectionTimeoutMS: this.options.acquireTimeout,
        waitQueueTimeoutMS: this.options.acquireTimeout,
        retryWrites: true,
        retryReads: true,
        readPreference: 'primary',
        writeConcern: { w: 1, j: true }
      });

      this.pool = client.db();
      
      // Set up connection monitoring
      client.on('connectionCreated', (event) => {
        this.activeConnections++;
        this.totalConnections++;
        
        logger.info('MongoDB connection created', {
          connectionId: event.connectionId,
          activeConnections: this.activeConnections,
          totalConnections: this.totalConnections
        });
      });

      client.on('connectionReady', (event) => {
        logger.debug('MongoDB connection ready', {
          connectionId: event.connectionId
        });
      });

      client.on('connectionClosed', (event) => {
        this.activeConnections--;
        
        logger.info('MongoDB connection closed', {
          connectionId: event.connectionId,
          reason: event.reason,
          activeConnections: this.activeConnections
        });
      });

      client.on('connectionPoolCleared', () => {
        logger.warn('MongoDB connection pool cleared');
      });

      // Start health checking
      this.startHealthCheck();
      
      logger.info('Connection pool initialized', {
        minConnections: this.options.minConnections,
        maxConnections: this.options.maxConnections,
        healthCheckInterval: this.options.healthCheckInterval
      });

    } catch (error) {
      logger.error('Failed to initialize connection pool', {
        error: error.message
      });
      throw error;
    }
  }

  // Acquire connection from pool
  async acquireConnection(operation = 'query') {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkQueue = () => {
        if (this.activeConnections < this.options.maxConnections) {
          resolve();
          return;
        }
        
        // Queue the request
        this.queryQueue.push({
          operation,
          resolve,
          reject,
          startTime,
          waitTime: Date.now() - startTime
        });
        
        logger.warn('Connection queued - pool at capacity', {
          operation,
          queueSize: this.queryQueue.length,
          activeConnections: this.activeConnections,
          maxConnections: this.options.maxConnections
        });
      };

      // Try to acquire immediately
      checkQueue();
    });
  }

  // Release connection back to pool
  releaseConnection(connection, operation = 'query') {
    const endTime = Date.now();
    const duration = endTime - connection.startTime;
    
    // Update metrics
    this.metrics.released++;
    this.metrics.activeConnections = this.activeConnections - 1;
    this.metrics.idleConnections = this.metrics.idleConnections + 1;
    
    // Calculate wait time
    if (connection.startTime) {
      const waitTime = connection.startTime - connection.queueStartTime;
      this.metrics.avgWaitTime = (this.metrics.avgWaitTime + waitTime) / 2;
      this.metrics.maxWaitTime = Math.max(this.metrics.maxWaitTime, waitTime);
    }

    // Process next in queue
    if (this.queryQueue.length > 0) {
      const next = this.queryQueue.shift();
      if (next) {
        next.resolve(connection);
        connection.startTime = Date.now();
        connection.queueStartTime = next.startTime;
      }
    }

    logger.debug('Connection released', {
      operation,
      duration: `${duration}ms`,
      activeConnections: this.activeConnections,
      queueSize: this.queryQueue.length
    });
  }

  // Execute query with connection
  async executeQuery(queryFunction, operation = 'query') {
    const connection = await this.acquireConnection(operation);
    const startTime = Date.now();
    
    try {
      const result = await queryFunction(connection.db);
      
      // Log slow queries
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn('Slow query detected', {
          operation,
          duration: `${duration}ms`,
          connectionId: connection.connectionId
        });
        
        this.metricsCollector?.recordSlowQuery(queryFunction.toString(), duration);
      }
      
      this.releaseConnection(connection, operation);
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Query execution failed', {
        operation,
        error: error.message,
        connectionId: connection.connectionId
      });
      
      this.releaseConnection(connection, operation);
      throw error;
    }
  }

  // Execute write operation with connection
  async executeWrite(writeFunction, operation = 'write') {
    const connection = await this.acquireConnection(operation);
    const startTime = Date.now();
    
    try {
      const result = await writeFunction(connection.db);
      
      const duration = Date.now() - startTime;
      this.releaseConnection(connection, operation);
      
      return result;
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Write operation failed', {
        operation,
        error: error.message,
        connectionId: connection.connectionId
      });
      
      this.releaseConnection(connection, operation);
      throw error;
    }
  }

  // Health check for connections
  async performHealthCheck() {
    const health = {
      activeConnections: this.activeConnections,
      idleConnections: this.metrics.idleConnections,
      queuedRequests: this.queryQueue.length,
      avgWaitTime: this.metrics.avgWaitTime,
      maxWaitTime: this.metrics.maxWaitTime,
      totalConnections: this.totalConnections,
      poolUtilization: (this.activeConnections / this.options.maxConnections) * 100
    };

    // Log warnings for unhealthy states
    if (health.poolUtilization > 80) {
      logger.warn('High connection pool utilization', health);
    }

    if (health.queuedRequests > 10) {
      logger.warn('High request queue size', health);
    }

    if (health.avgWaitTime > 5000) {
      logger.warn('High average wait time', health);
    }

    return health;
  }

  // Start periodic health checks
  startHealthCheck() {
    setInterval(async () => {
      try {
        const health = await this.performHealthCheck();
        
        logger.debug('Connection pool health check', health);
        
        // Emit health status for monitoring
        if (this.metricsCollector) {
          this.metricsCollector.metricsCollector?.recordRequest(true, Date.now() - Date.now());
        }
      } catch (error) {
        logger.error('Health check failed', {
          error: error.message
        });
      }
    }, this.options.healthCheckInterval);
  }

  // Get pool statistics
  getPoolStats() {
    return {
      ...this.metrics,
      connectionPool: {
        minConnections: this.options.minConnections,
        maxConnections: this.options.maxConnections,
        currentConnections: this.activeConnections,
        utilization: (this.activeConnections / this.options.maxConnections) * 100
      },
      queue: {
        size: this.queryQueue.length,
        oldestRequest: this.queryQueue.length > 0 ? Date.now() - this.queryQueue[0].startTime : 0
      }
    };
  }

  // Graceful shutdown
  async close() {
    if (this.pool) {
      await this.pool.close();
      logger.info('Connection pool closed');
    }
  }
}

module.exports = ConnectionPool;
