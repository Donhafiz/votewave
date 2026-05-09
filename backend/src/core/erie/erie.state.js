const resultCache = require("../../services/resultCacheService");

/**
 * STATE ENGINE
 * - Maintains real-time election state
 * - Syncs Redis + eventual DB consistency
 */

async function updateState(event) {
  const { tenantId, electionId, candidateId } = event;

  if (!tenantId || !electionId) return;

  await resultCache.incrementVote(
    tenantId,
    electionId,
    candidateId
  );

  console.log("📊 ERIE state updated:", electionId);
}

module.exports = { updateState };