const { logger } = require('../../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class ConfigLoader extends EventEmitter {
  constructor() {
    super();
    this.config = {};
    this.watchers = new Map();
    this.environment = process.env.NODE_ENV || 'development';
    this.region = process.env.AWS_REGION || process.env.REGION || 'us-east-1';
    this.tenantId = process.env.TENANT_ID || 'default';
    
    this.loadConfig();
    this.startWatching();
  }

  // Load configuration from multiple sources
  async loadConfig() {
    try {
      // Load base configuration
      await this.loadBaseConfig();
      
      // Load environment-specific configuration
      await this.loadEnvironmentConfig();
      
      // Load tenant-specific configuration
      await this.loadTenantConfig();
      
      // Load regional configuration
      await this.loadRegionalConfig();
      
      // Load feature flags
      await this.loadFeatureFlags();
      
      // Validate configuration
      this.validateConfig();
      
      logger.info('Configuration loaded successfully', {
        environment: this.environment,
        region: this.region,
        tenantId: this.tenantId,
        configKeys: Object.keys(this.config)
      });
      
      this.emit('configLoaded', this.config);
      
    } catch (error) {
      logger.error('Failed to load configuration', {
        error: error.message,
        environment: this.environment,
        region: this.region,
        tenantId: this.tenantId
      });
      
      throw error;
    }
  }

  // Load base configuration
  async loadBaseConfig() {
    const baseConfigPath = path.join(__dirname, 'base.json');
    
    try {
      const baseConfig = await fs.readFile(baseConfigPath, 'utf8');
      this.config = { ...this.config, ...JSON.parse(baseConfig) };
      
      logger.debug('Base configuration loaded', {
        path: baseConfigPath,
        keys: Object.keys(JSON.parse(baseConfig))
      });
    } catch (error) {
      logger.warn('Base configuration not found, using defaults', {
        path: baseConfigPath,
        error: error.message
      });
      
      // Set default base configuration
      this.config = {
        ...this.config,
        server: {
          port: 5000,
          host: '0.0.0.0'
        },
        database: {
          timeout: 30000,
          poolSize: 10
        },
        redis: {
          timeout: 5000,
          maxRetries: 3
        },
        security: {
          jwtExpiry: '15m',
          refreshExpiry: '7d'
        }
      };
    }
  }

  // Load environment-specific configuration
  async loadEnvironmentConfig() {
    const envConfigPath = path.join(__dirname, `${this.environment}.json`);
    
    try {
      const envConfig = await fs.readFile(envConfigPath, 'utf8');
      this.config = { ...this.config, ...JSON.parse(envConfig) };
      
      logger.debug('Environment configuration loaded', {
        environment: this.environment,
        path: envConfigPath,
        keys: Object.keys(JSON.parse(envConfig))
      });
    } catch (error) {
      logger.warn('Environment configuration not found', {
        environment: this.environment,
        path: envConfigPath,
        error: error.message
      });
    }
  }

  // Load tenant-specific configuration
  async loadTenantConfig() {
    const tenantConfigPath = path.join(__dirname, 'tenants', `${this.tenantId}.json`);
    
    try {
      const tenantConfig = await fs.readFile(tenantConfigPath, 'utf8');
      this.config = { ...this.config, ...JSON.parse(tenantConfig) };
      
      logger.debug('Tenant configuration loaded', {
        tenantId: this.tenantId,
        path: tenantConfigPath,
        keys: Object.keys(JSON.parse(tenantConfig))
      });
    } catch (error) {
      logger.warn('Tenant configuration not found', {
        tenantId: this.tenantId,
        path: tenantConfigPath,
        error: error.message
      });
    }
  }

  // Load regional configuration
  async loadRegionalConfig() {
    const regionalConfigPath = path.join(__dirname, 'regions', `${this.region}.json`);
    
    try {
      const regionalConfig = await fs.readFile(regionalConfigPath, 'utf8');
      this.config = { ...this.config, ...JSON.parse(regionalConfig) };
      
      logger.debug('Regional configuration loaded', {
        region: this.region,
        path: regionalConfigPath,
        keys: Object.keys(JSON.parse(regionalConfig))
      });
    } catch (error) {
      logger.warn('Regional configuration not found', {
        region: this.region,
        path: regionalConfigPath,
        error: error.message
      });
    }
  }

  // Load feature flags
  async loadFeatureFlags() {
    const featureFlagsPath = path.join(__dirname, 'featureFlags.json');
    
    try {
      const featureFlags = await fs.readFile(featureFlagsPath, 'utf8');
      this.config.featureFlags = { ...JSON.parse(featureFlags) };
      
      logger.debug('Feature flags loaded', {
        path: featureFlagsPath,
        flags: Object.keys(JSON.parse(featureFlags))
      });
    } catch (error) {
      logger.warn('Feature flags not found, using defaults', {
        path: featureFlagsPath,
        error: error.message
      });
      
      // Set default feature flags
      this.config.featureFlags = {
        enableV2API: false,
        enableMLInference: true,
        enableRealtimeAnalytics: true,
        enableAdvancedSecurity: true,
        enableExperimentalFeatures: false
      };
    }
  }

  // Validate loaded configuration
  validateConfig() {
    const required = [
      'server.port',
      'database.uri',
      'redis.uri',
      'security.jwtSecret'
    ];

    const missing = [];
    
    for (const key of required) {
      if (!this.getNestedValue(this.config, key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    // Validate types
    this.validateTypes();
    
    logger.debug('Configuration validation passed');
  }

  // Validate configuration types
  validateTypes() {
    const typeValidations = {
      'server.port': 'number',
      'database.poolSize': 'number',
      'security.jwtExpiry': 'string',
      'featureFlags': 'object'
    };

    for (const [key, expectedType] of Object.entries(typeValidations)) {
      const value = this.getNestedValue(this.config, key);
      
      if (value !== undefined && typeof value !== expectedType) {
        logger.warn('Configuration type mismatch', {
          key,
          expectedType,
          actualType: typeof value,
          value
        });
      }
    }
  }

  // Get nested configuration value
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  // Get configuration value
  get(key, defaultValue = undefined) {
    const value = this.getNestedValue(this.config, key);
    return value !== undefined ? value : defaultValue;
  }

  // Set configuration value
  set(key, value) {
    const keys = key.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    
    logger.debug('Configuration value set', {
      key,
      value
    });
    
    this.emit('configChanged', { key, value });
  }

  // Check if feature flag is enabled
  isFeatureEnabled(featureName) {
    return this.get(`featureFlags.${featureName}`, false);
  }

  // Get tenant-specific configuration
  getTenantConfig(tenantId = this.tenantId) {
    return this.get(`tenants.${tenantId}`, {});
  }

  // Get regional configuration
  getRegionalConfig(region = this.region) {
    return this.get(`regions.${region}`, {});
  }

  // Start watching configuration files for changes
  startWatching() {
    const configDir = __dirname;
    
    try {
      // Watch all configuration files
      const watcher = fs.watch(configDir, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          logger.info('Configuration file changed', {
            eventType,
            filename
          });
          
          // Reload configuration
          this.loadConfig().catch(error => {
            logger.error('Failed to reload configuration', {
              error: error.message,
              filename
            });
          });
        }
      });
      
      this.watchers.set(configDir, watcher);
      
      logger.info('Configuration watching started', {
        configDir
      });
      
    } catch (error) {
      logger.error('Failed to start configuration watching', {
        configDir,
        error: error.message
      });
    }
  }

  // Stop watching configuration files
  stopWatching() {
    for (const [dir, watcher] of this.watchers) {
      try {
        watcher.close();
        logger.info('Configuration watching stopped', { dir });
      } catch (error) {
        logger.error('Failed to stop configuration watching', {
          dir,
          error: error.message
        });
      }
    }
    
    this.watchers.clear();
  }

  // Get all configuration
  getAll() {
    return { ...this.config };
  }

  // Reload configuration
  async reload() {
    logger.info('Reloading configuration');
    
    this.config = {};
    await this.loadConfig();
    
    this.emit('configReloaded', this.config);
  }

  // Export configuration for debugging
  exportConfig() {
    return {
      environment: this.environment,
      region: this.region,
      tenantId: this.tenantId,
      config: this.getAll(),
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const configLoader = new ConfigLoader();

module.exports = configLoader;
