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

async function getLeaderboard(tenantId, electionId) {
  const key = `election:${tenantId}:${electionId}:votes`;
  
  const votes = await redis.hgetall(key);
  
  // Convert to array and sort by vote count
  const leaderboard = Object.entries(votes || {})
    .map(([candidateId, voteCount]) => ({
      candidateId,
      votes: parseInt(voteCount, 10)
    }))
    .sort((a, b) => b.votes - a.votes);
  
  return leaderboard;
}

module.exports = {
  incrementVote,
  getCachedVotes,
  getLeaderboard,
};





