const { Worker } = require("bullmq");
const connection = require("../config/redis");

const analyticsService = require("../services/analyticsService");
const fraudService = require("../services/fraudDetectionService");

/* =========================================================
   ANALYTICS STREAM WORKER
========================================================= */

const worker = new Worker(
  "analytics-queue",
  async (job) => {
    const { type, payload } = job.data;

    switch (type) {
      case "vote":
        await analyticsService.processVote(payload);
        await fraudService.inspectVote(payload);
        break;

      case "election":
        await analyticsService.processElection(payload);
        break;

      case "user":
        await analyticsService.processUser(payload);
        break;
    }

    return { success: true };
  },
  {
    connection,
    concurrency: 50,
  }
);

/* =========================================================
   OBSERVABILITY
========================================================= */

worker.on("completed", (job) => {
  console.log("📊 Analytics processed:", job.id);
});

worker.on("failed", (job, err) => {
  console.error("📊 Analytics failed:", job?.id, err.message);
});

module.exports = { worker };