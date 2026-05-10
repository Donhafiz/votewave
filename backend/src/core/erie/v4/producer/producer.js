// src/core/erie/v4/producer/producer.js
const { createClient } = require("redis");
const { getTopicKey } = require("../broker/topic");
const { getPartition } = require("../broker/partitioner");

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

async function produce(topic, key, payload) {
  const partition = getPartition(key);

  const streamKey = `${getTopicKey(topic)}:${partition}`;

  await redis.xAdd(streamKey, "*", {
    key: key || "",
    data: JSON.stringify(payload),
    ts: Date.now(),
  });
}

module.exports = { produce };