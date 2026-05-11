const axios = require('axios');
const { io } = require('socket.io-client');
const { logger } = require('../utils/logger');
const { performance } = require('perf_hooks');

class PerformanceTestRunner {
  constructor() {
    this.testResults = [];
    this.baseUrl = process.env.TEST_API_URL || 'http://localhost:5000';
    this.concurrentUsers = [];
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      concurrentConnections: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  // 10k Concurrent Voters Test
  async run10kConcurrentVotersTest() {
    const startTime = Date.now();
    logger.info('Starting 10k concurrent voters test');

    try {
      // Create test election
      const election = await this.createTestElection();
      
      // Create test candidates
      const candidates = await this.createTestCandidates(election.id, 5);
      
      // Generate 10k test users
      const users = await this.generateTestUsers(10000);
      
      // Prepare concurrent voting
      const votingPromises = users.map((user, index) => 
        this.concurrentVote(user, candidates, election.id, index)
      );

      // Execute all votes concurrently
      const voteStartTime = Date.now();
      const results = await Promise.allSettled(votingPromises);
      const endTime = Date.now();

      // Analyze results
      const successfulVotes = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failedVotes = results.filter(r => r.status === 'rejected' || !r.value.success).length;
      const totalTime = endTime - voteStartTime;
      const throughput = (successfulVotes / totalTime) * 1000;

      const testResult = {
        name: '10k Concurrent Voters',
        success: true,
        duration: totalTime,
        totalUsers: users.length,
        successfulVotes,
        failedVotes,
        throughput: Math.round(throughput),
        averageResponseTime: this.calculateAverageResponseTime(results),
        errorRate: (failedVotes / results.length) * 100,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      };

      this.testResults.push(testResult);

      logger.info('10k concurrent voters test completed', testResult);

      return testResult;

    } catch (error) {
      logger.error('10k concurrent voters test failed', { error: error.message });
      
      return {
        name: '10k Concurrent Voters',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Concurrent vote helper
  async concurrentVote(user, candidates, electionId, index) {
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          const startTime = Date.now();
          
          // Login user
          const loginResponse = await this.makeRequest('POST', '/api/auth/login', {
            email: user.email,
            password: user.password
          });

          if (!loginResponse.success) {
            resolve({ success: false, error: 'Login failed', responseTime: Date.now() - startTime });
            return;
          }

          // Cast vote
          const voteResponse = await this.makeRequest('POST', `/api/elections/${electionId}/votes`, {
            candidateId: candidates[0].id
          }, loginResponse.data.token);

          const responseTime = Date.now() - startTime;

          resolve({
            success: voteResponse.success,
            responseTime,
            userId: user.id,
            candidateId: candidates[0].id
          });

        } catch (error) {
          resolve({ success: false, error: error.message, responseTime: 0 });
        }
      }, Math.random() * 5000); // Random delay 0-5 seconds
    });
  }

  // Create test election
  async createTestElection() {
    const electionData = {
      title: 'Performance Test Election',
      description: 'Election for 10k concurrent voter test',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      status: 'active'
    };

    const response = await this.makeRequest('POST', '/api/elections', electionData);
    
    if (!response.success) {
      throw new Error(`Failed to create test election: ${response.error}`);
    }

    return response.data;
  }

  // Create test candidates
  async createTestCandidates(electionId, count) {
    const candidates = [];
    
    for (let i = 0; i < count; i++) {
      const candidateData = {
        name: `Candidate ${i + 1}`,
        description: `Test candidate ${i + 1} for performance testing`,
        electionId
      };

      const response = await this.makeRequest('POST', '/api/candidates', candidateData);
      
      if (response.success) {
        candidates.push(response.data);
      }
    }

    return candidates;
  }

  // Generate test users
  async generateTestUsers(count) {
    const users = [];
    
    for (let i = 0; i < count; i++) {
      const userData = {
        email: `perfuser${i}@test.com`,
        password: 'TestPassword123!',
        firstName: `PerfUser${i}`,
        lastName: 'Test'
      };

      const response = await this.makeRequest('POST', '/api/auth/register', userData);
      
      if (response.success) {
        users.push({
          id: response.data.id,
          email: userData.email,
          password: userData.password
        });
      }
    }

    return users;
  }

  // Helper method to make HTTP requests
  async makeRequest(method, endpoint, data = null, token = null) {
    const startTime = Date.now();
    
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      };

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      
      return {
        success: response.status >= 200 && response.status < 400,
        data: response.data,
        status: response.status,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  // Calculate average response time
  calculateAverageResponseTime(results) {
    const responseTimes = results
      .filter(r => r.value && r.value.responseTime)
      .map(r => r.value.responseTime);
    
    return responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
  }

  // Run all performance tests
  async runAllPerformanceTests() {
    logger.info('Starting comprehensive performance testing');
    
    const tests = [
      this.run10kConcurrentVotersTest()
    ];

    const results = [];
    
    for (const test of tests) {
      try {
        const result = await test;
        results.push(result);
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        logger.error('Test execution failed', {
          testName: test.name || 'Unknown',
          error: error.message
        });
        
        results.push({
          name: test.name || 'Unknown',
          success: false,
          error: error.message
        });
      }
    }

    return this.generatePerformanceReport(results);
  }

  // Generate performance report
  generatePerformanceReport(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      overallSuccess: results.filter(r => r.success).length === results.length,
      recommendations: this.generateRecommendations(results)
    };

    return {
      summary,
      results,
      benchmarks: this.extractBenchmarks(results)
    };
  }

  // Generate recommendations
  generateRecommendations(results) {
    const recommendations = [];

    // Analyze 10k voters test
    const votersTest = results.find(r => r.name === '10k Concurrent Voters');
    if (votersTest && votersTest.success) {
      if (votersTest.throughput < 100) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          message: 'Low throughput detected in 10k voters test',
          suggestion: 'Optimize database queries and add caching'
        });
      }

      if (votersTest.errorRate > 5) {
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          message: 'High error rate in 10k voters test',
          suggestion: 'Improve error handling and retry mechanisms'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        message: 'All performance tests passed successfully',
        suggestion: 'System is performing well within expected parameters'
      });
    }

    return recommendations;
  }

  // Extract benchmarks
  extractBenchmarks(results) {
    return {
      concurrentVoters: results.find(r => r.name === '10k Concurrent Voters')
    };
  }
}

module.exports = PerformanceTestRunner;
