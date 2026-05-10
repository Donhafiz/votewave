const { createERIEWorker } = require("./erie.processor");
const eventBus = require("../../events/eventBus");

// ✅ ADD THIS (analytics + ML + fraud event wiring)
const { registerAnalyticsEvents } = require("../../events/analytics.events");

/**
 * SPAWNS SHARDED WORKERS
 */
function bootstrapERIECluster(shardCount = 4) {
  const workers = [];

  // =========================================================
  // 🔗 EVENT REGISTRATION (CRITICAL FIX)
  // =========================================================
  registerAnalyticsEvents(eventBus);

  for (let i = 0; i < shardCount; i++) {
    const worker = createERIEWorker(i);

    worker.on("completed", (job) => {
      console.log(`✔ Shard ${i} processed job ${job.id}`);
    });

    worker.on("failed", (job, err) => {
      console.error(`✖ Shard ${i} failed`, err.message);
    });

    workers.push(worker);
  }

  console.log(`🚀 ERIE Cluster started with ${shardCount} shards`);

  return workers;
}

/**
 * OPTIONAL: manual event trigger helper
 */
function emitVoteEvent(data) {
  eventBus.emit("vote:cast", data);
}

module.exports = {
  bootstrapERIECluster,
  emitVoteEvent,
};