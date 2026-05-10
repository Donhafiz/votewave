const Vote = require("../../models/Vote");

async function hasAlreadyVoted({
  tenantId,
  electionId,
  userId,
}) {
  return await Vote.exists({
    tenantId,
    electionId,
    userId,
  });
}

module.exports = {
  hasAlreadyVoted,
};