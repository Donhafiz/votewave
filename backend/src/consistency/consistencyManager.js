/**
 * Consistency Manager for VoteWave Distributed Systems
 * Manages consistency guarantees and replication lag across distributed components
 */

const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class ConsistencyManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      consistencyPrefix: 'consistency:',
      lagPrefix: 'replication_lag:',
      metricsPrefix: 'consistency_metrics:',
      defaultConsistencyLevel: 'eventual',
      maxAcceptableLag: 5000, // 5 seconds
      consistencyWindow: 10000, // 10 seconds
      monitoringInterval: 5000, // 5 seconds
      alertThreshold: 0.95, // 95% consistency required
      ...options
    };

    this.consistencyLevels = new Map();
    this.replicationLag = new Map();
    this.consistencyMetrics = new Map();
    this.activeTransactions = new Map();
    
    this.initializeConsistencyLevels();
    this.startMonitoring();
  }

  /**
   * Initialize consistency levels
   */
  initializeConsistencyLevels() {
    // Strong consistency - immediate consistency across all replicas
    this.consistencyLevels.set('strong', {
      description: 'All replicas have the most recent data',
      guarantee: 'linearizability',
      readPreference: 'primary',
      writeConcern: { w: 'majority', j: true },
      maxStaleness: 0,
      useCases: ['critical_voting', 'election_results', 'user_authentication']
    });

    // Eventual consistency - replicas converge over time
    this.consistencyLevels.set('eventual', {
      description: 'Replicas converge to the same state over time',
      guarantee: 'eventual_consistency',
      readPreference: 'secondaryPreferred',
      writeConcern: { w: 1, j: false },
      maxStaleness: this.options.maxAcceptableLag,
      useCases: ['analytics', 'reporting', 'audit_logs', 'notifications']
    });

    // Read-your-writes consistency - user sees their own writes
    this.consistencyLevels.set('read_your_writes', {
      description: 'User always sees their own writes',
      guarantee: 'read_your_writes',
      readPreference: 'primary',
      writeConcern: { w: 1, j: false },
      maxStaleness: 1000, // 1 second
      useCases: ['user_preferences', 'session_data', 'profile_updates']
    });

    // Bounded staleness - reads are not older than specified time
    this.consistencyLevels.set('bounded_staleness', {
      description: 'Reads are guaranteed to be no older than specified time',
      guarantee: 'bounded_staleness',
      readPreference: 'secondary',
      writeConcern: { w: 1, j: false },
      maxStaleness: this.options.consistencyWindow,
      useCases: ['voting_patterns', 'real_time_analytics', 'dashboard_data']
    });

    // Monotonic reads - reads never go backwards in time
    this.consistencyLevels.set('monotonic_reads', {
      description: 'Reads never observe older data after seeing newer data',
      guarantee: 'monotonic_reads',
      readPreference: 'primary',
      writeConcern: { w: 1, j: false },
      maxStaleness: Infinity,
      useCases: ['sequential_operations', 'state_machines', 'workflow_processes']
    });
  }

  /**
   * Start consistency monitoring
   */
  startMonitoring() {
    setInterval(async () => {
      await this.collectConsistencyMetrics();
      await this.checkConsistencyViolations();
      await this.updateReplicationLag();
    }, this.options.monitoringInterval);

    logger.info('Consistency monitoring started', {
      interval: this.options.monitoringInterval,
      maxLag: this.options.maxAcceptableLag
    });
  }

  /**
   * Execute operation with consistency guarantee
   */
  async executeWithConsistency(operation, consistencyLevel, options = {}) {
    const startTime = Date.now();
    const operationId = this.generateOperationId();
    
    try {
      const levelConfig = this.consistencyLevels.get(consistencyLevel);
      if (!levelConfig) {
        throw new Error(`Unknown consistency level: ${consistencyLevel}`);
      }

      // Track operation
      this.activeTransactions.set(operationId, {
        operation,
        consistencyLevel,
        startTime,
        status: 'executing'
      });

      // Execute based on consistency level
      let result;
      switch (consistencyLevel) {
        case 'strong':
          result = await this.executeStrongConsistency(operation, options);
          break;
        case 'eventual':
          result = await this.executeEventualConsistency(operation, options);
          break;
        case 'read_your_writes':
          result = await this.executeReadYourWritesConsistency(operation, options);
          break;
        case 'bounded_staleness':
          result = await this.executeBoundedStalenessConsistency(operation, options);
          break;
        case 'monotonic_reads':
          result = await this.executeMonotonicReadsConsistency(operation, options);
          break;
        default:
          throw new Error(`Unsupported consistency level: ${consistencyLevel}`);
      }

      // Record successful operation
      const duration = Date.now() - startTime;
      this.recordConsistencyMetrics(consistencyLevel, duration, true);

      // Update transaction status
      this.activeTransactions.set(operationId, {
        ...this.activeTransactions.get(operationId),
        status: 'completed',
        endTime: Date.now(),
        duration
      });

      logger.debug('Consistency operation completed', {
        operationId,
        consistencyLevel,
        duration,
        success: true
      });

      this.emit('consistencyOperationCompleted', {
        operationId,
        consistencyLevel,
        result,
        duration
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record failed operation
      this.recordConsistencyMetrics(consistencyLevel, duration, false);

      // Update transaction status
      this.activeTransactions.set(operationId, {
        ...this.activeTransactions.get(operationId),
        status: 'failed',
        endTime: Date.now(),
        duration,
        error: error.message
      });

      logger.error('Consistency operation failed', {
        operationId,
        consistencyLevel,
        duration,
        error: error.message
      });

      this.emit('consistencyOperationFailed', {
        operationId,
        consistencyLevel,
        error,
        duration
      });

      throw error;
    } finally {
      // Clean up transaction after delay
      setTimeout(() => {
        this.activeTransactions.delete(operationId);
      }, 60000); // Keep for 1 minute
    }
  }

  /**
   * Execute strong consistency operation
   */
  async executeStrongConsistency(operation, options) {
    // Write to primary and wait for majority acknowledgment
    if (operation.type === 'write') {
      const writePromises = [];
      
      // Write to primary
      writePromises.push(this.writeToPrimary(operation.data));
      
      // Write to replicas and wait for majority
      const replicas = await this.getReplicaNodes();
      const majorityCount = Math.floor(replicas.length / 2) + 1;
      
      for (let i = 0; i < majorityCount - 1; i++) {
        writePromises.push(this.writeToReplica(replicas[i], operation.data));
      }

      await Promise.all(writePromises);
      
      // Verify consistency across replicas
      await this.verifyStrongConsistency(operation.key, operation.data);
    }

    // Read from primary to ensure latest data
    if (operation.type === 'read') {
      return await this.readFromPrimary(operation.key);
    }

    return await this.executeGenericOperation(operation);
  }

  /**
   * Execute eventual consistency operation
   */
  async executeEventualConsistency(operation, options) {
    // Write to primary only, replicas will be updated asynchronously
    if (operation.type === 'write') {
      await this.writeToPrimary(operation.data);
      this.scheduleReplication(operation.key, operation.data);
    }

    // Read from nearest replica (may be stale)
    if (operation.type === 'read') {
      return await this.readFromNearestReplica(operation.key);
    }

    return await this.executeGenericOperation(operation);
  }

  /**
   * Execute read-your-writes consistency operation
   */
  async executeReadYourWritesConsistency(operation, options) {
    const userId = options.userId;
    
    if (operation.type === 'write') {
      await this.writeToPrimary(operation.data);
      
      // Track user's recent writes
      await this.trackUserWrite(userId, operation.key, operation.data);
      
      this.scheduleReplication(operation.key, operation.data);
    }

    if (operation.type === 'read') {
      // Check if user has recent write for this key
      const userWrite = await this.getUserWrite(userId, operation.key);
      if (userWrite) {
        return userWrite.data;
      }
      
      // Otherwise read from primary
      return await this.readFromPrimary(operation.key);
    }

    return await this.executeGenericOperation(operation);
  }

  /**
   * Execute bounded staleness consistency operation
   */
  async executeBoundedStalenessConsistency(operation, options) {
    const maxStaleness = options.maxStaleness || this.options.consistencyWindow;
    
    if (operation.type === 'write') {
      await this.writeToPrimary(operation.data);
      this.scheduleReplication(operation.key, operation.data);
    }

    if (operation.type === 'read') {
      // Find replica with data within staleness bounds
      const suitableReplica = await this.findReplicaWithinStaleness(
        operation.key, 
        maxStaleness
      );
      
      if (suitableReplica) {
        return await this.readFromReplica(suitableReplica, operation.key);
      }
      
      // Fallback to primary
      return await this.readFromPrimary(operation.key);
    }

    return await this.executeGenericOperation(operation);
  }

  /**
   * Execute monotonic reads consistency operation
   */
  async executeMonotonicReadsConsistency(operation, options) {
    const sessionId = options.sessionId;
    
    if (operation.type === 'write') {
      await this.writeToPrimary(operation.data);
      
      // Track session's read timestamp
      await this.updateSessionReadTimestamp(sessionId, Date.now());
      
      this.scheduleReplication(operation.key, operation.data);
    }

    if (operation.type === 'read') {
      const sessionTimestamp = await this.getSessionReadTimestamp(sessionId);
      
      // Ensure read is not older than session's last read
      const suitableReplica = await this.findReplicaAfterTimestamp(
        operation.key,
        sessionTimestamp
      );
      
      if (suitableReplica) {
        const data = await this.readFromReplica(suitableReplica, operation.key);
        await this.updateSessionReadTimestamp(sessionId, Date.now());
        return data;
      }
      
      // Fallback to primary
      const data = await this.readFromPrimary(operation.key);
      await this.updateSessionReadTimestamp(sessionId, Date.now());
      return data;
    }

    return await this.executeGenericOperation(operation);
  }

  /**
   * Collect consistency metrics
   */
  async collectConsistencyMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        activeTransactions: this.activeTransactions.size,
        replicationLag: await this.getCurrentReplicationLag(),
        consistencyViolations: await this.getConsistencyViolations(),
        operationsByLevel: {}
      };

      // Collect metrics by consistency level
      for (const [level] of this.consistencyLevels) {
        const levelMetrics = await this.getLevelMetrics(level);
        metrics.operationsByLevel[level] = levelMetrics;
      }

      // Store metrics
      const metricsKey = `${this.options.metricsPrefix}${Date.now()}`;
      await this.redis.setex(metricsKey, 3600, JSON.stringify(metrics));

      // Update in-memory metrics
      this.consistencyMetrics.set('current', metrics);

      this.emit('metricsCollected', metrics);

    } catch (error) {
      logger.error('Failed to collect consistency metrics', {
        error: error.message
      });
    }
  }

  /**
   * Check for consistency violations
   */
  async checkConsistencyViolations() {
    try {
      const violations = [];

      // Check replication lag violations
      const currentLag = await this.getCurrentReplicationLag();
      if (currentLag > this.options.maxAcceptableLag) {
        violations.push({
          type: 'replication_lag',
          severity: 'high',
          description: `Replication lag ${currentLag}ms exceeds threshold ${this.options.maxAcceptableLag}ms`,
          timestamp: Date.now(),
          metrics: { currentLag, threshold: this.options.maxAcceptableLag }
        });
      }

      // Check consistency ratio
      const consistencyRatio = await this.calculateConsistencyRatio();
      if (consistencyRatio < this.options.alertThreshold) {
        violations.push({
          type: 'consistency_ratio',
          severity: 'medium',
          description: `Consistency ratio ${(consistencyRatio * 100).toFixed(2)}% below threshold ${(this.options.alertThreshold * 100).toFixed(2)}%`,
          timestamp: Date.now(),
          metrics: { consistencyRatio, threshold: this.options.alertThreshold }
        });
      }

      // Check for stuck transactions
      const stuckTransactions = await this.findStuckTransactions();
      if (stuckTransactions.length > 0) {
        violations.push({
          type: 'stuck_transactions',
          severity: 'medium',
          description: `${stuckTransactions.length} transactions stuck for more than 5 minutes`,
          timestamp: Date.now(),
          metrics: { stuckTransactions: stuckTransactions.length }
        });
      }

      // Store violations
      if (violations.length > 0) {
        await this.storeConsistencyViolations(violations);
        
        this.emit('consistencyViolations', violations);
        
        logger.warn('Consistency violations detected', {
          count: violations.length,
          violations: violations.map(v => ({ type: v.type, severity: v.severity }))
        });
      }

    } catch (error) {
      logger.error('Failed to check consistency violations', {
        error: error.message
      });
    }
  }

  /**
   * Update replication lag monitoring
   */
  async updateReplicationLag() {
    try {
      const replicas = await this.getReplicaNodes();
      
      for (const replica of replicas) {
        const lag = await this.measureReplicationLag(replica);
        this.replicationLag.set(replica, lag);
        
        // Store in Redis
        const lagKey = `${this.options.lagPrefix}${replica}`;
        await this.redis.setex(lagKey, 60, lag.toString());
      }

      this.emit('replicationLagUpdated', this.replicationLag);

    } catch (error) {
      logger.error('Failed to update replication lag', {
        error: error.message
      });
    }
  }

  /**
   * Get current replication lag
   */
  async getCurrentReplicationLag() {
    const lags = Array.from(this.replicationLag.values());
    return lags.length > 0 ? Math.max(...lags) : 0;
  }

  /**
   * Calculate consistency ratio
   */
  async calculateConsistencyRatio() {
    try {
      const recentMetrics = await this.getRecentMetrics(100); // Last 100 metrics
      
      if (recentMetrics.length === 0) {
        return 1.0;
      }

      const totalOperations = recentMetrics.reduce((sum, m) => {
        const opsByLevel = Object.values(m.operationsByLevel || {});
        return sum + opsByLevel.reduce((levelSum, level) => levelSum + (level.total || 0), 0);
      }, 0);

      const successfulOperations = recentMetrics.reduce((sum, m) => {
        const opsByLevel = Object.values(m.operationsByLevel || {});
        return sum + opsByLevel.reduce((levelSum, level) => levelSum + (level.successful || 0), 0);
      }, 0);

      return totalOperations > 0 ? successfulOperations / totalOperations : 1.0;

    } catch (error) {
      logger.error('Failed to calculate consistency ratio', {
        error: error.message
      });
      return 1.0;
    }
  }

  /**
   * Get metrics for specific consistency level
   */
  async getLevelMetrics(level) {
    const key = `${this.options.metricsPrefix}level:${level}`;
    const metrics = await this.redis.get(key);
    
    if (!metrics) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        averageLatency: 0,
        lastUpdated: Date.now()
      };
    }

    return JSON.parse(metrics);
  }

  /**
   * Record consistency metrics
   */
  async recordConsistencyMetrics(level, latency, success) {
    const key = `${this.options.metricsPrefix}level:${level}`;
    const current = await this.getLevelMetrics(level);
    
    const updated = {
      total: current.total + 1,
      successful: current.successful + (success ? 1 : 0),
      failed: current.failed + (success ? 0 : 1),
      averageLatency: ((current.averageLatency * current.total) + latency) / (current.total + 1),
      lastUpdated: Date.now()
    };

    await this.redis.setex(key, 3600, JSON.stringify(updated));
  }

  /**
   * Get recent metrics
   */
  async getRecentMetrics(count = 10) {
    const keys = await this.redis.keys(`${this.options.metricsPrefix}*`);
    const metricKeys = keys.filter(key => !key.includes('level:'));
    
    // Sort by timestamp and get recent ones
    const sortedKeys = metricKeys.sort().slice(-count);
    
    if (sortedKeys.length === 0) {
      return [];
    }

    const metricsData = await this.redis.mget(sortedKeys);
    return metricsData
      .filter(data => data !== null)
      .map(data => JSON.parse(data));
  }

  /**
   * Find stuck transactions
   */
  async findStuckTransactions() {
    const stuck = [];
    const now = Date.now();
    const stuckThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [id, transaction] of this.activeTransactions) {
      if (transaction.status === 'executing' && 
          (now - transaction.startTime) > stuckThreshold) {
        stuck.push({
          id,
          operation: transaction.operation,
          consistencyLevel: transaction.consistencyLevel,
          duration: now - transaction.startTime
        });
      }
    }

    return stuck;
  }

  /**
   * Store consistency violations
   */
  async storeConsistencyViolations(violations) {
    const violationKey = `${this.options.consistencyPrefix}violations:${Date.now()}`;
    await this.redis.setex(violationKey, 86400, JSON.stringify(violations));
  }

  /**
   * Get consistency violations
   */
  async getConsistencyViolations() {
    const keys = await this.redis.keys(`${this.options.consistencyPrefix}violations:*`);
    
    if (keys.length === 0) {
      return [];
    }

    const violationsData = await this.redis.mget(keys);
    const allViolations = violationsData
      .filter(data => data !== null)
      .flatMap(data => JSON.parse(data));

    // Return violations from last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return allViolations.filter(v => v.timestamp > oneHourAgo);
  }

  /**
   * Get consistency level configuration
   */
  getConsistencyLevel(level) {
    return this.consistencyLevels.get(level);
  }

  /**
   * Get all consistency levels
   */
  getAllConsistencyLevels() {
    const levels = {};
    for (const [name, config] of this.consistencyLevels) {
      levels[name] = config;
    }
    return levels;
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics() {
    return this.consistencyMetrics.get('current');
  }

  /**
   * Get replication lag by replica
   */
  getReplicationLag() {
    return Object.fromEntries(this.replicationLag);
  }

  /**
   * Get active transactions
   */
  getActiveTransactions() {
    return Object.fromEntries(this.activeTransactions);
  }

  /**
   * Generate operation ID
   */
  generateOperationId() {
    return `consistency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Execute generic operation (placeholder)
   */
  async executeGenericOperation(operation) {
    // This would be implemented based on specific operation types
    logger.debug('Executing generic operation', { operation });
    return { success: true, data: operation.data };
  }

  /**
   * Placeholder methods for database operations
   * These would be implemented based on the actual database system
   */
  async writeToPrimary(data) {
    logger.debug('Writing to primary', { data });
    return { success: true };
  }

  async writeToReplica(replica, data) {
    logger.debug('Writing to replica', { replica, data });
    return { success: true };
  }

  async readFromPrimary(key) {
    logger.debug('Reading from primary', { key });
    return { key, value: 'primary_value' };
  }

  async readFromNearestReplica(key) {
    logger.debug('Reading from nearest replica', { key });
    return { key, value: 'replica_value' };
  }

  async readFromReplica(replica, key) {
    logger.debug('Reading from replica', { replica, key });
    return { key, value: `replica_${replica}_value` };
  }

  async getReplicaNodes() {
    return ['replica1', 'replica2', 'replica3'];
  }

  async measureReplicationLag(replica) {
    // Simulate lag measurement
    return Math.random() * 1000; // 0-1000ms
  }

  async verifyStrongConsistency(key, data) {
    logger.debug('Verifying strong consistency', { key, data });
    return true;
  }

  async scheduleReplication(key, data) {
    logger.debug('Scheduling replication', { key, data });
  }

  async trackUserWrite(userId, key, data) {
    const writeKey = `${this.options.consistencyPrefix}user:${userId}:${key}`;
    await this.redis.setex(writeKey, 300, JSON.stringify({ data, timestamp: Date.now() }));
  }

  async getUserWrite(userId, key) {
    const writeKey = `${this.options.consistencyPrefix}user:${userId}:${key}`;
    const write = await this.redis.get(writeKey);
    return write ? JSON.parse(write) : null;
  }

  async updateSessionReadTimestamp(sessionId, timestamp) {
    const sessionKey = `${this.options.consistencyPrefix}session:${sessionId}`;
    await this.redis.setex(sessionKey, 1800, timestamp.toString());
  }

  async getSessionReadTimestamp(sessionId) {
    const sessionKey = `${this.options.consistencyPrefix}session:${sessionId}`;
    const timestamp = await this.redis.get(sessionKey);
    return timestamp ? parseInt(timestamp) : 0;
  }

  async findReplicaWithinStaleness(key, maxStaleness) {
    // Find replica with data within staleness bounds
    const replicas = await this.getReplicaNodes();
    for (const replica of replicas) {
      const lag = this.replicationLag.get(replica) || 0;
      if (lag <= maxStaleness) {
        return replica;
      }
    }
    return null;
  }

  async findReplicaAfterTimestamp(key, timestamp) {
    // Find replica with data after specified timestamp
    const replicas = await this.getReplicaNodes();
    for (const replica of replicas) {
      const lag = this.replicationLag.get(replica) || 0;
      const replicaTimestamp = Date.now() - lag;
      if (replicaTimestamp >= timestamp) {
        return replica;
      }
    }
    return null;
  }
}

// Create singleton instance
const consistencyManager = new ConsistencyManager({
  consistencyPrefix: 'consistency:',
  lagPrefix: 'replication_lag:',
  metricsPrefix: 'consistency_metrics:',
  defaultConsistencyLevel: 'eventual',
  maxAcceptableLag: 5000,
  consistencyWindow: 10000,
  monitoringInterval: 5000,
  alertThreshold: 0.95
});

module.exports = consistencyManager;
