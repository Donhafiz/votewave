const { logger } = require('../utils/logger');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');

class AuditService {
  constructor() {
    this.auditQueue = [];
    this.batchSize = 100;
    this.batchTimeout = 5000; // 5 seconds
    this.flushInterval = 1000; // 1 second
    this.isProcessing = false;
    
    this.startBatchProcessor();
  }

  // Log security event
  async logSecurityEvent(event, details = {}) {
    const auditEntry = {
      id: this.generateAuditId(),
      type: 'security',
      event,
      severity: details.severity || 'medium',
      timestamp: new Date().toISOString(),
      userId: details.userId || 'anonymous',
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
      sessionId: details.sessionId || 'unknown',
      tenantId: details.tenantId || 'unknown',
      data: {
        ...details,
        action: event,
        category: 'security'
      }
    };

    await this.addToAuditQueue(auditEntry);
    
    logger.info('Security event logged', {
      auditId: auditEntry.id,
      event,
      severity: auditEntry.severity,
      userId: auditEntry.userId
    });
  }

  // Log authentication event
  async logAuthEvent(event, details = {}) {
    const auditEntry = {
      id: this.generateAuditId(),
      type: 'authentication',
      event,
      severity: details.severity || 'info',
      timestamp: new Date().toISOString(),
      userId: details.userId || 'anonymous',
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
      sessionId: details.sessionId || 'unknown',
      tenantId: details.tenantId || 'unknown',
      data: {
        ...details,
        action: event,
        category: 'authentication'
      }
    };

    await this.addToAuditQueue(auditEntry);
    
    logger.info('Authentication event logged', {
      auditId: auditEntry.id,
      event,
      severity: auditEntry.severity,
      userId: auditEntry.userId
    });
  }

  // Log voting event
  async logVotingEvent(event, details = {}) {
    const auditEntry = {
      id: this.generateAuditId(),
      type: 'voting',
      event,
      severity: details.severity || 'info',
      timestamp: new Date().toISOString(),
      userId: details.userId || 'anonymous',
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
      sessionId: details.sessionId || 'unknown',
      tenantId: details.tenantId || 'unknown',
      electionId: details.electionId || 'unknown',
      data: {
        ...details,
        action: event,
        category: 'voting'
      }
    };

    await this.addToAuditQueue(auditEntry);
    
    logger.info('Voting event logged', {
      auditId: auditEntry.id,
      event,
      electionId: auditEntry.electionId,
      userId: auditEntry.userId
    });
  }

  // Log admin event
  async logAdminEvent(event, details = {}) {
    const auditEntry = {
      id: this.generateAuditId(),
      type: 'admin',
      event,
      severity: details.severity || 'info',
      timestamp: new Date().toISOString(),
      userId: details.userId || 'anonymous',
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
      sessionId: details.sessionId || 'unknown',
      tenantId: details.tenantId || 'unknown',
      data: {
        ...details,
        action: event,
        category: 'admin'
      }
    };

    await this.addToAuditQueue(auditEntry);
    
    logger.info('Admin event logged', {
      auditId: auditEntry.id,
      event,
      severity: auditEntry.severity,
      userId: auditEntry.userId
    });
  }

  // Log system event
  async logSystemEvent(event, details = {}) {
    const auditEntry = {
      id: this.generateAuditId(),
      type: 'system',
      event,
      severity: details.severity || 'info',
      timestamp: new Date().toISOString(),
      userId: details.userId || 'system',
      ipAddress: details.ipAddress || 'localhost',
      userAgent: details.userAgent || 'system',
      sessionId: details.sessionId || 'system',
      tenantId: details.tenantId || 'system',
      data: {
        ...details,
        action: event,
        category: 'system'
      }
    };

    await this.addToAuditQueue(auditEntry);
    
    logger.info('System event logged', {
      auditId: auditEntry.id,
      event,
      severity: auditEntry.severity
    });
  }

  // Log data access event
  async logDataAccessEvent(event, details = {}) {
    const auditEntry = {
      id: this.generateAuditId(),
      type: 'data_access',
      event,
      severity: details.severity || 'info',
      timestamp: new Date().toISOString(),
      userId: details.userId || 'anonymous',
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
      sessionId: details.sessionId || 'unknown',
      tenantId: details.tenantId || 'unknown',
      data: {
        ...details,
        action: event,
        category: 'data_access'
      }
    };

    await this.addToAuditQueue(auditEntry);
    
    logger.info('Data access event logged', {
      auditId: auditEntry.id,
      event,
      resource: details.resource,
      userId: auditEntry.userId
    });
  }

  // Add to audit queue
  async addToAuditQueue(auditEntry) {
    this.auditQueue.push(auditEntry);
    
    // Auto-flush if queue gets too large
    if (this.auditQueue.length >= this.batchSize) {
      await this.flushAuditQueue();
    }
  }

  // Flush audit queue to database
  async flushAuditQueue() {
    if (this.isProcessing || this.auditQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      const batch = this.auditQueue.splice(0, this.batchSize);
      
      await AuditLog.insertMany(batch);
      
      logger.info('Audit batch flushed', {
        batchSize: batch.length,
        queueSize: this.auditQueue.length
      });
      
    } catch (error) {
      logger.error('Failed to flush audit queue', {
        error: error.message,
        batchSize: this.auditQueue.length
      });
      
      // Re-queue failed entries
      this.auditQueue.unshift(...batch);
    } finally {
      this.isProcessing = false;
    }
  }

