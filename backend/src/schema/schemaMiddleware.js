const eventSchemaRegistry = require('./eventSchemaRegistry');
const { logger } = require('../utils/logger');

/**
 * Express middleware for event schema validation
 */
function createEventValidationMiddleware(options = {}) {
  const {
    eventTypeHeader = 'X-Event-Type',
    versionHeader = 'X-Event-Version',
    strictMode = true,
    skipPaths = ['/health', '/metrics', '/favicon.ico']
  } = options;

  return async (req, res, next) => {
    try {
      // Skip validation for specified paths
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      // Only validate event endpoints
      if (!req.path.startsWith('/events') && !req.path.startsWith('/api/events')) {
        return next();
      }

      // Get event type and version
      const eventType = req.headers[eventTypeHeader.toLowerCase()] || req.body?.type;
      const version = req.headers[versionHeader.toLowerCase()] || req.body?.version;

      if (!eventType) {
        if (strictMode) {
          return res.status(400).json({
            success: false,
            error: 'Missing event type',
            message: `Event type must be provided in header '${eventTypeHeader}' or request body`
          });
        } else {
          logger.warn('Missing event type in request', {
            path: req.path,
            method: req.method
          });
          return next();
        }
      }

      // Validate event against schema
      const validation = await eventSchemaRegistry.validateEvent(req.body, eventType, version);

      if (!validation.valid) {
        logger.warn('Event validation failed', {
          eventType,
          version,
          errors: validation.errors,
          path: req.path,
          method: req.method
        });

        return res.status(400).json({
          success: false,
          error: 'Event validation failed',
          message: 'Event does not conform to schema',
          errors: validation.errors,
          schema: validation.schema ? {
            eventType: validation.schema.eventType,
            version: validation.schema.version,
            compatibility: validation.schema.compatibility
          } : null
        });
      }

      // Add validation metadata to request
      req.eventValidation = {
        valid: true,
        eventType,
        version,
        schema: validation.schema,
        validatedAt: Date.now()
      };

      logger.debug('Event validation passed', {
        eventType,
        version,
        path: req.path
      });

      next();

    } catch (error) {
      logger.error('Event validation middleware error', {
        error: error.message,
        path: req.path,
        method: req.method
      });

      if (strictMode) {
        return res.status(500).json({
          success: false,
          error: 'Validation error',
          message: 'Failed to validate event schema'
        });
      } else {
        // In non-strict mode, allow request to proceed
        next();
      }
    }
  };
}

/**
 * Middleware for event schema compatibility checking
 */
function createCompatibilityMiddleware(options = {}) {
  const {
    targetVersionHeader = 'X-Target-Version',
    compatibilityTypeHeader = 'X-Compatibility-Type',
    strictMode = true
  } = options;

  return async (req, res, next) => {
    try {
      // Only apply to migration endpoints
      if (!req.path.includes('/migrate') && !req.path.includes('/compatibility')) {
        return next();
      }

      const eventType = req.body?.type;
      const currentVersion = req.body?.version;
      const targetVersion = req.headers[targetVersionHeader.toLowerCase()];
      const compatibilityType = req.headers[compatibilityTypeHeader.toLowerCase()] || 'backward';

      if (!eventType || !currentVersion || !targetVersion) {
        return res.status(400).json({
          success: false,
          error: 'Missing required information',
          message: 'Event type, current version, and target version are required'
        });
      }

      // Check compatibility
      const compatibility = await eventSchemaRegistry.checkCompatibility(
        eventType,
        currentVersion,
        targetVersion,
        compatibilityType
      );

      if (!compatibility.compatible) {
        logger.warn('Schema compatibility check failed', {
          eventType,
          fromVersion: currentVersion,
          toVersion: targetVersion,
          compatibilityType,
          error: compatibility.error
        });

        return res.status(400).json({
          success: false,
          error: 'Incompatible schema migration',
          message: 'Cannot migrate between incompatible schema versions',
          compatibility
        });
      }

      // Add compatibility metadata to request
      req.compatibilityCheck = {
        compatible: true,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        compatibilityType,
        checkedAt: Date.now()
      };

      next();

    } catch (error) {
      logger.error('Compatibility middleware error', {
        error: error.message,
        path: req.path
      });

      return res.status(500).json({
        success: false,
        error: 'Compatibility check error',
        message: 'Failed to check schema compatibility'
      });
    }
  };
}

/**
 * Middleware for automatic event migration
 */
function createEventMigrationMiddleware(options = {}) {
  const {
    targetVersionHeader = 'X-Target-Version',
    strictMode = true
  } = options;

  return async (req, res, next) => {
    try {
      // Only apply to migration endpoints
      if (!req.path.includes('/migrate')) {
        return next();
      }

      const eventType = req.body?.type;
      const targetVersion = req.headers[targetVersionHeader.toLowerCase()];

      if (!eventType || !targetVersion) {
        return res.status(400).json({
          success: false,
          error: 'Missing required information',
          message: 'Event type and target version are required'
        });
      }

      // Migrate event
      const migratedEvent = await eventSchemaRegistry.migrateEvent(req.body, targetVersion, eventType);

      // Replace request body with migrated event
      req.body = migratedEvent;
      req.eventMigration = {
        migrated: true,
        originalVersion: req.body.version,
        targetVersion,
        migratedAt: Date.now()
      };

      logger.debug('Event migrated successfully', {
        eventType,
        fromVersion: req.eventMigration.originalVersion,
        toVersion: targetVersion
      });

      next();

    } catch (error) {
      logger.error('Event migration middleware error', {
        error: error.message,
        path: req.path
      });

      return res.status(400).json({
        success: false,
        error: 'Event migration failed',
        message: error.message
      });
    }
  };
}

