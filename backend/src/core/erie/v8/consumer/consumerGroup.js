// consumer/consumerGroup.js
const broker = require("../broker/broker");

class ConsumerGroup {
  constructor(groupName) {
    this.group = groupName;
  }

  async consume(consumerId, handler) {
    while (true) {
      const results = await broker.read(this.group, consumerId);

      if (!results) continue;

      for (const stream of results) {
        for (const msg of stream.messages) {
          const data = msg.message;

          await handler({
            id: msg.id,
            topic: data.topic,
            key: data.key,
            payload: JSON.parse(data.payload),
          });

          await broker.ack(this.group, msg.id);
        }
      }
    }
  }
}

module.exports = ConsumerGroup;