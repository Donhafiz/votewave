const { logger } = require('./logger');
const Joi = require('joi');

class EventValidator {
  constructor() {
    this.schemas = this.defineSchemas();
    this.validationErrors = new Map();
  }

  // Define event schemas
  defineSchemas() {
    return {
      // Base event schema
      base: Joi.object({
        id: Joi.string().required(),
        type: Joi.string().required(),
        version: Joi.string().required(),
        timestamp: Joi.date().iso().required(),
        tenantId: Joi.string().required(),
        source: Joi.string().required(),
        correlationId: Joi.string().optional(),
        metadata: Joi.object().optional()
      }),

      // Authentication events
      auth: {
        login: Joi.object({
          userId: Joi.string().required(),
          email: Joi.string().email().required(),
          ipAddress: Joi.string().ip().required(),
          userAgent: Joi.string().required(),
          success: Joi.boolean().required(),
          reason: Joi.string().when('success', {
            is: false,
            then: Joi.required(),
            otherwise: Joi.optional()
          })
        }),
        logout: Joi.object({
          userId: Joi.string().required(),
          sessionId: Joi.string().required(),
          reason: Joi.string().optional()
        }),
        token_refresh: Joi.object({
          userId: Joi.string().required(),
          oldTokenId: Joi.string().required(),
          newTokenId: Joi.string().required(),
          ipAddress: Joi.string().ip().required()
        })
      },

      // Voting events
      voting: {
        vote_cast: Joi.object({
          electionId: Joi.string().required(),
          candidateId: Joi.string().required(),
          voterId: Joi.string().required(),
          timestamp: Joi.date().iso().required(),
          ipAddress: Joi.string().ip().required(),
          userAgent: Joi.string().required(),
          voteHash: Joi.string().required(),
          weight: Joi.number().min(1).max(100).default(1)
        }),
        vote_verified: Joi.object({
          electionId: Joi.string().required(),
          candidateId: Joi.string().required(),
          voterId: Joi.string().required(),
          verificationResult: Joi.string().required(),
          fraudScore: Joi.number().min(0).max(1).required(),
          timestamp: Joi.date().iso().required()
        }),
        election_started: Joi.object({
          electionId: Joi.string().required(),
          title: Joi.string().required(),
          startTime: Joi.date().iso().required(),
          endTime: Joi.date().iso().required(),
          createdBy: Joi.string().required()
        }),
        election_ended: Joi.object({
          electionId: Joi.string().required(),
          endTime: Joi.date().iso().required(),
          totalVotes: Joi.number().min(0).required(),
          winner: Joi.string().optional()
        })
      },

      // User events
      user: {
        user_created: Joi.object({
          userId: Joi.string().required(),
          email: Joi.string().email().required(),
          role: Joi.string().required(),
          tenantId: Joi.string().required(),
          createdBy: Joi.string().required()
        }),
        user_updated: Joi.object({
          userId: Joi.string().required(),
          updatedFields: Joi.array().items(Joi.string()).required(),
          updatedBy: Joi.string().required()
        }),
        user_deleted: Joi.object({
          userId: Joi.string().required(),
          deletedBy: Joi.string().required(),
          reason: Joi.string().required()
        })
      },

      // System events
      system: {
        service_started: Joi.object({
          serviceName: Joi.string().required(),
          version: Joi.string().required(),
          environment: Joi.string().required(),
          nodeId: Joi.string().required()
        }),
        service_stopped: Joi.object({
          serviceName: Joi.string().required(),
          reason: Joi.string().required(),
          duration: Joi.number().required()
        }),
        error_occurred: Joi.object({
          errorType: Joi.string().required(),
          errorMessage: Joi.string().required(),
          stackTrace: Joi.string().optional(),
          context: Joi.object().required()
        }),
        health_check: Joi.object({
          serviceName: Joi.string().required(),
          status: Joi.string().valid('healthy', 'unhealthy', 'degraded').required(),
          metrics: Joi.object().required()
        })
      },

      // Analytics events
      analytics: {
        page_view: Joi.object({
          userId: Joi.string().optional(),
          sessionId: Joi.string().required(),
          page: Joi.string().required(),
          referrer: Joi.string().optional(),
          timestamp: Joi.date().iso().required()
        }),
        user_action: Joi.object({
          userId: Joi.string().required(),
          action: Joi.string().required(),
          resource: Joi.string().required(),
          metadata: Joi.object().optional()
        }),
        performance_metric: Joi.object({
          metricName: Joi.string().required(),
          value: Joi.number().required(),
          unit: Joi.string().required(),
          tags: Joi.object().optional()
        })
      },

      // Security events
      security: {
        suspicious_activity: Joi.object({
          userId: Joi.string().optional(),
          ipAddress: Joi.string().ip().required(),
          activityType: Joi.string().required(),
          riskScore: Joi.number().min(0).max(100).required(),
          details: Joi.object().required()
        }),
        rate_limit_exceeded: Joi.object({
          userId: Joi.string().optional(),
          ipAddress: Joi.string().ip().required(),
          endpoint: Joi.string().required(),
          limit: Joi.number().required(),
          actual: Joi.number().required()
        }),
        unauthorized_access: Joi.object({
          ipAddress: Joi.string().ip().required(),
          endpoint: Joi.string().required(),
          method: Joi.string().required(),
          reason: Joi.string().required()
        })
      }
    };
  }

