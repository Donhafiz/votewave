const { logger } = require('../utils/logger');
const redis = require('../config/redis');

class SessionService {
  constructor() {
    this.sessionStore = new Map();
    this.revokedSessions = new Set();
  }

  // Create new session
  async createSession(userId, sessionData = {}) {
    const sessionId = this.generateSessionId();
    const session = {
      id: sessionId,
      userId,
      data: sessionData,
      createdAt: new Date(),
      lastActivity: new Date(),
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent,
      isActive: true
    };

    // Store in memory and Redis
    this.sessionStore.set(sessionId, session);
    
    try {
      await redis.hset(
        `session:${sessionId}`,
        {
          userId,
          createdAt: session.createdAt.toISOString(),
          lastActivity: session.lastActivity.toISOString(),
          ipAddress: session.ipAddress,
          userAgent: session.userAgent
        }
      );
      
      // Set expiry (24 hours)
      await redis.expire(`session:${sessionId}`, 24 * 60 * 60);
      
      logger.info('Session created', {
        sessionId,
        userId,
        ipAddress: session.ipAddress
      });
    } catch (error) {
      logger.error('Failed to create session in Redis', { error: error.message });
    }

    return sessionId;
  }

  // Get session by ID
  async getSession(sessionId) {
    let session = this.sessionStore.get(sessionId);
    
    if (!session) {
      try {
        const redisSession = await redis.hgetall(`session:${sessionId}`);
        if (redisSession && Object.keys(redisSession).length > 0) {
          session = {
            id: sessionId,
            userId: redisSession.userId,
            createdAt: new Date(redisSession.createdAt),
            lastActivity: new Date(redisSession.lastActivity),
            ipAddress: redisSession.ipAddress,
            userAgent: redisSession.userAgent,
            isActive: true
          };
          
          this.sessionStore.set(sessionId, session);
        }
      } catch (error) {
        logger.error('Failed to get session from Redis', { 
          sessionId, 
          error: error.message 
        });
      }
    }

    return session;
  }

  // Update session activity
  async updateSession(sessionId, updateData = {}) {
    const session = this.sessionStore.get(sessionId);
    
    if (session) {
      session.lastActivity = new Date();
      Object.assign(session.data, updateData);
      
      // Update in memory
      this.sessionStore.set(sessionId, session);
      
      try {
        await redis.hset(
          `session:${sessionId}`,
          {
            lastActivity: session.lastActivity.toISOString(),
            ...updateData
          }
        );
        
        logger.debug('Session updated', { sessionId, updateData });
      } catch (error) {
        logger.error('Failed to update session in Redis', { 
          sessionId, 
          error: error.message 
        });
      }
    }

    return session;
  }

  // Revoke session
  async revokeSession(sessionId, reason = 'Manual revocation') {
    const session = this.sessionStore.get(sessionId);
    
    if (session) {
      session.isActive = false;
      session.revokedAt = new Date();
      session.revocationReason = reason;
      
      // Update in memory
      this.sessionStore.set(sessionId, session);
      this.revokedSessions.add(sessionId);
      
      try {
        await redis.hset(
          `session:${sessionId}`,
          {
            isActive: false,
            revokedAt: session.revokedAt.toISOString(),
            revocationReason: reason
          }
        );
        
        logger.info('Session revoked', {
          sessionId,
          userId: session.userId,
          reason,
          ipAddress: session.ipAddress
        });
      } catch (error) {
        logger.error('Failed to revoke session in Redis', { 
          sessionId, 
          error: error.message 
        });
      }
    }

    return session;
  }

  // Check if session is valid
  async validateSession(sessionId) {
    const session = this.sessionStore.get(sessionId);
    
    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (this.revokedSessions.has(sessionId)) {
      return { valid: false, reason: 'Session has been revoked' };
    }

    if (!session.isActive) {
      return { valid: false, reason: 'Session is inactive' };
    }

    // Check session age (24 hours max)
    const sessionAge = Date.now() - session.createdAt.getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (sessionAge > maxAge) {
      return { valid: false, reason: 'Session has expired' };
    }

    // Check last activity (1 hour max inactivity)
    const inactivityTime = Date.now() - session.lastActivity.getTime();
    const maxInactivity = 60 * 60 * 1000; // 1 hour
    
    if (inactivityTime > maxInactivity) {
      return { valid: false, reason: 'Session inactive due to inactivity' };
    }

    return { valid: true, session };
  }

  // Clean up expired sessions
  async cleanupExpiredSessions() {
    const now = Date.now();
    const expired = [];

    for (const [sessionId, session] of this.sessionStore) {
      const sessionAge = now - session.createdAt.getTime();
      const inactivityTime = now - session.lastActivity.getTime();
      
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      const maxInactivity = 60 * 60 * 1000; // 1 hour
      
      if (sessionAge > maxAge || inactivityTime > maxInactivity || !session.isActive) {
        expired.push(sessionId);
        this.sessionStore.delete(sessionId);
        this.revokedSessions.add(sessionId);
        
        try {
          await redis.del(`session:${sessionId}`);
        } catch (error) {
          logger.error('Failed to delete expired session from Redis', { 
            sessionId, 
            error: error.message 
          });
        }
      }
    }
    }

    if (expired.length > 0) {
      logger.info('Cleaned up expired sessions', { 
        count: expired.length,
        cleanedAt: new Date().toISOString()
      });
    }
  }

  // Get user sessions
  async getUserSessions(userId) {
    const userSessions = [];
    
    for (const [sessionId, session] of this.sessionStore) {
      if (session.userId === userId && session.isActive) {
        userSessions.push({
          sessionId,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent
        });
      }
    }

    return userSessions;
  }

  // Generate secure session ID
  generateSessionId() {
    return 'sess_' + require('crypto').randomBytes(32).toString('hex');
  }

  // Get session statistics
  async getSessionStats() {
    const totalSessions = this.sessionStore.size;
    const activeSessions = Array.from(this.sessionStore.values())
      .filter(session => session.isActive).length;
    const revokedSessions = this.revokedSessions.size;

    return {
      total: totalSessions,
      active: activeSessions,
      revoked: revokedSessions,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SessionService;
