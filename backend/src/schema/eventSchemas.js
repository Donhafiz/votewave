const eventSchemaRegistry = require('./eventSchemaRegistry');

/**
 * Initialize all event schemas for the VoteWave platform
 */
async function initializeEventSchemas() {
  try {
    // Election Event Schemas
    await registerElectionSchemas();
    
    // Vote Event Schemas
    await registerVoteSchemas();
    
    // User Event Schemas
    await registerUserSchemas();
    
    // Candidate Event Schemas
    await registerCandidateSchemas();
    
    // System Event Schemas
    await registerSystemSchemas();
    
    // Analytics Event Schemas
    await registerAnalyticsSchemas();
    
    // Security Event Schemas
    await registerSecuritySchemas();
    
    console.log('All event schemas registered successfully');
    
  } catch (error) {
    console.error('Failed to initialize event schemas:', error);
    throw error;
  }
}

/**
 * Register election-related event schemas
 */
async function registerElectionSchemas() {
  // Election Created Event
  await eventSchemaRegistry.registerSchema('election_created', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1, maxLength: 255 },
      description: { type: 'string', maxLength: 1000 },
      type: { type: 'string', enum: ['general', 'primary', 'runoff', 'referendum'] },
      status: { type: 'string', enum: ['draft', 'active', 'completed', 'cancelled'] },
      startDate: { type: 'number' }, // Unix timestamp
      endDate: { type: 'number' }, // Unix timestamp
      settings: {
        type: 'object',
        properties: {
          allowAnonymous: { type: 'boolean' },
          requireVerification: { type: 'boolean' },
          maxVotesPerVoter: { type: 'number', minimum: 1 },
          votingMethod: { type: 'string', enum: ['single', 'multiple', 'ranked'] }
        }
      },
      createdBy: { type: 'string', minLength: 1 },
      region: { type: 'string' },
      timezone: { type: 'string' }
    },
    required: ['id', 'title', 'type', 'status', 'startDate', 'endDate', 'createdBy', 'region']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a new election is created',
    examples: [{
      id: 'election_123',
      title: '2024 Presidential Election',
      description: 'General election for president',
      type: 'general',
      status: 'draft',
      startDate: 1704067200,
      endDate: 1704153600,
      createdBy: 'admin_456',
      region: 'us-east-1',
      timezone: 'America/New_York'
    }]
  });

  // Election Updated Event
  await eventSchemaRegistry.registerSchema('election_updated', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            oldValue: {},
            newValue: {}
          }
        }
      },
      updatedBy: { type: 'string', minLength: 1 },
      reason: { type: 'string', maxLength: 500 }
    },
    required: ['id', 'changes', 'updatedBy']
  }, {
    compatibility: 'backward',
    description: 'Event fired when an election is updated'
  });

  // Election Started Event
  await eventSchemaRegistry.registerSchema('election_started', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      startedAt: { type: 'number' },
      startedBy: { type: 'string', minLength: 1 },
      initialCandidates: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['id', 'startedAt', 'startedBy']
  }, {
    compatibility: 'backward',
    description: 'Event fired when an election starts'
  });

  // Election Ended Event
  await eventSchemaRegistry.registerSchema('election_ended', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      endedAt: { type: 'number' },
      endedBy: { type: 'string', minLength: 1 },
      totalVotes: { type: 'number', minimum: 0 },
      totalVoters: { type: 'number', minimum: 0 },
      winner: {
        type: 'object',
        properties: {
          candidateId: { type: 'string' },
          votes: { type: 'number', minimum: 0 },
          percentage: { type: 'number', minimum: 0, maximum: 100 }
        }
      }
    },
    required: ['id', 'endedAt', 'endedBy', 'totalVotes', 'totalVoters']
  }, {
    compatibility: 'backward',
    description: 'Event fired when an election ends'
  });
}

/**
 * Register vote-related event schemas
 */
