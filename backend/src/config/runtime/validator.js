const { logger } = require('../../utils/logger');

class ConfigValidator {
  constructor() {
    this.schemas = {
      server: {
        port: { type: 'number', min: 1, max: 65535, required: true },
        host: { type: 'string', required: true },
        ssl: { type: 'boolean', default: false },
        cors: { type: 'object', properties: {
          origin: { type: 'string', default: '*' },
          credentials: { type: 'boolean', default: true }
        }}
      },
      database: {
        uri: { type: 'string', required: true },
        timeout: { type: 'number', min: 1000, max: 300000, default: 30000 },
        poolSize: { type: 'number', min: 1, max: 100, default: 10 },
        retryAttempts: { type: 'number', min: 0, max: 10, default: 3 }
      },
      redis: {
        uri: { type: 'string', required: true },
        timeout: { type: 'number', min: 1000, max: 60000, default: 5000 },
        maxRetries: { type: 'number', min: 0, max: 10, default: 3 },
        keyPrefix: { type: 'string', default: 'votewave:' }
      },
      security: {
        jwtSecret: { type: 'string', minLength: 32, required: true },
        jwtExpiry: { type: 'string', pattern: /^(\d+[smhd])$/, default: '15m' },
        refreshExpiry: { type: 'string', pattern: /^(\d+[smhd])$/, default: '7d' },
        sessionSecret: { type: 'string', minLength: 32, required: true },
        bcryptRounds: { type: 'number', min: 10, max: 15, default: 12 }
      },
      logging: {
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'], default: 'info' },
        format: { type: 'string', enum: ['json', 'text'], default: 'json' },
        file: { type: 'string', default: './logs/app.log' },
        maxSize: { type: 'string', pattern: /^\d+[KMGT]?B$/, default: '10MB' }
      },
      monitoring: {
        enabled: { type: 'boolean', default: true },
        metricsPort: { type: 'number', min: 1, max: 65535, default: 9090 },
        healthCheckInterval: { type: 'number', min: 5000, max: 300000, default: 30000 }
      },
      featureFlags: {
        type: 'object',
        patternProperties: {
          '^[a-zA-Z][a-zA-Z0-9_]*$': { type: 'boolean' }
        }
      }
    };
  }

  // Validate configuration object
  validate(config) {
    const errors = [];
    const warnings = [];

    // Validate each section
    for (const [section, schema] of Object.entries(this.schemas)) {
      const sectionConfig = config[section];
      
      if (!sectionConfig) {
        if (this.isRequiredSection(section)) {
          errors.push(`Missing required configuration section: ${section}`);
        }
        continue;
      }

      const sectionErrors = this.validateSection(sectionConfig, schema, section);
      errors.push(...sectionErrors);
    }

    // Validate cross-section dependencies
    const dependencyErrors = this.validateDependencies(config);
    errors.push(...dependencyErrors);

    // Validate environment-specific requirements
    const environmentErrors = this.validateEnvironmentRequirements(config);
    errors.push(...environmentErrors);

    // Generate warnings for best practices
    const bestPracticeWarnings = this.validateBestPractices(config);
    warnings.push(...bestPracticeWarnings);

    const result = {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        errorCount: errors.length,
        warningCount: warnings.length
      }
    };

    if (!result.valid) {
      logger.error('Configuration validation failed', {
        errors,
        warnings
      });
    } else {
      logger.info('Configuration validation passed', {
        warnings: warnings.length
      });
    }

