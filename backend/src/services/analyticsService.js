const analyticsCache = require("./analyticsCacheService");

/* =========================================================
   VOTE PROCESSING
========================================================= */

async function processVote({ tenantId, electionId, candidateId }) {
  await analyticsCache.increment("votes", tenantId);

  await analyticsCache.increment(
    `election:${electionId}:votes`,
    candidateId
  );

  await analyticsCache.increment(
    `election:${electionId}:total`
  );
}

/* =========================================================
   ELECTION EVENTS
========================================================= */

async function processElection({ tenantId }) {
  await analyticsCache.increment("elections", tenantId);
}

/* =========================================================
   USER EVENTS
========================================================= */

async function processUser({ tenantId }) {
  await analyticsCache.increment("users", tenantId);
}

module.exports = {
  processVote,
  processElection,
  processUser,
};