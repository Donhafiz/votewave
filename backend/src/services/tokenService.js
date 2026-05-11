const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const User = require('../models/User');

class TokenService {
  constructor() {
    this.blacklist = new Set(); // Revoked tokens
    this.refreshTokens = new Map(); // Refresh token storage
    this.tokenRotationInterval = 60 * 60 * 1000; // 1 hour
    this.maxRefreshTokens = 5; // Max refresh tokens per user
  }

  generateTokens(payload) {
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '15m',
      issuer: 'votewave-api',
      audience: 'votewave-client'
    });

    const refreshToken = jwt.sign(
      { 
        type: 'refresh',
        userId: payload.userId,
        tokenVersion: Date.now().toString()
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60 // 15 minutes
    };
  }

  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'votewave-api',
        audience: 'votewave-client'
      });

      // Check if token is blacklisted
      if (this.blacklist.has(token)) {
        throw new Error('Token has been revoked');
      }

      // Check if user still exists and is active
      const user = await User.findById(decoded.userId);
      if (!user || user.status === 'banned') {
        throw new Error('User not found or banned');
      }

      return {
        valid: true,
        decoded,
        user: {
          id: user._id,
          email: user.email,
          role: user.role
        }
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('TOKEN_EXPIRED');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('TOKEN_INVALID');
      }
      throw new Error('TOKEN_VERIFICATION_FAILED');
    }
  }

  async revokeToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Add to blacklist
      this.blacklist.add(token);
      
      // Remove from refresh tokens
      this.refreshTokens.delete(decoded.jti);
      
      // Update user
      await User.findByIdAndUpdate(decoded.userId, {
        $push: { tokenRevoked: { token: token, timestamp: new Date() } }
      });

      logger.info('Token revoked', {
        userId: decoded.userId,
        tokenId: decoded.jti
      });

      return true;
    } catch (error) {
      logger.error('Failed to revoke token', { error: error.message });
      throw error;
    }
  }

  async refreshToken(refreshToken, oldAccessToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      
      // Check if refresh token is valid and not used
      if (decoded.type !== 'refresh') {
        throw new Error('INVALID_REFRESH_TOKEN');
      }

      // Check if old access token is blacklisted
      if (this.blacklist.has(oldAccessToken)) {
        throw new Error('OLD_TOKEN_REVOKED');
      }

      // Revoke old access token
      this.blacklist.add(oldAccessToken);

      // Generate new tokens
      const user = await User.findById(decoded.userId);
      const newTokens = this.generateTokens({
        userId: user._id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      });

      // Store refresh token
      this.refreshTokens.set(decoded.jti, {
        userId: user._id,
        expires: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
        accessToken: newTokens.accessToken
      });

      // Clean up old refresh tokens
      this.cleanupExpiredRefreshTokens();

      logger.info('Token refreshed', {
        userId: user._id,
        newTokenId: decoded.jti
      });

      return newTokens;
    } catch (error) {
      logger.error('Failed to refresh token', { error: error.message });
      throw error;
    }
  }

  cleanupExpiredRefreshTokens() {
    const now = Date.now();
    const expired = [];

    for (const [jti, token] of this.refreshTokens) {
      if (token.expires < now) {
        expired.push(jti);
        this.refreshTokens.delete(jti);
      }
    }

    if (expired.length > 0) {
      logger.info('Cleaned up expired refresh tokens', { count: expired.length });
    }
  }

  // Rate limiting for token operations
  checkTokenRateLimit(userId) {
    const userTokens = Array.from(this.refreshTokens.entries())
      .filter(([uid]) => uid === userId);

    return userTokens.length >= this.maxRefreshTokens;
  }

  async rotateSecret() {
    // This would be called by a scheduled job
    const oldSecret = process.env.JWT_SECRET;
    const newSecret = require('crypto').randomBytes(64).toString('hex');
    
    // Update environment (in production, this would be done securely)
    process.env.JWT_SECRET = newSecret;
    
    logger.warn('JWT secret rotated', {
      timestamp: new Date().toISOString()
    });

    return {
      oldSecret: oldSecret.substring(0, 8) + '...',
      newSecret: newSecret.substring(0, 8) + '...'
    };
  }

  getTokenInfo(token) {
    try {
      const decoded = jwt.decode(token);
      return {
        tokenId: decoded.jti,
        issuedAt: new Date(decoded.iat * 1000),
        expiresAt: new Date(decoded.exp * 1000),
        isExpired: Date.now() > decoded.exp * 1000
      };
    } catch (error) {
      return null;
    }
  }
}

module.exports = TokenService;
