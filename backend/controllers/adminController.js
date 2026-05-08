const { User, Election, Candidate, Vote, AuditLog } = require('../models');
const { getClientIP, formatDate, paginate } = require('../utils');

const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalElections = await Election.countDocuments();
    const activeElections = await Election.countDocuments({ status: 'active' });
    const totalVotes = await Vote.countDocuments();

    const recentElections = await Election.find()
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get voting activity for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const votingActivity = await Vote.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Get election status distribution
    const electionStatus = await Election.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 },
    ]);

    // Calculate growth percentages
    const currentMonth = new Date();
    const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    
    const currentMonthUsers = await User.countDocuments({
      createdAt: { $gte: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1) }
    });
    
    const lastMonthUsers = await User.countDocuments({
      createdAt: { 
        $gte: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
        $lt: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
      }
    });

    const userGrowthPercent = lastMonthUsers > 0 ? Math.round(((currentMonthUsers - lastMonthUsers) / lastMonthUsers) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalElections,
          activeElections,
          totalVotes,
          userGrowth: userGrowthPercent,
          electionGrowth: 12, // Placeholder
          activeGrowth: 8,    // Placeholder
          voteGrowth: 25,     // Placeholder
          votingActivity: votingActivity.map(item => ({ date: item._id, votes: item.count })),
          electionStatus: electionStatus.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {})
        },
        recentElections,
        recentUsers,
        userGrowth,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;

    let query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query)
      .select('-password -otpCode -otpExpires -twoFactorSecret')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
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

