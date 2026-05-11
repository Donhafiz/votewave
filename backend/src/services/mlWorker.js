const { parentPort } = require('worker_threads');
const { logger } = require('../utils/logger');

// ML models and processors
const MLProcessors = {
  fraud_detection: require('./ml/fraudDetector'),
  behavioral_analysis: require('./ml/behaviorAnalyzer'),
  predictive_analytics: require('./ml/predictiveAnalyzer'),
  anomaly_detection: require('./ml/anomalyDetector'),
  model_training: require('./ml/modelTrainer'),
  batch_processing: require('./ml/batchProcessor')
};

class MLWorker {
  constructor() {
    this.isReady = false;
    this.taskQueue = [];
    this.currentTask = null;
    this.processedCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
    
    this.setupEventHandlers();
  }

  // Setup event handlers
  setupEventHandlers() {
    parentPort.on('message', this.handleMessage.bind(this));
    parentPort.on('error', this.handleError.bind(this));
    parentPort.on('close', this.handleClose.bind(this));
    
    // Signal ready
    parentPort.postMessage({
      type: 'ready',
      workerId: workerData.workerId,
      timestamp: new Date().toISOString()
    });
  }

  // Handle incoming messages
  async handleMessage(message) {
    try {
      switch (message.type) {
        case 'task':
          await this.processTask(message);
          break;
        case 'ping':
          this.handlePing();
          break;
        case 'shutdown':
          await this.handleShutdown();
          break;
        default:
          logger.warn('Unknown message type', { type: message.type });
      }
    } catch (error) {
      logger.error('Error handling message', {
        type: message.type,
        error: error.message
      });
      
      parentPort.postMessage({
        type: 'error',
        taskId: message.taskId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Process task
  async processTask(message) {
    const { taskId, type, data, options } = message;
    
    this.currentTask = {
      id: taskId,
      type,
      startTime: Date.now(),
      data,
      options
    };

    logger.info('Processing ML task', {
      taskId,
      type,
      workerId: workerData.workerId
    });

    try {
      let result;
      
      switch (type) {
        case 'fraud_detection':
          result = await MLProcessors.fraud_detection.detect(data);
          break;
        case 'behavioral_analysis':
          result = await MLProcessors.behavioral_analysis.analyze(data);
          break;
        case 'predictive_analytics':
          result = await MLProcessors.predictive_analytics.predict(data);
          break;
        case 'anomaly_detection':
          result = await MLProcessors.anomaly_detection.detect(data);
          break;
        case 'model_training':
          result = await MLProcessors.model_training.train(data);
          break;
        case 'batch_processing':
          result = await MLProcessors.batch_processing.process(data);
          break;
        default:
          throw new Error(`Unknown task type: ${type}`);
      }

      const processingTime = Date.now() - this.currentTask.startTime;
      
      parentPort.postMessage({
        type: 'result',
        taskId,
        result: {
          success: true,
          data: result,
          processingTime,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.processedCount++;
      this.currentTask = null;

      logger.info('ML task completed successfully', {
        taskId,
        type,
        processingTime: `${processingTime}ms`,
        workerId: workerData.workerId
      });

    } catch (error) {
      this.errorCount++;
      const processingTime = Date.now() - this.currentTask.startTime;
      
      parentPort.postMessage({
        type: 'result',
        taskId,
        result: {
          success: false,
          error: error.message,
          stack: error.stack,
          processingTime,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      this.currentTask = null;

      logger.error('ML task failed', {
        taskId,
        type,
        error: error.message,
        processingTime: `${processingTime}ms`,
        workerId: workerData.workerId
      });
    }
  }

  // Handle ping
  handlePing() {
    parentPort.postMessage({
      type: 'pong',
      workerId: workerData.workerId,
      uptime: Date.now() - this.startTime,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      currentTask: this.currentTask?.id || null,
      timestamp: new Date().toISOString()
    });
  }

  // Handle shutdown
  async handleShutdown() {
    logger.info('ML worker shutting down', {
      workerId: workerData.workerId,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      uptime: Date.now() - this.startTime
    });

    // Wait for current task to complete
    if (this.currentTask) {
      logger.info('Waiting for current task to complete', {
        taskId: this.currentTask.id
      });
      
      // Wait up to 10 seconds for task to complete
      let waitTime = 0;
      while (this.currentTask && waitTime < 10000) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitTime += 100;
      }
    }

    parentPort.postMessage({
      type: 'shutdown_complete',
      workerId: workerData.workerId,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      timestamp: new Date().toISOString()
    });

    process.exit(0);
  }

  // Handle errors
  handleError(error) {
    logger.error('ML worker error', {
      workerId: workerData.workerId,
      error: error.message,
      stack: error.stack
    });
    
    this.errorCount++;
  }

  // Handle close
  handleClose() {
    logger.info('ML worker connection closed', {
      workerId: workerData.workerId,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      uptime: Date.now() - this.startTime
    });
  }

  // Get worker statistics
  getStats() {
    return {
      workerId: workerData.workerId,
      uptime: Date.now() - this.startTime,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      successRate: this.processedCount > 0 
        ? ((this.processedCount - this.errorCount) / this.processedCount) * 100 
        : 0,
      currentTask: this.currentTask?.id || null,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString()
    };
  }
}

// Initialize worker
const mlWorker = new MLWorker();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in ML worker', {
    workerId: workerData.workerId,
    error: error.message,
    stack: error.stack
  });
  
  parentPort.postMessage({
    type: 'error',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection in ML worker', {
    workerId: workerData.workerId,
    reason: reason.toString(),
    promise: promise.toString()
  });
  
  parentPort.postMessage({
    type: 'error',
    error: reason.toString(),
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down ML worker');
  mlWorker.handleShutdown();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down ML worker');
  mlWorker.handleShutdown();
});
