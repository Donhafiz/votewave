const { Worker } = require("bullmq");
const connection = require("../config/redis");

const erieEngine = require("../erie/erie.engine");
const fraudService = require("../services/fraudDetectionService");

/* =========================================================
   ERIE INTELLIGENCE WORKER
========================================================= */

const worker = new Worker(
  "erie-queue",
  async (job) => {
    const { tenantId, electionId } = job.data;

    // 1. Run intelligence engine
    const prediction =
      await erieEngine.processElectionIntelligence({
        tenantId,
        electionId,
      });

    // 2. Optional fraud re-check at intelligence layer
    await fraudService.inspectElection({
      tenantId,
      electionId,
    });

    return prediction;
  },
  {
    connection,
    concurrency: 20,
  }
);

/* ========================================================= */

worker.on("completed", (job) => {
  console.log("🧠 ERIE processed:", job.id);
});

worker.on("failed", (job, err) => {
  console.error("🧠 ERIE failed:", job?.id, err.message);
});

module.exports = { worker };