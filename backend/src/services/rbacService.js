const { logger } = require('../utils/logger');
const User = require('../models/User');

class RBACService {
  constructor() {
    // Define permission matrix
    this.permissions = {
      // User permissions
      user: [
        'view_profile',
        'update_profile',
        'view_elections',
        'vote',
        'view_results'
      ],
      
      // Admin permissions
      admin: [
        'manage_users',
        'manage_elections',
        'manage_candidates',
        'view_audit_logs',
        'manage_settings',
        'export_results',
        'activate_elections',
        'close_elections'
      ],
      
      // Super admin permissions
      super_admin: [
        'manage_admins',
        'system_configuration',
        'backup_restore',
        'security_audit',
        'api_key_management'
      ],
      
      // Election-specific permissions
      election_admin: [
        'manage_candidates',
        'view_votes',
        'manage_voting',
        'close_election',
        'export_election_results'
      ]
    };

    // Define role hierarchy
    this.roleHierarchy = {
      user: 1,
      admin: 2,
      super_admin: 3
    };
  }

  // Check if user has specific permission
  hasPermission(user, permission) {
    if (!user || !user.role) {
      return false;
    }

    const userPermissions = this.permissions[user.role] || [];
    return userPermissions.includes(permission);
  }

  // Check if user has any of the specified permissions
  hasAnyPermission(user, permissions) {
    if (!user || !user.role) {
      return false;
    }

    const userPermissions = this.permissions[user.role] || [];
    return permissions.some(permission => userPermissions.includes(permission));
  }

  // Check if user has all specified permissions
  hasAllPermissions(user, permissions) {
    if (!user || !user.role) {
      return false;
    }

    const userPermissions = this.permissions[user.role] || [];
    return permissions.every(permission => userPermissions.includes(permission));
  }

  // Get user permissions
  async getUserPermissions(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return [];
      }

      return this.permissions[user.role] || [];
    } catch (error) {
      logger.error('Failed to get user permissions', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  // Check role hierarchy (higher roles can access lower role permissions)
  canAccessRole(userRole, targetRole) {
    const userLevel = this.roleHierarchy[userRole] || 0;
    const targetLevel = this.roleHierarchy[targetRole] || 0;
    
    return userLevel >= targetLevel;
  }

  // Middleware for permission checking
  requirePermission(permission) {
    return (req, res, next) => {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'AUTHENTICATION_REQUIRED'
        });
      }

      if (!this.hasPermission(user, permission)) {
        logger.warn('Permission denied', {
          userId: user._id,
          role: user.role,
          permission,
          ip: req.ip,
          endpoint: req.path
        });
        
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          error: 'PERMISSION_DENIED',
          requiredPermission: permission
        });
      }

      logger.debug('Permission granted', {
        userId: user._id,
        role: user.role,
        permission,
        endpoint: req.path
      });

      next();
    };
  }

  // Middleware for multiple permissions
  requirePermissions(permissions, requireAll = true) {
    return (req, res, next) => {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'AUTHENTICATION_REQUIRED'
        });
      }

      const hasPermissions = requireAll 
        ? this.hasAllPermissions(user, permissions)
        : this.hasAnyPermission(user, permissions);

      if (!hasPermissions) {
        logger.warn('Permission denied', {
          userId: user._id,
          role: user.role,
          permissions,
          requireAll,
          ip: req.ip,
          endpoint: req.path
        });
        
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          error: 'PERMISSION_DENIED',
          requiredPermissions: permissions
        });
      }

      logger.debug('Permissions granted', {
        userId: user._id,
        role: user.role,
        permissions,
        requireAll,
        endpoint: req.path
      });

      next();
    };
  }

  // Middleware for role-based access
  requireRole(requiredRole) {
    return (req, res, next) => {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'AUTHENTICATION_REQUIRED'
        });
      }

      if (!this.canAccessRole(user.role, requiredRole)) {
        logger.warn('Role access denied', {
          userId: user._id,
          userRole: user.role,
          requiredRole,
          ip: req.ip,
          endpoint: req.path
        });
        
        return res.status(403).json({
          success: false,
          message: 'Insufficient role privileges',
          error: 'ROLE_ACCESS_DENIED',
          requiredRole
        });
      }

      logger.debug('Role access granted', {
        userId: user._id,
        userRole: user.role,
        requiredRole,
        endpoint: req.path
      });

      next();
    };
  }

  // Middleware for tenant-based access
  requireTenantAccess(tenantId) {
    return (req, res, next) => {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'AUTHENTICATION_REQUIRED'
        });
      }

      if (user.tenantId !== tenantId) {
        logger.warn('Tenant access denied', {
          userId: user._id,
          userTenantId: user.tenantId,
          requiredTenantId: tenantId,
          ip: req.ip,
          endpoint: req.path
        });
        
        return res.status(403).json({
          success: false,
          message: 'Tenant access denied',
          error: 'TENANT_ACCESS_DENIED'
        });
      }

      logger.debug('Tenant access granted', {
        userId: user._id,
        tenantId: user.tenantId,
        endpoint: req.path
      });

      next();
    };
  }

  // Get permission matrix for UI
  getPermissionMatrix() {
    return {
      roles: Object.keys(this.permissions),
      permissions: this.permissions,
      hierarchy: this.roleHierarchy
    };
  }

  // Update user role
  async updateUserRole(userId, newRole) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!this.canAccessRole(user.role, newRole)) {
        throw new Error('Cannot assign higher role to lower role user');
      }

      await User.findByIdAndUpdate(userId, { role: newRole });
      
      logger.info('User role updated', {
        userId,
        oldRole: user.role,
        newRole,
        updatedBy: req.user?._id
      });

      return true;
    } catch (error) {
      logger.error('Failed to update user role', {
        userId,
        newRole,
        error: error.message
      });
      throw error;
    }
  }

  // Check if user can access election
  async canAccessElection(userId, electionId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return false;
      }

      // Election admins can access their own elections
      if (user.role === 'election_admin') {
        const Election = require('../models/Election');
        const election = await Election.findById(electionId);
        return election && election.admins && election.admins.includes(userId);
      }

      // Regular admins can access all elections
      if (user.role === 'admin' || user.role === 'super_admin') {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to check election access', {
        userId,
        electionId,
        error: error.message
      });
      return false;
    }
  }

  // Audit permission check
  async logPermissionCheck(userId, permission, granted, context = {}) {
    logger.info('Permission check', {
      userId,
      permission,
      granted,
      context,
      timestamp: new Date().toISOString()
    });

    // This would integrate with your audit log system
    return true;
  }
}

module.exports = RBACService;
