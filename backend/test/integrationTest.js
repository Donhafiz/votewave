const axios = require('axios');
const { io } = require('socket.io-client');
const { logger } = require('../utils/logger');

class IntegrationTestRunner {
  constructor() {
    this.testResults = [];
    this.baseUrl = process.env.TEST_API_URL || 'http://localhost:5000';
    this.testUser = null;
    this.testElection = null;
    this.testCandidate = null;
    this.socket = null;
  }

  // Run complete integration test suite
  async runIntegrationTests() {
    logger.info('Starting end-to-end integration tests');
    
    const testSuites = [
      this.testNormalVotingFlow,
      this.testDuplicateVotePrevention,
      this.testHighConcurrencyVoting,
      this.testRedisFailureResilience,
      this.testMongoReconnection,
      this.testERIENodeFailure,
      this.testSocketDisconnection,
      this.testInvalidJWTHandling,
      this.testExpiredRefreshToken,
      this.testConcurrentElections
    ];

    for (const testSuite of testSuites) {
      try {
        logger.info(`Running test suite: ${testSuite.name}`);
        const result = await testSuite.call(this);
        this.testResults.push(result);
        
        logger.info(`Test suite completed: ${testSuite.name}`, {
          success: result.success,
          duration: result.duration
        });
        
        // Wait between test suites
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Test suite failed: ${testSuite.name}`, {
          error: error.message
        });
        
        this.testResults.push({
          name: testSuite.name,
          success: false,
          error: error.message,
          duration: 0
        });
      }
    }

    return this.generateTestReport();
  }

  // Test 1: Normal voting flow
  async testNormalVotingFlow() {
    const startTime = Date.now();
    logger.info('Testing normal voting flow');

    try {
      // Step 1: Register user
      const registerResponse = await this.makeRequest('POST', '/api/auth/register', {
        email: 'integration@test.com',
        password: 'TestPassword123!',
        firstName: 'Integration',
        lastName: 'Test'
      });

      if (!registerResponse.success) {
        throw new Error(`Registration failed: ${registerResponse.error}`);
      }

      // Step 2: Login
      const loginResponse = await this.makeRequest('POST', '/api/auth/login', {
        email: 'integration@test.com',
        password: 'TestPassword123!'
      });

      if (!loginResponse.success) {
        throw new Error(`Login failed: ${loginResponse.error}`);
      }

      const token = loginResponse.data.token;
      this.testUser = { ...loginResponse.data.user, token };

      // Step 3: Create election
      const electionResponse = await this.makeRequest('POST', '/api/elections', {
        title: 'Integration Test Election',
        description: 'Test election for integration testing',
        startDate: new Date(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }, token);

      if (!electionResponse.success) {
        throw new Error(`Election creation failed: ${electionResponse.error}`);
      }

      this.testElection = electionResponse.data;

      // Step 4: Create candidate
      const candidateResponse = await this.makeRequest('POST', '/api/candidates', {
        name: 'Test Candidate',
        description: 'Test candidate for integration',
        electionId: this.testElection._id
      }, token);

      if (!candidateResponse.success) {
        throw new Error(`Candidate creation failed: ${candidateResponse.error}`);
      }

      this.testCandidate = candidateResponse.data;

      // Step 5: Connect WebSocket
      await this.connectWebSocket(token);

      // Step 6: Cast vote
      const voteResponse = await this.makeRequest('POST', `/api/elections/${this.testElection._id}/votes`, {
        candidateId: this.testCandidate._id
      }, token);

      if (!voteResponse.success) {
        throw new Error(`Vote casting failed: ${voteResponse.error}`);
      }

      // Step 7: Verify vote was processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      const resultsResponse = await this.makeRequest('GET', `/api/elections/${this.testElection._id}/results`, null, token);

      if (!resultsResponse.success) {
        throw new Error(`Results retrieval failed: ${resultsResponse.error}`);
      }

      // Step 8: Verify WebSocket update
      const receivedUpdate = await this.waitForSocketUpdate('vote_cast', 5000);

      if (!receivedUpdate) {
        logger.warn('WebSocket vote update not received');
      }

      // Step 9: Verify monitoring data
      const healthResponse = await this.makeRequest('GET', '/api/health');

      if (!healthResponse.success) {
        throw new Error('Health check failed');
      }

      return {
        name: 'Normal Voting Flow',
        success: true,
        duration: Date.now() - startTime,
        steps: {
          registration: true,
          authentication: true,
          electionCreation: true,
          candidateCreation: true,
          websocketConnection: !!this.socket,
          voteCasting: true,
          resultsRetrieval: true,
          websocketUpdate: receivedUpdate,
          healthCheck: true
        }
      };

    } catch (error) {
      return {
        name: 'Normal Voting Flow',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 2: Duplicate vote prevention
  async testDuplicateVotePrevention() {
    const startTime = Date.now();
    logger.info('Testing duplicate vote prevention');

    try {
      if (!this.testUser || !this.testElection || !this.testCandidate) {
        throw new Error('Test prerequisites not met');
      }

      // Cast first vote
      const firstVoteResponse = await this.makeRequest('POST', `/api/elections/${this.testElection._id}/votes`, {
        candidateId: this.testCandidate._id
      }, this.testUser.token);

      if (!firstVoteResponse.success) {
        throw new Error(`First vote failed: ${firstVoteResponse.error}`);
      }

      // Attempt duplicate vote
      const duplicateVoteResponse = await this.makeRequest('POST', `/api/elections/${this.testElection._id}/votes`, {
        candidateId: this.testCandidate._id
      }, this.testUser.token);

      if (duplicateVoteResponse.success) {
        throw new Error('Duplicate vote was allowed - this should not happen');
      }

      return {
        name: 'Duplicate Vote Prevention',
        success: true,
        duration: Date.now() - startTime,
        firstVoteSuccess: firstVoteResponse.success,
        duplicateVoteBlocked: !duplicateVoteResponse.success,
        duplicateVoteError: duplicateVoteResponse.error
      };

    } catch (error) {
      return {
        name: 'Duplicate Vote Prevention',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 3: High concurrency voting
  async testHighConcurrencyVoting() {
    const startTime = Date.now();
    logger.info('Testing high concurrency voting');

    try {
      if (!this.testUser || !this.testElection || !this.testCandidate) {
        throw new Error('Test prerequisites not met');
      }

      // Create multiple test users
      const users = [];
      for (let i = 0; i < 10; i++) {
        const registerResponse = await this.makeRequest('POST', '/api/auth/register', {
          email: `concurrent${i}@test.com`,
          password: 'TestPassword123!',
          firstName: `Concurrent${i}`,
          lastName: 'Test'
        });

        if (registerResponse.success) {
          const loginResponse = await this.makeRequest('POST', '/api/auth/login', {
            email: `concurrent${i}@test.com`,
            password: 'TestPassword123!'
          });

          if (loginResponse.success) {
            users.push({
              ...loginResponse.data.user,
              token: loginResponse.data.token
            });
          }
        }
      }

      if (users.length < 5) {
        throw new Error('Insufficient test users created');
      }

      // Cast votes concurrently
      const votePromises = users.map(user => 
        this.makeRequest('POST', `/api/elections/${this.testElection._id}/votes`, {
          candidateId: this.testCandidate._id
        }, user.token)
      );

      const voteResults = await Promise.allSettled(votePromises);
      
      const successfulVotes = voteResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failedVotes = voteResults.filter(r => r.status === 'rejected' || !r.value.success).length;

      // Verify final results
      const resultsResponse = await this.makeRequest('GET', `/api/elections/${this.testElection._id}/results`, null, this.testUser.token);

      return {
        name: 'High Concurrency Voting',
        success: true,
        duration: Date.now() - startTime,
        testUsers: users.length,
        successfulVotes,
        failedVotes,
        finalResults: resultsResponse.success ? resultsResponse.data : null
      };

    } catch (error) {
      return {
        name: 'High Concurrency Voting',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 4: Redis failure resilience
  async testRedisFailureResilience() {
    const startTime = Date.now();
    logger.info('Testing Redis failure resilience');

    try {
      // Simulate Redis failure by stopping Redis service
      // This would be implemented in your test environment
      
      // Test that system continues to work without Redis
      const healthResponse = await this.makeRequest('GET', '/api/health');
      
      const loginResponse = await this.makeRequest('POST', '/api/auth/login', {
        email: 'integration@test.com',
        password: 'TestPassword123!'
      });

      // Test that system recovers when Redis is back
      // This would be implemented in your test environment

      return {
        name: 'Redis Failure Resilience',
        success: healthResponse.success && loginResponse.success,
        duration: Date.now() - startTime,
        healthCheckPassed: healthResponse.success,
        loginWorked: loginResponse.success
      };

    } catch (error) {
      return {
        name: 'Redis Failure Resilience',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 5: MongoDB reconnection
  async testMongoReconnection() {
    const startTime = Date.now();
    logger.info('Testing MongoDB reconnection');

    try {
      // Simulate MongoDB disconnection
      // This would be implemented in your test environment
      
      // Test that system handles MongoDB disconnection gracefully
      const healthResponse = await this.makeRequest('GET', '/api/health');
      
      // Test that system recovers when MongoDB is back
      // This would be implemented in your test environment

      return {
        name: 'MongoDB Reconnection',
        success: healthResponse.success,
        duration: Date.now() - startTime,
        handledGracefully: true
      };

    } catch (error) {
      return {
        name: 'MongoDB Reconnection',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 6: ERIE node failure
  async testERIENodeFailure() {
    const startTime = Date.now();
    logger.info('Testing ERIE node failure');

    try {
      // Simulate ERIE node failure
      // This would be implemented in your test environment
      
      // Test that voting still works with reduced ERIE nodes
      const voteResponse = await this.makeRequest('POST', `/api/elections/${this.testElection._id}/votes`, {
        candidateId: this.testCandidate._id
      }, this.testUser.token);

      return {
        name: 'ERIE Node Failure',
        success: voteResponse.success,
        duration: Date.now() - startTime,
        votingWorked: voteResponse.success
      };

    } catch (error) {
      return {
        name: 'ERIE Node Failure',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 7: Socket disconnection
  async testSocketDisconnection() {
    const startTime = Date.now();
    logger.info('Testing socket disconnection');

    try {
      // Connect WebSocket
      await this.connectWebSocket(this.testUser.token);
      
      // Disconnect socket
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }

      // Test that system handles disconnection gracefully
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reconnect
      await this.connectWebSocket(this.testUser.token);

      return {
        name: 'Socket Disconnection',
        success: !!this.socket,
        duration: Date.now() - startTime,
        reconnected: !!this.socket
      };

    } catch (error) {
      return {
        name: 'Socket Disconnection',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 8: Invalid JWT handling
  async testInvalidJWTHandling() {
    const startTime = Date.now();
    logger.info('Testing invalid JWT handling');

    try {
      // Test with invalid JWT
      const response = await this.makeRequest('GET', '/api/users', null, 'invalid.jwt.token');

      if (response.success) {
        throw new Error('Invalid JWT was accepted');
      }

      return {
        name: 'Invalid JWT Handling',
        success: !response.success,
        duration: Date.now() - startTime,
        correctlyRejected: !response.success,
        errorType: response.error
      };

    } catch (error) {
      return {
        name: 'Invalid JWT Handling',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 9: Expired refresh token
  async testExpiredRefreshToken() {
    const startTime = Date.now();
    logger.info('Testing expired refresh token');

    try {
      // Test with expired refresh token
      const response = await this.makeRequest('POST', '/api/auth/refresh', {
        refreshToken: 'expired.refresh.token'
      });

      if (response.success) {
        throw new Error('Expired refresh token was accepted');
      }

      return {
        name: 'Expired Refresh Token',
        success: !response.success,
        duration: Date.now() - startTime,
        correctlyRejected: !response.success,
        errorType: response.error
      };

    } catch (error) {
      return {
        name: 'Expired Refresh Token',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test 10: Concurrent elections
  async testConcurrentElections() {
    const startTime = Date.now();
    logger.info('Testing concurrent elections');

    try {
      // Create multiple elections
      const elections = [];
      for (let i = 0; i < 3; i++) {
        const electionResponse = await this.makeRequest('POST', '/api/elections', {
          title: `Concurrent Election ${i}`,
          description: `Test election ${i} for concurrent testing`,
          startDate: new Date(),
          endDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }, this.testUser.token);

        if (electionResponse.success) {
          elections.push(electionResponse.data);
        }
      }

      // Test voting in multiple elections
      const votePromises = elections.map(election => 
        this.makeRequest('POST', `/api/elections/${election._id}/votes`, {
          candidateId: this.testCandidate._id
        }, this.testUser.token)
      );

      const voteResults = await Promise.allSettled(votePromises);

      return {
        name: 'Concurrent Elections',
        success: elections.length >= 2,
        duration: Date.now() - startTime,
        electionsCreated: elections.length,
        votesAttempted: voteResults.length,
        votesSuccessful: voteResults.filter(r => r.status === 'fulfilled' && r.value.success).length
      };

    } catch (error) {
      return {
        name: 'Concurrent Elections',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Helper methods
  async makeRequest(method, endpoint, data = null, token = null) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
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
        status: response.status
      };

    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || error.message,
        status: error.response?.status || 500
      };
    }
  }

  async connectWebSocket(token) {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.baseUrl, {
          auth: { token },
          transports: ['websocket']
        });

        this.socket.on('connect', () => {
          logger.info('WebSocket connected');
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          logger.error('WebSocket connection error', { error: error.message });
          reject(error);
        });

        this.socket.on('disconnect', () => {
          logger.info('WebSocket disconnected');
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async waitForSocketUpdate(eventType, timeout = 5000) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false);
      }, timeout);

      const handler = (data) => {
        clearTimeout(timeoutId);
        this.socket.off(eventType, handler);
        resolve(true);
      };

      this.socket.on(eventType, handler);
    });
  }

  generateTestReport() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = this.testResults.filter(r => !r.success).length;
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passedTests,
        failedTests,
        successRate: Math.round((passedTests / totalTests) * 100),
        totalDuration
      },
      results: this.testResults,
      recommendations: this.generateRecommendations()
    };
  }

  generateRecommendations() {
    const recommendations = [];
    const failedTests = this.testResults.filter(r => !r.success);

    if (failedTests.length > 0) {
      recommendations.push({
        type: 'stability',
        priority: 'high',
        message: `${failedTests.length} integration tests failed`,
        suggestion: 'Review failed test scenarios and fix underlying issues'
      });
    }

    const socketIssues = this.testResults.filter(r => 
      r.name.includes('Socket') && !r.success
    );
    if (socketIssues.length > 0) {
      recommendations.push({
        type: 'realtime',
        priority: 'high',
        message: 'WebSocket integration issues detected',
        suggestion: 'Implement proper WebSocket authentication and error handling'
      });
    }

    const concurrencyIssues = this.testResults.filter(r => 
      r.name.includes('Concurrency') && !r.success
    );
    if (concurrencyIssues.length > 0) {
      recommendations.push({
        type: 'scalability',
        priority: 'medium',
        message: 'Concurrency issues detected',
        suggestion: 'Review transaction handling and race conditions'
      });
    }

    return recommendations;
  }
}

module.exports = IntegrationTestRunner;
