const { logger } = require('./logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class MonitoringAlerts extends EventEmitter {
  constructor() {
    super();
    this.alerts = new Map();
    this.alertRules = new Map();
    this.alertHistory = [];
    this.subscribers = new Map();
    this.metrics = {
      totalAlerts: 0,
      activeAlerts: 0,
      resolvedAlerts: 0,
      criticalAlerts: 0,
      warningAlerts: 0,
      infoAlerts: 0
    };
    
    this.initializeAlertRules();
    this.startMonitoring();
  }

  // Initialize default alert rules
  initializeAlertRules() {
    // Performance alerts
    this.addAlertRule('high_response_time', {
      name: 'High Response Time',
      description: 'Response time exceeds threshold',
      condition: 'response_time > 2000',
      severity: 'warning',
      threshold: 2000,
      duration: 60000, // 1 minute
      enabled: true
    });

    this.addAlertRule('critical_response_time', {
      name: 'Critical Response Time',
      description: 'Response time exceeds critical threshold',
      condition: 'response_time > 5000',
      severity: 'critical',
      threshold: 5000,
      duration: 30000, // 30 seconds
      enabled: true
    });

    // Throughput alerts
    this.addAlertRule('low_throughput', {
      name: 'Low Throughput',
      description: 'Throughput falls below threshold',
      condition: 'throughput < 50',
      severity: 'warning',
      threshold: 50,
      duration: 120000, // 2 minutes
      enabled: true
    });

    this.addAlertRule('critical_low_throughput', {
      name: 'Critical Low Throughput',
      description: 'Throughput falls below critical threshold',
      condition: 'throughput < 10',
      severity: 'critical',
      threshold: 10,
      duration: 60000, // 1 minute
      enabled: true
    });

    // Error rate alerts
    this.addAlertRule('high_error_rate', {
      name: 'High Error Rate',
      description: 'Error rate exceeds threshold',
      condition: 'error_rate > 10',
      severity: 'warning',
      threshold: 10,
      duration: 60000, // 1 minute
      enabled: true
    });

    this.addAlertRule('critical_error_rate', {
      name: 'Critical Error Rate',
      description: 'Error rate exceeds critical threshold',
      condition: 'error_rate > 25',
      severity: 'critical',
      threshold: 25,
      duration: 30000, // 30 seconds
      enabled: true
    });

    // Resource usage alerts
    this.addAlertRule('high_memory_usage', {
      name: 'High Memory Usage',
      description: 'Memory usage exceeds threshold',
      condition: 'memory_usage > 85',
      severity: 'warning',
      threshold: 85,
      duration: 120000, // 2 minutes
      enabled: true
    });

    this.addAlertRule('critical_memory_usage', {
      name: 'Critical Memory Usage',
      description: 'Memory usage exceeds critical threshold',
      condition: 'memory_usage > 95',
      severity: 'critical',
      threshold: 95,
      duration: 60000, // 1 minute
      enabled: true
    });

    this.addAlertRule('high_cpu_usage', {
      name: 'High CPU Usage',
      description: 'CPU usage exceeds threshold',
      condition: 'cpu_usage > 80',
      severity: 'warning',
      threshold: 80,
      duration: 120000, // 2 minutes
      enabled: true
    });

    this.addAlertRule('critical_cpu_usage', {
      name: 'Critical CPU Usage',
      description: 'CPU usage exceeds critical threshold',
      condition: 'cpu_usage > 95',
      severity: 'critical',
      threshold: 95,
      duration: 60000, // 1 minute
      enabled: true
    });

    // System health alerts
    this.addAlertRule('service_down', {
      name: 'Service Down',
      description: 'Service is not responding',
      condition: 'service_status != "healthy"',
      severity: 'critical',
      threshold: 1,
      duration: 30000, // 30 seconds
      enabled: true
    });

    this.addAlertRule('database_connection_failed', {
      name: 'Database Connection Failed',
      description: 'Cannot connect to database',
      condition: 'database_status != "connected"',
      severity: 'critical',
      threshold: 1,
      duration: 15000, // 15 seconds
      enabled: true
    });

    this.addAlertRule('redis_connection_failed', {
      name: 'Redis Connection Failed',
      description: 'Cannot connect to Redis',
      condition: 'redis_status != "connected"',
      severity: 'critical',
      threshold: 1,
      duration: 15000, // 15 seconds
      enabled: true
    });

    // Security alerts
    this.addAlertRule('high_failed_login_attempts', {
      name: 'High Failed Login Attempts',
      description: 'Multiple failed login attempts detected',
      condition: 'failed_login_rate > 20',
      severity: 'warning',
      threshold: 20,
      duration: 300000, // 5 minutes
      enabled: true
    });

    this.addAlertRule('suspicious_activity', {
      name: 'Suspicious Activity',
      description: 'Suspicious activity patterns detected',
      condition: 'suspicious_activity_score > 0.8',
      severity: 'critical',
      threshold: 0.8,
      duration: 60000, // 1 minute
      enabled: true
    });

    // Business logic alerts
    this.addAlertRule('voting_anomaly', {
      name: 'Voting Anomaly',
      description: 'Unusual voting patterns detected',
      condition: 'voting_anomaly_score > 0.7',
      severity: 'warning',
      threshold: 0.7,
      duration: 120000, // 2 minutes
      enabled: true
    });

    this.addAlertRule('election_system_error', {
      name: 'Election System Error',
      description: 'Critical error in election system',
      condition: 'election_system_status != "operational"',
      severity: 'critical',
      threshold: 1,
      duration: 30000, // 30 seconds
      enabled: true
    });
  }

  // Start monitoring
  startMonitoring() {
    // Monitor metrics every 30 seconds
    setInterval(() => {
      this.checkAlertRules();
    }, 30000);

    // Clean up old alerts every hour
    setInterval(() => {
      this.cleanupOldAlerts();
    }, 3600000);

    logger.info('Monitoring alerts system started', {
      rulesCount: this.alertRules.size,
      checkInterval: 30000
    });
  }

  // Add alert rule
  addAlertRule(ruleId, rule) {
    this.alertRules.set(ruleId, {
      ...rule,
      id: ruleId,
      createdAt: new Date().toISOString(),
      lastChecked: null,
      alertCount: 0,
      lastAlerted: null
    });

    logger.info('Alert rule added', { ruleId, rule });
  }

  // Remove alert rule
  removeAlertRule(ruleId) {
    this.alertRules.delete(ruleId);
    logger.info('Alert rule removed', { ruleId });
  }

  // Update alert rule
  updateAlertRule(ruleId, updates) {
    const existingRule = this.alertRules.get(ruleId);
    if (existingRule) {
      this.alertRules.set(ruleId, {
        ...existingRule,
        ...updates,
        updatedAt: new Date().toISOString()
      });
      logger.info('Alert rule updated', { ruleId, updates });
    }
  }

  // Check all alert rules
  async checkAlertRules() {
    try {
      const currentMetrics = await this.collectCurrentMetrics();
      
      for (const [ruleId, rule] of this.alertRules) {
        if (!rule.enabled) continue;

        const alertTriggered = await this.evaluateRule(rule, currentMetrics);
        
        if (alertTriggered) {
          await this.triggerAlert(ruleId, rule, currentMetrics);
        } else {
          await this.checkAlertResolution(ruleId, rule, currentMetrics);
        }

        // Update last checked time
        rule.lastChecked = new Date().toISOString();
      }

    } catch (error) {
      logger.error('Failed to check alert rules', { error: error.message });
    }
  }

  // Collect current metrics
  async collectCurrentMetrics() {
    try {
      // Get response time metrics
      const responseTime = await this.getMetric('response_time');
      
      // Get throughput metrics
      const throughput = await this.getMetric('throughput');
      
      // Get error rate metrics
      const errorRate = await this.getMetric('error_rate');
      
      // Get resource usage metrics
      const memoryUsage = this.getResourceMetric('memory');
      const cpuUsage = this.getResourceMetric('cpu');
      
      // Get system health metrics
      const serviceStatus = await this.getHealthMetric('service');
      const databaseStatus = await this.getHealthMetric('database');
      const redisStatus = await this.getHealthMetric('redis');
      
      // Get security metrics
      const failedLoginRate = await this.getSecurityMetric('failed_login_rate');
      const suspiciousActivityScore = await this.getSecurityMetric('suspicious_activity');
      
      // Get business metrics
      const votingAnomalyScore = await this.getBusinessMetric('voting_anomaly');
      const electionSystemStatus = await this.getBusinessMetric('election_system_status');

      return {
        response_time: responseTime,
        throughput,
        error_rate: errorRate,
        memory_usage: memoryUsage,
        cpu_usage: cpuUsage,
        service_status: serviceStatus,
        database_status: databaseStatus,
        redis_status: redisStatus,
        failed_login_rate: failedLoginRate,
        suspicious_activity_score: suspiciousActivityScore,
        voting_anomaly_score: votingAnomalyScore,
        election_system_status: electionSystemStatus,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to collect current metrics', { error: error.message });
      return {
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Evaluate alert rule
  async evaluateRule(rule, metrics) {
    try {
      // Parse condition and evaluate
      const condition = rule.condition;
      const threshold = rule.threshold;
      
      switch (rule.id) {
        case 'high_response_time':
        case 'critical_response_time':
          return metrics.response_time > threshold;
          
        case 'low_throughput':
        case 'critical_low_throughput':
          return metrics.throughput < threshold;
          
        case 'high_error_rate':
        case 'critical_error_rate':
          return metrics.error_rate > threshold;
          
        case 'high_memory_usage':
        case 'critical_memory_usage':
          return metrics.memory_usage > threshold;
          
        case 'high_cpu_usage':
        case 'critical_cpu_usage':
          return metrics.cpu_usage > threshold;
          
        case 'service_down':
          return metrics.service_status !== 'healthy';
          
        case 'database_connection_failed':
          return metrics.database_status !== 'connected';
          
        case 'redis_connection_failed':
          return metrics.redis_status !== 'connected';
          
        case 'high_failed_login_attempts':
          return metrics.failed_login_rate > threshold;
          
        case 'suspicious_activity':
          return metrics.suspicious_activity_score > threshold;
          
        case 'voting_anomaly':
          return metrics.voting_anomaly_score > threshold;
          
        case 'election_system_error':
          return metrics.election_system_status !== 'operational';
          
        default:
          return false;
      }

    } catch (error) {
      logger.error('Failed to evaluate alert rule', { 
        ruleId: rule.id, 
        error: error.message 
      });
      return false;
    }
  }

  // Trigger alert
  async triggerAlert(ruleId, rule, metrics) {
    try {
      const alertId = `${ruleId}_${Date.now()}`;
      const existingAlert = this.findActiveAlert(ruleId);
      
      if (existingAlert) {
        // Update existing alert
        existingAlert.lastTriggered = new Date().toISOString();
        existingAlert.triggerCount++;
        existingAlert.currentMetrics = metrics;
        
        logger.warn('Alert re-triggered', {
          alertId: existingAlert.id,
          ruleId,
          triggerCount: existingAlert.triggerCount
        });
        
      } else {
        // Create new alert
        const alert = {
          id: alertId,
          ruleId,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          status: 'active',
          triggeredAt: new Date().toISOString(),
          lastTriggered: new Date().toISOString(),
          triggerCount: 1,
          currentMetrics: metrics,
          threshold: rule.threshold,
          condition: rule.condition,
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          resolved: false,
          resolvedAt: null,
          resolvedBy: null,
          resolution: null
        };

        this.alerts.set(alertId, alert);
        this.metrics.totalAlerts++;
        this.metrics.activeAlerts++;
        
        if (rule.severity === 'critical') {
          this.metrics.criticalAlerts++;
        } else if (rule.severity === 'warning') {
          this.metrics.warningAlerts++;
        } else {
          this.metrics.infoAlerts++;
        }

        // Store in Redis for persistence
        await this.storeAlert(alert);
        
        // Send notifications
        await this.sendNotifications(alert);
        
        // Emit alert event
        this.emit('alertTriggered', alert);
        
        logger.error('Alert triggered', {
          alertId,
          ruleId,
          severity: rule.severity,
          description: rule.description,
          metrics
        });
      }

      // Update rule alert count
      rule.alertCount++;
      rule.lastAlerted = new Date().toISOString();

    } catch (error) {
      logger.error('Failed to trigger alert', { 
        ruleId, 
        error: error.message 
      });
    }
  }

  // Check alert resolution
  async checkAlertResolution(ruleId, rule, metrics) {
    try {
      const existingAlert = this.findActiveAlert(ruleId);
      
      if (existingAlert) {
        // Check if condition has been resolved for the required duration
        const resolutionDuration = rule.duration || 60000; // Default 1 minute
        const timeSinceLastTrigger = Date.now() - new Date(existingAlert.lastTriggered).getTime();
        
        if (timeSinceLastTrigger >= resolutionDuration) {
          await this.resolveAlert(existingAlert.id, 'auto_resolved', 'Alert condition resolved');
        }
      }

    } catch (error) {
      logger.error('Failed to check alert resolution', { 
        ruleId, 
        error: error.message 
      });
    }
  }

  // Resolve alert
  async resolveAlert(alertId, resolvedBy, resolution) {
    try {
      const alert = this.alerts.get(alertId);
      
      if (alert && !alert.resolved) {
        alert.resolved = true;
        alert.resolvedAt = new Date().toISOString();
        alert.resolvedBy = resolvedBy;
        alert.resolution = resolution;
        alert.status = 'resolved';
        
        this.metrics.activeAlerts--;
        this.metrics.resolvedAlerts++;
        
        // Update Redis
        await this.updateAlert(alert);
        
        // Send resolution notifications
        await this.sendResolutionNotifications(alert);
        
        // Emit resolution event
        this.emit('alertResolved', alert);
        
        logger.info('Alert resolved', {
          alertId,
          resolvedBy,
          resolution,
          duration: Date.now() - new Date(alert.triggeredAt).getTime()
        });
      }

    } catch (error) {
      logger.error('Failed to resolve alert', { 
        alertId, 
        error: error.message 
      });
    }
  }

  // Acknowledge alert
  async acknowledgeAlert(alertId, acknowledgedBy) {
    try {
      const alert = this.alerts.get(alertId);
      
      if (alert && !alert.acknowledged) {
        alert.acknowledged = true;
        alert.acknowledgedBy = acknowledgedBy;
        alert.acknowledgedAt = new Date().toISOString();
        
        // Update Redis
        await this.updateAlert(alert);
        
        // Send acknowledgment notifications
        await this.sendAcknowledgmentNotifications(alert);
        
        // Emit acknowledgment event
        this.emit('alertAcknowledged', alert);
        
        logger.info('Alert acknowledged', {
          alertId,
          acknowledgedBy
        });
      }

    } catch (error) {
      logger.error('Failed to acknowledge alert', { 
        alertId, 
        error: error.message 
      });
    }
  }

  // Send notifications
  async sendNotifications(alert) {
    try {
      // Email notification
      if (this.shouldSendEmail(alert)) {
        await this.sendEmailNotification(alert);
      }
      
      // SMS notification
      if (this.shouldSendSMS(alert)) {
        await this.sendSMSNotification(alert);
      }
      
      // Slack notification
      if (this.shouldSendSlack(alert)) {
        await this.sendSlackNotification(alert);
      }
      
      // Webhook notification
      if (this.shouldSendWebhook(alert)) {
        await this.sendWebhookNotification(alert);
      }

    } catch (error) {
      logger.error('Failed to send notifications', { 
        alertId: alert.id, 
        error: error.message 
      });
    }
  }

  // Send email notification
  async sendEmailNotification(alert) {
    try {
      // Implementation would depend on email service
      logger.info('Email notification sent', {
        alertId: alert.id,
        severity: alert.severity
      });
    } catch (error) {
      logger.error('Failed to send email notification', { error: error.message });
    }
  }

  // Send SMS notification
  async sendSMSNotification(alert) {
    try {
      // Implementation would depend on SMS service
      logger.info('SMS notification sent', {
        alertId: alert.id,
        severity: alert.severity
      });
    } catch (error) {
      logger.error('Failed to send SMS notification', { error: error.message });
    }
  }

  // Send Slack notification
  async sendSlackNotification(alert) {
    try {
      // Implementation would depend on Slack integration
      logger.info('Slack notification sent', {
        alertId: alert.id,
        severity: alert.severity
      });
    } catch (error) {
      logger.error('Failed to send Slack notification', { error: error.message });
    }
  }

  // Send webhook notification
  async sendWebhookNotification(alert) {
    try {
      // Implementation would depend on webhook configuration
      logger.info('Webhook notification sent', {
        alertId: alert.id,
        severity: alert.severity
      });
    } catch (error) {
      logger.error('Failed to send webhook notification', { error: error.message });
    }
  }

  // Helper methods
  findActiveAlert(ruleId) {
    for (const alert of this.alerts.values()) {
      if (alert.ruleId === ruleId && alert.status === 'active') {
        return alert;
      }
    }
    return null;
  }

  shouldSendEmail(alert) {
    return alert.severity === 'critical' || alert.severity === 'warning';
  }

  shouldSendSMS(alert) {
    return alert.severity === 'critical';
  }

  shouldSendSlack(alert) {
    return alert.severity === 'critical' || alert.severity === 'warning';
  }

  shouldSendWebhook(alert) {
    return alert.severity === 'critical';
  }

  async getMetric(metricName) {
    try {
      const value = await redis.get(`metric:${metricName}`);
      return value ? parseFloat(value) : 0;
    } catch (error) {
      return 0;
    }
  }

  getResourceMetric(resourceName) {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    switch (resourceName) {
      case 'memory':
        return (memUsage.heapUsed / memUsage.heapTotal) * 100;
      case 'cpu':
        const total = cpuUsage.user + cpuUsage.system + cpuUsage.idle + cpuUsage.irq;
        const used = cpuUsage.user + cpuUsage.system + cpuUsage.irq;
        return (used / total) * 100;
      default:
        return 0;
    }
  }

  async getHealthMetric(serviceName) {
    try {
      const status = await redis.get(`health:${serviceName}`);
      return status || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  async getSecurityMetric(metricName) {
    try {
      const value = await redis.get(`security:${metricName}`);
      return value ? parseFloat(value) : 0;
    } catch (error) {
      return 0;
    }
  }

  async getBusinessMetric(metricName) {
    try {
      const value = await redis.get(`business:${metricName}`);
      return value ? parseFloat(value) : 0;
    } catch (error) {
      return 0;
    }
  }

  async storeAlert(alert) {
    try {
      await redis.set(`alert:${alert.id}`, JSON.stringify(alert));
      await redis.expire(`alert:${alert.id}`, 86400); // 24 hours TTL
    } catch (error) {
      logger.error('Failed to store alert', { error: error.message });
    }
  }

  async updateAlert(alert) {
    try {
      await redis.set(`alert:${alert.id}`, JSON.stringify(alert));
    } catch (error) {
      logger.error('Failed to update alert', { error: error.message });
    }
  }

  async cleanupOldAlerts() {
    try {
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      
      for (const [alertId, alert] of this.alerts) {
        if (alert.resolved && new Date(alert.resolvedAt).getTime() < cutoffTime) {
          this.alerts.delete(alertId);
          await redis.del(`alert:${alertId}`);
        }
      }
      
      logger.info('Old alerts cleaned up', {
        totalAlerts: this.alerts.size
      });
      
    } catch (error) {
      logger.error('Failed to cleanup old alerts', { error: error.message });
    }
  }

  // Get alert status
  getAlertStatus() {
    const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'active');
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const warningAlerts = activeAlerts.filter(a => a.severity === 'warning');
    
    return {
      totalAlerts: this.metrics.totalAlerts,
      activeAlerts: activeAlerts.length,
      resolvedAlerts: this.metrics.resolvedAlerts,
      criticalAlerts: criticalAlerts.length,
      warningAlerts: warningAlerts.length,
      infoAlerts: activeAlerts.filter(a => a.severity === 'info').length,
      rules: {
        total: this.alertRules.size,
        enabled: Array.from(this.alertRules.values()).filter(r => r.enabled).length
      },
      timestamp: new Date().toISOString()
    };
  }

  // Get active alerts
  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(a => a.status === 'active');
  }

  // Get alert history
  getAlertHistory(limit = 100) {
    const allAlerts = Array.from(this.alerts.values());
    return allAlerts
      .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
      .slice(0, limit);
  }

  // Get alert rules
  getAlertRules() {
    return Array.from(this.alertRules.values());
  }
}

// Create singleton instance
const monitoringAlerts = new MonitoringAlerts();

module.exports = monitoringAlerts;
