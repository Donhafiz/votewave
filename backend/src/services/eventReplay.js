const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class EventReplay extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.eventStorePrefix = options.eventStorePrefix || 'events:';
    this.replayPrefix = options.replayPrefix || 'replay:';
    this.consumerGroupPrefix = options.consumerGroupPrefix || 'consumer:';
    this.maxReplaySpeed = options.maxReplaySpeed || 1000; // events per second
    this.defaultBatchSize = options.defaultBatchSize || 100;
    this.replayTimeout = options.replayTimeout || 300000; // 5 minutes
    
    this.activeReplays = new Map();
    this.consumerGroups = new Map();
    this.replayStats = {
      totalReplays: 0,
      successfulReplays: 0,
      failedReplays: 0,
      eventsReplayed: 0,
      averageReplayTime: 0
    };

    this.startCleanup();
  }

  /**
   * Create a new replay session
   * @param {Object} config - Replay configuration
   * @returns {Promise<string>} - Replay session ID
   */
  async createReplaySession(config) {
    try {
      const replayId = this.generateReplayId();
      const session = {
        id: replayId,
        status: 'created',
        config: {
          ...config,
          startTime: config.startTime || Date.now() - (24 * 60 * 60 * 1000), // Default 24 hours ago
          endTime: config.endTime || Date.now(),
          eventTypes: config.eventTypes || [],
          filters: config.filters || {},
          batchSize: config.batchSize || this.defaultBatchSize,
          speed: Math.min(config.speed || 1, this.maxReplaySpeed),
          dryRun: config.dryRun || false,
          consumerGroup: config.consumerGroup || 'replay_default'
        },
        progress: {
          totalEvents: 0,
          processedEvents: 0,
          failedEvents: 0,
          currentOffset: null,
          startTime: null,
          endTime: null,
          estimatedCompletion: null
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Store replay session
      await this.redis.hset(
        this.replayPrefix + 'sessions',
        replayId,
        JSON.stringify(session)
      );

      // Calculate total events
      session.progress.totalEvents = await this.countReplayEvents(session.config);
      session.progress.estimatedCompletion = this.estimateCompletion(session);

      // Update stored session
      await this.redis.hset(
        this.replayPrefix + 'sessions',
        replayId,
        JSON.stringify(session)
      );

      this.activeReplays.set(replayId, session);

      logger.info('Replay session created', {
        replayId,
        config: session.config,
        totalEvents: session.progress.totalEvents
      });

      this.emit('sessionCreated', session);

      return replayId;

    } catch (error) {
      logger.error('Failed to create replay session', {
        error: error.message,
        config
      });
      throw error;
    }
  }

  /**
   * Start replay session
   * @param {string} replayId - Replay session ID
   * @returns {Promise<boolean>} - True if started successfully
   */
  async startReplay(replayId) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session) {
        throw new Error('Replay session not found');
      }

      if (session.status !== 'created') {
        throw new Error(`Replay session is ${session.status}`);
      }

      // Update session status
      session.status = 'running';
      session.progress.startTime = Date.now();
      session.updatedAt = Date.now();

      await this.saveReplaySession(session);

      // Start replay process
      this.processReplay(replayId);

      logger.info('Replay session started', {
        replayId,
        totalEvents: session.progress.totalEvents
      });

      this.emit('sessionStarted', session);

      return true;

    } catch (error) {
      logger.error('Failed to start replay session', {
        replayId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process replay session
   * @param {string} replayId - Replay session ID
   */
  async processReplay(replayId) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session || session.status !== 'running') {
        return;
      }

      logger.info('Processing replay session', {
        replayId,
        batchSize: session.config.batchSize,
        speed: session.config.speed
      });

      let currentOffset = session.progress.currentOffset;
      let processedInBatch = 0;
      const batchDelay = 1000 / session.config.speed; // Calculate delay for speed control

      while (session.status === 'running') {
        // Get next batch of events
        const events = await this.getReplayEvents(session.config, currentOffset, session.config.batchSize);
        
        if (events.length === 0) {
          // No more events to process
          await this.completeReplay(replayId);
          break;
        }

        // Process events in batch
        for (const event of events) {
          try {
            if (!session.config.dryRun) {
              await this.processReplayEvent(event, session.config);
            }

            session.progress.processedEvents++;
            processedInBatch++;
            currentOffset = event.offset;

          } catch (error) {
            session.progress.failedEvents++;
            
            logger.error('Failed to process replay event', {
              replayId,
              eventId: event.id,
              error: error.message
            });

            this.emit('eventProcessingFailed', {
              replayId,
              event,
              error
            });
          }

          // Update progress periodically
          if (processedInBatch % 10 === 0) {
            session.progress.currentOffset = currentOffset;
            session.progress.estimatedCompletion = this.estimateCompletion(session);
            session.updatedAt = Date.now();
            
            await this.saveReplaySession(session);
          }

          // Speed control
          if (session.config.speed < this.maxReplaySpeed) {
            await this.sleep(batchDelay);
          }
        }

        // Check for timeout
        if (Date.now() - session.progress.startTime > this.replayTimeout) {
          await this.timeoutReplay(replayId);
          break;
        }
      }

    } catch (error) {
      logger.error('Replay processing failed', {
        replayId,
        error: error.message
      });
      
      await this.failReplay(replayId, error);
    }
  }

  /**
   * Get events for replay
   * @param {Object} config - Replay configuration
   * @param {string} offset - Starting offset
   * @param {number} limit - Number of events to retrieve
   * @returns {Promise<Array>} - Array of events
   */
  async getReplayEvents(config, offset = null, limit = 100) {
    try {
      const query = {
        startTime: config.startTime,
        endTime: config.endTime,
        eventTypes: config.eventTypes,
        filters: config.filters,
        limit
      };

      if (offset) {
        query.offset = offset;
      }

      // Query event store
      const events = await this.queryEventStore(query);
      
      return events.map(event => ({
        ...event,
        replayData: {
          replayTimestamp: Date.now(),
          dryRun: config.dryRun
        }
      }));

    } catch (error) {
      logger.error('Failed to get replay events', {
        error: error.message,
        config
      });
      return [];
    }
  }

  /**
   * Query event store for events
   * @param {Object} query - Query parameters
   * @returns {Promise<Array>} - Array of events
   */
  async queryEventStore(query) {
    try {
      // This would integrate with your actual event store (ERIE v8)
      // For now, we'll simulate with Redis
      
      const eventKeys = await this.redis.keys(this.eventStorePrefix + '*');
      const events = [];

      for (const key of eventKeys) {
        try {
          const eventData = await this.redis.get(key);
          if (eventData) {
            const event = JSON.parse(eventData);
            
            // Apply filters
            if (this.matchesQuery(event, query)) {
              events.push(event);
            }
          }
        } catch (error) {
          // Skip malformed events
        }
      }

      // Sort by timestamp
      events.sort((a, b) => a.timestamp - b.timestamp);

      // Apply offset and limit
      const startIndex = query.offset ? events.findIndex(e => e.offset === query.offset) : 0;
      const endIndex = startIndex + query.limit;
      
      return events.slice(startIndex, endIndex);

    } catch (error) {
      logger.error('Failed to query event store', {
        error: error.message,
        query
      });
      return [];
    }
  }

  /**
   * Check if event matches query
   * @param {Object} event - Event object
   * @param {Object} query - Query parameters
   * @returns {boolean} - True if event matches
   */
  matchesQuery(event, query) {
    // Time range filter
    if (query.startTime && event.timestamp < query.startTime) {
      return false;
    }
    if (query.endTime && event.timestamp > query.endTime) {
      return false;
    }

    // Event type filter
    if (query.eventTypes && query.eventTypes.length > 0) {
      if (!query.eventTypes.includes(event.type)) {
        return false;
      }
    }

    // Custom filters
    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        if (event[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Process individual replay event
   * @param {Object} event - Event to process
   * @param {Object} config - Replay configuration
   */
  async processReplayEvent(event, config) {
    try {
      // Get consumer group
      const consumerGroup = this.consumerGroups.get(config.consumerGroup);
      
      if (!consumerGroup) {
        throw new Error(`Consumer group not found: ${config.consumerGroup}`);
      }

      // Process event through consumer group
      await consumerGroup.processEvent(event);

      this.replayStats.eventsReplayed++;

      this.emit('eventProcessed', {
        replayId: config.replayId,
        event
      });

    } catch (error) {
      logger.error('Failed to process replay event', {
        eventId: event.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Count events for replay
   * @param {Object} config - Replay configuration
   * @returns {Promise<number>} - Number of events
   */
  async countReplayEvents(config) {
    try {
      const events = await this.getReplayEvents(config, null, 1000000); // Large limit
      return events.length;
    } catch (error) {
      logger.error('Failed to count replay events', {
        error: error.message,
        config
      });
      return 0;
    }
  }

  /**
   * Estimate completion time
   * @param {Object} session - Replay session
   * @returns {number} - Estimated completion timestamp
   */
  estimateCompletion(session) {
    if (session.progress.processedEvents === 0) {
      return Date.now() + 3600000; // Default 1 hour
    }

    const elapsed = Date.now() - session.progress.startTime;
    const rate = session.progress.processedEvents / elapsed;
    const remaining = session.progress.totalEvents - session.progress.processedEvents;
    const estimatedTime = remaining / rate;

    return Date.now() + estimatedTime;
  }

  /**
   * Complete replay session
   * @param {string} replayId - Replay session ID
   */
  async completeReplay(replayId) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session) {
        return;
      }

      session.status = 'completed';
      session.progress.endTime = Date.now();
      session.updatedAt = Date.now();

      const duration = session.progress.endTime - session.progress.startTime;
      this.replayStats.successfulReplays++;
      this.replayStats.totalReplays++;
      
      // Update average replay time
      this.replayStats.averageReplayTime = 
        (this.replayStats.averageReplayTime * (this.replayStats.successfulReplays - 1) + duration) / 
        this.replayStats.successfulReplays;

      await this.saveReplaySession(session);

      logger.info('Replay session completed', {
        replayId,
        duration,
        processedEvents: session.progress.processedEvents,
        failedEvents: session.progress.failedEvents
      });

      this.emit('sessionCompleted', session);

    } catch (error) {
      logger.error('Failed to complete replay session', {
        replayId,
        error: error.message
      });
    }
  }

  /**
   * Fail replay session
   * @param {string} replayId - Replay session ID
   * @param {Error} error - Error that caused failure
   */
  async failReplay(replayId, error) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session) {
        return;
      }

      session.status = 'failed';
      session.progress.endTime = Date.now();
      session.error = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
      session.updatedAt = Date.now();

      this.replayStats.failedReplays++;
      this.replayStats.totalReplays++;

      await this.saveReplaySession(session);

      logger.error('Replay session failed', {
        replayId,
        error: error.message,
        processedEvents: session.progress.processedEvents
      });

      this.emit('sessionFailed', { session, error });

    } catch (err) {
      logger.error('Failed to fail replay session', {
        replayId,
        error: err.message
      });
    }
  }

  /**
   * Timeout replay session
   * @param {string} replayId - Replay session ID
   */
  async timeoutReplay(replayId) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session) {
        return;
      }

      session.status = 'timeout';
      session.progress.endTime = Date.now();
      session.updatedAt = Date.now();

      await this.saveReplaySession(session);

      logger.warn('Replay session timed out', {
        replayId,
        duration: this.replayTimeout,
        processedEvents: session.progress.processedEvents
      });

      this.emit('sessionTimedOut', session);

    } catch (error) {
      logger.error('Failed to timeout replay session', {
        replayId,
        error: error.message
      });
    }
  }

  /**
   * Pause replay session
   * @param {string} replayId - Replay session ID
   * @returns {Promise<boolean>} - True if paused successfully
   */
  async pauseReplay(replayId) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session || session.status !== 'running') {
        return false;
      }

      session.status = 'paused';
      session.updatedAt = Date.now();

      await this.saveReplaySession(session);

      logger.info('Replay session paused', { replayId });

      this.emit('sessionPaused', session);

      return true;

    } catch (error) {
      logger.error('Failed to pause replay session', {
        replayId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Resume replay session
   * @param {string} replayId - Replay session ID
   * @returns {Promise<boolean>} - True if resumed successfully
   */
  async resumeReplay(replayId) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session || session.status !== 'paused') {
        return false;
      }

      session.status = 'running';
      session.updatedAt = Date.now();

      await this.saveReplaySession(session);

      // Resume processing
      this.processReplay(replayId);

      logger.info('Replay session resumed', { replayId });

      this.emit('sessionResumed', session);

      return true;

    } catch (error) {
      logger.error('Failed to resume replay session', {
        replayId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Cancel replay session
   * @param {string} replayId - Replay session ID
   * @returns {Promise<boolean>} - True if cancelled successfully
   */
  async cancelReplay(replayId) {
    try {
      const session = await this.getReplaySession(replayId);
      
      if (!session || ['completed', 'failed', 'timeout'].includes(session.status)) {
        return false;
      }

      session.status = 'cancelled';
      session.progress.endTime = Date.now();
      session.updatedAt = Date.now();

      await this.saveReplaySession(session);

      logger.info('Replay session cancelled', { replayId });

      this.emit('sessionCancelled', session);

      return true;

    } catch (error) {
      logger.error('Failed to cancel replay session', {
        replayId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get replay session
   * @param {string} replayId - Replay session ID
   * @returns {Promise<Object|null>} - Replay session or null
   */
  async getReplaySession(replayId) {
    try {
      const sessionData = await this.redis.hget(
        this.replayPrefix + 'sessions',
        replayId
      );

      if (!sessionData) {
        return null;
      }

      return JSON.parse(sessionData);

    } catch (error) {
      logger.error('Failed to get replay session', {
        replayId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Save replay session
   * @param {Object} session - Replay session
   */
  async saveReplaySession(session) {
    try {
      await this.redis.hset(
        this.replayPrefix + 'sessions',
        session.id,
        JSON.stringify(session)
      );

      this.activeReplays.set(session.id, session);

    } catch (error) {
      logger.error('Failed to save replay session', {
        replayId: session.id,
        error: error.message
      });
    }
  }

  /**
   * Get all replay sessions
   * @param {Object} filters - Session filters
   * @returns {Promise<Array>} - Array of replay sessions
   */
  async getReplaySessions(filters = {}) {
    try {
      const allSessions = await this.redis.hgetall(this.replayPrefix + 'sessions');
      const sessions = Object.values(allSessions).map(data => JSON.parse(data));

      // Apply filters
      let filteredSessions = sessions;

      if (filters.status) {
        filteredSessions = filteredSessions.filter(s => s.status === filters.status);
      }

      if (filters.consumerGroup) {
        filteredSessions = filteredSessions.filter(s => s.config.consumerGroup === filters.consumerGroup);
      }

      if (filters.dateFrom) {
        filteredSessions = filteredSessions.filter(s => s.createdAt >= filters.dateFrom);
      }

      if (filters.dateTo) {
        filteredSessions = filteredSessions.filter(s => s.createdAt <= filters.dateTo);
      }

      // Sort by creation time (newest first)
      filteredSessions.sort((a, b) => b.createdAt - a.createdAt);

      return filteredSessions;

    } catch (error) {
      logger.error('Failed to get replay sessions', {
        error: error.message,
        filters
      });
      return [];
    }
  }

  /**
   * Add consumer group
   * @param {string} name - Consumer group name
   * @param {Object} processor - Event processor
   */
  addConsumerGroup(name, processor) {
    this.consumerGroups.set(name, {
      name,
      processor,
      createdAt: Date.now()
    });

    logger.info('Consumer group added', { name });
  }

  /**
   * Remove consumer group
   * @param {string} name - Consumer group name
   */
  removeConsumerGroup(name) {
    this.consumerGroups.delete(name);
    logger.info('Consumer group removed', { name });
  }

  /**
   * Get replay statistics
   * @returns {Object} - Replay statistics
   */
  getStats() {
    return {
      ...this.replayStats,
      activeReplays: this.activeReplays.size,
      consumerGroups: this.consumerGroups.size,
      averageProcessingRate: this.replayStats.eventsReplayed > 0 
        ? this.replayStats.eventsReplayed / (this.replayStats.averageReplayTime / 1000)
        : 0
    };
  }

  /**
   * Clean up old replay sessions
   * @param {number} olderThan - Clean sessions older than this timestamp
   * @returns {Promise<number>} - Number of sessions cleaned up
   */
  async cleanup(olderThan = Date.now() - (7 * 24 * 60 * 60 * 1000)) { // 7 days
    let cleanedCount = 0;

    try {
      const sessions = await this.getReplaySessions();
      
      for (const session of sessions) {
        if (session.createdAt < olderThan && 
            ['completed', 'failed', 'timeout', 'cancelled'].includes(session.status)) {
          
          await this.redis.hdel(this.replayPrefix + 'sessions', session.id);
          this.activeReplays.delete(session.id);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Replay sessions cleaned up', {
          cleanedCount,
          olderThan: new Date(olderThan).toISOString()
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup replay sessions', {
        error: error.message
      });
    }

    return cleanedCount;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    setInterval(async () => {
      await this.cleanup();
    }, 3600000); // Every hour
  }

  /**
   * Helper methods
   */
  generateReplayId() {
    return `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const eventReplay = new EventReplay({
  maxReplaySpeed: 1000,
  defaultBatchSize: 100,
  replayTimeout: 300000
});

module.exports = eventReplay;
