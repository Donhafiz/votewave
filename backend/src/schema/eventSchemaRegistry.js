const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');
const crypto = require('crypto');

class EventSchemaRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      registryPrefix: options.registryPrefix || 'schema_registry:',
      versionPrefix: options.versionPrefix || 'version:',
      compatibilityPrefix: options.compatibilityPrefix || 'compatibility:',
      cachePrefix: options.cachePrefix || 'schema_cache:',
      defaultCompatibility: options.defaultCompatibility || 'backward',
      enableValidation: options.enableValidation !== false,
      enableCaching: options.enableCaching !== false,
      cacheTTL: options.cacheTTL || 3600, // 1 hour
      ...options
    };

    this.schemas = new Map();
    this.versions = new Map();
    this.compatibilityRules = new Map();
    this.cache = new Map();
    
    this.initializeCompatibilityRules();
    this.startCacheCleanup();
  }

  /**
   * Initialize default compatibility rules
   */
  initializeCompatibilityRules() {
    // Backward compatibility (default)
    this.addCompatibilityRule('backward', {
      description: 'Consumers can read older producers',
      validate: (oldSchema, newSchema) => this.validateBackwardCompatibility(oldSchema, newSchema)
    });

    // Forward compatibility
    this.addCompatibilityRule('forward', {
      description: 'Producers can write to older consumers',
      validate: (oldSchema, newSchema) => this.validateForwardCompatibility(oldSchema, newSchema)
    });

    // Full compatibility
    this.addCompatibilityRule('full', {
      description: 'Both backward and forward compatible',
      validate: (oldSchema, newSchema) => {
        return this.validateBackwardCompatibility(oldSchema, newSchema) &&
               this.validateForwardCompatibility(oldSchema, newSchema);
      }
    });

    // None compatibility (breaking changes allowed)
    this.addCompatibilityRule('none', {
      description: 'No compatibility guarantees',
      validate: () => true
    });
  }

  /**
   * Register event schema
   */
  async registerSchema(eventType, version, schema, options = {}) {
    try {
      const schemaId = this.generateSchemaId(eventType, version);
      
      const schemaDefinition = {
        id: schemaId,
        eventType,
        version,
        schema,
        compatibility: options.compatibility || this.options.defaultCompatibility,
        deprecated: options.deprecated || false,
        deprecationDate: options.deprecationDate || null,
        description: options.description || '',
        examples: options.examples || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: options.createdBy || 'system'
      };

      // Validate schema structure
      this.validateSchemaStructure(schema);

      // Store in Redis
      const schemaKey = `${this.options.registryPrefix}${schemaId}`;
      await this.redis.setex(
        schemaKey,
        86400, // 24 hours
        JSON.stringify(schemaDefinition)
      );

      // Store version mapping
      const versionKey = `${this.options.versionPrefix}${eventType}`;
      await this.redis.zadd(versionKey, version, schemaId);

      // Update in-memory cache
      this.schemas.set(schemaId, schemaDefinition);
      
      if (!this.versions.has(eventType)) {
        this.versions.set(eventType, new Set());
      }
      this.versions.get(eventType).add(version);

      // Clear cache for this event type
      this.clearCacheForEventType(eventType);

      logger.info('Event schema registered', {
        eventType,
        version,
        schemaId,
        compatibility: schemaDefinition.compatibility
      });

      this.emit('schemaRegistered', {
        eventType,
        version,
        schemaId,
        schema: schemaDefinition
      });

      return schemaDefinition;

    } catch (error) {
      logger.error('Failed to register schema', {
        eventType,
        version,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get event schema
   */
  async getSchema(eventType, version = null) {
    try {
      // Check cache first
      const cacheKey = `${eventType}:${version || 'latest'}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      let schemaId;

      if (version) {
        // Get specific version
        schemaId = this.generateSchemaId(eventType, version);
      } else {
        // Get latest version
        const versionKey = `${this.options.versionPrefix}${eventType}`;
        const versions = await this.redis.zrevrange(versionKey, 0, 0);
        schemaId = versions[0];
      }

      if (!schemaId) {
        throw new Error(`Schema not found for event type: ${eventType}, version: ${version || 'latest'}`);
      }

      // Get schema from Redis
      const schemaKey = `${this.options.registryPrefix}${schemaId}`;
      const schemaData = await this.redis.get(schemaKey);
      
      if (!schemaData) {
        throw new Error(`Schema data not found: ${schemaId}`);
      }

      const schema = JSON.parse(schemaData);

      // Cache the result
      if (this.options.enableCaching) {
        this.cache.set(cacheKey, schema);
        setTimeout(() => {
          this.cache.delete(cacheKey);
        }, this.options.cacheTTL * 1000);
      }

      return schema;

    } catch (error) {
      logger.error('Failed to get schema', {
        eventType,
        version,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate event against schema
   */
  async validateEvent(event, eventType = null, version = null) {
    try {
      if (!this.options.enableValidation) {
        return { valid: true };
      }

      const targetEventType = eventType || event.type;
      const targetVersion = version || event.version;

      if (!targetEventType) {
        throw new Error('Event type is required for validation');
      }

      const schema = await this.getSchema(targetEventType, targetVersion);

      // Validate event structure
      const validationResult = this.validateEventData(event, schema.schema);

      if (validationResult.valid) {
        return { valid: true, schema };
      } else {
        return {
          valid: false,
          errors: validationResult.errors,
          schema
        };
      }

    } catch (error) {
      logger.error('Failed to validate event', {
        eventType: event.type,
        version: event.version,
        error: error.message
      });
      
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Check compatibility between schema versions
   */
  async checkCompatibility(eventType, fromVersion, toVersion, compatibilityType = null) {
    try {
      const fromSchema = await this.getSchema(eventType, fromVersion);
      const toSchema = await this.getSchema(eventType, toVersion);

      const targetCompatibility = compatibilityType || toSchema.compatibility;

      const compatibilityRule = this.compatibilityRules.get(targetCompatibility);
      if (!compatibilityRule) {
        throw new Error(`Unknown compatibility type: ${targetCompatibility}`);
      }

      const isCompatible = compatibilityRule.validate(fromSchema.schema, toSchema.schema);

      return {
        compatible: isCompatible,
        fromVersion,
        toVersion,
        compatibilityType: targetCompatibility,
        fromSchema: fromSchema.schema,
        toSchema: toSchema.schema,
        rule: compatibilityRule.description
      };

    } catch (error) {
      logger.error('Failed to check compatibility', {
        eventType,
        fromVersion,
        toVersion,
        error: error.message
      });
      
      return {
        compatible: false,
        error: error.message
      };
    }
  }

  /**
   * Get all versions for event type
   */
  async getVersions(eventType) {
    try {
      const versionKey = `${this.options.versionPrefix}${eventType}`;
      const versionIds = await this.redis.zrevrange(versionKey, 0, -1);
      
      const versions = [];
      for (const schemaId of versionIds) {
        const version = parseInt(schemaId.split('_v')[1]);
        const schema = await this.getSchema(eventType, version);
        versions.push({
          version,
          schemaId,
          compatibility: schema.compatibility,
          deprecated: schema.deprecated,
          createdAt: schema.createdAt
        });
      }

      return versions;

    } catch (error) {
      logger.error('Failed to get versions', {
        eventType,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Migrate event to new schema version
   */
  async migrateEvent(event, toVersion, eventType = null) {
    try {
      const targetEventType = eventType || event.type;
      const fromVersion = event.version;

      if (fromVersion === toVersion) {
        return event; // No migration needed
      }

      // Check compatibility
      const compatibility = await this.checkCompatibility(targetEventType, fromVersion, toVersion);
      
      if (!compatibility.compatible) {
        throw new Error(`Incompatible schema migration from v${fromVersion} to v${toVersion}`);
      }

      // Get target schema
      const targetSchema = await this.getSchema(targetEventType, toVersion);

      // Perform migration
      const migratedEvent = this.performEventMigration(event, targetSchema.schema);

      // Validate migrated event
      const validation = await this.validateEvent(migratedEvent, targetEventType, toVersion);
      
      if (!validation.valid) {
        throw new Error(`Migrated event failed validation: ${validation.errors.join(', ')}`);
      }

      logger.debug('Event migrated successfully', {
        eventType: targetEventType,
        fromVersion,
        toVersion
      });

      return migratedEvent;

    } catch (error) {
      logger.error('Failed to migrate event', {
        eventType: event.type,
        fromVersion: event.version,
        toVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Deprecate schema version
   */
  async deprecateSchema(eventType, version, deprecationDate = null) {
    try {
      const schema = await this.getSchema(eventType, version);
      
      schema.deprecated = true;
      schema.deprecationDate = deprecationDate || Date.now();
      schema.updatedAt = Date.now();

      // Update in Redis
      const schemaId = this.generateSchemaId(eventType, version);
      const schemaKey = `${this.options.registryPrefix}${schemaId}`;
      await this.redis.setex(
        schemaKey,
        86400,
        JSON.stringify(schema)
      );

      // Update in-memory cache
      this.schemas.set(schemaId, schema);

      logger.info('Schema deprecated', {
        eventType,
        version,
        deprecationDate: schema.deprecationDate
      });

      this.emit('schemaDeprecated', {
        eventType,
        version,
        schema
      });

      return schema;

    } catch (error) {
      logger.error('Failed to deprecate schema', {
        eventType,
        version,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add compatibility rule
   */
  addCompatibilityRule(name, rule) {
    this.compatibilityRules.set(name, rule);
    
    logger.debug('Compatibility rule added', {
      name,
      description: rule.description
    });
  }

  /**
   * Validate backward compatibility
   */
  validateBackwardCompatibility(oldSchema, newSchema) {
    try {
      // New schema must have all required fields from old schema
      for (const [fieldName, fieldDef] of Object.entries(oldSchema.properties || {})) {
        if (fieldDef.required && (!newSchema.properties || !newSchema.properties[fieldName])) {
          return false;
        }
      }

      // Field types must be compatible
      for (const [fieldName, fieldDef] of Object.entries(oldSchema.properties || {})) {
        const newFieldDef = newSchema.properties?.[fieldName];
        if (newFieldDef && !this.areTypesCompatible(fieldDef.type, newFieldDef.type)) {
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Backward compatibility validation failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Validate forward compatibility
   */
  validateForwardCompatibility(oldSchema, newSchema) {
    try {
      // Old fields must exist in new schema with compatible types
      for (const [fieldName, fieldDef] of Object.entries(oldSchema.properties || {})) {
        const newFieldDef = newSchema.properties?.[fieldName];
        if (!newFieldDef) {
          return false;
        }
        
        if (!this.areTypesCompatible(fieldDef.type, newFieldDef.type)) {
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Forward compatibility validation failed', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check if two types are compatible
   */
  areTypesCompatible(oldType, newType) {
    // Exact match
    if (oldType === newType) {
      return true;
    }

    // Number to string conversion (generally safe)
    if (oldType === 'number' && newType === 'string') {
      return true;
    }

    // String to number conversion (potentially unsafe but allowed)
    if (oldType === 'string' && newType === 'number') {
      return true;
    }

    // Array to array with compatible element types
    if (oldType === 'array' && newType === 'array') {
      return true; // Simplified - would need to check element types
    }

    // Object to object (additional fields allowed in new schema)
    if (oldType === 'object' && newType === 'object') {
      return true;
    }

    return false;
  }

  /**
   * Validate schema structure
   */
  validateSchemaStructure(schema) {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Schema must be an object');
    }

    if (!schema.properties || typeof schema.properties !== 'object') {
      throw new Error('Schema must have properties object');
    }

    // Validate each property
    for (const [fieldName, fieldDef] of Object.entries(schema.properties)) {
      if (!fieldDef.type) {
        throw new Error(`Field ${fieldName} must have a type`);
      }

      if (!['string', 'number', 'boolean', 'object', 'array', 'null'].includes(fieldDef.type)) {
        throw new Error(`Invalid type for field ${fieldName}: ${fieldDef.type}`);
      }
    }
  }

  /**
   * Validate event data against schema
   */
  validateEventData(event, schema) {
    const errors = [];

    // Check required fields
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!event.hasOwnProperty(requiredField)) {
          errors.push(`Missing required field: ${requiredField}`);
        }
      }
    }

    // Check field types and constraints
    if (schema.properties) {
      for (const [fieldName, fieldDef] of Object.entries(schema.properties)) {
        if (event.hasOwnProperty(fieldName)) {
          const value = event[fieldName];
          
          // Type validation
          if (!this.validateFieldType(value, fieldDef.type)) {
            errors.push(`Invalid type for field ${fieldName}: expected ${fieldDef.type}, got ${typeof value}`);
          }

          // Additional constraints
          if (fieldDef.enum && !fieldDef.enum.includes(value)) {
            errors.push(`Invalid value for field ${fieldName}: must be one of ${fieldDef.enum.join(', ')}`);
          }

          if (fieldDef.minLength && typeof value === 'string' && value.length < fieldDef.minLength) {
            errors.push(`Field ${fieldName} too short: minimum ${fieldDef.minLength} characters`);
          }

          if (fieldDef.maxLength && typeof value === 'string' && value.length > fieldDef.maxLength) {
            errors.push(`Field ${fieldName} too long: maximum ${fieldDef.maxLength} characters`);
          }

          if (fieldDef.minimum && typeof value === 'number' && value < fieldDef.minimum) {
            errors.push(`Field ${fieldName} too small: minimum ${fieldDef.minimum}`);
          }

          if (fieldDef.maximum && typeof value === 'number' && value > fieldDef.maximum) {
            errors.push(`Field ${fieldName} too large: maximum ${fieldDef.maximum}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate field type
   */
  validateFieldType(value, expectedType) {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true; // Unknown type, allow
    }
  }

  /**
   * Perform event migration
   */
  performEventMigration(event, targetSchema) {
    const migratedEvent = { ...event };

    // Update version
    migratedEvent.version = targetSchema.version || event.version;

    // Handle field additions (add default values)
    if (targetSchema.properties) {
      for (const [fieldName, fieldDef] of Object.entries(targetSchema.properties)) {
        if (!migratedEvent.hasOwnProperty(fieldName)) {
          migratedEvent[fieldName] = fieldDef.default || null;
        }
      }
    }

    // Handle field removals (remove deprecated fields)
    if (targetSchema.removedFields) {
      for (const removedField of targetSchema.removedFields) {
        delete migratedEvent[removedField];
      }
    }

    // Handle field transformations
    if (targetSchema.transformations) {
      for (const [fieldName, transformation] of Object.entries(targetSchema.transformations)) {
        if (migratedEvent.hasOwnProperty(fieldName)) {
          migratedEvent[fieldName] = transformation(migratedEvent[fieldName]);
        }
      }
    }

    return migratedEvent;
  }

  /**
   * Generate schema ID
   */
  generateSchemaId(eventType, version) {
    return `${eventType}_v${version}`;
  }

  /**
   * Clear cache for event type
   */
  clearCacheForEventType(eventType) {
    for (const [cacheKey] of this.cache) {
      if (cacheKey.startsWith(`${eventType}:`)) {
        this.cache.delete(cacheKey);
      }
    }
  }

  /**
   * Start cache cleanup
   */
  startCacheCleanup() {
    setInterval(() => {
      this.cache.clear();
      logger.debug('Schema registry cache cleared');
    }, this.options.cacheTTL * 1000);
  }

  /**
   * Get registry statistics
   */
  async getStats() {
    try {
      const stats = {
        totalSchemas: this.schemas.size,
        totalEventTypes: this.versions.size,
        compatibilityRules: this.compatibilityRules.size,
        cacheSize: this.cache.size,
        eventTypes: []
      };

      // Get statistics for each event type
      for (const [eventType] of this.versions) {
        const versions = await this.getVersions(eventType);
        const latestVersion = versions[0];
        const deprecatedCount = versions.filter(v => v.deprecated).length;

        stats.eventTypes.push({
          eventType,
          totalVersions: versions.length,
          latestVersion: latestVersion?.version || 0,
          deprecatedCount,
          compatibility: latestVersion?.compatibility || 'unknown'
        });
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get registry stats', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get all schemas
   */
  async getAllSchemas() {
    try {
      const schemas = [];
      
      for (const [eventType] of this.versions) {
        const versions = await this.getVersions(eventType);
        schemas.push(...versions);
      }

      return schemas;

    } catch (error) {
      logger.error('Failed to get all schemas', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Search schemas
   */
  async searchSchemas(query) {
    try {
      const allSchemas = await this.getAllSchemas();
      
      const filtered = allSchemas.filter(schema => {
        const searchText = `${schema.eventType} ${schema.description}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      return filtered;

    } catch (error) {
      logger.error('Failed to search schemas', {
        query,
        error: error.message
      });
      return [];
    }
  }
}

// Create singleton instance
const eventSchemaRegistry = new EventSchemaRegistry({
  registryPrefix: 'schema_registry:',
  versionPrefix: 'version:',
  compatibilityPrefix: 'compatibility:',
  cachePrefix: 'schema_cache:',
  defaultCompatibility: 'backward',
  enableValidation: true,
  enableCaching: true,
  cacheTTL: 3600
});

module.exports = eventSchemaRegistry;
