const axios = require('axios');
const { logger } = require('../utils/logger');
const { performance } = require('perf_hooks');

class ChaosTest {
  constructor() {
    this.baseUrl = process.env.TEST_API_URL || 'http://localhost:5000';
    this.testResults = [];
    this.chaosExperiments = new Map();
    this.systemBaseline = null;
    this.metrics = {
      totalExperiments: 0,
      successfulExperiments: 0,
      failedExperiments: 0,
      averageRecoveryTime: 0,
      systemResilience: 0
    };
  }

  // Run comprehensive chaos tests
  async runChaosTests() {
    logger.info('Starting comprehensive chaos testing');

    try {
      // Establish system baseline
      this.systemBaseline = await this.establishBaseline();
      
      const chaosExperiments = [
        this.testRandomPodDeletion(),
        this.testNetworkLatencyInjection(),
        this.testPacketLossInjection(),
        this.testCPUExhaustion(),
        this.testMemoryExhaustion(),
        this.testDiskIOExhaustion(),
        this.testDatabaseConnectionChaos(),
        this.testRedisConnectionChaos(),
        this.testWebSocketConnectionChaos(),
        this.testLoadBalancerFailover(),
        this.testCascadingFailures(),
        this.testPartialOutages(),
        this.testResourceContention(),
        this.testTimeDriftInjection(),
        this.testDependencyFailure()
      ];

      const results = [];

      for (const experiment of chaosExperiments) {
        try {
          logger.info(`Running chaos experiment: ${experiment.name}`);
          const result = await experiment;
          results.push(result);
          
          // Wait between experiments for system recovery
          await new Promise(resolve => setTimeout(resolve, 30000));
          
        } catch (error) {
          logger.error(`Chaos experiment failed: ${experiment.name}`, { error: error.message });
          
          results.push({
            name: experiment.name,
            success: false,
            error: error.message,
            duration: 0
          });
        }
      }

      return this.generateChaosReport(results);

    } catch (error) {
      logger.error('Chaos testing failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Establish system baseline
  async establishBaseline() {
    logger.info('Establishing system performance baseline');

    try {
      const baselineTests = [
        this.measureResponseTimes(),
        this.measureThroughput(),
        this.measureResourceUsage(),
        this.measureErrorRates(),
        this.measureSystemHealth()
      ];

      const results = await Promise.all(baselineTests);
      
      const baseline = {
        timestamp: new Date().toISOString(),
        responseTimes: results[0],
        throughput: results[1],
        resourceUsage: results[2],
        errorRates: results[3],
        systemHealth: results[4]
      };

      logger.info('System baseline established', baseline);
      return baseline;

    } catch (error) {
      logger.error('Failed to establish baseline', { error: error.message });
      throw error;
    }
  }

  // Test random pod deletion
  async testRandomPodDeletion() {
    const startTime = Date.now();
    logger.info('Testing random pod deletion');

    try {
      const experimentConfig = {
        name: 'Random Pod Deletion',
        description: 'Randomly delete pods to test system resilience',
        duration: 300000, // 5 minutes
        deletionInterval: 30000, // Delete every 30 seconds
        maxDeletions: 10
      };

      const results = {
        deletions: [],
        systemImpact: [],
        recoveryTimes: []
      };

      // Start chaos experiment
      const experimentStartTime = Date.now();
      let deletionCount = 0;

      while (Date.now() - experimentStartTime < experimentConfig.duration && 
             deletionCount < experimentConfig.maxDeletions) {
        
        // Simulate pod deletion
        const deletionStartTime = Date.now();
        
        try {
          // Get list of running pods
          const pods = await this.getRunningPods();
          
          if (pods.length > 1) {
            const randomPod = pods[Math.floor(Math.random() * pods.length)];
            
            // Delete pod
            await this.deletePod(randomPod.id);
            
            const deletionTime = Date.now() - deletionStartTime;
            
            // Measure system impact
            const impact = await this.measureSystemImpact();
            impact.timestamp = new Date().toISOString();
            impact.deletion = {
              podId: randomPod.id,
              podName: randomPod.name,
              deletionTime
            };
            
            results.deletions.push({
              podId: randomPod.id,
              podName: randomPod.name,
              deletionTime,
              impact: impact
            });

            // Wait for recovery
            const recoveryStartTime = Date.now();
            let recovered = false;
            let recoveryAttempts = 0;

            while (!recovered && recoveryAttempts < 30) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              recoveryAttempts++;
              
              const currentHealth = await this.measureSystemHealth();
              if (currentHealth.status === 'healthy' && 
                  currentHealth.responseTime < this.systemBaseline.responseTimes.average * 1.5) {
                recovered = true;
                const recoveryTime = Date.now() - recoveryStartTime;
                results.recoveryTimes.push(recoveryTime);
              }
            }

            deletionCount++;
          }

        } catch (error) {
          logger.error('Pod deletion failed', { error: error.message });
        }

        // Wait before next deletion
        await new Promise(resolve => setTimeout(resolve, experimentConfig.deletionInterval));
      }

      const result = {
        name: experimentConfig.name,
        success: true,
        duration: Date.now() - startTime,
        config: experimentConfig,
        results,
        summary: {
          totalDeletions: deletionCount,
          averageRecoveryTime: results.recoveryTimes.length > 0 
            ? results.recoveryTimes.reduce((sum, time) => sum + time, 0) / results.recoveryTimes.length 
            : 0,
          maxRecoveryTime: results.recoveryTimes.length > 0 ? Math.max(...results.recoveryTimes) : 0,
          systemResilience: this.calculateResilience(results, this.systemBaseline)
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Random pod deletion test failed', { error: error.message });
      
      return {
        name: 'Random Pod Deletion',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test network latency injection
  async testNetworkLatencyInjection() {
    const startTime = Date.now();
    logger.info('Testing network latency injection');

    try {
      const experimentConfig = {
        name: 'Network Latency Injection',
        description: 'Inject network latency to test system resilience',
        duration: 180000, // 3 minutes
        latencyLevels: [50, 100, 200, 500], // ms
        affectedServices: ['api', 'database', 'redis', 'websocket']
      };

      const results = {
        latencyTests: [],
        systemImpact: [],
        recoveryMetrics: []
      };

      for (const latency of experimentConfig.latencyLevels) {
        for (const service of experimentConfig.affectedServices) {
          const testStartTime = Date.now();
          
          try {
            // Inject latency
            await this.injectNetworkLatency(service, latency);
            
            // Measure impact
            const impact = await this.measureServiceImpact(service);
            impact.latency = latency;
            impact.service = service;
            impact.timestamp = new Date().toISOString();
            
            results.latencyTests.push(impact);
            
            // Wait for system to adapt
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            // Remove latency injection
            await this.removeNetworkLatency(service);
            
            // Measure recovery
            const recoveryStartTime = Date.now();
            let recovered = false;
            let recoveryAttempts = 0;

            while (!recovered && recoveryAttempts < 20) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              recoveryAttempts++;
              
              const currentImpact = await this.measureServiceImpact(service);
              if (currentImpact.responseTime < this.systemBaseline.responseTimes.average * 1.2) {
                recovered = true;
                const recoveryTime = Date.now() - recoveryStartTime;
                results.recoveryMetrics.push({
                  service,
                  latency,
                  recoveryTime,
                  recoveryAttempts
                });
              }
            }

          } catch (error) {
            logger.error(`Latency injection failed for ${service}`, { error: error.message });
          }
        }
      }

      const result = {
        name: experimentConfig.name,
        success: true,
        duration: Date.now() - startTime,
        config: experimentConfig,
        results,
        summary: {
          totalTests: results.latencyTests.length,
          averageImpact: this.calculateAverageImpact(results.latencyTests),
          maxImpact: this.calculateMaxImpact(results.latencyTests),
          averageRecoveryTime: results.recoveryMetrics.length > 0 
            ? results.recoveryMetrics.reduce((sum, r) => sum + r.recoveryTime, 0) / results.recoveryMetrics.length 
            : 0,
          systemResilience: this.calculateResilience(results, this.systemBaseline)
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Network latency injection test failed', { error: error.message });
      
      return {
        name: 'Network Latency Injection',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test packet loss injection
  async testPacketLossInjection() {
    const startTime = Date.now();
    logger.info('Testing packet loss injection');

    try {
      const experimentConfig = {
        name: 'Packet Loss Injection',
        description: 'Inject packet loss to test system resilience',
        duration: 120000, // 2 minutes
        lossLevels: [1, 5, 10, 20], // percentage
        affectedServices: ['api', 'websocket']
      };

      const results = {
        lossTests: [],
        systemImpact: [],
        recoveryMetrics: []
      };

      for (const lossLevel of experimentConfig.lossLevels) {
        for (const service of experimentConfig.affectedServices) {
          const testStartTime = Date.now();
          
          try {
            // Inject packet loss
            await this.injectPacketLoss(service, lossLevel);
            
            // Measure impact over time
            const impactMeasurements = [];
            for (let i = 0; i < 10; i++) {
              const impact = await this.measureServiceImpact(service);
              impact.lossLevel = lossLevel;
              impact.service = service;
              impact.timestamp = new Date().toISOString();
              impactMeasurements.push(impact);
              
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
            
            // Remove packet loss injection
            await this.removePacketLoss(service);
            
            // Measure recovery
            const recoveryStartTime = Date.now();
            let recovered = false;
            let recoveryAttempts = 0;

            while (!recovered && recoveryAttempts < 15) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              recoveryAttempts++;
              
              const currentImpact = await this.measureServiceImpact(service);
              if (currentImpact.errorRate < this.systemBaseline.errorRates.average * 1.5) {
                recovered = true;
                const recoveryTime = Date.now() - recoveryStartTime;
                results.recoveryMetrics.push({
                  service,
                  lossLevel,
                  recoveryTime,
                  recoveryAttempts,
                  impactMeasurements
                });
              }
            }

          } catch (error) {
            logger.error(`Packet loss injection failed for ${service}`, { error: error.message });
          }
        }
      }

      const result = {
        name: experimentConfig.name,
        success: true,
        duration: Date.now() - startTime,
        config: experimentConfig,
        results,
        summary: {
          totalTests: results.lossTests.length,
          averageImpact: this.calculateAverageImpact(results.lossTests),
          maxImpact: this.calculateMaxImpact(results.lossTests),
          averageRecoveryTime: results.recoveryMetrics.length > 0 
            ? results.recoveryMetrics.reduce((sum, r) => sum + r.recoveryTime, 0) / results.recoveryMetrics.length 
            : 0,
          systemResilience: this.calculateResilience(results, this.systemBaseline)
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Packet loss injection test failed', { error: error.message });
      
      return {
        name: 'Packet Loss Injection',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test CPU exhaustion
  async testCPUExhaustion() {
    const startTime = Date.now();
    logger.info('Testing CPU exhaustion');

    try {
      const experimentConfig = {
        name: 'CPU Exhaustion',
        description: 'Exhaust CPU resources to test system resilience',
        duration: 60000, // 1 minute
        cpuLoadLevels: [70, 80, 90, 95], // percentage
        stressDuration: 30000 // 30 seconds per level
      };

      const results = {
        cpuTests: [],
        systemImpact: [],
        recoveryMetrics: []
      };

      for (const cpuLevel of experimentConfig.cpuLoadLevels) {
        const testStartTime = Date.now();
        
        try {
          // Generate CPU load
          await this.generateCPULoad(cpuLevel, experimentConfig.stressDuration);
          
          // Measure impact
          const impact = await this.measureSystemImpact();
          impact.cpuLevel = cpuLevel;
          impact.timestamp = new Date().toISOString();
          
          results.cpuTests.push(impact);
          
          // Wait for CPU to normalize
          await new Promise(resolve => setTimeout(resolve, 20000));
          
          // Measure recovery
          const recoveryStartTime = Date.now();
          let recovered = false;
          let recoveryAttempts = 0;

          while (!recovered && recoveryAttempts < 15) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            recoveryAttempts++;
            
            const currentImpact = await this.measureSystemImpact();
            if (currentImpact.cpuUsage < this.systemBaseline.resourceUsage.cpu * 1.2) {
              recovered = true;
              const recoveryTime = Date.now() - recoveryStartTime;
              results.recoveryMetrics.push({
                cpuLevel,
                recoveryTime,
                recoveryAttempts,
                impact
              });
            }
          }

        } catch (error) {
          logger.error(`CPU exhaustion test failed for ${cpuLevel}%`, { error: error.message });
        }
      }

      const result = {
        name: experimentConfig.name,
        success: true,
        duration: Date.now() - startTime,
        config: experimentConfig,
        results,
        summary: {
          totalTests: results.cpuTests.length,
          averageImpact: this.calculateAverageImpact(results.cpuTests),
          maxImpact: this.calculateMaxImpact(results.cpuTests),
          averageRecoveryTime: results.recoveryMetrics.length > 0 
            ? results.recoveryMetrics.reduce((sum, r) => sum + r.recoveryTime, 0) / results.recoveryMetrics.length 
            : 0,
          systemResilience: this.calculateResilience(results, this.systemBaseline)
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('CPU exhaustion test failed', { error: error.message });
      
      return {
        name: 'CPU Exhaustion',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Test memory exhaustion
  async testMemoryExhaustion() {
    const startTime = Date.now();
    logger.info('Testing memory exhaustion');

    try {
      const experimentConfig = {
        name: 'Memory Exhaustion',
        description: 'Exhaust memory resources to test system resilience',
        duration: 60000, // 1 minute
        memoryLoadLevels: [70, 80, 90], // percentage
        stressDuration: 20000 // 20 seconds per level
      };

      const results = {
        memoryTests: [],
        systemImpact: [],
        recoveryMetrics: []
      };

      for (const memoryLevel of experimentConfig.memoryLoadLevels) {
        const testStartTime = Date.now();
        
        try {
          // Generate memory load
          await this.generateMemoryLoad(memoryLevel, experimentConfig.stressDuration);
          
          // Measure impact
          const impact = await this.measureSystemImpact();
          impact.memoryLevel = memoryLevel;
          impact.timestamp = new Date().toISOString();
          
          results.memoryTests.push(impact);
          
          // Wait for memory to normalize (garbage collection)
          await new Promise(resolve => setTimeout(resolve, 30000));
          
          // Measure recovery
          const recoveryStartTime = Date.now();
          let recovered = false;
          let recoveryAttempts = 0;

          while (!recovered && recoveryAttempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            recoveryAttempts++;
            
            const currentImpact = await this.measureSystemImpact();
            if (currentImpact.memoryUsage < this.systemBaseline.resourceUsage.memory * 1.3) {
              recovered = true;
              const recoveryTime = Date.now() - recoveryStartTime;
              results.recoveryMetrics.push({
                memoryLevel,
                recoveryTime,
                recoveryAttempts,
                impact
              });
            }
          }

        } catch (error) {
          logger.error(`Memory exhaustion test failed for ${memoryLevel}%`, { error: error.message });
        }
      }

      const result = {
        name: experimentConfig.name,
        success: true,
        duration: Date.now() - startTime,
        config: experimentConfig,
        results,
        summary: {
          totalTests: results.memoryTests.length,
          averageImpact: this.calculateAverageImpact(results.memoryTests),
          maxImpact: this.calculateMaxImpact(results.memoryTests),
          averageRecoveryTime: results.recoveryMetrics.length > 0 
            ? results.recoveryMetrics.reduce((sum, r) => sum + r.recoveryTime, 0) / results.recoveryMetrics.length 
            : 0,
          systemResilience: this.calculateResilience(results, this.systemBaseline)
        }
      };

      this.testResults.push(result);
      return result;

    } catch (error) {
      logger.error('Memory exhaustion test failed', { error: error.message });
      
      return {
        name: 'Memory Exhaustion',
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  // Helper methods
  async getRunningPods() {
    // This would query Kubernetes API or container runtime
    return [
      { id: 'pod-1', name: 'api-server-1' },
      { id: 'pod-2', name: 'api-server-2' },
      { id: 'pod-3', name: 'api-server-3' },
      { id: 'pod-4', name: 'database-1' },
      { id: 'pod-5', name: 'redis-1' }
    ];
  }

  async deletePod(podId) {
    // Simulate pod deletion
    logger.info(`Deleting pod: ${podId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async injectNetworkLatency(service, latency) {
    // Simulate network latency injection
    logger.info(`Injecting ${latency}ms latency to ${service}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async removeNetworkLatency(service) {
    // Remove network latency injection
    logger.info(`Removing latency injection from ${service}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async injectPacketLoss(service, lossLevel) {
    // Simulate packet loss injection
    logger.info(`Injecting ${lossLevel}% packet loss to ${service}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async removePacketLoss(service) {
    // Remove packet loss injection
    logger.info(`Removing packet loss injection from ${service}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async generateCPULoad(cpuLevel, duration) {
    // Simulate CPU load generation
    logger.info(`Generating ${cpuLevel}% CPU load for ${duration}ms`);
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    while (Date.now() < endTime) {
      // CPU intensive operation
      const start = Date.now();
      while (Date.now() - start < 100) {
        Math.random() * Math.random();
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async generateMemoryLoad(memoryLevel, duration) {
    // Simulate memory load generation
    logger.info(`Generating ${memoryLevel}% memory load for ${duration}ms`);
    
    const memoryChunks = [];
    const chunkSize = 1024 * 1024; // 1MB chunks
    
    for (let i = 0; i < memoryLevel; i++) {
      memoryChunks.push(new Array(chunkSize).fill(Math.random()));
    }
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    // Clean up memory
    memoryChunks.length = 0;
  }

  async measureSystemImpact() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`, { timeout: 5000 });
      const startTime = Date.now();
      
      const healthCheck = await axios.get(`${this.baseUrl}/api/metrics`, { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      return {
        responseTime,
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        errorRate: Math.random() * 5, // Simulated error rate
        throughput: Math.random() * 1000 // Simulated throughput
      };

    } catch (error) {
      return {
        responseTime: 5000,
        status: 'unhealthy',
        error: error.message,
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        errorRate: 100,
        throughput: 0
      };
    }
  }

  async measureServiceImpact(service) {
    // Measure impact on specific service
    const impact = await this.measureSystemImpact();
    impact.service = service;
    return impact;
  }

  async measureResponseTimes() {
    const measurements = [];
    
    for (let i = 0; i < 10; i++) {
      const startTime = Date.now();
      try {
        await axios.get(`${this.baseUrl}/api/health`, { timeout: 5000 });
        measurements.push(Date.now() - startTime);
      } catch (error) {
        measurements.push(5000);
      }
    }
    
    return {
      average: measurements.reduce((sum, time) => sum + time, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      p95: this.calculatePercentile(measurements, 95)
    };
  }

  async measureThroughput() {
    const startTime = Date.now();
    const requests = [];
    
    for (let i = 0; i < 100; i++) {
      try {
        const requestStart = Date.now();
        await axios.get(`${this.baseUrl}/api/health`, { timeout: 5000 });
        requests.push(Date.now() - requestStart);
      } catch (error) {
        requests.push(5000);
      }
    }
    
    const totalTime = Date.now() - startTime;
    const successfulRequests = requests.filter(r => r < 5000).length;
    
    return {
      requestsPerSecond: (successfulRequests / totalTime) * 1000,
      averageResponseTime: requests.reduce((sum, r) => sum + r, 0) / requests.length,
      successRate: (successfulRequests / requests.length) * 100
    };
  }

  async measureResourceUsage() {
    return {
      cpu: process.cpuUsage(),
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  async measureErrorRates() {
    const measurements = [];
    
    for (let i = 0; i < 50; i++) {
      try {
        await axios.get(`${this.baseUrl}/api/health`, { timeout: 1000 });
        measurements.push(0);
      } catch (error) {
        measurements.push(1);
      }
    }
    
    return {
      average: (measurements.reduce((sum, error) => sum + error, 0) / measurements.length) * 100,
      max: Math.max(...measurements) * 100,
      min: Math.min(...measurements) * 100
    };
  }

  async measureSystemHealth() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`, { timeout: 5000 });
      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - Date.now(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  calculatePercentile(values, percentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  calculateAverageImpact(impacts) {
    if (impacts.length === 0) return 0;
    
    return {
      responseTime: impacts.reduce((sum, i) => sum + (i.responseTime || 0), 0) / impacts.length,
      errorRate: impacts.reduce((sum, i) => sum + (i.errorRate || 0), 0) / impacts.length,
      cpuUsage: impacts.reduce((sum, i) => sum + (i.cpuUsage?.user || 0), 0) / impacts.length,
      memoryUsage: impacts.reduce((sum, i) => sum + (i.memoryUsage?.heapUsed || 0), 0) / impacts.length
    };
  }

  calculateMaxImpact(impacts) {
    if (impacts.length === 0) return 0;
    
    return {
      responseTime: Math.max(...impacts.map(i => i.responseTime || 0)),
      errorRate: Math.max(...impacts.map(i => i.errorRate || 0)),
      cpuUsage: Math.max(...impacts.map(i => i.cpuUsage?.user || 0)),
      memoryUsage: Math.max(...impacts.map(i => i.memoryUsage?.heapUsed || 0))
    };
  }

  calculateResilience(results, baseline) {
    // Calculate system resilience score based on recovery time and impact
    const recoveryTimes = results
      .filter(r => r.recoveryMetrics)
      .flatMap(r => r.recoveryMetrics.map(m => m.recoveryTime));
    
    const averageRecoveryTime = recoveryTimes.length > 0 
      ? recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length 
      : 0;
    
    // Lower recovery time = higher resilience
    const recoveryScore = Math.max(0, 100 - (averageRecoveryTime / 1000) * 10);
    
    // Calculate impact score
    const impacts = Object.values(results).flatMap(r => {
      if (r.results) {
        return Object.values(r.results).flatMap(result => 
          Array.isArray(result) ? result : [result]
        );
      }
      return [];
    });
    
    const averageImpact = this.calculateAverageImpact(impacts);
    const impactScore = Math.max(0, 100 - (averageImpact.responseTime / 100) * 5);
    
    return Math.round((recoveryScore + impactScore) / 2);
  }

  // Generate chaos report
  generateChaosReport(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalExperiments: results.length,
      successfulExperiments: results.filter(r => r.success).length,
      failedExperiments: results.filter(r => !r.success).length,
      overallSuccess: results.filter(r => r.success).length === results.length,
      systemBaseline: this.systemBaseline,
      recommendations: this.generateChaosRecommendations(results)
    };

    return {
      summary,
      results,
      benchmarks: this.extractChaosBenchmarks(results)
    };
  }

  generateChaosRecommendations(results) {
    const recommendations = [];

    for (const result of results) {
      if (!result.success) continue;

      if (result.summary && result.summary.systemResilience < 70) {
        recommendations.push({
          type: 'resilience',
          priority: 'high',
          experiment: result.name,
          message: `Low system resilience score: ${result.summary.systemResilience}`,
          suggestion: 'Implement better error handling and recovery mechanisms'
        });
      }

      if (result.summary && result.summary.averageRecoveryTime > 30000) {
        recommendations.push({
          type: 'recovery',
          priority: 'high',
          experiment: result.name,
          message: `Slow recovery time: ${result.summary.averageRecoveryTime}ms`,
          suggestion: 'Optimize failover mechanisms and health checks'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        priority: 'low',
        message: 'All chaos tests passed successfully',
        suggestion: 'System demonstrates good resilience to failures'
      });
    }

    return recommendations;
  }

  extractChaosBenchmarks(results) {
    return {
      randomPodDeletion: results.find(r => r.name === 'Random Pod Deletion'),
      networkLatencyInjection: results.find(r => r.name === 'Network Latency Injection'),
      packetLossInjection: results.find(r => r.name === 'Packet Loss Injection'),
      cpuExhaustion: results.find(r => r.name === 'CPU Exhaustion'),
      memoryExhaustion: results.find(r => r.name === 'Memory Exhaustion')
    };
  }
}

module.exports = ChaosTest;
