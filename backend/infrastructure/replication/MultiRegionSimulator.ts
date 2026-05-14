/**
 * Multi-Region Replication Simulator - Simulates multi-region deployment scenarios
 * Provides testing capabilities for distributed systems behavior across regions
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { DomainEvent } from '../../core/event-store/EventStore';

export interface Region {
  id: string;
  name: string;
  location: string;
  latency: number; // Base latency in ms
  bandwidth: number; // Bandwidth in Mbps
  availability: number; // Availability percentage (0-100)
  isActive: boolean;
  metadata: RegionMetadata;
}

export interface RegionMetadata {
  timezone: string;
  datacenter: string;
  provider: string;
  regionCode: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface ReplicationConfig {
  primaryRegion: string;
  replicaRegions: string[];
  replicationMode: 'synchronous' | 'asynchronous' | 'eventual';
  consistencyLevel: 'strong' | 'eventual' | 'bounded_staleness';
  replicationLag: number; // Target lag in ms
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    maxDelay: number;
  };
}

export interface ReplicationEvent {
  id: string;
  type: 'replicate' | 'acknowledge' | 'fail' | 'retry' | 'timeout';
  sourceRegion: string;
  targetRegion: string;
  eventId: string;
  timestamp: number;
  latency?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ReplicationMetrics {
  totalEvents: number;
  successfulReplications: number;
  failedReplications: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  replicationLag: number;
  throughput: number; // events per second
  errorRate: number;
  regionMetrics: Record<string, RegionMetrics>;
}

export interface RegionMetrics {
  regionId: string;
  eventsReceived: number;
  eventsProcessed: number;
  averageProcessingTime: number;
  currentLag: number;
  availability: number;
  lastActivity: number;
  errors: number;
}

export interface SimulationScenario {
  name: string;
  description: string;
  config: SimulationConfig;
  expectedBehavior: ExpectedBehavior;
}

export interface SimulationConfig {
  duration: number; // Simulation duration in ms
  regions: Region[];
  replicationConfig: ReplicationConfig;
  eventRate: number; // Events per second
  failureScenarios: FailureScenario[];
  networkConditions: NetworkConditions;
}

export interface FailureScenario {
  type: 'partition' | 'outage' | 'degradation' | 'latency_spike';
  region: string;
  startTime: number;
  duration: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  parameters: Record<string, any>;
}

export interface NetworkConditions {
  baseLatency: number;
  latencyVariation: number;
  packetLoss: number;
  bandwidthLimit: number;
  jitter: number;
}

export interface ExpectedBehavior {
  availability: number;
  consistency: string;
  maxLag: number;
  errorRate: number;
}

export class MultiRegionSimulator extends EventEmitter {
  private regions: Map<string, Region> = new Map();
  private replicationConfig: ReplicationConfig;
  private isActive: boolean = false;
  private simulationStartTime: number = 0;
  private eventQueue: ReplicationEvent[] = [];
  private metrics: ReplicationMetrics;
  private activeFailures: Map<string, FailureScenario> = new Map();
  private eventCounter: number = 0;

  constructor(config: ReplicationConfig) {
    super();
    this.replicationConfig = config;
    this.metrics = this.initializeMetrics();
    
    logger.info('MultiRegionSimulator initialized', {
      primaryRegion: config.primaryRegion,
      replicaRegions: config.replicaRegions,
      replicationMode: config.replicationMode
    });
  }

  /**
   * Add a region to the simulation
   */
  addRegion(region: Region): void {
    this.regions.set(region.id, region);
    this.metrics.regionMetrics[region.id] = {
      regionId: region.id,
      eventsReceived: 0,
      eventsProcessed: 0,
      averageProcessingTime: 0,
      currentLag: 0,
      availability: region.availability,
      lastActivity: Date.now(),
      errors: 0
    };

    logger.debug('Region added to simulation', {
      regionId: region.id,
      name: region.name,
      location: region.location
    });
  }

  /**
   * Remove a region from the simulation
   */
  removeRegion(regionId: string): void {
    this.regions.delete(regionId);
    delete this.metrics.regionMetrics[regionId];
    
    logger.debug('Region removed from simulation', { regionId });
  }

  /**
   * Start simulation
   */
  async startSimulation(scenario: SimulationScenario): Promise<void> {
    if (this.isActive) {
      throw new Error('Simulation is already active');
    }

    try {
      logger.info('Starting multi-region simulation', {
        scenario: scenario.name,
        duration: scenario.config.duration,
        regions: scenario.config.regions.length
      });

      // Setup regions
      this.setupRegions(scenario.config.regions);

      // Setup replication config
      this.replicationConfig = scenario.config.replicationConfig;

      // Start simulation
      this.isActive = true;
      this.simulationStartTime = Date.now();

      // Start event generation
      this.startEventGeneration(scenario);

      // Start failure scenarios
      this.startFailureScenarios(scenario.config.failureScenarios);

      // Emit start event
      this.emit('simulationStarted', {
        scenario: scenario.name,
        startTime: this.simulationStartTime,
        regions: Array.from(this.regions.keys())
      });

      // Run simulation for specified duration
      await this.runSimulation(scenario.config.duration);

      logger.info('Simulation completed', {
        scenario: scenario.name,
        duration: Date.now() - this.simulationStartTime,
        totalEvents: this.metrics.totalEvents
      });

    } catch (error) {
      logger.error('Simulation failed', {
        scenario: scenario.name,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop simulation
   */
  stopSimulation(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.activeFailures.clear();

    this.emit('simulationStopped', {
      stopTime: Date.now(),
      duration: Date.now() - this.simulationStartTime,
      metrics: this.metrics
    });

    logger.info('Simulation stopped', {
      duration: Date.now() - this.simulationStartTime,
      totalEvents: this.metrics.totalEvents
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): ReplicationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get region status
   */
  getRegionStatus(): Region[] {
    return Array.from(this.regions.values());
  }

  /**
   * Get active failures
   */
  getActiveFailures(): FailureScenario[] {
    return Array.from(this.activeFailures.values());
  }

  /**
   * Simulate event replication
   */
  async replicateEvent(event: DomainEvent, sourceRegion: string): Promise<ReplicationEvent[]> {
    const replicationEvents: ReplicationEvent[] = [];
    const eventId = `replication_${this.eventCounter++}`;

    // Get target regions
    const targetRegions = this.getTargetRegions(sourceRegion);

    for (const targetRegion of targetRegions) {
      const replicationEvent = await this.replicateToRegion(
        event,
        sourceRegion,
        targetRegion,
        eventId
      );
      
      replicationEvents.push(replicationEvent);
    }

    return replicationEvents;
  }

  /**
   * Simulate network partition
   */
  simulatePartition(regionId: string, duration: number): void {
    const region = this.regions.get(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    region.isActive = false;
    region.availability = 0;

    // Schedule recovery
    setTimeout(() => {
      region.isActive = true;
      region.availability = 100;
      
      this.emit('partitionHealed', {
        regionId,
        healedAt: Date.now()
      });

      logger.info('Network partition healed', { regionId });
    }, duration);

    this.emit('partitionCreated', {
      regionId,
      createdAt: Date.now(),
      duration
    });

    logger.info('Network partition simulated', { regionId, duration });
  }

  /**
   * Simulate region outage
   */
  simulateOutage(regionId: string, duration: number, severity: 'partial' | 'full' = 'full'): void {
    const region = this.regions.get(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    const originalAvailability = region.availability;
    region.availability = severity === 'full' ? 0 : 50;
    region.isActive = severity !== 'full';

    // Schedule recovery
    setTimeout(() => {
      region.availability = originalAvailability;
      region.isActive = true;
      
      this.emit('outageRecovered', {
        regionId,
        recoveredAt: Date.now(),
        severity
      });

      logger.info('Region outage recovered', { regionId, severity });
    }, duration);

    this.emit('outageCreated', {
      regionId,
      createdAt: Date.now(),
      duration,
      severity
    });

    logger.info('Region outage simulated', { regionId, duration, severity });
  }

  /**
   * Simulate latency spike
   */
  simulateLatencySpike(regionId: string, multiplier: number, duration: number): void {
    const region = this.regions.get(regionId);
    if (!region) {
      throw new Error(`Region ${regionId} not found`);
    }

    const originalLatency = region.latency;
    region.latency = originalLatency * multiplier;

    // Schedule recovery
    setTimeout(() => {
      region.latency = originalLatency;
      
      this.emit('latencyNormalized', {
        regionId,
        normalizedAt: Date.now(),
        originalLatency
      });

      logger.info('Latency spike normalized', { regionId });
    }, duration);

    this.emit('latencySpikeCreated', {
      regionId,
      createdAt: Date.now(),
      duration,
      multiplier,
      originalLatency
    });

    logger.info('Latency spike simulated', { regionId, multiplier, duration });
  }

  /**
   * Setup regions for simulation
   */
  private setupRegions(regions: Region[]): void {
    this.regions.clear();
    
    for (const region of regions) {
      this.addRegion(region);
    }

    logger.debug('Regions setup completed', {
      regionCount: regions.length,
      regionIds: regions.map(r => r.id)
    });
  }

  /**
   * Start event generation
   */
  private startEventGeneration(scenario: SimulationConfig): void {
    const eventInterval = 1000 / scenario.config.eventRate; // Convert to ms

    const generateEvent = () => {
      if (!this.isActive) {
        return;
      }

      // Generate mock event
      const event: DomainEvent = {
        id: `event_${this.eventCounter++}`,
        type: 'MockEvent',
        aggregateId: `aggregate_${Math.floor(Math.random() * 100)}`,
        aggregateType: 'mock',
        version: Math.floor(Math.random() * 100) + 1,
        timestamp: Date.now(),
        payload: {
          data: `Mock event data ${this.eventCounter}`,
          random: Math.random()
        }
      };

      // Replicate to regions
      this.replicateEvent(event, this.replicationConfig.primaryRegion)
        .then(events => {
          this.updateMetrics(events);
        })
        .catch(error => {
          logger.error('Event replication failed', { error: error.message });
        });

      // Schedule next event
      setTimeout(generateEvent, eventInterval);
    };

    // Start generating events
    setTimeout(generateEvent, Math.random() * eventInterval);
  }

  /**
   * Start failure scenarios
   */
  private startFailureScenarios(scenarios: FailureScenario[]): void {
    for (const scenario of scenarios) {
      const startTime = this.simulationStartTime + scenario.startTime;
      
      setTimeout(() => {
        this.executeFailureScenario(scenario);
      }, startTime);
    }
  }

  /**
   * Execute failure scenario
   */
  private executeFailureScenario(scenario: FailureScenario): void {
    this.activeFailures.set(`${scenario.type}_${scenario.region}`, scenario);

    switch (scenario.type) {
      case 'partition':
        this.simulatePartition(scenario.region, scenario.duration);
        break;
      case 'outage':
        this.simulateOutage(
          scenario.region,
          scenario.duration,
          scenario.parameters.severity as 'partial' | 'full'
        );
        break;
      case 'latency_spike':
        this.simulateLatencySpike(
          scenario.region,
          scenario.parameters.multiplier as number,
          scenario.duration
        );
        break;
      case 'degradation':
        this.simulateDegradation(scenario);
        break;
    }

    // Schedule scenario cleanup
    setTimeout(() => {
      this.activeFailures.delete(`${scenario.type}_${scenario.region}`);
    }, scenario.duration);
  }

  /**
   * Simulate degradation
   */
  private simulateDegradation(scenario: FailureScenario): void {
    const region = this.regions.get(scenario.region);
    if (!region) {
      return;
    }

    const originalAvailability = region.availability;
    const originalLatency = region.latency;

    // Apply degradation
    region.availability = originalAvailability * 0.7; // 30% degradation
    region.latency = originalLatency * 2; // 2x latency

    // Schedule recovery
    setTimeout(() => {
      region.availability = originalAvailability;
      region.latency = originalLatency;
      
      this.emit('degradationRecovered', {
        regionId: scenario.region,
        recoveredAt: Date.now()
      });
    }, scenario.duration);

    this.emit('degradationCreated', {
      regionId: scenario.region,
      createdAt: Date.now(),
      duration
    });
  }

  /**
   * Run simulation for specified duration
   */
  private async runSimulation(duration: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.stopSimulation();
        resolve();
      }, duration);
    });
  }

  /**
   * Replicate event to specific region
   */
  private async replicateToRegion(
    event: DomainEvent,
    sourceRegion: string,
    targetRegion: string,
    replicationId: string
  ): Promise<ReplicationEvent> {
    const startTime = Date.now();
    const source = this.regions.get(sourceRegion);
    const target = this.regions.get(targetRegion);

    if (!source || !target || !target.isActive) {
      const error = `Target region ${targetRegion} is not available`;
      
      return {
        id: replicationId,
        type: 'fail',
        sourceRegion,
        targetRegion,
        eventId: event.id,
        timestamp: startTime,
        error
      };
    }

    // Calculate replication latency
    const baseLatency = source.latency + target.latency;
    const networkLatency = baseLatency + (Math.random() * 100 - 50); // Add variation
    const processingLatency = Math.random() * 50; // Processing time
    const totalLatency = networkLatency + processingLatency;

    // Simulate replication delay
    await this.sleep(totalLatency);

    // Update region metrics
    this.updateRegionMetrics(targetRegion, totalLatency);

    const replicationEvent: ReplicationEvent = {
      id: replicationId,
      type: 'replicate',
      sourceRegion,
      targetRegion,
      eventId: event.id,
      timestamp: startTime,
      latency: totalLatency
    };

    // Emit replication event
    this.emit('eventReplicated', replicationEvent);

    return replicationEvent;
  }

  /**
   * Get target regions for replication
   */
  private getTargetRegions(sourceRegion: string): string[] {
    if (this.replicationConfig.replicationMode === 'synchronous') {
      // Synchronous: replicate to all regions
      return this.replicationConfig.replicaRegions.filter(r => r !== sourceRegion);
    } else {
      // Asynchronous/eventual: replicate to subset based on availability
      return this.replicationConfig.replicaRegions
        .filter(r => r !== sourceRegion)
        .filter(r => {
          const region = this.regions.get(r);
          return region && region.isActive && Math.random() < (region.availability / 100);
        });
    }
  }

  /**
   * Update metrics
   */
  private updateMetrics(events: ReplicationEvent[]): void {
    this.metrics.totalEvents += events.length;
    
    for (const event of events) {
      if (event.type === 'replicate') {
        this.metrics.successfulReplications++;
        
        if (event.latency) {
          this.metrics.averageLatency = 
            (this.metrics.averageLatency * (this.metrics.successfulReplications - 1) + event.latency) / 
            this.metrics.successfulReplications;
          
          this.metrics.maxLatency = Math.max(this.metrics.maxLatency, event.latency);
          this.metrics.minLatency = this.metrics.minLatency === 0 ? event.latency : 
            Math.min(this.metrics.minLatency, event.latency);
        }
      } else {
        this.metrics.failedReplications++;
      }
    }

    this.metrics.errorRate = this.metrics.totalEvents > 0 ? 
      (this.metrics.failedReplications / this.metrics.totalEvents) * 100 : 0;

    // Calculate throughput
    const elapsed = (Date.now() - this.simulationStartTime) / 1000; // seconds
    this.metrics.throughput = elapsed > 0 ? this.metrics.totalEvents / elapsed : 0;
  }

  /**
   * Update region metrics
   */
  private updateRegionMetrics(regionId: string, latency: number): void {
    const metrics = this.metrics.regionMetrics[regionId];
    if (!metrics) {
      return;
    }

    metrics.eventsProcessed++;
    metrics.averageProcessingTime = 
      (metrics.averageProcessingTime * (metrics.eventsProcessed - 1) + latency) / 
      metrics.eventsProcessed;
    metrics.lastActivity = Date.now();
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): ReplicationMetrics {
    return {
      totalEvents: 0,
      successfulReplications: 0,
      failedReplications: 0,
      averageLatency: 0,
      maxLatency: 0,
      minLatency: 0,
      replicationLag: 0,
      throughput: 0,
      errorRate: 0,
      regionMetrics: {}
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default MultiRegionSimulator;
