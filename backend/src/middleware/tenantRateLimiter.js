const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class TenantRateLimiter extends EventEmitter {
  constructor() {
    super();
    this.windows = new Map();
    this.blockedTenants = new Map();
    this.blockedUsers = new Map();
    this.defaultLimits = {
      auth: { windowMs: 15 * 60 * 1000, max: 5 }, // 15 minutes, 5 attempts
      voting: { windowMs: 60 * 1000, max: 10 }, // 1 minute, 10 votes
      api: { windowMs: 60 * 1000, max: 100 }, // 1 minute, 100 requests
      websocket: { windowMs: 60 * 1000, max: 50 }, // 1 minute, 50 connections
      upload: { windowMs: 60 * 1000, max: 5 }, // 1 minute, 5 uploads
      admin: { windowMs: 60 * 1000, max: 50 } // 1 minute, 50 admin actions
    };
    
    this.startCleanup();
  }

  // Rate limiting middleware
  rateLimit(type, options = {}) {
    const limits = { ...this.defaultLimits[type], ...options };
    
    return async (req, res, next) => {
      try {
        const identifier = this.getIdentifier(req, type);
        const tenantId = req.user?.tenantId || 'anonymous';
        const userId = req.user?.id || 'anonymous';
        
        // Check if tenant is blocked
        if (this.isTenantBlocked(tenantId)) {
          logger.warn('Tenant blocked', {
            tenantId,
            type,
            ip: req.ip
          });
          
          return res.status(429).json({
            success: false,
            message: 'Tenant temporarily blocked',
            error: 'TENANT_BLOCKED',
            retryAfter: this.getBlockedTenantInfo(tenantId).remainingTime
          });
        }
        
        // Check if user is blocked
        if (this.isUserBlocked(userId)) {
          logger.warn('User blocked', {
            userId,
            tenantId,
            type,
            ip: req.ip
          });
          
          return res.status(429).json({
            success: false,
            message: 'User temporarily blocked',
            error: 'USER_BLOCKED',
            retryAfter: this.getBlockedUserInfo(userId).remainingTime
          });
        }
        
        // Check rate limit
        const result = await this.checkRateLimit(tenantId, userId, type, limits);
        
        if (!result.allowed) {
          logger.warn('Rate limit exceeded', {
            tenantId,
            userId,
            type,
            current: result.current,
            limit: limits.max,
            windowMs: limits.windowMs,
            ip: req.ip
          });
          
          // Track repeated violations
          await this.trackViolation(tenantId, userId, type);
          
          return res.status(429).json({
            success: false,
            message: `Rate limit exceeded for ${type}`,
            error: 'RATE_LIMIT_EXCEEDED',
            retryAfter: result.retryAfter,
            limit: limits.max,
            current: result.current,
            windowMs: limits.windowMs
          });
        }
        
        // Record successful request
        await this.recordRequest(tenantId, userId, type);
        
        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': limits.max,
          'X-RateLimit-Remaining': Math.max(0, limits.max - (result.current + 1)),
          'X-RateLimit-Reset': new Date(Date.now() + limits.windowMs).toISOString()
        });
        
        next();
        
      } catch (error) {
        logger.error('Rate limiting error', {
          type,
          error: error.message,
          ip: req.ip
        });
        
        // Fail open - allow request if rate limiting fails
        next();
      }
    };
  }

  // Get identifier for rate limiting
  getIdentifier(req, type) {
    switch (type) {
      case 'auth':
        return req.ip; // Rate limit by IP for auth
      case 'voting':
        return req.user?.id || req.ip; // Rate limit by user, fallback to IP
      case 'api':
        return req.user?.id || req.ip; // Rate limit by user, fallback to IP
      case 'websocket':
        return req.user?.id || req.ip; // Rate limit by user, fallback to IP
      case 'upload':
        return req.user?.id || req.ip; // Rate limit by user, fallback to IP
      case 'admin':
        return req.user?.id || req.ip; // Rate limit by user, fallback to IP
      default:
        return req.ip;
    }
  }

  // Check rate limit
  async checkRateLimit(tenantId, userId, type, limits) {
    const now = Date.now();
    const windowStart = now - limits.windowMs;
    const key = `rate_limit:${type}:${tenantId}:${userId}`;
    
    try {
      // Get current requests in window
      const requests = await redis.zrangebyscore(key, windowStart, now);
      const current = requests.length;
      
      return {
        allowed: current < limits.max,
        current,
        limit: limits.max,
        windowMs: limits.windowMs,
        retryAfter: Math.ceil((windowStart + limits.windowMs - now) / 1000)
      };
      
    } catch (error) {
      logger.error('Failed to check rate limit', {
        tenantId,
        userId,
        type,
        error: error.message
      });
      
      // Allow request if rate limiting fails
      return {
        allowed: true,
        current: 0,
        limit: limits.max,
        windowMs: limits.windowMs,
        retryAfter: 0
      };
    }
  }

  // Record request
  async recordRequest(tenantId, userId, type) {
    const now = Date.now();
    const key = `rate_limit:${type}:${tenantId}:${userId}`;
    
    try {
      // Add current request to sorted set
      await redis.zadd(key, now, now.toString());
      
      // Remove old requests outside window
      const limits = this.defaultLimits[type];
      const windowStart = now - limits.windowMs;
      await redis.zremrangebyscore(key, '-inf', windowStart);
      
      // Set expiry for the key
      await redis.expire(key, Math.ceil(limits.windowMs / 1000));
      
    } catch (error) {
      logger.error('Failed to record request', {
        tenantId,
        userId,
        type,
        error: error.message
      });
    }
  }

  // Track violations
  async trackViolation(tenantId, userId, type) {
    const now = Date.now();
    const violationKey = `violations:${type}:${tenantId}:${userId}`;
    
    try {
      // Add violation
      await redis.lpush(violationKey, now.toString());
      
      // Keep only last 10 violations
      await redis.ltrim(violationKey, 0, 9);
      
      // Set expiry
      await redis.expire(violationKey, 60 * 60); // 1 hour
      
      // Check if should block
      const violations = await redis.lrange(violationKey, 0, -1);
      const recentViolations = violations.filter(v => 
        now - parseInt(v) < 5 * 60 * 1000 // Last 5 minutes
      ).length;
      
      // Block after 3 violations in 5 minutes
      if (recentViolations >= 3) {
        if (userId !== 'anonymous') {
          await this.blockUser(userId, 15 * 60 * 1000); // 15 minutes
        } else {
          await this.blockTenant(tenantId, 10 * 60 * 1000); // 10 minutes for anonymous
        }
      }
      
    } catch (error) {
      logger.error('Failed to track violation', {
        tenantId,
        userId,
        type,
        error: error.message
      });
    }
  }

  // Block user
  async blockUser(userId, duration = 15 * 60 * 1000) {
    const blockKey = `blocked_user:${userId}`;
    const blockInfo = {
      blockedAt: Date.now(),
      duration,
      reason: 'Rate limit violations',
      unblockAt: Date.now() + duration
    };
    
    try {
      await redis.setex(blockKey, Math.ceil(duration / 1000), JSON.stringify(blockInfo));
      
      this.blockedUsers.set(userId, blockInfo);
      
      logger.warn('User blocked due to rate limit violations', {
        userId,
        duration: `${duration / 1000}s`,
        unblockAt: new Date(blockInfo.unblockAt).toISOString()
      });
      
      this.emit('userBlocked', { userId, blockInfo });
      
    } catch (error) {
      logger.error('Failed to block user', {
        userId,
        error: error.message
      });
    }
  }

  // Block tenant
  async blockTenant(tenantId, duration = 10 * 60 * 1000) {
    const blockKey = `blocked_tenant:${tenantId}`;
    const blockInfo = {
      blockedAt: Date.now(),
      duration,
      reason: 'Excessive rate limit violations',
      unblockAt: Date.now() + duration
    };
    
    try {
      await redis.setex(blockKey, Math.ceil(duration / 1000), JSON.stringify(blockInfo));
      
      this.blockedTenants.set(tenantId, blockInfo);
      
      logger.warn('Tenant blocked due to rate limit violations', {
        tenantId,
        duration: `${duration / 1000}s`,
        unblockAt: new Date(blockInfo.unblockAt).toISOString()
      });
      
      this.emit('tenantBlocked', { tenantId, blockInfo });
      
    } catch (error) {
      logger.error('Failed to block tenant', {
        tenantId,
        error: error.message
      });
    }
  }

  // Check if user is blocked
  isUserBlocked(userId) {
    const blockInfo = this.blockedUsers.get(userId);
    
    if (!blockInfo) {
      return false;
    }
    
    const now = Date.now();
    
    if (now > blockInfo.unblockAt) {
      this.blockedUsers.delete(userId);
      return false;
    }
    
    return true;
  }

  // Check if tenant is blocked
  isTenantBlocked(tenantId) {
    const blockInfo = this.blockedTenants.get(tenantId);
    
    if (!blockInfo) {
      return false;
    }
    
    const now = Date.now();
    
    if (now > blockInfo.unblockAt) {
      this.blockedTenants.delete(tenantId);
      return false;
    }
    
    return true;
  }

  // Get blocked user info
  getBlockedUserInfo(userId) {
    const blockInfo = this.blockedUsers.get(userId);
    
    if (!blockInfo) {
      return null;
    }
    
    const now = Date.now();
    const remainingTime = Math.max(0, blockInfo.unblockAt - now);
    
    return {
      ...blockInfo,
      remainingTime: Math.ceil(remainingTime / 1000),
      isBlocked: remainingTime > 0
    };
  }

  // Get blocked tenant info
  getBlockedTenantInfo(tenantId) {
    const blockInfo = this.blockedTenants.get(tenantId);
    
    if (!blockInfo) {
      return null;
    }
    
    const now = Date.now();
    const remainingTime = Math.max(0, blockInfo.unblockAt - now);
    
    return {
      ...blockInfo,
      remainingTime: Math.ceil(remainingTime / 1000),
      isBlocked: remainingTime > 0
    };
  }

  // Unblock user
  async unblockUser(userId) {
    const blockKey = `blocked_user:${userId}`;
    
    try {
      await redis.del(blockKey);
      this.blockedUsers.delete(userId);
      
      logger.info('User unblocked', { userId });
      
      this.emit('userUnblocked', { userId });
      
      return { success: true, userId };
      
    } catch (error) {
      logger.error('Failed to unblock user', {
        userId,
        error: error.message
      });
      
      return { success: false, error: error.message };
    }
  }

  // Unblock tenant
  async unblockTenant(tenantId) {
    const blockKey = `blocked_tenant:${tenantId}`;
    
    try {
      await redis.del(blockKey);
      this.blockedTenants.delete(tenantId);
      
      logger.info('Tenant unblocked', { tenantId });
      
      this.emit('tenantUnblocked', { tenantId });
      
      return { success: true, tenantId };
      
    } catch (error) {
      logger.error('Failed to unblock tenant', {
        tenantId,
        error: error.message
      });
      
      return { success: false, error: error.message };
    }
  }

  // Get rate limit statistics
  async getRateLimitStats(tenantId = null, userId = null) {
    try {
      const stats = {
        types: {},
        blockedTenants: this.blockedTenants.size,
        blockedUsers: this.blockedUsers.size,
        timestamp: new Date().toISOString()
      };
      
      for (const [type, limits] of Object.entries(this.defaultLimits)) {
        const key = `rate_limit:${type}:${tenantId || '*'}:${userId || '*'}`;
        
        // Get current usage for each type
        const now = Date.now();
        const windowStart = now - limits.windowMs;
        
        if (tenantId && userId) {
          const requests = await redis.zrangebyscore(key, windowStart, now);
          stats.types[type] = {
            current: requests.length,
            limit: limits.max,
            windowMs: limits.windowMs,
            remaining: Math.max(0, limits.max - requests.length)
          };
        } else {
          // Get aggregate stats
          const pattern = `rate_limit:${type}:*`;
          const keys = await redis.keys(pattern);
          let totalRequests = 0;
          
          for (const key of keys) {
            const requests = await redis.zrangebyscore(key, windowStart, now);
            totalRequests += requests.length;
          }
          
          stats.types[type] = {
            current: totalRequests,
            limit: limits.max,
            windowMs: limits.windowMs,
            keys: keys.length
          };
        }
      }
      
      return {
        success: true,
        ...stats
      };
      
    } catch (error) {
      logger.error('Failed to get rate limit statistics', {
        tenantId,
        userId,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Reset rate limits
  async resetRateLimits(tenantId = null, userId = null, type = null) {
    try {
      let pattern = 'rate_limit:*';
      
      if (type) {
        pattern = `rate_limit:${type}:*`;
      }
      
      if (tenantId) {
        pattern = pattern.replace('*', `${tenantId}:*`);
      }
      
      if (userId) {
        pattern = pattern.replace('*', userId);
      }
      
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(...keys);
        
        logger.info('Rate limits reset', {
          pattern,
          keysDeleted: keys.length,
          tenantId,
          userId,
          type
        });
      }
      
      return {
        success: true,
        keysDeleted: keys.length
      };
      
    } catch (error) {
      logger.error('Failed to reset rate limits', {
        tenantId,
        userId,
        type,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Start cleanup process
  startCleanup() {
    setInterval(async () => {
      await this.cleanupExpiredBlocks();
    }, 60 * 1000); // Check every minute

    logger.info('Rate limiter cleanup process started');
  }

  // Clean up expired blocks
  async cleanupExpiredBlocks() {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Clean up expired user blocks
    for (const [userId, blockInfo] of this.blockedUsers) {
      if (now > blockInfo.unblockAt) {
        this.blockedUsers.delete(userId);
        cleanedCount++;
      }
    }
    
    // Clean up expired tenant blocks
    for (const [tenantId, blockInfo] of this.blockedTenants) {
      if (now > blockInfo.unblockAt) {
        this.blockedTenants.delete(tenantId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('Expired blocks cleaned up', {
        cleanedCount
      });
    }
  }

  // Get configuration
  getConfiguration() {
    return {
      defaultLimits: this.defaultLimits,
      blockedTenants: Array.from(this.blockedTenants.keys()),
      blockedUsers: Array.from(this.blockedUsers.keys()),
      timestamp: new Date().toISOString()
    };
  }

  // Update configuration
  updateConfiguration(config) {
    if (config.defaultLimits) {
      Object.assign(this.defaultLimits, config.defaultLimits);
    }
    
    logger.info('Rate limiter configuration updated', {
      config: this.getConfiguration()
    });
  }
}

// Create singleton instance
const tenantRateLimiter = new TenantRateLimiter();

module.exports = tenantRateLimiter;
