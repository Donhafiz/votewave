const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class EventReplayService extends EventEmitter {
  constructor() {
    super();
    this.eventStore = new Map();
    this.consumerOffsets = new Map();
    this.consumerGroups = new Map();
    this.replaySessions = new Map();
    this.eventRetention = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.maxReplayEvents = 10000; // Max events per replay session
    
    this.initializeEventStore();
    this.startCleanup();
  }

  // Initialize event store
  async initializeEventStore() {
    try {
      // Load existing events from Redis
      const eventKeys = await redis.keys('event:*');
      
      for (const key of eventKeys) {
        const events = await redis.lrange(key, 0, -1);
        const parsedEvents = events.map(e => JSON.parse(e));
        const topic = key.replace('event:', '');
        
        this.eventStore.set(topic, parsedEvents);
      }

      // Load consumer offsets
      const offsetKeys = await redis.keys('offset:*');
      
      for (const key of offsetKeys) {
        const offset = await redis.get(key);
        const [consumerGroup, topic] = key.replace('offset:', '').split(':');
        
        if (!this.consumerOffsets.has(consumerGroup)) {
          this.consumerOffsets.set(consumerGroup, new Map());
        }
        
        this.consumerOffsets.get(consumerGroup).set(topic, parseInt(offset));
      }

      logger.info('Event store initialized', {
        topics: Array.from(this.eventStore.keys()),
        consumerGroups: Array.from(this.consumerOffsets.keys())
      });

    } catch (error) {
      logger.error('Failed to initialize event store', {
        error: error.message
      });
    }
  }

  // Store event
  async storeEvent(topic, event) {
    try {
      // Add metadata
      const storedEvent = {
        ...event,
        offset: this.getNextOffset(topic),
        storedAt: new Date().toISOString(),
        checksum: this.calculateChecksum(event)
      };

      // Store in Redis
      const key = `event:${topic}`;
      await redis.lpush(key, JSON.stringify(storedEvent));
      
      // Trim old events based on retention
      await redis.ltrim(key, 0, 10000); // Keep last 10k events
      
      // Update in-memory store
      if (!this.eventStore.has(topic)) {
        this.eventStore.set(topic, []);
      }
      
      const topicEvents = this.eventStore.get(topic);
      topicEvents.push(storedEvent);
      
      // Trim in-memory store
      if (topicEvents.length > 10000) {
        this.eventStore.set(topic, topicEvents.slice(-10000));
      }

      logger.debug('Event stored', {
        topic,
        eventId: event.id,
        offset: storedEvent.offset
      });

      this.emit('eventStored', { topic, event: storedEvent });

      return storedEvent;

    } catch (error) {
      logger.error('Failed to store event', {
        topic,
        eventId: event.id,
        error: error.message
      });
      throw error;
    }
  }

  // Get next offset
  getNextOffset(topic) {
    const topicEvents = this.eventStore.get(topic) || [];
    return topicEvents.length > 0 ? topicEvents[topicEvents.length - 1].offset + 1 : 0;
  }

  // Calculate event checksum
  calculateChecksum(event) {
    const crypto = require('crypto');
    const eventStr = JSON.stringify(event);
    return crypto.createHash('sha256').update(eventStr).digest('hex');
  }

  // Create consumer group
  async createConsumerGroup(consumerGroup, topics = []) {
    try {
      if (!this.consumerGroups.has(consumerGroup)) {
        this.consumerGroups.set(consumerGroup, {
          topics: new Set(topics),
          created: new Date().toISOString(),
          consumers: new Map()
        });
      }

      // Initialize offsets for topics
      if (!this.consumerOffsets.has(consumerGroup)) {
        this.consumerOffsets.set(consumerGroup, new Map());
      }

      const offsets = this.consumerOffsets.get(consumerGroup);
      
      for (const topic of topics) {
        if (!offsets.has(topic)) {
          offsets.set(topic, 0);
          await redis.set(`offset:${consumerGroup}:${topic}`, '0');
        }
      }

      logger.info('Consumer group created', {
        consumerGroup,
        topics
      });

      return {
        success: true,
        consumerGroup,
        topics
      };

    } catch (error) {
      logger.error('Failed to create consumer group', {
        consumerGroup,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Start replay session
  async startReplaySession(options) {
    const sessionId = this.generateSessionId();
    
    try {
      const session = {
        id: sessionId,
        status: 'active',
        startTime: new Date().toISOString(),
        endTime: null,
        config: {
          topics: options.topics || [],
          startTime: options.startTime || null,
          endTime: options.endTime || null,
          consumerGroup: options.consumerGroup || 'replay',
          filters: options.filters || {},
          batchSize: options.batchSize || 100,
          speed: options.speed || 1.0 // 1.0 = normal speed
        },
        progress: {
          totalEvents: 0,
          processedEvents: 0,
          currentTopic: null,
          currentOffset: 0,
          errors: []
        }
      };

      // Calculate total events to replay
      for (const topic of session.config.topics) {
        const events = this.getEventsForReplay(topic, session.config);
        session.progress.totalEvents += events.length;
      }

      this.replaySessions.set(sessionId, session);

      logger.info('Replay session started', {
        sessionId,
        topics: session.config.topics,
        totalEvents: session.progress.totalEvents
      });

      this.emit('replaySessionStarted', session);

      // Start replay processing
      this.processReplaySession(sessionId);

      return {
        success: true,
        sessionId,
        session
      };

    } catch (error) {
      logger.error('Failed to start replay session', {
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get events for replay
  getEventsForReplay(topic, config) {
    const events = this.eventStore.get(topic) || [];
    let filteredEvents = [...events];

    // Apply time range filter
    if (config.startTime) {
      const startTime = new Date(config.startTime);
      filteredEvents = filteredEvents.filter(event => 
        new Date(event.timestamp) >= startTime
      );
    }

    if (config.endTime) {
      const endTime = new Date(config.endTime);
      filteredEvents = filteredEvents.filter(event => 
        new Date(event.timestamp) <= endTime
      );
    }

    // Apply custom filters
    if (config.filters && Object.keys(config.filters).length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        this.matchesFilters(event, config.filters)
      );
    }

    return filteredEvents;
  }

  // Check if event matches filters
  matchesFilters(event, filters) {
    for (const [field, value] of Object.entries(filters)) {
      const eventValue = this.getNestedValue(event, field);
      
      if (typeof value === 'string') {
        if (eventValue !== value) return false;
      } else if (typeof value === 'object') {
        if (value.$in && !value.$in.includes(eventValue)) return false;
        if (value.$gt && !(eventValue > value.$gt)) return false;
        if (value.$lt && !(eventValue < value.$lt)) return false;
        if (value.$regex && !new RegExp(value.$regex).test(eventValue)) return false;
      }
    }
    
    return true;
  }

  // Get nested value
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }

  // Process replay session
  async processReplaySession(sessionId) {
    const session = this.replaySessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return;
    }

    try {
      for (const topic of session.config.topics) {
        session.progress.currentTopic = topic;
        const events = this.getEventsForReplay(topic, session.config);
        
        for (let i = 0; i < events.length; i += session.config.batchSize) {
          const batch = events.slice(i, i + session.config.batchSize);
          
          // Process batch
          for (const event of batch) {
            try {
              // Emit event for replay
              this.emit('replayEvent', {
                sessionId,
                topic,
                event,
                replayTimestamp: new Date().toISOString()
              });

              session.progress.processedEvents++;
              session.progress.currentOffset = event.offset;

              // Apply speed control
              if (session.config.speed < 1.0) {
                await new Promise(resolve => 
                  setTimeout(resolve, (1.0 - session.config.speed) * 100)
                );
              }

            } catch (error) {
              session.progress.errors.push({
                eventId: event.id,
                error: error.message,
                timestamp: new Date().toISOString()
              });

              logger.error('Replay event error', {
                sessionId,
                eventId: event.id,
                error: error.message
              });
            }
          }

          // Update session progress
          this.replaySessions.set(sessionId, session);

          // Emit progress update
          this.emit('replayProgress', {
            sessionId,
            progress: session.progress,
            percentage: (session.progress.processedEvents / session.progress.totalEvents) * 100
          });
        }
      }

      // Complete session
      session.status = 'completed';
      session.endTime = new Date().toISOString();
      this.replaySessions.set(sessionId, session);

      logger.info('Replay session completed', {
        sessionId,
        processedEvents: session.progress.processedEvents,
        errors: session.progress.errors.length
      });

      this.emit('replaySessionCompleted', session);

    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      session.error = error.message;
      this.replaySessions.set(sessionId, session);

      logger.error('Replay session failed', {
        sessionId,
        error: error.message
      });

      this.emit('replaySessionFailed', session);
    }
  }

  // Stop replay session
  async stopReplaySession(sessionId) {
    const session = this.replaySessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      };
    }

    if (session.status === 'completed' || session.status === 'failed') {
      return {
        success: false,
        error: 'Session already completed or failed'
      };
    }

    session.status = 'stopped';
    session.endTime = new Date().toISOString();
    this.replaySessions.set(sessionId, session);

    logger.info('Replay session stopped', {
      sessionId,
      processedEvents: session.progress.processedEvents
    });

    this.emit('replaySessionStopped', session);

    return {
      success: true,
      sessionId,
      session
    };
  }

  // Get replay session status
  getReplaySessionStatus(sessionId) {
    const session = this.replaySessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      };
    }

    return {
      success: true,
      session: {
        ...session,
        progress: {
          ...session.progress,
          percentage: session.progress.totalEvents > 0 
            ? (session.progress.processedEvents / session.progress.totalEvents) * 100 
            : 0
        }
      }
    };
  }

  // Get consumer offset
  async getConsumerOffset(consumerGroup, topic) {
    if (this.consumerOffsets.has(consumerGroup)) {
      return this.consumerOffsets.get(consumerGroup).get(topic) || 0;
    }
    return 0;
  }

  // Update consumer offset
  async updateConsumerOffset(consumerGroup, topic, offset) {
    if (!this.consumerOffsets.has(consumerGroup)) {
      this.consumerOffsets.set(consumerGroup, new Map());
    }

    this.consumerOffsets.get(consumerGroup).set(topic, offset);
    
    // Persist to Redis
    await redis.set(`offset:${consumerGroup}:${topic}`, offset.toString());

    logger.debug('Consumer offset updated', {
      consumerGroup,
      topic,
      offset
    });
  }

  // Get events from offset
  async getEventsFromOffset(topic, offset, limit = 100) {
    const events = this.eventStore.get(topic) || [];
    const startIndex = events.findIndex(event => event.offset >= offset);
    
    if (startIndex === -1) {
      return [];
    }

    return events.slice(startIndex, startIndex + limit);
  }

  // Start cleanup process
  startCleanup() {
    setInterval(async () => {
      await this.cleanupOldEvents();
    }, 60 * 60 * 1000); // Clean every hour
  }

  // Clean up old events
  async cleanupOldEvents() {
    try {
      const cutoffTime = Date.now() - this.eventRetention;
      let cleanedCount = 0;

      for (const [topic, events] of this.eventStore) {
        const validEvents = events.filter(event => 
          new Date(event.storedAt).getTime() > cutoffTime
        );

        const removedCount = events.length - validEvents.length;
        if (removedCount > 0) {
          this.eventStore.set(topic, validEvents);
          cleanedCount += removedCount;

          // Update Redis
          const key = `event:${topic}`;
          await redis.del(key);
          
          for (const event of validEvents) {
            await redis.lpush(key, JSON.stringify(event));
          }
        }
      }

      // Clean up old replay sessions
      const sessionCutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
      for (const [sessionId, session] of this.replaySessions) {
        if (new Date(session.startTime).getTime() < sessionCutoff) {
          this.replaySessions.delete(sessionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Event cleanup completed', {
          cleanedEvents: cleanedCount,
          cutoffTime: new Date(cutoffTime).toISOString()
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup old events', {
        error: error.message
      });
    }
  }

  // Generate session ID
  generateSessionId() {
    return `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get replay statistics
  getReplayStatistics() {
    const activeSessions = Array.from(this.replaySessions.values())
      .filter(session => session.status === 'active');

    const completedSessions = Array.from(this.replaySessions.values())
      .filter(session => session.status === 'completed');

    const failedSessions = Array.from(this.replaySessions.values())
      .filter(session => session.status === 'failed');

    return {
      timestamp: new Date().toISOString(),
      eventStore: {
        topics: Array.from(this.eventStore.keys()),
        totalEvents: Array.from(this.eventStore.values())
          .reduce((sum, events) => sum + events.length, 0)
      },
      consumerGroups: {
        count: this.consumerGroups.size,
        groups: Array.from(this.consumerGroups.keys())
      },
      replaySessions: {
        total: this.replaySessions.size,
        active: activeSessions.length,
        completed: completedSessions.length,
        failed: failedSessions.length
      },
      retention: {
        eventRetention: this.eventRetention,
        maxReplayEvents: this.maxReplayEvents
      }
    };
  }

  // Export event data
  async exportEvents(topic, options = {}) {
    try {
      const events = this.eventStore.get(topic) || [];
      let filteredEvents = [...events];

      // Apply filters
      if (options.startTime) {
        const startTime = new Date(options.startTime);
        filteredEvents = filteredEvents.filter(event => 
          new Date(event.timestamp) >= startTime
        );
      }

      if (options.endTime) {
        const endTime = new Date(options.endTime);
        filteredEvents = filteredEvents.filter(event => 
          new Date(event.timestamp) <= endTime
        );
      }

      if (options.limit) {
        filteredEvents = filteredEvents.slice(0, options.limit);
      }

      return {
        success: true,
        topic,
        events: filteredEvents,
        count: filteredEvents.length,
        exportedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to export events', {
        topic,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const eventReplayService = new EventReplayService();

module.exports = eventReplayService;
