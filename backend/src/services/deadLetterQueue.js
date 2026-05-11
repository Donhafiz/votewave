const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class DeadLetterQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.queuePrefix = options.queuePrefix || 'dlq:';
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000; // 5 seconds
    this.maxQueueSize = options.maxQueueSize || 10000;
    this.ttl = options.ttl || 86400000; // 24 hours
    this.processingInterval = options.processingInterval || 30000; // 30 seconds
    this.alertThreshold = options.alertThreshold || 100;
    
    this.stats = {
      totalEvents: 0,
      failedEvents: 0,
      retriedEvents: 0,
      resolvedEvents: 0,
      expiredEvents: 0,
      queueSize: 0
    };

    this.processors = new Map();
    this.retryStrategies = new Map();
    
    this.initializeRetryStrategies();
    this.startProcessing();
  }

  /**
   * Initialize default retry strategies
   */
  initializeRetryStrategies() {
    // Exponential backoff strategy
    this.addRetryStrategy('exponential', (attempt) => {
      return this.retryDelay * Math.pow(2, attempt - 1);
    });

    // Linear backoff strategy
    this.addRetryStrategy('linear', (attempt) => {
      return this.retryDelay * attempt;
    });

    // Fixed delay strategy
    this.addRetryStrategy('fixed', () => {
      return this.retryDelay;
    });

    // Immediate retry strategy (for transient issues)
    this.addRetryStrategy('immediate', () => {
      return 100; // 100ms
    });
  }

  /**
   * Add retry strategy
   * @param {string} name - Strategy name
   * @param {Function} delayCalculator - Function to calculate delay
   */
  addRetryStrategy(name, delayCalculator) {
    this.retryStrategies.set(name, delayCalculator);
    logger.info('Retry strategy added', { name });
  }

  /**
   * Add failed event to dead letter queue
   * @param {Object} event - Failed event
   * @param {Error} error - Error that caused failure
   * @param {Object} context - Additional context
   * @returns {Promise<string>} - DLQ entry ID
   */
  async addEvent(event, error, context = {}) {
    try {
      const dlqId = this.generateDLQId();
      const dlqEntry = {
        id: dlqId,
        originalEvent: event,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
          status: error.status
        },
        context: {
          ...context,
          timestamp: new Date().toISOString(),
          retryCount: 0,
          maxRetries: this.maxRetries,
          retryStrategy: context.retryStrategy || 'exponential',
          severity: this.determineSeverity(error, context)
        },
        status: 'pending',
        addedAt: Date.now(),
        lastRetryAt: null,
        nextRetryAt: this.calculateNextRetry(0, context.retryStrategy || 'exponential')
      };

      // Check queue size limit
      const currentSize = await this.getQueueSize();
      if (currentSize >= this.maxQueueSize) {
        logger.error('Dead letter queue is full', {
          currentSize,
          maxSize: this.maxQueueSize,
          eventId: event.id
        });
        
        // Emit alert
        this.emit('queueFull', {
          currentSize,
          maxSize: this.maxQueueSize,
          event
        });
        
        throw new Error('Dead letter queue is full');
      }

      // Store in Redis
      await this.redis.hset(
        this.queuePrefix + 'events',
        dlqId,
        JSON.stringify(dlqEntry)
      );

      // Add to retry queue
      await this.redis.zadd(
        this.queuePrefix + 'retry_queue',
        dlqEntry.nextRetryAt,
        dlqId
      );

      // Update stats
      this.stats.totalEvents++;
      this.stats.failedEvents++;
      this.stats.queueSize = currentSize + 1;

      // Check alert threshold
      if (this.stats.queueSize >= this.alertThreshold) {
        this.emit('alertThresholdReached', {
          queueSize: this.stats.queueSize,
          threshold: this.alertThreshold
        });
      }

      logger.warn('Event added to dead letter queue', {
        dlqId,
        eventId: event.id,
        eventType: event.type,
        error: error.message,
        retryCount: 0,
        severity: dlqEntry.context.severity
      });

      this.emit('eventAdded', dlqEntry);

      return dlqId;

    } catch (err) {
      logger.error('Failed to add event to dead letter queue', {
        eventId: event.id,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Process events ready for retry
   */
  async processRetryQueue() {
    try {
      const now = Date.now();
      
      // Get events ready for retry
      const readyEvents = await this.redis.zrangebyscore(
        this.queuePrefix + 'retry_queue',
        0,
        now
      );

      if (readyEvents.length === 0) {
        return;
      }

      logger.info('Processing retry queue', {
        readyCount: readyEvents.length
      });

      for (const dlqId of readyEvents) {
        await this.processRetryEvent(dlqId);
      }

    } catch (error) {
      logger.error('Failed to process retry queue', {
        error: error.message
      });
    }
  }

  /**
   * Process individual retry event
   * @param {string} dlqId - DLQ entry ID
   */
  async processRetryEvent(dlqId) {
    try {
      // Get DLQ entry
      const dlqData = await this.redis.hget(
        this.queuePrefix + 'events',
        dlqId
      );

      if (!dlqData) {
        // Remove from retry queue if entry doesn't exist
        await this.redis.zrem(this.queuePrefix + 'retry_queue', dlqId);
        return;
      }

      const dlqEntry = JSON.parse(dlqData);

      // Check if max retries exceeded
      if (dlqEntry.context.retryCount >= dlqEntry.context.maxRetries) {
        await this.markAsExhausted(dlqId, dlqEntry);
        return;
      }

      // Get processor for event type
      const processor = this.processors.get(dlqEntry.originalEvent.type);
      
      if (!processor) {
        logger.error('No processor found for event type', {
          dlqId,
          eventType: dlqEntry.originalEvent.type
        });
        
        await this.markAsFailed(dlqId, dlqEntry, 'No processor available');
        return;
      }

      // Attempt to process event
      try {
        logger.info('Retrying event from dead letter queue', {
          dlqId,
          eventId: dlqEntry.originalEvent.id,
          eventType: dlqEntry.originalEvent.type,
          retryCount: dlqEntry.context.retryCount + 1
        });

        await processor(dlqEntry.originalEvent, dlqEntry.context);

        // Success - remove from DLQ
        await this.markAsResolved(dlqId, dlqEntry);

      } catch (retryError) {
        // Retry failed - update retry count and schedule next retry
        await this.scheduleNextRetry(dlqId, dlqEntry, retryError);
      }

    } catch (error) {
      logger.error('Failed to process retry event', {
        dlqId,
        error: error.message
      });
    }
  }

  /**
   * Schedule next retry for event
   * @param {string} dlqId - DLQ entry ID
   * @param {Object} dlqEntry - DLQ entry
   * @param {Error} retryError - Retry error
   */
  async scheduleNextRetry(dlqId, dlqEntry, retryError) {
    try {
      const nextRetryCount = dlqEntry.context.retryCount + 1;
      const nextRetryAt = this.calculateNextRetry(
        nextRetryCount,
        dlqEntry.context.retryStrategy
      );

      // Update DLQ entry
      dlqEntry.context.retryCount = nextRetryCount;
      dlqEntry.context.lastError = {
        message: retryError.message,
        stack: retryError.stack,
        timestamp: new Date().toISOString()
      };
      dlqEntry.lastRetryAt = Date.now();
      dlqEntry.nextRetryAt = nextRetryAt;

      // Save updated entry
      await this.redis.hset(
        this.queuePrefix + 'events',
        dlqId,
        JSON.stringify(dlqEntry)
      );

      // Update retry queue
      await this.redis.zadd(
        this.queuePrefix + 'retry_queue',
        nextRetryAt,
        dlqId
      );

      this.stats.retriedEvents++;

      logger.warn('Event retry scheduled', {
        dlqId,
        eventId: dlqEntry.originalEvent.id,
        retryCount: nextRetryCount,
        maxRetries: dlqEntry.context.maxRetries,
        nextRetryAt: new Date(nextRetryAt).toISOString(),
        error: retryError.message
      });

      this.emit('retryScheduled', {
        dlqId,
        dlqEntry,
        retryError
      });

    } catch (error) {
      logger.error('Failed to schedule next retry', {
        dlqId,
        error: error.message
      });
    }
  }

  /**
   * Mark event as resolved
   * @param {string} dlqId - DLQ entry ID
   * @param {Object} dlqEntry - DLQ entry
   */
  async markAsResolved(dlqId, dlqEntry) {
    try {
      // Update status
      dlqEntry.status = 'resolved';
      dlqEntry.resolvedAt = Date.now();

      // Save updated entry
      await this.redis.hset(
        this.queuePrefix + 'events',
        dlqId,
        JSON.stringify(dlqEntry)
      );

      // Remove from retry queue
      await this.redis.zrem(this.queuePrefix + 'retry_queue', dlqId);

      // Update stats
      this.stats.resolvedEvents++;
      this.stats.queueSize = Math.max(0, this.stats.queueSize - 1);

      logger.info('Event resolved from dead letter queue', {
        dlqId,
        eventId: dlqEntry.originalEvent.id,
        totalRetries: dlqEntry.context.retryCount,
        resolutionTime: dlqEntry.resolvedAt - dlqEntry.addedAt
      });

      this.emit('eventResolved', dlqEntry);

    } catch (error) {
      logger.error('Failed to mark event as resolved', {
        dlqId,
        error: error.message
      });
    }
  }

  /**
   * Mark event as exhausted (max retries reached)
   * @param {string} dlqId - DLQ entry ID
   * @param {Object} dlqEntry - DLQ entry
   */
  async markAsExhausted(dlqId, dlqEntry) {
    try {
      // Update status
      dlqEntry.status = 'exhausted';
      dlqEntry.exhaustedAt = Date.now();

      // Save updated entry
      await this.redis.hset(
        this.queuePrefix + 'events',
        dlqId,
        JSON.stringify(dlqEntry)
      );

      // Remove from retry queue
      await this.redis.zrem(this.queuePrefix + 'retry_queue', dlqId);

      // Update stats
      this.stats.queueSize = Math.max(0, this.stats.queueSize - 1);

      logger.error('Event exhausted from dead letter queue', {
        dlqId,
        eventId: dlqEntry.originalEvent.id,
        maxRetries: dlqEntry.context.maxRetries,
        totalAttempts: dlqEntry.context.retryCount,
        finalError: dlqEntry.context.lastError?.message
      });

      this.emit('eventExhausted', dlqEntry);

    } catch (error) {
      logger.error('Failed to mark event as exhausted', {
        dlqId,
        error: error.message
      });
    }
  }

  /**
   * Mark event as permanently failed
   * @param {string} dlqId - DLQ entry ID
   * @param {Object} dlqEntry - DLQ entry
   * @param {string} reason - Failure reason
   */
  async markAsFailed(dlqId, dlqEntry, reason) {
    try {
      // Update status
      dlqEntry.status = 'failed';
      dlqEntry.failedAt = Date.now();
      dlqEntry.failureReason = reason;

      // Save updated entry
      await this.redis.hset(
        this.queuePrefix + 'events',
        dlqId,
        JSON.stringify(dlqEntry)
      );

      // Remove from retry queue
      await this.redis.zrem(this.queuePrefix + 'retry_queue', dlqId);

      // Update stats
      this.stats.queueSize = Math.max(0, this.stats.queueSize - 1);

      logger.error('Event marked as permanently failed', {
        dlqId,
        eventId: dlqEntry.originalEvent.id,
        reason
      });

      this.emit('eventFailed', { dlqEntry, reason });

    } catch (error) {
      logger.error('Failed to mark event as failed', {
        dlqId,
        error: error.message
      });
    }
  }

  /**
   * Add event processor
   * @param {string} eventType - Event type
   * @param {Function} processor - Processing function
   */
  addProcessor(eventType, processor) {
    this.processors.set(eventType, processor);
    logger.info('Event processor added', { eventType });
  }

  /**
   * Remove event processor
   * @param {string} eventType - Event type
   */
  removeProcessor(eventType) {
    this.processors.delete(eventType);
    logger.info('Event processor removed', { eventType });
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} - Queue statistics
   */
  async getStats() {
    try {
      const queueSize = await this.getQueueSize();
      const retryQueueSize = await this.redis.zcard(this.queuePrefix + 'retry_queue');
      
      // Get events by status
      const allEvents = await this.redis.hgetall(this.queuePrefix + 'events');
      const events = Object.values(allEvents).map(data => JSON.parse(data));
      
      const statusCounts = events.reduce((counts, event) => {
        counts[event.status] = (counts[event.status] || 0) + 1;
        return counts;
      }, {});

      const severityCounts = events.reduce((counts, event) => {
        const severity = event.context.severity || 'unknown';
        counts[severity] = (counts[severity] || 0) + 1;
        return counts;
      }, {});

      // Calculate average retry time
      const resolvedEvents = events.filter(e => e.status === 'resolved');
      const avgRetryTime = resolvedEvents.length > 0
        ? resolvedEvents.reduce((sum, e) => sum + (e.resolvedAt - e.addedAt), 0) / resolvedEvents.length
        : 0;

      return {
        ...this.stats,
        queueSize,
        retryQueueSize,
        statusCounts,
        severityCounts,
        averageRetryTime: Math.round(avgRetryTime),
        processorCount: this.processors.size,
        retryStrategyCount: this.retryStrategies.size
      };

    } catch (error) {
      logger.error('Failed to get DLQ stats', {
        error: error.message
      });
      
      return this.stats;
    }
  }

  /**
   * Get events by status
   * @param {string} status - Event status
   * @param {number} limit - Limit results
   * @returns {Promise<Array>} - Array of events
   */
  async getEventsByStatus(status, limit = 100) {
    try {
      const allEvents = await this.redis.hgetall(this.queuePrefix + 'events');
      const events = Object.values(allEvents)
        .map(data => JSON.parse(data))
        .filter(event => event.status === status)
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, limit);

      return events;

    } catch (error) {
      logger.error('Failed to get events by status', {
        status,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get events by severity
   * @param {string} severity - Event severity
   * @param {number} limit - Limit results
   * @returns {Promise<Array>} - Array of events
   */
  async getEventsBySeverity(severity, limit = 100) {
    try {
      const allEvents = await this.redis.hgetall(this.queuePrefix + 'events');
      const events = Object.values(allEvents)
        .map(data => JSON.parse(data))
        .filter(event => event.context.severity === severity)
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, limit);

      return events;

    } catch (error) {
      logger.error('Failed to get events by severity', {
        severity,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Manually retry event
   * @param {string} dlqId - DLQ entry ID
   * @returns {Promise<boolean>} - True if retry scheduled
   */
  async manualRetry(dlqId) {
    try {
      const dlqData = await this.redis.hget(
        this.queuePrefix + 'events',
        dlqId
      );

      if (!dlqData) {
        return false;
      }

      const dlqEntry = JSON.parse(dlqData);

      // Reset retry count for manual retry
      dlqEntry.context.retryCount = 0;
      dlqEntry.context.manualRetry = true;
      dlqEntry.nextRetryAt = Date.now();

      // Save updated entry
      await this.redis.hset(
        this.queuePrefix + 'events',
        dlqId,
        JSON.stringify(dlqEntry)
      );

      // Add to retry queue
      await this.redis.zadd(
        this.queuePrefix + 'retry_queue',
        dlqEntry.nextRetryAt,
        dlqId
      );

      logger.info('Manual retry scheduled', {
        dlqId,
        eventId: dlqEntry.originalEvent.id
      });

      this.emit('manualRetryScheduled', dlqEntry);

      return true;

    } catch (error) {
      logger.error('Failed to schedule manual retry', {
        dlqId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clear resolved events
   * @param {number} olderThan - Clear events older than this timestamp
   * @returns {Promise<number>} - Number of events cleared
   */
  async clearResolvedEvents(olderThan = Date.now() - (7 * 24 * 60 * 60 * 1000)) { // 7 days
    let clearedCount = 0;

    try {
      const allEvents = await this.redis.hgetall(this.queuePrefix + 'events');
      
      for (const [dlqId, eventData] of Object.entries(allEvents)) {
        try {
          const event = JSON.parse(eventData);
          
          if (event.status === 'resolved' && event.resolvedAt < olderThan) {
            await this.redis.hdel(this.queuePrefix + 'events', dlqId);
            clearedCount++;
          }
        } catch (error) {
          // Remove malformed entries
          await this.redis.hdel(this.queuePrefix + 'events', dlqId);
          clearedCount++;
        }
      }

      if (clearedCount > 0) {
        logger.info('Resolved events cleared', {
          clearedCount,
          olderThan: new Date(olderThan).toISOString()
        });
      }

    } catch (error) {
      logger.error('Failed to clear resolved events', {
        error: error.message
      });
    }

    return clearedCount;
  }

  /**
   * Helper methods
   */
  generateDLQId() {
    return `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  determineSeverity(error, context) {
    // Determine severity based on error and context
    if (error.status >= 500) {
      return 'critical';
    } else if (error.status >= 400) {
      return 'warning';
    } else if (context.essential === true) {
      return 'high';
    } else {
      return 'medium';
    }
  }

  calculateNextRetry(attempt, strategy) {
    const delayCalculator = this.retryStrategies.get(strategy);
    if (!delayCalculator) {
      return Date.now() + this.retryDelay;
    }

    const delay = delayCalculator(attempt);
    return Date.now() + delay;
  }

  async getQueueSize() {
    try {
      return await this.redis.hlen(this.queuePrefix + 'events');
    } catch (error) {
      return 0;
    }
  }

  /**
   * Start processing loop
   */
  startProcessing() {
    setInterval(async () => {
      await this.processRetryQueue();
    }, this.processingInterval);

    // Start cleanup
    setInterval(async () => {
      await this.clearResolvedEvents();
    }, 3600000); // Every hour

    logger.info('Dead letter queue processing started', {
      processingInterval: this.processingInterval,
      maxRetries: this.maxRetries
    });
  }

  /**
   * Stop processing
   */
  stop() {
    logger.info('Dead letter queue processing stopped');
  }
}

// Create singleton instance
const deadLetterQueue = new DeadLetterQueue({
  maxRetries: 3,
  retryDelay: 5000,
  maxQueueSize: 10000,
  ttl: 86400000,
  processingInterval: 30000,
  alertThreshold: 100
});

module.exports = deadLetterQueue;
