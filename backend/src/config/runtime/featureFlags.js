const { logger } = require('../../utils/logger');
const EventEmitter = require('events');

class FeatureFlagManager extends EventEmitter {
  constructor() {
    super();
    this.flags = new Map();
    this.userFlags = new Map();
    this.tenantFlags = new Map();
    this.rolloutPercentage = new Map();
    this.experiments = new Map();
    
    this.loadFlags();
    this.startCleanup();
  }

  // Load feature flags from various sources
  async loadFlags() {
    try {
      // Load global flags
      await this.loadGlobalFlags();
      
      // Load user-specific flags
      await this.loadUserFlags();
      
      // Load tenant-specific flags
      await this.loadTenantFlags();
      
      // Load experiment configurations
      await this.loadExperiments();
      
      logger.info('Feature flags loaded', {
        globalFlags: this.flags.size,
        userFlags: this.userFlags.size,
        tenantFlags: this.tenantFlags.size,
        experiments: this.experiments.size
      });
      
      this.emit('flagsLoaded');
      
    } catch (error) {
      logger.error('Failed to load feature flags', {
        error: error.message
      });
    }
  }

  // Load global feature flags
  async loadGlobalFlags() {
    const globalFlags = {
      // API features
      'api.v2.enabled': false,
      'api.v2.beta': true,
      'api.rate_limiting.enhanced': true,
      'api.cors.strict': false,
      
      // Authentication features
      'auth.jwt.refresh_rotation': true,
      'auth.session.revocation': true,
      'auth.multi_factor': false,
      'auth.oauth.enabled': false,
      
      // Voting features
      'voting.real_time.enabled': true,
      'voting.anonymous.enabled': false,
      'voting.blockchain.enabled': false,
      'voting.advanced_analytics': true,
      
      // ML features
      'ml.fraud_detection.enabled': true,
      'ml.behavioral_analysis.enabled': true,
      'ml.predictive_analytics.enabled': false,
      'ml.auto_moderation.enabled': false,
      
      // Real-time features
      'realtime.websocket.enabled': true,
      'realtime.live_results.enabled': true,
      'realtime.notifications.enabled': true,
      'realtime.analytics.enabled': true,
      
      // Admin features
      'admin.advanced_dashboard': true,
      'admin.audit_logs.enabled': true,
      'admin.tenant_management': true,
      'admin.billing.enabled': false,
      
      // Security features
      'security.advanced_audit.enabled': true,
      'security.rate_limiting.tenant': true,
      'security.ip_whitelist.enabled': false,
      'security.geo_blocking.enabled': false,
      
      // Experimental features
      'experimental.ai_chat.enabled': false,
      'experimental.voice_voting.enabled': false,
      'experimental.blockchain_voting.enabled': false,
      'experimental.quantum_encryption.enabled': false
    };

    for (const [flag, value] of Object.entries(globalFlags)) {
      this.flags.set(flag, {
        enabled: value,
        type: 'global',
        description: this.getFlagDescription(flag),
        lastModified: new Date().toISOString()
      });
    }
  }

  // Load user-specific feature flags
  async loadUserFlags() {
    // This would load from database or external service
    const userSpecificFlags = {
      'admin_user_123': {
        'experimental.ai_chat.enabled': true,
        'admin.advanced_dashboard': true
      },
      'beta_user_456': {
        'api.v2.beta': true,
        'voting.real_time.enabled': true
      }
    };

    for (const [userId, flags] of Object.entries(userSpecificFlags)) {
      this.userFlags.set(userId, {
        flags: new Map(Object.entries(flags).map(([flag, enabled]) => [flag, {
          enabled,
          type: 'user',
          userId,
          lastModified: new Date().toISOString()
        }])),
        lastModified: new Date().toISOString()
      });
    }
  }

  // Load tenant-specific feature flags
  async loadTenantFlags() {
    // This would load from database or external service
    const tenantSpecificFlags = {
      'enterprise_tenant_1': {
        'admin.tenant_management': true,
        'admin.billing.enabled': true,
        'security.advanced_audit.enabled': true
      },
      'beta_tenant_2': {
        'api.v2.beta': true,
        'ml.predictive_analytics.enabled': true,
        'experimental.ai_chat.enabled': true
      }
    };

    for (const [tenantId, flags] of Object.entries(tenantSpecificFlags)) {
      this.tenantFlags.set(tenantId, {
        flags: new Map(Object.entries(flags).map(([flag, enabled]) => [flag, {
          enabled,
          type: 'tenant',
          tenantId,
          lastModified: new Date().toISOString()
        }])),
        lastModified: new Date().toISOString()
      });
    }
  }