async function registerVoteSchemas() {
  // Vote Cast Event
  await eventSchemaRegistry.registerSchema('vote_cast', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      electionId: { type: 'string', minLength: 1 },
      userId: { type: 'string', minLength: 1 },
      candidateId: { type: 'string', minLength: 1 },
      timestamp: { type: 'number' },
      ipAddress: { type: 'string' },
      userAgent: { type: 'string' },
      deviceType: { type: 'string', enum: ['desktop', 'mobile', 'tablet', 'other'] },
      region: { type: 'string' },
      fraudScore: { type: 'number', minimum: 0, maximum: 1 },
      verified: { type: 'boolean' },
      metadata: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          referrer: { type: 'string' },
          votingTime: { type: 'number' }
        }
      }
    },
    required: ['id', 'electionId', 'userId', 'candidateId', 'timestamp', 'region']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a vote is cast',
    examples: [{
      id: 'vote_789',
      electionId: 'election_123',
      userId: 'user_456',
      candidateId: 'candidate_789',
      timestamp: 1704100800,
      region: 'us-east-1',
      fraudScore: 0.1,
      verified: true
    }]
  });

  // Vote Updated Event
  await eventSchemaRegistry.registerSchema('vote_updated', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      electionId: { type: 'string', minLength: 1 },
      userId: { type: 'string', minLength: 1 },
      previousCandidateId: { type: 'string', minLength: 1 },
      newCandidateId: { type: 'string', minLength: 1 },
      timestamp: { type: 'number' },
      reason: { type: 'string', maxLength: 500 },
      updatedBy: { type: 'string', minLength: 1 }
    },
    required: ['id', 'electionId', 'userId', 'previousCandidateId', 'newCandidateId', 'timestamp', 'updatedBy']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a vote is updated'
  });

  // Vote Cancelled Event
  await eventSchemaRegistry.registerSchema('vote_cancelled', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      electionId: { type: 'string', minLength: 1 },
      userId: { type: 'string', minLength: 1 },
      candidateId: { type: 'string', minLength: 1 },
      timestamp: { type: 'number' },
      reason: { type: 'string', maxLength: 500 },
      cancelledBy: { type: 'string', minLength: 1 }
    },
    required: ['id', 'electionId', 'userId', 'candidateId', 'timestamp', 'cancelledBy']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a vote is cancelled'
  });
}

/**
 * Register user-related event schemas
 */
async function registerUserSchemas() {
  // User Registered Event
  await eventSchemaRegistry.registerSchema('user_registered', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
      firstName: { type: 'string', minLength: 1, maxLength: 100 },
      lastName: { type: 'string', minLength: 1, maxLength: 100 },
      role: { type: 'string', enum: ['voter', 'admin', 'observer'] },
      status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
      registeredAt: { type: 'number' },
      ipAddress: { type: 'string' },
      region: { type: 'string' },
      verified: { type: 'boolean' },
      metadata: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['web', 'mobile', 'api', 'admin'] },
          referralCode: { type: 'string' },
          preferences: {
            type: 'object',
            properties: {
              language: { type: 'string' },
              timezone: { type: 'string' },
              notifications: { type: 'boolean' }
            }
          }
        }
      }
    },
    required: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'registeredAt', 'region']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a new user registers'
  });

  // User Updated Event
  await eventSchemaRegistry.registerSchema('user_updated', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            oldValue: {},
            newValue: {}
          }
        }
      },
      updatedAt: { type: 'number' },
      updatedBy: { type: 'string', minLength: 1 }
    },
    required: ['id', 'changes', 'updatedAt', 'updatedBy']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a user profile is updated'
  });

  // User Authenticated Event
  await eventSchemaRegistry.registerSchema('user_authenticated', 1, {
    type: 'object',
    properties: {
      userId: { type: 'string', minLength: 1 },
      method: { type: 'string', enum: ['password', 'oauth', 'mfa', 'sso'] },
      timestamp: { type: 'number' },
      ipAddress: { type: 'string' },
      userAgent: { type: 'string' },
      sessionId: { type: 'string' },
      success: { type: 'boolean' },
      failureReason: { type: 'string' },
      region: { type: 'string' }
    },
    required: ['userId', 'method', 'timestamp', 'success', 'region']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a user attempts authentication'
  });
}

