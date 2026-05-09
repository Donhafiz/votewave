const { Election, Candidate, Vote, AuditLog } = require("../models");
const { getClientIP } = require("../utils");

const {
  emitElectionCreated,
  emitElectionStatusChange,
  emitActivity,
} = require("../sockets/socketManager");

/**
 * GET ALL ELECTIONS (SERVICE LAYER)
 */
async function getAllElectionsService({ user, query }) {
  const { status, type, search, page = 1, limit = 10 } = query;

  let filter = {};

  if (status) filter.status = status;
  if (type) filter.type = type;

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { tags: { $in: [new RegExp(search, "i")] } },
    ];
  }

  // Non-admin restriction
  if (!user || user.role === "voter") {
    filter.status = { $in: ["active", "upcoming", "closed"] };
    filter["settings.publicAccess"] = true;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const elections = await Election.find(filter)
    .populate("createdBy", "firstName lastName")
    .populate("candidates", "name photo voteCount votePercentage")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Election.countDocuments(filter);

  return {
    elections,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

/**
 * GET ELECTION BY ID
 */
async function getElectionByIdService({ id, user }) {
  const election = await Election.findById(id)
    .populate("createdBy", "firstName lastName email")
    .populate("candidates");

  if (!election) throw new Error("Election not found");

  // Protect draft elections
  if (
    election.status === "draft" &&
    (!user ||
      (election.createdBy._id.toString() !== user._id.toString() &&
        user.role !== "superadmin"))
  ) {
    throw new Error("Access denied");
  }

  return election;
}

/**
 * CREATE ELECTION
 */
async function createElectionService({ data, user, req }) {
  const election = await Election.create({
    ...data,
    createdBy: user._id,
  });

  await election.populate("createdBy", "firstName lastName");

  // audit log
  await AuditLog.create({
    user: user._id,
    action: "ELECTION_CREATE",
    targetType: "election",
    targetId: election._id,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  });

  // real-time event
  emitElectionCreated(election);

  emitActivity({
    title: `Election created: ${election.title}`,
    type: "election",
  });

  return election;
}

/**
 * UPDATE ELECTION
 */
async function updateElectionService({ id, updates, user, req }) {
  const election = await Election.findById(id);
  if (!election) throw new Error("Election not found");

  // permission check
  if (
    election.createdBy.toString() !== user._id.toString() &&
    user.role !== "superadmin"
  ) {
    throw new Error("Access denied");
  }

  const previousStatus = election.status;

  // restrict updates when active
  if (election.status === "active") {
    delete updates.startDate;
    delete updates.candidates;
  }

  Object.assign(election, updates);
  await election.save();

  // status change event
  if (updates.status && updates.status !== previousStatus) {
    emitElectionStatusChange({
      electionId: id,
      status: updates.status,
    });
  }

  await AuditLog.create({
    user: user._id,
    action: "ELECTION_UPDATE",
    targetType: "election",
    targetId: id,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  });

  return election;
}

/**
 * DELETE ELECTION
 */
async function deleteElectionService({ id, user, req }) {
  const election = await Election.findById(id);
  if (!election) throw new Error("Election not found");

  if (
    election.createdBy.toString() !== user._id.toString() &&
    user.role !== "superadmin"
  ) {
    throw new Error("Access denied");
  }

  if (election.totalVotes > 0 && election.status === "active") {
    throw new Error("Cannot delete active election with votes");
  }

  await Election.findByIdAndDelete(id);
  await Candidate.deleteMany({ election: id });
  await Vote.deleteMany({ election: id });

  await AuditLog.create({
    user: user._id,
    action: "ELECTION_DELETE",
    targetType: "election",
    targetId: id,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  });

  emitActivity({
    title: `Election deleted`,
    type: "warning",
  });

  return true;
}

/**
 * GET LIVE ELECTIONS
 */
async function getLiveElectionsService({ user }) {
  const elections = await Election.find({
    status: "active",
    broadcasted: true,
  })
    .populate("createdBy", "firstName lastName")
    .populate("candidates");

  return elections.map((e) => ({
    ...e.toObject(),
    isEligible: !!user,
  }));
}

module.exports = {
  getAllElectionsService,
  getElectionByIdService,
  createElectionService,
  updateElectionService,
  deleteElectionService,
  getLiveElectionsService,
};