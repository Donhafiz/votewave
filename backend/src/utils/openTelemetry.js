const { logger } = require('./logger');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

class OpenTelemetryTracer {
  constructor(options = {}) {
    this.options = {
      serviceName: options.serviceName || 'votewave-backend',
      serviceVersion: options.serviceVersion || '1.0.0',
      environment: options.environment || process.env.NODE_ENV || 'development',
      endpoint: options.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
      headers: options.headers || {},
      enableConsole: options.enableConsole || false,
      enableMetrics: options.enableMetrics !== false,
      enableTracing: options.enableTracing !== false,
      sampleRate: options.sampleRate || 1.0,
      ...options
    };

    this.sdk = null;
    this.meterProvider = null;
    this.tracer = null;
    this.meter = null;
    this.spans = new Map();
    this.metrics = new Map();
    
    this.initialize();
  }

  /**
   * Initialize OpenTelemetry
   */
  async initialize() {
    try {
      // Set up diagnostics
      if (this.options.enableConsole) {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
      }

      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.options.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.options.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.options.environment,
        [SemanticResourceAttributes.HOST_NAME]: require('os').hostname(),
        [SemanticResourceAttributes.PROCESS_PID]: process.pid,
        [SemanticResourceAttributes.PROCESS_EXECUTABLE_NAME]: 'node',
        [SemanticResourceAttributes.PROCESS_COMMAND]: process.argv.join(' '),
        'votewave.instance_id': this.getInstanceId(),
        'votewave.region': process.env.AWS_REGION || 'us-east-1',
        'votewave.tenant': process.env.TENANT_ID || 'default'
      });

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        traceExporter: this.createTraceExporter(),
        metricExporter: this.createMetricExporter(),
        instrumentations: [getNodeAutoInstrumentations()],
        sampler: this.createSampler(),
        autoDetectResources: false
      });

      // Start the SDK
      this.sdk.start();

      // Get tracer and meter
      const { trace, metrics } = require('@opentelemetry/api');
      this.tracer = trace.getTracer(this.options.serviceName, this.options.serviceVersion);
      this.meter = metrics.getMeter(this.options.serviceName, this.options.serviceVersion);

      // Initialize custom metrics
      if (this.options.enableMetrics) {
        this.initializeMetrics();
      }

      logger.info('OpenTelemetry initialized', {
        serviceName: this.options.serviceName,
        environment: this.options.environment,
        endpoint: this.options.endpoint,
        enableTracing: this.options.enableTracing,
        enableMetrics: this.options.enableMetrics
      });

    } catch (error) {
      logger.error('Failed to initialize OpenTelemetry', {
        error: error.message,
        options: this.options
      });
    }
  }

  /**
   * Create trace exporter
   */
  createTraceExporter() {
    return new OTLPTraceExporter({
      url: `${this.options.endpoint}/v1/traces`,
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers
      },
      timeoutMillis: 30000
    });
  }

  /**
   * Create metric exporter
   */
  createMetricExporter() {
    return new OTLPMetricExporter({
      url: `${this.options.endpoint}/v1/metrics`,
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers
      },
      timeoutMillis: 30000,
      aggregationTemporality: 1 // Delta aggregation
    });
  }

  /**
   * Create sampler
   */
  createSampler() {
    const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-node');
    
    return new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(this.options.sampleRate)
    });
  }

  /**
   * Initialize custom metrics
   */
  initializeMetrics() {
    // HTTP metrics
    this.metrics.set('http_requests_total', this.meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
      unit: 'requests'
    }));

    this.metrics.set('http_request_duration', this.meter.createHistogram('http_request_duration', {
      description: 'HTTP request duration',
      unit: 'ms'
    }));

    this.metrics.set('http_request_size', this.meter.createHistogram('http_request_size', {
      description: 'HTTP request size',
      unit: 'bytes'
    }));

    this.metrics.set('http_response_size', this.meter.createHistogram('http_response_size', {
      description: 'HTTP response size',
      unit: 'bytes'
    }));

    // Database metrics
    this.metrics.set('db_connections_active', this.meter.createUpDownCounter('db_connections_active', {
      description: 'Number of active database connections',
      unit: 'connections'
    }));

    this.metrics.set('db_query_duration', this.meter.createHistogram('db_query_duration', {
      description: 'Database query duration',
      unit: 'ms'
    }));

    this.metrics.set('db_queries_total', this.meter.createCounter('db_queries_total', {
      description: 'Total number of database queries',
      unit: 'queries'
    }));

    // Redis metrics
    this.metrics.set('redis_connections_active', this.meter.createUpDownCounter('redis_connections_active', {
      description: 'Number of active Redis connections',
      unit: 'connections'
    }));

    this.metrics.set('redis_operations_total', this.meter.createCounter('redis_operations_total', {
      description: 'Total number of Redis operations',
      unit: 'operations'
    }));

    this.metrics.set('redis_operation_duration', this.meter.createHistogram('redis_operation_duration', {
      description: 'Redis operation duration',
      unit: 'ms'
    }));

    // Business metrics
    this.metrics.set('votes_cast_total', this.meter.createCounter('votes_cast_total', {
      description: 'Total number of votes cast',
      unit: 'votes'
    }));

    this.metrics.set('elections_active', this.meter.createUpDownCounter('elections_active', {
      description: 'Number of active elections',
      unit: 'elections'
    }));

    this.metrics.set('users_registered_total', this.meter.createCounter('users_registered_total', {
      description: 'Total number of users registered',
      unit: 'users'
    }));

    this.metrics.set('fraud_detection_score', this.meter.createHistogram('fraud_detection_score', {
      description: 'Fraud detection scores',
      unit: 'score'
    }));

    // WebSocket metrics
    this.metrics.set('websocket_connections_active', this.meter.createUpDownCounter('websocket_connections_active', {
      description: 'Number of active WebSocket connections',
      unit: 'connections'
    }));

    this.metrics.set('websocket_messages_total', this.meter.createCounter('websocket_messages_total', {
      description: 'Total number of WebSocket messages',
      unit: 'messages'
    }));

    // System metrics
    this.metrics.set('process_cpu_usage', this.meter.createHistogram('process_cpu_usage', {
      description: 'Process CPU usage',
      unit: 'percent'
    }));

    this.metrics.set('process_memory_usage', this.meter.createHistogram('process_memory_usage', {
      description: 'Process memory usage',
      unit: 'bytes'
    }));

    // Error metrics
    this.metrics.set('errors_total', this.meter.createCounter('errors_total', {
      description: 'Total number of errors',
      unit: 'errors'
    }));

    this.metrics.set('error_rate', this.meter.createHistogram('error_rate', {
      description: 'Error rate',
      unit: 'percent'
    }));

    logger.info('Custom metrics initialized', {
      metricCount: this.metrics.size
    });
  }

  /**
   * Create a span
   * @param {string} name - Span name
   * @param {Object} options - Span options
   * @returns {Span} - OpenTelemetry span
   */
  createSpan(name, options = {}) {
    if (!this.tracer) {
      logger.warn('Tracer not available, creating no-op span');
      return this.createNoOpSpan(name);
    }

    try {
      const span = this.tracer.startSpan(name, {
        kind: options.kind || 'INTERNAL',
        attributes: {
          ...options.attributes,
          'votewave.span_type': options.type || 'custom'
        }
      });

      // Store span for reference
      this.spans.set(span.spanContext().spanId, {
        span,
        name,
        startTime: Date.now(),
        attributes: options.attributes
      });

      return span;

    } catch (error) {
      logger.error('Failed to create span', {
        name,
        error: error.message
      });
      return this.createNoOpSpan(name);
    }
  }

  /**
   * Create a no-op span for fallback
   * @param {string} name - Span name
   * @returns {Object} - No-op span object
   */
  createNoOpSpan(name) {
    return {
      setAttribute: () => {},
      setAttributes: () => {},
      addEvent: () => {},
      setStatus: () => {},
      recordException: () => {},
      end: () => {},
      isRecording: () => false,
      spanContext: () => ({ traceId: 'no-op', spanId: 'no-op' })
    };
  }

  /**
   * Create a child span
   * @param {Span} parentSpan - Parent span
   * @param {string} name - Child span name
   * @param {Object} options - Span options
   * @returns {Span} - Child span
   */
  createChildSpan(parentSpan, name, options = {}) {
    if (!this.tracer || !parentSpan) {
      return this.createSpan(name, options);
    }

    try {
      return this.tracer.startSpan(name, {
        kind: options.kind || 'INTERNAL',
        parent: parentSpan,
        attributes: {
          ...options.attributes,
          'votewave.span_type': options.type || 'child'
        }
      });

    } catch (error) {
      logger.error('Failed to create child span', {
        name,
        error: error.message
      });
      return this.createNoOpSpan(name);
    }
  }

  /**
   * Record HTTP request metrics
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {number} duration - Request duration in ms
   */
  recordHttpRequest(req, res, duration) {
    try {
      const labels = {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode,
        status_class: this.getStatusCodeClass(res.statusCode)
      };

      // Record request count
      const requestCounter = this.metrics.get('http_requests_total');
      if (requestCounter) {
        requestCounter.add(1, labels);
      }

      // Record request duration
      const durationHistogram = this.metrics.get('http_request_duration');
      if (durationHistogram) {
        durationHistogram.record(duration, labels);
      }

      // Record request size
      if (req.headers['content-length']) {
        const requestSizeHistogram = this.metrics.get('http_request_size');
        if (requestSizeHistogram) {
          requestSizeHistogram.record(parseInt(req.headers['content-length']), labels);
        }
      }

      // Record response size
      if (res.headers['content-length']) {
        const responseSizeHistogram = this.metrics.get('http_response_size');
        if (responseSizeHistogram) {
          responseSizeHistogram.record(parseInt(res.headers['content-length']), labels);
        }
      }

    } catch (error) {
      logger.error('Failed to record HTTP metrics', {
        error: error.message
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
    try {
      const metricLabels = {
        operation,
        ...labels
      };

      // Record query count
      const queryCounter = this.metrics.get('db_queries_total');
      if (queryCounter) {
        queryCounter.add(1, metricLabels);
      }

      // Record query duration
      const durationHistogram = this.metrics.get('db_query_duration');
      if (durationHistogram) {
        durationHistogram.record(duration, metricLabels);
      }

    } catch (error) {
      logger.error('Failed to record database metrics', {
        operation,
        error: error.message
      });
    }
  }

  /**
   * Record Redis metrics
   * @param {string} operation - Redis operation
   * @param {number} duration - Operation duration in ms
   * @param {Object} labels - Additional labels
   */
  recordRedisMetrics(operation, duration, labels = {}) {
    try {
      const metricLabels = {
        operation,
        ...labels
      };

      // Record operation count
      const operationCounter = this.metrics.get('redis_operations_total');
      if (operationCounter) {
        operationCounter.add(1, metricLabels);
      }

      // Record operation duration
      const durationHistogram = this.metrics.get('redis_operation_duration');
      if (durationHistogram) {
        durationHistogram.record(duration, metricLabels);
      }

    } catch (error) {
      logger.error('Failed to record Redis metrics', {
        operation,
        error: error.message
      });
    }
  }

  /**
   * Record business metrics
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {Object} labels - Additional labels
   */
  recordBusinessMetric(metric, value, labels = {}) {
    try {
      const metricInstance = this.metrics.get(metric);
      if (metricInstance) {
        metricInstance.add(value, labels);
      }

    } catch (error) {
      logger.error('Failed to record business metric', {
        metric,
        error: error.message
      });
    }
  }

  /**
   * Record error metrics
   * @param {string} errorType - Error type
   * @param {Object} labels - Additional labels
   */
  recordError(errorType, labels = {}) {
    try {
      const metricLabels = {
        error_type: errorType,
        ...labels
      };

      // Record error count
      const errorCounter = this.metrics.get('errors_total');
      if (errorCounter) {
        errorCounter.add(1, metricLabels);
      }

    } catch (error) {
      logger.error('Failed to record error metrics', {
        errorType,
        error: error.message
      });
    }
  }

  /**
   * Create Express middleware for tracing
   * @returns {Function} - Express middleware
   */
  expressMiddleware() {
    return (req, res, next) => {
      if (!this.tracer) {
        return next();
      }

      const startTime = Date.now();
      const spanName = `${req.method} ${req.route?.path || req.path}`;
      
      const span = this.createSpan(spanName, {
        kind: 'SERVER',
        type: 'http_request',
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.target': req.path,
          'http.host': req.headers.host,
          'http.scheme': req.protocol,
          'user_agent.original': req.headers['user-agent'],
          'http.remote_addr': req.ip,
          'votewave.user_id': req.user?.id,
          'votewave.tenant_id': req.tenant?.id
        }
      });

      // Add span to request for access in handlers
      req.span = span;

      // Record response
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.status_text': res.statusMessage,
          'votewave.response_duration': duration
        });

        if (res.statusCode >= 400) {
          span.setStatus({
            code: 2, // ERROR
            message: `HTTP ${res.statusCode}`
          });
        }

        // Record metrics
        this.recordHttpRequest(req, res, duration);

        span.end();
        originalEnd.apply(this, args);
      }.bind(this);

      next();
    };
  }

  /**
   * Create WebSocket middleware for tracing
   * @returns {Function} - WebSocket middleware
   */
  webSocketMiddleware() {
    return (socket, next) => {
      if (!this.tracer) {
        return next();
      }

      const span = this.createSpan('websocket_connection', {
        kind: 'SERVER',
        type: 'websocket',
        attributes: {
          'websocket.connection_id': socket.id,
          'websocket.transport': socket.conn.transport.name,
          'websocket.remote_addr': socket.conn.remoteAddress,
          'votewave.user_id': socket.user?.id,
          'votewave.tenant_id': socket.tenant?.id
        }
      });

      socket.span = span;

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        span.setAttributes({
          'websocket.disconnect_reason': reason
        });
        span.end();
      });

      next();
    };
  }

  /**
   * Trace async function
   * @param {string} name - Span name
   * @param {Function} fn - Function to trace
   * @param {Object} options - Span options
   * @returns {Function} - Traced function
   */
  traceAsync(name, fn, options = {}) {
    return async (...args) => {
      const span = this.createSpan(name, options);
      
      try {
        // Add span to function context
        if (args[0] && typeof args[0] === 'object') {
          args[0].span = span;
        }

        const result = await fn(...args);
        
        span.setStatus({ code: 1 }); // OK
        return result;

      } catch (error) {
        span.recordException(error);
        span.setStatus({
          code: 2, // ERROR
          message: error.message
        });
        throw error;

      } finally {
        span.end();
      }
    };
  }

  /**
   * Get current span from context
   * @returns {Span|null} - Current span
   */
  getCurrentSpan() {
    const { trace } = require('@opentelemetry/api');
    return trace.getActiveSpan();
  }

  /**
   * Add event to current span
   * @param {string} name - Event name
   * @param {Object} attributes - Event attributes
   */
  addEvent(name, attributes = {}) {
    const span = this.getCurrentSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Set attribute on current span
   * @param {string} key - Attribute key
   * @param {*} value - Attribute value
   */
  setAttribute(key, value) {
    const span = this.getCurrentSpan();
    if (span) {
      span.setAttribute(key, value);
    }
  }

  /**
   * Get tracing statistics
   * @returns {Object} - Tracing statistics
   */
  getStats() {
    return {
      activeSpans: this.spans.size,
      totalMetrics: this.metrics.size,
      serviceName: this.options.serviceName,
      environment: this.options.environment,
      sampleRate: this.options.sampleRate,
      enableTracing: this.options.enableTracing,
      enableMetrics: this.options.enableMetrics
    };
  }

  /**
   * Shutdown OpenTelemetry
   */
  async shutdown() {
    try {
      if (this.sdk) {
        await this.sdk.shutdown();
        logger.info('OpenTelemetry shutdown completed');
      }
    } catch (error) {
      logger.error('Failed to shutdown OpenTelemetry', {
        error: error.message
      });
    }
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
const openTelemetryTracer = new OpenTelemetryTracer({
  serviceName: 'votewave-backend',
  serviceVersion: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  enableConsole: process.env.NODE_ENV === 'development',
  sampleRate: process.env.OTEL_SAMPLE_RATE ? parseFloat(process.env.OTEL_SAMPLE_RATE) : 1.0
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  await openTelemetryTracer.shutdown();
});

process.on('SIGINT', async () => {
  await openTelemetryTracer.shutdown();
});

module.exports = openTelemetryTracer;
