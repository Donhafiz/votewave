/**
 * Deterministic Replay Testing Framework
 * Tests event sourcing replay functionality with deterministic results
 */

import { eventStore } from '../../src/eventSourcing/eventStore';
import { eventSchemaRegistry } from '../../src/schema/eventSchemaRegistry';
import { ElectionCreatedEvent, VoteCastEvent, ElectionEndedEvent } from '../../src/types/events';
import { logger } from '../../src/utils/logger';

interface ReplayTestScenario {
  name: string;
  description: string;
  events: any[];
  expectedState: any;
  config: ReplayTestConfig;
}

interface ReplayTestConfig {
  snapshotInterval?: number;
  useSnapshots?: boolean;
  parallelProcessing?: boolean;
  batchSize?: number;
  validateConsistency?: boolean;
  measurePerformance?: boolean;
}

interface ReplayTestResult {
  scenario: string;
  success: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  eventsProcessed: number;
  finalState: any;
  expectedState: any;
  stateMatches: boolean;
  performance: PerformanceMetrics;
  errors: string[];
  warnings: string[];
}

interface PerformanceMetrics {
  eventsPerSecond: number;
  averageEventTime: number;
  memoryUsage: number;
  snapshotTime?: number;
  replayTime: number;
}

class DeterministicReplayTest {
  private testScenarios: ReplayTestScenario[] = [];
  private results: ReplayTestResult[] = [];

  constructor() {
    this.initializeTestScenarios();
  }

  /**
   * Initialize test scenarios
   */
  private initializeTestScenarios(): void {
    // Scenario 1: Simple election lifecycle
    this.testScenarios.push({
      name: 'simple_election_lifecycle',
      description: 'Test basic election creation, voting, and ending',
      events: this.generateSimpleElectionEvents(),
      expectedState: this.getSimpleElectionExpectedState(),
      config: {
        snapshotInterval: 5,
        useSnapshots: true,
        parallelProcessing: false,
        batchSize: 10,
        validateConsistency: true,
        measurePerformance: true
      }
    });

    // Scenario 2: Large election with many votes
    this.testScenarios.push({
      name: 'large_election_voting',
      description: 'Test election with 1000 votes across multiple candidates',
      events: this.generateLargeElectionEvents(),
      expectedState: this.getLargeElectionExpectedState(),
      config: {
        snapshotInterval: 100,
        useSnapshots: true,
        parallelProcessing: true,
        batchSize: 50,
        validateConsistency: true,
        measurePerformance: true
      }
    });

    // Scenario 3: Concurrent elections
    this.testScenarios.push({
      name: 'concurrent_elections',
      description: 'Test multiple elections running concurrently',
      events: this.generateConcurrentElectionEvents(),
      expectedState: this.getConcurrentElectionExpectedState(),
      config: {
        snapshotInterval: 10,
        useSnapshots: true,
        parallelProcessing: true,
        batchSize: 20,
        validateConsistency: true,
        measurePerformance: true
      }
    });

    // Scenario 4: Election with updates and cancellations
    this.testScenarios.push({
      name: 'election_modifications',
      description: 'Test election updates, vote cancellations, and candidate changes',
      events: this.generateElectionModificationEvents(),
      expectedState: this.getElectionModificationExpectedState(),
      config: {
        snapshotInterval: 5,
        useSnapshots: false,
        parallelProcessing: false,
        batchSize: 5,
        validateConsistency: true,
        measurePerformance: true
      }
    });
  }

  /**
   * Run all deterministic replay tests
   */
  async runAllTests(): Promise<ReplayTestResult[]> {
    logger.info('Starting deterministic replay tests', {
      scenarioCount: this.testScenarios.length
    });

    this.results = [];

    for (const scenario of this.testScenarios) {
      try {
        const result = await this.runTestScenario(scenario);
        this.results.push(result);
        
        logger.info('Test scenario completed', {
          scenario: scenario.name,
          success: result.success,
          duration: result.duration,
          eventsPerSecond: result.performance.eventsPerSecond
        });
      } catch (error) {
        logger.error('Test scenario failed', {
          scenario: scenario.name,
          error: error.message
        });

        this.results.push({
          scenario: scenario.name,
          success: false,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          eventsProcessed: 0,
          finalState: null,
          expectedState: scenario.expectedState,
          stateMatches: false,
          performance: {
            eventsPerSecond: 0,
            averageEventTime: 0,
            memoryUsage: 0,
            replayTime: 0
          },
          errors: [error.message],
          warnings: []
        });
      }
    }

    const summary = this.generateTestSummary();
    logger.info('Deterministic replay tests completed', summary);

    return this.results;
  }

