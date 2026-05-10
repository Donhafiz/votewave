// src/core/erie/v4/erie.v4.cluster.js
const { consumeGroup } = require("./consumer/consumerGroup");

function bootstrapERIEv4({ topic = "events", partitions = 4 }) {
  const workers = [];

  for (let p = 0; p < partitions; p++) {
    consumeGroup({
      group: "erie-v4",
      topic,
      partition: p,

      handler: async (event) => {
        if (event.type === "vote:cast") {
          const eventBus = require("../../../events/eventBus");
          eventBus.emit("vote:cast", event);
        }

        if (event.type === "fraud:check") {
          const eventBus = require("../../../events/eventBus");
          eventBus.emit("fraud:check", event);
        }

        if (event.type === "ml:intelligence:update") {
          const eventBus = require("../../../events/eventBus");
          eventBus.emit("ml:intelligence:update", event);
        }
      },
    });

    workers.push(p);
  }

  console.log(`🚀 ERIE v4 running (${partitions} partitions)`);

  return workers;
}

module.exports = { bootstrapERIEv4 };