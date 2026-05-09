const eventBus = require("../../events/eventBus");

/**
 * Consumer Group (parallel processing)
 */

function createConsumerGroup(topic, handler) {
  eventBus.on(`stream:${topic}`, async (event) => {
    try {
      await handler(event);
    } catch (err) {
      console.error("Consumer error:", err.message);
    }
  });
}

module.exports = { createConsumerGroup };