  // Load experiment configurations
  async loadExperiments() {
    const experiments = {
      'new_ui_design': {
        enabled: true,
        percentage: 10, // 10% of users
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        variants: {
          control: 50,
          experimental: 50
        },
        targetFlag: 'ui.new_design.enabled'
      },
      'enhanced_voting_flow': {
        enabled: true,
        percentage: 5, // 5% of users
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-09-30'),
        variants: {
          control: 70,
          experimental: 30
        },
        targetFlag: 'voting.enhanced_flow.enabled'
      }
    };

    for (const [experimentId, config] of Object.entries(experiments)) {
      this.experiments.set(experimentId, {
        ...config,
        type: 'experiment',
        lastModified: new Date().toISOString()
      });
    }
  }

  // Check if feature is enabled for user
  isEnabled(flag, userId = null, tenantId = null) {
    // Check global flag first
    const globalFlag = this.flags.get(flag);
    if (globalFlag && !globalFlag.enabled) {
      return false;
    }

    // Check user-specific flag
    if (userId && this.userFlags.has(userId)) {
      const userFlag = this.userFlags.get(userId).flags.get(flag);
      if (userFlag !== undefined) {
        return userFlag.enabled;
      }
    }

    // Check tenant-specific flag
    if (tenantId && this.tenantFlags.has(tenantId)) {
      const tenantFlag = this.tenantFlags.get(tenantId).flags.get(flag);
      if (tenantFlag !== undefined) {
        return tenantFlag.enabled;
      }
    }

    // Check if user is in experiment
    if (userId) {
      const experimentResult = this.checkExperiment(flag, userId);
      if (experimentResult !== null) {
        return experimentResult;
      }
    }

    // Return global flag value or default to false
    return globalFlag ? globalFlag.enabled : false;
  }

  // Check if user is in experiment
  checkExperiment(flag, userId) {
    for (const [experimentId, experiment] of this.experiments) {
      if (experiment.targetFlag === flag && experiment.enabled) {
        // Check if experiment is active
        const now = new Date();
        if (now < experiment.startDate || now > experiment.endDate) {
          continue;
        }

        // Check user eligibility
        if (this.isUserInExperiment(userId, experiment)) {
          return this.getExperimentVariant(userId, experiment);
        }
      }
    }
    
    return null;
  }

  // Check if user is in experiment
  isUserInExperiment(userId, experiment) {
    // Simple hash-based user assignment
    const hash = this.hashUserId(userId, experiment);
    const percentage = (hash % 100) + 1;
    
    return percentage <= experiment.percentage;
  }

  // Get experiment variant for user
  getExperimentVariant(userId, experiment) {
    const hash = this.hashUserId(userId, experiment);
    const percentage = (hash % 100) + 1;
    
    let cumulativePercentage = 0;
    for (const [variant, weight] of Object.entries(experiment.variants)) {
      cumulativePercentage += weight;
      if (percentage <= cumulativePercentage) {
        return variant === 'experimental';
      }
    }
    
    return false;
  }

  // Hash user ID for consistent assignment
  hashUserId(userId, experiment) {
    const crypto = require('crypto');
    const data = `${userId}_${experiment.targetFlag}_${experiment.startDate.toISOString()}`;
    return crypto.createHash('md5').update(data).digest('readUInt32BE');
  }

  // Get flag description
  getFlagDescription(flag) {
    const descriptions = {
      'api.v2.enabled': 'Enable API v2 endpoints',
      'api.v2.beta': 'Enable API v2 beta features',
      'api.rate_limiting.enhanced': 'Enable enhanced rate limiting',
      'auth.jwt.refresh_rotation': 'Enable JWT refresh token rotation',
      'auth.session.revocation': 'Enable session revocation',
      'voting.real_time.enabled': 'Enable real-time voting',
      'ml.fraud_detection.enabled': 'Enable ML fraud detection',
      'realtime.websocket.enabled': 'Enable WebSocket connections',
      'admin.advanced_dashboard': 'Enable advanced admin dashboard',
      'security.advanced_audit.enabled': 'Enable advanced security auditing',
      'experimental.ai_chat.enabled': 'Enable experimental AI chat features'
    };
    
    return descriptions[flag] || 'No description available';
  }