    return result;
  }

  // Validate configuration section
  validateSection(config, schema, sectionName) {
    const errors = [];

    for (const [key, rules] of Object.entries(schema)) {
      const value = config[key];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`${sectionName}.${key} is required`);
        continue;
      }

      // Skip validation if field is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${sectionName}.${key} must be of type ${rules.type}, got ${typeof value}`);
        continue;
      }

      // Specific validations based on type
      if (rules.type === 'string') {
        errors.push(...this.validateString(value, rules, sectionName, key));
      } else if (rules.type === 'number') {
        errors.push(...this.validateNumber(value, rules, sectionName, key));
      } else if (rules.type === 'boolean') {
        errors.push(...this.validateBoolean(value, rules, sectionName, key));
      } else if (rules.type === 'object') {
        errors.push(...this.validateObject(value, rules, sectionName, key));
      }
    }

    return errors;
  }

  // Validate string values
  validateString(value, rules, section, key) {
    const errors = [];
    const fullPath = `${section}.${key}`;

    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${fullPath} must be at least ${rules.minLength} characters long`);
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`${fullPath} must be no more than ${rules.maxLength} characters long`);
    }

    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(`${fullPath} does not match required pattern`);
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${fullPath} must be one of: ${rules.enum.join(', ')}`);
    }

    return errors;
  }

  // Validate number values
  validateNumber(value, rules, section, key) {
    const errors = [];
    const fullPath = `${section}.${key}`;

    if (rules.min !== undefined && value < rules.min) {
      errors.push(`${fullPath} must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && value > rules.max) {
      errors.push(`${fullPath} must be no more than ${rules.max}`);
    }

    return errors;
  }

  // Validate boolean values
  validateBoolean(value, rules, section, key) {
    const errors = [];
    const fullPath = `${section}.${key}`;

    if (typeof value !== 'boolean') {
      errors.push(`${fullPath} must be a boolean value`);
    }

    return errors;
  }

  // Validate object values
  validateObject(value, rules, section, key) {
    const errors = [];
    const fullPath = `${section}.${key}`;

    if (typeof value !== 'object' || value === null) {
      errors.push(`${fullPath} must be an object`);
      return errors;
    }

    if (rules.properties) {
      for (const [propKey, propRules] of Object.entries(rules.properties)) {
        const propValue = value[propKey];
        
        if (propRules.required && (propValue === undefined || propValue === null)) {
          errors.push(`${fullPath}.${propKey} is required`);
          continue;
        }

        if (propValue !== undefined && propValue !== null) {
          if (propRules.type && typeof propValue !== propRules.type) {
            errors.push(`${fullPath}.${propKey} must be of type ${propRules.type}`);
          }
        }
      }
    }

    return errors;
  }

  // Validate cross-section dependencies
  validateDependencies(config) {
    const errors = [];

    // SSL dependency
    if (config.server?.ssl && !config.server?.certPath) {
      errors.push('server.certPath is required when server.ssl is enabled');
    }

    if (config.server?.ssl && !config.server?.keyPath) {
      errors.push('server.keyPath is required when server.ssl is enabled');
    }

    // Database URI validation
    if (config.database?.uri) {
      try {
        new URL(config.database.uri);
      } catch (error) {
        errors.push('database.uri must be a valid URI');
      }
    }

    // Redis URI validation
    if (config.redis?.uri) {
      try {
        new URL(config.redis.uri);
      } catch (error) {
        errors.push('redis.uri must be a valid URI');
      }
    }

    return errors;
  }

  // Validate environment-specific requirements
  validateEnvironmentRequirements(config) {
    const errors = [];
    const environment = process.env.NODE_ENV || 'development';

    // Production requirements
    if (environment === 'production') {
      if (!config.security?.jwtSecret || config.security.jwtSecret.length < 64) {
        errors.push('security.jwtSecret must be at least 64 characters in production');
      }

      if (!config.security?.sessionSecret || config.security.sessionSecret.length < 64) {
        errors.push('security.sessionSecret must be at least 64 characters in production');
      }

      if (config.logging?.level === 'debug') {
        errors.push('logging.level should not be debug in production');
      }

      if (!config.monitoring?.enabled) {
        errors.push('monitoring.enabled should be true in production');
      }
    }

    return errors;
  }

  // Validate best practices
  validateBestPractices(config) {
    const warnings = [];

    // Security best practices
    if (config.security?.jwtSecret && config.security.jwtSecret.length < 64) {
      warnings.push('Consider using a longer JWT secret (64+ characters)');
    }

    if (config.security?.bcryptRounds && config.security.bcryptRounds < 12) {
      warnings.push('Consider using at least 12 bcrypt rounds for better security');
    }

    // Performance best practices
    if (config.database?.poolSize && config.database.poolSize < 5) {
      warnings.push('Consider using a larger database pool size for better performance');
    }

    if (config.database?.timeout && config.database.timeout > 30000) {
      warnings.push('Consider reducing database timeout to avoid hanging requests');
    }

    // Logging best practices
    if (config.logging?.file && !config.logging?.file.includes('logs/')) {
      warnings.push('Consider storing log files in a dedicated logs directory');
    }

    // Feature flags best practices
    if (config.featureFlags) {
      const experimentalFlags = Object.keys(config.featureFlags)
        .filter(key => key.toLowerCase().includes('experimental'))
        .filter(key => config.featureFlags[key]);

      if (experimentalFlags.length > 0) {
        warnings.push(`Experimental features enabled: ${experimentalFlags.join(', ')}`);
      }
    }

    return warnings;
  }

  // Check if section is required
  isRequiredSection(sectionName) {
    const requiredSections = ['server', 'database', 'redis', 'security'];
    return requiredSections.includes(sectionName);
  }

  // Get default configuration
  getDefaults() {
    const defaults = {};

    for (const [section, schema] of Object.entries(this.schemas)) {
      defaults[section] = {};
      
      for (const [key, rules] of Object.entries(schema)) {
        if (rules.default !== undefined) {
          defaults[section][key] = rules.default;
        }
      }
    }

    return defaults;
  }

  // Merge configuration with defaults
  mergeWithDefaults(config) {
    const defaults = this.getDefaults();
    
    return this.deepMerge(defaults, config);
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
}

module.exports = ConfigValidator;
