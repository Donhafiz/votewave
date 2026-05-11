const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { TokenService } = require('../services/tokenService');

class WebSocketAuth {
  constructor() {
    this.tokenService = new TokenService();
    this.authenticatedSockets = new Map();
    this.blockedIPs = new Set();
    this.rateLimitTracker = new Map();
  }

  // WebSocket authentication middleware
  authenticate() {
    return async (socket, next) => {
      try {
        // Get token from auth data
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          logger.warn('WebSocket connection without token', {
            socketId: socket.id,
            ip: this.getSocketIP(socket)
          });
          
          return next(new Error('Authentication token required'));
        }

        // Verify token
        const verification = await this.tokenService.verifyToken(token);
        
        if (!verification.valid) {
          logger.warn('Invalid WebSocket authentication token', {
            socketId: socket.id,
            ip: this.getSocketIP(socket),
            error: verification.error
          });
          
          return next(new Error('Invalid authentication token'));
        }

        // Check rate limiting
        if (this.isRateLimited(this.getSocketIP(socket))) {
          logger.warn('WebSocket connection rate limited', {
            socketId: socket.id,
            ip: this.getSocketIP(socket)
          });
          
          return next(new Error('Connection rate limited'));
        }

        // Check if IP is blocked
        if (this.blockedIPs.has(this.getSocketIP(socket))) {
          logger.warn('WebSocket connection from blocked IP', {
            socketId: socket.id,
            ip: this.getSocketIP(socket)
          });
          
          return next(new Error('Connection blocked'));
        }

        // Store authenticated socket info
        this.authenticatedSockets.set(socket.id, {
          userId: verification.decoded.userId,
          email: verification.user.email,
          role: verification.user.role,
          tenantId: verification.user.tenantId,
          socketId: socket.id,
          ip: this.getSocketIP(socket),
          userAgent: socket.handshake.headers['user-agent'],
          connectedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        });

        // Add user info to socket
        socket.userId = verification.decoded.userId;
        socket.userEmail = verification.user.email;
        socket.userRole = verification.user.role;
        socket.tenantId = verification.user.tenantId;

        logger.info('WebSocket authenticated', {
          socketId: socket.id,
          userId: verification.decoded.userId,
          role: verification.user.role,
          tenantId: verification.user.tenantId,
          ip: this.getSocketIP(socket)
        });

        // Set up activity monitoring
        this.setupActivityMonitoring(socket);

        return next();

      } catch (error) {
        logger.error('WebSocket authentication error', {
          socketId: socket.id,
          error: error.message,
          stack: error.stack
        });

        return next(new Error('Authentication failed'));
      }
    };
  }

  // Optional authentication middleware
  optionalAuth() {
    return async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          // Allow connection without authentication
          socket.isGuest = true;
          return next();
        }

        // Try to verify token but don't fail if invalid
        const verification = await this.tokenService.verifyToken(token);
        
        if (verification.valid) {
          this.authenticatedSockets.set(socket.id, {
            userId: verification.decoded.userId,
            email: verification.user.email,
            role: verification.user.role,
            tenantId: verification.user.tenantId,
            socketId: socket.id,
            ip: this.getSocketIP(socket),
            userAgent: socket.handshake.headers['user-agent'],
            connectedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            isGuest: false
          });

          socket.userId = verification.decoded.userId;
          socket.userEmail = verification.user.email;
          socket.userRole = verification.user.role;
          socket.tenantId = verification.user.tenantId;
          socket.isGuest = false;
        } else {
          socket.isGuest = true;
        }

        return next();

      } catch (error) {
        logger.error('WebSocket optional authentication error', {
          socketId: socket.id,
          error: error.message
        });

        // Allow connection even if auth fails
        socket.isGuest = true;
        return next();
      }
    };
  }

  // Role-based authorization middleware
  authorize(requiredRole) {
    return (socket, next) => {
      if (!socket.userId) {
        return next(new Error('Authentication required'));
      }

      if (!this.hasRole(socket.userRole, requiredRole)) {
        logger.warn('WebSocket authorization failed', {
          socketId: socket.id,
          userId: socket.userId,
          userRole: socket.userRole,
          requiredRole
        });

        return next(new Error('Insufficient permissions'));
      }

      return next();
    };
  }

  // Tenant-based authorization middleware
  authorizeTenant(tenantId) {
    return (socket, next) => {
      if (!socket.userId) {
        return next(new Error('Authentication required'));
      }

      if (socket.tenantId !== tenantId) {
        logger.warn('WebSocket tenant authorization failed', {
          socketId: socket.id,
          userId: socket.userId,
          userTenantId: socket.tenantId,
          requiredTenantId: tenantId
        });

        return next(new Error('Tenant access denied'));
      }

      return next();
    };
  }

  // Room authorization middleware
  authorizeRoom(roomPattern) {
    return (socket, next) => {
      if (!socket.userId) {
        return next(new Error('Authentication required'));
      }

      // Check if socket can join room based on pattern
      const canJoin = this.canJoinRoom(socket, roomPattern);
      
      if (!canJoin) {
        logger.warn('WebSocket room authorization failed', {
          socketId: socket.id,
          userId: socket.userId,
          userRole: socket.userRole,
          roomPattern
        });

        return next(new Error('Room access denied'));
      }

      return next();
    };
  }

  // Get socket IP address
  getSocketIP(socket) {
    return socket.handshake.address || 
           socket.handshake.headers['x-forwarded-for'] || 
           socket.handshake.headers['x-real-ip'] || 
           socket.conn.remoteAddress || 
           'unknown';
  }

  // Check rate limiting
  isRateLimited(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxConnections = 10; // Max 10 connections per minute

    if (!this.rateLimitTracker.has(ip)) {
      this.rateLimitTracker.set(ip, []);
    }

    const connections = this.rateLimitTracker.get(ip);
    
    // Remove old connections outside window
    const validConnections = connections.filter(time => now - time < windowMs);
    this.rateLimitTracker.set(ip, validConnections);

    return validConnections.length >= maxConnections;
  }

  // Check if user has role
  hasRole(userRole, requiredRole) {
    const roleHierarchy = {
      'user': 1,
      'admin': 2,
      'super_admin': 3
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  }

  // Check if socket can join room
  canJoinRoom(socket, roomPattern) {
    const patterns = {
      'election:*': () => socket.userRole === 'admin' || socket.userRole === 'super_admin',
      'election:admin:*': () => socket.userRole === 'admin' || socket.userRole === 'super_admin',
      'election:voter:*': () => socket.userRole && socket.userRole !== 'guest',
      'election:results:*': () => socket.userRole && socket.userRole !== 'guest',
      'tenant:*': () => socket.userRole === 'admin' || socket.userRole === 'super_admin',
      'system:*': () => socket.userRole === 'super_admin'
    };

    for (const [pattern, checker] of Object.entries(patterns)) {
      if (roomPattern.startsWith(pattern.replace('*', ''))) {
        return checker();
      }
    }

    return true; // Allow by default
  }

  // Set up activity monitoring
  setupActivityMonitoring(socket) {
    // Update last activity on any socket event
    const originalEmit = socket.emit;
    socket.emit = function(event, ...args) {
      // Update last activity
      const authInfo = this.authenticatedSockets.get(socket.id);
      if (authInfo) {
        authInfo.lastActivity = new Date().toISOString();
        this.authenticatedSockets.set(socket.id, authInfo);
      }

      // Call original emit
      return originalEmit.call(this, event, ...args);
    }.bind(this);

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message
      });
    });
  }

  // Handle socket disconnect
  handleDisconnect(socket, reason) {
    const authInfo = this.authenticatedSockets.get(socket.id);
    
    if (authInfo) {
      const sessionDuration = Date.now() - new Date(authInfo.connectedAt).getTime();
      
      logger.info('WebSocket disconnected', {
        socketId: socket.id,
        userId: authInfo.userId,
        role: authInfo.role,
        tenantId: authInfo.tenantId,
        reason,
        sessionDuration: `${Math.round(sessionDuration / 1000)}s`,
        totalActivity: this.calculateActivity(authInfo)
      });

      this.authenticatedSockets.delete(socket.id);
    }
  }

  // Calculate activity metrics
  calculateActivity(authInfo) {
    const connectedAt = new Date(authInfo.connectedAt);
    const lastActivity = new Date(authInfo.lastActivity);
    const sessionDuration = lastActivity.getTime() - connectedAt.getTime();
    
    return {
      sessionDuration: Math.round(sessionDuration / 1000),
      lastActivity: authInfo.lastActivity,
      idleTime: Math.round((Date.now() - lastActivity.getTime()) / 1000)
    };
  }

  // Get authenticated sockets
  getAuthenticatedSockets() {
    return Array.from(this.authenticatedSockets.values());
  }

  // Get sockets by user
  getSocketsByUser(userId) {
    return Array.from(this.authenticatedSockets.values())
      .filter(socket => socket.userId === userId);
  }

  // Get sockets by tenant
  getSocketsByTenant(tenantId) {
    return Array.from(this.authenticatedSockets.values())
      .filter(socket => socket.tenantId === tenantId);
  }

  // Get sockets by role
  getSocketsByRole(role) {
    return Array.from(this.authenticatedSockets.values())
      .filter(socket => socket.role === role);
  }

  // Block IP address
  blockIP(ip, duration = 60 * 60 * 1000) { // 1 hour default
    this.blockedIPs.add(ip);
    
    logger.warn('IP blocked for WebSocket connections', {
      ip,
      duration: `${duration / 1000}s`
    });

    // Unblock after duration
    setTimeout(() => {
      this.blockedIPs.delete(ip);
      logger.info('IP unblocked for WebSocket connections', { ip });
    }, duration);
  }

  // Unblock IP address
  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    logger.info('IP unblocked for WebSocket connections', { ip });
  }

  // Get connection statistics
  getConnectionStats() {
    const sockets = Array.from(this.authenticatedSockets.values());
    const now = Date.now();
    
    return {
      totalConnections: sockets.length,
      connectionsByRole: this.groupBy(sockets, 'role'),
      connectionsByTenant: this.groupBy(sockets, 'tenantId'),
      averageSessionDuration: this.calculateAverageSessionDuration(sockets, now),
      activeConnections: sockets.filter(s => now - new Date(s.lastActivity).getTime() < 5 * 60 * 1000).length, // Active in last 5 minutes
      idleConnections: sockets.filter(s => now - new Date(s.lastActivity).getTime() >= 5 * 60 * 1000).length, // Idle for 5+ minutes
      blockedIPs: Array.from(this.blockedIPs),
      rateLimitedIPs: Array.from(this.rateLimitTracker.keys()),
      timestamp: new Date().toISOString()
    };
  }

  // Group sockets by field
  groupBy(sockets, field) {
    return sockets.reduce((groups, socket) => {
      const key = socket[field] || 'unknown';
      groups[key] = (groups[key] || 0) + 1;
      return groups;
    }, {});
  }

  // Calculate average session duration
  calculateAverageSessionDuration(sockets, now) {
    if (sockets.length === 0) return 0;
    
    const totalDuration = sockets.reduce((sum, socket) => {
      return sum + (now - new Date(socket.connectedAt).getTime());
    }, 0);
    
    return Math.round(totalDuration / sockets.length / 1000); // Return in seconds
  }

  // Clean up inactive connections
  cleanupInactiveConnections() {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [socketId, authInfo] of this.authenticatedSockets) {
      const lastActivity = new Date(authInfo.lastActivity).getTime();
      
      if (now - lastActivity > inactiveThreshold) {
        logger.info('Cleaning up inactive WebSocket connection', {
          socketId,
          userId: authInfo.userId,
          inactiveTime: `${Math.round((now - lastActivity) / 1000)}s`
        });
        
        this.authenticatedSockets.delete(socketId);
      }
    }
  }

  // Start cleanup process
  startCleanup() {
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000); // Check every 5 minutes

    logger.info('WebSocket cleanup process started');
  }
}

module.exports = WebSocketAuth;
