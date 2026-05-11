const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class DeadLetterQueue extends EventEmitter {
  constructor() {
    super();
    this.queues = new Map();
    this.retryAttempts = new Map();
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.dlqPrefix = 'dlq:';
    this.retryPrefix = 'retry:';
    
    this.initializeQueues();
    this.startRetryProcessor();
  }

  // Initialize dead letter queues
  initializeQueues() {
    const queueTypes = [
      'vote:cast.failed',
      'fraud:failed',
      'ml:failed',
      'analytics:failed',
      'auth:failed',
      'notification:failed',
      'backup:failed',
      'system:failed'
    ];

    for (const queueType of queueTypes) {
      this.queues.set(queueType, {
        name: queueType,
        size: 0,
        lastProcessed: null,
        processing: false
      });
    }

    logger.info('Dead letter queues initialized', {
      queueTypes: Array.from(this.queues.keys())
    });
  }

  // Add failed event to DLQ
  async addToDLQ(event, error, queueType) {
    try {
      const dlqEvent = {
        id: event.id || this.generateEventId(),
        originalEvent: event,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code || 'UNKNOWN_ERROR'
        },
        queueType,
        timestamp: new Date().toISOString(),
        retryCount: this.retryAttempts.get(event.id) || 0,
        metadata: {
          source: event.source || 'unknown',
          tenantId: event.tenantId || 'unknown',
          severity: this.determineSeverity(error, queueType)
        }
      };

      // Add to Redis DLQ
      const dlqKey = `${this.dlqPrefix}${queueType}`;
      await redis.lpush(dlqKey, JSON.stringify(dlqEvent));
      
      // Update queue statistics
      const queue = this.queues.get(queueType);
      if (queue) {
        queue.size++;
        queue.lastProcessed = new Date().toISOString();
      }

      // Track retry attempts
      this.retryAttempts.set(event.id, dlqEvent.retryCount + 1);

      logger.warn('Event added to dead letter queue', {
        eventId: event.id,
        queueType,
        error: error.message,
        retryCount: dlqEvent.retryCount,
        severity: dlqEvent.metadata.severity
      });

      // Emit event for monitoring
      this.emit('dlqEventAdded', {
        queueType,
        event: dlqEvent,
        severity: dlqEvent.metadata.severity
      });

      return {
        success: true,
        eventId: dlqEvent.id,
        queueType,
        retryCount: dlqEvent.retryCount
      };

    } catch (error) {
      logger.error('Failed to add event to DLQ', {
        eventId: event.id,
        queueType,
        error: error.message
      });

      throw error;
    }
  }

  // Determine error severity
  determineSeverity(error, queueType) {
    // Critical errors that should be handled immediately
    const criticalErrors = [
      'DATABASE_CONNECTION_FAILED',
      'AUTHENTICATION_FAILED',
      'SECURITY_VIOLATION',
      'DATA_CORRUPTION',
      'SYSTEM_OVERLOAD'
    ];

    // High-priority queues
    const criticalQueues = [
      'vote:cast.failed',
      'auth:failed',
      'system:failed'
    ];

    if (criticalErrors.includes(error.code) || criticalQueues.includes(queueType)) {
      return 'critical';
    }

    // Warning-level errors
    const warningErrors = [
      'TIMEOUT',
      'RATE_LIMIT_EXCEEDED',
      'TEMPORARY_UNAVAILABLE'
    ];

    if (warningErrors.includes(error.code)) {
      return 'warning';
    }

    return 'error';
  }

  // Get events from DLQ
  async getFromDLQ(queueType, limit = 10) {
    try {
      const dlqKey = `${this.dlqPrefix}${queueType}`;
      const events = await redis.lrange(dlqKey, 0, limit - 1);
      
      const parsedEvents = events.map(eventStr => {
        try {
          return JSON.parse(eventStr);
        } catch (error) {
          logger.error('Failed to parse DLQ event', {
            queueType,
            error: error.message
          });
          return null;
        }
      }).filter(event => event !== null);

      return {
        success: true,
        queueType,
        events: parsedEvents,
        count: parsedEvents.length
      };

    } catch (error) {
      logger.error('Failed to get events from DLQ', {
        queueType,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        queueType
      };
    }
  }

  // Retry failed event
  async retryEvent(queueType, eventId) {
    try {
      // Get the event from DLQ
      const dlqKey = `${this.dlqPrefix}${queueType}`;
      const events = await redis.lrange(dlqKey, 0, -1);
      
      let targetEvent = null;
      let targetIndex = -1;

      for (let i = 0; i < events.length; i++) {
        const event = JSON.parse(events[i]);
        if (event.id === eventId) {
          targetEvent = event;
          targetIndex = i;
          break;
        }
      }

      if (!targetEvent) {
        throw new Error(`Event ${eventId} not found in DLQ ${queueType}`);
      }

      // Check if max retries exceeded
      if (targetEvent.retryCount >= this.maxRetries) {
        logger.warn('Max retries exceeded for event', {
          eventId,
          queueType,
          retryCount: targetEvent.retryCount,
          maxRetries: this.maxRetries
        });

        return {
          success: false,
          reason: 'MAX_RETRIES_EXCEEDED',
          eventId,
          queueType
        };
      }

      // Add to retry queue
      const retryKey = `${this.retryPrefix}${queueType}`;
      const retryEvent = {
        ...targetEvent,
        retryAt: new Date(Date.now() + this.retryDelay).toISOString(),
        retryCount: targetEvent.retryCount + 1
      };

      await redis.lpush(retryKey, JSON.stringify(retryEvent));

      // Remove from DLQ
      await redis.lrem(dlqKey, 1, events[targetIndex]);

      // Update retry attempts
      this.retryAttempts.set(eventId, retryEvent.retryCount);

      logger.info('Event queued for retry', {
        eventId,
        queueType,
        retryCount: retryEvent.retryCount,
        retryAt: retryEvent.retryAt
      });

      this.emit('eventRetryQueued', {
        queueType,
        event: retryEvent
      });

      return {
        success: true,
        eventId,
        queueType,
        retryCount: retryEvent.retryCount,
        retryAt: retryEvent.retryAt
      };

    } catch (error) {
      logger.error('Failed to retry event', {
        eventId,
        queueType,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        eventId,
        queueType
      };
    }
  }

  // Process retry queue
  async processRetryQueue() {
    try {
      for (const queueType of this.queues.keys()) {
        const retryKey = `${this.retryPrefix}${queueType}`;
        const events = await redis.lrange(retryKey, 0, -1);

        for (const eventStr of events) {
          try {
            const retryEvent = JSON.parse(eventStr);
            
            // Check if it's time to retry
            if (new Date(retryEvent.retryAt) <= new Date()) {
              await this.executeRetry(retryEvent);
              
              // Remove from retry queue
              await redis.lrem(retryKey, 1, eventStr);
            }
          } catch (error) {
            logger.error('Failed to process retry event', {
              queueType,
              error: error.message
            });
          }
        }
      }

    } catch (error) {
      logger.error('Failed to process retry queue', {
        error: error.message
      });
    }
  }

  // Execute retry
  async executeRetry(retryEvent) {
    try {
      logger.info('Executing retry for event', {
        eventId: retryEvent.id,
        queueType: retryEvent.queueType,
        retryCount: retryEvent.retryCount
      });

      // This would integrate with your event processing system
      // For now, we'll just emit the event
      this.emit('eventRetry', retryEvent);

      return {
        success: true,
        eventId: retryEvent.id,
        queueType: retryEvent.queueType
      };

    } catch (error) {
      logger.error('Retry execution failed', {
        eventId: retryEvent.id,
        queueType: retryEvent.queueType,
        error: error.message
      });

      // Add back to DLQ with increased retry count
      await this.addToDLQ(retryEvent.originalEvent, error, retryEvent.queueType);

      return {
        success: false,
        error: error.message,
        eventId: retryEvent.id,
        queueType: retryEvent.queueType
      };
    }
  }

  // Start retry processor
  startRetryProcessor() {
    setInterval(async () => {
      await this.processRetryQueue();
    }, 10000); // Check every 10 seconds

    logger.info('Retry processor started', {
      interval: '10 seconds'
    });
  }

  // Get DLQ statistics
  async getDLQStats() {
    try {
      const stats = {
        queues: {},
        totalEvents: 0,
        criticalEvents: 0,
        warningEvents: 0,
        errorEvents: 0
      };

      for (const queueType of this.queues.keys()) {
        const dlqKey = `${this.dlqPrefix}${queueType}`;
        const retryKey = `${this.retryPrefix}${queueType}`;
        
        const dlqSize = await redis.llen(dlqKey);
        const retrySize = await redis.llen(retryKey);

        // Get sample events for severity analysis
        const sampleEvents = await redis.lrange(dlqKey, 0, 9);
        let criticalCount = 0;
        let warningCount = 0;
        let errorCount = 0;

        for (const eventStr of sampleEvents) {
          try {
            const event = JSON.parse(eventStr);
            switch (event.metadata.severity) {
              case 'critical':
                criticalCount++;
                break;
              case 'warning':
                warningCount++;
                break;
              case 'error':
                errorCount++;
                break;
            }
          } catch (error) {
            // Skip malformed events
          }
        }

        stats.queues[queueType] = {
          dlqSize,
          retrySize,
          criticalCount,
          warningCount,
          errorCount,
          lastUpdated: new Date().toISOString()
        };

        stats.totalEvents += dlqSize;
        stats.criticalEvents += criticalCount;
        stats.warningEvents += warningCount;
        stats.errorEvents += errorCount;
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        ...stats
      };

    } catch (error) {
      logger.error('Failed to get DLQ statistics', {
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Clear DLQ
  async clearDLQ(queueType) {
    try {
      const dlqKey = `${this.dlqPrefix}${queueType}`;
      const retryKey = `${this.retryPrefix}${queueType}`;
      
      await redis.del(dlqKey);
      await redis.del(retryKey);

      // Reset queue statistics
      const queue = this.queues.get(queueType);
      if (queue) {
        queue.size = 0;
        queue.lastProcessed = new Date().toISOString();
      }

      logger.info('DLQ cleared', {
        queueType
      });

      return {
        success: true,
        queueType
      };

    } catch (error) {
      logger.error('Failed to clear DLQ', {
        queueType,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        queueType
      };
    }
  }

  // Archive old events
  async archiveDLQEvents(queueType, olderThanHours = 24) {
    try {
      const dlqKey = `${this.dlqPrefix}${queueType}`;
      const events = await redis.lrange(dlqKey, 0, -1);
      
      const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
      const eventsToArchive = [];
      const eventsToKeep = [];

      for (const eventStr of events) {
        try {
          const event = JSON.parse(eventStr);
          if (new Date(event.timestamp) < cutoffTime) {
            eventsToArchive.push(eventStr);
          } else {
            eventsToKeep.push(eventStr);
          }
        } catch (error) {
          // Archive malformed events
          eventsToArchive.push(eventStr);
        }
      }

      if (eventsToArchive.length > 0) {
        // Remove old events and re-add remaining
        await redis.del(dlqKey);
        if (eventsToKeep.length > 0) {
          await redis.lpush(dlqKey, ...eventsToKeep);
        }

        // This would save to archive storage
        logger.info('DLQ events archived', {
          queueType,
          archivedCount: eventsToArchive.length,
          remainingCount: eventsToKeep.length,
          cutoffTime: cutoffTime.toISOString()
        });

        this.emit('eventsArchived', {
          queueType,
          archivedCount: eventsToArchive.length,
          events: eventsToArchive.map(e => JSON.parse(e))
        });
      }

      return {
        success: true,
        queueType,
        archivedCount: eventsToArchive.length,
        remainingCount: eventsToKeep.length
      };

    } catch (error) {
      logger.error('Failed to archive DLQ events', {
        queueType,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        queueType
      };
    }
  }

  // Generate event ID
  generateEventId() {
    return `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get queue configuration
  getQueueConfig() {
    return {
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      dlqPrefix: this.dlqPrefix,
      retryPrefix: this.retryPrefix,
      queueTypes: Array.from(this.queues.keys())
    };
  }

  // Update configuration
  updateConfig(config) {
    if (config.maxRetries !== undefined) {
      this.maxRetries = config.maxRetries;
    }
    
    if (config.retryDelay !== undefined) {
      this.retryDelay = config.retryDelay;
    }

    logger.info('DLQ configuration updated', {
      config: this.getQueueConfig()
    });
  }
}

// Create singleton instance
const deadLetterQueue = new DeadLetterQueue();

module.exports = deadLetterQueue;
