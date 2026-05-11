const { logger } = require('../utils/logger');

class AuthEnhancer {
  constructor() {
    this.failedAttempts = new Map(); // Track failed auth attempts
    this.blockedIPs = new Set(); // Track blocked IPs
  }

  // Middleware for enhanced authentication
  enhanceAuth = (req, res, next) => {
    const startTime = Date.now();
    
    // Add request context
    req.authContext = {
      startTime,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      attemptCount: (this.failedAttempts.get(req.ip) || 0) + 1
    };

    // Log authentication attempt
    logger.info('Authentication attempt', {
      ip: req.authContext.ip,
      userAgent: req.authContext.userAgent,
      attempt: req.authContext.attemptCount,
      endpoint: req.path,
      timestamp: new Date().toISOString()
    });

    next();
  };

  // Rate limiting for authentication
  checkAuthRateLimit(ip) {
    const attempts = this.failedAttempts.get(ip) || 0;
    const recentAttempts = attempts.filter(time => 
      Date.now() - time < 15 * 60 * 1000 // Last 15 minutes
    ).length;

    // Block after 5 failed attempts
    if (recentAttempts >= 5) {
      this.blockedIPs.add(ip);
      this.failedAttempts.delete(ip);
      
      logger.warn('IP blocked due to failed attempts', {
        ip,
        attempts: recentAttempts,
        blockedUntil: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      });
      
      return false;
    }

    // Allow after 1 hour
    if (this.blockedIPs.has(ip)) {
      const blockTime = this.blockedIPs.get(ip);
      if (blockTime && Date.now() < blockTime) {
        return false; // Still blocked
      }
      
      // Unblock after block period
      this.blockedIPs.delete(ip);
      this.failedAttempts.delete(ip);
      
      logger.info('IP unblocked', {
        ip,
        blockedDuration: Date.now() - blockTime
      });
    }

    return true;
  }

  // Enhanced login validation
  validateLogin(req, res, next) => {
    const { email, password } = req.body;
    const ip = req.authContext.ip;

    // Check rate limiting
    if (!this.checkAuthRateLimit(ip)) {
      return res.status(429).json({
        success: false,
        message: 'Too many authentication attempts',
        error: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: 3600 // 1 hour
      });
    }

    // Check IP blocklist
    if (this.blockedIPs.has(ip)) {
      return res.status(403).json({
        success: false,
        message: 'IP address is blocked',
        error: 'IP_BLOCKED',
        retryAfter: this.blockedIPs.get(ip) - Date.now()
      });
    }

    // Enhanced validation
    if (!email || !password) {
      this.recordFailedAttempt(ip);
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
        error: 'VALIDATION_FAILED'
      });
    }

    if (password.length < 8) {
      this.recordFailedAttempt(ip);
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
        error: 'VALIDATION_FAILED'
      });
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /admin/i,
      /test/i,
      /123456/,
      /password/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => 
      email.toLowerCase().includes(pattern) || 
      password.toLowerCase().includes(pattern)
    );

    if (isSuspicious) {
      this.recordFailedAttempt(ip);
      return res.status(400).json({
        success: false,
        message: 'Suspicious login attempt detected',
        error: 'SUSPICIOUS_ACTIVITY'
      });
    }

    // Record successful login (would be done by actual auth controller)
    logger.info('Successful authentication', {
      ip,
      userAgent: req.authContext.userAgent,
      attempt: req.authContext.attemptCount
    });

    this.clearFailedAttempts(ip);
    next();
  }

  recordFailedAttempt(ip) {
    const current = this.failedAttempts.get(ip) || 0;
    this.failedAttempts.set(ip, current + 1);
  }

  clearFailedAttempts(ip) {
    this.failedAttempts.delete(ip);
  }

  // Session security middleware
  sessionSecurity = (req, res, next) => {
    // Check for session fixation
    const session = req.session;
    
    if (session && session.userId) {
      // Regenerate session ID after authentication
      if (!req.path.includes('/auth/login') && !session.regenerated) {
        session.regenerated = true;
        logger.warn('Session regenerated for security', {
          userId: session.userId,
          ip: req.authContext.ip
        });
      }
    }

    // Check for concurrent sessions
    if (session && session.userId) {
      const userSessions = this.getUserSessions(session.userId);
      if (userSessions.length > 1) {
        logger.warn('Multiple concurrent sessions detected', {
          userId: session.userId,
          sessionCount: userSessions.length,
          ip: req.authContext.ip
        });
      }
    }

    next();
  };

  getUserSessions(userId) {
    // This would integrate with your session store
    return []; // Placeholder
  };
}

module.exports = AuthEnhancer;
