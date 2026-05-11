const { logger } = require('./logger');
const redis = require('../config/redis');
const crypto = require('crypto');

class IdempotencyManager {
  constructor(options = {}) {
    this.redis = redis;
    this.defaultTTL = options.defaultTTL || 86400000; // 24 hours
    this.keyPrefix = options.keyPrefix || 'idempotency:';
    this.maxStoredResults = options.maxStoredResults || 10000;
    this.cleanupInterval = options.cleanupInterval || 3600000; // 1 hour
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      duplicatesPrevented: 0
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Generate idempotency key from request
   * @param {Object} request - Request object
   * @param {string} userId - User ID
   * @param {string} operation - Operation type
   * @returns {string} - Idempotency key
   */
  generateKey(request, userId, operation) {
    const keyComponents = [
      userId,
      operation,
      this.extractRelevantData(request),
      this.getTimeWindow(request)
    ];

    const keyString = keyComponents.join('|');
    const hash = crypto.createHash('sha256').update(keyString).digest('hex');
    
    return this.keyPrefix + hash;
  }

  /**
   * Extract relevant data for idempotency
   * @param {Object} request - Request object
   * @returns {string} - Relevant data string
   */
  extractRelevantData(request) {
    // Extract only the data that should make the request unique
    const relevantFields = {
      // For voting operations
      electionId: request.body?.electionId,
      candidateId: request.body?.candidateId,
      
      // For user operations
      email: request.body?.email,
      action: request.body?.action,
      
      // For election operations
      title: request.body?.title,
      startDate: request.body?.startDate,
      endDate: request.body?.endDate,
      
      // Common fields
      method: request.method,
      path: request.path
    };

    // Remove undefined/null values and sort keys
    const cleanData = Object.fromEntries(
      Object.entries(relevantFields)
        .filter(([_, value]) => value !== undefined && value !== null)
        .sort(([a], [b]) => a.localeCompare(b))
    );

    return JSON.stringify(cleanData);
  }

  /**
   * Get time window for request (to prevent replay attacks)
   * @param {Object} request - Request object
   * @returns {string} - Time window
   */
  getTimeWindow(request) {
    // Use 5-minute windows for most operations
    const windowSize = 300000; // 5 minutes
    const now = Date.now();
    const windowStart = Math.floor(now / windowSize) * windowSize;
    
    return windowStart.toString();
  }

  /**
   * Check if request is a duplicate and store result
   * @param {string} idempotencyKey - Idempotency key
   * @param {Object} request - Request object
   * @param {Function} operation - Operation to execute if not duplicate
   * @param {number} ttl - Time to live for stored result
   * @returns {Promise<Object>} - Operation result
   */
  async checkAndExecute(idempotencyKey, request, operation, ttl = this.defaultTTL) {
    this.stats.totalRequests++;

    try {
      // Check if we have a cached result
      const cachedResult = await this.getCachedResult(idempotencyKey);
      
      if (cachedResult) {
        this.stats.cacheHits++;
        this.stats.duplicatesPrevented++;
        
        logger.info('Idempotency cache hit', {
          idempotencyKey: idempotencyKey.substring(0, 16) + '...',
          operation: request.path,
          cachedAt: cachedResult.timestamp
        });

        return {
          ...cachedResult.result,
          fromCache: true,
          idempotencyKey
        };
      }

      this.stats.cacheMisses++;

      // Execute the operation
      const startTime = Date.now();
      const result = await operation();
      const executionTime = Date.now() - startTime;

      // Store the result
      await this.storeResult(idempotencyKey, result, request, executionTime, ttl);

      logger.info('Operation executed and cached', {
        idempotencyKey: idempotencyKey.substring(0, 16) + '...',
        operation: request.path,
        executionTime
      });

      return {
        ...result,
        fromCache: false,
        idempotencyKey,
        executionTime
      };

    } catch (error) {
      logger.error('Idempotency operation failed', {
        idempotencyKey: idempotencyKey.substring(0, 16) + '...',
        operation: request.path,
        error: error.message
      });

      // Don't cache errors by default, but can be configured
      if (this.shouldCacheError(error)) {
        await this.storeResult(idempotencyKey, { error: error.message }, request, Date.now() - startTime, ttl);
      }

      throw error;
    }
  }

  /**
   * Get cached result
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<Object|null>} - Cached result or null
   */
  async getCachedResult(idempotencyKey) {
    try {
      const cachedData = await this.redis.get(idempotencyKey);
      
      if (!cachedData) {
        return null;
      }

      const result = JSON.parse(cachedData);
      
      // Check if result has expired
      if (result.expiresAt && Date.now() > result.expiresAt) {
        await this.redis.del(idempotencyKey);
        return null;
      }

      return result;

    } catch (error) {
      logger.error('Failed to get cached result', {
        idempotencyKey: idempotencyKey.substring(0, 16) + '...',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Store operation result
   * @param {string} idempotencyKey - Idempotency key
   * @param {Object} result - Operation result
   * @param {Object} request - Original request
   * @param {number} executionTime - Operation execution time
   * @param {number} ttl - Time to live
   */
  async storeResult(idempotencyKey, result, request, executionTime, ttl) {
    try {
      const storedData = {
        result,
        request: {
          method: request.method,
          path: request.path,
          userId: request.user?.id,
          timestamp: new Date().toISOString()
        },
        timestamp: Date.now(),
        executionTime,
        expiresAt: Date.now() + ttl
      };

      await this.redis.setex(
        idempotencyKey,
        Math.ceil(ttl / 1000), // Convert to seconds
        JSON.stringify(storedData)
      );

    } catch (error) {
      logger.error('Failed to store result', {
        idempotencyKey: idempotencyKey.substring(0, 16) + '...',
        error: error.message
      });
    }
  }

  /**
   * Invalidate cached result
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<boolean>} - True if invalidated
   */
  async invalidate(idempotencyKey) {
    try {
      const result = await this.redis.del(idempotencyKey);
      
      if (result > 0) {
        logger.info('Idempotency cache invalidated', {
          idempotencyKey: idempotencyKey.substring(0, 16) + '...'
        });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to invalidate cache', {
        idempotencyKey: idempotencyKey.substring(0, 16) + '...',
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get idempotency statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.totalRequests > 0 
        ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
        : 0,
      duplicatePreventionRate: this.stats.totalRequests > 0 
        ? (this.stats.duplicatesPrevented / this.stats.totalRequests) * 100 
        : 0
    };
  }

  /**
   * Clean up expired entries
   * @returns {Promise<number>} - Number of entries cleaned up
   */
  async cleanup() {
    let cleanedCount = 0;

    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      
      for (const key of keys) {
        try {
          const cachedData = await this.redis.get(key);
          
          if (cachedData) {
            const result = JSON.parse(cachedData);
            
            // Check if result has expired
            if (result.expiresAt && Date.now() > result.expiresAt) {
              await this.redis.del(key);
              cleanedCount++;
            }
          }
        } catch (error) {
          // Remove problematic entries
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Idempotency cache cleanup completed', {
          cleanedCount,
          totalChecked: keys.length
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup idempotency cache', {
        error: error.message
      });
    }

    return cleanedCount;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    setInterval(async () => {
      await this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Determine if error should be cached
   * @param {Error} error - Error object
   * @returns {boolean} - True if error should be cached
   */
  shouldCacheError(error) {
    // Cache client errors (4xx) but not server errors (5xx)
    // This allows retrying server errors but prevents repeating client errors
    return error.status && error.status >= 400 && error.status < 500;
  }

  /**
   * Get cached result by user and operation
   * @param {string} userId - User ID
   * @param {string} operation - Operation type
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} - Array of cached results
   */
  async getUserResults(userId, operation, filters = {}) {
    try {
      const pattern = this.keyPrefix + '*';
      const keys = await this.redis.keys(pattern);
      const results = [];

      for (const key of keys) {
        try {
          const cachedData = await this.redis.get(key);
          
          if (cachedData) {
            const result = JSON.parse(cachedData);
            
            // Filter by user and operation
            if (result.request.userId === userId && 
                result.request.path.includes(operation)) {
              
              // Apply additional filters
              let matches = true;
              
              if (filters.since) {
                matches = result.timestamp >= filters.since;
              }
              
              if (filters.until) {
                matches = matches && result.timestamp <= filters.until;
              }
              
              if (matches) {
                results.push({
                  idempotencyKey: key,
                  ...result
                });
              }
            }
          }
        } catch (error) {
          // Skip problematic entries
        }
      }

      // Sort by timestamp (newest first)
      results.sort((a, b) => b.timestamp - a.timestamp);

      return results;

    } catch (error) {
      logger.error('Failed to get user results', {
        userId,
        operation,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Clear all cached results for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} - Number of entries cleared
   */
  async clearUserResults(userId) {
    let clearedCount = 0;

    try {
      const pattern = this.keyPrefix + '*';
      const keys = await this.redis.keys(pattern);
      
      for (const key of keys) {
        try {
          const cachedData = await this.redis.get(key);
          
          if (cachedData) {
            const result = JSON.parse(cachedData);
            
            if (result.request.userId === userId) {
              await this.redis.del(key);
              clearedCount++;
            }
          }
        } catch (error) {
          // Skip problematic entries
        }
      }

      if (clearedCount > 0) {
        logger.info('User idempotency cache cleared', {
          userId,
          clearedCount
        });
      }

    } catch (error) {
      logger.error('Failed to clear user results', {
        userId,
        error: error.message
      });
    }

    return clearedCount;
  }

  /**
   * Get cache health metrics
   * @returns {Promise<Object>} - Health metrics
   */
  async getHealthMetrics() {
    try {
      const pattern = this.keyPrefix + '*';
      const keys = await this.redis.keys(pattern);
      
      let totalSize = 0;
      let expiredCount = 0;
      let now = Date.now();

      for (const key of keys.slice(0, 100)) { // Sample first 100 keys
        try {
          const cachedData = await this.redis.get(key);
          
          if (cachedData) {
            totalSize += cachedData.length;
            
            const result = JSON.parse(cachedData);
            if (result.expiresAt && now > result.expiresAt) {
              expiredCount++;
            }
          }
        } catch (error) {
          // Skip problematic entries
        }
      }

      const avgSize = keys.length > 0 ? totalSize / Math.min(keys.length, 100) : 0;
      const estimatedExpired = keys.length > 100 ? (expiredCount / 100) * keys.length : expiredCount;

      return {
        totalEntries: keys.length,
        estimatedExpired,
        averageEntrySize: Math.round(avgSize),
        estimatedTotalSize: Math.round(avgSize * keys.length),
        healthScore: Math.max(0, 100 - (estimatedExpired / keys.length) * 100),
        lastCleanup: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get health metrics', {
        error: error.message
      });
      
      return {
        totalEntries: 0,
        estimatedExpired: 0,
        averageEntrySize: 0,
        estimatedTotalSize: 0,
        healthScore: 0,
        lastCleanup: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Create singleton instance
const idempotencyManager = new IdempotencyManager({
  defaultTTL: 86400000, // 24 hours
  keyPrefix: 'idempotency:',
  maxStoredResults: 10000,
  cleanupInterval: 3600000 // 1 hour
});

module.exports = idempotencyManager;