  // Validate event
  validateEvent(event) {
    try {
      // First validate base schema
      const baseValidation = this.schemas.base.validate(event);
      if (baseValidation.error) {
        return {
          valid: false,
          errors: baseValidation.error.details.map(d => d.message),
          type: 'base_schema'
        };
      }

      // Then validate specific event type
      const specificValidation = this.validateSpecificEvent(event);
      
      if (specificValidation.valid) {
        return {
          valid: true,
          event: this.sanitizeEvent(event)
        };
      } else {
        return {
          valid: false,
          errors: specificValidation.errors,
          type: specificValidation.type
        };
      }

    } catch (error) {
      logger.error('Event validation error', {
        error: error.message,
        eventType: event.type
      });

      return {
        valid: false,
        errors: [`Validation error: ${error.message}`],
        type: 'validation_error'
      };
    }
  }

  // Validate specific event type
  validateSpecificEvent(event) {
    const [category, action] = event.type.split('.');
    
    if (!this.schemas[category] || !this.schemas[category][action]) {
      return {
        valid: false,
        errors: [`Unknown event type: ${event.type}`],
        type: 'unknown_event_type'
      };
    }

    const schema = this.schemas[category][action];
    const validation = schema.validate(event.payload);
    
    if (validation.error) {
      // Track validation errors for monitoring
      this.trackValidationError(event.type, validation.error.details);
      
      return {
        valid: false,
        errors: validation.error.details.map(d => d.message),
        type: 'specific_schema'
      };
    }

    return {
      valid: true
    };
  }

  // Sanitize event
  sanitizeEvent(event) {
    const sanitized = { ...event };
    
    // Remove sensitive fields
    if (sanitized.payload && sanitized.payload.password) {
      delete sanitized.payload.password;
    }
    
    if (sanitized.payload && sanitized.payload.token) {
      delete sanitized.payload.token;
    }
    
    // Ensure consistent timestamp format
    if (sanitized.timestamp) {
      sanitized.timestamp = new Date(sanitized.timestamp).toISOString();
    }
    
    return sanitized;
  }

