// broker/storage.js
const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.connect().catch(console.error);

module.exports = redis;