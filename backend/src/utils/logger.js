const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure logs folder exists
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Format
const format = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Base logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels,
  format,
  defaultMeta: {
    service: "votewave-api",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),

    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      level: "info",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),

    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
  ],
});

// ✅ Proper exception handling (CORRECT WAY)
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(logDir, "exceptions.log"),
  }),
  new winston.transports.Console()
);

// ✅ Proper rejection handling (CORRECT WAY)
logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(logDir, "rejections.log"),
  }),
  new winston.transports.Console()
);

/**
 * Request logger
 */
const createRequestLogger = (req) => {
  const requestId =
    req.headers["x-request-id"] ||
    `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return {
    info: (message, meta = {}) =>
      logger.info(message, {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        ...meta,
      }),

    warn: (message, meta = {}) =>
      logger.warn(message, {
        requestId,
        method: req.method,
        url: req.url,
        ...meta,
      }),

    error: (message, error, meta = {}) =>
      logger.error(message, {
        requestId,
        method: req.method,
        url: req.url,
        error: error?.message || error,
        stack: error?.stack,
        ...meta,
      }),
  };
};

/**
 * Helpers
 */
const logPerformance = (op, duration, meta = {}) =>
  logger.info(`Performance: ${op}`, {
    operation: op,
    duration,
    performance: duration > 1000 ? "slow" : "normal",
    ...meta,
  });

const logSecurity = (event, details = {}) =>
  logger.warn(`Security: ${event}`, {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });

const logError = (error, context = {}) =>
  logger.error("Application Error", {
    message: error?.message,
    stack: error?.stack,
    ...context,
  });

const logAudit = (action, user, details = {}) =>
  logger.info(`Audit: ${action}`, {
    action,
    user: user
      ? {
          id: user.id || user._id,
          email: user.email,
          role: user.role,
        }
      : "anonymous",
    details,
  });

const logHealth = (service, status, details = {}) =>
  logger[status === "healthy" ? "info" : "warn"](
    `Health: ${service}`,
    {
      service,
      status,
      ...details,
    }
  );

module.exports = {
  logger,
  createRequestLogger,
  logPerformance,
  logSecurity,
  logError,
  logAudit,
  logHealth,
  levels,
};