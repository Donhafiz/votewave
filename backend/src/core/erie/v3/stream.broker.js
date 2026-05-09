const eventBus = require("../../events/eventBus");
const { partitionStream } = require("./stream.partition");
const { storeEvent } = require("./stream.store");

/**
 * STREAM BROKER
 * - receives all system events
 * - partitions workload
 * - persists stream
 */

async function startStreamBroker() {
  console.log("🌊 ERIE v3 Stream Broker running");

  eventBus.on("vote:cast", async (event) => {
    const partition = partitionStream(event.electionId);

    await storeEvent(partition, event);

    eventBus.emit(`stream:${partition}`, event);
  });
}

module.exports = { startStreamBroker };