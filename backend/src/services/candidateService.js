const { Candidate, Election, AuditLog } = require("../models");
const { getClientIP } = require("../utils");

const {
  emitActivity,
} = require("../sockets/socketManager");

/**
 * CREATE CANDIDATE (NOMINEE)
 */
async function createCandidateService({ electionId, categoryId, data, user, req }) {
  const election = await Election.findById(electionId);
  if (!election) throw new Error("Election not found");

  // permission check
  if (
    election.createdBy.toString() !== user._id.toString() &&
    user.role !== "superadmin"
  ) {
    throw new Error("Access denied");
  }

  const categoryIndex = election.categories.findIndex(
    (cat) => cat._id.toString() === categoryId
  );

  if (categoryIndex === -1) {
    throw new Error("Category not found");
  }

  // create candidate
  const candidate = await Candidate.create({
    ...data,
    election: electionId,
  });

  // attach to category
  election.categories[categoryIndex].nominees.push(candidate._id);
  await election.save();

  await AuditLog.create({
    user: user._id,
    action: "CANDIDATE_CREATE",
    targetType: "candidate",
    targetId: candidate._id,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  });

  emitActivity({
    title: `New candidate added: ${candidate.name}`,
    type: "candidate",
  });

  return candidate;
}

/**
 * REMOVE CANDIDATE
 */
async function removeCandidateService({
  electionId,
  categoryId,
  candidateId,
  user,
  req,
}) {
  const election = await Election.findById(electionId);
  if (!election) throw new Error("Election not found");

  if (
    election.createdBy.toString() !== user._id.toString() &&
    user.role !== "superadmin"
  ) {
    throw new Error("Access denied");
  }

  const categoryIndex = election.categories.findIndex(
    (cat) => cat._id.toString() === categoryId
  );

  if (categoryIndex === -1) {
    throw new Error("Category not found");
  }

  const candidateIndex =
    election.categories[categoryIndex].nominees.findIndex(
      (n) => n.toString() === candidateId
    );

  if (candidateIndex === -1) {
    throw new Error("Candidate not found in category");
  }

  const candidate = await Candidate.findById(candidateId);

  election.categories[categoryIndex].nominees.splice(candidateIndex, 1);
  await election.save();

  await Candidate.findByIdAndDelete(candidateId);

  await AuditLog.create({
    user: user._id,
    action: "CANDIDATE_DELETE",
    targetType: "candidate",
    targetId: candidateId,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  });

  emitActivity({
    title: `Candidate removed: ${candidate?.name || "Unknown"}`,
    type: "candidate",
  });

  return true;
}

/**
 * UPDATE CANDIDATE PROFILE
 */
async function updateCandidateService({ candidateId, updates, user, req }) {
  const candidate = await Candidate.findById(candidateId);
  if (!candidate) throw new Error("Candidate not found");

  const election = await Election.findById(candidate.election);

  if (
    election.createdBy.toString() !== user._id.toString() &&
    user.role !== "superadmin"
  ) {
    throw new Error("Access denied");
  }

  Object.assign(candidate, updates);
  await candidate.save();

  await AuditLog.create({
    user: user._id,
    action: "CANDIDATE_UPDATE",
    targetType: "candidate",
    targetId: candidateId,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  });

  emitActivity({
    title: `Candidate updated: ${candidate.name}`,
    type: "candidate",
  });

  return candidate;
}

/**
 * GET CANDIDATES BY ELECTION
 */
async function getCandidatesByElectionService(electionId) {
  const candidates = await Candidate.find({ election: electionId });

  return candidates.map((c) => ({
    id: c._id,
    name: c.name,
    photo: c.photo,
    voteCount: c.voteCount,
    votePercentage: c.votePercentage,
  }));
}

module.exports = {
  createCandidateService,
  removeCandidateService,
  updateCandidateService,
  getCandidatesByElectionService,
};