/**
 * Register candidate-related event schemas
 */
async function registerCandidateSchemas() {
  // Candidate Added Event
  await eventSchemaRegistry.registerSchema('candidate_added', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      electionId: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      party: { type: 'string', maxLength: 100 },
      description: { type: 'string', maxLength: 1000 },
      addedAt: { type: 'number' },
      addedBy: { type: 'string', minLength: 1 },
      order: { type: 'number', minimum: 0 },
      metadata: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string' },
          website: { type: 'string' },
          socialMedia: {
            type: 'object',
            properties: {
              twitter: { type: 'string' },
              facebook: { type: 'string' },
              instagram: { type: 'string' }
            }
          }
        }
      }
    },
    required: ['id', 'electionId', 'name', 'addedAt', 'addedBy']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a candidate is added to an election'
  });

  // Candidate Removed Event
  await eventSchemaRegistry.registerSchema('candidate_removed', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      electionId: { type: 'string', minLength: 1 },
      removedAt: { type: 'number' },
      removedBy: { type: 'string', minLength: 1 },
      reason: { type: 'string', maxLength: 500 }
    },
    required: ['id', 'electionId', 'removedAt', 'removedBy']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a candidate is removed from an election'
  });
}

/**
 * Register system-related event schemas
 */
async function registerSystemSchemas() {
  // System Health Check Event
  await eventSchemaRegistry.registerSchema('system_health_check', 1, {
    type: 'object',
    properties: {
      timestamp: { type: 'number' },
      service: { type: 'string', minLength: 1 },
      region: { type: 'string' },
      status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
      metrics: {
        type: 'object',
        properties: {
          responseTime: { type: 'number', minimum: 0 },
          errorRate: { type: 'number', minimum: 0, maximum: 1 },
          throughput: { type: 'number', minimum: 0 },
          memoryUsage: { type: 'number', minimum: 0 },
          cpuUsage: { type: 'number', minimum: 0, maximum: 1 }
        }
      },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: { type: 'string', enum: ['pass', 'fail', 'warn'] },
            message: { type: 'string' },
            duration: { type: 'number', minimum: 0 }
          }
        }
      }
    },
    required: ['timestamp', 'service', 'region', 'status']
  }, {
    compatibility: 'backward',
    description: 'Event fired during system health checks'
  });

  // Service Scaling Event
  await eventSchemaRegistry.registerSchema('service_scaling', 1, {
    type: 'object',
    properties: {
      timestamp: { type: 'number' },
      service: { type: 'string', minLength: 1 },
      region: { type: 'string' },
      action: { type: 'string', enum: ['scale_up', 'scale_down', 'scale_out', 'scale_in'] },
      fromInstances: { type: 'number', minimum: 0 },
      toInstances: { type: 'number', minimum: 0 },
      reason: { type: 'string', enum: ['load', 'schedule', 'manual', 'auto'] },
      metrics: {
        type: 'object',
        properties: {
          currentLoad: { type: 'number', minimum: 0 },
          targetLoad: { type: 'number', minimum: 0 },
          threshold: { type: 'number', minimum: 0 }
        }
      }
    },
    required: ['timestamp', 'service', 'region', 'action', 'fromInstances', 'toInstances', 'reason']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a service scales'
  });
}

/**
 * Register analytics-related event schemas
 */
