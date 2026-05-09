const { Queue } = require("bullmq");
const connection = require("../../config/redis");

const analyticsQueue = new Queue("analytics-queue", { connection });

/* =========================================================
   EVENT SUBSCRIPTION
========================================================= */

function registerAnalyticsEvents(eventBus) {
  eventBus.on("analytics:event", async (event) => {
    await analyticsQueue.add("process-analytics", event, {
      attempts: 3,
      removeOnComplete: true,
    });
  });
}

module.exports = {
  registerAnalyticsEvents,
};