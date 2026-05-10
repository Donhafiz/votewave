const Vote = require("../../models/Vote");

async function createVote(payload) {
  return await Vote.create(payload);
}

async function countVotes(electionId) {
  return await Vote.countDocuments({ electionId });
}

module.exports = {
  createVote,
  countVotes,
};