const { User, AuditLog, Election, Vote } = require('../models');
const { getClientIP, maskEmail } = require('../utils');
const cloudinary = require('../config/cloudinary');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('votingHistory.election', 'title status startDate endDate bannerImage');

    // Get detailed voting history with candidate info
    const votingHistoryWithDetails = await Promise.all(
      user.votingHistory.map(async (history) => {
        const vote = await Vote.findOne({
          voter: user._id,
          election: history.election._id,
        }).populate('candidate', 'name photo');

        return {
          ...history.toObject(),
          vote: vote
            ? {
                confirmationCode: vote.confirmationCode,
                votedAt: vote.votedAt,
                candidate: vote.isAnonymous ? null : vote.candidate,
              }
            : null,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        isVerified: user.isVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        notificationPreferences: user.notificationPreferences,
        votingHistory: votingHistoryWithDetails,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['firstName', 'lastName', 'notificationPreferences'];

    // Filter only allowed fields
    const filteredUpdates = {};
    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      filteredUpdates,
      { new: true, runValidators: true }
    );

    await AuditLog.create({
      user: req.user._id,
      action: 'PROFILE_UPDATE',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { changes: Object.keys(filteredUpdates) },
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatar: user.avatar,
        notificationPreferences: user.notificationPreferences,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const user = await User.findById(req.user._id);

    // Delete old avatar if exists
    if (user.avatar) {
      const publicId = user.avatar.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`votewave/avatars/${publicId}`);
    }

    // Upload new avatar
    const result = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
      {
        folder: 'votewave/avatars',
        public_id: `avatar-${req.user._id}-${Date.now()}`,
        transformation: [
          { width: 400, height: 400, crop: 'fill' },
          { quality: 'auto' },
        ],
      }
    );

    user.avatar = result.secure_url;
    await user.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'PROFILE_UPDATE',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { updatedField: 'avatar' },
    });

    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: { avatar: user.avatar },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'PASSWORD_CHANGE',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      severity: 'warning',
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getVotingHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const votes = await Vote.find({ voter: req.user._id })
      .populate('election', 'title description status startDate endDate bannerImage')
      .populate('candidate', 'name photo')
      .sort({ votedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Vote.countDocuments({ voter: req.user._id });

    const formattedVotes = votes.map((vote) => ({
      id: vote._id,
      election: vote.election,
      confirmationCode: vote.confirmationCode,
      votedAt: vote.votedAt,
      candidate: vote.isAnonymous ? null : vote.candidate,
      isAnonymous: vote.isAnonymous,
    }));

    res.status(200).json({
      success: true,
      data: formattedVotes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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
  getProfile,
  updateProfile,
  uploadAvatar,
  changePassword,
  getVotingHistory,
};
