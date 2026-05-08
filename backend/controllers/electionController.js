const { Election, Candidate, Vote, AuditLog } = require('../models');
const { getClientIP, formatDate, calculateTimeRemaining } = require('../utils');
const { emitElectionStatusChange, emitNewElection } = require('../utils/socketService');

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

    // If user is not admin, only show active/upcoming/closed elections
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

    const electionsWithMetadata = elections.map(election => ({
      ...election.toJSON(),
      timeRemaining: election.timeRemaining,
      isEligible: req.user ? checkEligibility(req.user, election) : false,
      hasVoted: req.user ? checkHasVoted(req.user._id, election._id) : false,
    }));

    res.status(200).json({
      success: true,
      data: electionsWithMetadata,
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

const getElectionById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid election ID format',
      });
    }

    const election = await Election.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .populate('candidates');

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check access permissions
    if (election.status === 'draft' && 
        (!req.user || (election.createdBy._id.toString() !== req.user._id.toString() && req.user.role !== 'superadmin'))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    let results = null;
    if (election.status === 'closed' && election.settings.showResultsAfterClose) {
      results = await getElectionResults(id);
    }

    res.status(200).json({
      success: true,
      data: {
        ...election.toJSON(),
        timeRemaining: election.timeRemaining,
        isEligible: req.user ? checkEligibility(req.user, election) : false,
        hasVoted: req.user ? await checkHasVoted(req.user._id, election._id) : false,
        results,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const createElection = async (req, res) => {
  try {
    const electionData = {
      ...req.body,
      createdBy: req.user._id,
    };

    const election = await Election.create(electionData);
    await election.populate('createdBy', 'firstName lastName');

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_CREATE',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { title: election.title },
    });

    emitNewElection(election);

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

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Prevent changing certain fields if election is active
    if (election.status === 'active') {
      delete updates.startDate;
      delete updates.candidates;
    }

    const previousStatus = election.status;
    Object.assign(election, updates);
    await election.save();

    // Emit status change if applicable
    if (updates.status && updates.status !== previousStatus) {
      emitElectionStatusChange(id, updates.status);
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_UPDATE',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { 
        title: election.title,
        changes: Object.keys(updates),
      },
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

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Prevent deleting active elections with votes
    if (election.totalVotes > 0 && election.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an active election with votes',
      });
    }

    await Election.findByIdAndDelete(id);
    await Candidate.deleteMany({ election: id });
    await Vote.deleteMany({ election: id });

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_DELETE',
      targetType: 'election',
      targetId: id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { title: election.title },
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

// Category Management
const addCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, maxVotes, required } = req.body;

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const newCategory = {
      name,
      description,
      maxVotes: maxVotes || 1,
      required: required !== undefined ? required : true,
      nominees: [],
    };

    election.categories.push(newCategory);
    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'CATEGORY_ADD',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { categoryName: name },
    });

    res.status(201).json({
      success: true,
      message: 'Category added successfully',
      data: election.categories[election.categories.length - 1],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id, categoryId } = req.params;
    const updates = req.body;

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const categoryIndex = election.categories.findIndex(cat => cat._id.toString() === categoryId);
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    Object.assign(election.categories[categoryIndex], updates);
    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'CATEGORY_UPDATE',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { categoryName: election.categories[categoryIndex].name, changes: Object.keys(updates) },
    });

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: election.categories[categoryIndex],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id, categoryId } = req.params;

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const categoryIndex = election.categories.findIndex(cat => cat._id.toString() === categoryId);
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const categoryName = election.categories[categoryIndex].name;
    election.categories.splice(categoryIndex, 1);
    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'CATEGORY_DELETE',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { categoryName },
    });

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const addNominee = async (req, res) => {
  try {
    const { id, categoryId } = req.params;
    const nomineeData = req.body;

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const categoryIndex = election.categories.findIndex(cat => cat._id.toString() === categoryId);
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Create candidate
    const candidate = await Candidate.create({
      ...nomineeData,
      election: id,
    });

    election.categories[categoryIndex].nominees.push(candidate._id);
    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'NOMINEE_ADD',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { categoryName: election.categories[categoryIndex].name, nomineeName: candidate.name },
    });

    res.status(201).json({
      success: true,
      message: 'Nominee added successfully',
      data: candidate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const removeNominee = async (req, res) => {
  try {
    const { id, categoryId, nomineeId } = req.params;

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const categoryIndex = election.categories.findIndex(cat => cat._id.toString() === categoryId);
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const nomineeIndex = election.categories[categoryIndex].nominees.findIndex(nom => nom.toString() === nomineeId);
    if (nomineeIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Nominee not found in category',
      });
    }

    const candidate = await Candidate.findById(nomineeId);
    const nomineeName = candidate ? candidate.name : 'Unknown';

    election.categories[categoryIndex].nominees.splice(nomineeIndex, 1);
    await election.save();

    // Optionally delete the candidate if not used elsewhere
    await Candidate.findByIdAndDelete(nomineeId);

    await AuditLog.create({
      user: req.user._id,
      action: 'NOMINEE_REMOVE',
      targetType: 'election',
      targetId: election._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { categoryName: election.categories[categoryIndex].name, nomineeName },
    });

    res.status(200).json({
      success: true,
      message: 'Nominee removed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getElectionResults = async (electionId) => {
  const election = await Election.findById(electionId).populate('candidates');
  
  if (!election) {
    throw new Error('Election not found');
  }

  const candidates = election.candidates.map(c => ({
    id: c._id,
    name: c.name,
    photo: c.photo,
    votes: c.voteCount,
    percentage: parseFloat(c.votePercentage),
  }));

  const totalVotes = election.totalVotes;
  const uniqueVoters = election.uniqueVoters;

  // Calculate statistics
  const sortedCandidates = [...candidates].sort((a, b) => b.votes - a.votes);
  const winner = sortedCandidates[0]?.votes > 0 ? sortedCandidates[0] : null;

  // Vote distribution over time (simplified)
  const votes = await Vote.find({ election: electionId }).sort({ votedAt: 1 });
  const hourlyDistribution = {};
  
  votes.forEach(vote => {
    const hour = new Date(vote.votedAt).toISOString().slice(0, 13);
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
  });

  return {
    candidates,
    totalVotes,
    uniqueVoters,
    winner,
    turnout: election.uniqueVoters, // Calculate based on eligible voters if available
    hourlyDistribution,
    aiSummary: election.aiSummary,
  };
};

const getPublicResults = async (req, res) => {
  try {
    const { id } = req.params;

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    if (election.status !== 'closed' || !election.settings.showResultsAfterClose) {
      return res.status(403).json({
        success: false,
        message: 'Results not available yet',
      });
    }

    const results = await getElectionResults(id);

    res.status(200).json({
      success: true,
      data: {
        election: {
          id: election._id,
          title: election.title,
          description: election.description,
          startDate: election.startDate,
          endDate: election.endDate,
        },
        results,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper functions
const checkEligibility = (user, election) => {
  if (election.status !== 'active') return false;
  if (!user.isVerified) return false;
  
  const rules = election.eligibilityRules;
  if (rules.allowedRoles?.length > 0 && !rules.allowedRoles.includes(user.role)) {
    return false;
  }
  
  return true;
};

const checkHasVoted = async (userId, electionId) => {
  const vote = await Vote.findOne({ voter: userId, election: electionId });
  return !!vote;
};

// Broadcast election (make it live on home page)
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

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Can only broadcast active elections
    if (election.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active elections can be broadcasted',
      });
    }

    // Check if election has categories and nominees
    if (!election.categories || election.categories.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Election must have at least one category with nominees before broadcasting',
      });
    }

    // Check if all required categories have nominees
    const hasRequiredCategoriesWithoutNominees = election.categories.some(cat =>
      cat.required && (!cat.nominees || cat.nominees.length === 0)
    );

    if (hasRequiredCategoriesWithoutNominees) {
      return res.status(400).json({
        success: false,
        message: 'All required categories must have at least one nominee before broadcasting',
      });
    }

    // Update election to broadcasted
    await Election.findByIdAndUpdate(id, {
      broadcasted: true,
      broadcastedAt: new Date(),
      'settings.publicAccess': true, // Make it publicly accessible
    });

    // Emit real-time update
    emitElectionStatusChange(id, 'broadcasted');

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_BROADCAST',
      targetType: 'election',
      targetId: id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { title: election.title },
    });

    res.status(200).json({
      success: true,
      message: 'Election broadcasted successfully and is now live on the home page',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get live elections for home page
const getLiveElections = async (req, res) => {
  try {
    const elections = await Election.find({
      status: 'active',
      broadcasted: true,
    })
    .populate('createdBy', 'firstName lastName')
    .populate({
      path: 'categories.nominees',
      model: 'Candidate',
      select: 'name photo bio position',
    })
    .sort({ broadcastedAt: -1 });

    const liveElections = elections.map(election => ({
      ...election.toJSON(),
      timeRemaining: election.timeRemaining,
      isEligible: req.user ? checkEligibility(req.user, election) : false,
      hasVoted: req.user ? checkHasVoted(req.user._id, election._id) : false,
    }));

    res.status(200).json({
      success: true,
      data: liveElections,
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
  addCategory,
  updateCategory,
  deleteCategory,
  addNominee,
  removeNominee,
  broadcastElection,
  getLiveElections,
  getElectionResults,
  getPublicResults,
};
