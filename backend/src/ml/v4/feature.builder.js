const resultCache = require("../../services/resultCacheService");

/**
 * Converts raw election state → ML feature vector
 */

async function buildFeatures({ tenantId, electionId }) {
  const state = await resultCache.getElectionState(
    tenantId,
    electionId
  );

  let totalVotes = 0;
  let candidates = [];

  for (const c in state || {}) {
    totalVotes += state[c];
    candidates.push({
      id: c,
      votes: state[c],
    });
  }

  const sorted = candidates.sort((a, b) => b.votes - a.votes);

  return {
    totalVotes,
    leaderVotes: sorted[0]?.votes || 0,
    spread: (sorted[0]?.votes || 0) - (sorted[1]?.votes || 0),
    entropy: candidates.length,
  };
}

module.exports = { buildFeatures };