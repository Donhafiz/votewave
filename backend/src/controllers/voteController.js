const voteService = require("../services/voteService");

async function castVote(req, res) {
  try {
    const { electionId, candidateId } = req.body;

    const result = await voteService.castVote({
      tenantId: req.user.tenantId,
      userId: req.user._id,
      electionId,
      candidateId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  castVote,
};