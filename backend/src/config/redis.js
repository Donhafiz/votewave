const IORedis = require("ioredis");

const connection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

// Handle Redis connection errors gracefully
connection.on('error', (err) => {
  console.warn('Redis connection failed - using fallback mode:', err.message);
});

connection.on('connect', () => {
  console.log('✅ Redis connected');
});

module.exports = connection;