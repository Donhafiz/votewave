const { User, Election, Vote, AuditLog } = require('../models');
const { getClientIP } = require('../utils');

const { emitDashboardUpdate } = require('../utils/socketService');

const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalElections = await Election.countDocuments();
    const activeElections = await Election.countDocuments({ status: 'active' });
    const totalVotes = await Vote.countDocuments();

    const stats = {
      totalUsers,
      totalElections,
      activeElections,
      totalVotes,
    };

    /* ================= REAL-TIME PUSH ================= */
    emitDashboardUpdate(stats);

    res.status(200).json({
      success: true,
      data: { stats },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Additional admin methods for complete functionality
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json({
      success: true,
      data: { users },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    const user = await User.findByIdAndUpdate(
      userId, 
      updates, 
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    const user = await User.findByIdAndUpdate(
      userId, 
      { role }, 
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      userId, 
      { status: 'banned' }, 
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'User banned successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      userId, 
      { status: 'active' }, 
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'User unbanned successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find({})
      .sort({ timestamp: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      data: { logs },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getSystemSettings = async (req, res) => {
  try {
    // Return default system settings
    const settings = {
      maintenance: false,
      registrationEnabled: true,
      maxVotesPerUser: 1,
      sessionTimeout: 3600,
    };

    res.status(200).json({
      success: true,
      data: { settings },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    const settings = req.body;
    
    // In a real implementation, these would be stored in database
    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: { settings },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const exportResults = async (req, res) => {
  try {
    const { electionId, format = 'json' } = req.params;
    
    // Get election results
    const election = await Election.findById(electionId);
    const votes = await Vote.find({ electionId });

    if (format === 'csv') {
      // CSV export logic would go here
      res.setHeader('Content-Type', 'text/csv');
      res.send('CSV export not implemented yet');
    } else {
      // JSON export
      res.status(200).json({
        success: true,
        data: { election, votes },
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const activateElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findByIdAndUpdate(
      electionId, 
      { status: 'active' }, 
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: { election },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const closeElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findByIdAndUpdate(
      electionId, 
      { status: 'closed' }, 
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: { election },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const assignElectionAdmin = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { userId } = req.body;
    
    const election = await Election.findByIdAndUpdate(
      electionId, 
      { $push: { admins: userId } }, 
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: { election },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const removeElectionAdmin = async (req, res) => {
  try {
    const { electionId, userId } = req.params;
    
    const election = await Election.findByIdAndUpdate(
      electionId, 
      { $pull: { admins: userId } }, 
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: { election },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getElectionMonitoringData = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    // Get monitoring data for the election
    const election = await Election.findById(electionId);
    const voteCount = await Vote.countDocuments({ electionId });

    const monitoringData = {
      election,
      voteCount,
      timestamp: new Date(),
    };

    res.status(200).json({
      success: true,
      data: { monitoringData },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  updateUserRole,
  banUser,
  unbanUser,
  deleteUser,
  getAuditLogs,
  getSystemSettings,
  updateSystemSettings,
  exportResults,
  activateElection,
  closeElection,
  assignElectionAdmin,
  removeElectionAdmin,
  getElectionMonitoringData,
};
