const axios = require('axios');
const { logger } = require('../utils/logger');
const { performance } = require('perf_hooks');

class FraudDetectionLatencyTest {
  constructor() {
    this.baseUrl = process.env.TEST_API_URL || 'http://localhost:5000';
    this.testResults = [];
    this.metrics = {
      totalTransactions: 0,
      successfulDetections: 0,
      failedDetections: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      fraudScoreDistribution: {},
      latencyDistribution: {},
      throughput: 0,
      errorRate: 0
    };
  }

  // Run comprehensive fraud detection latency tests
  async runFraudDetectionLatencyTests() {
    logger.info('Starting comprehensive fraud detection latency testing');

    const testScenarios = [
      this.testSingleTransactionLatency(),
      this.testBatchTransactionLatency(),
      this.testHighVolumeFraudDetection(),
      this.testComplexFraudPatterns(),
      this.testMLModelPerformance(),
      this.testConcurrentDetections(),
      this.testEdgeCaseTransactions(),
      this.testRealTimeFraudDetection(),
      this.testModelAccuracyUnderLoad()
    ];

    const results = [];

    for (const test of testScenarios) {
      try {
        logger.info(`Running fraud detection test: ${test.name}`);
        const result = await test;
        results.push(result);
        
        // Wait between tests
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        logger.error(`Fraud detection test failed: ${test.name}`, { error: error.message });
        
        results.push({
          name: test.name,
          success: false,
          error: error.message,
          duration: 0
        });
      }
    }

    return this.generateFraudDetectionReport(results);
  }

