const { Vote, Election, Candidate, User, AuditLog } = require('../models');
const { 
  sendVoteConfirmation, 
  getClientIP, 
  emitVoteUpdate,
} = require('../utils');

const castVote = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { categoryId, candidateId } = req.body;
    const userId = req.user._id;

    if (!categoryId || !candidateId) {
      return res.status(400).json({
        success: false,
        message: 'Category ID and candidate ID are required',
      });
    }

    // Check if election exists and is active
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    if (election.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Election is not active',
      });
    }

    const now = new Date();
    if (now < election.startDate || now > election.endDate) {
      return res.status(400).json({
        success: false,
        message: 'Voting period has ended or not started',
      });
    }

    // Check if user is eligible
    if (!req.user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email to vote',
      });
    }

    const rules = election.eligibilityRules;
    if (rules.allowedRoles?.length > 0 && !rules.allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You are not eligible to vote in this election',
      });
    }

    // Check if user has already voted in this category
    const existingVote = await Vote.findOne({
      election: electionId,
      voter: userId,
      category: categoryId,
    });

    if (existingVote) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted in this category',
      });
    }

    // Verify category exists
    const category = election.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Verify candidate exists in the category
    if (!category.nominees.includes(candidateId)) {
      return res.status(400).json({
        success: false,
        message: 'Candidate not found in this category',
      });
    }

    // Check candidate exists
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found',
      });
    }

    // Create vote record (payment will be handled separately)
    const vote = await Vote.create({
      election: electionId,
      voter: userId,
      category: categoryId,
      candidate: candidateId,
      hashedSelection: require('crypto').createHash('sha256').update(`${candidateId}_${Date.now()}`).digest('hex'),
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    // Update election vote counts
    await Election.findByIdAndUpdate(electionId, {
      $inc: { totalVotes: 1 },
    });

    // Emit real-time update
    emitVoteUpdate(electionId, {
      totalVotes: election.totalVotes + 1,
      categoryId,
      candidateId,
    });

    // Send confirmation email
    try {
      await sendVoteConfirmation(req.user.email, {
        electionTitle: election.title,
        candidateName: candidate.name,
        confirmationCode: vote.confirmationCode,
        categoryName: category.name,
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    await AuditLog.create({
      user: userId,
      action: 'VOTE_CAST',
      targetType: 'vote',
      targetId: vote._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: {
        electionId,
        categoryId,
        candidateId,
        categoryName: category.name,
        candidateName: candidate.name,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Vote cast successfully',
      data: {
        voteId: vote._id,
        confirmationCode: vote.confirmationCode,
        category: category.name,
        candidate: candidate.name,
      },
    });
  } catch (error) {
    console.error('Vote casting error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyVote = async (req, res) => {
  try {
    const { confirmationCode } = req.params;

    const vote = await Vote.findOne({ confirmationCode })
      .populate('election', 'title status')
      .populate('candidate', 'name');

    if (!vote) {
      return res.status(404).json({
        success: false,
        message: 'Vote not found',
      });
    }

    // Check if user is authorized to view this vote
    if (vote.voter.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'VOTE_VERIFY',
      targetType: 'vote',
      targetId: vote._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      data: {
        confirmed: true,
        election: vote.election,
        votedAt: vote.votedAt,
        // Don't reveal candidate if anonymous
        ...(vote.isAnonymous ? {} : { candidate: vote.candidate }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getVoteStatus = async (req, res) => {
  try {
    const { electionId } = req.params;
    const userId = req.user._id;

    const vote = await Vote.findOne({
      voter: userId,
      election: electionId,
    });

    res.status(200).json({
      success: true,
      data: {
        hasVoted: !!vote,
        confirmationCode: vote?.confirmationCode || null,
        votedAt: vote?.votedAt || null,
      },
    });
  } catch (error) {
    res.status(500).json({
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
