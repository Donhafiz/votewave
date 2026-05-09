const { Worker } = require("bullmq");
const connection = require("../queues/connection");
const eventBus = require("../events/eventBus");

new Worker(
  "analytics-queue",
  async (job) => {
    const { type } = job.data;

    console.log("Updating analytics:", type);

    eventBus.emit("dashboard:update", {
      analyticsUpdated: true,
    });
  },
  { connection }
);

console.log("🟢 Analytics Worker running");