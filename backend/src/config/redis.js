const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn(
    "[redis] WARNING: REDIS_URL environment variable is not set. " +
      "Redis-dependent features (queues, event bus) will not function until it is provided."
  );
}

const connection = REDIS_URL
  ? new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  : new IORedis({ host: "127.0.0.1", port: 6379, maxRetriesPerRequest: null });

connection.on("connect", () => {
  console.log("[redis] Connected to Redis");
});

connection.on("error", (err) => {
  console.error("[redis] Connection error:", err.message);
});

module.exports = connection;