  // Set feature flag
  setFlag(flag, enabled, scope = 'global', userId = null, tenantId = null) {
    const flagData = {
      enabled,
      type: scope,
      lastModified: new Date().toISOString()
    };

    if (scope === 'global') {
      this.flags.set(flag, flagData);
    } else if (scope === 'user' && userId) {
      if (!this.userFlags.has(userId)) {
        this.userFlags.set(userId, { flags: new Map(), lastModified: new Date().toISOString() });
      }
      this.userFlags.get(userId).flags.set(flag, flagData);
      this.userFlags.get(userId).lastModified = new Date().toISOString();
    } else if (scope === 'tenant' && tenantId) {
      if (!this.tenantFlags.has(tenantId)) {
        this.tenantFlags.set(tenantId, { flags: new Map(), lastModified: new Date().toISOString() });
      }
      this.tenantFlags.get(tenantId).flags.set(flag, flagData);
      this.tenantFlags.get(tenantId).lastModified = new Date().toISOString();
    }

    this.emit('flagChanged', { flag, enabled, scope, userId, tenantId });
    
    logger.info('Feature flag updated', {
      flag,
      enabled,
      scope,
      userId,
      tenantId
    });
  }

  // Get all flags for user
  getUserFlags(userId, tenantId = null) {
    const userFlags = {};
    
    // Get global flags
    for (const [flag, data] of this.flags) {
      userFlags[flag] = {
        enabled: data.enabled,
        type: data.type,
        source: 'global'
      };
    }
    
    // Get user-specific flags
    if (this.userFlags.has(userId)) {
      for (const [flag, data] of this.userFlags.get(userId).flags) {
        userFlags[flag] = {
          enabled: data.enabled,
          type: data.type,
          source: 'user'
        };
      }
    }
    
    // Get tenant-specific flags
    if (tenantId && this.tenantFlags.has(tenantId)) {
      for (const [flag, data] of this.tenantFlags.get(tenantId).flags) {
        userFlags[flag] = {
          enabled: data.enabled,
          type: data.type,
          source: 'tenant'
        };
      }
    }
    
    // Check experiments
    for (const [experimentId, experiment] of this.experiments) {
      if (experiment.enabled && this.isUserInExperiment(userId, experiment)) {
        const variant = this.getExperimentVariant(userId, experiment);
        userFlags[experiment.targetFlag] = {
          enabled: variant,
          type: 'experiment',
          source: 'experiment',
          experimentId,
          variant
        };
      }
    }
    
    return userFlags;
  }

  // Get flag statistics
  getFlagStats() {
    const stats = {
      globalFlags: this.flags.size,
      userFlags: this.userFlags.size,
      tenantFlags: this.tenantFlags.size,
      experiments: this.experiments.size,
      enabledGlobalFlags: 0,
      disabledGlobalFlags: 0,
      activeExperiments: 0
    };
    
    for (const flag of this.flags.values()) {
      if (flag.enabled) {
        stats.enabledGlobalFlags++;
      } else {
        stats.disabledGlobalFlags++;
      }
    }
    
    for (const experiment of this.experiments.values()) {
      if (experiment.enabled) {
        stats.activeExperiments++;
      }
    }
    
    return stats;
  }

  // Start cleanup process
  startCleanup() {
    setInterval(() => {
      this.cleanupExpiredExperiments();
    }, 60 * 60 * 1000); // Check every hour
  }

  // Clean up expired experiments
  cleanupExpiredExperiments() {
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [experimentId, experiment] of this.experiments) {
      if (now > experiment.endDate) {
        this.experiments.delete(experimentId);
        cleanedCount++;
        
        logger.info('Experiment expired and cleaned up', {
          experimentId,
          targetFlag: experiment.targetFlag,
          endDate: experiment.endDate
        });
      }
    }
    
    if (cleanedCount > 0) {
      this.emit('experimentsCleaned', { count: cleanedCount });
    }
  }

  // Export configuration
  exportConfig() {
    return {
      globalFlags: Object.fromEntries(this.flags),
      userFlags: Object.fromEntries(
        Array.from(this.userFlags.entries()).map(([userId, data]) => [
          userId,
          {
            flags: Object.fromEntries(data.flags),
            lastModified: data.lastModified
          }
        ])
      ),
      tenantFlags: Object.fromEntries(
        Array.from(this.tenantFlags.entries()).map(([tenantId, data]) => [
          tenantId,
          {
            flags: Object.fromEntries(data.flags),
            lastModified: data.lastModified
          }
        ])
      ),
      experiments: Object.fromEntries(this.experiments),
      statistics: this.getFlagStats(),
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const featureFlagManager = new FeatureFlagManager();

module.exports = featureFlagManager;
