const redis = require("../config/redis");

/* =========================================================
   REAL-TIME STATE STORAGE
========================================================= */

async function getElectionState(tenantId, electionId) {
  const key = `state:${tenantId}:${electionId}`;

  const data = await redis.hGetAll(key);

  return {
    totalVotes: Number(data.totalVotes || 0),
    candidates: JSON.parse(data.candidates || "[]"),
  };
}

async function saveIntelligenceSnapshot(
  tenantId,
  electionId,
  prediction
) {
  const key = `intelligence:${tenantId}:${electionId}`;

  await redis.set(key, JSON.stringify(prediction));
}

module.exports = {
  getElectionState,
  saveIntelligenceSnapshot,
};