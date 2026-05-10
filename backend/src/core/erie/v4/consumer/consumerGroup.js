// src/core/erie/v4/consumer/consumerGroup.js
const { createClient } = require("redis");
const { getTopicKey } = require("../broker/topic");
const { getOffset, commitOffset } = require("../broker/offsetStore");

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

async function consumeGroup({
  group,
  topic,
  partition,
  handler,
}) {
  const streamKey = `${getTopicKey(topic)}:${partition}`;

  while (true) {
    try {
      const lastId = getOffset(group, topic, partition);

      const result = await redis.xRead(
        {
          key: streamKey,
          id: lastId,
        },
        { COUNT: 10, BLOCK: 5000 }
      );

      if (!result) continue;

      for (const stream of result) {
        for (const message of stream.messages) {
          const payload = JSON.parse(message.message.data);

          await handler(payload);

          commitOffset(group, topic, partition, message.id);
        }
      }
    } catch (err) {
      console.error("Consumer error:", err.message);
    }
  }
}

module.exports = { consumeGroup };