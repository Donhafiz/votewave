/**
 * MongoDB Projection Store - Persistent storage for read models
 * Provides MongoDB-based persistence for projection data
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { logger } from '../../utils/logger';

export interface MongoProjectionDocument {
  _id: ObjectId;
  projectionId: string;
  projectionType: string;
  aggregateId: string;
  data: any;
  version: number;
  lastUpdated: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface MongoProjectionStoreOptions {
  connectionString: string;
  databaseName: string;
  projectionsCollection?: string;
  enableIndexing?: boolean;
  enableCompression?: boolean;
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export class MongoProjectionStore {
  private client: MongoClient;
  private db: Db;
  private projectionsCollection: Collection<MongoProjectionDocument>;
  private options: Required<MongoProjectionStoreOptions>;
  private isConnected: boolean = false;

  constructor(options: MongoProjectionStoreOptions) {
    this.options = {
      connectionString: options.connectionString,
      databaseName: options.databaseName,
      projectionsCollection: options.projectionsCollection || 'projections',
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
      this.projectionsCollection = this.db.collection(this.options.projectionsCollection);

      // Create indexes if enabled
      if (this.options.enableIndexing) {
        await this.createIndexes();
      }

      this.isConnected = true;
      logger.info('MongoProjectionStore connected successfully', {
        database: this.options.databaseName,
        projectionsCollection: this.options.projectionsCollection
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
      logger.info('MongoProjectionStore disconnected');
    } catch (error) {
      logger.error('Failed to disconnect from MongoDB', { error: error.message });
      throw error;
    }
  }

  /**
   * Save or update projection data
   */
  async saveProjection(
    projectionId: string,
    projectionType: string,
    aggregateId: string,
    data: any,
    version: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    this.ensureConnected();

    try {
      const document: MongoProjectionDocument = {
        _id: new ObjectId(),
        projectionId,
        projectionType,
        aggregateId,
        data,
        version,
        lastUpdated: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata
      };

      await this.projectionsCollection.replaceOne(
        { projectionId },
        document,
        { upsert: true }
      );

      logger.debug('Projection saved to MongoDB', {
        projectionId,
        projectionType,
        aggregateId,
        version
      });

    } catch (error) {
      logger.error('Failed to save projection to MongoDB', {
        projectionId,
        projectionType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get projection data
   */
  async getProjection(projectionId: string): Promise<any | null> {
    this.ensureConnected();

    try {
      const document = await this.projectionsCollection.findOne({ projectionId });
      return document ? document.data : null;
    } catch (error) {
      logger.error('Failed to get projection from MongoDB', {
        projectionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get projection with metadata
   */
  async getProjectionWithMetadata(projectionId: string): Promise<{
    data: any;
    version: number;
    lastUpdated: number;
    metadata?: Record<string, any>;
  } | null> {
    this.ensureConnected();

    try {
      const document = await this.projectionsCollection.findOne({ projectionId });
      
      if (!document) {
        return null;
      }

      return {
        data: document.data,
        version: document.version,
        lastUpdated: document.lastUpdated,
        metadata: document.metadata
      };

    } catch (error) {
      logger.error('Failed to get projection with metadata from MongoDB', {
        projectionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get projections by aggregate ID
   */
  async getProjectionsByAggregate(aggregateId: string): Promise<Array<{
    projectionId: string;
    projectionType: string;
    data: any;
    version: number;
    lastUpdated: number;
  }>> {
    this.ensureConnected();

    try {
      const documents = await this.projectionsCollection
        .find({ aggregateId })
        .sort({ lastUpdated: -1 })
        .toArray();

      return documents.map(doc => ({
        projectionId: doc.projectionId,
        projectionType: doc.projectionType,
        data: doc.data,
        version: doc.version,
        lastUpdated: doc.lastUpdated
      }));

    } catch (error) {
      logger.error('Failed to get projections by aggregate from MongoDB', {
        aggregateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get projections by type
   */
  async getProjectionsByType(projectionType: string): Promise<Array<{
    projectionId: string;
    aggregateId: string;
    data: any;
    version: number;
    lastUpdated: number;
  }>> {
    this.ensureConnected();

    try {
      const documents = await this.projectionsCollection
        .find({ projectionType })
        .sort({ lastUpdated: -1 })
        .toArray();

      return documents.map(doc => ({
        projectionId: doc.projectionId,
        aggregateId: doc.aggregateId,
        data: doc.data,
        version: doc.version,
        lastUpdated: doc.lastUpdated
      }));

    } catch (error) {
      logger.error('Failed to get projections by type from MongoDB', {
        projectionType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete projection
   */
  async deleteProjection(projectionId: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const result = await this.projectionsCollection.deleteOne({ projectionId });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error('Failed to delete projection from MongoDB', {
        projectionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete projections by aggregate ID
   */
  async deleteProjectionsByAggregate(aggregateId: string): Promise<number> {
    this.ensureConnected();

    try {
      const result = await this.projectionsCollection.deleteMany({ aggregateId });
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to delete projections by aggregate from MongoDB', {
        aggregateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete projections by type
   */
  async deleteProjectionsByType(projectionType: string): Promise<number> {
    this.ensureConnected();

    try {
      const result = await this.projectionsCollection.deleteMany({ projectionType });
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to delete projections by type from MongoDB', {
        projectionType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get projection statistics
   */
  async getStatistics(): Promise<{
    totalProjections: number;
    projectionTypes: Record<string, number>;
    aggregatesWithProjections: number;
    oldestProjection: number | null;
    newestProjection: number | null;
  }> {
    this.ensureConnected();

    try {
      // Get total counts
      const totalProjections = await this.projectionsCollection.countDocuments();

      // Get projection type counts
      const typePipeline = [
        { $group: { _id: '$projectionType', count: { $sum: 1 } } },
        { $group: { _id: null, types: { $push: { k: '$_id', v: '$count' } } } },
        { $project: { types: { $arrayToObject: '$types' } } }
      ];

      const typeResult = await this.projectionsCollection.aggregate(typePipeline).toArray();
      const projectionTypes = typeResult[0]?.types || {};

      // Get unique aggregates count
      const aggregatePipeline = [
        { $group: { _id: '$aggregateId', count: { $sum: 1 } } },
        { $count: 'uniqueAggregates' }
      ];

      const aggregateResult = await this.projectionsCollection.aggregate(aggregatePipeline).toArray();
      const aggregatesWithProjections = aggregateResult[0]?.uniqueAggregates || 0;

      // Get oldest and newest projections
      const oldestDoc = await this.projectionsCollection.findOne({}, { sort: { createdAt: 1 } });
      const newestDoc = await this.projectionsCollection.findOne({}, { sort: { createdAt: -1 } });

      return {
        totalProjections,
        projectionTypes,
        aggregatesWithProjections,
        oldestProjection: oldestDoc?.createdAt?.getTime() || null,
        newestProjection: newestDoc?.createdAt?.getTime() || null
      };

    } catch (error) {
      logger.error('Failed to get projection statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Rebuild projection from events
   */
  async rebuildProjection(
    projectionId: string,
    projectionType: string,
    aggregateId: string,
    events: any[],
    rebuildFunction: (events: any[]) => any
  ): Promise<void> {
    this.ensureConnected();

    try {
      logger.info('Rebuilding projection', {
        projectionId,
        projectionType,
        aggregateId,
        eventCount: events.length
      });

      // Rebuild projection data
      const data = rebuildFunction(events);
      const version = events.length > 0 ? events[events.length - 1].version : 0;

      // Save rebuilt projection
      await this.saveProjection(projectionId, projectionType, aggregateId, data, version);

      logger.info('Projection rebuilt successfully', {
        projectionId,
        version
      });

    } catch (error) {
      logger.error('Failed to rebuild projection', {
        projectionId,
        projectionType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Batch update projections
   */
  async batchUpdateProjections(updates: Array<{
    projectionId: string;
    projectionType: string;
    aggregateId: string;
    data: any;
    version: number;
    metadata?: Record<string, any>;
  }>): Promise<void> {
    this.ensureConnected();

    try {
      const operations = updates.map(update => ({
        replaceOne: {
          filter: { projectionId: update.projectionId },
          replacement: {
            _id: new ObjectId(),
            projectionId: update.projectionId,
            projectionType: update.projectionType,
            aggregateId: update.aggregateId,
            data: update.data,
            version: update.version,
            lastUpdated: Date.now(),
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: update.metadata
          },
          upsert: true
        }
      }));

      await this.projectionsCollection.bulkWrite(operations);

      logger.info('Projections updated in batch', {
        updateCount: updates.length
      });

    } catch (error) {
      logger.error('Failed to batch update projections', {
        updateCount: updates.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clear all projections (for testing)
   */
  async clear(): Promise<void> {
    this.ensureConnected();

    try {
      await this.projectionsCollection.deleteMany({});
      logger.info('MongoProjectionStore cleared');
    } catch (error) {
      logger.error('Failed to clear MongoProjectionStore', { error: error.message });
      throw error;
    }
  }

  /**
   * Create indexes for performance
   */
  private async createIndexes(): Promise<void> {
    try {
      // Projections collection indexes
      await this.projectionsCollection.createIndex({ projectionId: 1 }, { unique: true });
      await this.projectionsCollection.createIndex({ projectionType: 1 });
      await this.projectionsCollection.createIndex({ aggregateId: 1 });
      await this.projectionsCollection.createIndex({ lastUpdated: -1 });
      await this.projectionsCollection.createIndex({ projectionType: 1, aggregateId: 1 });

      logger.info('MongoDB projection indexes created successfully');

    } catch (error) {
      logger.error('Failed to create MongoDB projection indexes', { error: error.message });
      throw error;
    }
  }

  /**
   * Ensure connection is established
   */
  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('MongoProjectionStore is not connected. Call connect() first.');
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

export default MongoProjectionStore;
