const { logger } = require('../../utils/logger');
const EventEmitter = require('events');

class TenantConfigManager extends EventEmitter {
  constructor() {
    super();
    this.tenants = new Map();
    this.defaultConfig = this.getDefaultTenantConfig();
    this.configCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    this.loadTenantConfigs();
    this.startCacheCleanup();
  }

  // Get default tenant configuration
  getDefaultTenantConfig() {
    return {
      // Basic tenant settings
      name: 'Default Tenant',
      domain: 'default.votewave.com',
      timezone: 'UTC',
      locale: 'en-US',
      
      // Security settings
      security: {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false,
          maxAge: 90 // days
        },
        sessionTimeout: 30, // minutes
        maxLoginAttempts: 5,
        lockoutDuration: 15, // minutes
        twoFactorEnabled: false,
        ipWhitelist: [],
        geoRestrictions: {
          enabled: false,
          allowedCountries: [],
          blockedCountries: []
        }
      },
      
      // Voting settings
      voting: {
        maxConcurrentElections: 10,
        maxVotersPerElection: 10000,
        votingDuration: {
          min: 1, // hour
          max: 30 // days
        },
        anonymousVoting: false,
        realTimeResults: true,
        requireVerification: false,
        cooldownPeriod: 0 // minutes between votes
      },
      
      // Rate limiting
      rateLimiting: {
        auth: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 5
        },
        voting: {
          windowMs: 60 * 1000, // 1 minute
          max: 10
        },
        api: {
          windowMs: 60 * 1000, // 1 minute
          max: 100
        },
        websocket: {
          windowMs: 60 * 1000, // 1 minute
          max: 50
        }
      },
      
      // Feature flags
      features: {
        advancedAnalytics: false,
        mlFraudDetection: true,
        realTimeNotifications: true,
        customBranding: false,
        apiAccess: true,
        webhookSupport: false,
        auditLogs: true,
        exportData: true,
        multiLanguage: false,
        mobileApp: false
      },
      
      // Storage limits
      storage: {
        maxUsers: 1000,
        maxElections: 100,
        maxStorage: 10 * 1024 * 1024 * 1024, // 10GB
        retentionPeriod: 365, // days
        backupFrequency: 'daily'
      },
      
      // Integration settings
      integrations: {
        email: {
          enabled: true,
          provider: 'smtp',
          settings: {}
        },
        sms: {
          enabled: false,
          provider: 'twilio',
          settings: {}
        },
        webhook: {
          enabled: false,
          endpoints: []
        },
        sso: {
          enabled: false,
          providers: []
        }
      },
      
      // Compliance settings
      compliance: {
        gdpr: {
          enabled: false,
          dataRetention: 365,
          rightToDeletion: true
        },
        hipaa: {
          enabled: false,
          auditLogging: true
        },
        sox: {
          enabled: false,
          auditTrail: true
        }
      },
      
