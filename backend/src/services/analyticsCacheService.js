const redis = require("../config/redis");

/* =========================================================
   FAST ANALYTICS STORE (REDIS)
========================================================= */

async function increment(key, field = null) {
  if (field) {
    await redis.hIncrBy(key, field, 1);
  } else {
    await redis.incr(key);
  }
}

async function get(key) {
  return await redis.hGetAll(key);
}

module.exports = {
  increment,
  get,
};