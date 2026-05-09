const resultCache = require("../../services/resultCacheService");

/**
 * SIMPLE PROBABILISTIC MODEL (v3 baseline)
 * Later upgrade → TensorFlow / Bayesian model
 */

async function predictWinner({ tenantId, electionId }) {
  const state = await resultCache.getElectionState(
    tenantId,
    electionId
  );

  if (!state) return null;

  let total = 0;
  let leader = null;
  let max = 0;

  for (const candidateId in state) {
    const votes = state[candidateId];
    total += votes;

    if (votes > max) {
      max = votes;
      leader = candidateId;
    }
  }

  return {
    leader,
    probability: total ? max / total : 0,
  };
}

module.exports = { predictWinner };