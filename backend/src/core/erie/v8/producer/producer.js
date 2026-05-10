// producer/producer.js
const broker = require("../broker/broker");

async function emit(topic, key, payload) {
  return broker.publish(topic, key, payload);
}

module.exports = { emit };