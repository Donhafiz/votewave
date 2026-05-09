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

module.exports = {
  getDashboardStats,
};