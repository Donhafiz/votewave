const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL);

async function systemHealth() {
  const redisPing = await redis.ping();

  return {
    status: redisPing === "PONG" ? "healthy" : "degraded",
    timestamp: new Date(),
  };
}

module.exports = { systemHealth };