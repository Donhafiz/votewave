const redis = require("../../config/redis");

async function incrementCandidateVote(
  tenantId,
  electionId,
  candidateId
) {
  const key = `results:${tenantId}:${electionId}`;

  await redis.hIncrBy(
    key,
    candidateId,
    1
  );
}

async function getResults(
  tenantId,
  electionId
) {
  const key = `results:${tenantId}:${electionId}`;

  return await redis.hGetAll(key);
}

module.exports = {
  incrementCandidateVote,
  getResults,
};