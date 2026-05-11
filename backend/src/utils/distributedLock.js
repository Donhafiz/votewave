const { logger } = require('./logger');
const redis = require('../config/redis');
const crypto = require('crypto');

class DistributedLock {
  constructor(options = {}) {
    this.redis = redis;
    this.defaultTTL = options.defaultTTL || 30000; // 30 seconds
    this.retryDelay = options.retryDelay || 100; // 100ms
    this.maxRetries = options.maxRetries || 30;
    this.lockPrefix = options.lockPrefix || 'lock:';
    this.heartbeatInterval = options.heartbeatInterval || 5000; // 5 seconds
    this.heartbeats = new Map();
  }

  /**
   * Acquire a distributed lock
   * @param {string} resource - Resource to lock
   * @param {number} ttl - Time to live in milliseconds
   * @param {string} identifier - Unique identifier for this lock attempt
   * @returns {Promise<boolean>} - True if lock acquired
   */
  async acquire(resource, ttl = this.defaultTTL, identifier = null) {
    const lockKey = this.lockPrefix + resource;
    const lockId = identifier || this.generateLockId();
    const lockValue = {
      id: lockId,
      acquiredAt: Date.now(),
      ttl,
      heartbeat: true
    };

    try {
      // Try to acquire lock using SET NX EX
      const result = await this.redis.set(
        lockKey,
        JSON.stringify(lockValue),
        'PX', // Set expiration in milliseconds
        ttl,
        'NX' // Only set if key doesn't exist
      );

      if (result === 'OK') {
        logger.info('Distributed lock acquired', {
          resource,
          lockId,
          ttl
        });

        // Start heartbeat for this lock
        this.startHeartbeat(resource, lockId, ttl);
        
        return { acquired: true, lockId, lockKey };
      }

      return { acquired: false, lockId, lockKey };

    } catch (error) {
      logger.error('Failed to acquire distributed lock', {
        resource,
        lockId,
        error: error.message
      });
      
      return { acquired: false, lockId, lockKey, error };
    }
  }

  /**
   * Acquire lock with retry logic
   * @param {string} resource - Resource to lock
   * @param {number} ttl - Time to live in milliseconds
   * @param {number} timeout - Maximum time to wait for lock
   * @returns {Promise<Object>} - Lock acquisition result
   */
  async acquireWithRetry(resource, ttl = this.defaultTTL, timeout = 10000) {
    const startTime = Date.now();
    const lockId = this.generateLockId();
    let attempt = 0;

    while (Date.now() - startTime < timeout) {
      attempt++;
      
      const result = await this.acquire(resource, ttl, lockId);
      
      if (result.acquired) {
        return result;
      }

      // Check if we should stop retrying
      if (attempt >= this.maxRetries) {
        logger.warn('Max retries reached for lock acquisition', {
          resource,
          attempt,
          maxRetries: this.maxRetries
        });
        break;
      }

      // Exponential backoff with jitter
      const delay = Math.min(this.retryDelay * Math.pow(2, attempt - 1), 1000);
      const jitter = Math.random() * delay;
      
      await this.sleep(delay + jitter);
    }

    return {
      acquired: false,
      lockId,
      error: 'Timeout reached while waiting for lock',
      attempts: attempt
    };
  }

