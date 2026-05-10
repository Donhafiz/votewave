const redis = require("../config/redis");

async function projectVoteResult(payload) {
  const {
    tenantId,
    electionId,
    candidateId,
  } = payload;

  const key = `projection:${tenantId}:${electionId}`;

  await redis.hIncrBy(
    key,
    candidateId,
    1
  );
}

module.exports = {
  projectVoteResult,
};