const { Election, Candidate, Vote, AuditLog } = require('../models');
const { getClientIP } = require('../utils');

const {
  emitElectionStatusChange,
  emitNewElection,
  emitActivity,
} = require('../utils/socketService');

/* ================= GET ALL ELECTIONS ================= */
const getAllElections = async (req, res) => {
  try {
    const { status, type, search, page = 1, limit = 10 } = req.query;

    let query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    if (!req.user || req.user.role === 'voter') {
      query.status = { $in: ['upcoming', 'active', 'closed'] };
      query['settings.publicAccess'] = true;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const elections = await Election.find(query)
      .populate('createdBy', 'firstName lastName')
      .populate('candidates', 'name photo voteCount votePercentage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Election.countDocuments(query);

    res.status(200).json({
      success: true,
      data: elections,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= GET ELECTION BY ID ================= */
const getElectionById = async (req, res) => {
  try {
    const { id } = req.params;

    const election = await Election.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .populate('candidates');

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    res.status(200).json({
      success: true,
      data: election,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= CREATE ELECTION ================= */
const createElection = async (req, res) => {
  try {
    const election = await Election.create({
      ...req.body,
      createdBy: req.user._id,
    });

    await election.populate('createdBy', 'firstName lastName');

    /* ================= REAL-TIME ================= */
    emitNewElection(election);

    emitActivity({
      type: "election",
      title: "New election created",
      electionId: election._id,
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_CREATE',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      details: { title: election.title },
    });

    res.status(201).json({
      success: true,
      message: 'Election created successfully',
      data: election,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= UPDATE ELECTION ================= */
const updateElection = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const election = await Election.findById(id);

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    const previousStatus = election.status;

    Object.assign(election, updates);
    await election.save();

    /* ================= REAL-TIME STATUS CHANGE ================= */
    if (updates.status && updates.status !== previousStatus) {
      emitElectionStatusChange(id, updates.status);

      emitActivity({
        type: "election",
        title: `Election status changed to ${updates.status}`,
        electionId: id,
      });
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_UPDATE',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      details: { changes: Object.keys(updates) },
    });

    res.status(200).json({
      success: true,
      message: 'Election updated successfully',
      data: election,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= DELETE ELECTION ================= */
const deleteElection = async (req, res) => {
  try {
    const { id } = req.params;

    const election = await Election.findById(id);

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    await Election.findByIdAndDelete(id);
    await Candidate.deleteMany({ election: id });
    await Vote.deleteMany({ election: id });

    emitActivity({
      type: "election",
      title: "Election deleted",
      electionId: id,
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_DELETE',
      targetType: 'election',
      targetId: id,
      ipAddress: getClientIP(req),
    });

    res.status(200).json({
      success: true,
      message: 'Election deleted successfully',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= BROADCAST ELECTION ================= */
const broadcastElection = async (req, res) => {
  try {
    const { id } = req.params;

    const election = await Election.findById(id);

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    if (election.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active elections can be broadcasted',
      });
    }

    election.broadcasted = true;
    election.broadcastedAt = new Date();
    election.settings.publicAccess = true;

    await election.save();

    emitElectionStatusChange(id, 'broadcasted');

    emitActivity({
      type: "election",
      title: "Election broadcasted live",
      electionId: id,
    });

    res.status(200).json({
      success: true,
      message: 'Election broadcasted successfully',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= LIVE ELECTIONS ================= */
const getLiveElections = async (req, res) => {
  try {
    const elections = await Election.find({
      status: 'active',
      broadcasted: true,
    }).populate('createdBy', 'firstName lastName');

    res.status(200).json({
      success: true,
      data: elections,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getAllElections,
  getElectionById,
  createElection,
  updateElection,
  deleteElection,
  broadcastElection,
  getLiveElections,
};