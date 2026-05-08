const { generateElectionSummary, getAIInsights, detectAnomalies, chatWithVoter } = require('../utils/aiService');
const { Election, AuditLog } = require('../models');
const { getClientIP } = require('../utils');

const generateSummary = async (req, res) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId);
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

    const summary = await generateElectionSummary(electionId);

    await AuditLog.create({
      user: req.user._id,
      action: 'AI_REPORT_GENERATE',
      targetType: 'election',
      targetId: electionId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getInsights = async (req, res) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId);
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

    const insights = await getAIInsights(electionId);

    await AuditLog.create({
      user: req.user._id,
      action: 'AI_QUERY',
      targetType: 'election',
      targetId: electionId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { queryType: 'insights' },
    });

    res.status(200).json({
      success: true,
      data: { insights },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const checkAnomalies = async (req, res) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId);
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

    const anomalyData = await detectAnomalies(electionId);

    res.status(200).json({
      success: true,
      data: anomalyData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const chat = async (req, res) => {
  try {
    const { message, electionId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }

    const context = {
      electionId,
      userRole: req.user?.role || 'guest',
    };

    const response = await chatWithVoter(message, context);

    if (req.user) {
      await AuditLog.create({
        user: req.user._id,
        action: 'AI_QUERY',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        details: { 
          queryType: 'chat',
          electionId,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: { response },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  generateSummary,
  getInsights,
  checkAnomalies,
  chat,
};
