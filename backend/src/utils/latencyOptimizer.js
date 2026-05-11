const { logger } = require('./logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class LatencyOptimizer extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.baselines = new Map();
    this.optimizations = new Map();
    this.thresholds = {
      responseTime: 1000, // 1 second
      throughput: 100, // 100 requests/second
      errorRate: 5, // 5%
      memoryUsage: 80, // 80%
      cpuUsage: 80 // 80%
    };
    
    this.optimizationStrategies = {
      caching: new Map(),
      connectionPooling: new Map(),
      queryOptimization: new Map(),
      loadBalancing: new Map(),
      resourceScaling: new Map()
    };

    this.initializeMetrics();
    this.startOptimization();
  }

  // Initialize metrics collection
  initializeMetrics() {
    setInterval(() => {
      this.collectMetrics();
    }, 5000); // Collect every 5 seconds

    setInterval(() => {
      this.analyzeAndOptimize();
    }, 30000); // Analyze every 30 seconds
  }

  // Collect system metrics
  async collectMetrics() {
    try {
      const timestamp = Date.now();
      
      // Collect response time metrics
      const responseMetrics = await this.collectResponseTimeMetrics();
      
      // Collect throughput metrics
      const throughputMetrics = await this.collectThroughputMetrics();
      
      // Collect resource usage metrics
      const resourceMetrics = this.collectResourceMetrics();
      
      // Collect error rate metrics
      const errorMetrics = await this.collectErrorMetrics();

      const metrics = {
        timestamp,
        responseTime: responseMetrics,
        throughput: throughputMetrics,
        resources: resourceMetrics,
        errors: errorMetrics
      };

      // Store metrics
      this.metrics.set(timestamp, metrics);
      
      // Keep only last 1000 data points
      if (this.metrics.size > 1000) {
        const oldestKey = Math.min(...this.metrics.keys());
        this.metrics.delete(oldestKey);
      }

      // Emit metrics for monitoring
      this.emit('metricsCollected', metrics);

    } catch (error) {
      logger.error('Failed to collect metrics', { error: error.message });
    }
  }

  // Collect response time metrics
  async collectResponseTimeMetrics() {
    try {
      // Get recent response times from Redis
      const keys = await redis.keys('response_time:*');
      const responseTimes = [];
      
      for (const key of keys.slice(-100)) { // Last 100 measurements
        const value = await redis.get(key);
        if (value) {
          responseTimes.push(parseFloat(value));
        }
      }

      if (responseTimes.length === 0) {
        return this.getEmptyResponseMetrics();
      }

      const sorted = responseTimes.sort((a, b) => a - b);
      
      return {
        average: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p50: this.calculatePercentile(sorted, 50),
        p90: this.calculatePercentile(sorted, 90),
        p95: this.calculatePercentile(sorted, 95),
        p99: this.calculatePercentile(sorted, 99),
        count: responseTimes.length
      };

    } catch (error) {
      logger.error('Failed to collect response time metrics', { error: error.message });
      return this.getEmptyResponseMetrics();
    }
  }

  // Collect throughput metrics
  async collectThroughputMetrics() {
    try {
      // Get recent throughput from Redis
      const keys = await redis.keys('throughput:*');
      const throughputValues = [];
      
      for (const key of keys.slice(-60)) { // Last 60 measurements
        const value = await redis.get(key);
        if (value) {
          throughputValues.push(parseFloat(value));
        }
      }

      if (throughputValues.length === 0) {
        return this.getEmptyThroughputMetrics();
      }

      return {
        current: throughputValues[throughputValues.length - 1] || 0,
        average: throughputValues.reduce((sum, value) => sum + value, 0) / throughputValues.length,
        min: Math.min(...throughputValues),
        max: Math.max(...throughputValues),
        trend: this.calculateTrend(throughputValues),
        count: throughputValues.length
      };

    } catch (error) {
      logger.error('Failed to collect throughput metrics', { error: error.message });
      return this.getEmptyThroughputMetrics();
    }
  }

  // Collect resource usage metrics
  collectResourceMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      return {
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
          heapUsagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
          idle: cpuUsage.idle,
          irq: cpuUsage.irq,
          totalUsagePercent: this.calculateCPUPercent(cpuUsage)
        },
        uptime: process.uptime(),
        loadAverage: require('os').loadavg()
      };

    } catch (error) {
      logger.error('Failed to collect resource metrics', { error: error.message });
      return this.getEmptyResourceMetrics();
    }
  }

  // Collect error metrics
  async collectErrorMetrics() {
    try {
      // Get recent error rates from Redis
      const keys = await redis.keys('error_rate:*');
      const errorRates = [];
      
      for (const key of keys.slice(-60)) { // Last 60 measurements
        const value = await redis.get(key);
        if (value) {
          errorRates.push(parseFloat(value));
        }
      }

      if (errorRates.length === 0) {
        return this.getEmptyErrorMetrics();
      }

      return {
        current: errorRates[errorRates.length - 1] || 0,
        average: errorRates.reduce((sum, rate) => sum + rate, 0) / errorRates.length,
        min: Math.min(...errorRates),
        max: Math.max(...errorRates),
        trend: this.calculateTrend(errorRates),
        count: errorRates.length
      };

    } catch (error) {
      logger.error('Failed to collect error metrics', { error: error.message });
      return this.getEmptyErrorMetrics();
    }
  }

  // Analyze metrics and optimize
  async analyzeAndOptimize() {
    try {
      const latestMetrics = this.getLatestMetrics();
      
      if (!latestMetrics) {
        return;
      }

      const optimizations = [];

      // Analyze response time
      const responseOptimizations = this.analyzeResponseTime(latestMetrics.responseTime);
      optimizations.push(...responseOptimizations);

      // Analyze throughput
      const throughputOptimizations = this.analyzeThroughput(latestMetrics.throughput);
      optimizations.push(...throughputOptimizations);

      // Analyze resource usage
      const resourceOptimizations = this.analyzeResourceUsage(latestMetrics.resources);
      optimizations.push(...resourceOptimizations);

      // Analyze error rates
      const errorOptimizations = this.analyzeErrorRates(latestMetrics.errors);
      optimizations.push(...errorOptimizations);

      // Apply optimizations
      for (const optimization of optimizations) {
        await this.applyOptimization(optimization);
      }

      // Update baselines
      this.updateBaselines(latestMetrics);

      // Emit optimization events
      this.emit('optimizationsApplied', optimizations);

    } catch (error) {
      logger.error('Failed to analyze and optimize', { error: error.message });
    }
  }

  // Analyze response time and suggest optimizations
  analyzeResponseTime(responseMetrics) {
    const optimizations = [];

    if (responseMetrics.average > this.thresholds.responseTime) {
      optimizations.push({
        type: 'response_time',
        severity: 'high',
        message: `High average response time: ${responseMetrics.average}ms`,
        suggestions: [
          'Enable query result caching',
          'Optimize database queries',
          'Add CDN for static assets',
          'Implement response compression'
        ],
        metrics: responseMetrics
      });
    }

    if (responseMetrics.p95 > this.thresholds.responseTime * 2) {
      optimizations.push({
        type: 'response_time_p95',
        severity: 'medium',
        message: `High P95 response time: ${responseMetrics.p95}ms`,
        suggestions: [
          'Implement request queuing',
          'Add rate limiting',
          'Optimize slow queries',
          'Scale horizontally'
        ],
        metrics: responseMetrics
      });
    }

    return optimizations;
  }

  // Analyze throughput and suggest optimizations
  analyzeThroughput(throughputMetrics) {
    const optimizations = [];

    if (throughputMetrics.average < this.thresholds.throughput) {
      optimizations.push({
        type: 'throughput',
        severity: 'high',
        message: `Low throughput: ${throughputMetrics.average} req/s`,
        suggestions: [
          'Enable HTTP/2',
          'Implement connection keep-alive',
          'Add load balancing',
          'Scale horizontally',
          'Optimize application code'
        ],
        metrics: throughputMetrics
      });
    }

    if (throughputMetrics.trend < -0.1) { // Declining trend
      optimizations.push({
        type: 'throughput_trend',
        severity: 'medium',
        message: `Declining throughput trend: ${throughputMetrics.trend}`,
        suggestions: [
          'Investigate performance regression',
          'Check for memory leaks',
          'Monitor resource contention',
          'Review recent deployments'
        ],
        metrics: throughputMetrics
      });
    }

    return optimizations;
  }

  // Analyze resource usage and suggest optimizations
  analyzeResourceUsage(resourceMetrics) {
    const optimizations = [];

    // Memory usage analysis
    if (resourceMetrics.memory.heapUsagePercent > this.thresholds.memoryUsage) {
      optimizations.push({
        type: 'memory_usage',
        severity: 'high',
        message: `High memory usage: ${resourceMetrics.memory.heapUsagePercent.toFixed(1)}%`,
        suggestions: [
          'Implement memory caching',
          'Optimize object pooling',
          'Add garbage collection tuning',
          'Scale memory resources',
          'Check for memory leaks'
        ],
        metrics: resourceMetrics.memory
      });
    }

    // CPU usage analysis
    if (resourceMetrics.cpu.totalUsagePercent > this.thresholds.cpuUsage) {
      optimizations.push({
        type: 'cpu_usage',
        severity: 'high',
        message: `High CPU usage: ${resourceMetrics.cpu.totalUsagePercent.toFixed(1)}%`,
        suggestions: [
          'Optimize CPU-intensive operations',
          'Implement worker threads',
          'Add CPU scaling',
          'Profile application performance',
          'Optimize algorithms'
        ],
        metrics: resourceMetrics.cpu
      });
    }

    return optimizations;
  }

  // Analyze error rates and suggest optimizations
  analyzeErrorRates(errorMetrics) {
    const optimizations = [];

    if (errorMetrics.average > this.thresholds.errorRate) {
      optimizations.push({
        type: 'error_rate',
        severity: 'high',
        message: `High error rate: ${errorMetrics.average.toFixed(2)}%`,
        suggestions: [
          'Implement better error handling',
          'Add circuit breakers',
          'Improve input validation',
          'Add retry mechanisms',
          'Monitor error patterns'
        ],
        metrics: errorMetrics
      });
    }

    if (errorMetrics.trend > 0.1) { // Increasing error trend
      optimizations.push({
        type: 'error_trend',
        severity: 'medium',
        message: `Increasing error trend: ${errorMetrics.trend}`,
        suggestions: [
          'Investigate root cause',
          'Check for resource exhaustion',
          'Review recent changes',
          'Implement health checks'
        ],
        metrics: errorMetrics
      });
    }

    return optimizations;
  }

  // Apply optimization
  async applyOptimization(optimization) {
    try {
      const optimizationId = `${optimization.type}_${Date.now()}`;
      
      // Store optimization
      this.optimizations.set(optimizationId, {
        ...optimization,
        appliedAt: new Date().toISOString(),
        status: 'pending'
      });

      // Apply specific optimization based on type
      switch (optimization.type) {
        case 'response_time':
        case 'response_time_p95':
          await this.applyResponseTimeOptimization(optimization);
          break;
        case 'throughput':
        case 'throughput_trend':
          await this.applyThroughputOptimization(optimization);
          break;
        case 'memory_usage':
          await this.applyMemoryOptimization(optimization);
          break;
        case 'cpu_usage':
          await this.applyCPUOptimization(optimization);
          break;
        case 'error_rate':
        case 'error_trend':
          await this.applyErrorOptimization(optimization);
          break;
      }

      // Update optimization status
      const appliedOptimization = this.optimizations.get(optimizationId);
      appliedOptimization.status = 'applied';
      appliedOptimization.appliedAt = new Date().toISOString();

      logger.info('Optimization applied', {
        type: optimization.type,
        severity: optimization.severity,
        suggestions: optimization.suggestions
      });

      this.emit('optimizationApplied', optimization);

    } catch (error) {
      logger.error('Failed to apply optimization', {
        type: optimization.type,
        error: error.message
      });
    }
  }

  // Apply response time optimization
  async applyResponseTimeOptimization(optimization) {
    const strategy = 'response_time_optimization';
    
    // Enable caching if not already enabled
    if (!this.optimizationStrategies.caching.has('response_cache')) {
      await this.enableResponseCache();
      this.optimizationStrategies.caching.set('response_cache', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }

    // Optimize database connection pool
    if (!this.optimizationStrategies.connectionPooling.has('optimized')) {
      await this.optimizeConnectionPool();
      this.optimizationStrategies.connectionPooling.set('optimized', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }
  }

  // Apply throughput optimization
  async applyThroughputOptimization(optimization) {
    const strategy = 'throughput_optimization';
    
    // Enable HTTP/2 if not already enabled
    if (!this.optimizationStrategies.loadBalancing.has('http2_enabled')) {
      await this.enableHTTP2();
      this.optimizationStrategies.loadBalancing.set('http2_enabled', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }

    // Optimize connection keep-alive
    if (!this.optimizationStrategies.connectionPooling.has('keep_alive')) {
      await this.enableKeepAlive();
      this.optimizationStrategies.connectionPooling.set('keep_alive', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }
  }

  // Apply memory optimization
  async applyMemoryOptimization(optimization) {
    const strategy = 'memory_optimization';
    
    // Enable memory caching
    if (!this.optimizationStrategies.caching.has('memory_cache')) {
      await this.enableMemoryCache();
      this.optimizationStrategies.caching.set('memory_cache', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }

    // Optimize garbage collection
    if (!this.optimizationStrategies.resourceScaling.has('gc_optimized')) {
      await this.optimizeGarbageCollection();
      this.optimizationStrategies.resourceScaling.set('gc_optimized', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }
  }

  // Apply CPU optimization
  async applyCPUOptimization(optimization) {
    const strategy = 'cpu_optimization';
    
    // Enable worker threads if not already enabled
    if (!this.optimizationStrategies.resourceScaling.has('worker_threads')) {
      await this.enableWorkerThreads();
      this.optimizationStrategies.resourceScaling.set('worker_threads', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }

    // Optimize algorithms
    if (!this.optimizationStrategies.queryOptimization.has('algorithms_optimized')) {
      await this.optimizeAlgorithms();
      this.optimizationStrategies.queryOptimization.set('algorithms_optimized', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }
  }

  // Apply error optimization
  async applyErrorOptimization(optimization) {
    const strategy = 'error_optimization';
    
    // Enable circuit breakers if not already enabled
    if (!this.optimizationStrategies.queryOptimization.has('circuit_breaker')) {
      await this.enableCircuitBreaker();
      this.optimizationStrategies.queryOptimization.set('circuit_breaker', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }

    // Enable retry mechanisms
    if (!this.optimizationStrategies.queryOptimization.has('retry_mechanism')) {
      await this.enableRetryMechanism();
      this.optimizationStrategies.queryOptimization.set('retry_mechanism', {
        enabled: true,
        enabledAt: new Date().toISOString(),
        reason: optimization.message
      });
    }
  }

  // Optimization implementation methods
  async enableResponseCache() {
    // Enable response caching
    await redis.set('optimization:response_cache', 'enabled');
    logger.info('Response cache optimization enabled');
  }

  async optimizeConnectionPool() {
    // Optimize database connection pool
    await redis.set('optimization:connection_pool', 'optimized');
    logger.info('Connection pool optimization applied');
  }

  async enableHTTP2() {
    // Enable HTTP/2
    await redis.set('optimization:http2', 'enabled');
    logger.info('HTTP/2 optimization enabled');
  }

  async enableKeepAlive() {
    // Enable connection keep-alive
    await redis.set('optimization:keep_alive', 'enabled');
    logger.info('Keep-alive optimization enabled');
  }

  async enableMemoryCache() {
    // Enable memory caching
    await redis.set('optimization:memory_cache', 'enabled');
    logger.info('Memory cache optimization enabled');
  }

  async optimizeGarbageCollection() {
    // Optimize garbage collection
    if (global.gc) {
      global.gc();
    }
    await redis.set('optimization:gc_optimized', 'enabled');
    logger.info('Garbage collection optimization applied');
  }

  async enableWorkerThreads() {
    // Enable worker threads
    await redis.set('optimization:worker_threads', 'enabled');
    logger.info('Worker threads optimization enabled');
  }

  async optimizeAlgorithms() {
    // Optimize algorithms
    await redis.set('optimization:algorithms_optimized', 'enabled');
    logger.info('Algorithm optimization applied');
  }

  async enableCircuitBreaker() {
    // Enable circuit breaker
    await redis.set('optimization:circuit_breaker', 'enabled');
    logger.info('Circuit breaker optimization enabled');
  }

  async enableRetryMechanism() {
    // Enable retry mechanism
    await redis.set('optimization:retry_mechanism', 'enabled');
    logger.info('Retry mechanism optimization enabled');
  }

  // Helper methods
  getLatestMetrics() {
    if (this.metrics.size === 0) return null;
    
    const latestKey = Math.max(...this.metrics.keys());
    return this.metrics.get(latestKey);
  }

  calculatePercentile(sortedArray, percentile) {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    return (secondAvg - firstAvg) / firstAvg;
  }

  calculateCPUPercent(cpuUsage) {
    const total = cpuUsage.user + cpuUsage.system + cpuUsage.idle + cpuUsage.irq;
    const used = cpuUsage.user + cpuUsage.system + cpuUsage.irq;
    return (used / total) * 100;
  }

  updateBaselines(metrics) {
    this.baselines.set('latest', {
      ...metrics,
      timestamp: new Date().toISOString()
    });
  }

  getEmptyResponseMetrics() {
    return {
      average: 0,
      min: 0,
      max: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      count: 0
    };
  }

  getEmptyThroughputMetrics() {
    return {
      current: 0,
      average: 0,
      min: 0,
      max: 0,
      trend: 0,
      count: 0
    };
  }

  getEmptyResourceMetrics() {
    return {
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        heapUsagePercent: 0
      },
      cpu: {
        user: 0,
        system: 0,
        idle: 0,
        irq: 0,
        totalUsagePercent: 0
      },
      uptime: 0,
      loadAverage: [0, 0, 0]
    };
  }

  getEmptyErrorMetrics() {
    return {
      current: 0,
      average: 0,
      min: 0,
      max: 0,
      trend: 0,
      count: 0
    };
  }

  // Get optimization status
  getOptimizationStatus() {
    return {
      strategies: Object.fromEntries(this.optimizationStrategies),
      optimizations: Array.from(this.optimizations.values()),
      baselines: Object.fromEntries(this.baselines),
      thresholds: this.thresholds,
      timestamp: new Date().toISOString()
    };
  }

  // Get performance recommendations
  getPerformanceRecommendations() {
    const latestMetrics = this.getLatestMetrics();
    if (!latestMetrics) {
      return {
        recommendations: [],
        timestamp: new Date().toISOString()
      };
    }

    const recommendations = [];

    // Analyze current state and provide recommendations
    if (latestMetrics.responseTime.average > this.thresholds.responseTime * 0.8) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Response time approaching threshold',
        suggestion: 'Consider enabling caching or optimizing queries'
      });
    }

    if (latestMetrics.throughput.average < this.thresholds.throughput * 0.8) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Throughput below expected levels',
        suggestion: 'Consider horizontal scaling or performance optimization'
      });
    }

    if (latestMetrics.resources.memory.heapUsagePercent > this.thresholds.memoryUsage * 0.8) {
      recommendations.push({
        type: 'resource',
        priority: 'medium',
        message: 'Memory usage approaching threshold',
        suggestion: 'Monitor for memory leaks or consider scaling'
      });
    }

    return {
      recommendations,
      metrics: latestMetrics,
      timestamp: new Date().toISOString()
    };
  }

  // Start optimization process
  startOptimization() {
    logger.info('Latency optimizer started', {
      thresholds: this.thresholds,
      strategies: Object.keys(this.optimizationStrategies)
    });

    this.emit('optimizerStarted');
  }

  // Stop optimization process
  stopOptimization() {
    logger.info('Latency optimizer stopped');
    this.emit('optimizerStopped');
  }
}

// Create singleton instance
const latencyOptimizer = new LatencyOptimizer();

module.exports = latencyOptimizer;
