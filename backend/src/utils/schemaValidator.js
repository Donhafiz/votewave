const Joi = require('joi');
const { logger } = require('./logger');

class SchemaValidator {
  constructor() {
    this.schemas = new Map();
    this.validationStats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      validationErrors: new Map()
    };
    
    this.initializeSchemas();
  }

  /**
   * Initialize all schema definitions
   */
  initializeSchemas() {
    // User schemas
    this.addSchema('userRegistration', this.getUserRegistrationSchema());
    this.addSchema('userLogin', this.getUserLoginSchema());
    this.addSchema('userProfile', this.getUserProfileSchema());
    this.addSchema('userUpdate', this.getUserUpdateSchema());

    // Election schemas
    this.addSchema('electionCreate', this.getElectionCreateSchema());
    this.addSchema('electionUpdate', this.getElectionUpdateSchema());
    this.addSchema('electionFilter', this.getElectionFilterSchema());

    // Candidate schemas
    this.addSchema('candidateCreate', this.getCandidateCreateSchema());
    this.addSchema('candidateUpdate', this.getCandidateUpdateSchema());

    // Vote schemas
    this.addSchema('voteCast', this.getVoteCastSchema());
    this.addSchema('voteBatch', this.getVoteBatchSchema());

    // Event schemas
    this.addSchema('eventAuth', this.getEventAuthSchema());
    this.addSchema('eventVoting', this.getEventVotingSchema());
    this.addSchema('eventUser', this.getEventUserSchema());
    this.addSchema('eventSystem', this.getEventSystemSchema());
    this.addSchema('eventAnalytics', this.getEventAnalyticsSchema());
    this.addSchema('eventSecurity', this.getEventSecuritySchema());

    // Admin schemas
    this.addSchema('adminAction', this.getAdminActionSchema());
    this.addSchema('systemConfig', this.getSystemConfigSchema());

    // ML schemas
    this.addSchema('mlInference', this.getMlInferenceSchema());
    this.addSchema('mlTraining', this.getMlTrainingSchema());

    // WebSocket schemas
    this.addSchema('websocketMessage', this.getWebSocketMessageSchema());
    this.addSchema('websocketAuth', this.getWebSocketAuthSchema());

    // Configuration schemas
    this.addSchema('tenantConfig', this.getTenantConfigSchema());
    this.addSchema('featureFlag', this.getFeatureFlagSchema());
    this.addSchema('rateLimitConfig', this.getRateLimitConfigSchema());

    logger.info('Schema validator initialized', {
      schemaCount: this.schemas.size
    });
  }

  /**
   * Add schema definition
   * @param {string} name - Schema name
   * @param {Object} schema - Joi schema object
   */
  addSchema(name, schema) {
    this.schemas.set(name, schema);
    logger.debug('Schema added', { name });
  }

  /**
   * Validate data against schema
   * @param {string} schemaName - Schema name
   * @param {Object} data - Data to validate
   * @param {Object} options - Validation options
   * @returns {Object} - Validation result
   */
  validate(schemaName, data, options = {}) {
    this.validationStats.totalValidations++;

    try {
      const schema = this.schemas.get(schemaName);
      
      if (!schema) {
        throw new Error(`Schema not found: ${schemaName}`);
      }

      const { error, value } = schema.validate(data, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
        ...options
      });

      if (error) {
        this.validationStats.failedValidations++;
        
        // Track error types
        const errorDetails = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type,
          value: detail.context?.value
        }));

        // Update error statistics
        for (const errorDetail of errorDetails) {
          const errorKey = `${schemaName}:${errorDetail.field}`;
          const currentCount = this.validationStats.validationErrors.get(errorKey) || 0;
          this.validationStats.validationErrors.set(errorKey, currentCount + 1);
        }

        logger.warn('Schema validation failed', {
          schemaName,
          errors: errorDetails,
          data
        });

        return {
          valid: false,
          error: {
            message: 'Validation failed',
            details: errorDetails,
            schemaName
          },
          data: null
        };
      }

      this.validationStats.successfulValidations++;

      logger.debug('Schema validation successful', {
        schemaName,
        validatedFields: Object.keys(value)
      });

      return {
        valid: true,
        data: value,
        schemaName
      };

    } catch (error) {
      this.validationStats.failedValidations++;
      
      logger.error('Schema validation error', {
        schemaName,
        error: error.message,
        data
      });

      return {
        valid: false,
        error: {
          message: error.message,
          type: 'validation_error',
          schemaName
        },
        data: null
      };
    }
  }

  /**
   * Validate async data with custom validation
   * @param {string} schemaName - Schema name
   * @param {Object} data - Data to validate
   * @param {Function} customValidator - Custom validation function
   * @returns {Promise<Object>} - Validation result
   */
  async validateAsync(schemaName, data, customValidator = null) {
    try {
      // First, validate against schema
      const schemaResult = this.validate(schemaName, data);
      
      if (!schemaResult.valid) {
        return schemaResult;
      }

      // Run custom validation if provided
      if (customValidator) {
        const customResult = await customValidator(schemaResult.data);
        
        if (!customResult.valid) {
          return {
            valid: false,
            error: {
              message: customResult.error || 'Custom validation failed',
              type: 'custom_validation_error',
              schemaName
            },
            data: null
          };
        }
      }

      return {
        valid: true,
        data: schemaResult.data,
        schemaName
      };

    } catch (error) {
      logger.error('Async schema validation error', {
        schemaName,
        error: error.message
      });

      return {
        valid: false,
        error: {
          message: error.message,
          type: 'async_validation_error',
          schemaName
        },
        data: null
      };
    }
  }

  /**
   * Validate middleware for Express
   * @param {string} schemaName - Schema name
   * @param {string} source - Data source ('body', 'query', 'params')
   * @returns {Function} - Express middleware
   */
  middleware(schemaName, source = 'body') {
    return (req, res, next) => {
      try {
        const data = req[source];
        const result = this.validate(schemaName, data);

        if (!result.valid) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: result.error.details,
            schemaName
          });
        }

        // Replace request data with validated data
        req[source] = result.data;
        req.validatedData = result.data;

        next();

      } catch (error) {
        logger.error('Validation middleware error', {
          schemaName,
          source,
          error: error.message
        });

        res.status(500).json({
          success: false,
          error: 'Internal validation error'
        });
      }
    };
  }

  /**
   * Batch validation for multiple schemas
   * @param {Array} validations - Array of {schemaName, data} objects
   * @returns {Object} - Batch validation result
   */
  validateBatch(validations) {
    const results = [];
    let hasErrors = false;

    for (const { schemaName, data, options } of validations) {
      const result = this.validate(schemaName, data, options);
      results.push({
        schemaName,
        ...result
      });

      if (!result.valid) {
        hasErrors = true;
      }
    }

    return {
      valid: !hasErrors,
      results,
      errors: results.filter(r => !r.valid)
    };
  }

  /**
   * Get validation statistics
   * @returns {Object} - Validation statistics
   */
  getStats() {
    const totalValidations = this.validationStats.totalValidations;
    const successRate = totalValidations > 0 
      ? (this.validationStats.successfulValidations / totalValidations) * 100 
      : 0;

    // Get most common validation errors
    const sortedErrors = Array.from(this.validationStats.validationErrors.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([key, count]) => ({
        schema: key.split(':')[0],
        field: key.split(':')[1],
        count
      }));

    return {
      ...this.validationStats,
      successRate: Math.round(successRate * 100) / 100,
      schemaCount: this.schemas.size,
      topErrors: sortedErrors,
      errorTypes: Array.from(this.validationStats.validationErrors.keys()).length
    };
  }

  /**
   * Reset validation statistics
   */
  resetStats() {
    this.validationStats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      validationErrors: new Map()
    };

    logger.info('Validation statistics reset');
  }

  // Schema definitions

  getUserRegistrationSchema() {
    return Joi.object({
      email: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
      password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.max': 'Password must not exceed 128 characters',
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character',
        'any.required': 'Password is required'
      }),
      firstName: Joi.string().min(1).max(50).required().messages({
        'string.min': 'First name cannot be empty',
        'string.max': 'First name must not exceed 50 characters',
        'any.required': 'First name is required'
      }),
      lastName: Joi.string().min(1).max(50).required().messages({
        'string.min': 'Last name cannot be empty',
        'string.max': 'Last name must not exceed 50 characters',
        'any.required': 'Last name is required'
      }),
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
        'string.pattern.base': 'Please provide a valid phone number'
      }),
      dateOfBirth: Joi.date().max('now').optional().messages({
        'date.max': 'Date of birth cannot be in the future'
      }),
      address: Joi.object({
        street: Joi.string().max(100).optional(),
        city: Joi.string().max(50).optional(),
        state: Joi.string().max(50).optional(),
        zipCode: Joi.string().max(20).optional(),
        country: Joi.string().max(50).optional()
      }).optional()
    });
  }

  getUserLoginSchema() {
    return Joi.object({
      email: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
      password: Joi.string().required().messages({
        'any.required': 'Password is required'
      }),
      rememberMe: Joi.boolean().optional().default(false),
      deviceInfo: Joi.object({
        userAgent: Joi.string().optional(),
        ipAddress: Joi.string().ip().optional(),
        deviceType: Joi.string().valid('desktop', 'mobile', 'tablet').optional()
      }).optional()
    });
  }

  getUserProfileSchema() {
    return Joi.object({
      firstName: Joi.string().min(1).max(50).optional(),
      lastName: Joi.string().min(1).max(50).optional(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
      dateOfBirth: Joi.date().max('now').optional(),
      address: Joi.object({
        street: Joi.string().max(100).optional(),
        city: Joi.string().max(50).optional(),
        state: Joi.string().max(50).optional(),
        zipCode: Joi.string().max(20).optional(),
        country: Joi.string().max(50).optional()
      }).optional(),
      preferences: Joi.object({
        language: Joi.string().valid('en', 'es', 'fr', 'de', 'it').optional(),
        timezone: Joi.string().optional(),
        notifications: Joi.object({
          email: Joi.boolean().optional(),
          sms: Joi.boolean().optional(),
          push: Joi.boolean().optional()
        }).optional()
      }).optional()
    });
  }

  getUserUpdateSchema() {
    return Joi.object({
      firstName: Joi.string().min(1).max(50).optional(),
      lastName: Joi.string().min(1).max(50).optional(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
      address: Joi.object({
        street: Joi.string().max(100).optional(),
        city: Joi.string().max(50).optional(),
        state: Joi.string().max(50).optional(),
        zipCode: Joi.string().max(20).optional(),
        country: Joi.string().max(50).optional()
      }).optional(),
      preferences: Joi.object({
        language: Joi.string().valid('en', 'es', 'fr', 'de', 'it').optional(),
        timezone: Joi.string().optional(),
        notifications: Joi.object({
          email: Joi.boolean().optional(),
          sms: Joi.boolean().optional(),
          push: Joi.boolean().optional()
        }).optional()
      }).optional()
    });
  }

  getElectionCreateSchema() {
    return Joi.object({
      title: Joi.string().min(3).max(200).required().messages({
        'string.min': 'Title must be at least 3 characters long',
        'string.max': 'Title must not exceed 200 characters',
        'any.required': 'Title is required'
      }),
      description: Joi.string().min(10).max(2000).required().messages({
        'string.min': 'Description must be at least 10 characters long',
        'string.max': 'Description must not exceed 2000 characters',
        'any.required': 'Description is required'
      }),
      startDate: Joi.date().min('now').required().messages({
        'date.min': 'Start date must be in the future',
        'any.required': 'Start date is required'
      }),
      endDate: Joi.date().min(Joi.ref('startDate')).required().messages({
        'date.min': 'End date must be after start date',
        'any.required': 'End date is required'
      }),
      type: Joi.string().valid('single_choice', 'multiple_choice', 'ranked_choice', 'approval').required().messages({
        'any.only': 'Invalid election type',
        'any.required': 'Election type is required'
      }),
      settings: Joi.object({
        allowAnonymous: Joi.boolean().optional().default(false),
        requireAuthentication: Joi.boolean().optional().default(true),
        maxVotesPerVoter: Joi.number().integer().min(1).optional(),
        showResults: Joi.string().valid('immediate', 'after_voting', 'after_election').optional().default('after_election'),
        enableRealTime: Joi.boolean().optional().default(true),
        enableAudit: Joi.boolean().optional().default(true)
      }).optional(),
      eligibility: Joi.object({
        minAge: Joi.number().integer().min(0).optional(),
        maxAge: Joi.number().integer().min(0).optional(),
        requiredFields: Joi.array().items(Joi.string()).optional(),
        excludedUsers: Joi.array().items(Joi.string().uuid()).optional(),
        includedUsers: Joi.array().items(Joi.string().uuid()).optional()
      }).optional()
    });
  }

  getElectionUpdateSchema() {
    return Joi.object({
      title: Joi.string().min(3).max(200).optional(),
      description: Joi.string().min(10).max(2000).optional(),
      startDate: Joi.date().min('now').optional(),
      endDate: Joi.date().min(Joi.ref('startDate')).optional(),
      status: Joi.string().valid('draft', 'active', 'paused', 'completed', 'cancelled').optional(),
      settings: Joi.object({
        allowAnonymous: Joi.boolean().optional(),
        requireAuthentication: Joi.boolean().optional(),
        maxVotesPerVoter: Joi.number().integer().min(1).optional(),
        showResults: Joi.string().valid('immediate', 'after_voting', 'after_election').optional(),
        enableRealTime: Joi.boolean().optional(),
        enableAudit: Joi.boolean().optional()
      }).optional(),
      eligibility: Joi.object({
        minAge: Joi.number().integer().min(0).optional(),
        maxAge: Joi.number().integer().min(0).optional(),
        requiredFields: Joi.array().items(Joi.string()).optional(),
        excludedUsers: Joi.array().items(Joi.string().uuid()).optional(),
        includedUsers: Joi.array().items(Joi.string().uuid()).optional()
      }).optional()
    });
  }

  getElectionFilterSchema() {
    return Joi.object({
      status: Joi.string().valid('draft', 'active', 'paused', 'completed', 'cancelled').optional(),
      type: Joi.string().valid('single_choice', 'multiple_choice', 'ranked_choice', 'approval').optional(),
      startDateFrom: Joi.date().optional(),
      startDateTo: Joi.date().optional(),
      endDateFrom: Joi.date().optional(),
      endDateTo: Joi.date().optional(),
      createdBy: Joi.string().uuid().optional(),
      page: Joi.number().integer().min(1).optional().default(1),
      limit: Joi.number().integer().min(1).max(100).optional().default(20),
      sortBy: Joi.string().valid('createdAt', 'startDate', 'endDate', 'title').optional().default('createdAt'),
      sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc')
    });
  }

  getCandidateCreateSchema() {
    return Joi.object({
      name: Joi.string().min(2).max(100).required().messages({
        'string.min': 'Candidate name must be at least 2 characters long',
        'string.max': 'Candidate name must not exceed 100 characters',
        'any.required': 'Candidate name is required'
      }),
      description: Joi.string().max(1000).optional(),
      electionId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid election ID',
        'any.required': 'Election ID is required'
      }),
      party: Joi.string().max(50).optional(),
      platform: Joi.string().max(2000).optional(),
      photo: Joi.string().uri().optional().messages({
        'string.uri': 'Photo must be a valid URL'
      }),
      website: Joi.string().uri().optional().messages({
        'string.uri': 'Website must be a valid URL'
      }),
      socialMedia: Joi.object({
        twitter: Joi.string().optional(),
        facebook: Joi.string().optional(),
        instagram: Joi.string().optional(),
        linkedin: Joi.string().optional()
      }).optional()
    });
  }

  getCandidateUpdateSchema() {
    return Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      description: Joi.string().max(1000).optional(),
      party: Joi.string().max(50).optional(),
      platform: Joi.string().max(2000).optional(),
      photo: Joi.string().uri().optional().messages({
        'string.uri': 'Photo must be a valid URL'
      }),
      website: Joi.string().uri().optional().messages({
        'string.uri': 'Website must be a valid URL'
      }),
      socialMedia: Joi.object({
        twitter: Joi.string().optional(),
        facebook: Joi.string().optional(),
        instagram: Joi.string().optional(),
        linkedin: Joi.string().optional()
      }).optional(),
      status: Joi.string().valid('active', 'inactive', 'withdrawn').optional()
    });
  }

  getVoteCastSchema() {
    return Joi.object({
      electionId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid election ID',
        'any.required': 'Election ID is required'
      }),
      candidateId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid candidate ID',
        'any.required': 'Candidate ID is required'
      }),
      preferences: Joi.array().items(Joi.string().uuid()).optional(), // For ranked choice
      metadata: Joi.object({
        ipAddress: Joi.string().ip().optional(),
        userAgent: Joi.string().optional(),
        deviceType: Joi.string().valid('desktop', 'mobile', 'tablet').optional(),
        location: Joi.object({
          country: Joi.string().optional(),
          region: Joi.string().optional(),
          city: Joi.string().optional()
        }).optional()
      }).optional()
    });
  }

  getVoteBatchSchema() {
    return Joi.object({
      electionId: Joi.string().uuid().required(),
      votes: Joi.array().items(Joi.object({
        voterId: Joi.string().uuid().required(),
        candidateId: Joi.string().uuid().required(),
        timestamp: Joi.date().required(),
        preferences: Joi.array().items(Joi.string().uuid()).optional()
      })).min(1).max(1000).required().messages({
        'array.min': 'At least one vote is required',
        'array.max': 'Maximum 1000 votes per batch'
      })
    });
  }

  getEventAuthSchema() {
    return Joi.object({
      type: Joi.string().valid('user_login', 'user_logout', 'user_registered', 'password_changed', 'mfa_enabled', 'mfa_disabled').required(),
      userId: Joi.string().uuid().required(),
      timestamp: Joi.date().required(),
      metadata: Joi.object({
        ipAddress: Joi.string().ip().required(),
        userAgent: Joi.string().required(),
        deviceType: Joi.string().valid('desktop', 'mobile', 'tablet').required(),
        location: Joi.object({
          country: Joi.string().required(),
          region: Joi.string().required(),
          city: Joi.string().required()
        }).required(),
        sessionId: Joi.string().required(),
        success: Joi.boolean().required(),
        failureReason: Joi.string().when('success', {
          is: false,
          then: Joi.required(),
          otherwise: Joi.forbidden()
        })
      }).required()
    });
  }

  getEventVotingSchema() {
    return Joi.object({
      type: Joi.string().valid('vote_cast', 'vote_updated', 'vote_cancelled', 'election_created', 'election_started', 'election_ended', 'candidate_added', 'candidate_removed').required(),
      electionId: Joi.string().uuid().required(),
      userId: Joi.string().required(),
      timestamp: Joi.date().required(),
      metadata: Joi.object({
        candidateId: Joi.string().uuid().when('type', {
          is: Joi.valid('vote_cast', 'vote_updated'),
          then: Joi.required(),
          otherwise: Joi.forbidden()
        }),
        previousCandidateId: Joi.string().uuid().when('type', {
          is: 'vote_updated',
          then: Joi.required(),
          otherwise: Joi.forbidden()
        }),
        voteCount: Joi.number().integer().min(0).when('type', {
          is: Joi.valid('election_started', 'election_ended'),
          then: Joi.required(),
          otherwise: Joi.forbidden()
        }),
        fraudScore: Joi.number().min(0).max(1).optional(),
        ipAddress: Joi.string().ip().required(),
        userAgent: Joi.string().required()
      }).required()
    });
  }

  getEventUserSchema() {
    return Joi.object({
      type: Joi.string().valid('profile_updated', 'preferences_changed', 'account_suspended', 'account_reactivated', 'role_changed', 'permissions_updated').required(),
      userId: Joi.string().uuid().required(),
      timestamp: Joi.date().required(),
      metadata: Joi.object({
        previousValues: Joi.object().optional(),
        newValues: Joi.object().optional(),
        changedFields: Joi.array().items(Joi.string()).required(),
        changedBy: Joi.string().uuid().required(),
        reason: Joi.string().required()
      }).required()
    });
  }

  getEventSystemSchema() {
    return Joi.object({
      type: Joi.string().valid('system_started', 'system_shutdown', 'configuration_changed', 'maintenance_started', 'maintenance_ended', 'backup_completed', 'backup_failed', 'scaling_event').required(),
      timestamp: Joi.date().required(),
      metadata: Joi.object({
        component: Joi.string().required(),
        version: Joi.string().required(),
        environment: Joi.string().valid('development', 'staging', 'production').required(),
        nodeId: Joi.string().required(),
        details: Joi.object().required(),
        severity: Joi.string().valid('info', 'warning', 'error', 'critical').required()
      }).required()
    });
  }

  getEventAnalyticsSchema() {
    return Joi.object({
      type: Joi.string().valid('page_view', 'user_engagement', 'feature_usage', 'performance_metric', 'error_occurred', 'conversion_event').required(),
      timestamp: Joi.date().required(),
      metadata: Joi.object({
        userId: Joi.string().uuid().optional(),
        sessionId: Joi.string().required(),
        eventType: Joi.string().required(),
        eventName: Joi.string().required(),
        properties: Joi.object().required(),
        value: Joi.number().optional(),
        unit: Joi.string().optional(),
        tags: Joi.array().items(Joi.string()).optional()
      }).required()
    });
  }

  getEventSecuritySchema() {
    return Joi.object({
      type: Joi.string().valid('security_event', 'threat_detected', 'access_denied', 'privilege_escalation', 'data_breach_attempt', 'malicious_activity').required(),
      timestamp: Joi.date().required(),
      metadata: Joi.object({
        severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
        userId: Joi.string().uuid().optional(),
        ipAddress: Joi.string().ip().required(),
        userAgent: Joi.string().required(),
        threatType: Joi.string().required(),
        description: Joi.string().required(),
        action: Joi.string().valid('blocked', 'monitored', 'allowed').required(),
        details: Joi.object().required()
      }).required()
    });
  }

  getAdminActionSchema() {
    return Joi.object({
      action: Joi.string().valid('create_user', 'update_user', 'delete_user', 'suspend_user', 'activate_user', 'create_election', 'update_election', 'delete_election', 'export_data', 'import_data', 'system_maintenance').required(),
      targetId: Joi.string().uuid().required(),
      targetType: Joi.string().valid('user', 'election', 'system', 'data').required(),
      reason: Joi.string().min(10).max(500).required().messages({
        'string.min': 'Reason must be at least 10 characters long',
        'string.max': 'Reason must not exceed 500 characters',
        'any.required': 'Reason is required'
      }),
      metadata: Joi.object().optional()
    });
  }

  getSystemConfigSchema() {
    return Joi.object({
      database: Joi.object({
        host: Joi.string().required(),
        port: Joi.number().integer().min(1).max(65535).required(),
        name: Joi.string().required(),
        ssl: Joi.boolean().optional(),
        poolSize: Joi.number().integer().min(1).max(100).optional()
      }).required(),
      redis: Joi.object({
        host: Joi.string().required(),
        port: Joi.number().integer().min(1).max(65535).required(),
        db: Joi.number().integer().min(0).max(15).optional()
      }).required(),
      auth: Joi.object({
        jwtSecret: Joi.string().min(32).required(),
        sessionTimeout: Joi.number().integer().min(300).optional(),
        maxLoginAttempts: Joi.number().integer().min(1).max(10).optional(),
        lockoutDuration: Joi.number().integer().min(300).optional()
      }).required(),
      features: Joi.object({
        enableMFA: Joi.boolean().optional(),
        enableAudit: Joi.boolean().optional(),
        enableRealTime: Joi.boolean().optional(),
        enableAnalytics: Joi.boolean().optional()
      }).optional()
    });
  }

  getMlInferenceSchema() {
    return Joi.object({
      modelType: Joi.string().valid('fraud_detection', 'sentiment_analysis', 'recommendation', 'anomaly_detection').required(),
      input: Joi.object().required(),
      parameters: Joi.object().optional(),
      requestId: Joi.string().uuid().required(),
      timestamp: Joi.date().required()
    });
  }

  getMlTrainingSchema() {
    return Joi.object({
      modelType: Joi.string().valid('fraud_detection', 'sentiment_analysis', 'recommendation', 'anomaly_detection').required(),
      trainingData: Joi.array().items(Joi.object()).min(1).required(),
      parameters: Joi.object({
        epochs: Joi.number().integer().min(1).max(1000).optional(),
        batchSize: Joi.number().integer().min(1).max(1000).optional(),
        learningRate: Joi.number().min(0.0001).max(1).optional(),
        validationSplit: Joi.number().min(0.1).max(0.9).optional()
      }).optional(),
      hyperparameters: Joi.object().optional()
    });
  }

  getWebSocketMessageSchema() {
    return Joi.object({
      type: Joi.string().valid('vote_update', 'election_status', 'user_notification', 'system_alert', 'chat_message').required(),
      data: Joi.object().required(),
      timestamp: Joi.date().required(),
      roomId: Joi.string().optional(),
      userId: Joi.string().uuid().optional()
    });
  }

  getWebSocketAuthSchema() {
    return Joi.object({
      token: Joi.string().required(),
      userId: Joi.string().uuid().required(),
      sessionId: Joi.string().required(),
      timestamp: Joi.date().required(),
      signature: Joi.string().required()
    });
  }

  getTenantConfigSchema() {
    return Joi.object({
      tenantId: Joi.string().uuid().required(),
      name: Joi.string().min(2).max(100).required(),
      domain: Joi.string().domain().required(),
      settings: Joi.object({
        maxUsers: Joi.number().integer().min(1).optional(),
        maxElections: Joi.number().integer().min(1).optional(),
        enableFeatures: Joi.array().items(Joi.string()).optional(),
        customBranding: Joi.object({
          logo: Joi.string().uri().optional(),
          primaryColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
          secondaryColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
        }).optional()
      }).required(),
      subscriptions: Joi.array().items(Joi.object({
        plan: Joi.string().valid('basic', 'premium', 'enterprise').required(),
        features: Joi.array().items(Joi.string()).required(),
        limits: Joi.object().required()
      })).optional()
    });
  }

  getFeatureFlagSchema() {
    return Joi.object({
      key: Joi.string().pattern(/^[a-z0-9_]+$/).required(),
      name: Joi.string().min(2).max(100).required(),
      description: Joi.string().min(10).max(500).required(),
      enabled: Joi.boolean().required(),
      conditions: Joi.array().items(Joi.object({
        type: Joi.string().valid('user_id', 'tenant_id', 'role', 'property').required(),
        operator: Joi.string().valid('equals', 'not_equals', 'in', 'not_in', 'contains', 'regex').required(),
        value: Joi.alternatives().try(
          Joi.string(),
          Joi.number(),
          Joi.boolean(),
          Joi.array()
        ).required()
      })).optional(),
      rolloutPercentage: Joi.number().min(0).max(100).optional(),
      environments: Joi.array().items(Joi.string().valid('development', 'staging', 'production')).optional()
    });
  }

  getRateLimitConfigSchema() {
    return Joi.object({
      windowMs: Joi.number().integer().min(1000).max(3600000).required(),
      max: Joi.number().integer().min(1).max(10000).required(),
      message: Joi.string().optional(),
      standardHeaders: Joi.boolean().optional(),
      legacyHeaders: Joi.boolean().optional(),
      keyGenerator: Joi.string().optional(),
      skip: Joi.function().optional(),
      onLimitReached: Joi.function().optional()
    });
  }
}

// Create singleton instance
const schemaValidator = new SchemaValidator();

module.exports = schemaValidator;
