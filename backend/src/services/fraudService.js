const VoteLog = require("../models/VoteLog");

async function analyzeVote({ userId, electionId, ip }) {
  const recentVotes = await VoteLog.find({
    userId,
    electionId,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) }, // last 60s
  });

  const ipVotes = await VoteLog.find({
    ip,
    electionId,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });

  const flagged =
    recentVotes.length > 1 || // rapid repeat voting
    ipVotes.length > 5;       // IP abuse

  return {
    flagged,
    reasons: {
      rapidVoting: recentVotes.length > 1,
      ipAbuse: ipVotes.length > 5,
    },
  };
}

module.exports = {
  analyzeVote,
};