async function registerAnalyticsSchemas() {
  // Fraud Detection Event
  await eventSchemaRegistry.registerSchema('fraud_detection', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      eventType: { type: 'string', enum: ['vote', 'registration', 'login'] },
      userId: { type: 'string', minLength: 1 },
      electionId: { type: 'string' },
      timestamp: { type: 'number' },
      score: { type: 'number', minimum: 0, maximum: 1 },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      factors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            weight: { type: 'number', minimum: 0, maximum: 1 },
            value: { type: 'number' },
            description: { type: 'string' }
          }
        }
      },
      action: { type: 'string', enum: ['allow', 'block', 'flag', 'investigate'] },
      ipAddress: { type: 'string' },
      deviceFingerprint: { type: 'string' },
      region: { type: 'string' }
    },
    required: ['id', 'eventType', 'userId', 'timestamp', 'score', 'riskLevel', 'action', 'region']
  }, {
    compatibility: 'backward',
    description: 'Event fired when fraud detection is performed'
  });

  // Voting Pattern Event
  await eventSchemaRegistry.registerSchema('voting_pattern', 1, {
    type: 'object',
    properties: {
      electionId: { type: 'string', minLength: 1 },
      timestamp: { type: 'number' },
      timeWindow: { type: 'number' }, // Time window in seconds
      metrics: {
        type: 'object',
        properties: {
          totalVotes: { type: 'number', minimum: 0 },
          uniqueVoters: { type: 'number', minimum: 0 },
          votesPerMinute: { type: 'number', minimum: 0 },
          peakTime: { type: 'number' },
          geographicDistribution: {
            type: 'object',
            patternProperties: {
              '^[a-z-]+$': { type: 'number', minimum: 0 }
            }
          },
          deviceDistribution: {
            type: 'object',
            properties: {
              desktop: { type: 'number', minimum: 0 },
              mobile: { type: 'number', minimum: 0 },
              tablet: { type: 'number', minimum: 0 },
              other: { type: 'number', minimum: 0 }
            }
          }
        }
      }
    },
    required: ['electionId', 'timestamp', 'timeWindow', 'metrics']
  }, {
    compatibility: 'backward',
    description: 'Event fired with voting pattern analytics'
  });
}

/**
 * Register security-related event schemas
 */
async function registerSecuritySchemas() {
  // Security Incident Event
  await eventSchemaRegistry.registerSchema('security_incident', 1, {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['unauthorized_access', 'data_breach', 'ddos', 'injection', 'xss', 'other'] },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      timestamp: { type: 'number' },
      description: { type: 'string', maxLength: 1000 },
      source: {
        type: 'object',
        properties: {
          ipAddress: { type: 'string' },
          userAgent: { type: 'string' },
          userId: { type: 'string' },
          service: { type: 'string' },
          region: { type: 'string' }
        }
      },
      impact: {
        type: 'object',
        properties: {
          affectedUsers: { type: 'number', minimum: 0 },
          affectedSystems: { type: 'array', items: { type: 'string' } },
          dataExposed: { type: 'boolean' },
          serviceDisruption: { type: 'boolean' }
        }
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            timestamp: { type: 'number' },
            performedBy: { type: 'string' },
            result: { type: 'string' }
          }
        }
      },
      status: { type: 'string', enum: ['open', 'investigating', 'contained', 'resolved'] }
    },
    required: ['id', 'type', 'severity', 'timestamp', 'description', 'status']
  }, {
    compatibility: 'backward',
    description: 'Event fired when a security incident occurs'
  });

  // Access Denied Event
  await eventSchemaRegistry.registerSchema('access_denied', 1, {
    type: 'object',
    properties: {
      timestamp: { type: 'number' },
      userId: { type: 'string' },
      resource: { type: 'string', minLength: 1 },
      action: { type: 'string', minLength: 1 },
      reason: { type: 'string', enum: ['unauthorized', 'forbidden', 'expired', 'disabled', 'other'] },
      ipAddress: { type: 'string' },
      userAgent: { type: 'string' },
      region: { type: 'string' },
      sessionId: { type: 'string' }
    },
    required: ['timestamp', 'resource', 'action', 'reason', 'region']
  }, {
    compatibility: 'backward',
    description: 'Event fired when access is denied'
  });
}

module.exports = {
  initializeEventSchemas,
  registerElectionSchemas,
  registerVoteSchemas,
  registerUserSchemas,
  registerCandidateSchemas,
  registerSystemSchemas,
  registerAnalyticsSchemas,
  registerSecuritySchemas
};
