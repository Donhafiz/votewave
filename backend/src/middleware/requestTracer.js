const { v4: uuidv4 } = require('uuid');

// Request tracing middleware
const requestTracer = (req, res, next) => {
  // Generate or extract correlation ID
  const correlationId = req.headers['x-correlation-id'] || 
                       req.headers['x-request-id'] || 
                       uuidv4();

  // Add correlation ID to response headers
  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('x-request-id', correlationId);

  // Add tracing context to request
  req.traceId = correlationId;
  req.startTime = Date.now();
  req.metadata = {
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    timestamp: new Date().toISOString()
  };

  // Log request start
  if (req.logger) {
    req.logger.info(`Request started: ${req.method} ${req.url}`, {
      correlationId,
      ...req.metadata
    });
  }

  next();
};

// Performance tracking middleware
const performanceTracker = (req, res, next) => {
  const startTime = req.startTime || Date.now();
  
  // Override res.end to track response time
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    if (req.logger) {
      req.logger.info(`Request completed: ${req.method} ${req.url}`, {
        correlationId: req.traceId,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        responseSize: chunk ? chunk.length : 0
      });
    }
    
    // Call original end
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error tracing middleware
const errorTracer = (err, req, res, next) => {
  if (!err) return next();

  const errorId = uuidv4();
  const correlationId = req.traceId || uuidv4();

  // Log error with full context
  if (req.logger) {
    req.logger.error('Request error occurred', {
      errorId,
      correlationId,
      error: {
        message: err.message,
        stack: err.stack,
        code: err.code,
        type: err.constructor.name
      },
      request: req.metadata,
      timestamp: new Date().toISOString()
    });
  }

  // Add error headers
  res.setHeader('x-error-id', errorId);
  res.setHeader('x-correlation-id', correlationId);

  next(err);
};

// Database operation tracer
const dbTracer = (operation) => {
  return async (...args) => {
    const operationId = uuidv4();
    const startTime = Date.now();
    
    try {
      const result = await operation(...args);
      const duration = Date.now() - startTime;
      
      // Log successful operation
      if (args[0] && args[0].logger) {
        args[0].logger.info(`DB operation completed: ${operation}`, {
          operationId,
          operation,
          duration: `${duration}ms`,
          success: true
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log failed operation
      if (args[0] && args[0].logger) {
        args[0].logger.error(`DB operation failed: ${operation}`, {
          operationId,
          operation,
          duration: `${duration}ms`,
          success: false,
          error: {
            message: error.message,
            stack: error.stack,
            code: error.code
          }
        });
      }
      
      throw error;
    }
  };
};

module.exports = {
  requestTracer,
  performanceTracker,
  errorTracer,
  dbTracer
};
