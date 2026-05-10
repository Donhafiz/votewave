const voteService = require("../services/voteService");

/* =========================================================
   CAST VOTE
========================================================= */
async function castVote(req, res) {
  try {
    const { electionId, candidateId } = req.body;

    const result = await voteService.castVote({
      tenantId: req.user?.tenantId,
      userId: req.user?._id,
      electionId,
      candidateId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

/* =========================================================
   GET VOTES
========================================================= */
async function getVotes(req, res) {
  try {
    const { electionId } = req.params;

    const result = await voteService.getVotes({ electionId });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

/* =========================================================
   GET STATS
========================================================= */
async function getVoteStats(req, res) {
  try {
    const { electionId } = req.params;

    const result = await voteService.getVoteStats({ electionId });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

/* =========================================================
   SAFE EXPORTS (CRITICAL FIX)
========================================================= */
module.exports = {
  castVote,
  getVotes,
  getVoteStats,
};