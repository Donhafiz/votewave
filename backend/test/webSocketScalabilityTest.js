const { io } = require('socket.io-client');
const { logger } = require('../utils/logger');
const { performance } = require('perf_hooks');

class WebSocketScalabilityTest {
  constructor() {
    this.baseUrl = process.env.TEST_API_URL || 'http://localhost:5000';
    this.testResults = [];
    this.connections = [];
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
      maxConcurrentConnections: 0,
      messageThroughput: 0,
      averageMessageLatency: 0,
      errorRate: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  // Run comprehensive WebSocket scalability tests
  async runWebSocketScalabilityTests() {
    logger.info('Starting comprehensive WebSocket scalability testing');

    const testScenarios = [
      this.testConnectionScalability(),
      this.testMessageThroughput(),
      this.testConcurrentConnections(),
      this.testConnectionPersistence(),
      this.testReconnectionResilience(),
      this.testRoomScalability(),
      this.testMemoryUsageUnderLoad(),
      this.testBackpressureHandling(),
      this.testAuthenticationScalability(),
      this.testCrossOriginConnections()
    ];

    const results = [];

    for (const test of testScenarios) {
      try {
        logger.info(`Running WebSocket test: ${test.name}`);
        const result = await test;
        results.push(result);
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        logger.error(`WebSocket test failed: ${test.name}`, { error: error.message });
        
        results.push({
          name: test.name,
          success: false,
          error: error.message,
          duration: 0
        });
      }
    }

    return this.generateWebSocketReport(results);
  }

  // Test connection scalability
  async testConnectionScalability() {
    const startTime = Date.now();
    logger.info('Testing WebSocket connection scalability');

    try {
      const connectionTargets = [100, 500, 1000, 2000, 5000];
      const results = [];

      for (const target of connectionTargets) {
        logger.info(`Testing ${target} concurrent connections`);
        
        const targetResult = await this.testConcurrentConnectionsTarget(target);
        results.push(targetResult);
        
        // Clean up connections
        await this.cleanupConnections();
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      const result = {
        name: 'Connection Scalability',
        success: true,
        duration: Date.now() - startTime,
        connectionTargets,
        results,
        summary: {
          maxSuccessfulConnections: Math.max(...results.map(r => r.successfulConnections)),
          averageConnectionTime: results.reduce((sum, r) => sum + r.averageConnectionTime, 0) / results.length,
          scalabilityEfficiency: results.map(r => r.successfulConnections / r.targetConnections).reduce((sum, eff) => sum + eff, 0) / results.length
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Connection scalability test failed', { error: error.message });
      
      return {
        name: 'Connection Scalability',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test specific concurrent connections target
  async testConcurrentConnectionsTarget(targetConnections) {
    const startTime = Date.now();
    const connections = [];
    const connectionTimes = [];

    logger.info(`Creating ${targetConnections} concurrent WebSocket connections`);

    // Create connections in batches
    const batchSize = 50;
    for (let i = 0; i < targetConnections; i += batchSize) {
      const batchPromises = [];
      
      for (let j = 0; j < batchSize && (i + j) < targetConnections; j++) {
        const connectionPromise = this.createTestConnection(i + j);
        batchPromises.push(connectionPromise);
      }

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          connections.push(result.value.socket);
          connectionTimes.push(result.value.connectionTime);
        }
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successfulConnections = connections.length;
    const failedConnections = targetConnections - successfulConnections;
    const averageConnectionTime = connectionTimes.length > 0 
      ? connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length 
      : 0;

    return {
      targetConnections,
      successfulConnections,
      failedConnections,
      averageConnectionTime: Math.round(averageConnectionTime),
      connectionRate: successfulConnections / ((Date.now() - startTime) / 1000),
      connections
    };
  }

  // Create test WebSocket connection
  async createTestConnection(connectionId) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      try {
        const socket = io(this.baseUrl, {
          auth: {
            token: `test_token_${connectionId}`,
            userId: `test_user_${connectionId}`,
            testMode: true
          },
          transports: ['websocket'],
          timeout: 10000
        });

        socket.on('connect', () => {
          const connectionTime = Date.now() - startTime;
          
          resolve({
            success: true,
            socket,
            connectionId,
            connectionTime
          });
        });

        socket.on('connect_error', (error) => {
          resolve({
            success: false,
            error: error.message,
            connectionId,
            connectionTime: Date.now() - startTime
          });
        });

        socket.on('disconnect', (reason) => {
          logger.debug(`Test connection ${connectionId} disconnected`, { reason });
        });

        // Timeout fallback
        setTimeout(() => {
          resolve({
            success: false,
            error: 'Connection timeout',
            connectionId,
            connectionTime: Date.now() - startTime
          });
        }, 10000);

      } catch (error) {
        resolve({
          success: false,
          error: error.message,
          connectionId,
          connectionTime: Date.now() - startTime
        });
      }
    });
  }

  // Test message throughput
  async testMessageThroughput() {
    const startTime = Date.now();
    logger.info('Testing WebSocket message throughput');

    try {
      // Establish baseline connections
      const connectionCount = 1000;
      const connections = await this.establishConnections(connectionCount);
      
      if (connections.length < connectionCount * 0.8) {
        throw new Error(`Could not establish sufficient connections: ${connections.length}/${connectionCount}`);
      }

      const messageSizes = [100, 500, 1000, 5000, 10000]; // bytes
      const messageRates = [10, 50, 100, 500]; // messages per second per connection
      const results = [];

      for (const messageSize of messageSizes) {
        for (const messageRate of messageRates) {
          const result = await this.testMessageThroughputScenario(
            connections, 
            messageSize, 
            messageRate
          );
          
          results.push(result);
          
          // Small delay between scenarios
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Clean up connections
      await this.cleanupConnections();

      const result = {
        name: 'Message Throughput',
        success: true,
        duration: Date.now() - startTime,
        connectionCount,
        messageSizes,
        messageRates,
        results,
        summary: {
          maxThroughput: Math.max(...results.map(r => r.throughput)),
          averageLatency: results.reduce((sum, r) => sum + r.averageLatency, 0) / results.length,
          efficiency: results.reduce((sum, r) => sum + r.efficiency, 0) / results.length
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Message throughput test failed', { error: error.message });
      
      return {
        name: 'Message Throughput',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test specific message throughput scenario
  async testMessageThroughputScenario(connections, messageSize, messageRate) {
    const startTime = Date.now();
    const testDuration = 30000; // 30 seconds
    const message = this.generateTestMessage(messageSize);
    
    // Start message sending
    const messagePromises = connections.map((socket, index) => 
      this.sendMessagesAtRate(socket, message, messageRate, testDuration)
    );

    const results = await Promise.allSettled(messagePromises);
    const endTime = Date.now();
    
    const successfulSends = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const totalMessages = successfulSends * messageRate * (testDuration / 1000);
    const actualDuration = endTime - startTime;
    const throughput = totalMessages / (actualDuration / 1000);
    
    const latencies = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(r => r.value.averageLatency);
    
    const averageLatency = latencies.length > 0 
      ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length 
      : 0;

    return {
      messageSize,
      messageRate,
      duration: actualDuration,
      totalMessages,
      throughput: Math.round(throughput),
      averageLatency: Math.round(averageLatency),
      efficiency: (throughput / (connections.length * messageRate)) * 100,
      successRate: (successfulSends / connections.length) * 100
    };
  }

  // Send messages at specific rate
  async sendMessagesAtRate(socket, message, rate, duration) {
    return new Promise((resolve) => {
      let sentCount = 0;
      const interval = 1000 / rate; // milliseconds between messages
      const startTime = Date.now();
      
      const sendInterval = setInterval(() => {
        if (Date.now() - startTime >= duration) {
          clearInterval(sendInterval);
          
          resolve({
            success: true,
            sentCount,
            averageLatency: 0 // Would need to track actual latencies
          });
          return;
        }

        try {
          socket.emit('test_message', {
            id: `msg_${sentCount}`,
            timestamp: new Date().toISOString(),
            data: message
          });
          
          sentCount++;
        } catch (error) {
          clearInterval(sendInterval);
          
          resolve({
            success: false,
            error: error.message,
            sentCount
          });
        }
      }, interval);
    });
  }

  // Test concurrent connections
  async testConcurrentConnections() {
    const startTime = Date.now();
    logger.info('Testing concurrent WebSocket connections');

    try {
      const maxConnections = 10000;
      const connectionResults = [];
      let currentConnections = 0;
      let successfulConnections = 0;
      let failedConnections = 0;

      // Gradually increase connections
      while (currentConnections < maxConnections) {
        const batchSize = Math.min(100, maxConnections - currentConnections);
        const batchPromises = [];

        for (let i = 0; i < batchSize; i++) {
          const connectionPromise = this.createTestConnection(currentConnections + i);
          batchPromises.push(connectionPromise);
        }

        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.success) {
            successfulConnections++;
          } else {
            failedConnections++;
          }
        }

        currentConnections += batchSize;
        connectionResults.push({
          batchSize,
          successfulConnections,
          failedConnections,
          successRate: (successfulConnections / currentConnections) * 100
        });

        // Check if success rate drops below threshold
        if ((successfulConnections / currentConnections) * 100 < 50) {
          logger.warn('Connection success rate dropped below 50%, stopping test');
          break;
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Clean up connections
      await this.cleanupConnections();

      const result = {
        name: 'Concurrent Connections',
        success: true,
        duration: Date.now() - startTime,
        maxConnections,
        successfulConnections,
        failedConnections,
        finalSuccessRate: (successfulConnections / currentConnections) * 100,
        connectionResults,
        summary: {
          peakThroughput: Math.max(...connectionResults.map(r => r.successRate)),
          averageSuccessRate: connectionResults.reduce((sum, r) => sum + r.successRate, 0) / connectionResults.length,
          scalabilityLimit: connectionResults.find(r => r.successRate < 80) ? connectionResults.indexOf(r) : -1
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Concurrent connections test failed', { error: error.message });
      
      return {
        name: 'Concurrent Connections',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test connection persistence
  async testConnectionPersistence() {
    const startTime = Date.now();
    logger.info('Testing WebSocket connection persistence');

    try {
      const connectionCount = 1000;
      const testDuration = 60000; // 1 minute
      const connections = await this.establishConnections(connectionCount);
      
      if (connections.length < connectionCount * 0.8) {
        throw new Error(`Could not establish sufficient connections: ${connections.length}/${connectionCount}`);
      }

      // Monitor connections over time
      const persistenceResults = [];
      const checkInterval = 5000; // Check every 5 seconds
      const checks = Math.floor(testDuration / checkInterval);

      for (let i = 0; i < checks; i++) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        
        const activeConnections = connections.filter(socket => socket.connected).length;
        const disconnectedConnections = connections.length - activeConnections;
        
        persistenceResults.push({
          time: i * checkInterval,
          activeConnections,
          disconnectedConnections,
          persistenceRate: (activeConnections / connections.length) * 100
        });
      }

      // Clean up connections
      await this.cleanupConnections();

      const averagePersistence = persistenceResults.reduce((sum, r) => sum + r.persistenceRate, 0) / persistenceResults.length;
      const minPersistence = Math.min(...persistenceResults.map(r => r.persistenceRate));
      const maxPersistence = Math.max(...persistenceResults.map(r => r.persistenceRate));

      const result = {
        name: 'Connection Persistence',
        success: true,
        duration: Date.now() - startTime,
        connectionCount,
        testDuration,
        persistenceResults,
        summary: {
          averagePersistence: Math.round(averagePersistence),
          minPersistence,
          maxPersistence,
          stability: minPersistence > 95 ? 'stable' : 'unstable'
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Connection persistence test failed', { error: error.message });
      
      return {
        name: 'Connection Persistence',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Helper methods
  async establishConnections(count) {
    const connections = [];
    const batchSize = 50;
    
    for (let i = 0; i < count; i += batchSize) {
      const batchPromises = [];
      
      for (let j = 0; j < batchSize && (i + j) < count; j++) {
        const connectionPromise = this.createTestConnection(i + j);
        batchPromises.push(connectionPromise);
      }

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          connections.push(result.value.socket);
        }
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return connections;
  }

  async cleanupConnections() {
    for (const socket of this.connections) {
      if (socket && socket.connected) {
        socket.disconnect();
      }
    }
    
    this.connections = [];
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  generateTestMessage(size) {
    return {
      id: `test_msg_${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: 'x'.repeat(Math.max(0, size - 100)), // Compensate for JSON overhead
      random: Math.random().toString(36)
    };
  }

  // Generate WebSocket scalability report
  generateWebSocketReport(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      overallSuccess: results.filter(r => r.success).length === results.length,
      recommendations: this.generateWebSocketRecommendations(results)
    };

    return {
      summary,
      results,
      benchmarks: this.extractWebSocketBenchmarks(results)
    };
  }

  generateWebSocketRecommendations(results) {
    const recommendations = [];

    for (const result of results) {
      if (!result.success) continue;

      if (result.name === 'Connection Scalability') {
        if (result.summary.scalabilityEfficiency < 80) {
          recommendations.push({
            type: 'scalability',
            priority: 'high',
            message: 'Low connection scalability efficiency detected',
            suggestion: 'Optimize WebSocket server configuration and increase connection limits'
          });
        }
      }

      if (result.name === 'Message Throughput') {
        if (result.summary.averageLatency > 100) {
          recommendations.push({
            type: 'performance',
            priority: 'high',
            message: 'High message latency detected',
            suggestion: 'Optimize message processing and reduce payload sizes'
          });
        }
      }

      if (result.name === 'Concurrent Connections') {
        if (result.summary.scalabilityLimit !== -1) {
          recommendations.push({
            type: 'capacity',
            priority: 'medium',
            message: 'Connection scalability limit reached',
            suggestion: 'Consider horizontal scaling and load balancing'
          });
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        message: 'WebSocket scalability tests passed successfully',
        suggestion: 'System demonstrates good WebSocket scalability characteristics'
      });
    }

    return recommendations;
  }

  extractWebSocketBenchmarks(results) {
    return {
      connectionScalability: results.find(r => r.name === 'Connection Scalability'),
      messageThroughput: results.find(r => r.name === 'Message Throughput'),
      concurrentConnections: results.find(r => r.name === 'Concurrent Connections'),
      connectionPersistence: results.find(r => r.name === 'Connection Persistence')
    };
  }
}

module.exports = WebSocketScalabilityTest;