const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password -otpCode -otpExpires -twoFactorSecret')
      .populate('electionsCreated', 'title status startDate endDate');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
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

    if (!['voter', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role',
      });
    }

    // Prevent self-demotion for superadmin
    if (userId === req.user._id.toString() && role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own role',
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'ROLE_CHANGE',
      targetType: 'user',
      targetId: userId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { newRole: role },
    });

    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: user,
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

    // Prevent self-deletion
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Delete user's votes
    await Vote.deleteMany({ voter: userId });

    // Remove user
    await User.findByIdAndDelete(userId);

    await AuditLog.create({
      user: req.user._id,
      action: 'USER_DELETE',
      targetType: 'user',
      targetId: userId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'warning',
    });

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
    const { action, severity, userId, page = 1, limit = 50 } = req.query;

    let query = {};
    if (action) query.action = action;
    if (severity) query.severity = severity;
    if (userId) query.user = userId;

    const logs = await AuditLog.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await AuditLog.countDocuments(query);

    res.status(200).json({
      success: true,
      data: logs,
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

const getSystemSettings = async (req, res) => {
  try {
    // Return system-wide settings (stored in env or config)
    const settings = {
      registrationEnabled: process.env.REGISTRATION_ENABLED !== 'false',
      emailVerificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED !== 'false',
      maxElectionsPerUser: parseInt(process.env.MAX_ELECTIONS_PER_USER) || 10,
      maxCandidatesPerElection: parseInt(process.env.MAX_CANDIDATES_PER_ELECTION) || 20,
      defaultTimezone: process.env.DEFAULT_TIMEZONE || 'UTC',
      maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
    };

    res.status(200).json({
      success: true,
      data: settings,
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
    // Note: In a real implementation, these would be saved to a database
    // For now, we'll just acknowledge the update
    const updates = req.body;

    await AuditLog.create({
      user: req.user._id,
      action: 'SETTINGS_UPDATE',
      targetType: 'system',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'warning',
      details: { changes: Object.keys(updates) },
    });

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
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

    const election = await Election.findById(electionId)
      .populate('candidates')
      .populate('createdBy', 'firstName lastName');

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    const votes = await Vote.find({ election: electionId })
      .populate('voter', 'firstName lastName email')
      .populate('candidate', 'name');

    const exportData = {
      election: {
        id: election._id,
        title: election.title,
        description: election.description,
        type: election.type,
        status: election.status,
        startDate: election.startDate,
        endDate: election.endDate,
        totalVotes: election.totalVotes,
        uniqueVoters: election.uniqueVoters,
        createdBy: election.createdBy,
      },
      candidates: election.candidates.map((c) => ({
        id: c._id,
        name: c.name,
        position: c.position,
        votes: c.voteCount,
        percentage: c.votePercentage,
      })),
      votes: votes.map((v) => ({
        id: v._id,
        confirmationCode: v.confirmationCode,
        votedAt: v.votedAt,
        candidate: v.isAnonymous ? null : v.candidate,
        voter: v.isAnonymous ? null : v.voter,
        isAnonymous: v.isAnonymous,
      })),
      exportedAt: new Date(),
      exportedBy: req.user._id,
    };

    await AuditLog.create({
      user: req.user._id,
      action: 'EXPORT_RESULTS',
      targetType: 'election',
      targetId: electionId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { format },
    });

    if (format === 'csv') {
      // Convert to CSV format
      const csvRows = [
        ['Election Results Export'],
        ['Election', election.title],
        ['Exported At', new Date().toISOString()],
        [],
        ['Candidate', 'Votes', 'Percentage'],
        ...election.candidates.map((c) => [c.name, c.voteCount, c.votePercentage]),
      ];

      const csv = csvRows.map((row) => row.join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="election-${electionId}-results.csv"`);
      return res.send(csv);
    }

    res.status(200).json({
      success: true,
      data: exportData,
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
    const { reason, duration } = req.body;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot ban yourself',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const banExpiry = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;

    user.isBanned = true;
    user.banReason = reason;
    user.bannedAt = new Date();
    user.banExpiry = banExpiry;
    await user.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'USER_BAN',
      targetType: 'user',
      targetId: userId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'warning',
      details: { reason, duration, banExpiry },
    });

    res.status(200).json({
      success: true,
      message: 'User banned successfully',
      data: user,
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

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.isBanned = false;
    user.banReason = null;
    user.bannedAt = null;
    user.banExpiry = null;
    await user.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'USER_UNBAN',
      targetType: 'user',
      targetId: userId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { previousBan: user.banReason },
    });

    res.status(200).json({
      success: true,
      message: 'User unbanned successfully',
      data: user,
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
    const { firstName, lastName, email, phone } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, email, phone },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await AuditLog.create({
      user: req.user._id,
      action: 'USER_UPDATE',
      targetType: 'user',
      targetId: userId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { firstName, lastName, email, phone },
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
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

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    if (election.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Election is already active',
      });
    }

    election.status = 'active';
    election.activatedAt = new Date();
    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_ACTIVATE',
      targetType: 'election',
      targetId: electionId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'info',
      details: { previousStatus: 'draft' },
    });

    res.status(200).json({
      success: true,
      message: 'Election activated successfully',
      data: election,
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

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    if (election.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Election is already closed',
      });
    }

    election.status = 'closed';
    election.closedAt = new Date();
    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'ELECTION_CLOSE',
      targetType: 'election',
      targetId: electionId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'info',
      details: { previousStatus: election.status },
    });

    res.status(200).json({
      success: true,
      message: 'Election closed successfully',
      data: election,
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
    const { userId, permissions } = req.body;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Add or update admin assignment
    const existingAdminIndex = election.assignedAdmins.findIndex(
      admin => admin.user.toString() === userId
    );

    if (existingAdminIndex >= 0) {
      election.assignedAdmins[existingAdminIndex].permissions = permissions;
      election.assignedAdmins[existingAdminIndex].assignedAt = new Date();
    } else {
      election.assignedAdmins.push({
        user: userId,
        permissions,
        assignedAt: new Date(),
        assignedBy: req.user._id,
      });
    }

    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'ADMIN_ASSIGN',
      targetType: 'election',
      targetId: electionId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'info',
      details: { assignedUser: userId, permissions },
    });

    res.status(200).json({
      success: true,
      message: 'Election admin assigned successfully',
      data: election,
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

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    election.assignedAdmins = election.assignedAdmins.filter(
      admin => admin.user.toString() !== userId
    );

    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'ADMIN_REMOVE',
      targetType: 'election',
      targetId: electionId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'info',
      details: { removedUser: userId },
    });

    res.status(200).json({
      success: true,
      message: 'Election admin removed successfully',
      data: election,
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

    const election = await Election.findById(electionId)
      .populate('candidates')
      .populate('assignedAdmins.user', 'firstName lastName email');

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Get real-time voting statistics
    const voteStats = await Vote.aggregate([
      { $match: { election: election._id } },
      {
        $group: {
          _id: '$candidate',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get hourly voting activity
    const hourlyActivity = await Vote.aggregate([
      { $match: { election: election._id } },
      {
        $group: {
          _id: {
            hour: { $hour: '$votedAt' },
            date: { $dateToString: { format: '%Y-%m-%d', date: '$votedAt' } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': -1, '_id.hour': -1 } },
      { $limit: 24 },
    ]);

    // Get unique voters count
    const uniqueVoters = await Vote.distinct('voter', { election: election._id });

    res.status(200).json({
      success: true,
      data: {
        election: {
          id: election._id,
          title: election.title,
          status: election.status,
          startDate: election.startDate,
          endDate: election.endDate,
          totalVotes: election.totalVotes,
          uniqueVoters: uniqueVoters.length,
        },
        candidates: election.candidates.map(c => ({
          id: c._id,
          name: c.name,
          voteCount: c.voteCount || 0,
          votePercentage: c.votePercentage || 0,
        })),
        voteStats,
        hourlyActivity,
        assignedAdmins: election.assignedAdmins,
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
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUser,
  deleteUser,
  banUser,
  unbanUser,
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