  // Start batch processor
  startBatchProcessor() {
    setInterval(async () => {
      if (this.auditQueue.length > 0 && !this.isProcessing) {
        await this.flushAuditQueue();
      }
    }, this.flushInterval);
  }

  // Generate audit ID
  generateAuditId() {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  // Query audit logs
  async queryAuditLogs(filters = {}, options = {}) {
    try {
      const query = {};
      
      // Build query filters
      if (filters.type) {
        query.type = filters.type;
      }
      
      if (filters.userId) {
        query.userId = filters.userId;
      }
      
      if (filters.event) {
        query.event = { $regex: filters.event, $options: 'i' };
      }
      
      if (filters.severity) {
        query.severity = filters.severity;
      }
      
      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
          query.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.timestamp.$lte = new Date(filters.endDate);
        }
      }
      
      // Execute query
      const limit = options.limit || 100;
      const sort = options.sort || { timestamp: -1 };
      
      const logs = await AuditLog.find(query)
        .sort(sort)
        .limit(limit)
        .lean();

      return {
        success: true,
        data: logs,
        total: logs.length,
        filters: filters
      };
      
    } catch (error) {
      logger.error('Failed to query audit logs', {
        error: error.message,
        filters
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get security events
  async getSecurityEvents(filters = {}) {
    return await this.queryAuditLogs({
      ...filters,
      type: 'security'
    });
  }

  // Get authentication events
  async getAuthEvents(filters = {}) {
    return await this.queryAuditLogs({
      ...filters,
      type: 'authentication'
    });
  }

  // Get voting events
  async getVotingEvents(filters = {}) {
    return await this.queryAuditLogs({
      ...filters,
      type: 'voting'
    });
  }

  // Get admin events
  async getAdminEvents(filters = {}) {
    return await this.queryAuditLogs({
      ...filters,
      type: 'admin'
    });
  }

  // Get system events
  async getSystemEvents(filters = {}) {
    return await this.queryAuditLogs({
      ...filters,
      type: 'system'
    });
  }

  // Get audit statistics
  async getAuditStatistics(timeRange = '24h') {
    try {
      const now = new Date();
      let startDate;
      
      switch (timeRange) {
        case '1h':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
      
      const pipeline = [
        {
          $match: { timestamp: { $gte: startDate } }
        },
        {
          $group: {
            _id: null,
            type: '$type',
            severity: '$severity',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ];
      
      const stats = await AuditLog.aggregate(pipeline);
      
      return {
        success: true,
        timeRange,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        statistics: stats.map(stat => ({
          type: stat._id,
          severity: stat.severity,
          count: stat.count
        }))
      };
      
    } catch (error) {
      logger.error('Failed to get audit statistics', {
        error: error.message,
        timeRange
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Export audit logs
  async exportAuditLogs(filters = {}, format = 'json') {
    try {
      const logs = await this.queryAuditLogs(filters, { limit: 10000 });
      
      if (format === 'csv') {
        return this.exportToCSV(logs);
      } else if (format === 'json') {
        return this.exportToJSON(logs);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
      
    } catch (error) {
      logger.error('Failed to export audit logs', {
        error: error.message,
        format
      });
      
      throw error;
    }
  }

  // Export to CSV
  exportToCSV(logs) {
    const headers = [
      'id', 'type', 'event', 'severity', 'timestamp', 'userId',
      'ipAddress', 'userAgent', 'sessionId', 'tenantId'
    ];
    
    const csvData = [
      headers.join(','),
      ...logs.map(log => [
        log.id,
        log.type,
        log.event,
        log.severity,
        log.timestamp,
        log.userId || '',
        log.ipAddress || '',
        log.userAgent || '',
        log.sessionId || '',
        log.tenantId || ''
      ].join(','))
    ].join('\n');
    
    return {
      success: true,
      format: 'csv',
      data: csvData,
      filename: `audit_logs_${Date.now().toISOString().split('T')[0]}.csv`
    };
  }

  // Export to JSON
  exportToJSON(logs) {
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        totalLogs: logs.length,
        format: 'json'
      },
      logs: logs
    };
    
    return {
      success: true,
      format: 'json',
      data: JSON.stringify(exportData, null, 2),
      filename: `audit_logs_${Date.now().toISOString().split('T')[0]}.json`
    };
  }

  // Cleanup old audit logs
  async cleanupOldLogs(retentionDays = 90) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const result = await AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      
      logger.info('Old audit logs cleaned up', {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays,
        deletedCount: result.deletedCount
      });
      
      return {
        success: true,
        deletedCount: result.deletedCount,
        cutoffDate: cutoffDate.toISOString()
      };
      
    } catch (error) {
      logger.error('Failed to cleanup old audit logs', {
        error: error.message,
        retentionDays
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get audit queue status
  getQueueStatus() {
    return {
      queueSize: this.auditQueue.length,
      batchSize: this.batchSize,
      isProcessing: this.isProcessing,
      flushInterval: this.flushInterval
    };
  }
}

module.exports = AuditService;
