/**
 * Replication Lag Manager for VoteWave Distributed Systems
 * Monitors and manages replication lag across multi-region deployment
 */

const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class ReplicationLagManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      lagPrefix: 'replication_lag:',
      metricsPrefix: 'lag_metrics:',
      alertPrefix: 'lag_alerts:',
      monitoringInterval: 5000, // 5 seconds
      maxAcceptableLag: 5000, // 5 seconds
      criticalLagThreshold: 10000, // 10 seconds
      alertCooldown: 60000, // 1 minute between alerts
      historyRetention: 86400, // 24 hours
      smoothingWindow: 5, // Average over last 5 measurements
      ...options
    };

    this.replicationStreams = new Map();
    this.lagHistory = new Map();
    this.activeAlerts = new Map();
    this.lastAlertTimes = new Map();
    
    this.initializeReplicationStreams();
    this.startLagMonitoring();
  }

  /**
   * Initialize replication stream monitoring
   */
  initializeReplicationStreams() {
    // Define replication streams between regions
    const replicationPairs = [
      { from: 'us-east-1', to: 'us-west-2' },
      { from: 'us-east-1', to: 'eu-west-1' },
      { from: 'us-east-1', to: 'ap-southeast-1' },
      { from: 'us-west-2', to: 'us-east-1' },
      { from: 'us-west-2', to: 'eu-west-1' },
      { from: 'us-west-2', to: 'ap-southeast-1' },
      { from: 'eu-west-1', to: 'us-east-1' },
      { from: 'eu-west-1', to: 'us-west-2' },
      { from: 'eu-west-1', to: 'ap-southeast-1' },
      { from: 'ap-southeast-1', to: 'us-east-1' },
      { from: 'ap-southeast-1', to: 'us-west-2' },
      { from: 'ap-southeast-1', to: 'eu-west-1' }
    ];

    for (const pair of replicationPairs) {
      const streamKey = `replication:${pair.from}:${pair.to}`;
      this.replicationStreams.set(streamKey, {
        from: pair.from,
        to: pair.to,
        streamKey,
        lastProcessedId: '0-0',
        lag: 0,
        status: 'active'
      });
    }

    logger.info('Replication streams initialized', {
      streamCount: this.replicationStreams.size
    });
  }

  /**
   * Start lag monitoring
   */
  startLagMonitoring() {
    setInterval(async () => {
      await this.measureReplicationLag();
      await this.updateLagMetrics();
      await this.checkLagThresholds();
      await this.cleanupOldData();
    }, this.options.monitoringInterval);

    logger.info('Replication lag monitoring started', {
      interval: this.options.monitoringInterval,
      maxLag: this.options.maxAcceptableLag
    });
  }

  /**
   * Measure replication lag for all streams
   */
  async measureReplicationLag() {
    try {
      const measurements = [];

      for (const [streamKey, stream] of this.replicationStreams) {
        const lag = await this.measureStreamLag(stream);
        
        // Update stream lag
        stream.lag = lag;
        
        // Store in history
        if (!this.lagHistory.has(streamKey)) {
          this.lagHistory.set(streamKey, []);
        }
        
        const history = this.lagHistory.get(streamKey);
        history.push({
          timestamp: Date.now(),
          lag,
          streamKey
        });

        // Keep only recent history
        if (history.length > this.options.smoothingWindow) {
          history.shift();
        }

        measurements.push({
          streamKey,
          from: stream.from,
          to: stream.to,
          lag,
          smoothedLag: this.calculateSmoothedLag(history)
        });
      }

      this.emit('lagMeasured', measurements);

    } catch (error) {
      logger.error('Failed to measure replication lag', {
        error: error.message
      });
    }
  }

  /**
   * Measure lag for a specific stream
   */
  async measureStreamLag(stream) {
    try {
      // Get current timestamp
      const currentTime = Date.now();
      
      // Send heartbeat to source region
      const heartbeatId = await this.sendHeartbeat(stream.from, stream.to, currentTime);
      
      // Wait for heartbeat response
      const response = await this.waitForHeartbeatResponse(heartbeatId, 2000);
      
      if (response) {
        const roundTripTime = currentTime - response.originalTimestamp;
        const oneWayLag = roundTripTime / 2;
        
        logger.debug('Stream lag measured', {
          streamKey: stream.streamKey,
          lag: oneWayLag,
          roundTripTime
        });
        
        return oneWayLag;
      } else {
        // Heartbeat timeout, estimate lag
        const estimatedLag = Math.min(stream.lag + 1000, this.options.criticalLagThreshold);
        
        logger.warn('Heartbeat timeout, estimating lag', {
          streamKey: stream.streamKey,
          estimatedLag
        });
        
        return estimatedLag;
      }

    } catch (error) {
      logger.error('Failed to measure stream lag', {
        streamKey: stream.streamKey,
        error: error.message
      });
      
      // Return previous lag with penalty
      return Math.min(stream.lag + 500, this.options.criticalLagThreshold);
    }
  }

  /**
   * Send heartbeat to measure lag
   */
  async sendHeartbeat(fromRegion, toRegion, timestamp) {
    const heartbeatId = `heartbeat_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    const heartbeatKey = `heartbeat:${fromRegion}:${toRegion}:${heartbeatId}`;
    
    const heartbeat = {
      id: heartbeatId,
      fromRegion,
      toRegion,
      originalTimestamp: timestamp,
      sentAt: Date.now()
    };

    // Store heartbeat in source region
    await this.redis.setex(heartbeatKey, 10, JSON.stringify(heartbeat));
    
    // Publish heartbeat event
    await this.redis.publish(`heartbeat:${fromRegion}:${toRegion}`, JSON.stringify(heartbeat));
    
    return heartbeatId;
  }

  /**
   * Wait for heartbeat response
   */
  async waitForHeartbeatResponse(heartbeatId, timeout) {
    return new Promise((resolve) => {
      const responseKey = `heartbeat_response:${heartbeatId}`;
      
      // Check for existing response
      this.redis.get(responseKey).then(response => {
        if (response) {
          resolve(JSON.parse(response));
          return;
        }
      });

      // Subscribe to response
      const subscriber = this.redis.duplicate();
      
      subscriber.subscribe(`heartbeat_response:${heartbeatId}`, (message) => {
        subscriber.quit();
        resolve(JSON.parse(message));
      });

      // Timeout
      setTimeout(() => {
        subscriber.quit();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Calculate smoothed lag using moving average
   */
  calculateSmoothedLag(history) {
    if (history.length === 0) return 0;
    
    const sum = history.reduce((acc, measurement) => acc + measurement.lag, 0);
    return Math.round(sum / history.length);
  }

  /**
   * Update lag metrics
   */
  async updateLagMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        streams: {},
        summary: {}
      };

      let totalLag = 0;
      let maxLag = 0;
      let minLag = Infinity;
      let activeStreams = 0;
      let criticalStreams = 0;

      for (const [streamKey, stream] of this.replicationStreams) {
        const history = this.lagHistory.get(streamKey) || [];
        const smoothedLag = this.calculateSmoothedLag(history);
        
        metrics.streams[streamKey] = {
          from: stream.from,
          to: stream.to,
          currentLag: stream.lag,
          smoothedLag,
          status: this.getStreamStatus(smoothedLag),
          measurements: history.length
        };

        totalLag += smoothedLag;
        maxLag = Math.max(maxLag, smoothedLag);
        minLag = Math.min(minLag, smoothedLag);
        activeStreams++;

        if (smoothedLag > this.options.criticalLagThreshold) {
          criticalStreams++;
        }
      }

      metrics.summary = {
        totalLag: Math.round(totalLag / activeStreams),
        maxLag,
        minLag: minLag === Infinity ? 0 : minLag,
        activeStreams,
        criticalStreams,
        healthScore: this.calculateHealthScore(metrics.streams)
      };

      // Store metrics
      const metricsKey = `${this.options.metricsPrefix}${Date.now()}`;
      await this.redis.setex(metricsKey, 3600, JSON.stringify(metrics));

      // Update current metrics in memory
      this.currentMetrics = metrics;

      this.emit('metricsUpdated', metrics);

    } catch (error) {
      logger.error('Failed to update lag metrics', {
        error: error.message
      });
    }
  }

  /**
   * Get stream status based on lag
   */
  getStreamStatus(lag) {
    if (lag > this.options.criticalLagThreshold) {
      return 'critical';
    } else if (lag > this.options.maxAcceptableLag) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(streams) {
    const streamValues = Object.values(streams);
    
    if (streamValues.length === 0) return 100;

    let totalScore = 0;
    
    for (const stream of streamValues) {
      switch (stream.status) {
        case 'healthy':
          totalScore += 100;
          break;
        case 'warning':
          totalScore += 50;
          break;
        case 'critical':
          totalScore += 0;
          break;
      }
    }

    return Math.round(totalScore / streamValues.length);
  }

  /**
   * Check lag thresholds and trigger alerts
   */
  async checkLagThresholds() {
    try {
      const alerts = [];

      for (const [streamKey, stream] of this.replicationStreams) {
        const history = this.lagHistory.get(streamKey) || [];
        const smoothedLag = this.calculateSmoothedLag(history);
        
        // Check for critical lag
        if (smoothedLag > this.options.criticalLagThreshold) {
          const alert = await this.createAlert(
            'critical_lag',
            `Critical replication lag detected: ${smoothedLag}ms`,
            {
              streamKey,
              from: stream.from,
              to: stream.to,
              lag: smoothedLag,
              threshold: this.options.criticalLagThreshold
            }
          );
          
          if (alert) alerts.push(alert);
        }
        
        // Check for warning lag
        else if (smoothedLag > this.options.maxAcceptableLag) {
          const alert = await this.createAlert(
            'warning_lag',
            `High replication lag detected: ${smoothedLag}ms`,
            {
              streamKey,
              from: stream.from,
              to: stream.to,
              lag: smoothedLag,
              threshold: this.options.maxAcceptableLag
            }
          );
          
          if (alert) alerts.push(alert);
        }
      }

      // Check overall system health
      if (this.currentMetrics && this.currentMetrics.summary.healthScore < 70) {
        const alert = await this.createAlert(
          'system_health',
          `System replication health degraded: ${this.currentMetrics.summary.healthScore}%`,
          {
            healthScore: this.currentMetrics.summary.healthScore,
            criticalStreams: this.currentMetrics.summary.criticalStreams,
            totalStreams: this.currentMetrics.summary.activeStreams
          }
        );
        
        if (alert) alerts.push(alert);
      }

      if (alerts.length > 0) {
        this.emit('alertsTriggered', alerts);
        
        logger.warn('Replication lag alerts triggered', {
          alertCount: alerts.length,
          alerts: alerts.map(a => ({ type: a.type, severity: a.severity }))
        });
      }

    } catch (error) {
      logger.error('Failed to check lag thresholds', {
        error: error.message
      });
    }
  }

  /**
   * Create alert with cooldown management
   */
  async createAlert(type, message, details) {
    const alertKey = `${type}_${details.streamKey || 'system'}`;
    const now = Date.now();
    const lastAlertTime = this.lastAlertTimes.get(alertKey) || 0;

    // Check cooldown
    if (now - lastAlertTime < this.options.alertCooldown) {
      return null;
    }

    const alert = {
      id: `alert_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      severity: this.getAlertSeverity(type),
      timestamp: now,
      details,
      acknowledged: false,
      resolved: false
    };

    // Store alert
    const alertStorageKey = `${this.options.alertPrefix}${alert.id}`;
    await this.redis.setex(alertStorageKey, this.options.historyRetention, JSON.stringify(alert));

    // Update last alert time
    this.lastAlertTimes.set(alertKey, now);

    logger.info('Alert created', {
      alertId: alert.id,
      type,
      severity: alert.severity
    });

    return alert;
  }

  /**
   * Get alert severity
   */
  getAlertSeverity(type) {
    switch (type) {
      case 'critical_lag':
        return 'critical';
      case 'warning_lag':
        return 'warning';
      case 'system_health':
        return 'warning';
      default:
        return 'info';
    }
  }

  /**
   * Clean up old data
   */
  async cleanupOldData() {
    try {
      // Clean old lag history
      for (const [streamKey, history] of this.lagHistory) {
        const cutoff = Date.now() - this.options.historyRetention;
        const filtered = history.filter(m => m.timestamp > cutoff);
        
        if (filtered.length !== history.length) {
          this.lagHistory.set(streamKey, filtered);
        }
      }

      // Clean old metrics
      const metricKeys = await this.redis.keys(`${this.options.metricsPrefix}*`);
      const cutoff = Date.now() - this.options.historyRetention;
      
      for (const key of metricKeys) {
        const timestamp = parseInt(key.split(':').pop());
        if (timestamp < cutoff) {
          await this.redis.del(key);
        }
      }

      // Clean old alerts
      const alertKeys = await this.redis.keys(`${this.options.alertPrefix}*`);
      for (const key of alertKeys) {
        const alert = await this.redis.get(key);
        if (alert) {
          const parsed = JSON.parse(alert);
          if (Date.now() - parsed.timestamp > this.options.historyRetention) {
            await this.redis.del(key);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to cleanup old data', {
        error: error.message
      });
    }
  }

  /**
   * Get current lag metrics
   */
  getCurrentMetrics() {
    return this.currentMetrics;
  }

  /**
   * Get lag for specific stream
   */
  getStreamLag(fromRegion, toRegion) {
    const streamKey = `replication:${fromRegion}:${toRegion}`;
    const stream = this.replicationStreams.get(streamKey);
    
    if (!stream) {
      return null;
    }

    const history = this.lagHistory.get(streamKey) || [];
    return {
      currentLag: stream.lag,
      smoothedLag: this.calculateSmoothedLag(history),
      status: this.getStreamStatus(stream.lag),
      history: history.slice(-10) // Last 10 measurements
    };
  }

  /**
   * Get all active alerts
   */
  async getActiveAlerts() {
    try {
      const alertKeys = await this.redis.keys(`${this.options.alertPrefix}*`);
      const alertsData = await this.redis.mget(alertKeys);
      
      return alertsData
        .filter(data => data !== null)
        .map(data => JSON.parse(data))
        .filter(alert => !alert.resolved)
        .sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      logger.error('Failed to get active alerts', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    try {
      const alertKey = `${this.options.alertPrefix}${alertId}`;
      const alert = await this.redis.get(alertKey);
      
      if (!alert) {
        throw new Error(`Alert not found: ${alertId}`);
      }

      const updatedAlert = {
        ...JSON.parse(alert),
        acknowledged: true,
        acknowledgedAt: Date.now(),
        acknowledgedBy
      };

      await this.redis.setex(alertKey, this.options.historyRetention, JSON.stringify(updatedAlert));

      this.emit('alertAcknowledged', updatedAlert);

      logger.info('Alert acknowledged', {
        alertId,
        acknowledgedBy
      });

      return updatedAlert;

    } catch (error) {
      logger.error('Failed to acknowledge alert', {
        alertId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId, resolvedBy) {
    try {
      const alertKey = `${this.options.alertPrefix}${alertId}`;
      const alert = await this.redis.get(alertKey);
      
      if (!alert) {
        throw new Error(`Alert not found: ${alertId}`);
      }

      const updatedAlert = {
        ...JSON.parse(alert),
        resolved: true,
        resolvedAt: Date.now(),
        resolvedBy
      };

      await this.redis.setex(alertKey, this.options.historyRetention, JSON.stringify(updatedAlert));

      this.emit('alertResolved', updatedAlert);

      logger.info('Alert resolved', {
        alertId,
        resolvedBy
      });

      return updatedAlert;

    } catch (error) {
      logger.error('Failed to resolve alert', {
        alertId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get lag history for time range
   */
  async getLagHistory(fromRegion, toRegion, startTime, endTime) {
    try {
      const streamKey = fromRegion && toRegion ? 
        `replication:${fromRegion}:${toRegion}` : null;

      const metricKeys = await this.redis.keys(`${this.options.metricsPrefix}*`);
      const relevantKeys = metricKeys.filter(key => {
        const timestamp = parseInt(key.split(':').pop());
        return timestamp >= startTime && timestamp <= endTime;
      }).sort();

      if (relevantKeys.length === 0) {
        return [];
      }

      const metricsData = await this.redis.mget(relevantKeys);
      const allMetrics = metricsData
        .filter(data => data !== null)
        .map(data => JSON.parse(data));

      if (streamKey) {
        // Filter for specific stream
        return allMetrics
          .filter(metric => metric.streams[streamKey])
          .map(metric => ({
            timestamp: metric.timestamp,
            ...metric.streams[streamKey]
          }));
      } else {
        // Return all streams
        return allMetrics.map(metric => ({
          timestamp: metric.timestamp,
          streams: metric.streams,
          summary: metric.summary
        }));
      }

    } catch (error) {
      logger.error('Failed to get lag history', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get replication health summary
   */
  getHealthSummary() {
    if (!this.currentMetrics) {
      return {
        status: 'unknown',
        healthScore: 0,
        activeStreams: 0,
        criticalStreams: 0,
        message: 'No metrics available'
      };
    }

    const { summary } = this.currentMetrics;
    let status = 'healthy';
    
    if (summary.criticalStreams > 0) {
      status = 'critical';
    } else if (summary.healthScore < 70) {
      status = 'degraded';
    } else if (summary.healthScore < 90) {
      status = 'warning';
    }

    return {
      status,
      healthScore: summary.healthScore,
      activeStreams: summary.activeStreams,
      criticalStreams: summary.criticalStreams,
      averageLag: summary.totalLag,
      maxLag: summary.maxLag,
      minLag: summary.minLag,
      message: this.getHealthMessage(status, summary)
    };
  }

  /**
   * Get health message
   */
  getHealthMessage(status, summary) {
    switch (status) {
      case 'healthy':
        return 'All replication streams operating normally';
      case 'warning':
        return `${summary.criticalStreams} streams experiencing elevated lag`;
      case 'degraded':
        return `System performance degraded, health score: ${summary.healthScore}%`;
      case 'critical':
        return `${summary.criticalStreams} streams experiencing critical lag`;
      default:
        return 'System status unknown';
    }
  }
}

// Create singleton instance
const replicationLagManager = new ReplicationLagManager({
  lagPrefix: 'replication_lag:',
  metricsPrefix: 'lag_metrics:',
  alertPrefix: 'lag_alerts:',
  monitoringInterval: 5000,
  maxAcceptableLag: 5000,
  criticalLagThreshold: 10000,
  alertCooldown: 60000,
  historyRetention: 86400,
  smoothingWindow: 5
});

module.exports = replicationLagManager;
