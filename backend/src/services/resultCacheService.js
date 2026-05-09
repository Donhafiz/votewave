const redis = require("../config/redis");

function getKey(tenantId, electionId, candidateId) {
  return `result:${tenantId}:${electionId}:${candidateId}`;
}

/* increment vote */

async function incrementVote(tenantId, electionId, candidateId) {
  const key = `election:${tenantId}:${electionId}:votes`;

  const count = await redis.hincrby(key, candidateId, 1);

  return count;
}
/* get cached votes */
async function getCachedVotes(tenantId, electionId, candidateId) {
  const key = getKey(tenantId, electionId, candidateId);
  const value = await redis.get(key);
  return parseInt(value || "0", 10);
}

module.exports = {
  incrementVote,
  getCachedVotes,
};





