// erie.v8.js
const ConsumerGroup = require("./consumer/consumerGroup");
const dispatch = require("./consumer/dispatcher");

function bootstrapERIEv8(shards = 3) {
  try {
    const group = new ConsumerGroup("erie-v8-group");

    for (let i = 0; i < shards; i++) {
      group.consume(`consumer-${i}`, dispatch);
    }

    console.log(`🚀 ERIE v8 running with ${shards} shards`);
    return true;
  } catch (error) {
    console.error("ERIE v8 bootstrap failed:", error.message);
    return false;
  }
}

module.exports = { bootstrapERIEv8 };