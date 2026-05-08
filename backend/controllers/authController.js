const jwt = require('jsonwebtoken');
const { User, AuditLog } = require('../models');
const { 
  sendOTPEmail, 
  sendPasswordReset,
  generateOTP, 
  generateToken,
  getClientIP,
} = require('../utils');

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );

  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );

  return { accessToken, refreshToken };
};

const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
      });
    }

    // Check if this is the first user - make them admin
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: isFirstUser ? 'admin' : 'voter', // First user becomes admin
      otpCode: otp,
      otpExpires,
    });

    // Try to send email, but don't fail registration if email fails
    try {
      await sendOTPEmail(email, otp, firstName);
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError.message);
      // Continue - user can still verify with OTP shown in response
    }

    await AuditLog.create({
      user: user._id,
      action: 'REGISTER',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { email },
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: {
        userId: user._id,
        email: user.email,
        otp: otp, // Include OTP in response for development/testing when email fails
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId).select('+otpCode +otpExpires');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account already verified',
      });
    }

    if (user.otpCode !== otp) {
      await AuditLog.create({
        user: user._id,
        action: 'OTP_VERIFY',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        severity: 'warning',
        details: { success: false, reason: 'invalid_otp' },
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new one.',
      });
    }

    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);

    await AuditLog.create({
      user: user._id,
      action: 'OTP_VERIFY',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { success: true },
    });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const resendOTP = async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account already verified',
      });
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otpCode = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Try to send email, but don't fail if email service isn't configured
    try {
      await sendOTPEmail(user.email, otp, user.firstName);
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError.message);
      // Continue - user can still verify with OTP shown in response
    }

    await AuditLog.create({
      user: user._id,
      action: 'OTP_RESEND',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'New OTP sent successfully',
      data: {
        otp: otp, // Include OTP in response for development/testing when email fails
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const login = async (req, res) => {
  try {
    let { email, password } = req.body;
    email = typeof email === 'string' ? email.toLowerCase().trim() : email;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      await AuditLog.create({
        action: 'FAILED_LOGIN',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        severity: 'warning',
        details: { email, reason: 'user_not_found' },
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await AuditLog.create({
        user: user._id,
        action: 'FAILED_LOGIN',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        severity: 'warning',
        details: { reason: 'invalid_password' },
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
        code: 'EMAIL_NOT_VERIFIED',
        data: { userId: user._id },
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);

    await AuditLog.create({
      user: user._id,
      action: 'LOGIN',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          isVerified: user.isVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          notificationPreferences: user.notificationPreferences,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
    }

    const tokens = generateTokens(user._id);

    res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a reset email has been sent.',
      });
    }

    const resetToken = generateToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    await sendPasswordReset(email, user.firstName, resetToken);

    res.status(200).json({
      success: true,
      message: 'If an account exists, a reset email has been sent.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const logout = async (req, res) => {
  try {
    await AuditLog.create({
      user: req.user._id,
      action: 'LOGOUT',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('votingHistory.election', 'title status startDate endDate');

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        notificationPreferences: user.notificationPreferences,
        votingHistory: user.votingHistory,
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

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await AuditLog.create({
      user: user._id,
      action: 'PASSWORD_RESET',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const oauthCallback = async (req, res) => {
  try {
    const { accessToken, refreshToken } = generateTokens(req.user._id);

    // Log the OAuth login
    await AuditLog.create({
      user: req.user._id,
      action: 'OAUTH_LOGIN',
      details: `Logged in via ${req.user.googleId ? 'Google' : 'GitHub'}`,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/oauth-success.html?accessToken=${accessToken}&refreshToken=${refreshToken}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/auth/login.html?error=oauth_failed');
  }
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  logout,
  getMe,
  oauthCallback,
};
