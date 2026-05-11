/**
 * Event type definitions for VoteWave platform
 * Provides type safety for all event schemas and operations
 */

export interface BaseEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  timestamp: number;
  version: number;
  causationId?: string;
  correlationId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ElectionCreatedEvent extends BaseEvent {
  eventType: 'election_created';
  data: {
    id: string;
    title: string;
    description?: string;
    type: 'general' | 'primary' | 'runoff' | 'referendum';
    status: 'draft' | 'active' | 'completed' | 'cancelled';
    startDate: number;
    endDate: number;
    settings: {
      allowAnonymous: boolean;
      requireVerification: boolean;
      maxVotesPerVoter: number;
      votingMethod: 'single' | 'multiple' | 'ranked';
    };
    createdBy: string;
    region: string;
    timezone: string;
  };
}

export interface ElectionUpdatedEvent extends BaseEvent {
  eventType: 'election_updated';
  data: {
    id: string;
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
    updatedBy: string;
    reason?: string;
  };
}

export interface ElectionStartedEvent extends BaseEvent {
  eventType: 'election_started';
  data: {
    id: string;
    startedAt: number;
    startedBy: string;
    initialCandidates: string[];
  };
}

export interface ElectionEndedEvent extends BaseEvent {
  eventType: 'election_ended';
  data: {
    id: string;
    endedAt: number;
    endedBy: string;
    totalVotes: number;
    totalVoters: number;
    winner?: {
      candidateId: string;
      votes: number;
      percentage: number;
    };
  };
}

export interface VoteCastEvent extends BaseEvent {
  eventType: 'vote_cast';
  data: {
    id: string;
    electionId: string;
    userId: string;
    candidateId: string;
    timestamp: number;
    ipAddress?: string;
    userAgent?: string;
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'other';
    region: string;
    fraudScore: number;
    verified: boolean;
    metadata?: {
      sessionId?: string;
      referrer?: string;
      votingTime?: number;
    };
  };
}

export interface VoteUpdatedEvent extends BaseEvent {
  eventType: 'vote_updated';
  data: {
    id: string;
    electionId: string;
    userId: string;
    previousCandidateId: string;
    newCandidateId: string;
    timestamp: number;
    reason?: string;
    updatedBy: string;
  };
}

export interface VoteCancelledEvent extends BaseEvent {
  eventType: 'vote_cancelled';
  data: {
    id: string;
    electionId: string;
    userId: string;
    candidateId: string;
    timestamp: number;
    reason?: string;
    cancelledBy: string;
  };
}

export interface UserRegisteredEvent extends BaseEvent {
  eventType: 'user_registered';
  data: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'voter' | 'admin' | 'observer';
    status: 'active' | 'inactive' | 'suspended';
    registeredAt: number;
    ipAddress?: string;
    region: string;
    verified: boolean;
    metadata?: {
      source: 'web' | 'mobile' | 'api' | 'admin';
      referralCode?: string;
      preferences?: {
        language?: string;
        timezone?: string;
        notifications?: boolean;
      };
    };
  };
}

export interface UserUpdatedEvent extends BaseEvent {
  eventType: 'user_updated';
  data: {
    id: string;
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
    updatedAt: number;
    updatedBy: string;
  };
}

export interface UserAuthenticatedEvent extends BaseEvent {
  eventType: 'user_authenticated';
  data: {
    userId: string;
    method: 'password' | 'oauth' | 'mfa' | 'sso';
    timestamp: number;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    success: boolean;
    failureReason?: string;
    region: string;
  };
}

export interface CandidateAddedEvent extends BaseEvent {
  eventType: 'candidate_added';
  data: {
    id: string;
    electionId: string;
    name: string;
    party?: string;
    description?: string;
    addedAt: number;
    addedBy: string;
    order: number;
    metadata?: {
      imageUrl?: string;
      website?: string;
      socialMedia?: {
        twitter?: string;
        facebook?: string;
        instagram?: string;
      };
    };
  };
}

export interface CandidateRemovedEvent extends BaseEvent {
  eventType: 'candidate_removed';
  data: {
    id: string;
    electionId: string;
    removedAt: number;
    removedBy: string;
    reason?: string;
  };
}

export interface SystemHealthCheckEvent extends BaseEvent {
  eventType: 'system_health_check';
  data: {
    timestamp: number;
    service: string;
    region: string;
    status: 'healthy' | 'unhealthy' | 'degraded';
    metrics: {
      responseTime: number;
      errorRate: number;
      throughput: number;
      memoryUsage: number;
      cpuUsage: number;
    };
    checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      duration: number;
    }>;
  };
}

export interface ServiceScalingEvent extends BaseEvent {
  eventType: 'service_scaling';
  data: {
    timestamp: number;
    service: string;
    region: string;
    action: 'scale_up' | 'scale_down' | 'scale_out' | 'scale_in';
    fromInstances: number;
    toInstances: number;
    reason: 'load' | 'schedule' | 'manual' | 'auto';
    metrics: {
      currentLoad: number;
      targetLoad: number;
      threshold: number;
    };
  };
}

export interface FraudDetectionEvent extends BaseEvent {
  eventType: 'fraud_detection';
  data: {
    id: string;
    eventType: 'vote' | 'registration' | 'login';
    userId: string;
    electionId?: string;
    timestamp: number;
    score: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    factors: Array<{
      name: string;
      weight: number;
      value: number;
      description: string;
    }>;
    action: 'allow' | 'block' | 'flag' | 'investigate';
    ipAddress?: string;
    deviceFingerprint?: string;
    region: string;
  };
}

