const resultCache = require("../../services/resultCacheService");
const ElectionResult = require("../../models/ElectionResult");

/**
 * ERIE CORE ENGINE
 * - aggregates vote state
 * - updates real-time intelligence
 */
async function processIntelligence({ tenantId, electionId, candidateId }) {
  // 1. real-time aggregation (Redis layer)
  await resultCache.incrementVote(tenantId, electionId, candidateId);

  // 2. persistent aggregation (DB layer)
  await ElectionResult.findOneAndUpdate(
    { tenantId, electionId, candidateId },
    {
      $inc: { voteCount: 1 },
      lastUpdated: new Date(),
    },
    { upsert: true }
  );

  return {
    tenantId,
    electionId,
    candidateId,
    status: "processed",
  };
}

module.exports = {
  processIntelligence,
};