  /**
   * Run a single test scenario
   */
  private async runTestScenario(scenario: ReplayTestScenario): Promise<ReplayTestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Clear event store
      await eventStore.clearAll();

      // Configure event store
      if (scenario.config.snapshotInterval) {
        // Update snapshot interval (would need to implement this in eventStore)
      }

      // Ingest events
      const ingestStartTime = Date.now();
      for (const event of scenario.events) {
        await eventStore.saveEvent(
          event.aggregateType,
          event.aggregateId,
          event.eventType,
          event.data,
          {
            version: event.version,
            causationId: event.causationId,
            correlationId: event.correlationId,
            userId: event.userId,
            metadata: event.metadata
          }
        );
      }
      const ingestTime = Date.now() - ingestStartTime;

      // Replay events
      const replayStartTime = Date.now();
      const replayResult = await eventStore.replayEvents(
        scenario.events[0].aggregateType,
        scenario.events[0].aggregateId
      );
      const replayTime = Date.now() - replayStartTime;

      // Validate final state
      const stateMatches = this.compareStates(
        replayResult.finalState,
        scenario.expectedState
      );

      // Calculate performance metrics
      const performance = this.calculatePerformanceMetrics(
        scenario.events.length,
        ingestTime + replayTime,
        scenario.config
      );

      // Validate consistency if required
      if (scenario.config.validateConsistency) {
        const consistencyIssues = await this.validateConsistency(
          scenario.events,
          replayResult.finalState
        );
        warnings.push(...consistencyIssues);
      }

