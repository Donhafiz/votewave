const axios = require('axios');
const { logger } = require('../utils/logger');

class LoadTestRunner {
  constructor() {
    this.results = [];
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      requestsPerSecond: 0,
      errors: new Map()
    };
  }

  // Generate unique user IDs for testing
  generateTestUsers(count = 1000) {
    const users = [];
    for (let i = 0; i < count; i++) {
      users.push({
        id: `test_user_${i}`,
        email: `user${i}@test.com`,
        firstName: `Test${i}`,
        lastName: `User${i}`,
        role: i % 10 === 0 ? 'admin' : 'user',
        tenantId: `tenant_${i % 5}`,
        password: 'TestPassword123!'
      });
    }
    return users;
  }

  // Generate test elections
  generateTestElections(count = 10) {
    const elections = [];
    for (let i = 0; i < count; i++) {
      const startDate = new Date(Date.now() + (i * 24 * 60 * 60 * 1000));
      const endDate = new Date(startDate.getTime() + (7 * 24 * 60 * 60 * 1000));
      
      elections.push({
        id: `test_election_${i}`,
        title: `Test Election ${i}`,
        description: `Test election for load testing ${i}`,
        status: i % 3 === 0 ? 'active' : 'closed',
        startDate,
        endDate,
        createdBy: `test_user_${i % 100}`,
        tenantId: `tenant_${i % 5}`,
        candidates: this.generateTestCandidates(5)
      });
    }
    return elections;
  }

  // Generate test candidates
  generateTestCandidates(count = 5) {
    const candidates = [];
    for (let i = 0; i < count; i++) {
      candidates.push({
        id: `test_candidate_${i}`,
        name: `Candidate ${i}`,
        description: `Test candidate ${i} for load testing`,
        electionId: `test_election_${Math.floor(i / 5)}`,
        votes: Math.floor(Math.random() * 1000)
      });
    }
    return candidates;
  }

  // Execute single request
  async executeRequest(config) {
    const startTime = Date.now();
    
    try {
      const response = await axios({
        method: config.method || 'GET',
        url: `${config.baseUrl}${config.endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': config.token ? `Bearer ${config.token}` : undefined,
          'User-Agent': 'VoteWave-LoadTest/1.0'
        },
        timeout: config.timeout || 30000,
        validateStatus: (status) => status >= 200 && status < 400,
        data: config.data || {}
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Update metrics
      this.metrics.totalRequests++;
      if (response.status >= 200 && response.status < 400) {
        this.metrics.successfulRequests++;
      } else {
        this.metrics.failedRequests++;
      }

      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime + responseTime) / 2;
      this.metrics.minResponseTime = Math.min(this.metrics.minResponseTime, responseTime);
      this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, responseTime);

      // Track errors
      if (response.status >= 400) {
        const errorKey = `${response.status}_${config.endpoint}`;
        const errorCount = this.metrics.errors.get(errorKey) || 0;
        this.metrics.errors.set(errorKey, errorCount + 1);
      }

      // Calculate requests per second
      this.metrics.requestsPerSecond = this.metrics.totalRequests / ((Date.now() - this.testStartTime) / 1000);

      const result = {
        success: response.status >= 200 && response.status < 400,
        status: response.status,
        statusText: response.statusText,
        responseTime,
        config: config.name,
        timestamp: new Date().toISOString()
      };

      this.results.push(result);
      return result;

    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      this.metrics.totalRequests++;
      this.metrics.failedRequests++;

      const result = {
        success: false,
        status: 'ERROR',
        error: error.message,
        responseTime,
        config: config.name,
        timestamp: new Date().toISOString()
      };

      this.results.push(result);
      return result;
    }
  }

  // Execute concurrent requests
  async executeConcurrentRequests(configs, concurrency = 10) {
    const promises = configs.map(config => this.executeRequest(config));
    const startTime = Date.now();
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    logger.info(`Concurrent test completed`, {
      concurrency,
      totalTime: `${totalTime}ms`,
      averageTime: `${Math.round(totalTime / concurrency)}ms`
    });

    return results;
  }

  // Run load test scenario
  async runScenario(scenario) {
    logger.info(`Starting load test scenario: ${scenario.name}`, {
      description: scenario.description
    });

    this.testStartTime = Date.now();
    this.results = [];
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      requestsPerSecond: 0,
      errors: new Map()
    };

    // Execute test phases
    for (const phase of scenario.phases) {
      logger.info(`Starting phase: ${phase.name}`, {
        description: phase.description
      });

      const phaseStartTime = Date.now();
      
      if (phase.type === 'concurrent') {
        await this.executeConcurrentRequests(phase.requests, phase.concurrency);
      } else if (phase.type === 'ramp') {
        for (const config of phase.requests) {
          await this.executeRequest(config);
          await new Promise(resolve => setTimeout(resolve, config.delay || 100));
        }
      } else {
        for (const config of phase.requests) {
          await this.executeRequest(config);
        }
      }

      const phaseEndTime = Date.now();
      const phaseDuration = phaseEndTime - phaseStartTime;

      logger.info(`Phase completed: ${phase.name}`, {
        duration: `${phaseDuration}ms`,
        requests: phase.requests?.length || 1
      });
    }

    const testEndTime = Date.now();
    const totalTestDuration = testEndTime - this.testStartTime;

    // Generate test report
    const report = this.generateTestReport(scenario, totalTestDuration);

    logger.info(`Load test scenario completed: ${scenario.name}`, {
      duration: `${totalTestDuration}ms`,
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      successRate: `${Math.round((this.metrics.successfulRequests / this.metrics.totalRequests) * 100)}%`
    });

    return report;
  }

  // Generate test report
  generateTestReport(scenario, totalDuration) {
    const successRate = (this.metrics.successfulRequests / this.metrics.totalRequests) * 100;
    const requestsPerSecond = this.metrics.totalRequests / (totalDuration / 1000);

    return {
      scenario: scenario.name,
      description: scenario.description,
      duration: totalDuration,
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      successRate: Math.round(successRate * 100) / 100,
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      minResponseTime: this.metrics.minResponseTime,
      maxResponseTime: this.metrics.maxResponseTime,
      requestsPerSecond: Math.round(requestsPerSecond),
      errors: Array.from(this.metrics.errors.entries()).map(([key, count]) => ({
        type: key,
        count
      })),
      recommendations: this.generateRecommendations(scenario, this.metrics),
      timestamp: new Date().toISOString()
    };
  }

  // Generate recommendations
  generateRecommendations(scenario, metrics) {
    const recommendations = [];

    // Response time recommendations
    if (metrics.averageResponseTime > 1000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Average response time exceeds 1 second',
        suggestion: 'Optimize database queries and add caching'
      });
    }

    // Success rate recommendations
    if (metrics.successfulRequests / metrics.totalRequests < 0.95) {
      recommendations.push({
        type: 'reliability',
        priority: 'medium',
        message: 'Success rate below 95%',
        suggestion: 'Check error handling and retry logic'
      });
    }

    // Error rate recommendations
    if (metrics.failedRequests / metrics.totalRequests > 0.05) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'Error rate exceeds 5%',
        suggestion: 'Investigate error causes and improve error handling'
      });
    }

    // Throughput recommendations
    if (metrics.requestsPerSecond < 10) {
      recommendations.push({
        type: 'capacity',
        priority: 'medium',
        message: 'Low throughput - less than 10 RPS',
        suggestion: 'Consider horizontal scaling or performance optimization'
      });
    }

    return recommendations;
  }

  // Predefined test scenarios
  getTestScenarios() {
    const baseUrl = process.env.TEST_API_URL || 'http://localhost:5000/api';
    
    return [
      {
        name: 'baseline_test',
        description: 'Baseline performance test with single requests',
        phases: [
          {
            name: 'warmup',
            description: 'Warm up the system',
            type: 'sequential',
            requests: [
              { name: 'health_check', endpoint: '/health', method: 'GET' },
              { name: 'root_endpoint', endpoint: '/', method: 'GET' }
            ]
          },
          {
            name: 'single_requests',
            description: 'Test individual request performance',
            type: 'sequential',
            requests: [
              { name: 'get_elections', endpoint: '/elections', method: 'GET' },
              { name: 'get_users', endpoint: '/users', method: 'GET' },
              { name: 'create_election', endpoint: '/elections', method: 'POST', data: { title: 'Test Election' } },
              { name: 'login', endpoint: '/auth/login', method: 'POST', data: { email: 'test@test.com', password: 'TestPassword123!' } }
            ]
          }
        ]
      },
      {
        name: 'concurrent_users',
        description: 'Test concurrent user load',
        phases: [
          {
            name: 'concurrent_load',
            description: 'Simulate 100 concurrent users',
            type: 'concurrent',
            concurrency: 100,
            requests: Array.from({ length: 100 }, (_, i) => ({
              name: `user_action_${i}`,
              endpoint: '/api/health',
              method: 'GET'
            }))
          }
        ]
      },
      {
        name: 'voting_load',
        description: 'Test voting system under load',
        phases: [
          {
            name: 'ramp_up',
            description: 'Gradually increase voting load',
            type: 'ramp',
            requests: [
              { name: 'vote_1', endpoint: '/api/elections/test_election_0/votes', method: 'POST', data: { candidateId: 'test_candidate_0' }, delay: 100 },
              { name: 'vote_2', endpoint: '/api/elections/test_election_0/votes', method: 'POST', data: { candidateId: 'test_candidate_1' }, delay: 200 },
              { name: 'vote_3', endpoint: '/api/elections/test_election_0/votes', method: 'POST', data: { candidateId: 'test_candidate_2' }, delay: 300 },
              { name: 'vote_4', endpoint: '/api/elections/test_election_0/votes', method: 'POST', data: { candidateId: 'test_candidate_3' }, delay: 400 },
              { name: 'vote_5', endpoint: '/api/elections/test_election_0/votes', method: 'POST', data: { candidateId: 'test_candidate_4' }, delay: 500 }
            ]
          },
          {
            name: 'sustained_load',
            description: 'Maintain high voting load',
            type: 'concurrent',
            concurrency: 50,
            duration: 30000, // 30 seconds
            requests: Array.from({ length: 200 }, (_, i) => ({
              name: `sustained_vote_${i}`,
              endpoint: '/api/elections/test_election_0/votes',
              method: 'POST',
              data: { candidateId: `test_candidate_${i % 5}` }
            }))
          }
        ]
      }
    ];
  }

  // Run all test scenarios
  async runAllTests() {
    const scenarios = this.getTestScenarios();
    const results = [];

    for (const scenario of scenarios) {
      logger.info(`Running scenario: ${scenario.name}`);
      const result = await this.runScenario(scenario);
      results.push(result);
      
      // Wait between scenarios
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return results;
  }

  // Save test results
  async saveResults(results, filename = `load_test_${Date.now().toISOString().split('T')[0]}.json`) {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const report = {
        timestamp: new Date().toISOString(),
        testSuite: 'VoteWave Load Testing',
        version: '1.0.0',
        scenarios: results,
        summary: this.generateSummaryReport(results)
      };

      await fs.writeFile(
        path.join(process.cwd(), 'test-results', filename),
        JSON.stringify(report, null, 2)
      );

      logger.info('Test results saved', { filename });
      return filename;
    } catch (error) {
      logger.error('Failed to save test results', { error: error.message });
      throw error;
    }
  }

  // Generate summary report
  generateSummaryReport(results) {
    const totalScenarios = results.length;
    const totalRequests = results.reduce((sum, result) => sum + (result.totalRequests || 0), 0);
    const totalDuration = results.reduce((sum, result) => sum + (result.duration || 0), 0);
    
    const avgResponseTime = results.reduce((sum, result) => sum + (result.averageResponseTime || 0), 0) / totalScenarios;
    const avgSuccessRate = results.reduce((sum, result) => sum + (result.successRate || 0), 0) / totalScenarios;

    return {
      testSuite: 'VoteWave Load Testing',
      totalScenarios,
      totalRequests,
      totalDuration,
      averageResponseTime: Math.round(avgResponseTime),
      averageSuccessRate: Math.round(avgSuccessRate * 100) / 100,
      recommendations: this.generateOverallRecommendations(results)
    };
  }

  // Generate overall recommendations
  generateOverallRecommendations(results) {
    const recommendations = [];
    const issues = [];

    // Analyze all results for patterns
    for (const result of results) {
      if (result.averageResponseTime > 2000) {
        issues.push('High response times detected');
        recommendations.push({
          type: 'performance',
          priority: 'critical',
          message: 'Multiple scenarios show response times > 2 seconds',
          suggestion: 'Investigate database performance and add caching'
        });
      }

      if (result.successRate < 0.95) {
        issues.push('Low success rates detected');
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          message: 'Success rates below 95% indicate reliability issues',
          suggestion: 'Review error handling and retry mechanisms'
        });
      }

      if (result.requestsPerSecond < 50) {
        issues.push('Low throughput detected');
        recommendations.push({
          type: 'capacity',
          priority: 'medium',
          message: 'Throughput below 50 RPS may indicate capacity issues',
          suggestion: 'Consider horizontal scaling or performance optimization'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        message: 'System performed well within acceptable parameters',
        suggestion: 'Continue monitoring and consider load testing at higher volumes'
      });
    }

    return recommendations;
  }
}

module.exports = LoadTestRunner;
