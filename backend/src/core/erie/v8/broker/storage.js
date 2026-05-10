// broker/storage.js
const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

// Handle Redis connection errors gracefully
redis.on('error', (err) => {
  console.warn('ERIE v8 Redis connection failed - using fallback mode:', err.message);
});

redis.on('connect', () => {
  console.log('✅ ERIE v8 Redis connected');
});

// Connect with error handling
redis.connect().catch((err) => {
  console.warn('ERIE v8 Redis connection failed - system will continue without streaming');
});

module.exports = redis;