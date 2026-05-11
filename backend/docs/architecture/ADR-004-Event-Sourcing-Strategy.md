# ADR-004: Event Sourcing Strategy

## Status
Accepted

## Context
VoteWave requires event sourcing to support:

* Complete audit trail of all voting operations
* System state reconstruction for forensic analysis
* Temporal queries and historical analysis
* Debugging and troubleshooting capabilities
* Regulatory compliance and audit requirements

## Decision
We implement event sourcing with the following characteristics:

### Event Store Design
1. **Immutable Event Log**: All events stored in append-only log
2. **Snapshot Strategy**: Periodic snapshots for performance optimization
3. **Event Versioning**: Versioned event schemas for evolution
4. **Partitioning**: Events partitioned by aggregate type and ID
5. **Retention Policies**: Configurable retention based on event importance

### Event Categories
- **Domain Events**: Business events (vote cast, election created)
- **System Events**: Infrastructure events (health checks, scaling)
- **Audit Events**: Security and compliance events (login, permission changes)
- **Analytics Events**: Business intelligence events (voting patterns)

### Storage Strategy
```javascript
// Event Stream Structure
const eventStream = {
  aggregateType: 'election|vote|user',
  aggregateId: 'unique_identifier',
  events: [
    {
      id: 'evt_timestamp_random',
      type: 'EventType',
      data: { /* event payload */ },
      metadata: {
        timestamp: 1234567890,
        version: 1,
        causationId: 'causing_event_id',
        correlationId: 'correlation_id',
        userId: 'user_id',
        source: 'service_name'
      }
    }
  ],
  snapshots: [
    {
      version: 100,
      data: { /* aggregate state */ },
      timestamp: 1234567890
    }
  ]
};
```

## Consequences

### Positive
- **Complete Audit Trail**: Every state change recorded and traceable
- **Temporal Queries**: Query system state at any point in time
- **Debugging**: Complete event history for troubleshooting
- **Replay Capability**: System can be rebuilt from events
- **Compliance**: Meets regulatory audit requirements

### Negative
- **Storage Growth**: Event log grows continuously
- **Replay Performance**: Rebuilding state from events can be slow
- **Schema Evolution**: Event schema changes require careful handling
- **Complex Queries**: Complex queries require event processing
- **Storage Cost**: Increased storage requirements

### Risks
- **Event Corruption**: Corrupted events can break replay
- **Schema Breaking**: Breaking changes can break historical data
- **Performance Issues**: Large event streams impact performance
- **Data Loss**: Event loss means irreversible state loss
- **Replay Failures**: Replay failures can corrupt system state

## Implementation Details

### Event Store Interface
```javascript
class EventStore {
  async saveEvent(aggregateType, aggregateId, event) {
    // Validate event
    this.validateEvent(event);
    
    // Store in event stream
    await this.appendToStream(aggregateType, aggregateId, event);
    
    // Update snapshot if needed
    if (this.shouldCreateSnapshot(aggregateType, aggregateId)) {
      await this.createSnapshot(aggregateType, aggregateId);
    }
    
    // Publish event for consumers
    await this.publishEvent(event);
  }

  async loadEvents(aggregateType, aggregateId, fromVersion = 0) {
    // Load from latest snapshot if available
    const snapshot = await this.getLatestSnapshot(aggregateType, aggregateId);
    
    // Load events since snapshot
    const events = await this.loadEventsFromVersion(
      aggregateType, 
      aggregateId, 
      snapshot ? snapshot.version : fromVersion
    );
    
    return [snapshot, ...events].filter(Boolean);
  }

  async replayAggregate(aggregateType, aggregateId, toVersion = null) {
    const events = await this.loadEvents(aggregateType, aggregateId, 0, toVersion);
    
    let state = this.initializeAggregate(aggregateType);
    
    for (const event of events) {
      if (event.snapshot) {
        state = event.data;
      } else {
        state = this.applyEvent(state, event);
      }
    }
    
    return state;
  }
}
```

### Snapshot Strategy
```javascript
class SnapshotManager {
  constructor() {
    this.snapshotInterval = 1000; // Every 1000 events
    this.maxSnapshots = 10; // Keep last 10 snapshots
  }

  async shouldCreateSnapshot(aggregateType, aggregateId) {
    const eventCount = await this.getEventCount(aggregateType, aggregateId);
    return eventCount % this.snapshotInterval === 0;
  }

  async createSnapshot(aggregateType, aggregateId) {
    // Rebuild current state
    const currentState = await this.rebuildState(aggregateType, aggregateId);
    
    // Create snapshot
    const snapshot = {
      aggregateType,
      aggregateId,
      version: currentState.version,
      data: this.extractSnapshotData(currentState),
      timestamp: Date.now()
    };
    
    // Store snapshot
    await this.storeSnapshot(snapshot);
    
    // Clean up old snapshots
    await this.cleanupOldSnapshots(aggregateType, aggregateId);
  }

  extractSnapshotData(state) {
    // Extract only essential state data
    return {
      id: state.id,
      title: state.title,
      status: state.status,
      totalVotes: state.totalVotes,
      // ... other essential fields
    };
  }
}
```

