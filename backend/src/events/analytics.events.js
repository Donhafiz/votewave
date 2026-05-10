const { Queue } = require("bullmq");
const connection = require("../config/redis");

const analyticsQueue = new Queue("analytics-queue", { connection });

/* =========================================================
   ANALYTICS + ERIE EVENT REGISTRY
========================================================= */
function registerAnalyticsEvents(eventBus) {
  /**
   * 📊 ANALYTICS PIPELINE
   */
  eventBus.on("analytics:event", async (event) => {
    await analyticsQueue.add("process-analytics", event, {
      attempts: 3,
      removeOnComplete: true,
    });
  });

  /**
   * 🧠 ML INTELLIGENCE STREAM
   */
  eventBus.on("ml:intelligence:update", async (payload) => {
    await analyticsQueue.add("ml-intelligence", payload, {
      attempts: 3,
      removeOnComplete: true,
    });
  });

  /**
   * 🚨 FRAUD DETECTION STREAM
   */
  eventBus.on("fraud:check", async (payload) => {
    await analyticsQueue.add("fraud-check", payload, {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    });
  });

  /**
   * 🗳 VOTE STREAM (CORE ERIE PIPELINE)
   */
  eventBus.on("vote:cast", async (payload) => {
    await analyticsQueue.add("vote-event", payload, {
      attempts: 3,
      removeOnComplete: true,
    });
  });
}

module.exports = {
  registerAnalyticsEvents,
};