const aiFusion = require("../../ai/fusion.engine");
const resultCache = require("../../services/resultCacheService");
const stateStore = require("../../erie/state.store");

/**
 * DASHBOARD DATA ORCHESTRATOR v2
 */

async function getLiveDashboard({ tenantId, electionId }) {
  // 1. AI Intelligence Layer
  const intelligence =
    await aiFusion.generateElectionIntelligence({
      tenantId,
      electionId,
    });

  // 2. Cached leaderboard (fast path)
  const leaderboard =
    await resultCache.getLeaderboard(tenantId, electionId);

  // 3. Raw election state (fallback)
  const state = await stateStore.getElectionState(
    tenantId,
    electionId
  );

  return {
    meta: {
      tenantId,
      electionId,
      generatedAt: new Date(),
    },

    // CORE SECTIONS
    intelligence,
    leaderboard,
    state,
  };
}

module.exports = {
  getLiveDashboard,
};