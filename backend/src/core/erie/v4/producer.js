const Broker = require("./broker");
const { getPartition } = require("./partitions");

const broker = new Broker(6);

/**
 * Kafka-style event producer
 */
function publish(topic, key, payload) {
  return broker.publish(topic, key, payload);
}

module.exports = { publish, broker };