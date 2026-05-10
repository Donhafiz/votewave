const { broker } = require("./producer");

/**
 * Consumer group simulation (Kafka-style)
 */
function createConsumerGroup(groupId, handler, partitions = 6) {
  const offsets = new Map();

  for (let p = 0; p < partitions; p++) {
    offsets.set(p, 0);

    setInterval(() => {
      const events = broker.consume(p, offsets.get(p));

      for (const event of events) {
        handler(event);
        offsets.set(p, event.offset + 1);
      }
    }, 500);
  }

  console.log(`🧠 Consumer Group ${groupId} started`);
}

module.exports = { createConsumerGroup };