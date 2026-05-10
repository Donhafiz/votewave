const { Election, Candidate, Vote, AuditLog } = require("../models");
const { getClientIP } = require("../utils");

const {
  emitElectionStatusChange,
  emitNewElection,
  emitActivity,
} = require("../utils/socketService");

/* =========================================================
   GET ALL ELECTIONS
========================================================= */
const getAllElections = async (req, res) => {
  try {
    const { status, type, search, page = 1, limit = 10 } = req.query;

    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const elections = await Election.find(query)
      .populate("createdBy", "firstName lastName")
      .populate("candidates")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Election.countDocuments(query);

    res.json({
      success: true,
      data: elections,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   GET SINGLE ELECTION
========================================================= */
const getElectionById = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id)
      .populate("createdBy")
      .populate("candidates");

    if (!election) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({ success: true, data: election });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   CREATE ELECTION
========================================================= */
const createElection = async (req, res) => {
  try {
    const election = await Election.create({
      ...req.body,
      createdBy: req.user._id,
    });

    await election.populate("createdBy", "firstName lastName");

    emitNewElection(election);

    emitActivity({
      type: "election",
      title: "New election created",
      electionId: election._id,
    });

    await AuditLog.create({
      user: req.user._id,
      action: "CREATE_ELECTION",
      targetId: election._id,
      ipAddress: getClientIP(req),
    });

    res.status(201).json({ success: true, data: election });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   UPDATE ELECTION
========================================================= */
const updateElection = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);

    if (!election) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const prevStatus = election.status;

    Object.assign(election, req.body);
    await election.save();

    if (req.body.status && req.body.status !== prevStatus) {
      emitElectionStatusChange(election._id, req.body.status);
    }

    res.json({ success: true, data: election });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   DELETE ELECTION
========================================================= */
const deleteElection = async (req, res) => {
  try {
    await Election.findByIdAndDelete(req.params.id);
    await Candidate.deleteMany({ election: req.params.id });
    await Vote.deleteMany({ election: req.params.id });

    emitActivity({
      type: "election",
      title: "Election deleted",
      electionId: req.params.id,
    });

    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   PUBLIC RESULTS
========================================================= */
const getPublicResults = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id).populate(
      "candidates"
    );

    if (!election) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({
      success: true,
      data: {
        title: election.title,
        status: election.status,
        candidates: election.candidates,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   CATEGORY SYSTEM (SAFE FIXED VERSION)
========================================================= */
const addCategory = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false });

    election.categories = election.categories || [];

    const category = {
      _id: new Date().getTime().toString(),
      name: req.body.name,
      nominees: [],
    };

    election.categories.push(category);
    await election.save();

    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false });

    const cat = election.categories?.find(
      (c) => c._id === req.params.categoryId
    );

    if (!cat) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    cat.name = req.body.name || cat.name;

    await election.save();

    res.json({ success: true, data: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false });

    election.categories =
      election.categories?.filter((c) => c._id !== req.params.categoryId) || [];

    await election.save();

    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   NOMINEES (SAFE VERSION)
========================================================= */
const addNominee = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false });

    const cat = election.categories?.find(
      (c) => c._id === req.params.categoryId
    );

    if (!cat) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const nominee = {
      _id: new Date().getTime().toString(),
      name: req.body.name,
      photo: req.body.photo,
      votes: 0,
    };

    cat.nominees = cat.nominees || [];
    cat.nominees.push(nominee);

    await election.save();

    res.json({ success: true, data: nominee });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const removeNominee = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false });

    const cat = election.categories?.find(
      (c) => c._id === req.params.categoryId
    );

    if (!cat) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    cat.nominees =
      cat.nominees?.filter((n) => n._id !== req.params.nomineeId) || [];

    await election.save();

    res.json({ success: true, message: "Removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   LIVE / BROADCAST
========================================================= */
const broadcastElection = async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);

    if (!election) {
      return res.status(404).json({ success: false });
    }

    election.broadcasted = true;
    election.status = "active";

    await election.save();

    emitElectionStatusChange(election._id, "broadcasted");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getLiveElections = async (req, res) => {
  try {
    const data = await Election.find({
      status: "active",
      broadcasted: true,
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================================================
   EXPORTS
========================================================= */
module.exports = {
  getAllElections,
  getElectionById,
  createElection,
  updateElection,
  deleteElection,
  getPublicResults,
  addCategory,
  updateCategory,
  deleteCategory,
  addNominee,
  removeNominee,
  broadcastElection,
  getLiveElections,
};