const eventBus = require("../../events/eventBus");

const partitions = new Map();

/**
 * ERIE v4 STREAM BROKER
 */

function send(topic, event) {
  if (!partitions.has(topic)) {
    partitions.set(topic, []);
  }

  const stream = partitions.get(topic);

  stream.push({
    ...event,
    ts: Date.now(),
  });

  eventBus.emit(`stream:${topic}`, event);
}

function getStream(topic) {
  return partitions.get(topic) || [];
}

module.exports = { send, getStream };