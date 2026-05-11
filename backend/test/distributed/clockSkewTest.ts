/**
 * Clock Skew Testing Framework
 * Tests system behavior under various clock synchronization scenarios
 */

import { logger } from '../../src/utils/logger';
import { multiRegionReplication } from '../../src/replication/multiRegionReplication';
import { geoPartitionedElections } from '../../src/geoPartitioning/geoPartitionedElections';
import { eventStore } from '../../src/eventSourcing/eventStore';

interface ClockSkewScenario {
  name: string;
  description: string;
  skewConfiguration: ClockSkewConfig;
  testOperations: TestOperation[];
  expectedBehavior: ExpectedBehavior;
  tolerance: ClockSkewTolerance;
}

interface ClockSkewConfig {
  regions: Record<string, number>; // region -> skew in milliseconds
  skewType: 'constant' | 'drift' | 'jump' | 'random';
  driftRate?: number; // milliseconds per second
  updateInterval?: number; // milliseconds
}

interface TestOperation {
  type: 'write' | 'read' | 'vote' | 'election_create' | 'election_end';
  region: string;
  timestamp: number;
  data?: any;
  expectedSuccess?: boolean;
}

interface ExpectedBehavior {
  consistencyGuarantees: string[];
  allowedInconsistencies: string[];
  maxLag: number; // milliseconds
  expectedErrors?: string[];
}

interface ClockSkewTolerance {
  maxAcceptableSkew: number; // milliseconds
  maxReplicationLag: number; // milliseconds
  consistencyWindow: number; // milliseconds
}

interface ClockSkewTestResult {
  scenario: string;
  success: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  skewConfiguration: ClockSkewConfig;
  operations: TestOperationResult[];
  consistencyViolations: ConsistencyViolation[];
  performanceMetrics: ClockSkewPerformanceMetrics;
  errors: string[];
  warnings: string[];
}

interface TestOperationResult {
  operation: TestOperation;
  success: boolean;
  actualTimestamp: number;
  regionTimestamp: number;
  latency: number;
  error?: string;
  consistencyIssues?: string[];
}

interface ConsistencyViolation {
  type: 'timestamp_order' | 'data_consistency' | 'replication_lag' | 'causality';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: number;
  affectedRegions: string[];
  details: any;
}

interface ClockSkewPerformanceMetrics {
  averageLatency: number;
  maxLatency: number;
  replicationLag: Record<string, number>;
  consistencyWindow: number;
  operationSuccessRate: number;
}

class ClockSkewTest {
  private scenarios: ClockSkewScenario[] = [];
  private results: ClockSkewTestResult[] = [];
  private originalTimeFunctions: Map<string, () => number> = new Map();
  private activeSkewConfigs: Map<string, ClockSkewConfig> = new Map();

  constructor() {
    this.initializeScenarios();
  }

