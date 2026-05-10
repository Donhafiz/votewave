const redis = require("../../config/redis");

const LOCK_TTL = 5000;

async function acquireVoteLock(key) {
  const lockKey = `lock:${key}`;

  const result = await redis.set(
    lockKey,
    "locked",
    {
      NX: true,
      PX: LOCK_TTL,
    }
  );

  return result === "OK";
}

async function releaseVoteLock(key) {
  await redis.del(`lock:${key}`);
}

module.exports = {
  acquireVoteLock,
  releaseVoteLock,
};