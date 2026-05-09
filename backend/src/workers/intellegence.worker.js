const { Worker } = require("bullmq");
const connection = require("../config/redis");

const resultCache = require("../services/resultCacheService");
const ElectionResult = require("../models/ElectionResult");
const FraudService = require("../services/fraudService");

const {
  emitDashboardUpdate,
  emitSystemAlert,
} = require("../sockets/socketManager");

const worker = new Worker(
  "analytics-queue:*",
  async (job) => {
    const event = job.data;

    const { tenantId, electionId, candidateId, userId, ip } = event;

    // 1. Redis real-time update
    await resultCache.incrementVote(tenantId, electionId, candidateId);

    // 2. Mongo persistence
    await ElectionResult.findOneAndUpdate(
      { tenantId, electionId, candidateId },
      { $inc: { voteCount: 1 }, lastUpdated: new Date() },
      { upsert: true }
    );

    // 3. Fraud detection
    const fraud = await FraudService.analyzeVote({
      userId,
      electionId,
      ip,
    });

    if (fraud.flagged) {
      emitSystemAlert({
        level: "warning",
        message: "Suspicious activity detected",
        meta: fraud,
      });
    }

    // 4. Live dashboard update
    emitDashboardUpdate({
      type: "VOTE_UPDATE",
      electionId,
      candidateId,
      timestamp: new Date(),
    });

    return { success: true };
  },
  {
    connection,
    concurrency: 100,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  }
);

module.exports = { worker };