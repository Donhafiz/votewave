/**
 * MongoDB Event Store - Persistent storage for events
 * Provides MongoDB-based persistence for the event sourcing system
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { DomainEvent, EventMetadata, EventFilter } from '../../core/event-store/EventStore';
import { logger } from '../../utils/logger';

export interface MongoEventDocument {
  _id: ObjectId;
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: number;
  payload: any;
  metadata?: EventMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoSnapshotDocument {
  _id: ObjectId;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: number;
  data: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoEventStoreOptions {
  connectionString: string;
  databaseName: string;
  eventsCollection?: string;
  snapshotsCollection?: string;
  enableIndexing?: boolean;
  enableCompression?: boolean;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export class MongoEventStore {
  private client: MongoClient;
  private db: Db;
  private eventsCollection: Collection<MongoEventDocument>;
  private snapshotsCollection: Collection<MongoSnapshotDocument>;
  private options: Required<MongoEventStoreOptions>;
  private isConnected: boolean = false;

  constructor(options: MongoEventStoreOptions) {
    this.options = {
      connectionString: options.connectionString,
      databaseName: options.databaseName,
      eventsCollection: options.eventsCollection || 'events',
      snapshotsCollection: options.snapshotsCollection || 'snapshots',
      enableIndexing: options.enableIndexing !== false,
      enableCompression: options.enableCompression !== false,
      batchSize: options.batchSize || 1000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000
    };

    this.client = new MongoClient(this.options.connectionString);
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(this.options.databaseName);
      this.eventsCollection = this.db.collection(this.options.eventsCollection);
      this.snapshotsCollection = this.db.collection(this.options.snapshotsCollection);

      // Create indexes if enabled
      if (this.options.enableIndexing) {
        await this.createIndexes();
      }

      this.isConnected = true;
      logger.info('MongoEventStore connected successfully', {
        database: this.options.databaseName,
        eventsCollection: this.options.eventsCollection,
        snapshotsCollection: this.options.snapshotsCollection
      });

    } catch (error) {
      logger.error('Failed to connect to MongoDB', {
        connectionString: this.options.connectionString,
        database: this.options.databaseName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
      logger.info('MongoEventStore disconnected');
    } catch (error) {
      logger.error('Failed to disconnect from MongoDB', { error: error.message });
      throw error;
    }
  }

  /**
   * Append event to MongoDB
   */
  async append(event: DomainEvent): Promise<void> {
    this.ensureConnected();

    try {
      const document: MongoEventDocument = {
        _id: new ObjectId(),
        id: event.id,
        type: event.type,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        version: event.version,
        timestamp: event.timestamp,
        payload: event.payload,
        metadata: event.metadata,
        createdAt: new Date(event.timestamp),
        updatedAt: new Date()
      };

      await this.eventsCollection.insertOne(document);

      logger.debug('Event appended to MongoDB', {
        eventId: event.id,
        type: event.type,
        aggregateId: event.aggregateId,
        version: event.version
      });

    } catch (error) {
      logger.error('Failed to append event to MongoDB', {
        eventId: event.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Append multiple events atomically
   */
  async appendBatch(events: DomainEvent[]): Promise<void> {
    this.ensureConnected();

    try {
      const documents: MongoEventDocument[] = events.map(event => ({
        _id: new ObjectId(),
        id: event.id,
        type: event.type,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        version: event.version,
        timestamp: event.timestamp,
        payload: event.payload,
        metadata: event.metadata,
        createdAt: new Date(event.timestamp),
        updatedAt: new Date()
      }));

      await this.eventsCollection.insertMany(documents);

      logger.info('Events appended to MongoDB in batch', {
        eventCount: events.length,
        aggregateIds: [...new Set(events.map(e => e.aggregateId))]
      });

    } catch (error) {
      logger.error('Failed to append event batch to MongoDB', {
        eventCount: events.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get events for a specific aggregate
   */
  async getByAggregate(aggregateId: string): Promise<{
    aggregateId: string;
    aggregateType: string;
    events: DomainEvent[];
    version: number;
  }> {
    this.ensureConnected();

    try {
      const documents = await this.eventsCollection
        .find({ aggregateId })
        .sort({ version: 1 })
        .toArray();

      if (documents.length === 0) {
        return {
          aggregateId,
          aggregateType: '',
          events: [],
          version: 0
        };
      }

      const events = documents.map(this.documentToEvent);
      const aggregateType = events[0].aggregateType;
      const version = events[events.length - 1].version;

      return {
        aggregateId,
        aggregateType,
        events,
        version
      };

    } catch (error) {
      logger.error('Failed to get events by aggregate', {
        aggregateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get events filtered by criteria
   */
  async getEvents(filter: EventFilter = {}): Promise<DomainEvent[]> {
    this.ensureConnected();

    try {
      const mongoFilter: any = {};

      // Build MongoDB filter
      if (filter.aggregateId) {
        mongoFilter.aggregateId = filter.aggregateId;
      }

      if (filter.aggregateType) {
        mongoFilter.aggregateType = filter.aggregateType;
      }

      if (filter.eventType) {
        mongoFilter.type = filter.eventType;
      }

      if (filter.fromTimestamp || filter.toTimestamp) {
        mongoFilter.timestamp = {};
        if (filter.fromTimestamp) {
          mongoFilter.timestamp.$gte = filter.fromTimestamp;
        }
        if (filter.toTimestamp) {
          mongoFilter.timestamp.$lte = filter.toTimestamp;
        }
      }

      // Query with pagination
      let query = this.eventsCollection.find(mongoFilter).sort({ timestamp: 1 });

      if (filter.offset) {
        query = query.skip(filter.offset);
      }

      if (filter.limit) {
        query = query.limit(filter.limit);
      }

      const documents = await query.toArray();
      return documents.map(this.documentToEvent);

    } catch (error) {
      logger.error('Failed to get events with filter', {
        filter,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get event by ID
   */
  async getById(eventId: string): Promise<DomainEvent | null> {
    this.ensureConnected();

    try {
      const document = await this.eventsCollection.findOne({ id: eventId });
      return document ? this.documentToEvent(document) : null;
    } catch (error) {
      logger.error('Failed to get event by ID', {
        eventId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get events for multiple aggregates
   */
  async getByAggregates(aggregateIds: string[]): Promise<Map<string, {
    aggregateId: string;
    aggregateType: string;
    events: DomainEvent[];
    version: number;
  }>> {
    this.ensureConnected();

    try {
      const documents = await this.eventsCollection
        .find({ aggregateId: { $in: aggregateIds } })
        .sort({ aggregateId: 1, version: 1 })
        .toArray();

      const result = new Map();

      // Group events by aggregate
      const eventsByAggregate = new Map<string, MongoEventDocument[]>();
      for (const doc of documents) {
        if (!eventsByAggregate.has(doc.aggregateId)) {
          eventsByAggregate.set(doc.aggregateId, []);
        }
        eventsByAggregate.get(doc.aggregateId)!.push(doc);
      }

      // Convert to DomainEvent format
      for (const [aggregateId, docs] of eventsByAggregate) {
        const events = docs.map(this.documentToEvent);
        const aggregateType = events[0].aggregateType;
        const version = events[events.length - 1].version;

        result.set(aggregateId, {
          aggregateId,
          aggregateType,
          events,
          version
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to get events by aggregates', {
        aggregateIds,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Replay events for an aggregate from a specific version
   */
  async replayFromVersion(aggregateId: string, fromVersion: number = 0): Promise<DomainEvent[]> {
    this.ensureConnected();

    try {
      const documents = await this.eventsCollection
        .find({
          aggregateId,
          version: { $gt: fromVersion }
        })
        .sort({ version: 1 })
        .toArray();

      return documents.map(this.documentToEvent);

    } catch (error) {
      logger.error('Failed to replay events from version', {
        aggregateId,
        fromVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create snapshot
   */
  async createSnapshot(aggregateId: string, aggregateType: string, version: number, data: any): Promise<void> {
    this.ensureConnected();

    try {
      const document: MongoSnapshotDocument = {
        _id: new ObjectId(),
        aggregateId,
        aggregateType,
        version,
        timestamp: Date.now(),
        data,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.snapshotsCollection.replaceOne(
        { aggregateId },
        document,
        { upsert: true }
      );

      logger.debug('Snapshot created in MongoDB', {
        aggregateId,
        version
      });

    } catch (error) {
      logger.error('Failed to create snapshot', {
        aggregateId,
        version,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get snapshot for aggregate
   */
  async getSnapshot(aggregateId: string): Promise<any | null> {
    this.ensureConnected();

    try {
      const document = await this.snapshotsCollection.findOne({ aggregateId });
      return document ? document.data : null;
    } catch (error) {
      logger.error('Failed to get snapshot', {
        aggregateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get aggregate state from snapshot + events
   */
  async getAggregateState(aggregateId: string): Promise<{ snapshot: any; events: DomainEvent[] }> {
    this.ensureConnected();

    try {
      // Get snapshot
      const snapshot = await this.getSnapshot(aggregateId);
      const fromVersion = snapshot ? snapshot.version : 0;

      // Get events since snapshot
      const events = await this.replayFromVersion(aggregateId, fromVersion);

      return { snapshot, events };

    } catch (error) {
      logger.error('Failed to get aggregate state', {
        aggregateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    totalAggregates: number;
    aggregateCounts: Record<string, number>;
    eventTypeCounts: Record<string, number>;
    totalSnapshots: number;
    oldestEvent: number | null;
    newestEvent: number | null;
  }> {
    this.ensureConnected();

    try {
      // Get total counts
      const totalEvents = await this.eventsCollection.countDocuments();
      const totalSnapshots = await this.snapshotsCollection.countDocuments();

      // Get aggregate counts
      const aggregatePipeline = [
        { $group: { _id: '$aggregateId', count: { $sum: 1 } } },
        { $group: { _id: null, uniqueAggregates: { $sum: 1 }, aggregates: { $push: { k: '$_id', v: '$count' } } } },
        { $project: { uniqueAggregates: 1, aggregates: { $arrayToObject: '$aggregates' } } }
      ];

      const aggregateResult = await this.eventsCollection.aggregate(aggregatePipeline).toArray();
      const aggregateCounts = aggregateResult[0]?.aggregates || {};
      const totalAggregates = aggregateResult[0]?.uniqueAggregates || 0;

      // Get event type counts
      const eventTypePipeline = [
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $group: { _id: null, types: { $push: { k: '$_id', v: '$count' } } } },
        { $project: { types: { $arrayToObject: '$types' } } }
      ];

      const eventTypeResult = await this.eventsCollection.aggregate(eventTypePipeline).toArray();
      const eventTypeCounts = eventTypeResult[0]?.types || {};

      // Get oldest and newest events
      const oldestEventDoc = await this.eventsCollection.findOne({}, { sort: { timestamp: 1 } });
      const newestEventDoc = await this.eventsCollection.findOne({}, { sort: { timestamp: -1 } });

      return {
        totalEvents,
        totalAggregates,
        aggregateCounts,
        eventTypeCounts,
        totalSnapshots,
        oldestEvent: oldestEventDoc?.timestamp || null,
        newestEvent: newestEventDoc?.timestamp || null
      };

    } catch (error) {
      logger.error('Failed to get statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Clear all events (for testing)
   */
  async clear(): Promise<void> {
    this.ensureConnected();

    try {
      await this.eventsCollection.deleteMany({});
      await this.snapshotsCollection.deleteMany({});
      logger.info('MongoEventStore cleared');
    } catch (error) {
      logger.error('Failed to clear MongoEventStore', { error: error.message });
      throw error;
    }
  }

  /**
   * Create indexes for performance
   */
  private async createIndexes(): Promise<void> {
    try {
      // Events collection indexes
      await this.eventsCollection.createIndex({ aggregateId: 1, version: 1 }, { unique: true });
      await this.eventsCollection.createIndex({ type: 1 });
      await this.eventsCollection.createIndex({ timestamp: 1 });
      await this.eventsCollection.createIndex({ aggregateType: 1 });
      await this.eventsCollection.createIndex({ aggregateId: 1, timestamp: 1 });

      // Snapshots collection indexes
      await this.snapshotsCollection.createIndex({ aggregateId: 1 }, { unique: true });
      await this.snapshotsCollection.createIndex({ aggregateType: 1 });
      await this.snapshotsCollection.createIndex({ timestamp: 1 });

      logger.info('MongoDB indexes created successfully');

    } catch (error) {
      logger.error('Failed to create MongoDB indexes', { error: error.message });
      throw error;
    }
  }

  /**
   * Convert MongoDB document to DomainEvent
   */
  private documentToEvent(doc: MongoEventDocument): DomainEvent {
    return {
      id: doc.id,
      type: doc.type,
      aggregateId: doc.aggregateId,
      aggregateType: doc.aggregateType,
      version: doc.version,
      timestamp: doc.timestamp,
      payload: doc.payload,
      metadata: doc.metadata
    };
  }

  /**
   * Ensure connection is established
   */
  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('MongoEventStore is not connected. Call connect() first.');
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.options.maxRetries) {
          logger.warn(`Operation failed, retrying`, {
            operation: operationName,
            attempt,
            maxRetries: this.options.maxRetries,
            error: error.message
          });

          await this.sleep(this.options.retryDelay * attempt);
        }
      }
    }

      logger.error(`Operation failed after all retries`, {
        operation: operationName,
        maxRetries: this.options.maxRetries,
        error: lastError.message
      });

    throw lastError;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default MongoEventStore;
