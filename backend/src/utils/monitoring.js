const { logger } = require('./logger');

// Metrics collection
class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        error: 0,
        avgResponseTime: 0,
        slowRequests: 0
      },
      database: {
        connections: 0,
        queryTime: 0,
        slowQueries: 0
      },
      redis: {
        connections: 0,
        commands: 0,
        errors: 0
      },
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
      }
    };
    
    this.startCollection();
  }

  startCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
      this.collectDatabaseMetrics();
      this.collectRedisMetrics();
    }, 30000);
  }

  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Log memory usage warnings
    if (memUsage.heapUsed / memUsage.heapTotal > 0.9) {
      logger.warn('High memory usage detected', {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        percentage: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`
      });
    }
    
    // Log CPU usage warnings
    if (cpuUsage.user > 80) {
      logger.warn('High CPU usage detected', {
        user: `${Math.round(cpuUsage.user)}%`,
        system: `${Math.round(cpuUsage.system)}%`
      });
    }
  }

  collectDatabaseMetrics() {
    // This would integrate with your database driver
    // For now, log placeholder metrics
    this.metrics.database.connections = Math.floor(Math.random() * 10) + 1;
    this.metrics.database.queryTime = Math.floor(Math.random() * 100) + 50;
    
    if (this.metrics.database.queryTime > 500) {
      logger.warn('Slow database query detected', {
        queryTime: `${this.metrics.database.queryTime}ms`
      });
      this.metrics.database.slowQueries++;
    }
  }

  collectRedisMetrics() {
    // This would integrate with Redis client
    // For now, log placeholder metrics
    this.metrics.redis.connections = Math.floor(Math.random() * 5) + 1;
    this.metrics.redis.commands = Math.floor(Math.random() * 100) + 10;
  }

  recordRequest(success = true, responseTime = 0) {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.error++;
    }
    
    // Update average response time
    this.metrics.requests.avgResponseTime = 
      (this.metrics.requests.avgResponseTime + responseTime) / 2;
    
    // Track slow requests
    if (responseTime > 1000) {
      this.metrics.requests.slowRequests++;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString()
    };
  }

  resetMetrics() {
    this.metrics.requests = {
      total: 0,
      success: 0,
      error: 0,
      avgResponseTime: 0,
      slowRequests: 0
    };
  }
}

// Health check monitoring
class HealthMonitor {
  constructor() {
    this.services = new Map();
    this.lastHealthCheck = new Map();
  }

  addService(name, healthCheck) {
    this.services.set(name, {
      check: healthCheck,
      lastCheck: null,
      status: 'unknown'
    });
  }

  async checkAllServices() {
    const results = new Map();
    
    for (const [name, service] of this.services) {
      try {
        const startTime = Date.now();
        const isHealthy = await service.check();
        const responseTime = Date.now() - startTime;
        
        service.lastCheck = {
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime,
          timestamp: new Date().toISOString()
        };
        
        results.set(name, service.lastCheck);
        
        // Log service health changes
        if (service.lastCheck.status !== this.lastHealthCheck.get(name)?.status) {
          logger.info(`Service health changed: ${name}`, {
            from: this.lastHealthCheck.get(name)?.status || 'unknown',
            to: service.lastCheck.status,
            responseTime
          });
        }
        
        this.lastHealthCheck.set(name, service.lastCheck);
      } catch (error) {
        const errorResult = {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        };
        
        results.set(name, errorResult);
        logger.error(`Health check failed for ${name}`, {
          error: error.message
        });
      }
    }
    
    return {
      services: Object.fromEntries(results),
      overall: Array.from(results.values()).every(s => s.status === 'healthy'),
      timestamp: new Date().toISOString()
    };
  }
}

// Performance monitoring
class PerformanceMonitor {
  constructor() {
    this.slowQueries = [];
    this.errorPatterns = new Map();
  }

  recordSlowQuery(query, duration) {
    this.slowQueries.push({
      query,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries = this.slowQueries.slice(-100);
    }
  }

  recordErrorPattern(error, context) {
    const pattern = this.errorPatterns.get(error) || 0;
    this.errorPatterns.set(error, pattern + 1);
    
    logger.warn('Error pattern detected', {
      error,
      pattern: pattern + 1,
      context,
      timestamp: new Date().toISOString()
    });
  }

  getSlowQueries() {
    return this.slowQueries;
  }

  getErrorPatterns() {
    return Array.from(this.errorPatterns.entries()).map(([error, count]) => ({
      error,
      count,
      frequency: count
    }));
  }
}

// Alert system
class AlertManager {
  constructor() {
    this.alerts = [];
    this.thresholds = {
      errorRate: 0.1, // 10% error rate
      responseTime: 2000, // 2 seconds
      memoryUsage: 0.9, // 90% memory
      cpuUsage: 80, // 80% CPU
      diskSpace: 0.9 // 90% disk
    };
  }

  checkThresholds(metrics) {
    const alerts = [];
    
    // Check error rate
    const errorRate = metrics.requests.error / metrics.requests.total;
    if (errorRate > this.thresholds.errorRate) {
      alerts.push({
        type: 'error_rate',
        severity: 'warning',
        message: `High error rate: ${Math.round(errorRate * 100)}%`,
        value: errorRate,
        threshold: this.thresholds.errorRate
      });
    }
    
    // Check average response time
    if (metrics.requests.avgResponseTime > this.thresholds.responseTime) {
      alerts.push({
        type: 'response_time',
        severity: 'warning',
        message: `Slow average response time: ${metrics.requests.avgResponseTime}ms`,
        value: metrics.requests.avgResponseTime,
        threshold: this.thresholds.responseTime
      });
    }
    
    // Check memory usage
    if (metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal > this.thresholds.memoryUsage) {
      alerts.push({
        type: 'memory_usage',
        severity: 'critical',
        message: `High memory usage: ${Math.round((metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal) * 100)}%`,
        value: metrics.system.memoryUsage,
        threshold: this.thresholds.memoryUsage
      });
    }
    
    // Check CPU usage
    if (metrics.system.cpuUsage.user > this.thresholds.cpuUsage) {
      alerts.push({
        type: 'cpu_usage',
        severity: 'warning',
        message: `High CPU usage: ${Math.round(metrics.system.cpuUsage.user)}%`,
        value: metrics.system.cpuUsage.user,
        threshold: this.thresholds.cpuUsage
      });
    }
    
    if (alerts.length > 0) {
      this.alerts.push(...alerts);
      logger.warn('System alerts triggered', { alerts: alerts.slice(-10) });
    }
  }

  getRecentAlerts(limit = 10) {
    return this.alerts.slice(-limit);
  }
}

// Create instances
const metricsCollector = new MetricsCollector();
const healthMonitor = new HealthMonitor();
const performanceMonitor = new PerformanceMonitor();
const alertManager = new AlertManager();

// Add default health checks
healthMonitor.addService('database', async () => {
  // Check database connectivity
  try {
    // This would be your actual database health check
    return true; // Placeholder
  } catch (error) {
    return false;
  }
});

healthMonitor.addService('redis', async () => {
  // Check Redis connectivity
  try {
    // This would be your actual Redis health check
    return true; // Placeholder
  } catch (error) {
    return false;
  }
});

healthMonitor.addService('api', async () => {
  // Check API responsiveness
  try {
    const response = await fetch('http://localhost:5000/api/health');
    return response.ok;
  } catch (error) {
    return false;
  }
});

module.exports = {
  metricsCollector,
  healthMonitor,
  performanceMonitor,
  alertManager
};
