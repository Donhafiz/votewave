const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class StreamingWarehouse extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      warehousePrefix: options.warehousePrefix || 'warehouse:',
      streamPrefix: options.streamPrefix || 'stream:',
      batchSize: options.batchSize || 1000,
      windowSize: options.windowSize || 300000, // 5 minutes
      retentionPeriod: options.retentionPeriod || 86400000, // 24 hours
      aggregationInterval: options.aggregationInterval || 60000, // 1 minute
      enableRealTime: options.enableRealTime !== false,
      enableHistorical: options.enableHistorical !== false,
      enablePredictive: options.enablePredictive !== false,
      compressionThreshold: options.compressionThreshold || 1024,
      ...options
    };

    this.streams = new Map();
    this.aggregations = new Map();
    this.dimensions = new Map();
    this.metrics = new Map();
    
    this.initializeStreams();
    this.initializeDimensions();
    this.startAggregation();
    this.startCleanup();
  }

  /**
   * Initialize data streams
   */
  initializeStreams() {
    // Define data streams
    this.addStream('votes', {
      fields: ['userId', 'electionId', 'candidateId', 'timestamp', 'region', 'deviceType', 'ipAddress'],
      partitions: ['electionId', 'region'],
      retention: this.options.retentionPeriod,
      compression: true
    });

    this.addStream('users', {
      fields: ['userId', 'action', 'timestamp', 'region', 'deviceType', 'sessionId'],
      partitions: ['action', 'region'],
      retention: this.options.retentionPeriod,
      compression: true
    });

    this.addStream('elections', {
      fields: ['electionId', 'action', 'timestamp', 'region', 'status', 'participantCount'],
      partitions: ['electionId', 'action'],
      retention: this.options.retentionPeriod * 2, // Keep election data longer
      compression: true
    });

    this.addStream('performance', {
      fields: ['metric', 'value', 'timestamp', 'region', 'endpoint', 'statusCode'],
      partitions: ['metric', 'region'],
      retention: this.options.retentionPeriod / 2, // Keep performance data shorter
      compression: true
    });

    this.addStream('security', {
      fields: ['eventType', 'severity', 'timestamp', 'region', 'userId', 'ipAddress', 'details'],
      partitions: ['eventType', 'severity'],
      retention: this.options.retentionPeriod * 3, // Keep security data longest
      compression: true
    });

    logger.info('Streaming warehouse initialized', {
      streamCount: this.streams.size,
      batchSize: this.options.batchSize,
      aggregationInterval: this.options.aggregationInterval
    });
  }

  /**
   * Initialize dimensions
   */
  initializeDimensions() {
    // Time dimensions
    this.addDimension('time', {
      granularity: ['minute', 'hour', 'day', 'week', 'month'],
      fields: ['timestamp', 'date', 'hour', 'day_of_week', 'month', 'year', 'quarter']
    });

    // Geographic dimensions
    this.addDimension('geography', {
      fields: ['region', 'country', 'city', 'timezone', 'latitude', 'longitude'],
      hierarchies: [['region', 'country', 'city']]
    });

    // User dimensions
    this.addDimension('user', {
      fields: ['userId', 'userType', 'registrationDate', 'lastActivity', 'segment'],
      hierarchies: [['userType', 'segment']]
    });

    // Election dimensions
    this.addDimension('election', {
      fields: ['electionId', 'electionType', 'status', 'startDate', 'endDate', 'category'],
      hierarchies: [['electionType', 'category']]
    });

    // Device dimensions
    this.addDimension('device', {
      fields: ['deviceType', 'os', 'browser', 'screenSize', 'connectionType'],
      hierarchies: [['deviceType', 'os', 'browser']]
    });

    logger.info('Dimensions initialized', {
      dimensionCount: this.dimensions.size
    });
  }

  /**
   * Add data stream
   */
  addStream(name, definition) {
    this.streams.set(name, {
      name,
      fields: definition.fields,
      partitions: definition.partitions || [],
      retention: definition.retention || this.options.retentionPeriod,
      compression: definition.compression || false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Initialize Redis stream
    const streamKey = `${this.options.streamPrefix}${name}`;
    this.redis.xgroup('CREATE', streamKey, 'warehouse', '0', 'MKSTREAM').catch(() => {
      // Group might already exist
    });

    logger.debug('Stream added', { name });
  }

  /**
   * Add dimension
   */
  addDimension(name, definition) {
    this.dimensions.set(name, {
      name,
      fields: definition.fields,
      hierarchies: definition.hierarchies || [],
      granularity: definition.granularity || ['day'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    logger.debug('Dimension added', { name });
  }

  /**
   * Ingest event data
   */
  async ingest(streamName, eventData) {
    try {
      const stream = this.streams.get(streamName);
      if (!stream) {
        throw new Error(`Unknown stream: ${streamName}`);
      }

      // Validate event data
      this.validateEventData(stream, eventData);

      // Add timestamp if not present
      if (!eventData.timestamp) {
        eventData.timestamp = Date.now();
      }

      // Add dimensions
      const enrichedData = await this.enrichWithDimensions(eventData);

      // Store in stream
      const streamKey = `${this.options.streamPrefix}${streamName}`;
      
      const pipeline = this.redis.pipeline();
      
      // Add to main stream
      const fields = this.flattenObject(enrichedData);
      pipeline.xadd(
        streamKey,
        'MAXLEN',
        '~',
        this.options.batchSize * 10, // Trim to 10x batch size
        '*',
        ...Object.entries(fields).flat()
      );

      // Add to partition streams
      for (const partition of stream.partitions) {
        if (enrichedData[partition]) {
          const partitionKey = `${streamKey}:${partition}:${enrichedData[partition]}`;
          pipeline.xadd(
            partitionKey,
            'MAXLEN',
            '~',
            this.options.batchSize,
            '*',
            ...Object.entries(fields).flat()
          );
        }
      }

      await pipeline.exec();

      // Update metrics
      this.updateStreamMetrics(streamName, 'ingest', 1);

      // Emit event for real-time processing
      if (this.options.enableRealTime) {
        this.emit('dataIngested', {
          streamName,
          data: enrichedData,
          timestamp: Date.now()
        });
      }

      logger.debug('Data ingested', {
        streamName,
        eventId: eventData.id || 'unknown'
      });

      return {
        success: true,
        streamName,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Failed to ingest data', {
        streamName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Batch ingest events
   */
  async batchIngest(streamName, events) {
    try {
      const stream = this.streams.get(streamName);
      if (!stream) {
        throw new Error(`Unknown stream: ${streamName}`);
      }

      const results = [];
      const batchSize = Math.min(events.length, this.options.batchSize);

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        
        const pipeline = this.redis.pipeline();
        const streamKey = `${this.options.streamPrefix}${streamName}`;

        for (const eventData of batch) {
          // Validate and enrich
          this.validateEventData(stream, eventData);
          
          const enrichedData = await this.enrichWithDimensions({
            ...eventData,
            timestamp: eventData.timestamp || Date.now()
          });

          const fields = this.flattenObject(enrichedData);
          
          // Add to main stream
          pipeline.xadd(
            streamKey,
            'MAXLEN',
            '~',
            this.options.batchSize * 10,
            '*',
            ...Object.entries(fields).flat()
          );

          // Add to partition streams
          for (const partition of stream.partitions) {
            if (enrichedData[partition]) {
              const partitionKey = `${streamKey}:${partition}:${enrichedData[partition]}`;
              pipeline.xadd(
                partitionKey,
                'MAXLEN',
                '~',
                this.options.batchSize,
                '*',
                ...Object.entries(fields).flat()
              );
            }
          }
        }

        await pipeline.exec();

        // Update metrics
        this.updateStreamMetrics(streamName, 'batch_ingest', batch.length);

        results.push({
          batchIndex: i / batchSize,
          batchSize: batch.length,
          success: true
        });
      }

      logger.info('Batch ingest completed', {
        streamName,
        totalEvents: events.length,
        batches: results.length
      });

      return results;

    } catch (error) {
      logger.error('Failed to batch ingest data', {
        streamName,
        eventCount: events.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Query streaming data
   */
  async query(streamName, filters = {}, options = {}) {
    try {
      const stream = this.streams.get(streamName);
      if (!stream) {
        throw new Error(`Unknown stream: ${streamName}`);
      }

      const {
        startTime,
        endTime,
        limit = 1000,
        offset = 0,
        groupBy,
        aggregations = [],
        orderBy = 'timestamp',
        orderDirection = 'desc'
      } = options;

      let streamKey = `${this.options.streamPrefix}${streamName}`;

      // Use partition stream if specified
      if (filters.partition && filters.partitionValue) {
        streamKey = `${streamKey}:${filters.partition}:${filters.partitionValue}`;
      }

      // Build query
      const query = {
        stream: streamKey,
        startTime: startTime || Date.now() - this.options.windowSize,
        endTime: endTime || Date.now(),
        limit,
        offset
      };

      // Execute query
      const results = await this.executeQuery(query, filters);

      // Apply aggregations
      if (aggregations.length > 0) {
        return await this.applyAggregations(results, aggregations, groupBy);
      }

      // Apply ordering
      if (orderBy) {
        results.sort((a, b) => {
          const aVal = a[orderBy];
          const bVal = b[orderBy];
          
          if (orderDirection === 'desc') {
            return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
          } else {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          }
        });
      }

      return results;

    } catch (error) {
      logger.error('Failed to query streaming data', {
        streamName,
        filters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute query on stream
   */
  async executeQuery(query, filters) {
    try {
      const results = [];
      
      // Read from stream
      const streamEvents = await this.redis.xrange(
        query.stream,
        query.startTime,
        query.endTime,
        'COUNT',
        query.limit + query.offset
      );

      // Parse events and apply filters
      for (const [id, fields] of streamEvents.slice(query.offset)) {
        const event = this.parseStreamEvent(id, fields);
        
        if (this.matchesFilters(event, filters)) {
          results.push(event);
        }
      }

      return results;

    } catch (error) {
      logger.error('Failed to execute query', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Apply aggregations to results
   */
  async applyAggregations(results, aggregations, groupBy) {
    try {
      if (!groupBy) {
        // Simple aggregations without grouping
        const aggregated = {};
        
        for (const agg of aggregations) {
          switch (agg.type) {
            case 'count':
              aggregated[agg.field] = results.length;
              break;
            case 'sum':
              aggregated[agg.field] = results.reduce((sum, item) => sum + (item[agg.field] || 0), 0);
              break;
            case 'avg':
              const sum = results.reduce((sum, item) => sum + (item[agg.field] || 0), 0);
              aggregated[agg.field] = results.length > 0 ? sum / results.length : 0;
              break;
            case 'min':
              aggregated[agg.field] = Math.min(...results.map(item => item[agg.field] || 0));
              break;
            case 'max':
              aggregated[agg.field] = Math.max(...results.map(item => item[agg.field] || 0));
              break;
          }
        }

        return [aggregated];
      }

      // Grouped aggregations
      const grouped = {};
      
      for (const item of results) {
        const key = item[groupBy];
        
        if (!grouped[key]) {
          grouped[key] = [];
        }
        
        grouped[key].push(item);
      }

      const aggregatedResults = [];
      
      for (const [key, group] of Object.entries(grouped)) {
        const aggregated = { [groupBy]: key };
        
        for (const agg of aggregations) {
          switch (agg.type) {
            case 'count':
              aggregated[agg.field] = group.length;
              break;
            case 'sum':
              aggregated[agg.field] = group.reduce((sum, item) => sum + (item[agg.field] || 0), 0);
              break;
            case 'avg':
              const sum = group.reduce((sum, item) => sum + (item[agg.field] || 0), 0);
              aggregated[agg.field] = group.length > 0 ? sum / group.length : 0;
              break;
            case 'min':
              aggregated[agg.field] = Math.min(...group.map(item => item[agg.field] || 0));
              break;
            case 'max':
              aggregated[agg.field] = Math.max(...group.map(item => item[agg.field] || 0));
              break;
          }
        }
        
        aggregatedResults.push(aggregated);
      }

      return aggregatedResults;

    } catch (error) {
      logger.error('Failed to apply aggregations', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Create materialized view
   */
  async createMaterializedView(name, query, refreshInterval = 300000) { // 5 minutes
    try {
      const view = {
        name,
        query,
        refreshInterval,
        lastRefresh: null,
        data: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Store view definition
      const viewKey = `${this.options.warehousePrefix}views:${name}`;
      await this.redis.setex(viewKey, 86400, JSON.stringify(view));

      // Start refresh process
      this.startViewRefresh(name, view);

      logger.info('Materialized view created', {
        name,
        refreshInterval
      });

      return view;

    } catch (error) {
      logger.error('Failed to create materialized view', {
        name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start materialized view refresh
   */
  startViewRefresh(name, view) {
    const refreshInterval = setInterval(async () => {
      try {
        await this.refreshMaterializedView(name, view);
      } catch (error) {
        logger.error('Failed to refresh materialized view', {
          name,
          error: error.message
        });
      }
    }, view.refreshInterval);

    // Store interval for cleanup
    this.aggregations.set(name, {
      type: 'materialized_view',
      interval: refreshInterval,
      view
    });
  }

  /**
   * Refresh materialized view
   */
  async refreshMaterializedView(name, view) {
    try {
      // Execute query
      const results = await this.query(view.query.stream, view.query.filters, view.query.options);
      
      // Update view data
      view.data = results;
      view.lastRefresh = Date.now();
      view.updatedAt = Date.now();

      // Store updated view
      const viewKey = `${this.options.warehousePrefix}views:${name}`;
      await this.redis.setex(viewKey, 86400, JSON.stringify(view));

      logger.debug('Materialized view refreshed', {
        name,
        resultCount: results.length
      });

      this.emit('viewRefreshed', {
        name,
        resultCount: results.length,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Failed to refresh materialized view', {
        name,
        error: error.message
      });
    }
  }

  /**
   * Get real-time analytics
   */
  async getRealTimeAnalytics(streamName, timeWindow = 300000) { // 5 minutes
    try {
      const now = Date.now();
      const startTime = now - timeWindow;

      const results = await this.query(streamName, {}, {
        startTime,
        endTime: now,
        limit: 10000,
        aggregations: [
          { type: 'count', field: 'count' },
          { type: 'sum', field: 'value' },
          { type: 'avg', field: 'value' }
        ]
      });

      return {
        streamName,
        timeWindow,
        timestamp: now,
        results
      };

    } catch (error) {
      logger.error('Failed to get real-time analytics', {
        streamName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get historical analytics
   */
  async getHistoricalAnalytics(streamName, startTime, endTime, granularity = 'hour') {
    try {
      const results = await this.query(streamName, {}, {
        startTime,
        endTime,
        limit: 100000,
        aggregations: [
          { type: 'count', field: 'count' },
          { type: 'sum', field: 'value' },
          { type: 'avg', field: 'value' }
        ],
        groupBy: granularity
      });

      return {
        streamName,
        startTime,
        endTime,
        granularity,
        results
      };

    } catch (error) {
      logger.error('Failed to get historical analytics', {
        streamName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get predictive analytics
   */
  async getPredictiveAnalytics(streamName, predictionWindow = 3600000) { // 1 hour
    try {
      if (!this.options.enablePredictive) {
        return null;
      }

      // Get historical data for prediction
      const historicalData = await this.query(streamName, {}, {
        startTime: Date.now() - (24 * 60 * 60 * 1000), // 24 hours
        endTime: Date.now(),
        limit: 10000
      });

      // Simple linear regression prediction
      const predictions = this.generatePredictions(historicalData, predictionWindow);

      return {
        streamName,
        predictionWindow,
        timestamp: Date.now(),
        predictions,
        confidence: this.calculatePredictionConfidence(historicalData)
      };

    } catch (error) {
      logger.error('Failed to get predictive analytics', {
        streamName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Generate predictions using simple linear regression
   */
  generatePredictions(data, predictionWindow) {
    try {
      if (data.length < 2) {
        return [];
      }

      // Sort by timestamp
      data.sort((a, b) => a.timestamp - b.timestamp);

      // Calculate trend
      const n = data.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

      for (let i = 0; i < n; i++) {
        const x = i;
        const y = data[i].value || 1;
        
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      }

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Generate predictions
      const predictions = [];
      const now = Date.now();
      const interval = predictionWindow / 10; // 10 prediction points

      for (let i = 1; i <= 10; i++) {
        const futureTime = now + (i * interval);
        const futureX = n + i;
        const predictedValue = slope * futureX + intercept;

        predictions.push({
          timestamp: futureTime,
          predictedValue: Math.max(0, predictedValue),
          point: i
        });
      }

      return predictions;

    } catch (error) {
      logger.error('Failed to generate predictions', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Calculate prediction confidence
   */
  calculatePredictionConfidence(data) {
    try {
      if (data.length < 3) {
        return 0.5; // Low confidence for small datasets
      }

      // Calculate variance as a simple confidence measure
      const values = data.map(d => d.value || 1);
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      // Higher variance = lower confidence
      const confidence = Math.max(0.1, Math.min(0.9, 1 - (stdDev / mean)));
      
      return confidence;

    } catch (error) {
      logger.error('Failed to calculate prediction confidence', {
        error: error.message
      });
      return 0.5;
    }
  }

  /**
   * Validate event data
   */
  validateEventData(stream, eventData) {
    for (const field of stream.fields) {
      if (field === 'timestamp') continue; // Timestamp is optional
      if (!eventData.hasOwnProperty(field)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  /**
   * Enrich data with dimensions
   */
  async enrichWithDimensions(eventData) {
    const enriched = { ...eventData };

    // Add time dimensions
    const timestamp = new Date(eventData.timestamp);
    enriched.date = timestamp.toISOString().split('T')[0];
    enriched.hour = timestamp.getHours();
    enriched.day_of_week = timestamp.getDay();
    enriched.month = timestamp.getMonth() + 1;
    enriched.year = timestamp.getFullYear();
    enriched.quarter = Math.floor((timestamp.getMonth() + 3) / 3);

    // Add other dimensions as needed
    // This would integrate with dimension lookup tables

    return enriched;
  }

  /**
   * Flatten object for Redis storage
   */
  flattenObject(obj, prefix = '') {
    const flattened = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(flattened, this.flattenObject(obj[key], newKey));
        } else {
          flattened[newKey] = typeof obj[key] === 'string' ? obj[key] : JSON.stringify(obj[key]);
        }
      }
    }

    return flattened;
  }

  /**
   * Parse stream event
   */
  parseStreamEvent(id, fields) {
    const event = { id };
    
    for (const [key, value] of Object.entries(fields)) {
      try {
        // Try to parse as JSON first
        event[key] = JSON.parse(value);
      } catch {
        // If not JSON, use as string
        event[key] = value;
      }
    }

    return event;
  }

  /**
   * Check if event matches filters
   */
  matchesFilters(event, filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (event[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Update stream metrics
   */
  updateStreamMetrics(streamName, operation, count = 1) {
    if (!this.metrics.has(streamName)) {
      this.metrics.set(streamName, {
        ingested: 0,
        queried: 0,
        errors: 0,
        lastUpdated: Date.now()
      });
    }

    const metrics = this.metrics.get(streamName);
    metrics[operation] = (metrics[operation] || 0) + count;
    metrics.lastUpdated = Date.now();
  }

  /**
   * Start aggregation process
   */
  startAggregation() {
    setInterval(async () => {
      try {
        await this.performAggregation();
      } catch (error) {
        logger.error('Aggregation failed', {
          error: error.message
        });
      }
    }, this.options.aggregationInterval);
  }

  /**
   * Perform periodic aggregation
   */
  async performAggregation() {
    try {
      for (const streamName of this.streams.keys()) {
        // Create time-based aggregations
        await this.createTimeAggregations(streamName);
      }

      logger.debug('Aggregation completed');

    } catch (error) {
      logger.error('Failed to perform aggregation', {
        error: error.message
      });
    }
  }

  /**
   * Create time-based aggregations
   */
  async createTimeAggregations(streamName) {
    try {
      const now = Date.now();
      const intervals = [
        { name: 'minute', duration: 60000 },
        { name: 'hour', duration: 3600000 },
        { name: 'day', duration: 86400000 }
      ];

      for (const interval of intervals) {
        const startTime = now - interval.duration;
        const endTime = now;

        const results = await this.query(streamName, {}, {
          startTime,
          endTime,
          aggregations: [
            { type: 'count', field: 'count' },
            { type: 'sum', field: 'value' },
            { type: 'avg', field: 'value' }
          ]
        });

        // Store aggregation
        const aggKey = `${this.options.warehousePrefix}aggregations:${streamName}:${interval.name}:${Math.floor(now / interval.duration)}`;
        await this.redis.setex(aggKey, 86400, JSON.stringify({
          streamName,
          interval: interval.name,
          period: Math.floor(now / interval.duration),
          startTime,
          endTime,
          results,
          createdAt: now
        }));
      }

    } catch (error) {
      logger.error('Failed to create time aggregations', {
        streamName,
        error: error.message
      });
    }
  }

  /**
   * Start cleanup process
   */
  startCleanup() {
    setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Cleanup failed', {
          error: error.message
        });
      }
    }, 3600000); // Every hour
  }

  /**
   * Perform cleanup of old data
   */
  async performCleanup() {
    try {
      const cutoffTime = Date.now() - this.options.retentionPeriod;

      // Clean up old stream data
      for (const streamName of this.streams.keys()) {
        const streamKey = `${this.options.streamPrefix}${streamName}`;
        
        // Trim old entries
        await this.redis.xtrim(streamKey, 'MINID', cutoffTime);

        // Clean up partition streams
        const stream = this.streams.get(streamName);
        for (const partition of stream.partitions) {
          const pattern = `${streamKey}:${partition}:*`;
          const keys = await this.redis.keys(pattern);
          
          for (const key of keys) {
            await this.redis.xtrim(key, 'MINID', cutoffTime);
          }
        }
      }

      // Clean up old aggregations
      const aggPattern = `${this.options.warehousePrefix}aggregations:*`;
      const aggKeys = await this.redis.keys(aggPattern);
      
      for (const key of aggKeys) {
        try {
          const aggData = await this.redis.get(key);
          if (aggData) {
            const agg = JSON.parse(aggData);
            if (agg.endTime < cutoffTime) {
              await this.redis.del(key);
            }
          }
        } catch (error) {
          // Remove problematic keys
          await this.redis.del(key);
        }
      }

      logger.debug('Cleanup completed');

    } catch (error) {
      logger.error('Failed to perform cleanup', {
        error: error.message
      });
    }
  }

  /**
   * Get warehouse status
   */
  getStatus() {
    return {
      streams: Array.from(this.streams.keys()),
      dimensions: Array.from(this.dimensions.keys()),
      aggregations: this.aggregations.size,
      metrics: Object.fromEntries(this.metrics),
      options: {
        batchSize: this.options.batchSize,
        windowSize: this.options.windowSize,
        enableRealTime: this.options.enableRealTime,
        enableHistorical: this.options.enableHistorical,
        enablePredictive: this.options.enablePredictive
      },
      timestamp: Date.now()
    };
  }

  /**
   * Get warehouse statistics
   */
  async getStats() {
    try {
      const stats = {
        totalStreams: this.streams.size,
        totalDimensions: this.dimensions.size,
        totalAggregations: this.aggregations.size,
        streamMetrics: {},
        storageUsage: 0
      };

      // Get stream metrics
      for (const [streamName, metrics] of this.metrics) {
        stats.streamMetrics[streamName] = metrics;
      }

      // Estimate storage usage
      for (const streamName of this.streams.keys()) {
        const streamKey = `${this.options.streamPrefix}${streamName}`;
        try {
          const info = await this.redis.xinfo_stream(streamKey);
          stats.storageUsage += info.length;
        } catch (error) {
          // Stream might not exist yet
        }
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get warehouse stats', {
        error: error.message
      });
      return null;
    }
  }
}

// Create singleton instance
const streamingWarehouse = new StreamingWarehouse({
  warehousePrefix: 'warehouse:',
  streamPrefix: 'stream:',
  batchSize: 1000,
  windowSize: 300000,
  retentionPeriod: 86400000,
  aggregationInterval: 60000,
  enableRealTime: true,
  enableHistorical: true,
  enablePredictive: true
});

module.exports = streamingWarehouse;
