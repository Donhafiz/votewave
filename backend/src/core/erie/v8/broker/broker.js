// broker/broker.js
const redis = require("./storage");

class Broker {
  constructor() {
    this.streamKey = "erie:v8:stream";
  }

  async publish(topic, key, payload) {
    const message = {
      topic,
      key,
      payload,
      ts: Date.now(),
    };

    await redis.xAdd(this.streamKey, "*", {
      topic,
      key: key || "",
      payload: JSON.stringify(payload),
      ts: message.ts.toString(),
    });

    return message;
  }

  async read(group, consumer, count = 10) {
    return redis.xReadGroup(group, consumer, [
      {
        key: this.streamKey,
        id: ">",
      },
    ], {
      COUNT: count,
      BLOCK: 5000,
    });
  }

  async ack(group, id) {
    return redis.xAck(this.streamKey, group, id);
  }
}

module.exports = new Broker();