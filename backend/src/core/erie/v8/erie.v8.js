// erie.v8.js
const ConsumerGroup = require("./consumer/consumerGroup");
const dispatch = require("./consumer/dispatcher");

function bootstrapERIEv8(shards = 3) {
  const group = new ConsumerGroup("erie-v8-group");

  for (let i = 0; i < shards; i++) {
    group.consume(`consumer-${i}`, dispatch);
  }

  console.log(`🚀 ERIE v8 running with ${shards} shards`);
}

module.exports = { bootstrapERIEv8 };