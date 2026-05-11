const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');
const crypto = require('crypto');

class EventStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      eventPrefix: options.eventPrefix || 'events:',
      snapshotPrefix: options.snapshotPrefix || 'snapshots:',
      streamPrefix: options.streamPrefix || 'stream:',
      snapshotInterval: options.snapshotInterval || 1000, // Every 1000 events
      maxStreamLength: options.maxStreamLength || 100000,
      compressionThreshold: options.compressionThreshold || 1024,
      enableSnapshots: options.enableSnapshots !== false,
      enableCompression: options.enableCompression !== false,
      ...options
    };

    this.aggregates = new Map();
    this.snapshots = new Map();
    this.eventHandlers = new Map();
    this.streams = new Map();
    
    this.initializeStreams();
    this.startCleanup();
  }

  /**
   * Initialize event streams
   */
  initializeStreams() {
    // Register aggregate streams
    this.registerAggregate('election', {
      fields: ['id', 'title', 'description', 'type', 'status', 'startDate', 'endDate', 'settings'],
      snapshotFields: ['id', 'title', 'description', 'type', 'status', 'startDate', 'endDate', 'settings', 'totalVotes', 'candidatesCount', 'createdAt', 'updatedAt']
    });

    this.registerAggregate('user', {
      fields: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'createdAt', 'updatedAt'],
      snapshotFields: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'electionsParticipated', 'createdAt', 'updatedAt']
    });

    this.registerAggregate('vote', {
      fields: ['id', 'electionId', 'userId', 'candidateId', 'timestamp', 'status'],
      snapshotFields: ['id', 'electionId', 'userId', 'candidateId', 'timestamp', 'status', 'fraudScore', 'validatedAt']
    });

    this.registerAggregate('candidate', {
      fields: ['id', 'electionId', 'name', 'party', 'description', 'status'],
      snapshotFields: ['id', 'electionId', 'name', 'party', 'description', 'status', 'votes', 'percentage', 'rank', 'createdAt', 'updatedAt']
    });

    logger.info('Event store initialized', {
      aggregateCount: this.aggregates.size,
      snapshotInterval: this.options.snapshotInterval,
      maxStreamLength: this.options.maxStreamLength
    });
  }

  /**
   * Register aggregate type
   */
  registerAggregate(aggregateType, definition) {
    this.aggregates.set(aggregateType, {
      type: aggregateType,
      fields: definition.fields,
      snapshotFields: definition.snapshotFields,
      createdAt: Date.now()
    });

    logger.debug('Aggregate registered', { aggregateType });
  }

  /**
   * Save event to event store
   */
  async saveEvent(aggregateType, aggregateId, eventType, eventData, options = {}) {
    try {
      const event = {
        id: this.generateEventId(),
        aggregateType,
        aggregateId,
        eventType,
        data: eventData,
        timestamp: Date.now(),
        version: options.version || 1,
        causationId: options.causationId,
        correlationId: options.correlationId,
        userId: options.userId,
        metadata: options.metadata || {}
      };

      // Validate event
      this.validateEvent(event);

      // Store in stream
      const streamKey = `${this.options.streamPrefix}${aggregateType}:${aggregateId}`;
      
      const pipeline = this.redis.pipeline();
      
      // Add to stream
      pipeline.xadd(
        streamKey,
        'MAXLEN',
        this.options.maxStreamLength,
        '*',
        'id', event.id,
        'type', event.eventType,
        'data', JSON.stringify(event.data),
        'timestamp', event.timestamp.toString(),
        'version', event.version.toString(),
        'causationId', event.causationId || '',
        'correlationId', event.correlationId || '',
        'userId', event.userId || '',
        'metadata', JSON.stringify(event.metadata)
      );

      // Add to global event index
      pipeline.xadd(
        `${this.options.streamPrefix}global`,
        'MAXLEN',
        this.options.maxStreamLength,
        '*',
        'eventId', event.id,
        'aggregateType', event.aggregateType,
        'aggregateId', event.aggregateId,
        'eventType', event.eventType,
        'timestamp', event.timestamp.toString()
      );

      // Execute pipeline
      const results = await pipeline.exec();

      // Check if snapshot should be created
      if (this.options.enableSnapshots && this.shouldCreateSnapshot(streamKey)) {
        await this.createSnapshot(aggregateType, aggregateId);
      }

      // Emit event
      this.emit('eventSaved', event);

      logger.debug('Event saved', {
        eventId: event.id,
        aggregateType,
        aggregateId,
        eventType
      });

      return event;

    } catch (error) {
      logger.error('Failed to save event', {
        aggregateType,
        aggregateId,
        eventType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Load events for aggregate
   */
  async loadEvents(aggregateType, aggregateId, fromVersion = 0, toVersion = null) {
    try {
      const streamKey = `${this.options.streamPrefix}${aggregateType}:${aggregateId}`;
      
      // Check if we have a recent snapshot
      let snapshot = null;
      let fromSnapshotVersion = 0;

      if (this.options.enableSnapshots && fromVersion === 0) {
        snapshot = await this.getLatestSnapshot(aggregateType, aggregateId);
        if (snapshot) {
          fromSnapshotVersion = snapshot.version;
        }
      }

      // Load events from stream
      const events = [];
      
      if (toVersion === null) {
        // Load all events from snapshot version
        const streamEvents = await this.redis.xrange(
          streamKey,
          fromSnapshotVersion,
          '+',
          'COUNT',
          1000
        );

        for (const [id, fields] of streamEvents) {
          events.push(this.parseStreamEvent(id, fields));
        }
      } else {
        // Load events up to specific version
        const streamEvents = await this.redis.xrange(
          streamKey,
          fromSnapshotVersion,
          toVersion,
          'COUNT',
          toVersion - fromSnapshotVersion
        );

        for (const [id, fields] of streamEvents) {
          events.push(this.parseStreamEvent(id, fields));
        }
      }

      // Prepend snapshot if available
      if (snapshot) {
        return [snapshot, ...events];
      }

      return events;

    } catch (error) {
      logger.error('Failed to load events', {
        aggregateType,
        aggregateId,
        fromVersion,
        toVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get aggregate state by replaying events
   */
  async getAggregateState(aggregateType, aggregateId, toVersion = null) {
    try {
      const events = await this.loadEvents(aggregateType, aggregateId, 0, toVersion);
      
      if (events.length === 0) {
        return null;
      }

      // Start with snapshot if available
      let state = null;
      let startIndex = 0;

      if (events[0] && events[0].snapshot) {
        state = events[0].data;
        startIndex = 1;
      } else {
        // Initialize empty state
        state = this.initializeAggregateState(aggregateType);
      }

      // Replay events
      for (let i = startIndex; i < events.length; i++) {
        state = this.applyEvent(state, events[i]);
      }

      return state;

    } catch (error) {
      logger.error('Failed to get aggregate state', {
        aggregateType,
        aggregateId,
        toVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create snapshot of aggregate state
   */
  async createSnapshot(aggregateType, aggregateId) {
    try {
      const aggregateDef = this.aggregates.get(aggregateType);
      if (!aggregateDef) {
        throw new Error(`Unknown aggregate type: ${aggregateType}`);
      }

      const state = await this.getAggregateState(aggregateType, aggregateId);
      if (!state) {
        throw new Error(`No state found for aggregate: ${aggregateType}:${aggregateId}`);
      }

      // Extract only snapshot fields
      const snapshotData = {};
      for (const field of aggregateDef.snapshotFields) {
        if (state.hasOwnProperty(field)) {
          snapshotData[field] = state[field];
        }
      }

      const snapshot = {
        aggregateType,
        aggregateId,
        version: state.version || 0,
        data: snapshotData,
        timestamp: Date.now(),
        eventType: 'SNAPSHOT'
      };

      const snapshotKey = `${this.options.snapshotPrefix}${aggregateType}:${aggregateId}`;
      
      await this.redis.setex(
        snapshotKey,
        86400, // 24 hours TTL
        JSON.stringify(snapshot)
      );

      // Store in memory
      this.snapshots.set(snapshotKey, snapshot);

      logger.debug('Snapshot created', {
        aggregateType,
        aggregateId,
        version: snapshot.version
      });

      this.emit('snapshotCreated', snapshot);

      return snapshot;

    } catch (error) {
      logger.error('Failed to create snapshot', {
        aggregateType,
        aggregateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get latest snapshot
   */
  async getLatestSnapshot(aggregateType, aggregateId) {
    try {
      const snapshotKey = `${this.options.snapshotPrefix}${aggregateType}:${aggregateId}`;
      
      // Check memory cache first
      if (this.snapshots.has(snapshotKey)) {
        return this.snapshots.get(snapshotKey);
      }

      // Check Redis
      const snapshotData = await this.redis.get(snapshotKey);
      if (snapshotData) {
        const snapshot = JSON.parse(snapshotData);
        this.snapshots.set(snapshotKey, snapshot);
        return snapshot;
      }

      return null;

    } catch (error) {
      logger.error('Failed to get latest snapshot', {
        aggregateType,
        aggregateId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Query events by criteria
   */
  async queryEvents(criteria = {}) {
    try {
      const {
        aggregateType,
        aggregateId,
        eventType,
        fromTimestamp,
        toTimestamp,
        limit = 100
      } = criteria;

      let streamKey = `${this.options.streamPrefix}global`;
      
      if (aggregateType && aggregateId) {
        streamKey = `${this.options.streamPrefix}${aggregateType}:${aggregateId}`;
      }

      const events = [];
      
      // Query stream
      let startId = fromTimestamp ? fromTimestamp.toString() : '-';
      let endId = toTimestamp ? toTimestamp.toString() : '+';

      if (aggregateType && aggregateId) {
        // Query specific aggregate stream
        const streamEvents = await this.redis.xrange(
          streamKey,
          startId,
          endId,
          'COUNT',
          limit
        );

        for (const [id, fields] of streamEvents) {
          const event = this.parseStreamEvent(id, fields);
          
          // Apply filters
          if (eventType && event.eventType !== eventType) continue;
          if (fromTimestamp && event.timestamp < fromTimestamp) continue;
          if (toTimestamp && event.timestamp > toTimestamp) continue;
          
          events.push(event);
        }
      } else {
        // Query global stream and filter
        const streamEvents = await this.redis.xrange(
          streamKey,
          startId,
          endId,
          'COUNT',
          limit
        );

        for (const [id, fields] of streamEvents) {
          if (aggregateType && fields.aggregateType !== aggregateType) continue;
          if (eventType && fields.eventType !== eventType) continue;
          
          // Load full event
          const fullEvent = await this.loadEventById(fields.eventId);
          if (fullEvent) {
            events.push(fullEvent);
          }
        }
      }

      return events;

    } catch (error) {
      logger.error('Failed to query events', {
        criteria,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Load event by ID
   */
  async loadEventById(eventId) {
    try {
      // Search all streams for the event
      for (const [aggregateType] of this.aggregates.keys()) {
        const pattern = `${this.options.streamPrefix}${aggregateType}:*`;
        const keys = await this.redis.keys(pattern);
        
        for (const key of keys) {
          try {
            const events = await this.redis.xrange(key, '-', '+', 'COUNT', 1000);
            
            for (const [id, fields] of events) {
              if (fields.id === eventId) {
                return this.parseStreamEvent(id, fields);
              }
            }
          } catch (error) {
            // Skip problematic streams
          }
        }
      }

      return null;

    } catch (error) {
      logger.error('Failed to load event by ID', {
        eventId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Replay events for aggregate
   */
  async replayEvents(aggregateType, aggregateId, fromVersion = 0, toVersion = null) {
    try {
      const events = await this.loadEvents(aggregateType, aggregateId, fromVersion, toVersion);
      
      let state = null;
      let startIndex = 0;

      // Start with snapshot if available
      if (events.length > 0 && events[0].snapshot) {
        state = events[0].data;
        startIndex = 1;
      } else {
        state = this.initializeAggregateState(aggregateType);
      }

      // Replay events
      const replayedEvents = [];
      
      for (let i = startIndex; i < events.length; i++) {
        const event = events[i];
        const previousState = { ...state };
        
        state = this.applyEvent(state, event);
        
        replayedEvents.push({
          event,
          previousState,
          newState: state
        });
      }

      logger.info('Events replayed', {
        aggregateType,
        aggregateId,
        eventCount: replayedEvents.length
      });

      this.emit('eventsReplayed', {
        aggregateType,
        aggregateId,
        replayedEvents
      });

      return {
        finalState: state,
        replayedEvents,
        eventCount: replayedEvents.length
      };

    } catch (error) {
      logger.error('Failed to replay events', {
        aggregateType,
        aggregateId,
        fromVersion,
        toVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get stream information
   */
  async getStreamInfo(aggregateType, aggregateId) {
    try {
      const streamKey = `${this.options.streamPrefix}${aggregateType}:${aggregateId}`;
      
      const info = await this.redis.xinfo_stream(streamKey);
      
      return {
        aggregateType,
        aggregateId,
        length: info.length,
        firstId: info.firstId,
        lastId: info.lastId,
        groups: info.groups,
        radixTreeKeys: info.radixTreeKeys,
        lastGeneratedId: info.lastGeneratedId
      };

    } catch (error) {
      logger.error('Failed to get stream info', {
        aggregateType,
        aggregateId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get event store statistics
   */
  async getStats() {
    try {
      const stats = {
        aggregates: this.aggregates.size,
        snapshots: this.snapshots.size,
        eventHandlers: this.eventHandlers.size,
        streams: this.streams.size,
        totalEvents: 0,
        totalSnapshots: 0
      };

      // Count total events in global stream
      const globalInfo = await this.redis.xinfo_stream(`${this.options.streamPrefix}global`);
      stats.totalEvents = globalInfo.length;

      // Count total snapshots
      const snapshotKeys = await this.redis.keys(`${this.options.snapshotPrefix}*`);
      stats.totalSnapshots = snapshotKeys.length;

      return stats;

    } catch (error) {
      logger.error('Failed to get event store stats', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Validate event
   */
  validateEvent(event) {
    if (!event.id) throw new Error('Event ID is required');
    if (!event.aggregateType) throw new Error('Aggregate type is required');
    if (!event.aggregateId) throw new Error('Aggregate ID is required');
    if (!event.eventType) throw new Error('Event type is required');
    if (!event.data) throw new Error('Event data is required');
    if (!event.timestamp) throw new Error('Event timestamp is required');

    // Validate aggregate type
    if (!this.aggregates.has(event.aggregateType)) {
      throw new Error(`Unknown aggregate type: ${event.aggregateType}`);
    }
  }

  /**
   * Parse stream event
   */
  parseStreamEvent(id, fields) {
    return {
      id: id,
      eventType: fields.type,
      data: JSON.parse(fields.data),
      timestamp: parseInt(fields.timestamp),
      version: parseInt(fields.version),
      causationId: fields.causationId || null,
      correlationId: fields.correlationId || null,
      userId: fields.userId || null,
      metadata: JSON.parse(fields.metadata || '{}')
    };
  }

  /**
   * Initialize aggregate state
   */
  initializeAggregateState(aggregateType) {
    const aggregateDef = this.aggregates.get(aggregateType);
    if (!aggregateDef) {
      throw new Error(`Unknown aggregate type: ${aggregateType}`);
    }

    const state = { version: 0 };
    
    for (const field of aggregateDef.fields) {
      state[field] = null;
    }

    return state;
  }

  /**
   * Apply event to state
   */
  applyEvent(state, event) {
    const newState = { ...state };
    newState.version = (newState.version || 0) + 1;
    newState.updatedAt = event.timestamp;

    // Apply event-specific changes
    switch (event.eventType) {
      case 'election_created':
        newState.id = event.data.id;
        newState.title = event.data.title;
        newState.description = event.data.description;
        newState.type = event.data.type;
        newState.status = event.data.status;
        newState.startDate = event.data.startDate;
        newState.endDate = event.data.endDate;
        newState.settings = event.data.settings;
        newState.createdAt = event.timestamp;
        break;

      case 'election_updated':
        Object.assign(newState, event.data);
        newState.updatedAt = event.timestamp;
        break;

      case 'vote_cast':
        newState.totalVotes = (newState.totalVotes || 0) + 1;
        newState.lastVoteAt = event.timestamp;
        break;

      case 'candidate_added':
        if (!newState.candidates) newState.candidates = [];
        newState.candidates.push(event.data);
        newState.candidatesCount = newState.candidates.length;
        break;

      // Add more event handlers as needed
      default:
        // For unknown events, just update timestamp and version
        break;
    }

    return newState;
  }

  /**
   * Check if snapshot should be created
   */
  shouldCreateSnapshot(streamKey) {
    // Simple heuristic: create snapshot every N events
    // In production, you'd want a more sophisticated strategy
    return Math.random() < (1 / this.options.snapshotInterval);
  }

  /**
   * Generate event ID
   */
  generateEventId() {
    return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    setInterval(async () => {
      try {
        await this.cleanupExpiredSnapshots();
        await this.cleanupOldStreams();
      } catch (error) {
        logger.error('Event store cleanup failed', {
          error: error.message
        });
      }
    }, 3600000); // Every hour
  }

  /**
   * Clean up expired snapshots
   */
  async cleanupExpiredSnapshots() {
    try {
      const snapshotKeys = await this.redis.keys(`${this.options.snapshotPrefix}*`);
      let cleanedCount = 0;

      for (const key of snapshotKeys) {
        try {
          const ttl = await this.redis.ttl(key);
          if (ttl === -1) { // No expiration set
            await this.redis.expire(key, 86400); // Set 24 hour expiration
          } else if (ttl === -2) { // Key doesn't exist
            this.snapshots.delete(key);
          }
        } catch (error) {
          // Remove problematic keys
          await this.redis.del(key);
          this.snapshots.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Expired snapshots cleaned up', {
          cleanedCount
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup expired snapshots', {
        error: error.message
      });
    }
  }

  /**
   * Clean up old streams
   */
  async cleanupOldStreams() {
    try {
      const streamKeys = await this.redis.keys(`${this.options.streamPrefix}*`);
      let cleanedCount = 0;

      for (const key of streamKeys) {
        try {
          const info = await this.redis.xinfo_stream(key);
          
          // Trim very old streams
          if (info.length > this.options.maxStreamLength * 2) {
            await this.redis.xtrim(key, 'MAXLEN', this.options.maxStreamLength);
            cleanedCount++;
          }
        } catch (error) {
          // Remove problematic streams
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Old streams cleaned up', {
          cleanedCount
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup old streams', {
        error: error.message
      });
    }
  }

  /**
   * Clear all data (for testing)
   */
  async clearAll() {
    try {
      const eventKeys = await this.redis.keys(`${this.options.eventPrefix}*`);
      const snapshotKeys = await this.redis.keys(`${this.options.snapshotPrefix}*`);
      const streamKeys = await this.redis.keys(`${this.options.streamPrefix}*`);

      const allKeys = [...eventKeys, ...snapshotKeys, ...streamKeys];
      
      if (allKeys.length > 0) {
        await this.redis.del(...allKeys);
      }

      this.snapshots.clear();
      this.streams.clear();

      logger.info('Event store cleared', {
        keysDeleted: allKeys.length
      });

    } catch (error) {
      logger.error('Failed to clear event store', {
        error: error.message
      });
    }
  }
}

// Create singleton instance
const eventStore = new EventStore({
  eventPrefix: 'events:',
  snapshotPrefix: 'snapshots:',
  streamPrefix: 'stream:',
  snapshotInterval: 1000,
  maxStreamLength: 100000,
  enableSnapshots: true,
  enableCompression: true
});

module.exports = eventStore;