  /**
   * Initialize clock skew test scenarios
   */
  private initializeScenarios(): void {
    // Scenario 1: Minor constant skew between regions
    this.scenarios.push({
      name: 'minor_constant_skew',
      description: 'Test with 100ms constant skew between regions',
      skewConfiguration: {
        regions: {
          'us-east-1': 0,
          'us-west-2': 100,
          'eu-west-1': 50,
          'ap-southeast-1': -50
        },
        skewType: 'constant'
      },
      testOperations: this.generateBasicOperations(),
      expectedBehavior: {
        consistencyGuarantees: ['eventual_consistency', 'read_your_writes'],
        allowedInconsistencies: ['temporary_replication_lag'],
        maxLag: 500
      },
      tolerance: {
        maxAcceptableSkew: 1000,
        maxReplicationLag: 500,
        consistencyWindow: 1000
      }
    });

    // Scenario 2: Significant drift over time
    this.scenarios.push({
      name: 'significant_drift',
      description: 'Test with 10ms/second drift between regions',
      skewConfiguration: {
        regions: {
          'us-east-1': 0,
          'us-west-2': 0,
          'eu-west-1': 0,
          'ap-southeast-1': 0
        },
        skewType: 'drift',
        driftRate: 10, // 10ms per second
        updateInterval: 1000
      },
      testOperations: this.generateExtendedOperations(),
      expectedBehavior: {
        consistencyGuarantees: ['eventual_consistency'],
        allowedInconsistencies: ['increasing_replication_lag', 'temporary_inconsistency'],
        maxLag: 2000
      },
      tolerance: {
        maxAcceptableSkew: 5000,
        maxReplicationLag: 2000,
        consistencyWindow: 3000
      }
    });

    // Scenario 3: Sudden clock jumps
    this.scenarios.push({
      name: 'sudden_jumps',
      description: 'Test with sudden 1-second clock jumps',
      skewConfiguration: {
        regions: {
          'us-east-1': 0,
          'us-west-2': 0,
          'eu-west-1': 0,
          'ap-southeast-1': 0
        },
        skewType: 'jump',
        updateInterval: 5000
      },
      testOperations: this.generateJumpTestOperations(),
      expectedBehavior: {
        consistencyGuarantees: ['eventual_consistency'],
        allowedInconsistencies: ['temporary_order_violations', 'replication_delays'],
        maxLag: 3000
      },
      tolerance: {
        maxAcceptableSkew: 10000,
        maxReplicationLag: 3000,
        consistencyWindow: 5000
      }
    });

    // Scenario 4: Extreme skew conditions
    this.scenarios.push({
      name: 'extreme_skew',
      description: 'Test with 5-second skew between regions',
      skewConfiguration: {
        regions: {
          'us-east-1': 0,
          'us-west-2': 5000,
          'eu-west-1': -3000,
          'ap-southeast-1': 2000
        },
        skewType: 'constant'
      },
      testOperations: this.generateBasicOperations(),
      expectedBehavior: {
        consistencyGuarantees: ['eventual_consistency'],
        allowedInconsistencies: ['significant_replication_lag', 'order_violations'],
        maxLag: 10000
      },
      tolerance: {
        maxAcceptableSkew: 15000,
        maxReplicationLag: 10000,
        consistencyWindow: 15000
      }
    });

    // Scenario 5: Random skew variations
    this.scenarios.push({
      name: 'random_skew',
      description: 'Test with random skew variations between regions',
      skewConfiguration: {
        regions: {
          'us-east-1': 0,
          'us-west-2': 0,
          'eu-west-1': 0,
          'ap-southeast-1': 0
        },
        skewType: 'random',
        updateInterval: 2000
      },
      testOperations: this.generateExtendedOperations(),
      expectedBehavior: {
        consistencyGuarantees: ['eventual_consistency'],
        allowedInconsistencies: ['variable_replication_lag', 'temporary_inconsistencies'],
        maxLag: 4000
      },
      tolerance: {
        maxAcceptableSkew: 8000,
        maxReplicationLag: 4000,
        consistencyWindow: 6000
      }
    });
  }

  /**
   * Run all clock skew tests
   */
  async runAllTests(): Promise<ClockSkewTestResult[]> {
    logger.info('Starting clock skew tests', {
      scenarioCount: this.scenarios.length
    });

    this.results = [];

    for (const scenario of this.scenarios) {
      try {
        const result = await this.runClockSkewScenario(scenario);
        this.results.push(result);
        
        logger.info('Clock skew scenario completed', {
          scenario: scenario.name,
          success: result.success,
          duration: result.duration,
          violations: result.consistencyViolations.length
        });
      } catch (error) {
        logger.error('Clock skew scenario failed', {
          scenario: scenario.name,
          error: error.message
        });

        this.results.push({
          scenario: scenario.name,
          success: false,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          skewConfiguration: scenario.skewConfiguration,
          operations: [],
          consistencyViolations: [],
          performanceMetrics: {
            averageLatency: 0,
            maxLatency: 0,
            replicationLag: {},
            consistencyWindow: 0,
            operationSuccessRate: 0
          },
          errors: [error.message],
          warnings: []
        });
      }
    }

    const summary = this.generateTestSummary();
    logger.info('Clock skew tests completed', summary);

    return this.results;
  }

  /**
   * Run a single clock skew scenario
   */
  private async runClockSkewScenario(scenario: ClockSkewScenario): Promise<ClockSkewTestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const operations: TestOperationResult[] = [];
    const violations: ConsistencyViolation[] = [];

