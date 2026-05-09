const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
});

const voteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 votes per hour
  message: {
    success: false,
    message: 'Too many voting attempts. Please try again later.',
  },
  keyGenerator: (req) => req.ip,
});

const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 AI queries per minute
  message: {
    success: false,
    message: 'AI query limit reached. Please try again in a minute.',
  },
});

module.exports = {
  authLimiter,
  apiLimiter,
  voteLimiter,
  aiLimiter,
};
