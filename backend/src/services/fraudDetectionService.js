const analyticsCache = require("./analyticsCacheService");

/* =========================================================
   BASIC FRAUD DETECTION ENGINE
========================================================= */

async function inspectVote({ userId, electionId }) {
  const key = `vote:user:${userId}`;

  const count = await analyticsCache.increment(key);

  // Simple threshold rule (upgrade later to ML)
  if (count > 5) {
    console.warn("🚨 Suspicious voting detected:", userId);

    return {
      flagged: true,
      reason: "Vote spam detected",
    };
  }

  return { flagged: false };
}

module.exports = {
  inspectVote,
};