### Event Schema Evolution
```javascript
class EventSchemaRegistry {
  constructor() {
    this.schemas = new Map();
    this.migrations = new Map();
  }

  registerSchema(eventType, version, schema) {
    const key = `${eventType}_v${version}`;
    this.schemas.set(key, schema);
  }

  registerMigration(eventType, fromVersion, toVersion, migration) {
    const key = `${eventType}_${fromVersion}_to_${toVersion}`;
    this.migrations.set(key, migration);
  }

  async validateEvent(event) {
    const schemaKey = `${event.type}_v${event.version}`;
    const schema = this.schemas.get(schemaKey);
    
    if (!schema) {
      throw new Error(`Unknown event schema: ${schemaKey}`);
    }
    
    return this.validateAgainstSchema(event.data, schema);
  }

  async migrateEvent(event, targetVersion) {
    let currentEvent = event;
    let currentVersion = event.version;
    
    while (currentVersion < targetVersion) {
      const migrationKey = `${event.type}_${currentVersion}_to_${currentVersion + 1}`;
      const migration = this.migrations.get(migrationKey);
      
      if (!migration) {
        throw new Error(`No migration found for ${migrationKey}`);
      }
      
      currentEvent = await migration(currentEvent);
      currentVersion++;
    }
    
    return currentEvent;
  }
}
```

### Event Replay
```javascript
class EventReplayer {
  constructor() {
    this.replaySessions = new Map();
  }

  async startReplaySession(config) {
    const session = {
      id: this.generateSessionId(),
      config,
      status: 'running',
      startTime: Date.now(),
      progress: {
        totalEvents: 0,
        processedEvents: 0,
        failedEvents: 0
      },
      events: []
    };
    
    this.replaySessions.set(session.id, session);
    
    // Start replay process
    this.processReplaySession(session);
    
    return session;
  }

  async processReplaySession(session) {
    try {
      // Load events based on config
      const events = await this.loadEventsForReplay(session.config);
      session.progress.totalEvents = events.length;
      
      // Process events
      for (const event of events) {
        try {
          await this.processEvent(event, session.config);
          session.progress.processedEvents++;
        } catch (error) {
          session.progress.failedEvents++;
          this.handleReplayError(event, error, session);
        }
        
        // Update progress
        session.events.push({
          eventId: event.id,
          timestamp: event.timestamp,
          status: 'processed'
        });
        
        // Check for session pause/stop
        if (session.status !== 'running') {
          break;
        }
      }
      
      session.status = 'completed';
      
    } catch (error) {
      session.status = 'failed';
      session.error = error.message;
    }
  }

  async loadEventsForReplay(config) {
    const { aggregateType, aggregateId, fromTime, toTime, eventTypes } = config;
    
    // Build query
    const query = {
      aggregateType,
      aggregateId,
      startTime: fromTime,
      endTime: toTime,
      eventTypes
    };
    
    // Load events from event store
    return await this.eventStore.queryEvents(query);
  }
}
```

## Performance Considerations

### Storage Optimization
- **Event Compression**: Compress event payloads
- **Batch Storage**: Store events in batches
- **Partitioning**: Partition events by time and aggregate
- **Tiered Storage**: Hot/cold storage based on age

### Query Optimization
- **Indexing**: Index events by common query fields
- **Caching**: Cache frequent query results
- **Materialized Views**: Pre-computed views for common queries
- **Parallel Processing**: Process events in parallel

### Replay Optimization
- **Snapshot Strategy**: Optimize snapshot frequency
- **Incremental Replay**: Replay only changed events
- **Parallel Replay**: Replay multiple aggregates in parallel
- **Selective Replay**: Replay only relevant events

## Monitoring and Observability

### Event Metrics
- Event ingestion rate
- Event storage growth
- Replay performance
- Snapshot creation frequency
- Event processing latency

### Alerting
- Event storage exceeding thresholds
- Replay failures
- Snapshot creation failures
- Event validation failures
- High replay latency

### Tracing
- Event processing traces
- Replay session traces
- Snapshot creation traces
- Event validation traces

## Security and Compliance

### Event Security
- **Event Encryption**: Encrypt sensitive event data
- **Access Control**: Control access to event streams
- **Audit Logging**: Log all event access
- **Data Retention**: Comply with data retention policies

### Compliance
- **Regulatory Requirements**: Meet voting system regulations
- **Audit Trails**: Maintain complete audit trails
- **Data Privacy**: Protect voter privacy in events
- **Immutable Records**: Ensure event immutability

## Disaster Recovery

### Backup Strategy
- **Event Backups**: Regular event stream backups
- **Snapshot Backups**: Backup snapshot data
- **Cross-Region Backup**: Backup events across regions
- **Incremental Backup**: Incremental backup strategies

### Recovery Procedures
- **Event Restoration**: Restore events from backups
- **State Reconstruction**: Rebuild state from events
- **Consistency Validation**: Validate system consistency
- **Service Recovery**: Recover services from events

## Future Considerations

### Advanced Features
- **Event Sourcing as a Service**: Event sourcing platform service
- **Real-time Analytics**: Real-time event processing
- **Machine Learning**: ML models on event data
- **Event Visualization**: Event visualization tools

### Performance Enhancements
- **Event Compression**: Advanced compression algorithms
- **Event Streaming**: Real-time event streaming
- **Distributed Event Store**: Distributed event storage
- **Event Caching**: Advanced event caching strategies

### Operational Improvements
- **Automated Replay**: Automated event replay
- **Event Testing**: Event-driven testing
- **Performance Monitoring**: Advanced performance monitoring
- **Event Governance**: Event governance policies

## Related ADRs
- ADR-001: Event-Driven Architecture
- ADR-002: CQRS Implementation
- ADR-003: Multi-Region Replication
- ADR-005: Geo-Partitioning Strategy