    try {
      // Apply clock skew configuration
      await this.applyClockSkew(scenario.skewConfiguration);

      // Run test operations
      for (const operation of scenario.testOperations) {
        const result = await this.executeTestOperation(operation, scenario);
        operations.push(result);

        // Check for consistency violations
        const operationViolations = await this.checkConsistencyViolations(
          operation,
          result,
          scenario
        );
        violations.push(...operationViolations);

        // Wait between operations to allow skew to take effect
        await this.sleep(100);
      }

      // Calculate performance metrics
      const performanceMetrics = this.calculatePerformanceMetrics(operations);

      // Validate overall consistency
      const overallViolations = await this.validateOverallConsistency(
        scenario,
        operations,
        violations
      );
      violations.push(...overallViolations);

      const success = violations.length === 0 && errors.length === 0;

      return {
        scenario: scenario.name,
        success,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        skewConfiguration: scenario.skewConfiguration,
        operations,
        consistencyViolations: violations,
        performanceMetrics,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Scenario execution failed: ${error.message}`);
      
      return {
        scenario: scenario.name,
        success: false,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        skewConfiguration: scenario.skewConfiguration,
        operations,
        consistencyViolations: violations,
        performanceMetrics: {
          averageLatency: 0,
          maxLatency: 0,
          replicationLag: {},
          consistencyWindow: 0,
          operationSuccessRate: 0
        },
        errors,
        warnings
      };
    } finally {
      // Restore original time functions
      await this.restoreOriginalTime();
    }
  }

  /**
   * Apply clock skew configuration
   */
  private async applyClockSkew(config: ClockSkewConfig): Promise<void> {
    this.activeSkewConfigs.set('current', config);

    for (const [region, skew] of Object.entries(config.regions)) {
      // Store original time function
      if (!this.originalTimeFunctions.has(region)) {
        this.originalTimeFunctions.set(region, Date.now);
      }

      // Apply skew based on type
      switch (config.skewType) {
        case 'constant':
          this.applyConstantSkew(region, skew);
          break;
        case 'drift':
          this.applyDriftSkew(region, skew, config.driftRate!, config.updateInterval!);
          break;
        case 'jump':
          this.applyJumpSkew(region, config.updateInterval!);
          break;
        case 'random':
          this.applyRandomSkew(region, config.updateInterval!);
          break;
      }
    }
  }

  /**
   * Apply constant clock skew
   */
  private applyConstantSkew(region: string, skew: number): void {
    // This would intercept Date.now() calls for the specific region
    // For simulation, we'll track the skew and apply it in operations
    logger.debug('Applied constant skew', { region, skew });
  }

  /**
   * Apply drift clock skew
   */
  private applyDriftSkew(region: string, initialSkew: number, driftRate: number, interval: number): void {
    let currentSkew = initialSkew;
    const startTime = Date.now();

    const driftInterval = setInterval(() => {
      currentSkew += driftRate;
      logger.debug('Applied drift skew', { region, currentSkew, driftRate });
    }, interval);

    // Store interval for cleanup
    this.activeSkewConfigs.set(`${region}_drift`, { interval, startTime });
  }

  /**
   * Apply jump clock skew
   */
  private applyJumpSkew(region: string, interval: number): void {
    const jumpInterval = setInterval(() => {
      const jump = Math.random() * 2000 - 1000; // Random jump between -1000ms and +1000ms
      logger.debug('Applied jump skew', { region, jump });
    }, interval);

    this.activeSkewConfigs.set(`${region}_jump`, { interval, startTime: Date.now() });
  }

  /**
   * Apply random clock skew
   */
  private applyRandomSkew(region: string, interval: number): void {
    const randomInterval = setInterval(() => {
      const randomSkew = Math.random() * 4000 - 2000; // Random skew between -2000ms and +2000ms
      logger.debug('Applied random skew', { region, randomSkew });
    }, interval);

    this.activeSkewConfigs.set(`${region}_random`, { interval, startTime: Date.now() });
  }

  /**
   * Execute a test operation with clock skew
   */
  private async executeTestOperation(
    operation: TestOperation,
    scenario: ClockSkewScenario
  ): Promise<TestOperationResult> {
    const startTime = Date.now();
    const regionTimestamp = this.getRegionTimestamp(operation.region, operation.timestamp);
    
    try {
      let success = false;
      let error: string | undefined;
      let consistencyIssues: string[] = [];

      switch (operation.type) {
        case 'write':
          success = await this.executeWriteOperation(operation, regionTimestamp);
          break;
        case 'read':
          success = await this.executeReadOperation(operation, regionTimestamp);
          break;
        case 'vote':
          success = await this.executeVoteOperation(operation, regionTimestamp);
          break;
        case 'election_create':
          success = await this.executeElectionCreateOperation(operation, regionTimestamp);
          break;
        case 'election_end':
          success = await this.executeElectionEndOperation(operation, regionTimestamp);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      const latency = Date.now() - startTime;

      return {
        operation,
        success,
        actualTimestamp: startTime,
        regionTimestamp,
        latency,
        error,
        consistencyIssues
      };

    } catch (error) {
      return {
        operation,
        success: false,
        actualTimestamp: startTime,
        regionTimestamp,
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Get timestamp for a specific region with applied skew
   */
  private getRegionTimestamp(region: string, baseTimestamp: number): number {
    const config = this.activeSkewConfigs.get('current') as ClockSkewConfig;
    if (!config || !config.regions[region]) {
      return baseTimestamp;
    }

    let skew = config.regions[region];

    switch (config.skewType) {
      case 'constant':
        return baseTimestamp + skew;
      case 'drift':
        const elapsed = (Date.now() - (this.activeSkewConfigs.get(`${region}_drift`) as any)?.startTime || 0) / 1000;
        return baseTimestamp + skew + (elapsed * (config.driftRate || 0));
      case 'jump':
        // For jump, we'd need to track recent jumps - simplified here
        return baseTimestamp + skew;
      case 'random':
        // For random, we'd need to track recent random values - simplified here
        return baseTimestamp + skew;
      default:
        return baseTimestamp;
    }
  }

  /**
   * Execute write operation
   */
  private async executeWriteOperation(operation: TestOperation, regionTimestamp: number): Promise<boolean> {
    try {
      // Simulate write operation with region timestamp
      await multiRegionReplication.write(
        operation.data.key,
        operation.data.value,
        {
          region: operation.region,
          timestamp: regionTimestamp,
          consistencyLevel: 'eventual'
        }
      );
      return true;
    } catch (error) {
      logger.error('Write operation failed', {
        region: operation.region,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Execute read operation
   */
  private async executeReadOperation(operation: TestOperation, regionTimestamp: number): Promise<boolean> {
    try {
      // Simulate read operation
      const result = await multiRegionReplication.read(
        operation.data.key,
        {
          region: operation.region,
          consistencyLevel: 'eventual'
        }
      );
      return result.success;
    } catch (error) {
      logger.error('Read operation failed', {
        region: operation.region,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Execute vote operation
   */
  private async executeVoteOperation(operation: TestOperation, regionTimestamp: number): Promise<boolean> {
    try {
      // Simulate vote operation with region timestamp
      await geoPartitionedElections.castGeoPartitionedVote(
        operation.data.electionId,
        {
          ...operation.data.voteData,
          timestamp: regionTimestamp
        },
        {
          region: operation.region
        }
      );
      return true;
    } catch (error) {
      logger.error('Vote operation failed', {
        region: operation.region,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Execute election create operation
   */
  private async executeElectionCreateOperation(operation: TestOperation, regionTimestamp: number): Promise<boolean> {
    try {
      // Simulate election creation with region timestamp
      await eventStore.saveEvent(
        'election',
        operation.data.electionId,
        'election_created',
        {
          ...operation.data.electionData,
          createdAt: regionTimestamp
        }
      );
      return true;
    } catch (error) {
      logger.error('Election create operation failed', {
        region: operation.region,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Execute election end operation
   */
  private async executeElectionEndOperation(operation: TestOperation, regionTimestamp: number): Promise<boolean> {
    try {
      // Simulate election ending with region timestamp
      await eventStore.saveEvent(
        'election',
        operation.data.electionId,
        'election_ended',
        {
          ...operation.data.electionData,
          endedAt: regionTimestamp
        }
      );
      return true;
    } catch (error) {
      logger.error('Election end operation failed', {
        region: operation.region,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check for consistency violations
   */
  private async checkConsistencyViolations(
    operation: TestOperation,
    result: TestOperationResult,
    scenario: ClockSkewScenario
  ): Promise<ConsistencyViolation[]> {
    const violations: ConsistencyViolation[] = [];

    // Check timestamp ordering violations
    if (result.regionTimestamp < operation.timestamp - scenario.tolerance.maxAcceptableSkew) {
      violations.push({
        type: 'timestamp_order',
        description: 'Region timestamp is significantly behind operation timestamp',
        severity: 'high',
        detectedAt: Date.now(),
        affectedRegions: [operation.region],
        details: {
          operationTimestamp: operation.timestamp,
          regionTimestamp: result.regionTimestamp,
          difference: operation.timestamp - result.regionTimestamp
        }
      });
    }

    // Check replication lag violations
    if (result.latency > scenario.tolerance.maxReplicationLag) {
      violations.push({
        type: 'replication_lag',
        description: 'Operation latency exceeds acceptable replication lag',
        severity: 'medium',
        detectedAt: Date.now(),
        affectedRegions: [operation.region],
        details: {
          latency: result.latency,
          maxAllowedLag: scenario.tolerance.maxReplicationLag
        }
      });
    }

    // Check causality violations for related operations
    if (operation.data.relatedOperation) {
      // This would check if causality is maintained across regions
      // Simplified implementation
      violations.push({
        type: 'causality',
        description: 'Potential causality violation detected',
        severity: 'low',
        detectedAt: Date.now(),
        affectedRegions: [operation.region],
        details: {
          relatedOperation: operation.data.relatedOperation
        }
      });
    }

    return violations;
  }

  /**
   * Validate overall consistency
   */
  private async validateOverallConsistency(
    scenario: ClockSkewScenario,
    operations: TestOperationResult[],
    existingViolations: ConsistencyViolation[]
  ): Promise<ConsistencyViolation[]> {
    const violations: ConsistencyViolation[] = [];

    // Check if consistency window is exceeded
    const maxTimestampDiff = Math.max(
      ...operations.map(op => Math.abs(op.regionTimestamp - op.operation.timestamp))
    );

    if (maxTimestampDiff > scenario.tolerance.consistencyWindow) {
      violations.push({
        type: 'data_consistency',
        description: 'Consistency window exceeded across operations',
        severity: 'high',
        detectedAt: Date.now(),
        affectedRegions: Array.from(new Set(operations.map(op => op.operation.region))),
        details: {
          maxTimestampDiff,
          consistencyWindow: scenario.tolerance.consistencyWindow
        }
      });
    }

    // Check operation success rate
    const successRate = operations.filter(op => op.success).length / operations.length;
    if (successRate < 0.95) { // 95% success rate threshold
      violations.push({
        type: 'data_consistency',
        description: 'Operation success rate below acceptable threshold',
        severity: 'medium',
        detectedAt: Date.now(),
        affectedRegions: Array.from(new Set(operations.map(op => op.operation.region))),
        details: {
          successRate,
          threshold: 0.95
        }
      });
    }

    return violations;
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(operations: TestOperationResult[]): ClockSkewPerformanceMetrics {
    const latencies = operations.map(op => op.latency);
    const successfulOps = operations.filter(op => op.success);

    return {
      averageLatency: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      maxLatency: Math.max(...latencies),
      replicationLag: this.calculateReplicationLag(operations),
      consistencyWindow: this.calculateConsistencyWindow(operations),
      operationSuccessRate: successfulOps.length / operations.length
    };
  }

  /**
   * Calculate replication lag by region
   */
  private calculateReplicationLag(operations: TestOperationResult[]): Record<string, number> {
    const lagByRegion: Record<string, number[]> = {};

    for (const op of operations) {
      const region = op.operation.region;
      if (!lagByRegion[region]) {
        lagByRegion[region] = [];
      }
      lagByRegion[region].push(op.latency);
    }

    const avgLagByRegion: Record<string, number> = {};
    for (const [region, lags] of Object.entries(lagByRegion)) {
      avgLagByRegion[region] = lags.reduce((sum, lag) => sum + lag, 0) / lags.length;
    }

    return avgLagByRegion;
  }

  /**
   * Calculate consistency window
   */
  private calculateConsistencyWindow(operations: TestOperationResult[]): number {
    const timestampDifferences = operations.map(op => 
      Math.abs(op.regionTimestamp - op.operation.timestamp)
    );
    
    return Math.max(...timestampDifferences);
  }

  /**
   * Generate basic test operations
   */
  private generateBasicOperations(): TestOperation[] {
    const operations: TestOperation[] = [];
    const baseTime = Date.now();

    // Write operations
    operations.push({
      type: 'write',
      region: 'us-east-1',
      timestamp: baseTime,
      data: { key: 'test1', value: 'value1' },
      expectedSuccess: true
    });

    operations.push({
      type: 'write',
      region: 'us-west-2',
      timestamp: baseTime + 100,
      data: { key: 'test2', value: 'value2' },
      expectedSuccess: true
    });

    // Read operations
    operations.push({
      type: 'read',
      region: 'eu-west-1',
      timestamp: baseTime + 200,
      data: { key: 'test1' },
      expectedSuccess: true
    });

    // Vote operations
    operations.push({
      type: 'vote',
      region: 'ap-southeast-1',
      timestamp: baseTime + 300,
      data: {
        electionId: 'election_1',
        voteData: {
          userId: 'user_1',
          candidateId: 'candidate_1'
        }
      },
      expectedSuccess: true
    });

    return operations;
  }

  /**
   * Generate extended test operations
   */
  private generateExtendedOperations(): TestOperation[] {
    const operations: TestOperation[] = [];
    const baseTime = Date.now();

    // Election lifecycle
    operations.push({
      type: 'election_create',
      region: 'us-east-1',
      timestamp: baseTime,
      data: {
        electionId: 'election_extended_1',
        electionData: {
          title: 'Extended Test Election',
          type: 'general',
          status: 'active'
        }
      },
      expectedSuccess: true
    });

    // Multiple votes
    for (let i = 0; i < 10; i++) {
      operations.push({
        type: 'vote',
        region: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'][i % 4],
        timestamp: baseTime + (i + 1) * 1000,
        data: {
          electionId: 'election_extended_1',
          voteData: {
            userId: `user_${i}`,
            candidateId: `candidate_${i % 3}`
          }
        },
        expectedSuccess: true
      });
    }

    // Election end
    operations.push({
      type: 'election_end',
      region: 'us-east-1',
      timestamp: baseTime + 15000,
      data: {
        electionId: 'election_extended_1',
        electionData: {
          totalVotes: 10,
          winner: 'candidate_1'
        }
      },
      expectedSuccess: true
    });

    return operations;
  }

  /**
   * Generate jump test operations
   */
  private generateJumpTestOperations(): TestOperation[] {
    const operations: TestOperation[] = [];
    const baseTime = Date.now();

    // Operations before, during, and after potential jumps
    for (let i = 0; i < 20; i++) {
      operations.push({
        type: i % 2 === 0 ? 'write' : 'read',
        region: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'][i % 4],
        timestamp: baseTime + i * 2000,
        data: { 
          key: `jump_test_${i}`,
          value: `value_${i}`,
          operationIndex: i
        },
        expectedSuccess: true
      });
    }

    return operations;
  }

  /**
   * Restore original time functions
   */
  private async restoreOriginalTime(): Promise<void> {
    // Clear all skew intervals
    for (const [key, config] of this.activeSkewConfigs) {
      if (key !== 'current' && (config as any).interval) {
        clearInterval((config as any).interval);
      }
    }

    this.activeSkewConfigs.clear();
    logger.debug('Restored original time functions');
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate test summary
   */
  private generateTestSummary(): any {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;

    const totalViolations = this.results.reduce((sum, r) => sum + r.consistencyViolations.length, 0);
    const averageLatency = this.results.reduce((sum, r) => sum + r.performanceMetrics.averageLatency, 0) / totalTests;

    return {
      totalTests,
      passedTests,
      failedTests,
      successRate: (passedTests / totalTests) * 100,
      totalViolations,
      averageLatency,
      results: this.results.map(r => ({
        scenario: r.scenario,
        success: r.success,
        duration: r.duration,
        violations: r.consistencyViolations.length,
        averageLatency: r.performanceMetrics.averageLatency,
        maxLatency: r.performanceMetrics.maxLatency,
        operationSuccessRate: r.performanceMetrics.operationSuccessRate
      }))
    };
  }

  /**
   * Export test results to file
   */
  async exportResults(filename: string): Promise<void> {
    const fs = require('fs').promises;
    const summary = this.generateTestSummary();
    
    await fs.writeFile(filename, JSON.stringify(summary, null, 2));
    logger.info('Clock skew test results exported', { filename });
  }
}

// Export for use in test runner
export { ClockSkewTest, ClockSkewScenario, ClockSkewTestResult };

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new ClockSkewTest();
  
  test.runAllTests()
    .then(results => {
      console.log('Clock skew tests completed');
      console.log(`Passed: ${results.filter(r => r.success).length}/${results.length}`);
      
      // Export results
      return test.exportResults('test-results/clock-skew-results.json');
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}