export interface VotingPatternEvent extends BaseEvent {
  eventType: 'voting_pattern';
  data: {
    electionId: string;
    timestamp: number;
    timeWindow: number;
    metrics: {
      totalVotes: number;
      uniqueVoters: number;
      votesPerMinute: number;
      peakTime: number;
      geographicDistribution: Record<string, number>;
      deviceDistribution: {
        desktop: number;
        mobile: number;
        tablet: number;
        other: number;
      };
    };
  };
}

export interface SecurityIncidentEvent extends BaseEvent {
  eventType: 'security_incident';
  data: {
    id: string;
    type: 'unauthorized_access' | 'data_breach' | 'ddos' | 'injection' | 'xss' | 'other';
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: number;
    description: string;
    source: {
      ipAddress?: string;
      userAgent?: string;
      userId?: string;
      service?: string;
      region?: string;
    };
    impact: {
      affectedUsers: number;
      affectedSystems: string[];
      dataExposed: boolean;
      serviceDisruption: boolean;
    };
    actions: Array<{
      action: string;
      timestamp: number;
      performedBy: string;
      result: string;
    }>;
    status: 'open' | 'investigating' | 'contained' | 'resolved';
  };
}

export interface AccessDeniedEvent extends BaseEvent {
  eventType: 'access_denied';
  data: {
    timestamp: number;
    userId?: string;
    resource: string;
    action: string;
    reason: 'unauthorized' | 'forbidden' | 'expired' | 'disabled' | 'other';
    ipAddress?: string;
    userAgent?: string;
    region: string;
    sessionId?: string;
  };
}

// Union type for all events
export type VoteWaveEvent = 
  | ElectionCreatedEvent
  | ElectionUpdatedEvent
  | ElectionStartedEvent
  | ElectionEndedEvent
  | VoteCastEvent
  | VoteUpdatedEvent
  | VoteCancelledEvent
  | UserRegisteredEvent
  | UserUpdatedEvent
  | UserAuthenticatedEvent
  | CandidateAddedEvent
  | CandidateRemovedEvent
  | SystemHealthCheckEvent
  | ServiceScalingEvent
  | FraudDetectionEvent
  | VotingPatternEvent
  | SecurityIncidentEvent
  | AccessDeniedEvent;

// Event type mapping
export interface EventTypeMap {
  'election_created': ElectionCreatedEvent;
  'election_updated': ElectionUpdatedEvent;
  'election_started': ElectionStartedEvent;
  'election_ended': ElectionEndedEvent;
  'vote_cast': VoteCastEvent;
  'vote_updated': VoteUpdatedEvent;
  'vote_cancelled': VoteCancelledEvent;
  'user_registered': UserRegisteredEvent;
  'user_updated': UserUpdatedEvent;
  'user_authenticated': UserAuthenticatedEvent;
  'candidate_added': CandidateAddedEvent;
  'candidate_removed': CandidateRemovedEvent;
  'system_health_check': SystemHealthCheckEvent;
  'service_scaling': ServiceScalingEvent;
  'fraud_detection': FraudDetectionEvent;
  'voting_pattern': VotingPatternEvent;
  'security_incident': SecurityIncidentEvent;
  'access_denied': AccessDeniedEvent;
}

// Event factory types
export type EventFactory<T extends keyof EventTypeMap> = (
  data: Omit<EventTypeMap[T]['data'], 'timestamp'>,
  metadata?: Omit<BaseEvent, 'data' | 'eventType' | 'timestamp'>
) => EventTypeMap[T];

// Event handler types
export type EventHandler<T extends VoteWaveEvent> = (event: T) => Promise<void> | void;

export type EventProcessor = {
  [K in keyof EventTypeMap]: EventHandler<EventTypeMap[K]>;
};

// Schema validation types
export interface EventSchema {
  type: 'object';
  properties: Record<string, PropertyDefinition>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface PropertyDefinition {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: any[];
  default?: any;
  format?: string;
  items?: PropertyDefinition;
  properties?: Record<string, PropertyDefinition>;
}

// Compatibility types
export type CompatibilityType = 'backward' | 'forward' | 'full' | 'none';

export interface CompatibilityRule {
  description: string;
  validate: (oldSchema: EventSchema, newSchema: EventSchema) => boolean;
}

export interface CompatibilityResult {
  compatible: boolean;
  fromVersion: number;
  toVersion: number;
  compatibilityType: CompatibilityType;
  fromSchema: EventSchema;
  toSchema: EventSchema;
  rule: string;
  error?: string;
}

// Registry types
export interface SchemaDefinition {
  id: string;
  eventType: string;
  version: number;
  schema: EventSchema;
  compatibility: CompatibilityType;
  deprecated: boolean;
  deprecationDate?: number;
  description: string;
  examples: any[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface RegistryStats {
  totalSchemas: number;
  totalEventTypes: number;
  compatibilityRules: number;
  cacheSize: number;
  eventTypes: Array<{
    eventType: string;
    totalVersions: number;
    latestVersion: number;
    deprecatedCount: number;
    compatibility: CompatibilityType;
  }>;
}

// Validation types
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  schema?: SchemaDefinition;
}

// Migration types
export interface MigrationOptions {
  compatibilityType?: CompatibilityType;
  strictMode?: boolean;
  validateResult?: boolean;
}

export interface MigrationResult {
  success: boolean;
  migratedEvent: VoteWaveEvent;
  fromVersion: number;
  toVersion: number;
  validation?: ValidationResult;
  error?: string;
}