  // Track validation errors
  trackValidationError(eventType, errors) {
    const key = `${eventType}_${Date.now()}`;
    this.validationErrors.set(key, {
      eventType,
      errors: errors.map(e => e.message),
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 validation errors
    if (this.validationErrors.size > 1000) {
      const keys = Array.from(this.validationErrors.keys()).slice(0, -1000);
      const filtered = new Map();
      keys.forEach(k => filtered.set(k, this.validationErrors.get(k)));
      this.validationErrors = filtered;
    }

    logger.warn('Event validation failed', {
      eventType,
      errors: errors.map(e => e.message)
    });
  }

  // Validate batch of events
  validateBatch(events) {
    const results = [];
    const validEvents = [];
    const invalidEvents = [];

    for (const event of events) {
      const validation = this.validateEvent(event);
      
      if (validation.valid) {
        validEvents.push(validation.event);
        results.push({ index: events.indexOf(event), valid: true });
      } else {
        invalidEvents.push({
          index: events.indexOf(event),
          event,
          errors: validation.errors,
          type: validation.type
        });
        results.push({ index: events.indexOf(event), valid: false, errors: validation.errors });
      }
    }

    return {
      valid: validEvents,
      invalid: invalidEvents,
      results,
      summary: {
        total: events.length,
        valid: validEvents.length,
        invalid: invalidEvents.length,
        successRate: (validEvents.length / events.length) * 100
      }
    };
  }

  // Get validation statistics
  getValidationStats() {
    const stats = {
      totalErrors: this.validationErrors.size,
      errorByType: {},
      recentErrors: []
    };

    // Analyze errors by type
    for (const [key, error] of this.validationErrors) {
      const eventType = error.eventType;
      stats.errorByType[eventType] = (stats.errorByType[eventType] || 0) + 1;
    }

    // Get recent errors (last 100)
    const allErrors = Array.from(this.validationErrors.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100);

    stats.recentErrors = allErrors;

    return stats;
  }

  // Clear validation errors
  clearValidationErrors() {
    this.validationErrors.clear();
    logger.info('Validation errors cleared');
  }

  // Get available event types
  getAvailableEventTypes() {
    const types = [];
    
    for (const [category, actions] of Object.entries(this.schemas)) {
      if (category === 'base') continue;
      
      for (const action of Object.keys(actions)) {
        types.push(`${category}.${action}`);
      }
    }
    
    return types.sort();
  }

  // Add custom schema
  addCustomSchema(eventType, schema) {
    const [category, action] = eventType.split('.');
    
    if (!this.schemas[category]) {
      this.schemas[category] = {};
    }
    
    this.schemas[category][action] = schema;
    
    logger.info('Custom event schema added', {
      eventType,
      category,
      action
    });
  }

  // Remove schema
  removeSchema(eventType) {
    const [category, action] = eventType.split('.');
    
    if (this.schemas[category] && this.schemas[category][action]) {
      delete this.schemas[category][action];
      
      logger.info('Event schema removed', {
        eventType,
        category,
        action
      });
      
      return true;
    }
    
    return false;
  }

  // Validate schema structure
  validateSchemaStructure(schema) {
    try {
      const validation = Joi.object({
        type: Joi.string().required(),
        version: Joi.string().required(),
        description: Joi.string().optional(),
        fields: Joi.object().pattern(/.*/, Joi.any()).required()
      }).validate(schema);

      return {
        valid: !validation.error,
        errors: validation.error ? validation.error.details.map(d => d.message) : []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Schema structure error: ${error.message}`]
      };
    }
  }

  // Export validation rules
  exportValidationRules() {
    const rules = {
      baseSchema: this.schemas.base.describe(),
      eventTypes: {},
      statistics: this.getValidationStats()
    };

    for (const [category, actions] of Object.entries(this.schemas)) {
      if (category === 'base') continue;
      
      rules.eventTypes[category] = {};
      for (const [action, schema] of Object.entries(actions)) {
        rules.eventTypes[category][action] = schema.describe();
      }
    }

    return {
      timestamp: new Date().toISOString(),
      rules
    };
  }
}

// Create singleton instance
const eventValidator = new EventValidator();

module.exports = eventValidator;
