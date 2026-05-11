const axios = require('axios');
const { logger } = require('../utils/logger');
const { performance } = require('perf_hooks');

class SustainedThroughputTest {
  constructor() {
    this.baseUrl = process.env.TEST_API_URL || 'http://localhost:5000';
    this.metrics = {
      totalEvents: 0,
      successfulEvents: 0,
      failedEvents: 0,
      averageLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
      throughput: 0,
      errorRate: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }

  // Run sustained throughput test
  async runSustainedThroughputTest() {
    const startTime = Date.now();
    logger.info('Starting sustained event throughput test');

    try {
      const testConfig = {
        duration: 60 * 1000, // 1 minute
        targetThroughput: 1000, // 1000 events per second
        batchSize: 100, // Send 100 events per batch
        eventTypes: ['vote_cast', 'user_action', 'analytics_event', 'system_metric'],
        payloadSizes: [100, 500, 1000, 5000] // Different payload sizes
      };

      const results = await this.executeThroughputTest(testConfig);
      
      const testResult = {
        name: 'Sustained Event Throughput',
        success: true,
        duration: Date.now() - startTime,
        config: testConfig,
        results,
        summary: this.generateSummary(results, testConfig)
      };

      logger.info('Sustained throughput test completed', testResult);
      return testResult;

    } catch (error) {
      logger.error('Sustained throughput test failed', { error: error.message });
      
      return {
        name: 'Sustained Event Throughput',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Execute throughput test
  async executeThroughputTest(config) {
    const results = {
      batches: [],
      events: [],
      latencyDistribution: {},
      errorTypes: {},
      throughputOverTime: []
    };

    const startTime = Date.now();
    let sentEvents = 0;
    let lastThroughputCheck = startTime;

    while ((Date.now() - startTime) < config.duration) {
      const batchStartTime = Date.now();
      
      // Create batch of events
      const batch = this.createEventBatch(config, sentEvents);
      
      try {
        // Send batch
        const response = await this.sendEventBatch(batch);
        const batchLatency = Date.now() - batchStartTime;
        
        // Record batch results
        results.batches.push({
          id: results.batches.length + 1,
          size: batch.length,
          latency: batchLatency,
          success: response.success,
          error: response.error || null,
          timestamp: new Date().toISOString()
        });

        // Record individual events
        for (const event of batch) {
          results.events.push({
            ...event,
            batchId: results.batches.length,
            success: response.success,
            latency: response.success ? batchLatency : null,
            timestamp: new Date().toISOString()
          });
        }

        sentEvents += batch.length;

        // Update throughput every 5 seconds
        if (Date.now() - lastThroughputCheck > 5000) {
          const currentThroughput = sentEvents / ((Date.now() - startTime) / 1000);
          results.throughputOverTime.push({
            timestamp: new Date().toISOString(),
            eventsSent: sentEvents,
            throughput: currentThroughput,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
          });
          lastThroughputCheck = Date.now();
        }

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));

      } catch (error) {
        // Record batch failure
        results.batches.push({
          id: results.batches.length + 1,
          size: batch.length,
          latency: Date.now() - batchStartTime,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        // Record error type
        const errorType = this.categorizeError(error);
        results.errorTypes[errorType] = (results.errorTypes[errorType] || 0) + 1;
      }
    }

    return results;
  }

  // Create event batch
  createEventBatch(config, startEventId) {
    const batch = [];
    
    for (let i = 0; i < config.batchSize; i++) {
      const eventType = config.eventTypes[Math.floor(Math.random() * config.eventTypes.length)];
      const payloadSize = config.payloadSizes[Math.floor(Math.random() * config.payloadSizes.length)];
      
      const event = {
        id: `event_${startEventId + i}`,
        type: eventType,
        timestamp: new Date().toISOString(),
        tenantId: `tenant_${Math.floor(Math.random() * 5)}`,
        userId: `user_${Math.floor(Math.random() * 100)}`,
        payload: this.generatePayload(payloadSize),
        metadata: {
          source: 'throughput_test',
          batchId: Math.floor(startEventId / config.batchSize),
          testRun: Date.now()
        }
      };

      batch.push(event);
    }

    return batch;
  }

  // Generate payload of specific size
  generatePayload(targetSize) {
    const basePayload = {
      data: 'x'.repeat(Math.max(0, targetSize - 100)), // Compensate for JSON overhead
      timestamp: new Date().toISOString(),
      random: Math.random().toString(36)
    };

    // Adjust to get closer to target size
    const actualSize = JSON.stringify(basePayload).length;
    if (actualSize < targetSize) {
      basePayload.data += 'x'.repeat(targetSize - actualSize);
    } else if (actualSize > targetSize) {
      const excess = actualSize - targetSize;
      basePayload.data = basePayload.data.slice(0, -excess);
    }

    return basePayload;
  }

  // Send event batch
  async sendEventBatch(batch) {
    const startTime = Date.now();
    
    try {
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/api/events/batch`,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VoteWave-ThroughputTest/1.0'
        },
        data: { events: batch },
        timeout: 30000
      });

      return {
        success: response.status >= 200 && response.status < 400,
        status: response.status,
        responseTime: Date.now() - startTime,
        data: response.data
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  // Categorize error type
  categorizeError(error) {
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
      return 'connection_reset';
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return 'timeout';
    } else if (error.response?.status === 429) {
      return 'rate_limited';
    } else if (error.response?.status >= 500) {
      return 'server_error';
    } else if (error.response?.status >= 400) {
      return 'client_error';
    } else {
      return 'unknown';
    }
  }

  // Generate test summary
  generateSummary(results, config) {
    const successfulBatches = results.batches.filter(b => b.success);
    const failedBatches = results.batches.filter(b => !b.success);
    
    const latencies = successfulBatches.map(b => b.latency);
    const averageLatency = latencies.length > 0 
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length 
      : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;

    const totalDuration = results.throughputOverTime.length > 0 
      ? Date.now() - new Date(results.throughputOverTime[0].timestamp).getTime()
      : 0;

    const totalEvents = results.events.length;
    const successfulEvents = results.events.filter(e => e.success).length;
    const actualThroughput = totalDuration > 0 ? (successfulEvents / totalDuration) * 1000 : 0;

    return {
      totalBatches: results.batches.length,
      successfulBatches: successfulBatches.length,
      failedBatches: failedBatches.length,
      successRate: results.batches.length > 0 ? (successfulBatches.length / results.batches.length) * 100 : 0,
      
      totalEvents,
      successfulEvents,
      failedEvents,
      eventSuccessRate: totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0,
      
      latency: {
        average: Math.round(averageLatency),
        min: minLatency,
        max: maxLatency,
        p95: this.calculatePercentile(latencies, 95),
        p99: this.calculatePercentile(latencies, 99)
      },
      
      throughput: {
        target: config.targetThroughput,
        actual: Math.round(actualThroughput),
        efficiency: config.targetThroughput > 0 ? (actualThroughput / config.targetThroughput) * 100 : 0
      },
      
      duration: totalDuration,
      
      errorTypes: results.errorTypes,
      
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        peakMemory: results.throughputOverTime.length > 0 
          ? Math.max(...results.throughputOverTime.map(t => t.memoryUsage.heapUsed))
          : 0
      }
    };
  }

  // Calculate percentile
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    
    return sorted[Math.max(0, index)];
  }

  // Run multiple throughput tests with different configurations
  async runThroughputTests() {
    logger.info('Starting comprehensive throughput testing');

    const testConfigurations = [
      {
        name: 'Light Load',
        duration: 60 * 1000,
        targetThroughput: 100,
        batchSize: 10,
        eventTypes: ['vote_cast'],
        payloadSizes: [100]
      },
      {
        name: 'Medium Load',
        duration: 60 * 1000,
        targetThroughput: 500,
        batchSize: 50,
        eventTypes: ['vote_cast', 'user_action'],
        payloadSizes: [100, 500]
      },
      {
        name: 'Heavy Load',
        duration: 60 * 1000,
        targetThroughput: 1000,
        batchSize: 100,
        eventTypes: ['vote_cast', 'user_action', 'analytics_event'],
        payloadSizes: [100, 500, 1000]
      },
      {
        name: 'Peak Load',
        duration: 60 * 1000,
        targetThroughput: 2000,
        batchSize: 200,
        eventTypes: ['vote_cast', 'user_action', 'analytics_event', 'system_metric'],
        payloadSizes: [100, 500, 1000, 5000]
      }
    ];

    const results = [];

    for (const config of testConfigurations) {
      logger.info(`Running ${config.name} throughput test`);
      
      try {
        const testResult = await this.executeThroughputTest(config);
        
        results.push({
          name: config.name,
          success: true,
          config,
          results: testResult,
          summary: this.generateSummary(testResult, config)
        });

        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 10000));

      } catch (error) {
        logger.error(`${config.name} throughput test failed`, { error: error.message });
        
        results.push({
          name: config.name,
          success: false,
          config,
          error: error.message
        });
      }
    }

    return this.generateThroughputReport(results);
  }

  // Generate comprehensive throughput report
  generateThroughputReport(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      overallSuccess: results.filter(r => r.success).length === results.length,
      recommendations: this.generateThroughputRecommendations(results)
    };

    return {
      summary,
      results,
      benchmarks: this.extractThroughputBenchmarks(results)
    };
  }

  // Generate throughput recommendations
  generateThroughputRecommendations(results) {
    const recommendations = [];

    for (const result of results) {
      if (!result.success) continue;

      const summary = result.summary;
      
      // Check throughput efficiency
      if (summary.throughput.efficiency < 80) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          test: result.name,
          message: `Low throughput efficiency (${summary.throughput.efficiency.toFixed(1)}%)`,
          suggestion: 'Optimize event processing and reduce bottlenecks'
        });
      }

      // Check latency
      if (summary.latency.average > 1000) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          test: result.name,
          message: `High average latency (${summary.latency.average}ms)`,
          suggestion: 'Optimize database queries and add caching'
        });
      }

      // Check error rate
      if (summary.successRate < 95) {
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          test: result.name,
          message: `High error rate (${(100 - summary.successRate).toFixed(1)}%)`,
          suggestion: 'Improve error handling and retry mechanisms'
        });
      }

      // Check memory usage
      if (summary.performance.peakMemory > 1024 * 1024 * 1024) { // 1GB
        recommendations.push({
          type: 'resource',
          priority: 'medium',
          test: result.name,
          message: `High memory usage (${(summary.performance.peakMemory / 1024 / 1024).toFixed(1)}MB)`,
          suggestion: 'Optimize memory usage and implement garbage collection'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        message: 'All throughput tests passed successfully',
        suggestion: 'System is performing well within expected parameters'
      });
    }

    return recommendations;
  }

  // Extract throughput benchmarks
  extractThroughputBenchmarks(results) {
    return {
      lightLoad: results.find(r => r.name === 'Light Load'),
      mediumLoad: results.find(r => r.name === 'Medium Load'),
      heavyLoad: results.find(r => r.name === 'Heavy Load'),
      peakLoad: results.find(r => r.name === 'Peak Load')
    };
  }
}

module.exports = SustainedThroughputTest;
