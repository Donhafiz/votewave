const resultCache = require("../../services/resultCacheService");

/**
 * TREND ENGINE
 * Measures voting speed + momentum shifts
 */

async function analyzeTrend({ tenantId, electionId }) {
  const state = await resultCache.getElectionState(
    tenantId,
    electionId
  );

  let totalVotes = 0;

  for (const c in state || {}) {
    totalVotes += state[c];
  }

  return {
    electionId,
    velocity: totalVotes, // extend later with time-series delta
    momentum: totalVotes > 100 ? "HIGH" : "LOW",
  };
}

module.exports = { analyzeTrend };