/**
 * Express route handler for schema registry API
 */
function createSchemaRegistryRoutes() {
  const express = require('express');
  const router = express.Router();

  // Get all schemas
  router.get('/', async (req, res) => {
    try {
      const { eventType, search } = req.query;
      
      let schemas;
      if (eventType) {
        schemas = await eventSchemaRegistry.getVersions(eventType);
      } else if (search) {
        schemas = await eventSchemaRegistry.searchSchemas(search);
      } else {
        schemas = await eventSchemaRegistry.getAllSchemas();
      }

      res.json({
        success: true,
        data: schemas,
        count: schemas.length
      });

    } catch (error) {
      logger.error('Failed to get schemas', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve schemas',
        message: error.message
      });
    }
  });

  // Get specific schema
  router.get('/:eventType/:version?', async (req, res) => {
    try {
      const { eventType, version } = req.params;
      
      const schema = await eventSchemaRegistry.getSchema(eventType, version);
      
      res.json({
        success: true,
        data: schema
      });

    } catch (error) {
      logger.error('Failed to get schema', {
        eventType: req.params.eventType,
        version: req.params.version,
        error: error.message
      });

      res.status(404).json({
        success: false,
        error: 'Schema not found',
        message: error.message
      });
    }
  });

  // Register new schema
  router.post('/', async (req, res) => {
    try {
      const { eventType, version, schema, options } = req.body;
      
      if (!eventType || !version || !schema) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'eventType, version, and schema are required'
        });
      }

      const registeredSchema = await eventSchemaRegistry.registerSchema(
        eventType,
        version,
        schema,
        options
      );

      res.status(201).json({
        success: true,
        data: registeredSchema,
        message: 'Schema registered successfully'
      });

    } catch (error) {
      logger.error('Failed to register schema', {
        error: error.message
      });

      res.status(400).json({
        success: false,
        error: 'Failed to register schema',
        message: error.message
      });
    }
  });

  // Validate event
  router.post('/validate', async (req, res) => {
    try {
      const { event, eventType, version } = req.body;
      
      if (!event) {
        return res.status(400).json({
          success: false,
          error: 'Missing event data',
          message: 'Event data is required'
        });
      }

      const validation = await eventSchemaRegistry.validateEvent(event, eventType, version);
      
      res.json({
        success: true,
        data: validation
      });

    } catch (error) {
      logger.error('Failed to validate event', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Validation failed',
        message: error.message
      });
    }
  });

  // Check compatibility
  router.post('/compatibility', async (req, res) => {
    try {
      const { eventType, fromVersion, toVersion, compatibilityType } = req.body;
      
      if (!eventType || !fromVersion || !toVersion) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'eventType, fromVersion, and toVersion are required'
        });
      }

      const compatibility = await eventSchemaRegistry.checkCompatibility(
        eventType,
        fromVersion,
        toVersion,
        compatibilityType
      );
      
      res.json({
        success: true,
        data: compatibility
      });

    } catch (error) {
      logger.error('Failed to check compatibility', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Compatibility check failed',
        message: error.message
      });
    }
  });

  // Migrate event
  router.post('/migrate', async (req, res) => {
    try {
      const { event, toVersion, eventType } = req.body;
      
      if (!event || !toVersion) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'Event and toVersion are required'
        });
      }

      const migratedEvent = await eventSchemaRegistry.migrateEvent(event, toVersion, eventType);
      
      res.json({
        success: true,
        data: migratedEvent,
        message: 'Event migrated successfully'
      });

    } catch (error) {
      logger.error('Failed to migrate event', {
        error: error.message
      });

      res.status(400).json({
        success: false,
        error: 'Migration failed',
        message: error.message
      });
    }
  });

  // Deprecate schema
  router.post('/:eventType/:version/deprecate', async (req, res) => {
    try {
      const { eventType, version } = req.params;
      const { deprecationDate } = req.body;
      
      const deprecatedSchema = await eventSchemaRegistry.deprecateSchema(
        eventType,
        parseInt(version),
        deprecationDate
      );
      
      res.json({
        success: true,
        data: deprecatedSchema,
        message: 'Schema deprecated successfully'
      });

    } catch (error) {
      logger.error('Failed to deprecate schema', {
        eventType: req.params.eventType,
        version: req.params.version,
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Deprecation failed',
        message: error.message
      });
    }
  });

  // Get registry statistics
  router.get('/stats', async (req, res) => {
    try {
      const stats = await eventSchemaRegistry.getStats();
      
      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Failed to get registry stats', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        message: error.message
      });
    }
  });

  return router;
}

/**
 * Initialize schema registry with Express app
 */
function initializeSchemaRegistry(app, options = {}) {
  const {
    apiPath = '/api/schemas',
    enableMiddleware = true,
    middlewareOptions = {}
  } = options;

  // Add middleware if enabled
  if (enableMiddleware) {
    app.use(createEventValidationMiddleware(middlewareOptions));
    app.use(createCompatibilityMiddleware(middlewareOptions));
    app.use(createEventMigrationMiddleware(middlewareOptions));
  }

  // Add schema registry routes
  const schemaRoutes = createSchemaRegistryRoutes();
  app.use(apiPath, schemaRoutes);

  logger.info('Schema registry initialized', {
    apiPath,
    middlewareEnabled: enableMiddleware
  });
}

module.exports = {
  createEventValidationMiddleware,
  createCompatibilityMiddleware,
  createEventMigrationMiddleware,
  createSchemaRegistryRoutes,
  initializeSchemaRegistry
};