      return {
        scenario: scenario.name,
        success: stateMatches && errors.length === 0,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        eventsProcessed: scenario.events.length,
        finalState: replayResult.finalState,
        expectedState: scenario.expectedState,
        stateMatches,
        performance,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Test execution failed: ${error.message}`);
      
      return {
        scenario: scenario.name,
        success: false,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        eventsProcessed: 0,
        finalState: null,
        expectedState: scenario.expectedState,
        stateMatches: false,
        performance: {
          eventsPerSecond: 0,
          averageEventTime: 0,
          memoryUsage: 0,
          replayTime: 0
        },
        errors,
        warnings
      };
    }
  }

  /**
   * Generate simple election events
   */
  private generateSimpleElectionEvents(): any[] {
    const electionId = 'election_simple_1';
    const events: any[] = [];

    // Election created
    events.push({
      id: 'evt_1',
      aggregateType: 'election',
      aggregateId: electionId,
      eventType: 'election_created',
      data: {
        id: electionId,
        title: 'Simple Test Election',
        description: 'A simple test election',
        type: 'general',
        status: 'active',
        startDate: Date.now(),
        endDate: Date.now() + 86400000, // 24 hours later
        settings: {
          allowAnonymous: false,
          requireVerification: true,
          maxVotesPerVoter: 1,
          votingMethod: 'single'
        },
        createdBy: 'admin_1',
        region: 'us-east-1',
        timezone: 'America/New_York'
      },
      timestamp: Date.now(),
      version: 1
    });

    // Add candidates
    const candidates = ['candidate_1', 'candidate_2', 'candidate_3'];
    candidates.forEach((candidateId, index) => {
      events.push({
        id: `evt_${index + 2}`,
        aggregateType: 'election',
        aggregateId: electionId,
        eventType: 'candidate_added',
        data: {
          id: candidateId,
          electionId,
          name: `Candidate ${index + 1}`,
          party: `Party ${index + 1}`,
          description: `Description for candidate ${index + 1}`,
          addedAt: Date.now(),
          addedBy: 'admin_1',
          order: index + 1
        },
        timestamp: Date.now() + (index + 1) * 1000,
        version: 1
      });
    });

    // Cast votes
    const voters = ['user_1', 'user_2', 'user_3', 'user_4', 'user_5'];
    voters.forEach((userId, index) => {
      const candidateIndex = index % candidates.length;
      events.push({
        id: `evt_${index + 5}`,
        aggregateType: 'vote',
        aggregateId: `vote_${userId}_${electionId}`,
        eventType: 'vote_cast',
        data: {
          id: `vote_${userId}_${electionId}`,
          electionId,
          userId,
          candidateId: candidates[candidateIndex],
          timestamp: Date.now() + (index + 1) * 2000,
          deviceType: 'desktop',
          region: 'us-east-1',
          fraudScore: 0.1,
          verified: true
        },
        timestamp: Date.now() + (index + 1) * 2000,
        version: 1
      });
    });

    // End election
    events.push({
      id: 'evt_final',
      aggregateType: 'election',
      aggregateId: electionId,
      eventType: 'election_ended',
      data: {
        id: electionId,
        endedAt: Date.now() + 86400000,
        endedBy: 'admin_1',
        totalVotes: voters.length,
        totalVoters: voters.length,
        winner: {
          candidateId: candidates[0],
          votes: 2,
          percentage: 40
        }
      },
      timestamp: Date.now() + 86400000,
      version: 1
    });

    return events;
  }

  /**
   * Get expected state for simple election
   */
  private getSimpleElectionExpectedState(): any {
    return {
      id: 'election_simple_1',
      title: 'Simple Test Election',
      status: 'completed',
      totalVotes: 5,
      totalVoters: 5,
      candidatesCount: 3,
      winner: {
        candidateId: 'candidate_1',
        votes: 2,
        percentage: 40
      }
    };
  }

  /**
   * Generate large election events
   */
  private generateLargeElectionEvents(): any[] {
    const electionId = 'election_large_1';
    const events: any[] = [];
    const voterCount = 1000;
    const candidateCount = 10;

    // Election created
    events.push({
      id: 'evt_1',
      aggregateType: 'election',
      aggregateId: electionId,
      eventType: 'election_created',
      data: {
        id: electionId,
        title: 'Large Test Election',
        description: 'A large test election with many votes',
        type: 'general',
        status: 'active',
        startDate: Date.now(),
        endDate: Date.now() + 86400000,
        settings: {
          allowAnonymous: false,
          requireVerification: true,
          maxVotesPerVoter: 1,
          votingMethod: 'single'
        },
        createdBy: 'admin_1',
        region: 'us-east-1',
        timezone: 'America/New_York'
      },
      timestamp: Date.now(),
      version: 1
    });

    // Add candidates
    for (let i = 0; i < candidateCount; i++) {
      events.push({
        id: `evt_candidate_${i}`,
        aggregateType: 'election',
        aggregateId: electionId,
        eventType: 'candidate_added',
        data: {
          id: `candidate_large_${i}`,
          electionId,
          name: `Candidate ${i + 1}`,
          party: `Party ${i + 1}`,
          addedAt: Date.now(),
          addedBy: 'admin_1',
          order: i + 1
        },
        timestamp: Date.now() + i * 1000,
        version: 1
      });
    }

    // Cast votes
    for (let i = 0; i < voterCount; i++) {
      const candidateIndex = i % candidateCount;
      events.push({
        id: `evt_vote_${i}`,
        aggregateType: 'vote',
        aggregateId: `vote_user_${i}_${electionId}`,
        eventType: 'vote_cast',
        data: {
          id: `vote_user_${i}_${electionId}`,
          electionId,
          userId: `user_large_${i}`,
          candidateId: `candidate_large_${candidateIndex}`,
          timestamp: Date.now() + i * 100,
          deviceType: i % 3 === 0 ? 'mobile' : 'desktop',
          region: 'us-east-1',
          fraudScore: Math.random() * 0.3,
          verified: true
        },
        timestamp: Date.now() + i * 100,
        version: 1
      });
    }

    return events;
  }

  /**
   * Get expected state for large election
   */
  private getLargeElectionExpectedState(): any {
    return {
      id: 'election_large_1',
      title: 'Large Test Election',
      status: 'active',
      totalVotes: 1000,
      totalVoters: 1000,
      candidatesCount: 10,
      voteDistribution: Array.from({ length: 10 }, (_, i) => ({
        candidateId: `candidate_large_${i}`,
        votes: 100, // Each candidate gets 100 votes
        percentage: 10
      }))
    };
  }

  /**
   * Generate concurrent election events
   */
  private generateConcurrentElectionEvents(): any[] {
    const events: any[] = [];
    const electionCount = 3;
    const votesPerElection = 50;

    for (let e = 0; e < electionCount; e++) {
      const electionId = `election_concurrent_${e}`;
      
      // Election created
      events.push({
        id: `evt_${e}_1`,
        aggregateType: 'election',
        aggregateId: electionId,
        eventType: 'election_created',
        data: {
          id: electionId,
          title: `Concurrent Election ${e + 1}`,
          type: 'general',
          status: 'active',
          startDate: Date.now(),
          endDate: Date.now() + 86400000,
          settings: {
            allowAnonymous: false,
            requireVerification: true,
            maxVotesPerVoter: 1,
            votingMethod: 'single'
          },
          createdBy: 'admin_1',
          region: 'us-east-1',
          timezone: 'America/New_York'
        },
        timestamp: Date.now() + e * 1000,
        version: 1
      });

      // Add candidates
      for (let c = 0; c < 3; c++) {
        events.push({
          id: `evt_${e}_candidate_${c}`,
          aggregateType: 'election',
          aggregateId: electionId,
          eventType: 'candidate_added',
          data: {
            id: `candidate_${e}_${c}`,
            electionId,
            name: `Candidate ${c + 1}`,
            party: `Party ${c + 1}`,
            addedAt: Date.now(),
            addedBy: 'admin_1',
            order: c + 1
          },
          timestamp: Date.now() + e * 1000 + c * 500,
          version: 1
        });
      }

      // Cast votes
      for (let v = 0; v < votesPerElection; v++) {
        const candidateIndex = v % 3;
        events.push({
          id: `evt_${e}_vote_${v}`,
          aggregateType: 'vote',
          aggregateId: `vote_${e}_${v}_${electionId}`,
          eventType: 'vote_cast',
          data: {
            id: `vote_${e}_${v}_${electionId}`,
            electionId,
            userId: `user_${e}_${v}`,
            candidateId: `candidate_${e}_${candidateIndex}`,
            timestamp: Date.now() + e * 1000 + v * 100,
            deviceType: 'desktop',
            region: 'us-east-1',
            fraudScore: 0.1,
            verified: true
          },
          timestamp: Date.now() + e * 1000 + v * 100,
          version: 1
        });
      }
    }

    return events;
  }

  /**
   * Get expected state for concurrent elections
   */
  private getConcurrentElectionExpectedState(): any {
    const elections = [];
    
    for (let e = 0; e < 3; e++) {
      elections.push({
        id: `election_concurrent_${e}`,
        title: `Concurrent Election ${e + 1}`,
        status: 'active',
        totalVotes: 50,
        totalVoters: 50,
        candidatesCount: 3
      });
    }

    return { elections };
  }

  /**
   * Generate election modification events
   */
  private generateElectionModificationEvents(): any[] {
    const electionId = 'election_mod_1';
    const events: any[] = [];

    // Election created
    events.push({
      id: 'evt_1',
      aggregateType: 'election',
      aggregateId: electionId,
      eventType: 'election_created',
      data: {
        id: electionId,
        title: 'Modifiable Election',
        type: 'general',
        status: 'draft',
        startDate: Date.now(),
        endDate: Date.now() + 86400000,
        settings: {
          allowAnonymous: false,
          requireVerification: true,
          maxVotesPerVoter: 1,
          votingMethod: 'single'
        },
        createdBy: 'admin_1',
        region: 'us-east-1',
        timezone: 'America/New_York'
      },
      timestamp: Date.now(),
      version: 1
    });

    // Election updated
    events.push({
      id: 'evt_2',
      aggregateType: 'election',
      aggregateId: electionId,
      eventType: 'election_updated',
      data: {
        id: electionId,
        changes: [{
          field: 'title',
          oldValue: 'Modifiable Election',
          newValue: 'Updated Election Title'
        }],
        updatedBy: 'admin_1',
        reason: 'Title update'
      },
      timestamp: Date.now() + 1000,
      version: 1
    });

    // Add candidate
    events.push({
      id: 'evt_3',
      aggregateType: 'election',
      aggregateId: electionId,
      eventType: 'candidate_added',
      data: {
        id: 'candidate_mod_1',
        electionId,
        name: 'Candidate 1',
        party: 'Party 1',
        addedAt: Date.now(),
        addedBy: 'admin_1',
        order: 1
      },
      timestamp: Date.now() + 2000,
      version: 1
    });

    // Cast vote
    events.push({
      id: 'evt_4',
      aggregateType: 'vote',
      aggregateId: 'vote_user_1_election_mod_1',
      eventType: 'vote_cast',
      data: {
        id: 'vote_user_1_election_mod_1',
        electionId,
        userId: 'user_1',
        candidateId: 'candidate_mod_1',
        timestamp: Date.now() + 3000,
        deviceType: 'desktop',
        region: 'us-east-1',
        fraudScore: 0.1,
        verified: true
      },
      timestamp: Date.now() + 3000,
      version: 1
    });

    // Cancel vote
    events.push({
      id: 'evt_5',
      aggregateType: 'vote',
      aggregateId: 'vote_user_1_election_mod_1',
      eventType: 'vote_cancelled',
      data: {
        id: 'vote_user_1_election_mod_1',
        electionId,
        userId: 'user_1',
        candidateId: 'candidate_mod_1',
        timestamp: Date.now() + 4000,
        reason: 'User request',
        cancelledBy: 'user_1'
      },
      timestamp: Date.now() + 4000,
      version: 1
    });

    // Remove candidate
    events.push({
      id: 'evt_6',
      aggregateType: 'election',
      aggregateId: electionId,
      eventType: 'candidate_removed',
      data: {
        id: 'candidate_mod_1',
        electionId,
        removedAt: Date.now(),
        removedBy: 'admin_1',
        reason: 'Withdrawn'
      },
      timestamp: Date.now() + 5000,
      version: 1
    });

    return events;
  }

  /**
   * Get expected state for election modifications
   */
  private getElectionModificationExpectedState(): any {
    return {
      id: 'election_mod_1',
      title: 'Updated Election Title',
      status: 'draft',
      totalVotes: 0,
      totalVoters: 0,
      candidatesCount: 0,
      modifications: {
        titleUpdated: true,
        candidateRemoved: true,
        voteCancelled: true
      }
    };
  }

  /**
   * Compare two states for equality
   */
  private compareStates(actual: any, expected: any): boolean {
    if (!actual || !expected) {
      return false;
    }

    // Simple deep comparison for basic properties
    if (typeof actual === 'object' && typeof expected === 'object') {
      for (const key in expected) {
        if (expected.hasOwnProperty(key)) {
          if (!actual.hasOwnProperty(key)) {
            return false;
          }

          if (typeof expected[key] === 'object' && expected[key] !== null) {
            if (!this.compareStates(actual[key], expected[key])) {
              return false;
            }
          } else if (actual[key] !== expected[key]) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    eventCount: number,
    totalTime: number,
    config: ReplayTestConfig
  ): PerformanceMetrics {
    return {
      eventsPerSecond: eventCount / (totalTime / 1000),
      averageEventTime: totalTime / eventCount,
      memoryUsage: process.memoryUsage().heapUsed,
      replayTime: totalTime
    };
  }

  /**
   * Validate consistency of replayed state
   */
  private async validateConsistency(
    events: any[],
    finalState: any
  ): Promise<string[]> {
    const issues: string[] = [];

    // Check if vote counts match
    if (finalState.totalVotes !== undefined) {
      const voteEvents = events.filter(e => e.eventType === 'vote_cast');
      const cancelledVotes = events.filter(e => e.eventType === 'vote_cancelled');
      const expectedVotes = voteEvents.length - cancelledVotes.length;

      if (finalState.totalVotes !== expectedVotes) {
        issues.push(`Vote count mismatch: expected ${expectedVotes}, got ${finalState.totalVotes}`);
      }
    }

    // Check if candidate counts match
    if (finalState.candidatesCount !== undefined) {
      const candidateEvents = events.filter(e => e.eventType === 'candidate_added');
      const removedCandidates = events.filter(e => e.eventType === 'candidate_removed');
      const expectedCandidates = candidateEvents.length - removedCandidates.length;

      if (finalState.candidatesCount !== expectedCandidates) {
        issues.push(`Candidate count mismatch: expected ${expectedCandidates}, got ${finalState.candidatesCount}`);
      }
    }

    return issues;
  }

  /**
   * Generate test summary
   */
  private generateTestSummary(): any {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;

    const totalEvents = this.results.reduce((sum, r) => sum + r.eventsProcessed, 0);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const averageEventsPerSecond = totalEvents / (totalDuration / 1000);

    return {
      totalTests,
      passedTests,
      failedTests,
      successRate: (passedTests / totalTests) * 100,
      totalEvents,
      totalDuration,
      averageEventsPerSecond,
      results: this.results.map(r => ({
        scenario: r.scenario,
        success: r.success,
        duration: r.duration,
        eventsPerSecond: r.performance.eventsPerSecond,
        errors: r.errors.length,
        warnings: r.warnings.length
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
    logger.info('Test results exported', { filename });
  }
}

// Export for use in test runner
export { DeterministicReplayTest, ReplayTestScenario, ReplayTestResult };

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new DeterministicReplayTest();
  
  test.runAllTests()
    .then(results => {
      console.log('Deterministic replay tests completed');
      console.log(`Passed: ${results.filter(r => r.success).length}/${results.length}`);
      
      // Export results
      return test.exportResults('test-results/deterministic-replay-results.json');
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}
