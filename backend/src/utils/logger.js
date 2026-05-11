const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'votewave-api',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    }),
    
    // File transport for production
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'app.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
      handleExceptions: true,
      handleRejections: true
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: {
    uncaughtException: (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    },
    unhandledRejection: (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'Reason:', reason);
      process.exit(1);
    }
  }
});

// Request context logger
const createRequestLogger = (req) => {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    info: (message, meta = {}) => {
      logger.info(message, {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress,
        userId: req.user?._id,
        tenantId: req.user?.tenantId,
        ...meta
      });
    },
    
    warn: (message, meta = {}) => {
      logger.warn(message, {
        requestId,
        method: req.method,
        url: req.url,
        ...meta
      });
    },
    
    error: (message, error, meta = {}) => {
      logger.error(message, {
        requestId,
        method: req.method,
        url: req.url,
        error: error?.message || error,
        stack: error?.stack,
        ...meta
      });
    },
    
    debug: (message, meta = {}) => {
      logger.debug(message, {
        requestId,
        method: req.method,
        url: req.url,
        body: req.body,
        query: req.query,
        ...meta
      });
    }
  };
};

// Performance logger
const logPerformance = (operation, duration, metadata = {}) => {
  logger.info(`Performance: ${operation}`, {
    operation,
    duration: `${duration}ms`,
    performance: duration > 1000 ? 'slow' : 'normal',
    ...metadata
  });
};

// Security logger
const logSecurity = (event, details, severity = 'medium') => {
  logger.warn(`Security: ${event}`, {
    event,
    severity,
    ip: details.ip,
    userId: details.userId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Error logger with context
const logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    code: error.code,
    context,
    timestamp: new Date().toISOString()
  });
};

// Audit logger
const logAudit = (action, user, details = {}) => {
  logger.info(`Audit: ${action}`, {
    action,
    user: user ? {
      id: user._id,
      email: user.email,
      role: user.role
    } : 'anonymous',
    details,
    timestamp: new Date().toISOString()
  });
};

// System health logger
const logHealth = (service, status, details = {}) => {
  const level = status === 'healthy' ? 'info' : 'warn';
  logger[level](`Health: ${service}`, {
    service,
    status,
    details,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  createRequestLogger,
  logPerformance,
  logSecurity,
  logError,
  logAudit,
  logHealth,
  levels
};
