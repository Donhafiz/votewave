const rateLimit = require('express-rate-limit');

const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // 100 requests per window
    message = 'Too many requests from this IP, please try again later.',
    standardHeaders = true,
    legacyHeaders = false,
  } = { ...options };

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders,
    legacyHeaders,
    keyGenerator: (req) => {
      return req.ip || req.connection.remoteAddress;
    },
    skip: (req) => {
      // Skip rate limiting for health checks and static files
      return req.path === '/api/health' || 
             req.path.startsWith('/docs') ||
             req.path.startsWith('/static');
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: 'RATE_001: ' + message,
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(windowMs / 1000), // seconds
      });
    },
  });
};

// Different limits for different endpoints
const authLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 }); // 5 auth attempts per 15 min
const voteLimiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 }); // 10 votes per hour
const uploadLimiter = createRateLimiter({ max: 3, windowMs: 60 * 60 * 1000 }); // 3 uploads per hour

module.exports = {
  createRateLimiter,
  authLimiter,
  voteLimiter,
  uploadLimiter,
};
