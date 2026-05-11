const { logger } = require('../utils/logger');

// Enhanced error handling with recovery
class EnhancedErrorHandler {
  constructor() {
    this.errorCounts = new Map();
    this.circuitBreakerStates = new Map();
    this.recoveryStrategies = new Map();
  }

  // Circuit breaker pattern
  checkCircuitBreaker(serviceName) {
    const state = this.circuitBreakerStates.get(serviceName);
    if (!state) return true;

    const { failures, lastFailure, cooldownUntil } = state;
    const now = Date.now();

    // Check cooldown period
    if (now < cooldownUntil) {
      return false; // Circuit is open
    }

    // Check failure threshold
    if (failures >= 5) {
      return false; // Circuit is open
    }

    return true; // Circuit is closed
  }

  recordFailure(serviceName, error) {
    const current = this.circuitBreakerStates.get(serviceName) || { failures: 0 };
    current.failures += 1;
    current.lastFailure = {
      error: error.message,
      timestamp: Date.now(),
      code: error.code
    };

    // Open circuit after 5 failures
    if (current.failures >= 5) {
      current.cooldownUntil = Date.now() + 60000; // 1 minute cooldown
      logger.warn(`Circuit breaker OPEN for ${serviceName} - 5 failures detected`);
    }

    this.circuitBreakerStates.set(serviceName, current);
  }

  recordSuccess(serviceName) {
    const current = this.circuitBreakerStates.get(serviceName) || { failures: 0 };
    current.failures = Math.max(0, current.failures - 1);
    
    if (current.failures === 0 && current.cooldownUntil) {
      // Close circuit on first success after cooldown
      current.cooldownUntil = null;
      logger.info(`Circuit breaker CLOSED for ${serviceName} - service recovered`);
    }

    this.circuitBreakerStates.set(serviceName, current);
  }

  // Retry logic with exponential backoff
  async executeWithRetry(operation, maxRetries = 3, serviceName = 'unknown') {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.checkCircuitBreaker(serviceName)) {
          throw new Error(`Circuit breaker OPEN for ${serviceName}`);
        }

        const result = await operation();
        this.recordSuccess(serviceName);
        return result;
      } catch (error) {
        lastError = error;
        this.recordFailure(serviceName, error);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.warn(`Retry ${attempt}/${maxRetries} for ${serviceName} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  // Graceful degradation
  async executeWithFallback(primaryOperation, fallbackOperation, serviceName = 'unknown') {
    try {
      if (!this.checkCircuitBreaker(serviceName)) {
        return await primaryOperation();
      }
      throw new Error(`Circuit breaker OPEN for ${serviceName}`);
    } catch (error) {
      logger.warn(`Primary operation failed for ${serviceName}, using fallback`, {
        error: error.message
      });
      
      try {
        return await fallbackOperation();
      } catch (fallbackError) {
        logger.error(`Fallback operation failed for ${serviceName}`, {
          error: fallbackError.message
        });
        throw new Error(`Both primary and fallback failed for ${serviceName}`);
      }
    }
  }
}

const errorHandler = new EnhancedErrorHandler();

// Enhanced error response middleware
const enhancedErrorHandler = (err, req, res, next) => {
  const correlationId = req.traceId || 'unknown';
  const requestId = req.headers['x-request-id'] || 'unknown';

  // Log error with full context
  logger.error('Request failed', {
    error: {
      message: err.message,
      stack: err.stack,
      code: err.code,
      type: err.constructor.name
    },
    request: {
      correlationId,
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?._id,
      tenantId: req.user?.tenantId
    },
    timestamp: new Date().toISOString()
  });

  // Don't send error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Determine error type and status code
  let statusCode = 500;
  let errorType = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorType = 'VALIDATION_ERROR';
    message = 'Invalid input data';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    errorType = 'DATA_ERROR';
    message = 'Invalid data format';
  } else if (err.code === 'LIMIT_EXCEEDED') {
    statusCode = 429;
    errorType = 'RATE_LIMIT_ERROR';
    message = 'Too many requests, please try again later';
  } else if (err.code === 'UNAUTHORIZED') {
    statusCode = 401;
    errorType = 'AUTHENTICATION_ERROR';
    message = 'Authentication required';
  } else if (err.code === 'FORBIDDEN') {
    statusCode = 403;
    errorType = 'AUTHORIZATION_ERROR';
    message = 'Access denied';
  } else if (err.code === 'NOT_FOUND') {
    statusCode = 404;
    errorType = 'RESOURCE_NOT_FOUND';
    message = 'Resource not found';
  }

  const errorResponse = {
    success: false,
    error: errorType,
    message,
    correlationId,
    requestId,
    timestamp: new Date().toISOString()
  };

  // Add stack trace in development
  if (isDevelopment) {
    errorResponse.stack = err.stack;
    errorResponse.debug = {
      originalError: err,
      circuitBreakerState: errorHandler.circuitBreakerStates.get('database'),
      retryAttempts: 1
    };
  }

  res.status(statusCode).json(errorResponse);
};

// Recovery middleware
const recoveryMiddleware = (err, req, res, next) => {
  if (!err) return next();

  // Attempt graceful recovery
  const serviceName = req.route?.path || 'unknown';
  
  try {
    // Try to recover based on error type
    if (err.code === 'CONNECTION_LOST') {
      logger.info(`Attempting connection recovery for ${serviceName}`);
      // Implementation would go here
    }
    
    next(err);
  } catch (recoveryError) {
    logger.error('Recovery attempt failed', {
      originalError: err.message,
      recoveryError: recoveryError.message
    });
    next(recoveryError);
  }
};

module.exports = {
  errorHandler,
  recoveryMiddleware,
  executeWithRetry: errorHandler.executeWithRetry.bind(errorHandler),
  executeWithFallback: errorHandler.executeWithFallback.bind(errorHandler),
  recordFailure: errorHandler.recordFailure.bind(errorHandler),
  recordSuccess: errorHandler.recordSuccess.bind(errorHandler)
};