  /**
   * Release a distributed lock
   * @param {string} resource - Resource to unlock
   * @param {string} lockId - Lock identifier
   * @returns {Promise<boolean>} - True if lock released
   */
  async release(resource, lockId) {
    const lockKey = this.lockPrefix + resource;

    try {
      // Get current lock value
      const currentValue = await this.redis.get(lockKey);
      
      if (!currentValue) {
        logger.warn('Attempted to release non-existent lock', {
          resource,
          lockId
        });
        return false;
      }

      const lockData = JSON.parse(currentValue);
      
      // Verify lock ownership
      if (lockData.id !== lockId) {
        logger.error('Attempted to release lock owned by another process', {
          resource,
          lockId,
          actualLockId: lockData.id
        });
        return false;
      }

      // Stop heartbeat
      this.stopHeartbeat(resource);

      // Delete the lock
      const result = await this.redis.del(lockKey);
      
      if (result > 0) {
        logger.info('Distributed lock released', {
          resource,
          lockId,
          heldDuration: Date.now() - lockData.acquiredAt
        });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to release distributed lock', {
        resource,
        lockId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Extend lock TTL
   * @param {string} resource - Resource to extend
   * @param {string} lockId - Lock identifier
   * @param {number} additionalTTL - Additional time in milliseconds
   * @returns {Promise<boolean>} - True if lock extended
   */
  async extend(resource, lockId, additionalTTL = this.defaultTTL) {
    const lockKey = this.lockPrefix + resource;

    try {
      // Get current lock value
      const currentValue = await this.redis.get(lockKey);
      
      if (!currentValue) {
        return false;
      }

      const lockData = JSON.parse(currentValue);
      
      // Verify lock ownership
      if (lockData.id !== lockId) {
        return false;
      }

      // Update lock value with new TTL
      const updatedValue = {
        ...lockData,
        ttl: additionalTTL,
        extendedAt: Date.now()
      };

      // Use Lua script for atomic update
      const luaScript = `
        local current = redis.call('GET', KEYS[1])
        if current and current == ARGV[1] then
          redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
          return 1
        end
        return 0
      `;

      const result = await this.redis.eval(luaScript, 1, lockKey, currentValue, JSON.stringify(updatedValue), additionalTTL.toString());
      
      if (result === 1) {
        logger.info('Distributed lock extended', {
          resource,
          lockId,
          additionalTTL
        });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to extend distributed lock', {
        resource,
        lockId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check if lock exists and is owned by specified lockId
   * @param {string} resource - Resource to check
   * @param {string} lockId - Lock identifier
   * @returns {Promise<boolean>} - True if lock exists and is owned
   */
  async isLocked(resource, lockId) {
    const lockKey = this.lockPrefix + resource;

    try {
      const currentValue = await this.redis.get(lockKey);
      
      if (!currentValue) {
        return false;
      }

      const lockData = JSON.parse(currentValue);
      return lockData.id === lockId;

    } catch (error) {
      logger.error('Failed to check lock status', {
        resource,
        lockId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get lock information
   * @param {string} resource - Resource to check
   * @returns {Promise<Object|null>} - Lock information or null
   */
  async getLockInfo(resource) {
    const lockKey = this.lockPrefix + resource;

    try {
      const currentValue = await this.redis.get(lockKey);
      
      if (!currentValue) {
        return null;
      }

      const lockData = JSON.parse(currentValue);
      
      return {
        resource,
        lockId: lockData.id,
        acquiredAt: lockData.acquiredAt,
        ttl: lockData.ttl,
        extendedAt: lockData.extendedAt,
        heartbeat: lockData.heartbeat,
        age: Date.now() - lockData.acquiredAt
      };

    } catch (error) {
      logger.error('Failed to get lock info', {
        resource,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Force release a lock (admin operation)
   * @param {string} resource - Resource to unlock
   * @returns {Promise<boolean>} - True if lock released
   */
  async forceRelease(resource) {
    const lockKey = this.lockPrefix + resource;

    try {
      const lockInfo = await this.getLockInfo(resource);
      
      if (lockInfo) {
        logger.warn('Force releasing distributed lock', {
          resource,
          lockId: lockInfo.lockId,
          heldDuration: lockInfo.age
        });
      }

      // Stop heartbeat
      this.stopHeartbeat(resource);

      // Delete the lock
      const result = await this.redis.del(lockKey);
      
      return result > 0;

    } catch (error) {
      logger.error('Failed to force release distributed lock', {
        resource,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Start heartbeat for a lock
   * @param {string} resource - Resource
   * @param {string} lockId - Lock identifier
   * @param {number} ttl - Time to live
   */
  startHeartbeat(resource, lockId, ttl) {
    const heartbeatKey = `${resource}:${lockId}`;
    
    // Clear any existing heartbeat
    this.stopHeartbeat(resource);

    const interval = setInterval(async () => {
      try {
        const lockKey = this.lockPrefix + resource;
        const currentValue = await this.redis.get(lockKey);
        
        if (!currentValue) {
          // Lock no longer exists, stop heartbeat
          this.stopHeartbeat(resource);
          return;
        }

        const lockData = JSON.parse(currentValue);
        
        // Verify lock ownership
        if (lockData.id !== lockId) {
          // Lock was acquired by someone else, stop heartbeat
          this.stopHeartbeat(resource);
          return;
        }

        // Update heartbeat timestamp
        lockData.lastHeartbeat = Date.now();
        
        // Extend lock TTL
        await this.redis.set(lockKey, JSON.stringify(lockData), 'PX', ttl);

      } catch (error) {
        logger.error('Heartbeat failed for distributed lock', {
          resource,
          lockId,
          error: error.message
        });
        
        // Stop heartbeat on error to prevent issues
        this.stopHeartbeat(resource);
      }
    }, this.heartbeatInterval);

    this.heartbeats.set(heartbeatKey, interval);
  }

  /**
   * Stop heartbeat for a lock
   * @param {string} resource - Resource
   */
  stopHeartbeat(resource) {
    // Find and clear heartbeat intervals for this resource
    for (const [key, interval] of this.heartbeats) {
      if (key.startsWith(resource + ':')) {
        clearInterval(interval);
        this.heartbeats.delete(key);
      }
    }
  }

  /**
   * Clean up expired locks
   * @returns {Promise<number>} - Number of locks cleaned up
   */
  async cleanupExpiredLocks() {
    let cleanedCount = 0;

    try {
      const lockKeys = await this.redis.keys(this.lockPrefix + '*');
      
      for (const lockKey of lockKeys) {
        try {
          const currentValue = await this.redis.get(lockKey);
          
          if (currentValue) {
            const lockData = JSON.parse(currentValue);
            const age = Date.now() - lockData.acquiredAt;
            
            // If lock is older than its TTL + 10 seconds, consider it stale
            if (age > (lockData.ttl + 10000)) {
              logger.warn('Cleaning up stale distributed lock', {
                resource: lockKey.replace(this.lockPrefix, ''),
                lockId: lockData.id,
                age,
                ttl: lockData.ttl
              });
              
              await this.redis.del(lockKey);
              cleanedCount++;
              
              // Stop heartbeat for this resource
              const resource = lockKey.replace(this.lockPrefix, '');
              this.stopHeartbeat(resource);
            }
          }
        } catch (error) {
          logger.error('Failed to cleanup individual lock', {
            lockKey,
            error: error.message
          });
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up expired distributed locks', {
          cleanedCount,
          totalChecked: lockKeys.length
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup expired locks', {
        error: error.message
      });
    }

    return cleanedCount;
  }

  /**
   * Get statistics about locks
   * @returns {Promise<Object>} - Lock statistics
   */
  async getStats() {
    try {
      const lockKeys = await this.redis.keys(this.lockPrefix + '*');
      const activeLocks = [];
      let totalAge = 0;
      let staleLocks = 0;

      for (const lockKey of lockKeys) {
        try {
          const lockInfo = await this.getLockInfo(lockKey.replace(this.lockPrefix, ''));
          
          if (lockInfo) {
            activeLocks.push(lockInfo);
            totalAge += lockInfo.age;
            
            // Check if lock is stale
            if (lockInfo.age > (lockInfo.ttl + 10000)) {
              staleLocks++;
            }
          }
        } catch (error) {
          // Skip problematic locks
        }
      }

      return {
        totalLocks: lockKeys.length,
        activeLocks: activeLocks.length,
        staleLocks,
        averageAge: activeLocks.length > 0 ? totalAge / activeLocks.length : 0,
        heartbeatsActive: this.heartbeats.size,
        oldestLock: activeLocks.length > 0 ? Math.max(...activeLocks.map(l => l.age)) : 0,
        newestLock: activeLocks.length > 0 ? Math.min(...activeLocks.map(l => l.age)) : 0
      };

    } catch (error) {
      logger.error('Failed to get lock statistics', {
        error: error.message
      });
      return {
        totalLocks: 0,
        activeLocks: 0,
        staleLocks: 0,
        averageAge: 0,
        heartbeatsActive: this.heartbeats.size,
        oldestLock: 0,
        newestLock: 0
      };
    }
  }

  /**
   * Generate unique lock identifier
   * @returns {string} - Unique lock ID
   */
  generateLockId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Sleep helper function
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup all heartbeats (for shutdown)
   */
  cleanup() {
    for (const interval of this.heartbeats.values()) {
      clearInterval(interval);
    }
    this.heartbeats.clear();
    
    logger.info('Distributed lock cleanup completed');
  }
}

// Create singleton instance
const distributedLock = new DistributedLock({
  defaultTTL: 30000, // 30 seconds
  retryDelay: 100, // 100ms
  maxRetries: 30,
  heartbeatInterval: 5000 // 5 seconds
});

// Start periodic cleanup
setInterval(async () => {
  await distributedLock.cleanupExpiredLocks();
}, 60000); // Every minute

// Handle graceful shutdown
process.on('SIGTERM', () => {
  distributedLock.cleanup();
});

process.on('SIGINT', () => {
  distributedLock.cleanup();
});

module.exports = distributedLock;
