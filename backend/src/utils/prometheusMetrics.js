const { logger } = require('./logger');
const client = require('prom-client');
const EventEmitter = require('events');

class PrometheusMetrics extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      prefix: options.prefix || 'votewave_',
      labels: options.labels || {},
      collectDefaultMetrics: options.collectDefaultMetrics !== false,
      collectInterval: options.collectInterval || 10000, // 10 seconds
      ...options
    };

    this.registry = new client.Registry();
    this.metrics = new Map();
    this.collectors = new Map();
    this.defaultMetrics = null;
    
    this.initialize();
  }

  /**
   * Initialize Prometheus metrics
   */
  initialize() {
    try {
      // Set default labels
      this.registry.setDefaultLabels({
        service: 'votewave-backend',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        instance: this.getInstanceId(),
        ...this.options.labels
      });

      // Collect default metrics
      if (this.options.collectDefaultMetrics) {
        this.defaultMetrics = client.collectDefaultMetrics({
          register: this.registry,
          prefix: this.options.prefix
        });
      }

      // Initialize custom metrics
      this.initializeMetrics();

      // Start periodic collection
      this.startCollection();

      logger.info('Prometheus metrics initialized', {
        prefix: this.options.prefix,
        collectDefaultMetrics: this.options.collectDefaultMetrics,
        metricCount: this.metrics.size
      });

    } catch (error) {
      logger.error('Failed to initialize Prometheus metrics', {
        error: error.message,
        options: this.options
      });
    }
  }

  /**
   * Initialize custom metrics
   */
  initializeMetrics() {
    // HTTP metrics
    this.createMetric('http_requests_total', 'counter', 'Total number of HTTP requests', ['method', 'route', 'status_code', 'status_class']);
    this.createMetric('http_request_duration_seconds', 'histogram', 'HTTP request duration in seconds', ['method', 'route', 'status_code', 'status_class']);
    this.createMetric('http_request_size_bytes', 'histogram', 'HTTP request size in bytes', ['method', 'route']);
    this.createMetric('http_response_size_bytes', 'histogram', 'HTTP response size in bytes', ['method', 'route', 'status_code']);

    // Database metrics
    this.createMetric('db_connections_active', 'gauge', 'Number of active database connections', ['database', 'type']);
    this.createMetric('db_connections_idle', 'gauge', 'Number of idle database connections', ['database', 'type']);
    this.createMetric('db_query_duration_seconds', 'histogram', 'Database query duration in seconds', ['database', 'operation', 'table']);
    this.createMetric('db_queries_total', 'counter', 'Total number of database queries', ['database', 'operation', 'table', 'status']);
    this.createMetric('db_transactions_active', 'gauge', 'Number of active database transactions', ['database']);

    // Redis metrics
    this.createMetric('redis_connections_active', 'gauge', 'Number of active Redis connections', ['node']);
    this.createMetric('redis_operations_total', 'counter', 'Total number of Redis operations', ['node', 'operation', 'status']);
    this.createMetric('redis_operation_duration_seconds', 'histogram', 'Redis operation duration in seconds', ['node', 'operation']);
    this.createMetric('redis_memory_usage_bytes', 'gauge', 'Redis memory usage in bytes', ['node']);
    this.createMetric('redis_keyspace_hits_total', 'counter', 'Total Redis keyspace hits', ['node']);
    this.createMetric('redis_keyspace_misses_total', 'counter', 'Total Redis keyspace misses', ['node']);

    // Business metrics
    this.createMetric('votes_cast_total', 'counter', 'Total number of votes cast', ['election_id', 'candidate_id', 'method']);
    this.createMetric('elections_active', 'gauge', 'Number of active elections', ['type', 'status']);
    this.createMetric('users_registered_total', 'counter', 'Total number of users registered', ['method']);
    this.createMetric('users_active', 'gauge', 'Number of active users', ['type']);
    this.createMetric('fraud_detection_score', 'histogram', 'Fraud detection scores', ['model', 'type']);
    this.createMetric('fraud_detections_total', 'counter', 'Total number of fraud detections', ['severity', 'type']);

    // WebSocket metrics
    this.createMetric('websocket_connections_active', 'gauge', 'Number of active WebSocket connections', ['room', 'type']);
    this.createMetric('websocket_connections_total', 'counter', 'Total number of WebSocket connections', ['room', 'type', 'status']);
    this.createMetric('websocket_messages_total', 'counter', 'Total number of WebSocket messages', ['room', 'type', 'direction']);
    this.createMetric('websocket_message_duration_seconds', 'histogram', 'WebSocket message processing duration in seconds', ['room', 'type']);

    // Event processing metrics
    this.createMetric('events_processed_total', 'counter', 'Total number of events processed', ['type', 'source', 'status']);
    this.createMetric('event_processing_duration_seconds', 'histogram', 'Event processing duration in seconds', ['type', 'source']);
    this.createMetric('event_queue_size', 'gauge', 'Event queue size', ['type', 'source']);
    this.createMetric('dead_letter_queue_size', 'gauge', 'Dead letter queue size', ['type', 'severity']);

    // Security metrics
    this.createMetric('authentication_attempts_total', 'counter', 'Total authentication attempts', ['method', 'status', 'reason']);
    this.createMetric('authorization_failures_total', 'counter', 'Total authorization failures', ['resource', 'action', 'reason']);
    this.createMetric('security_events_total', 'counter', 'Total security events', ['type', 'severity', 'source']);
    this.createMetric('rate_limit_violations_total', 'counter', 'Total rate limit violations', ['type', 'user_id', 'ip']);

    // System metrics
    this.createMetric('process_cpu_usage_percent', 'gauge', 'Process CPU usage percentage', ['type']);
    this.createMetric('process_memory_usage_bytes', 'gauge', 'Process memory usage in bytes', ['type']);
    this.createMetric('process_heap_size_bytes', 'gauge', 'Process heap size in bytes', ['type']);
    this.createMetric('process_open_file_descriptors', 'gauge', 'Number of open file descriptors');
    this.createMetric('process_uptime_seconds', 'gauge', 'Process uptime in seconds');

    // Error metrics
    this.createMetric('errors_total', 'counter', 'Total number of errors', ['type', 'component', 'severity']);
    this.createMetric('error_rate', 'gauge', 'Error rate percentage', ['type', 'component']);
    this.createMetric('panics_total', 'counter', 'Total number of panics', ['component']);

    // Performance metrics
    this.createMetric('response_time_p50_seconds', 'gauge', '50th percentile response time in seconds', ['endpoint']);
    this.createMetric('response_time_p95_seconds', 'gauge', '95th percentile response time in seconds', ['endpoint']);
    this.createMetric('response_time_p99_seconds', 'gauge', '99th percentile response time in seconds', ['endpoint']);
    this.createMetric('throughput_requests_per_second', 'gauge', 'Requests per second', ['endpoint']);

    // ML metrics
    this.createMetric('ml_inference_duration_seconds', 'histogram', 'ML inference duration in seconds', ['model', 'type']);
    this.createMetric('ml_inference_total', 'counter', 'Total ML inferences', ['model', 'type', 'status']);
    this.createMetric('ml_model_accuracy', 'gauge', 'ML model accuracy', ['model', 'type']);
    this.createMetric('ml_training_duration_seconds', 'histogram', 'ML training duration in seconds', ['model']);

    // Cache metrics
    this.createMetric('cache_hits_total', 'counter', 'Total cache hits', ['cache', 'type']);
    this.createMetric('cache_misses_total', 'counter', 'Total cache misses', ['cache', 'type']);
    this.createMetric('cache_hit_rate', 'gauge', 'Cache hit rate percentage', ['cache', 'type']);
    this.createMetric('cache_size_bytes', 'gauge', 'Cache size in bytes', ['cache', 'type']);

    logger.info('Custom metrics initialized', {
      metricCount: this.metrics.size
    });
  }

  /**
   * Create a metric
   * @param {string} name - Metric name
   * @param {string} type - Metric type (counter, gauge, histogram, summary)
   * @param {string} help - Metric help text
   * @param {Array} labelNames - Label names
   * @param {Object} options - Additional options
   */
  createMetric(name, type, help, labelNames = [], options = {}) {
    try {
      const fullName = this.options.prefix + name;
      let metric;

      switch (type) {
        case 'counter':
          metric = new client.Counter({
            name: fullName,
            help,
            labelNames,
            ...options
          });
          break;

        case 'gauge':
          metric = new client.Gauge({
            name: fullName,
            help,
            labelNames,
            ...options
          });
          break;

        case 'histogram':
          metric = new client.Histogram({
            name: fullName,
            help,
            labelNames,
            buckets: options.buckets || [0.1, 0.5, 1, 2, 5, 10],
            ...options
          });
          break;

        case 'summary':
          metric = new client.Summary({
            name: fullName,
            help,
            labelNames,
            percentiles: options.percentiles || [0.5, 0.9, 0.95, 0.99],
            ...options
          });
          break;

        default:
          throw new Error(`Unknown metric type: ${type}`);
      }

      // Register metric
      this.registry.registerMetric(metric);
      this.metrics.set(name, metric);

      logger.debug('Metric created', {
        name: fullName,
        type,
        labelNames
      });

      return metric;

    } catch (error) {
      logger.error('Failed to create metric', {
        name,
        type,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Increment counter metric
   * @param {string} name - Metric name
   * @param {number} value - Value to increment (default: 1)
   * @param {Object} labels - Labels
   */
  increment(name, value = 1, labels = {}) {
    try {
      const metric = this.metrics.get(name);
      if (metric && typeof metric.inc === 'function') {
        metric.inc(labels, value);
        this.emit('metricUpdated', { name, value, labels, type: 'increment' });
      } else {
        logger.warn('Metric not found or not a counter', { name });
      }
    } catch (error) {
      logger.error('Failed to increment metric', {
        name,
        value,
        labels,
        error: error.message
      });
    }
  }

  /**
   * Set gauge metric
   * @param {string} name - Metric name
   * @param {number} value - Value to set
   * @param {Object} labels - Labels
   */
  set(name, value, labels = {}) {
    try {
      const metric = this.metrics.get(name);
      if (metric && typeof metric.set === 'function') {
        metric.set(labels, value);
        this.emit('metricUpdated', { name, value, labels, type: 'set' });
      } else {
        logger.warn('Metric not found or not a gauge', { name });
      }
    } catch (error) {
      logger.error('Failed to set metric', {
        name,
        value,
        labels,
        error: error.message
      });
    }
  }

  /**
   * Observe histogram metric
   * @param {string} name - Metric name
   * @param {number} value - Value to observe
   * @param {Object} labels - Labels
   */
  observe(name, value, labels = {}) {
    try {
      const metric = this.metrics.get(name);
      if (metric && typeof metric.observe === 'function') {
        metric.observe(labels, value);
        this.emit('metricUpdated', { name, value, labels, type: 'observe' });
      } else {
        logger.warn('Metric not found or not a histogram', { name });
      }
    } catch (error) {
      logger.error('Failed to observe metric', {
        name,
        value,
        labels,
        error: error.message
      });
    }
  }

  /**
   * Start timer for histogram metric
   * @param {string} name - Metric name
   * @param {Object} labels - Labels
   * @returns {Function} - End timer function
   */
  startTimer(name, labels = {}) {
    const startTime = Date.now();
    
    return (endLabels = {}) => {
      const duration = (Date.now() - startTime) / 1000; // Convert to seconds
      this.observe(name, duration, { ...labels, ...endLabels });
      return duration;
    };
  }

  /**
   * Record HTTP request metrics
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {number} duration - Request duration in ms
   */
  recordHttpRequest(req, res, duration) {
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
      status_class: this.getStatusCodeClass(res.statusCode)
    };

    // Increment request counter
    this.increment('http_requests_total', 1, labels);

    // Record request duration
    this.observe('http_request_duration_seconds', duration / 1000, labels);

    // Record request size
    if (req.headers['content-length']) {
      this.observe('http_request_size_bytes', parseInt(req.headers['content-length']), {
        method: req.method,
        route: req.route?.path || req.path
      });
    }

    // Record response size
    if (res.headers['content-length']) {
      this.observe('http_response_size_bytes', parseInt(res.headers['content-length']), {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode.toString()
      });
    }
  }

  /**
   * Record database metrics
   * @param {string} operation - Database operation
   * @param {number} duration - Operation duration in ms
   * @param {Object} labels - Additional labels
   */
  recordDatabaseMetrics(operation, duration, labels = {}) {
    const metricLabels = {
      database: 'postgresql',
      operation,
      table: labels.table || 'unknown',
      status: labels.status || 'success'
    };

    // Record query duration
    this.observe('db_query_duration_seconds', duration / 1000, metricLabels);

    // Increment query counter
    this.increment('db_queries_total', 1, metricLabels);
  }

  /**
   * Record Redis metrics
   * @param {string} operation - Redis operation
   * @param {number} duration - Operation duration in ms
   * @param {Object} labels - Additional labels
   */
  recordRedisMetrics(operation, duration, labels = {}) {
    const metricLabels = {
      node: 'redis',
      operation,
      status: labels.status || 'success'
    };

    // Record operation duration
    this.observe('redis_operation_duration_seconds', duration / 1000, metricLabels);

    // Increment operation counter
    this.increment('redis_operations_total', 1, metricLabels);
  }

  /**
   * Record business metrics
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {Object} labels - Additional labels
   */
  recordBusinessMetric(metric, value, labels = {}) {
    this.increment(metric, value, labels);
  }

  /**
   * Record error metrics
   * @param {string} errorType - Error type
   * @param {Object} labels - Additional labels
   */
  recordError(errorType, labels = {}) {
    const metricLabels = {
      type: errorType,
      component: labels.component || 'unknown',
      severity: labels.severity || 'error'
    };

    this.increment('errors_total', 1, metricLabels);
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // CPU usage
      this.set('process_cpu_usage_percent', cpuUsage.user / 1000000, { type: 'user' });
      this.set('process_cpu_usage_percent', cpuUsage.system / 1000000, { type: 'system' });

      // Memory usage
      this.set('process_memory_usage_bytes', memUsage.rss, { type: 'rss' });
      this.set('process_memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' });
      this.set('process_memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' });
      this.set('process_memory_usage_bytes', memUsage.external, { type: 'external' });

      // Heap size
      this.set('process_heap_size_bytes', memUsage.heapTotal, { type: 'total' });
      this.set('process_heap_size_bytes', memUsage.heapUsed, { type: 'used' });

      // File descriptors
      this.set('process_open_file_descriptors', require('fs').statSync('/proc/self/fd').size);

      // Uptime
      this.set('process_uptime_seconds', process.uptime());

    } catch (error) {
      logger.error('Failed to update system metrics', {
        error: error.message
      });
    }
  }

  /**
   * Get metrics for Prometheus
   * @returns {Promise<string>} - Metrics in Prometheus format
   */
  async getMetrics() {
    try {
      return await this.registry.metrics();
    } catch (error) {
      logger.error('Failed to get metrics', {
        error: error.message
      });
      return '';
    }
  }

  /**
   * Create Express middleware for metrics
   * @returns {Function} - Express middleware
   */
  expressMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();

      // Record response
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        openTelemetryTracer.recordHttpRequest(req, res, duration);
        originalEnd.apply(this, args);
      }.bind(this);

      next();
    };
  }

  /**
   * Create metrics endpoint
   * @returns {Function} - Express route handler
   */
  metricsEndpoint() {
    return async (req, res) => {
      try {
        const metrics = await this.getMetrics();
        res.set('Content-Type', this.registry.contentType);
        res.send(metrics);
      } catch (error) {
        logger.error('Failed to serve metrics', {
          error: error.message
        });
        res.status(500).send('Error generating metrics');
      }
    };
  }

  /**
   * Get metric statistics
   * @returns {Object} - Metric statistics
   */
  getStats() {
    return {
      metricCount: this.metrics.size,
      collectorCount: this.collectors.size,
      prefix: this.options.prefix,
      collectDefaultMetrics: this.options.collectDefaultMetrics,
      registry: {
        names: this.registry.getMetricNames(),
        size: this.registry.getMetricNames().length
      }
    };
  }

  /**
   * Remove metric
   * @param {string} name - Metric name
   */
  removeMetric(name) {
    try {
      const metric = this.metrics.get(name);
      if (metric) {
        this.registry.removeSingleMetric(this.options.prefix + name);
        this.metrics.delete(name);
        logger.info('Metric removed', { name });
      }
    } catch (error) {
      logger.error('Failed to remove metric', {
        name,
        error: error.message
      });
    }
  }

  /**
   * Clear all metrics
   */
  clear() {
    try {
      this.registry.clear();
      this.metrics.clear();
      this.collectors.clear();
      
      if (this.defaultMetrics) {
        this.defaultMetrics();
      }
      
      this.initializeMetrics();
      
      logger.info('All metrics cleared and reinitialized');
    } catch (error) {
      logger.error('Failed to clear metrics', {
        error: error.message
      });
    }
  }

  /**
   * Start periodic collection
   */
  startCollection() {
    setInterval(() => {
      this.updateSystemMetrics();
    }, this.options.collectInterval);
  }

  /**
   * Helper methods
   */
  getInstanceId() {
    return `${require('os').hostname()}-${process.pid}-${Date.now()}`;
  }

  getStatusCodeClass(statusCode) {
    if (statusCode < 200) return '1xx';
    if (statusCode < 300) return '2xx';
    if (statusCode < 400) return '3xx';
    if (statusCode < 500) return '4xx';
    return '5xx';
  }
}

// Create singleton instance
const prometheusMetrics = new PrometheusMetrics({
  prefix: 'votewave_',
  collectDefaultMetrics: true,
  collectInterval: 10000
});

module.exports = prometheusMetrics;
