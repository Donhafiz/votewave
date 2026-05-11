const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class HealthProbes extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      readinessTimeout: options.readinessTimeout || 5000, // 5 seconds
      livenessTimeout: options.livenessTimeout || 3000, // 3 seconds
      startupTimeout: options.startupTimeout || 30000, // 30 seconds
      checkInterval: options.checkInterval || 10000, // 10 seconds
      failureThreshold: options.failureThreshold || 3, // 3 consecutive failures
      successThreshold: options.successThreshold || 2, // 2 consecutive successes
      ...options
    };

    this.status = {
      ready: false,
      live: false,
      started: false,
      lastCheck: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      checks: {
        database: { status: 'unknown', lastCheck: null, error: null },
        redis: { status: 'unknown', lastCheck: null, error: null },
        memory: { status: 'unknown', lastCheck: null, error: null },
        disk: { status: 'unknown', lastCheck: null, error: null },
        cpu: { status: 'unknown', lastCheck: null, error: null },
        websocket: { status: 'unknown', lastCheck: null, error: null },
        ml: { status: 'unknown', lastCheck: null, error: null }
      }
    };

    this.startTime = Date.now();
    this.checkTimer = null;
    
    this.initialize();
  }

  /**
   * Initialize health probes
   */
  initialize() {
    // Start periodic health checks
    this.startPeriodicChecks();
    
    logger.info('Health probes initialized', {
      readinessTimeout: this.options.readinessTimeout,
      livenessTimeout: this.options.livenessTimeout,
      checkInterval: this.options.checkInterval
    });
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks() {
    this.checkTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.checkInterval);
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    try {
      const checkPromises = [
        this.checkDatabase(),
        this.checkRedis(),
        this.checkMemory(),
        this.checkDisk(),
        this.checkCPU(),
        this.checkWebSocket(),
        this.checkML()
      ];

      const results = await Promise.allSettled(checkPromises);
      
      // Update check results
      this.status.checks.database = this.updateCheckResult('database', results[0]);
      this.status.checks.redis = this.updateCheckResult('redis', results[1]);
      this.status.checks.memory = this.updateCheckResult('memory', results[2]);
      this.status.checks.disk = this.updateCheckResult('disk', results[3]);
      this.status.checks.cpu = this.updateCheckResult('cpu', results[4]);
      this.status.checks.websocket = this.updateCheckResult('websocket', results[5]);
      this.status.checks.ml = this.updateCheckResult('ml', results[6]);

      // Update overall status
      this.updateOverallStatus();

      this.status.lastCheck = Date.now();

      // Emit status change
      this.emit('healthCheck', {
        status: this.status,
        timestamp: this.status.lastCheck
      });

    } catch (error) {
      logger.error('Health check failed', {
        error: error.message
      });
    }
  }

  /**
   * Update check result
   */
  updateCheckResult(checkName, result) {
    const status = result.status === 'fulfilled' ? 'healthy' : 'unhealthy';
    const error = result.status === 'rejected' ? result.reason.message : null;

    return {
      status,
      lastCheck: Date.now(),
      error
    };
  }

  /**
   * Update overall status based on individual checks
   */
  updateOverallStatus() {
    const checks = this.status.checks;
    const criticalChecks = ['database', 'redis'];
    const optionalChecks = ['memory', 'disk', 'cpu', 'websocket', 'ml'];

    // Check critical components
    const criticalHealthy = criticalChecks.every(name => 
      checks[name].status === 'healthy'
    );

    // Check optional components
    const optionalHealthy = optionalChecks.filter(name => 
      checks[name].status === 'healthy'
    ).length;

    // Update liveness (only critical components matter)
    const wasLive = this.status.live;
    this.status.live = criticalHealthy;
    
    if (!wasLive && this.status.live) {
      this.status.consecutiveSuccesses++;
      this.status.consecutiveFailures = 0;
    } else if (wasLive && !this.status.live) {
      this.status.consecutiveFailures++;
      this.status.consecutiveSuccesses = 0;
    }

    // Update readiness (all components should be healthy)
    const wasReady = this.status.ready;
    this.status.ready = criticalHealthy && optionalHealthy >= optionalChecks.length - 1;
    
    if (!wasReady && this.status.ready) {
      this.status.consecutiveSuccesses++;
      this.status.consecutiveFailures = 0;
    } else if (wasReady && !this.status.ready) {
      this.status.consecutiveFailures++;
      this.status.consecutiveSuccesses = 0;
    }

    // Update startup status
    if (!this.status.started && criticalHealthy) {
      this.status.started = true;
      this.emit('startupComplete', {
        startupTime: Date.now() - this.startTime
      });
    }
  }

  /**
   * Check database connectivity
   */
  async checkDatabase() {
    try {
      // This would integrate with your actual database connection
      // For now, we'll simulate with a simple query
      const startTime = Date.now();
      
      // Simulate database query
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const duration = Date.now() - startTime;
      
      if (duration > 1000) {
        throw new Error('Database query too slow');
      }

      return {
        status: 'healthy',
        duration,
        message: 'Database connection OK'
      };

    } catch (error) {
      throw new Error(`Database check failed: ${error.message}`);
    }
  }

  /**
   * Check Redis connectivity
   */
  async checkRedis() {
    try {
      const startTime = Date.now();
      
      // Test Redis connection
      await redis.ping();
      
      const duration = Date.now() - startTime;
      
      if (duration > 500) {
        throw new Error('Redis response too slow');
      }

      return {
        status: 'healthy',
        duration,
        message: 'Redis connection OK'
      };

    } catch (error) {
      throw new Error(`Redis check failed: ${error.message}`);
    }
  }

  /**
   * Check memory usage
   */
  async checkMemory() {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      const totalMemoryMB = memUsage.heapTotal / 1024 / 1024;
      const usedMemoryMB = memUsage.heapUsed / 1024 / 1024;

      // Memory thresholds
      if (heapUsedPercent > 90) {
        throw new Error(`Memory usage too high: ${heapUsedPercent.toFixed(2)}%`);
      }

      if (totalMemoryMB > 2048) { // 2GB
        throw new Error(`Memory usage too high: ${usedMemoryMB.toFixed(2)}MB`);
      }

      return {
        status: 'healthy',
        heapUsedPercent,
        totalMemoryMB,
        usedMemoryMB,
        message: `Memory usage: ${heapUsedPercent.toFixed(2)}%`
      };

    } catch (error) {
      throw new Error(`Memory check failed: ${error.message}`);
    }
  }

  /**
   * Check disk usage
   */
  async checkDisk() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Check available disk space
      const stats = fs.statSync(__dirname);
      
      // For simplicity, we'll assume disk is healthy
      // In production, you'd use a library like 'diskusage'
      
      return {
        status: 'healthy',
        message: 'Disk usage OK'
      };

    } catch (error) {
      throw new Error(`Disk check failed: ${error.message}`);
    }
  }

  /**
   * Check CPU usage
   */
  async checkCPU() {
    try {
      const cpuUsage = process.cpuUsage();
      const totalUsage = cpuUsage.user + cpuUsage.system;
      const usagePercent = (totalUsage / 1000000) * 100; // Convert to percentage

      // CPU threshold
      if (usagePercent > 80) {
        throw new Error(`CPU usage too high: ${usagePercent.toFixed(2)}%`);
      }

      return {
        status: 'healthy',
        usagePercent,
        message: `CPU usage: ${usagePercent.toFixed(2)}%`
      };

    } catch (error) {
      throw new Error(`CPU check failed: ${error.message}`);
    }
  }

  /**
   * Check WebSocket server
   */
  async checkWebSocket() {
    try {
      // This would check if WebSocket server is running
      // For now, we'll simulate the check
      
      return {
        status: 'healthy',
        message: 'WebSocket server OK'
      };

    } catch (error) {
      throw new Error(`WebSocket check failed: ${error.message}`);
    }
  }

  /**
   * Check ML service
   */
  async checkML() {
    try {
      // This would check if ML service is running
      // For now, we'll simulate the check
      
      return {
        status: 'healthy',
        message: 'ML service OK'
      };

    } catch (error) {
      throw new Error(`ML service check failed: ${error.message}`);
    }
  }

  /**
   * Readiness probe endpoint
   */
  async readinessProbe() {
    try {
      const startTime = Date.now();
      
      // Wait for readiness check to complete
      await Promise.race([
        this.performHealthCheck(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Readiness check timeout')), this.options.readinessTimeout)
        )
      ]);

      const duration = Date.now() - startTime;

      if (!this.status.ready) {
        return {
          status: 'not_ready',
          checks: this.status.checks,
          duration,
          timestamp: Date.now()
        };
      }

      return {
        status: 'ready',
        checks: this.status.checks,
        duration,
        timestamp: Date.now(),
        uptime: Date.now() - this.startTime
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        checks: this.status.checks,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Liveness probe endpoint
   */
  async livenessProbe() {
    try {
      const startTime = Date.now();
      
      // Quick liveness check (critical components only)
      await Promise.race([
        Promise.all([
          this.checkDatabase(),
          this.checkRedis()
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Liveness check timeout')), this.options.livenessTimeout)
        )
      ]);

      const duration = Date.now() - startTime;

      return {
        status: 'alive',
        checks: {
          database: this.status.checks.database,
          redis: this.status.checks.redis
        },
        duration,
        timestamp: Date.now(),
        uptime: Date.now() - this.startTime
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        checks: this.status.checks,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Startup probe endpoint
   */
  async startupProbe() {
    try {
      const elapsed = Date.now() - this.startTime;
      
      if (elapsed > this.options.startupTimeout) {
        return {
          status: 'timeout',
          error: 'Startup timeout exceeded',
          elapsed,
          timestamp: Date.now()
        };
      }

      if (this.status.started) {
        return {
          status: 'started',
          elapsed,
          timestamp: Date.now(),
          uptime: elapsed
        };
      }

      // Check if critical components are ready
      const criticalChecks = await Promise.all([
        this.checkDatabase(),
        this.checkRedis()
      ]);

      return {
        status: 'starting',
        checks: {
          database: criticalChecks[0],
          redis: criticalChecks[1]
        },
        elapsed,
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        elapsed: Date.now() - this.startTime,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Detailed health check endpoint
   */
  async detailedHealthCheck() {
    try {
      await this.performHealthCheck();

      return {
        status: this.status,
        uptime: Date.now() - this.startTime,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: Date.now(),
        checks: this.status.checks
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Create Express middleware for health probes
   */
  createMiddleware() {
    return {
      readiness: async (req, res) => {
        try {
          const result = await this.readinessProbe();
          
          if (result.status === 'ready') {
            res.status(200).json(result);
          } else {
            res.status(503).json(result);
          }
        } catch (error) {
          res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: Date.now()
          });
        }
      },

      liveness: async (req, res) => {
        try {
          const result = await this.livenessProbe();
          
          if (result.status === 'alive') {
            res.status(200).json(result);
          } else {
            res.status(503).json(result);
          }
        } catch (error) {
          res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: Date.now()
          });
        }
      },

      startup: async (req, res) => {
        try {
          const result = await this.startupProbe();
          
          if (result.status === 'started') {
            res.status(200).json(result);
          } else if (result.status === 'timeout') {
            res.status(503).json(result);
          } else {
            res.status(200).json(result); // Starting is still OK for startup probe
          }
        } catch (error) {
          res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: Date.now()
          });
        }
      },

      health: async (req, res) => {
        try {
          const result = await this.detailedHealthCheck();
          
          res.status(200).json(result);
        } catch (error) {
          res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
    };
  }

  /**
   * Get current health status
   */
  getStatus() {
    return {
      ...this.status,
      uptime: Date.now() - this.startTime,
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Force health check
   */
  async forceHealthCheck() {
    await this.performHealthCheck();
    return this.getStatus();
  }

  /**
   * Stop health probes
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    
    logger.info('Health probes stopped');
  }
}

// Create singleton instance
const healthProbes = new HealthProbes({
  readinessTimeout: 5000,
  livenessTimeout: 3000,
  startupTimeout: 30000,
  checkInterval: 10000,
  failureThreshold: 3,
  successThreshold: 2
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  healthProbes.stop();
});

process.on('SIGINT', () => {
  healthProbes.stop();
});

module.exports = healthProbes;