  // Test single transaction latency
  async testSingleTransactionLatency() {
    const startTime = Date.now();
    logger.info('Testing single transaction fraud detection latency');

    try {
      const transactionCount = 100;
      const latencies = [];
      const fraudScores = [];

      for (let i = 0; i < transactionCount; i++) {
        const transaction = this.generateTestTransaction(i, 0.1); // 10% fraud rate
        
        const detectionStartTime = Date.now();
        
        try {
          const response = await axios.post(`${this.baseUrl}/api/fraud/analyze`, transaction, {
            timeout: 10000
          });
          
          const latency = Date.now() - detectionStartTime;
          latencies.push(latency);
          
          if (response.data && response.data.fraudScore !== undefined) {
            fraudScores.push(response.data.fraudScore);
          }

        } catch (error) {
          latencies.push(10000); // Timeout
        }
      }

      const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);
      const p95Latency = this.calculatePercentile(latencies, 95);
      const p99Latency = this.calculatePercentile(latencies, 99);

      const result = {
        name: 'Single Transaction Latency',
        success: true,
        duration: Date.now() - startTime,
        transactionCount,
        latency: {
          average: Math.round(averageLatency),
          min: minLatency,
          max: maxLatency,
          p95: Math.round(p95Latency),
          p99: Math.round(p99Latency)
        },
        fraudScores: {
          average: fraudScores.length > 0 ? fraudScores.reduce((sum, score) => sum + score, 0) / fraudScores.length : 0,
          min: fraudScores.length > 0 ? Math.min(...fraudScores) : 0,
          max: fraudScores.length > 0 ? Math.max(...fraudScores) : 0,
          distribution: this.calculateScoreDistribution(fraudScores)
        },
        throughput: Math.round((transactionCount / (Date.now() - startTime)) * 1000)
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Single transaction latency test failed', { error: error.message });
      
      return {
        name: 'Single Transaction Latency',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test batch transaction latency
  async testBatchTransactionLatency() {
    const startTime = Date.now();
    logger.info('Testing batch transaction fraud detection latency');

    try {
      const batchSizes = [10, 50, 100, 500];
      const results = [];

      for (const batchSize of batchSizes) {
        const batch = Array.from({ length: batchSize }, (_, i) => 
          this.generateTestTransaction(i, 0.15)
        );

        const batchStartTime = Date.now();
        
        try {
          const response = await axios.post(`${this.baseUrl}/api/fraud/batch-analyze`, {
            transactions: batch
          }, {
            timeout: 30000
          });
          
          const batchLatency = Date.now() - batchStartTime;
          const averagePerTransaction = batchLatency / batchSize;
          
          results.push({
            batchSize,
            batchLatency,
            averagePerTransaction: Math.round(averagePerTransaction),
            success: response.status === 200
          });

        } catch (error) {
          results.push({
            batchSize,
            batchLatency: 30000,
            averagePerTransaction: 300,
            success: false,
            error: error.message
          });
        }
      }

      const result = {
        name: 'Batch Transaction Latency',
        success: true,
        duration: Date.now() - startTime,
        batchResults: results,
        summary: {
          bestBatchSize: results.reduce((best, current) => 
            current.averagePerTransaction < best.averagePerTransaction ? current : best
          ),
          worstBatchSize: results.reduce((worst, current) => 
            current.averagePerTransaction > worst.averagePerTransaction ? current : worst
          )
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Batch transaction latency test failed', { error: error.message });
      
      return {
        name: 'Batch Transaction Latency',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test high volume fraud detection
  async testHighVolumeFraudDetection() {
    const startTime = Date.now();
    logger.info('Testing high volume fraud detection');

    try {
      const transactionCount = 1000;
      const concurrency = 50;
      const batchSize = Math.ceil(transactionCount / concurrency);
      
      const batches = [];
      for (let i = 0; i < transactionCount; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, transactionCount - i) }, (_, j) => 
          this.generateTestTransaction(i + j, 0.2) // 20% fraud rate
        );
        batches.push(batch);
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(
        batches.map(batch => this.analyzeBatch(batch))
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      const successfulBatches = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failedBatches = results.filter(r => r.status === 'rejected' || !r.value.success).length;
      
      const latencies = results
        .filter(r => r.status === 'fulfilled' && r.value.success)
        .map(r => r.value.latency);

      const averageLatency = latencies.length > 0 
        ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length 
        : 0;

      const result = {
        name: 'High Volume Fraud Detection',
        success: true,
        duration: Date.now() - startTime,
        transactionCount,
        concurrency,
        batchSize,
        totalTime,
        successfulBatches,
        failedBatches,
        averageLatency: Math.round(averageLatency),
        throughput: Math.round((transactionCount / totalTime) * 1000),
        errorRate: (failedBatches / batches.length) * 100
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('High volume fraud detection test failed', { error: error.message });
      
      return {
        name: 'High Volume Fraud Detection',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test complex fraud patterns
  async testComplexFraudPatterns() {
    const startTime = Date.now();
    logger.info('Testing complex fraud patterns');

    try {
      const fraudPatterns = [
        { name: 'Velocity Attack', generator: this.generateVelocityAttack },
        { name: 'Card Testing', generator: this.generateCardTesting },
        { name: 'Account Takeover', generator: this.generateAccountTakeover },
        { name: 'Synthetic Identity', generator: this.generateSyntheticIdentity },
        { name: 'Collusion', generator: this.generateCollusion }
      ];

      const results = [];

      for (const pattern of fraudPatterns) {
        const patternStartTime = Date.now();
        
        try {
          const transactions = pattern.generator.call(this, 50);
          const response = await axios.post(`${this.baseUrl}/api/fraud/analyze`, {
            transactions
          }, {
            timeout: 20000
          });
          
          results.push({
            pattern: pattern.name,
            transactionCount: transactions.length,
            latency: Date.now() - patternStartTime,
            success: response.status === 200,
            detectedFraud: response.data?.detectedFraud || 0,
            accuracy: response.data?.accuracy || 0
          });

        } catch (error) {
          results.push({
            pattern: pattern.name,
            transactionCount: 50,
            latency: 20000,
            success: false,
            error: error.message
          });
        }
      }

      const result = {
        name: 'Complex Fraud Patterns',
        success: true,
        duration: Date.now() - startTime,
        patternResults: results,
        summary: {
          averageLatency: results.reduce((sum, r) => sum + r.latency, 0) / results.length,
          bestPattern: results.reduce((best, current) => 
            current.latency < best.latency ? current : best
          ),
          worstPattern: results.reduce((worst, current) => 
            current.latency > worst.latency ? current : worst
          )
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Complex fraud patterns test failed', { error: error.message });
      
      return {
        name: 'Complex Fraud Patterns',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test ML model performance
  async testMLModelPerformance() {
    const startTime = Date.now();
    logger.info('Testing ML model performance');

    try {
      const modelTests = [
        { name: 'Model Loading Time', test: this.testModelLoadingTime },
        { name: 'Model Inference Time', test: this.testModelInferenceTime },
        { name: 'Model Memory Usage', test: this.testModelMemoryUsage },
        { name: 'Model Accuracy', test: this.testModelAccuracy }
      ];

      const results = [];

      for (const modelTest of modelTests) {
        try {
          const result = await modelTest.test.call(this);
          results.push(result);
        } catch (error) {
          results.push({
            name: modelTest.name,
            success: false,
            error: error.message
          });
        }
      }

      const result = {
        name: 'ML Model Performance',
        success: true,
        duration: Date.now() - startTime,
        modelResults: results,
        summary: {
          averageInferenceTime: results
            .filter(r => r.name === 'Model Inference Time' && r.success)
            .reduce((sum, r) => sum + r.inferenceTime, 0) / 
            results.filter(r => r.name === 'Model Inference Time' && r.success).length || 1,
          memoryEfficiency: results
            .filter(r => r.name === 'Model Memory Usage' && r.success)
            .reduce((sum, r) => sum + r.memoryUsage, 0) / 
            results.filter(r => r.name === 'Model Memory Usage' && r.success).length || 1
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('ML model performance test failed', { error: error.message });
      
      return {
        name: 'ML Model Performance',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test concurrent detections
  async testConcurrentDetections() {
    const startTime = Date.now();
    logger.info('Testing concurrent fraud detections');

    try {
      const concurrencyLevels = [10, 25, 50, 100];
      const results = [];

      for (const concurrency of concurrencyLevels) {
        const transactions = Array.from({ length: concurrency }, (_, i) => 
          this.generateTestTransaction(i, 0.25)
        );

        const concurrentStartTime = Date.now();
        
        try {
          const response = await axios.post(`${this.baseUrl}/api/fraud/concurrent-analyze`, {
            transactions
          }, {
            timeout: 15000
          });
          
          results.push({
            concurrency,
            latency: Date.now() - concurrentStartTime,
            success: response.status === 200,
            throughput: Math.round((concurrency / (Date.now() - concurrentStartTime)) * 1000)
          });

        } catch (error) {
          results.push({
            concurrency,
            latency: 15000,
            success: false,
            error: error.message
          });
        }
      }

      const result = {
        name: 'Concurrent Detections',
        success: true,
        duration: Date.now() - startTime,
        concurrencyResults: results,
        summary: {
          optimalConcurrency: results.reduce((best, current) => 
            current.throughput > best.throughput ? current : best
          ),
          maxThroughput: Math.max(...results.map(r => r.throughput || 0))
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Concurrent detections test failed', { error: error.message });
      
      return {
        name: 'Concurrent Detections',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Helper methods
  generateTestTransaction(index, fraudRate) {
    const isFraudulent = Math.random() < fraudRate;
    
    return {
      id: `txn_${index}`,
      userId: `user_${Math.floor(Math.random() * 1000)}`,
      amount: Math.floor(Math.random() * 10000) + 100,
      timestamp: new Date().toISOString(),
      ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
      userAgent: `TestAgent ${index}`,
      deviceFingerprint: `device_${index % 50}`,
      location: {
        country: ['US', 'UK', 'CA', 'AU'][Math.floor(Math.random() * 4)],
        city: `City_${index % 10}`
      },
      paymentMethod: ['credit_card', 'debit_card', 'bank_transfer'][Math.floor(Math.random() * 3)],
      merchantCategory: ['retail', 'online', 'travel', 'food'][Math.floor(Math.random() * 4)],
      suspicious: isFraudulent,
      metadata: {
        velocity: Math.floor(Math.random() * 10) + 1,
        riskScore: isFraudulent ? Math.random() * 0.5 + 0.5 : Math.random() * 0.3,
        anomalies: isFraudulent ? ['unusual_amount', 'suspicious_location'] : []
      }
    };
  }

  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    
    return sorted[Math.max(0, index)];
  }

  calculateScoreDistribution(scores) {
    if (scores.length === 0) return {};
    
    const distribution = {
      '0.0-0.2': 0,
      '0.2-0.4': 0,
      '0.4-0.6': 0,
      '0.6-0.8': 0,
      '0.8-1.0': 0
    };

    for (const score of scores) {
      if (score <= 0.2) distribution['0.0-0.2']++;
      else if (score <= 0.4) distribution['0.2-0.4']++;
      else if (score <= 0.6) distribution['0.4-0.6']++;
      else if (score <= 0.8) distribution['0.6-0.8']++;
      else distribution['0.8-1.0']++;
    }

    return distribution;
  }

  // Pattern generators
  generateVelocityAttack(count) {
    return Array.from({ length: count }, (_, i) => ({
      ...this.generateTestTransaction(i, 0.8),
      metadata: {
        ...this.generateTestTransaction(i, 0.8).metadata,
        velocity: count - i,
        timeWindow: '5m'
      }
    }));
  }

  generateCardTesting(count) {
    return Array.from({ length: count }, (_, i) => ({
      ...this.generateTestTransaction(i, 0.9),
      paymentMethod: 'credit_card',
      metadata: {
        ...this.generateTestTransaction(i, 0.9).metadata,
        cardTesting: true,
        declinedTransactions: Math.floor(Math.random() * 5)
      }
    }));
  }

  generateAccountTakeover(count) {
    return Array.from({ length: count }, (_, i) => ({
      ...this.generateTestTransaction(i, 0.95),
      metadata: {
        ...this.generateTestTransaction(i, 0.95).metadata,
        accountTakeover: true,
        suspiciousLogin: true,
        unusualDevice: true
      }
    }));
  }

  generateSyntheticIdentity(count) {
    return Array.from({ length: count }, (_, i) => ({
      ...this.generateTestTransaction(i, 0.85),
      metadata: {
        ...this.generateTestTransaction(i, 0.85).metadata,
        syntheticIdentity: true,
        newAccount: true,
        suspiciousProfile: true
      }
    }));
  }

  generateCollusion(count) {
    return Array.from({ length: count }, (_, i) => ({
      ...this.generateTestTransaction(i, 0.7),
      metadata: {
        ...this.generateTestTransaction(i, 0.7).metadata,
        collusion: true,
        coordinatedBehavior: true,
        similarPatterns: true
      }
    }));
  }

  // Generate fraud detection report
  generateFraudDetectionReport(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      overallSuccess: results.filter(r => r.success).length === results.length,
      recommendations: this.generateFraudDetectionRecommendations(results)
    };

    return {
      summary,
      results,
      benchmarks: this.extractFraudDetectionBenchmarks(results)
    };
  }

  generateFraudDetectionRecommendations(results) {
    const recommendations = [];

    for (const result of results) {
      if (!result.success) continue;

      if (result.name === 'Single Transaction Latency' && result.latency.average > 1000) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          message: 'High single transaction latency detected',
          suggestion: 'Optimize ML model inference and reduce processing overhead'
        });
      }

      if (result.name === 'High Volume Fraud Detection' && result.errorRate > 5) {
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          message: 'High error rate under load',
          suggestion: 'Implement better error handling and retry mechanisms'
        });
      }

      if (result.name === 'ML Model Performance' && result.summary.averageInferenceTime > 500) {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          message: 'Slow ML model inference',
          suggestion: 'Consider model optimization or hardware acceleration'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        message: 'Fraud detection system performing well',
        suggestion: 'Continue monitoring and consider scaling for increased load'
      });
    }

    return recommendations;
  }

  extractFraudDetectionBenchmarks(results) {
    return {
      singleTransactionLatency: results.find(r => r.name === 'Single Transaction Latency'),
      batchTransactionLatency: results.find(r => r.name === 'Batch Transaction Latency'),
      highVolumeDetection: results.find(r => r.name === 'High Volume Fraud Detection'),
      complexFraudPatterns: results.find(r => r.name === 'Complex Fraud Patterns'),
      mlModelPerformance: results.find(r => r.name === 'ML Model Performance'),
      concurrentDetections: results.find(r => r.name === 'Concurrent Detections')
    };
  }
}

module.exports = FraudDetectionLatencyTest;