      // Billing settings
      billing: {
        plan: 'free',
        limits: {
          users: 100,
          elections: 10,
          votes: 10000,
          storage: 1024 * 1024 * 1024 // 1GB
        },
        overage: {
          enabled: false,
          rate: 0.01 // per vote
        }
      }
    };
  }

  // Load tenant configurations
  async loadTenantConfigs() {
    try {
      // This would load from database or external service
      const tenantConfigs = await this.loadFromDatabase();
      
      for (const [tenantId, config] of Object.entries(tenantConfigs)) {
        this.tenants.set(tenantId, this.mergeWithDefaults(config));
      }
      
      logger.info('Tenant configurations loaded', {
        tenantCount: this.tenants.size,
        tenants: Array.from(this.tenants.keys())
      });
      
      this.emit('tenantsLoaded');
      
    } catch (error) {
      logger.error('Failed to load tenant configurations', {
        error: error.message
      });
      
      // Load default tenant as fallback
      this.tenants.set('default', this.defaultConfig);
    }
  }

  // Load from database (mock implementation)
  async loadFromDatabase() {
    // This would be replaced with actual database queries
    return {
      'enterprise-1': {
        name: 'Enterprise Corp',
        domain: 'enterprise.votewave.com',
        security: {
          passwordPolicy: {
            minLength: 12,
            requireSpecialChars: true
          },
          twoFactorEnabled: true,
          ipWhitelist: ['192.168.1.0/24']
        },
        voting: {
          maxVotersPerElection: 50000,
          realTimeResults: true,
          requireVerification: true
        },
        features: {
          advancedAnalytics: true,
          mlFraudDetection: true,
          customBranding: true,
          webhookSupport: true
        },
        storage: {
          maxUsers: 10000,
          maxElections: 1000,
          maxStorage: 100 * 1024 * 1024 * 1024 // 100GB
        },
        billing: {
          plan: 'enterprise',
          limits: {
            users: 10000,
            elections: 1000,
            votes: 1000000,
            storage: 100 * 1024 * 1024 * 1024
          }
        }
      },
      'beta-2': {
        name: 'Beta Organization',
        domain: 'beta.votewave.com',
        features: {
          advancedAnalytics: true,
          mlFraudDetection: true,
          apiAccess: true,
          multiLanguage: true
        },
        voting: {
          maxVotersPerElection: 5000,
          anonymousVoting: true
        }
      }
    };
  }

  // Merge tenant config with defaults
  mergeWithDefaults(tenantConfig) {
    return this.deepMerge(this.defaultConfig, tenantConfig);
  }

  // Deep merge objects
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  // Get tenant configuration
  getTenantConfig(tenantId) {
    const cacheKey = `tenant_${tenantId}`;
    const cached = this.configCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.config;
    }
    
    const config = this.tenants.get(tenantId) || this.defaultConfig;
    
    this.configCache.set(cacheKey, {
      config,
      timestamp: Date.now()
    });
    
    return config;
  }

  // Get specific tenant setting
  getTenantSetting(tenantId, path, defaultValue = undefined) {
    const config = this.getTenantConfig(tenantId);
    return this.getNestedValue(config, path, defaultValue);
  }

  // Get nested value from object
  getNestedValue(obj, path, defaultValue = undefined) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : defaultValue;
    }, obj);
  }

  // Update tenant configuration
  async updateTenantConfig(tenantId, updates) {
    try {
      const currentConfig = this.getTenantConfig(tenantId);
      const newConfig = this.deepMerge(currentConfig, updates);
      
      // Validate configuration
      const validation = this.validateTenantConfig(newConfig);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }
      
      // Update in memory
      this.tenants.set(tenantId, newConfig);
      
      // Clear cache
      this.clearCache(tenantId);
      
      // Save to database
      await this.saveToDatabase(tenantId, newConfig);
      
      logger.info('Tenant configuration updated', {
        tenantId,
        updatedFields: Object.keys(updates)
      });
      
      this.emit('tenantConfigUpdated', { tenantId, updates, newConfig });
      
      return newConfig;
      
    } catch (error) {
      logger.error('Failed to update tenant configuration', {
        tenantId,
        error: error.message
      });
      
      throw error;
    }
  }

  // Validate tenant configuration
  validateTenantConfig(config) {
    const errors = [];
    
    // Validate required fields
    if (!config.name || typeof config.name !== 'string') {
      errors.push('Tenant name is required and must be a string');
    }
    
    if (!config.domain || typeof config.domain !== 'string') {
      errors.push('Tenant domain is required and must be a string');
    }
    
    // Validate security settings
    if (config.security?.passwordPolicy) {
      const policy = config.security.passwordPolicy;
      
      if (policy.minLength < 6) {
        errors.push('Password minimum length must be at least 6');
      }
      
      if (policy.maxAge && policy.maxAge < 1) {
        errors.push('Password maximum age must be at least 1 day');
      }
    }
    
    // Validate voting settings
    if (config.voting?.maxVotersPerElection) {
      if (config.voting.maxVotersPerElection < 1) {
        errors.push('Maximum voters per election must be at least 1');
      }
      
      if (config.voting.maxVotersPerElection > 1000000) {
        errors.push('Maximum voters per election cannot exceed 1,000,000');
      }
    }
    
    // Validate rate limiting
    if (config.rateLimiting) {
      for (const [type, limits] of Object.entries(config.rateLimiting)) {
        if (limits.max < 1) {
          errors.push(`Rate limit max for ${type} must be at least 1`);
        }
        
        if (limits.windowMs < 1000) {
          errors.push(`Rate limit window for ${type} must be at least 1000ms`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Save to database (mock implementation)
  async saveToDatabase(tenantId, config) {
    // This would be replaced with actual database operations
    logger.debug('Saving tenant configuration to database', {
      tenantId,
      configKeys: Object.keys(config)
    });
  }

  // Clear cache for tenant
  clearCache(tenantId) {
    const cacheKey = `tenant_${tenantId}`;
    this.configCache.delete(cacheKey);
  }

  // Clear all cache
  clearAllCache() {
    this.configCache.clear();
    logger.debug('All tenant configuration cache cleared');
  }

  // Start cache cleanup
  startCacheCleanup() {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60 * 1000); // Check every minute
  }

  // Clean up expired cache entries
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of this.configCache) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.configCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('Expired tenant configuration cache cleaned', {
        cleanedCount,
        remainingCache: this.configCache.size
      });
    }
  }

  // Get tenant statistics
  getTenantStats() {
    const stats = {
      totalTenants: this.tenants.size,
      activeTenants: 0,
      enterpriseTenants: 0,
      betaTenants: 0,
      featuresEnabled: {},
      cacheSize: this.configCache.size
    };
    
    for (const [tenantId, config] of this.tenants) {
      // Count active tenants (with recent activity)
      // This would check last activity timestamp
      
      // Count by plan type
      if (config.billing?.plan === 'enterprise') {
        stats.enterpriseTenants++;
      } else if (config.billing?.plan === 'beta') {
        stats.betaTenants++;
      }
      
      // Count enabled features
      for (const [feature, enabled] of Object.entries(config.features || {})) {
        if (enabled) {
          stats.featuresEnabled[feature] = (stats.featuresEnabled[feature] || 0) + 1;
        }
      }
    }
    
    stats.activeTenants = stats.totalTenants; // Simplified for now
    
    return stats;
  }

  // Check if tenant has feature enabled
  hasFeature(tenantId, feature) {
    const config = this.getTenantConfig(tenantId);
    return this.getNestedValue(config, `features.${feature}`, false);
  }

  // Get tenant rate limits
  getRateLimits(tenantId, type) {
    const config = this.getTenantConfig(tenantId);
    const defaultLimits = this.getNestedValue(this.defaultConfig, `rateLimiting.${type}`, {});
    const tenantLimits = this.getNestedValue(config, `rateLimiting.${type}`, {});
    
    return { ...defaultLimits, ...tenantLimits };
  }

  // Export all tenant configurations
  exportConfigs() {
    const configs = {};
    
    for (const [tenantId, config] of this.tenants) {
      configs[tenantId] = {
        ...config,
        // Remove sensitive data
        security: {
          ...config.security,
          ipWhitelist: config.security.ipWhitelist ? '[REDACTED]' : undefined
        }
      };
    }
    
    return {
      timestamp: new Date().toISOString(),
      tenantCount: this.tenants.size,
      configs,
      statistics: this.getTenantStats()
    };
  }
}

// Create singleton instance
const tenantConfigManager = new TenantConfigManager();

module.exports = tenantConfigManager;
