const { Queue } = require("bullmq");
const connection = require("./connection");

const analyticsQueue = new Queue("analytics-queue", { connection });

async function updateAnalyticsJob(data) {
  await analyticsQueue.add("update-stats", data, {
    attempts: 2,
    removeOnComplete: true,
  });
}

module.exports = { analyticsQueue, updateAnalyticsJob };