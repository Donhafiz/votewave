const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class MultiRegionReplication extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      primaryRegion: options.primaryRegion || process.env.AWS_REGION || 'us-east-1',
      regions: options.regions || ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
      replicationLag: options.replicationLag || 5000, // 5 seconds
      consistencyLevel: options.consistencyLevel || 'eventual', // eventual, strong, read_your_writes
      enableFailover: options.enableFailover !== false,
      enableConflictResolution: options.enableConflictResolution !== false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      batchSize: options.batchSize || 100,
      syncInterval: options.syncInterval || 10000, // 10 seconds
      ...options
    };

    this.regionStatus = new Map();
    this.replicationStreams = new Map();
    this.conflictResolver = null;
    this.currentPrimary = this.options.primaryRegion;
    this.failoverHistory = [];
    
    this.initializeRegions();
    this.startReplication();
    this.startHealthChecks();
  }

  /**
   * Initialize region configurations
   */
  initializeRegions() {
    for (const region of this.options.regions) {
      this.regionStatus.set(region, {
        region,
        status: 'initializing',
        role: region === this.options.primaryRegion ? 'primary' : 'secondary',
        lastSync: null,
        lag: 0,
        endpoint: this.getRegionEndpoint(region),
        connectionPool: null,
        metrics: {
          writes: 0,
          reads: 0,
          errors: 0,
          latency: 0
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    logger.info('Multi-region replication initialized', {
      primaryRegion: this.options.primaryRegion,
      regions: this.options.regions,
      consistencyLevel: this.options.consistencyLevel
    });
  }

  /**
   * Get region endpoint
   */
  getRegionEndpoint(region) {
    const endpoints = {
      'us-east-1': 'redis-primary-us-east-1.votewave.com',
      'us-west-2': 'redis-secondary-us-west-2.votewave.com',
      'eu-west-1': 'redis-secondary-eu-west-1.votewave.com',
      'ap-southeast-1': 'redis-secondary-ap-southeast-1.votewave.com'
    };

    return endpoints[region] || `redis-${region}.votewave.com`;
  }

  /**
   * Start replication process
   */
  async startReplication() {
    try {
      // Initialize primary region
      await this.initializePrimaryRegion();

      // Initialize secondary regions
      for (const region of this.options.regions) {
        if (region !== this.options.primaryRegion) {
          await this.initializeSecondaryRegion(region);
        }
      }

      // Start replication streams
      this.startReplicationStreams();

      // Start periodic sync
      this.startPeriodicSync();

      logger.info('Multi-region replication started', {
        primaryRegion: this.currentPrimary,
        secondaryRegions: this.options.regions.filter(r => r !== this.currentPrimary)
      });

    } catch (error) {
      logger.error('Failed to start replication', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize primary region
   */
  async initializePrimaryRegion() {
    try {
      const regionStatus = this.regionStatus.get(this.options.primaryRegion);
      
      // Connect to primary Redis
      const primaryRedis = await this.connectToRegion(this.options.primaryRegion);
      regionStatus.connectionPool = primaryRedis;
      regionStatus.status = 'active';
      regionStatus.role = 'primary';
      regionStatus.updatedAt = Date.now();

      // Test connection
      await primaryRedis.ping();

      logger.info('Primary region initialized', {
        region: this.options.primaryRegion
      });

    } catch (error) {
      logger.error('Failed to initialize primary region', {
        region: this.options.primaryRegion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize secondary region
   */
  async initializeSecondaryRegion(region) {
    try {
      const regionStatus = this.regionStatus.get(region);
      
      // Connect to secondary Redis
      const secondaryRedis = await this.connectToRegion(region);
      regionStatus.connectionPool = secondaryRedis;
      regionStatus.status = 'active';
      regionStatus.role = 'secondary';
      regionStatus.updatedAt = Date.now();

      // Test connection
      await secondaryRedis.ping();

      logger.info('Secondary region initialized', {
        region
      });

    } catch (error) {
      logger.error('Failed to initialize secondary region', {
        region,
        error: error.message
      });
      
      // Mark as failed but don't throw
      const regionStatus = this.regionStatus.get(region);
      regionStatus.status = 'failed';
      regionStatus.updatedAt = Date.now();
    }
  }

  /**
   * Connect to region Redis
   */
  async connectToRegion(region) {
    // This would create a Redis connection to the specific region
    // For now, we'll simulate with the local Redis
    return {
      ping: async () => 'PONG',
      get: async (key) => this.redis.get(key),
      set: async (key, value) => this.redis.set(key, value),
      del: async (key) => this.redis.del(key),
      exists: async (key) => this.redis.exists(key),
      keys: async (pattern) => this.redis.keys(pattern),
      xadd: async (...args) => this.redis.xadd(...args),
      xrange: async (...args) => this.redis.xrange(...args),
      xread: async (...args) => this.redis.xread(...args),
      pipeline: () => this.redis.pipeline(),
      region
    };
  }

  /**
   * Start replication streams
   */
  startReplicationStreams() {
    for (const region of this.options.regions) {
      if (region !== this.options.primaryRegion) {
        this.startReplicationStream(region);
      }
    }
  }

  /**
   * Start replication stream for a region
   */
  startReplicationStream(region) {
    const stream = setInterval(async () => {
      try {
        await this.replicateToRegion(region);
      } catch (error) {
        logger.error('Replication stream error', {
          region,
          error: error.message
        });
      }
    }, this.options.syncInterval);

    this.replicationStreams.set(region, stream);

    logger.debug('Replication stream started', { region });
  }

  /**
   * Replicate data to region
   */
  async replicateToRegion(region) {
    try {
      const primaryStatus = this.regionStatus.get(this.currentPrimary);
      const secondaryStatus = this.regionStatus.get(region);

      if (!primaryStatus || !secondaryStatus) return;

      if (primaryStatus.status !== 'active' || secondaryStatus.status !== 'active') {
        return;
      }

      const startTime = Date.now();

      // Get changes since last sync
      const changes = await this.getChangesSince(region, secondaryStatus.lastSync);
      
      if (changes.length === 0) {
        return;
      }

      // Apply changes to secondary region
      await this.applyChanges(region, changes);

      // Update region status
      secondaryStatus.lastSync = Date.now();
      secondaryStatus.lag = Date.now() - changes[changes.length - 1].timestamp;
      secondaryStatus.metrics.writes += changes.length;
      secondaryStatus.metrics.latency = Date.now() - startTime;
      secondaryStatus.updatedAt = Date.now();

      logger.debug('Data replicated to region', {
        region,
        changeCount: changes.length,
        lag: secondaryStatus.lag
      });

      this.emit('replicationCompleted', {
        region,
        changeCount: changes.length,
        lag: secondaryStatus.lag
      });

    } catch (error) {
      logger.error('Failed to replicate to region', {
        region,
        error: error.message
      });

      const regionStatus = this.regionStatus.get(region);
      if (regionStatus) {
        regionStatus.metrics.errors += 1;
        regionStatus.updatedAt = Date.now();
      }

      this.emit('replicationFailed', {
        region,
        error: error.message
      });
    }
  }

  /**
   * Get changes since last sync
   */
  async getChangesSince(region, lastSync) {
    try {
      const primaryRedis = this.regionStatus.get(this.currentPrimary).connectionPool;
      
      // Get changes from event stream
      const streamKey = 'replication:changes';
      const lastId = lastSync ? lastSync.toString() : '0';
      
      const changes = await primaryRedis.xrange(
        streamKey,
        lastId,
        '+',
        'COUNT',
        this.options.batchSize
      );

      return changes.map(([id, fields]) => ({
        id,
        timestamp: parseInt(fields.timestamp),
        type: fields.type,
        key: fields.key,
        value: fields.value,
        operation: fields.operation
      }));

    } catch (error) {
      logger.error('Failed to get changes', {
        region,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Apply changes to region
   */
  async applyChanges(region, changes) {
    try {
      const secondaryRedis = this.regionStatus.get(region).connectionPool;
      
      const pipeline = secondaryRedis.pipeline();

      for (const change of changes) {
        switch (change.operation) {
          case 'SET':
            pipeline.set(change.key, change.value);
            break;
          case 'DEL':
            pipeline.del(change.key);
            break;
          case 'XADD':
            pipeline.xadd(change.key, '*', ...Object.entries(JSON.parse(change.value)).flat());
            break;
          default:
            logger.warn('Unknown operation', {
              operation: change.operation,
              region
            });
        }
      }

      await pipeline.exec();

    } catch (error) {
      logger.error('Failed to apply changes', {
        region,
        changeCount: changes.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Write data with replication
   */
  async write(key, value, options = {}) {
    try {
      const startTime = Date.now();
      
      // Write to primary region
      const primaryRedis = this.regionStatus.get(this.currentPrimary).connectionPool;
      
      await primaryRedis.set(key, value);

      // Record change for replication
      const changeKey = 'replication:changes';
      await primaryRedis.xadd(
        changeKey,
        '*',
        'timestamp', Date.now().toString(),
        'type', 'write',
        'key', key,
        'value', JSON.stringify(value),
        'operation', 'SET'
      );

      // Update metrics
      const primaryStatus = this.regionStatus.get(this.currentPrimary);
      primaryStatus.metrics.writes += 1;
      primaryStatus.metrics.latency = Date.now() - startTime;

      // Handle consistency levels
      if (options.consistencyLevel === 'strong') {
        await this.waitForReplication(key, options.timeout || 10000);
      }

      logger.debug('Data written and queued for replication', {
        key,
        region: this.currentPrimary
      });

      return {
        success: true,
        region: this.currentPrimary,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Failed to write data', {
        key,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Read data with region routing
   */
  async read(key, options = {}) {
    try {
      const startTime = Date.now();
      
      let region = options.region;
      let redis;

      if (region) {
        // Read from specific region
        const regionStatus = this.regionStatus.get(region);
        if (!regionStatus || regionStatus.status !== 'active') {
          throw new Error(`Region ${region} is not available`);
        }
        redis = regionStatus.connectionPool;
      } else {
        // Route to nearest healthy region
        region = this.selectReadRegion();
        redis = this.regionStatus.get(region).connectionPool;
      }

      const value = await redis.get(key);

      // Update metrics
      const regionStatus = this.regionStatus.get(region);
      regionStatus.metrics.reads += 1;
      regionStatus.metrics.latency = Date.now() - startTime;

      logger.debug('Data read from region', {
        key,
        region,
        found: !!value
      });

      return {
        success: true,
        value,
        region,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Failed to read data', {
        key,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Select best region for reads
   */
  selectReadRegion() {
    const healthyRegions = Array.from(this.regionStatus.entries())
      .filter(([_, status]) => status.status === 'active');

    if (healthyRegions.length === 0) {
      throw new Error('No healthy regions available');
    }

    // Select region with lowest latency
    return healthyRegions.reduce((best, [region, status]) => {
      if (!best || status.metrics.latency < best[1].metrics.latency) {
        return [region, status];
      }
      return best;
    })[0];
  }

  /**
   * Wait for replication to complete
   */
  async waitForReplication(key, timeout = 10000) {
    try {
      const startTime = Date.now();
      const targetRegions = this.options.regions.filter(r => r !== this.currentPrimary);

      for (const region of targetRegions) {
        const regionStatus = this.regionStatus.get(region);
        
        if (regionStatus.status !== 'active') {
          continue;
        }

        const redis = regionStatus.connectionPool;
        
        // Wait for key to appear in region
        while (Date.now() - startTime < timeout) {
          const exists = await redis.exists(key);
          if (exists) {
            break;
          }
          
          await this.sleep(100); // Wait 100ms
        }
      }

      logger.debug('Replication wait completed', {
        key,
        duration: Date.now() - startTime
      });

    } catch (error) {
      logger.error('Failed to wait for replication', {
        key,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Perform failover to new primary
   */
  async performFailover(newPrimary) {
    try {
      if (!this.options.enableFailover) {
        throw new Error('Failover is disabled');
      }

      const oldPrimary = this.currentPrimary;
      const newPrimaryStatus = this.regionStatus.get(newPrimary);

      if (!newPrimaryStatus || newPrimaryStatus.status !== 'active') {
        throw new Error(`Region ${newPrimary} is not available for failover`);
      }

      logger.info('Starting failover', {
        oldPrimary,
        newPrimary
      });

      // Update region roles
      const oldPrimaryStatus = this.regionStatus.get(oldPrimary);
      oldPrimaryStatus.role = 'secondary';
      oldPrimaryStatus.status = 'failing_over';
      oldPrimaryStatus.updatedAt = Date.now();

      newPrimaryStatus.role = 'primary';
      newPrimaryStatus.status = 'promoting';
      newPrimaryStatus.updatedAt = Date.now();

      // Wait for promotion to complete
      await this.sleep(5000);

      newPrimaryStatus.status = 'active';
      oldPrimaryStatus.status = 'active';

      this.currentPrimary = newPrimary;

      // Record failover
      this.failoverHistory.push({
        timestamp: Date.now(),
        oldPrimary,
        newPrimary,
        reason: 'manual_failover',
        duration: 0
      });

      // Restart replication streams
      this.restartReplicationStreams();

      logger.info('Failover completed', {
        oldPrimary,
        newPrimary,
        duration: Date.now() - this.failoverHistory[this.failoverHistory.length - 1].timestamp
      });

      this.emit('failoverCompleted', {
        oldPrimary,
        newPrimary,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Failed to perform failover', {
        newPrimary,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Automatic failover based on health checks
   */
  async handleAutomaticFailover(failedRegion) {
    try {
      if (!this.options.enableFailover || failedRegion !== this.currentPrimary) {
        return;
      }

      logger.warn('Primary region failed, initiating automatic failover', {
        failedRegion
      });

      // Select best secondary for promotion
      const candidates = Array.from(this.regionStatus.entries())
        .filter(([region, status]) => 
          region !== failedRegion && 
          status.status === 'active' && 
          status.role === 'secondary'
        )
        .sort(([, a], [, b]) => a.metrics.latency - b.metrics.latency);

      if (candidates.length === 0) {
        logger.error('No healthy secondary regions available for failover');
        return;
      }

      const [newPrimary] = candidates[0];

      await this.performFailover(newPrimary);

      this.failoverHistory[this.failoverHistory.length - 1].reason = 'automatic_failover';

    } catch (error) {
      logger.error('Automatic failover failed', {
        failedRegion,
        error: error.message
      });
    }
  }

  /**
   * Restart replication streams
   */
  restartReplicationStreams() {
    // Clear existing streams
    for (const [region, stream] of this.replicationStreams) {
      clearInterval(stream);
    }
    this.replicationStreams.clear();

    // Start new streams
    this.startReplicationStreams();
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // Every 30 seconds
  }

  /**
   * Perform health checks on all regions
   */
  async performHealthChecks() {
    for (const [region, status] of this.regionStatus) {
      try {
        const startTime = Date.now();
        
        if (status.connectionPool) {
          await status.connectionPool.ping();
          
          status.metrics.latency = Date.now() - startTime;
          status.status = 'active';
          status.updatedAt = Date.now();
        } else {
          status.status = 'disconnected';
          status.updatedAt = Date.now();
        }

      } catch (error) {
        logger.warn('Health check failed for region', {
          region,
          error: error.message
        });

        status.status = 'unhealthy';
        status.metrics.errors += 1;
        status.updatedAt = Date.now();

        // Handle primary region failure
        if (region === this.currentPrimary && status.status === 'unhealthy') {
          await this.handleAutomaticFailover(region);
        }
      }
    }

    this.emit('healthCheckCompleted', {
      regionStatus: Object.fromEntries(this.regionStatus),
      timestamp: Date.now()
    });
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync() {
    setInterval(async () => {
      try {
        await this.performPeriodicSync();
      } catch (error) {
        logger.error('Periodic sync failed', {
          error: error.message
        });
      }
    }, this.options.syncInterval);
  }

  /**
   * Perform periodic sync and cleanup
   */
  async performPeriodicSync() {
    try {
      // Clean up old replication records
      const primaryRedis = this.regionStatus.get(this.currentPrimary).connectionPool;
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      
      const streamKey = 'replication:changes';
      await primaryRedis.xtrim(streamKey, 'MINID', cutoffTime);

      logger.debug('Periodic sync completed');

    } catch (error) {
      logger.error('Failed to perform periodic sync', {
        error: error.message
      });
    }
  }

  /**
   * Get replication status
   */
  getStatus() {
    return {
      currentPrimary: this.currentPrimary,
      regions: Object.fromEntries(this.regionStatus),
      failoverHistory: this.failoverHistory,
      options: {
        consistencyLevel: this.options.consistencyLevel,
        enableFailover: this.options.enableFailover,
        replicationLag: this.options.replicationLag
      },
      timestamp: Date.now()
    };
  }

  /**
   * Get region metrics
   */
  getRegionMetrics(region) {
    const status = this.regionStatus.get(region);
    if (!status) {
      return null;
    }

    return {
      ...status.metrics,
      status: status.status,
      role: status.role,
      lag: status.lag,
      lastSync: status.lastSync,
      updatedAt: status.updatedAt
    };
  }

  /**
   * Get all region metrics
   */
  getAllRegionMetrics() {
    const metrics = {};
    
    for (const [region, status] of this.regionStatus) {
      metrics[region] = this.getRegionMetrics(region);
    }

    return metrics;
  }

  /**
   * Test connectivity to all regions
   */
  async testConnectivity() {
    const results = {};

    for (const [region, status] of this.regionStatus) {
      try {
        const startTime = Date.now();
        
        if (status.connectionPool) {
          await status.connectionPool.ping();
          
          results[region] = {
            success: true,
            latency: Date.now() - startTime,
            timestamp: Date.now()
          };
        } else {
          results[region] = {
            success: false,
            error: 'No connection available',
            timestamp: Date.now()
          };
        }

      } catch (error) {
        results[region] = {
          success: false,
          error: error.message,
          timestamp: Date.now()
        };
      }
    }

    return results;
  }

  /**
   * Helper function for sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const multiRegionReplication = new MultiRegionReplication({
  primaryRegion: process.env.AWS_REGION || 'us-east-1',
  regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
  consistencyLevel: 'eventual',
  enableFailover: true,
  enableConflictResolution: true,
  replicationLag: 5000,
  syncInterval: 10000
});

module.exports = multiRegionReplication;
