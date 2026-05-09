const { createERIEWorker } = require("./erie.processor");
const eventBus = require("../../events/eventBus");
/**
 * SPAWNS SHARDED WORKERS
 */
function bootstrapERIECluster(shardCount = 4) {
  const workers = [];

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
function emitVoteEvent(data) {
  eventBus.emit("vote:cast", data);
}

module.exports = {
  bootstrapERIECluster,
};