const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class TenantRateLimit extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      windowMs: options.windowMs || 60000, // 1 minute
      maxRequests: options.maxRequests || 1000,
      keyPrefix: options.keyPrefix || 'rate_limit:',
      skipSuccessfulRequests: options.skipSuccessfulRequests || false,
      skipFailedRequests: options.skipFailedRequests || false,
      skip: options.skip || (() => false),
      onLimitReached: options.onLimitReached || null,
      ...options
    };

    // Default tenant configurations
    this.tenantConfigs = new Map();
    this.initializeDefaultConfigs();

    // Statistics
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      tenantStats: new Map()
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Initialize default tenant configurations
   */
  initializeDefaultConfigs() {
    // Default configuration for new tenants
    this.addTenantConfig('default', {
      windowMs: 60000, // 1 minute
      maxRequests: 1000,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      blockDurationMs: 300000, // 5 minutes
      alertThreshold: 0.8, // 80% of limit
      enableAlerts: true
    });

    // Premium tenant configuration
    this.addTenantConfig('premium', {
      windowMs: 60000, // 1 minute
      maxRequests: 5000,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      blockDurationMs: 300000, // 5 minutes
      alertThreshold: 0.8, // 80% of limit
      enableAlerts: true
    });

    // Enterprise tenant configuration
    this.addTenantConfig('enterprise', {
      windowMs: 60000, // 1 minute
      maxRequests: 10000,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      blockDurationMs: 300000, // 5 minutes
      alertThreshold: 0.8, // 80% of limit
      enableAlerts: true
    });

    // Trial tenant configuration
    this.addTenantConfig('trial', {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      blockDurationMs: 600000, // 10 minutes
      alertThreshold: 0.7, // 70% of limit
      enableAlerts: true
    });
  }

  /**
   * Add tenant configuration
   * @param {string} tenantId - Tenant ID
   * @param {Object} config - Tenant configuration
   */
  addTenantConfig(tenantId, config) {
    this.tenantConfigs.set(tenantId, {
      windowMs: config.windowMs || 60000,
      maxRequests: config.maxRequests || 1000,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      blockDurationMs: config.blockDurationMs || 300000,
      alertThreshold: config.alertThreshold || 0.8,
      enableAlerts: config.enableAlerts !== false,
      customRules: config.customRules || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    logger.info('Tenant rate limit configuration added', {
      tenantId,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs
    });
  }

  /**
   * Update tenant configuration
   * @param {string} tenantId - Tenant ID
   * @param {Object} updates - Configuration updates
   */
  updateTenantConfig(tenantId, updates) {
    const existingConfig = this.tenantConfigs.get(tenantId);
    
    if (!existingConfig) {
      this.addTenantConfig(tenantId, updates);
      return;
    }

    const updatedConfig = {
      ...existingConfig,
      ...updates,
      updatedAt: Date.now()
    };

    this.tenantConfigs.set(tenantId, updatedConfig);

    logger.info('Tenant rate limit configuration updated', {
      tenantId,
      updates: Object.keys(updates)
    });
  }

  /**
   * Get tenant configuration
   * @param {string} tenantId - Tenant ID
   * @returns {Object} - Tenant configuration
   */
  getTenantConfig(tenantId) {
    return this.tenantConfigs.get(tenantId) || this.tenantConfigs.get('default');
  }

  /**
   * Check rate limit for tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Rate limit check result
   */
  async checkRateLimit(tenantId, options = {}) {
    try {
      const config = this.getTenantConfig(tenantId);
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Check if tenant is blocked
      const blockKey = `${this.options.keyPrefix}block:${tenantId}`;
      const blockInfo = await this.redis.get(blockKey);
      
      if (blockInfo) {
        const blockData = JSON.parse(blockInfo);
        
        if (blockData.expiresAt > now) {
          this.stats.blockedRequests++;
          this.updateTenantStats(tenantId, 'blocked');
          
          return {
            allowed: false,
            blocked: true,
            remaining: 0,
            resetTime: blockData.expiresAt,
            blockReason: blockData.reason,
            blockDuration: config.blockDurationMs,
            tenantId
          };
        } else {
          // Block expired, remove it
          await this.redis.del(blockKey);
        }
      }

      // Get current request count
      const requestKey = `${this.options.keyPrefix}requests:${tenantId}`;
      const pipeline = this.redis.pipeline();
      
      // Remove expired entries
      pipeline.zremrangebyscore(requestKey, 0, windowStart);
      
      // Get current count
      pipeline.zcard(requestKey);
      
      // Add current request
      pipeline.zadd(requestKey, now, `${now}-${Math.random()}`);
      
      // Set expiration
      pipeline.expire(requestKey, Math.ceil(config.windowMs / 1000));
      
      const results = await pipeline.exec();
      const currentCount = results[1][1];

      // Check if limit exceeded
      if (currentCount >= config.maxRequests) {
        // Block the tenant
        await this.blockTenant(tenantId, 'Rate limit exceeded');
        
        this.stats.blockedRequests++;
        this.updateTenantStats(tenantId, 'blocked');
        
        // Emit limit reached event
        this.emit('limitReached', {
          tenantId,
          currentCount,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs,
          timestamp: now
        });

        return {
          allowed: false,
          blocked: false,
          remaining: 0,
          resetTime: now + config.windowMs,
          currentCount,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs,
          tenantId
        };
      }

      // Check if alert threshold reached
      const usageRatio = currentCount / config.maxRequests;
      if (config.enableAlerts && usageRatio >= config.alertThreshold) {
        this.emit('alertThresholdReached', {
          tenantId,
          currentCount,
          maxRequests: config.maxRequests,
          usageRatio,
          threshold: config.alertThreshold,
          timestamp: now
        });
      }

      this.stats.allowedRequests++;
      this.updateTenantStats(tenantId, 'allowed');

      return {
        allowed: true,
        blocked: false,
        remaining: config.maxRequests - currentCount,
        resetTime: now + config.windowMs,
        currentCount,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        usageRatio,
        tenantId
      };

    } catch (error) {
      logger.error('Rate limit check failed', {
        tenantId,
        error: error.message
      });
      
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        blocked: false,
        remaining: -1,
        error: error.message,
        tenantId
      };
    }
  }

  /**
   * Block tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} reason - Block reason
   */
  async blockTenant(tenantId, reason) {
    try {
      const config = this.getTenantConfig(tenantId);
      const now = Date.now();
      const blockKey = `${this.options.keyPrefix}block:${tenantId}`;
      
      const blockData = {
        tenantId,
        reason,
        blockedAt: now,
        expiresAt: now + config.blockDurationMs,
        blockDuration: config.blockDurationMs
      };

      await this.redis.setex(
        blockKey,
        Math.ceil(config.blockDurationMs / 1000),
        JSON.stringify(blockData)
      );

      logger.warn('Tenant blocked due to rate limiting', {
        tenantId,
        reason,
        blockDuration: config.blockDurationMs,
        expiresAt: blockData.expiresAt
      });

      this.emit('tenantBlocked', blockData);

    } catch (error) {
      logger.error('Failed to block tenant', {
        tenantId,
        reason,
        error: error.message
      });
    }
  }

  /**
   * Unblock tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>} - True if unblocked successfully
   */
  async unblockTenant(tenantId) {
    try {
      const blockKey = `${this.options.keyPrefix}block:${tenantId}`;
      const result = await this.redis.del(blockKey);
      
      if (result > 0) {
        logger.info('Tenant unblocked', { tenantId });
        this.emit('tenantUnblocked', { tenantId, timestamp: Date.now() });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to unblock tenant', {
        tenantId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get tenant statistics
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} - Tenant statistics
   */
  async getTenantStats(tenantId) {
    try {
      const config = this.getTenantConfig(tenantId);
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Get current request count
      const requestKey = `${this.options.keyPrefix}requests:${tenantId}`;
      const pipeline = this.redis.pipeline();
      
      // Remove expired entries
      pipeline.zremrangebyscore(requestKey, 0, windowStart);
      
      // Get current count
      pipeline.zcard(requestKey);
      
      // Get all requests in window
      pipeline.zrange(requestKey, 0, -1, 'WITHSCORES');
      
      const results = await pipeline.exec();
      const currentCount = results[1][1];
      const requests = results[2][1];

      // Check if blocked
      const blockKey = `${this.options.keyPrefix}block:${tenantId}`;
      const blockInfo = await this.redis.get(blockKey);
      const isBlocked = blockInfo ? JSON.parse(blockInfo) : null;

      // Calculate request distribution
      const requestTimes = requests.map(([_, timestamp]) => parseInt(timestamp));
      const distribution = this.calculateDistribution(requestTimes, config.windowMs);

      return {
        tenantId,
        currentCount,
        maxRequests: config.maxRequests,
        usageRatio: currentCount / config.maxRequests,
        remaining: Math.max(0, config.maxRequests - currentCount),
        windowMs: config.windowMs,
        isBlocked,
        config,
        distribution,
        timestamp: now
      };

    } catch (error) {
      logger.error('Failed to get tenant stats', {
        tenantId,
        error: error.message
      });
      
      return {
        tenantId,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get all tenant statistics
   * @returns {Promise<Array>} - Array of tenant statistics
   */
  async getAllTenantStats() {
    try {
      const tenantIds = Array.from(this.tenantConfigs.keys());
      const stats = await Promise.all(
        tenantIds.map(tenantId => this.getTenantStats(tenantId))
      );

      return stats.filter(stat => !stat.error);

    } catch (error) {
      logger.error('Failed to get all tenant stats', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Reset tenant rate limit
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>} - True if reset successfully
   */
  async resetTenantRateLimit(tenantId) {
    try {
      const requestKey = `${this.options.keyPrefix}requests:${tenantId}`;
      const result = await this.redis.del(requestKey);
      
      if (result > 0) {
        logger.info('Tenant rate limit reset', { tenantId });
        this.emit('tenantRateLimitReset', { tenantId, timestamp: Date.now() });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to reset tenant rate limit', {
        tenantId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Create Express middleware
   * @param {Object} options - Middleware options
   * @returns {Function} - Express middleware
   */
  middleware(options = {}) {
    return async (req, res, next) => {
      try {
        // Get tenant ID from request
        const tenantId = this.extractTenantId(req);
        
        if (!tenantId) {
          // No tenant ID, skip rate limiting
          return next();
        }

        // Check if request should be skipped
        if (this.options.skip(req)) {
          return next();
        }

        // Check rate limit
        const result = await this.checkRateLimit(tenantId, options);

        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': result.maxRequests,
          'X-RateLimit-Remaining': result.remaining,
          'X-RateLimit-Reset': result.resetTime,
          'X-RateLimit-Window': result.windowMs,
          'X-Tenant-ID': tenantId
        });

        if (!result.allowed) {
          // Rate limit exceeded
          res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            message: result.blocked 
              ? `Tenant blocked: ${result.blockReason}` 
              : 'Too many requests',
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
            tenantId,
            ...result
          });

          // Call custom handler if provided
          if (this.options.onLimitReached) {
            this.options.onLimitReached(req, res, result);
          }

          return;
        }

        // Add rate limit info to request
        req.rateLimit = result;
        req.tenantId = tenantId;

        next();

      } catch (error) {
        logger.error('Rate limit middleware error', {
          error: error.message,
          tenantId: req.tenantId
        });
        
        // Fail open - allow request if rate limiting fails
        next();
      }
    };
  }

  /**
   * Extract tenant ID from request
   * @param {Object} req - Express request
   * @returns {string|null} - Tenant ID
   */
  extractTenantId(req) {
    // Try to get tenant ID from various sources
    
    // From JWT token
    if (req.user && req.user.tenantId) {
      return req.user.tenantId;
    }

    // From request header
    if (req.headers['x-tenant-id']) {
      return req.headers['x-tenant-id'];
    }

    // From query parameter
    if (req.query.tenantId) {
      return req.query.tenantId;
    }

    // From subdomain
    if (req.hostname) {
      const subdomain = req.hostname.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        return subdomain;
      }
    }

    // From custom extraction logic
    if (req.tenantId) {
      return req.tenantId;
    }

    return null;
  }

  /**
   * Calculate request distribution
   * @param {Array} requestTimes - Array of request timestamps
   * @param {number} windowMs - Window size in milliseconds
   * @returns {Object} - Distribution data
   */
  calculateDistribution(requestTimes, windowMs) {
    if (requestTimes.length === 0) {
      return {
        perSecond: {},
        perMinute: {},
        total: 0
      };
    }

    const now = Date.now();
    const distribution = {
      perSecond: {},
      perMinute: {},
      total: requestTimes.length
    };

    // Calculate per-second distribution
    for (const timestamp of requestTimes) {
      const secondKey = Math.floor((timestamp - (now - windowMs)) / 1000);
      distribution.perSecond[secondKey] = (distribution.perSecond[secondKey] || 0) + 1;
    }

    // Calculate per-minute distribution
    for (const timestamp of requestTimes) {
      const minuteKey = Math.floor((timestamp - (now - windowMs)) / 60000);
      distribution.perMinute[minuteKey] = (distribution.perMinute[minuteKey] || 0) + 1;
    }

    return distribution;
  }

  /**
   * Update tenant statistics
   * @param {string} tenantId - Tenant ID
   * @param {string} action - Action (allowed/blocked)
   */
  updateTenantStats(tenantId, action) {
    if (!this.stats.tenantStats.has(tenantId)) {
      this.stats.tenantStats.set(tenantId, {
        allowed: 0,
        blocked: 0,
        total: 0
      });
    }

    const tenantStats = this.stats.tenantStats.get(tenantId);
    tenantStats[action]++;
    tenantStats.total++;
    this.stats.totalRequests++;
  }

  /**
   * Get overall statistics
   * @returns {Object} - Overall statistics
   */
  getStats() {
    const totalTenants = this.tenantConfigs.size;
    const blockedTenants = Array.from(this.stats.tenantStats.values())
      .filter(stats => stats.blocked > 0).length;

    return {
      totalRequests: this.stats.totalRequests,
      blockedRequests: this.stats.blockedRequests,
      allowedRequests: this.stats.allowedRequests,
      blockRate: this.stats.totalRequests > 0 
        ? (this.stats.blockedRequests / this.stats.totalRequests) * 100 
        : 0,
      totalTenants,
      blockedTenants,
      tenantConfigs: totalTenants,
      timestamp: Date.now()
    };
  }

  /**
   * Clean up expired data
   */
  async cleanup() {
    try {
      const pattern = `${this.options.keyPrefix}requests:*`;
      const keys = await this.redis.keys(pattern);
      
      let cleanedCount = 0;
      
      for (const key of keys) {
        try {
          // Remove expired entries
          const now = Date.now();
          const tenantId = key.split(':')[2];
          const config = this.getTenantConfig(tenantId);
          const windowStart = now - config.windowMs;
          
          const removed = await this.redis.zremrangebyscore(key, 0, windowStart);
          cleanedCount += removed;
          
          // Remove key if empty
          const count = await this.redis.zcard(key);
          if (count === 0) {
            await this.redis.del(key);
          }
          
        } catch (error) {
          // Skip problematic keys
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Rate limit cleanup completed', {
          cleanedCount,
          totalKeys: keys.length
        });
      }

    } catch (error) {
      logger.error('Rate limit cleanup failed', {
        error: error.message
      });
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    setInterval(async () => {
      await this.cleanup();
    }, 300000); // Every 5 minutes
  }

  /**
   * Remove tenant configuration
   * @param {string} tenantId - Tenant ID
   */
  removeTenantConfig(tenantId) {
    this.tenantConfigs.delete(tenantId);
    this.stats.tenantStats.delete(tenantId);
    
    logger.info('Tenant rate limit configuration removed', { tenantId });
  }

  /**
   * Get all tenant configurations
   * @returns {Array} - Array of tenant configurations
   */
  getAllTenantConfigs() {
    return Array.from(this.tenantConfigs.entries()).map(([tenantId, config]) => ({
      tenantId,
      ...config
    }));
  }
}

// Create singleton instance
const tenantRateLimit = new TenantRateLimit({
  windowMs: 60000, // 1 minute
  maxRequests: 1000,
  keyPrefix: 'tenant_rate_limit:',
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

module.exports = tenantRateLimit;
