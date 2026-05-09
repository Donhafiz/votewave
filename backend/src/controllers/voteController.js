const {
  castVoteService,
  verifyVoteService,
  getVoteStatusService,
} = require("../services/voteService");

/**
 * CAST VOTE CONTROLLER
 * Thin layer: request → service → response
 */
const castVote = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { categoryId, candidateId } = req.body;

    const result = await castVoteService({
      req,
      userId: req.user._id,
      electionId,
      categoryId,
      candidateId,
    });

    return res.status(201).json({
      success: true,
      message: "Vote cast successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * VERIFY VOTE CONTROLLER
 */
const verifyVote = async (req, res) => {
  try {
    const { confirmationCode } = req.params;

    const result = await verifyVoteService({
      userId: req.user._id,
      confirmationCode,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET VOTE STATUS CONTROLLER
 */
const getVoteStatus = async (req, res) => {
  try {
    const { electionId } = req.params;

    const result = await getVoteStatusService({
      userId: req.user._id,
      electionId,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  castVote,
  verifyVote,
  getVoteStatus,
};