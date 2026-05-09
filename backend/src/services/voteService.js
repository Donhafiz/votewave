const crypto = require("crypto");
const { Vote, Election, Candidate, AuditLog } = require("../models");

const { getClientIP } = require("../utils");

const {
  onVoteCast,
} = require("../sockets/events/dashboard.events");

const {
  emitVoteUpdate,
} = require("../sockets/socketManager");

const {
  sendVoteConfirmation,
} = require("../utils");

/**
 * CORE SERVICE: CAST VOTE
 * --------------------------------------------------
 * This is where ALL business logic lives (SaaS-grade separation)
 */
async function castVoteService({ req, userId, electionId, categoryId, candidateId }) {
  // 1. Validate required fields
  if (!categoryId || !candidateId) {
    throw new Error("Category ID and candidate ID are required");
  }

  // 2. Load election
  const election = await Election.findById(electionId);
  if (!election) throw new Error("Election not found");

  if (election.status !== "active") {
    throw new Error("Election is not active");
  }

  const now = new Date();
  if (now < election.startDate || now > election.endDate) {
    throw new Error("Voting period is closed");
  }

  // 3. Check eligibility
  if (!req.user.isVerified) {
    throw new Error("User not verified");
  }

  const rules = election.eligibilityRules;
  if (
    rules.allowedRoles?.length &&
    !rules.allowedRoles.includes(req.user.role)
  ) {
    throw new Error("User not eligible to vote");
  }

  // 4. Prevent duplicate vote
  const existingVote = await Vote.findOne({
    election: electionId,
    voter: userId,
    category: categoryId,
  });

  if (existingVote) {
    throw new Error("You already voted in this category");
  }

  // 5. Validate category
  const category = election.categories.id(categoryId);
  if (!category) throw new Error("Category not found");

  if (!category.nominees.includes(candidateId)) {
    throw new Error("Candidate not in category");
  }

  // 6. Validate candidate
  const candidate = await Candidate.findById(candidateId);
  if (!candidate) throw new Error("Candidate not found");

  // 7. Create vote
  const vote = await Vote.create({
    election: electionId,
    voter: userId,
    category: categoryId,
    candidate: candidateId,
    hashedSelection: crypto
      .createHash("sha256")
      .update(`${candidateId}_${Date.now()}`)
      .digest("hex"),
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  });

  // 8. Update election stats
  const updatedElection = await Election.findByIdAndUpdate(
    electionId,
    { $inc: { totalVotes: 1 } },
    { new: true }
  );

  // 9. Emit REAL-TIME updates (SaaS layer)
  emitVoteUpdate({
    electionId,
    totalVotes: updatedElection.totalVotes,
    candidateId,
    categoryId,
  });

  onVoteCast({
    electionId,
    totalVotes: updatedElection.totalVotes,
  });

  // 10. Audit log
  await AuditLog.create({
    user: userId,
    action: "VOTE_CAST",
    targetType: "vote",
    targetId: vote._id,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
    details: {
      electionId,
      categoryId,
      candidateId,
      categoryName: category.name,
      candidateName: candidate.name,
    },
  });

  // 11. Send confirmation email (non-blocking in real SaaS)
  try {
    await sendVoteConfirmation(req.user.email, {
      electionTitle: election.title,
      candidateName: candidate.name,
      confirmationCode: vote.confirmationCode,
      categoryName: category.name,
    });
  } catch (err) {
    console.error("Email failed:", err.message);
  }

  // 12. Return clean response
  return {
    voteId: vote._id,
    confirmationCode: vote.confirmationCode,
    category: category.name,
    candidate: candidate.name,
  };
}

/**
 * VERIFY VOTE SERVICE
 */
async function verifyVoteService({ userId, confirmationCode }) {
  const vote = await Vote.findOne({ confirmationCode })
    .populate("election", "title status")
    .populate("candidate", "name");

  if (!vote) throw new Error("Vote not found");

  if (
    vote.voter.toString() !== userId.toString()
  ) {
    throw new Error("Access denied");
  }

  return {
    confirmed: true,
    election: vote.election,
    candidate: vote.candidate,
    votedAt: vote.votedAt,
  };
}

/**
 * GET VOTE STATUS SERVICE
 */
async function getVoteStatusService({ userId, electionId }) {
  const vote = await Vote.findOne({
    voter: userId,
    election: electionId,
  });

  return {
    hasVoted: !!vote,
    confirmationCode: vote?.confirmationCode || null,
    votedAt: vote?.votedAt || null,
  };
}

module.exports = {
  castVoteService,
  verifyVoteService,
  getVoteStatusService,
};