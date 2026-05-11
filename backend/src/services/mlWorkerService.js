const { Worker } = require('worker_threads');
const { logger } = require('../utils/logger');
const EventEmitter = require('events');

class MLWorkerService extends EventEmitter {
  constructor() {
    super();
    this.workers = new Map();
    this.taskQueue = [];
    this.workerPool = [];
    this.maxWorkers = 4; // Number of worker processes
    this.taskTimeout = 30000; // 30 seconds
    this.workerScript = path.join(__dirname, 'mlWorker.js');
    this.isShuttingDown = false;
    
    this.initializeWorkers();
  }

  // Initialize worker pool
  async initializeWorkers() {
    try {
      logger.info('Initializing ML worker pool', {
        maxWorkers: this.maxWorkers
      });

      for (let i = 0; i < this.maxWorkers; i++) {
        await this.createWorker(i);
      }

      logger.info('ML worker pool initialized', {
        activeWorkers: this.workerPool.length,
        maxWorkers: this.maxWorkers
      });

    } catch (error) {
      logger.error('Failed to initialize ML workers', {
        error: error.message
      });
      throw error;
    }
  }

  // Create individual worker
  async createWorker(workerId) {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.workerScript, {
          workerData: {
            workerId,
            maxMemory: 512 * 1024 * 1024, // 512MB
            timeout: this.taskTimeout
          }
        });

        // Set up worker event handlers
        worker.on('online', () => {
          logger.info('ML worker online', { workerId });
        });

        worker.on('message', (result) => {
          this.handleWorkerMessage(workerId, result);
        });

        worker.on('error', (error) => {
          logger.error('ML worker error', {
            workerId,
            error: error.message
          });
          
          this.handleWorkerError(workerId, error);
        });

        worker.on('exit', (code) => {
          logger.warn('ML worker exited', {
            workerId,
            exitCode: code
          });
          
          this.handleWorkerExit(workerId, code);
        });

        // Store worker reference
        this.workers.set(workerId, {
          worker,
          status: 'idle',
          currentTask: null,
          taskCount: 0,
          lastActivity: new Date().toISOString()
        });

        this.workerPool.push(worker);

        resolve(worker);

      } catch (error) {
        logger.error('Failed to create ML worker', {
          workerId,
          error: error.message
        });
        reject(error);
      }
    });
  }

  // Handle worker message
  handleWorkerMessage(workerId, result) {
    try {
      const workerInfo = this.workers.get(workerId);
      
      if (!workerInfo) {
        logger.error('Unknown worker sent message', { workerId });
        return;
      }

      // Update worker status
      workerInfo.status = 'idle';
      workerInfo.currentTask = null;
      workerInfo.lastActivity = new Date().toISOString();

      // Process task result
      if (result.taskId) {
        this.processTaskResult(result.taskId, result);
      }

      // Process next task in queue
      this.processTaskQueue();

      logger.debug('ML worker task completed', {
        workerId,
        taskId: result.taskId,
        success: result.success
      });

    } catch (error) {
      logger.error('Failed to handle worker message', {
        workerId,
        error: error.message
      });
    }
  }

  // Handle worker error
  handleWorkerError(workerId, error) {
    const workerInfo = this.workers.get(workerId);
    
    if (!workerInfo) {
      return;
    }

    // Mark current task as failed
    if (workerInfo.currentTask) {
      this.processTaskResult(workerInfo.currentTask.taskId, {
        success: false,
        error: error.message,
        workerId
      });
    }

    // Update worker status
    workerInfo.status = 'error';
    workerInfo.lastActivity = new Date().toISOString();

    // Try to restart worker after delay
    setTimeout(() => {
      this.restartWorker(workerId);
    }, 5000); // 5 second delay
  }

  // Handle worker exit
  handleWorkerExit(workerId, exitCode) {
    const workerInfo = this.workers.get(workerId);
    
    if (!workerInfo) {
      return;
    }

    // Mark current task as failed
    if (workerInfo.currentTask) {
      this.processTaskResult(workerInfo.currentTask.taskId, {
        success: false,
        error: `Worker exited with code ${exitCode}`,
        workerId
      });
    }

    // Remove from pool
    const index = this.workerPool.indexOf(workerInfo.worker);
    if (index > -1) {
      this.workerPool.splice(index, 1);
    }

    // Remove from workers map
    this.workers.delete(workerId);

    // Try to restart if not shutting down
    if (!this.isShuttingDown && exitCode !== 0) {
      setTimeout(() => {
        this.restartWorker(workerId);
      }, 5000); // 5 second delay
    }

    logger.warn('ML worker removed from pool', {
      workerId,
      exitCode,
      remainingWorkers: this.workerPool.length
    });
  }

  // Restart worker
  async restartWorker(workerId) {
    try {
      logger.info('Restarting ML worker', { workerId });

      const newWorker = await this.createWorker(workerId);
      
      logger.info('ML worker restarted successfully', {
        workerId,
        newWorkerId: newWorker.threadId
      });

    } catch (error) {
      logger.error('Failed to restart ML worker', {
        workerId,
        error: error.message
      });
    }
  }

  // Submit task to worker
  async submitTask(taskType, data, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const taskId = this.generateTaskId();
        const task = {
          id: taskId,
          type: taskType,
          data,
          options: {
            timeout: options.timeout || this.taskTimeout,
            priority: options.priority || 'normal',
            retries: options.retries || 3
          },
          submittedAt: new Date().toISOString(),
          resolve,
          reject
        };

        // Add to queue
        this.taskQueue.push(task);
        
        // Sort queue by priority
        this.taskQueue.sort((a, b) => {
          const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
          return priorityOrder[b.options.priority] - priorityOrder[a.options.priority];
        });

        // Process queue
        this.processTaskQueue();

        logger.debug('Task submitted to ML worker', {
          taskId,
          taskType,
          queueSize: this.taskQueue.length
        });

        // Set timeout for task
        if (task.options.timeout) {
          setTimeout(() => {
            const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
            if (taskIndex > -1) {
              this.taskQueue.splice(taskIndex, 1);
              reject(new Error(`Task ${taskId} timed out`));
            }
          }, task.options.timeout);
        }

      } catch (error) {
        reject(error);
      }
    });
  }

  // Process task queue
  processTaskQueue() {
    // Find available worker
    const availableWorker = Array.from(this.workers.values())
      .find(worker => worker.status === 'idle');

    if (!availableWorker || this.taskQueue.length === 0) {
      return;
    }

    // Get next task
    const task = this.taskQueue.shift();
    
    // Assign task to worker
    availableWorker.status = 'busy';
    availableWorker.currentTask = task;
    availableWorker.taskCount++;
    availableWorker.lastActivity = new Date().toISOString();

    // Send task to worker
    availableWorker.worker.postMessage({
      taskId: task.id,
      type: task.type,
      data: task.data,
      options: task.options
    });

    logger.debug('Task assigned to ML worker', {
      workerId: availableWorker.worker.threadId,
      taskId: task.id,
      taskType: task.type
    });
  }

  // Process task result
  processTaskResult(taskId, result) {
    const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
      this.taskQueue.splice(taskIndex, 1);
    }

    // Find and resolve the original promise
    const task = this.taskQueue.find(t => t.id === taskId) || 
                   Array.from(this.workers.values()).find(w => w.currentTask?.id === taskId)?.currentTask;

    if (task && task.resolve) {
      if (result.success) {
        task.resolve(result);
      } else {
        task.reject(new Error(result.error));
      }
    }

    // Emit result for monitoring
    this.emit('taskCompleted', {
      taskId,
      result,
      timestamp: new Date().toISOString()
    });
  }

  // Fraud detection task
  async detectFraud(transactionData) {
    return await this.submitTask('fraud_detection', {
      transactionData,
      timestamp: new Date().toISOString()
    }, {
      priority: 'high',
      timeout: 10000 // 10 seconds for fraud detection
    });
  }

  // Behavioral analysis task
  async analyzeBehavior(userData, events) {
    return await this.submitTask('behavioral_analysis', {
      userData,
      events,
      analysisWindow: 24 * 60 * 60 * 1000 // 24 hours
    }, {
      priority: 'normal',
      timeout: 15000 // 15 seconds for behavioral analysis
    });
  }

  // Predictive analytics task
  async predictOutcomes(electionData, historicalData) {
    return await this.submitTask('predictive_analytics', {
      electionData,
      historicalData,
      predictionType: 'voter_turnout'
    }, {
      priority: 'low',
      timeout: 30000 // 30 seconds for predictive analytics
    });
  }

  // Anomaly detection task
  async detectAnomalies(eventStream, timeWindow) {
    return await this.submitTask('anomaly_detection', {
      eventStream,
      timeWindow,
      threshold: 0.95
    }, {
      priority: 'normal',
      timeout: 20000 // 20 seconds for anomaly detection
    });
  }

  // Model training task
  async trainModel(trainingData, modelType) {
    return await this.submitTask('model_training', {
      trainingData,
      modelType,
      hyperparameters: {
        epochs: 100,
        batchSize: 32,
        learningRate: 0.001
      }
    }, {
      priority: 'low',
      timeout: 300000 // 5 minutes for model training
    });
  }

  // Batch processing task
  async processBatch(events, processingType) {
    return await this.submitTask('batch_processing', {
      events,
      processingType,
      batchSize: 100
    }, {
      priority: 'normal',
      timeout: 60000 // 1 minute for batch processing
    });
  }

  // Generate task ID
  generateTaskId() {
    return `ml_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get worker statistics
  getWorkerStats() {
    const workers = Array.from(this.workers.values());
    
    return {
      totalWorkers: this.maxWorkers,
      activeWorkers: this.workerPool.length,
      idleWorkers: workers.filter(w => w.status === 'idle').length,
      busyWorkers: workers.filter(w => w.status === 'busy').length,
      errorWorkers: workers.filter(w => w.status === 'error').length,
      queueSize: this.taskQueue.length,
      totalTasksProcessed: workers.reduce((sum, w) => sum + w.taskCount, 0),
      averageTasksPerWorker: workers.length > 0 
        ? workers.reduce((sum, w) => sum + w.taskCount, 0) / workers.length 
        : 0,
      timestamp: new Date().toISOString()
    };
  }

  // Get worker details
  getWorkerDetails(workerId) {
    const workerInfo = this.workers.get(workerId);
    
    if (!workerInfo) {
      return null;
    }

    return {
      workerId,
      status: workerInfo.status,
      currentTask: workerInfo.currentTask,
      taskCount: workerInfo.taskCount,
      lastActivity: workerInfo.lastActivity,
      uptime: Date.now() - new Date(workerInfo.lastActivity).getTime()
    };
  }

  // Scale worker pool
  async scaleWorkers(newSize) {
    if (newSize < 1 || newSize > 16) {
      throw new Error('Worker pool size must be between 1 and 16');
    }

    const currentSize = this.workerPool.length;
    
    if (newSize > currentSize) {
      // Add workers
      for (let i = currentSize; i < newSize; i++) {
        await this.createWorker(i);
      }
    } else if (newSize < currentSize) {
      // Remove workers gracefully
      const workersToRemove = this.workerPool.slice(newSize);
      
      for (const workerInfo of workersToRemove) {
        if (workerInfo.status === 'idle') {
          // Terminate idle workers immediately
          workerInfo.worker.terminate();
        } else {
          // Wait for busy workers to finish current task
          workerInfo.worker.once('idle', () => {
            workerInfo.worker.terminate();
          });
        }
      }
    }

    this.maxWorkers = newSize;
    
    logger.info('ML worker pool scaled', {
      oldSize: currentSize,
      newSize,
      activeWorkers: this.workerPool.length
    });
  }

  // Graceful shutdown
  async shutdown() {
    this.isShuttingDown = true;
    
    logger.info('Shutting down ML worker service', {
      activeWorkers: this.workerPool.length,
      queueSize: this.taskQueue.length
    });

    // Stop accepting new tasks
    this.taskQueue = [];

    // Wait for current tasks to complete
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.workerPool.some(w => w.status === 'busy')) {
      if (Date.now() - startTime > maxWaitTime) {
        logger.warn('Forcing shutdown with busy workers');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Terminate all workers
    for (const workerInfo of this.workers.values()) {
      try {
        workerInfo.worker.terminate();
      } catch (error) {
        logger.error('Failed to terminate worker', {
          workerId: workerInfo.worker.threadId,
          error: error.message
        });
      }
    }

    // Clear pools
    this.workers.clear();
    this.workerPool = [];
    this.taskQueue = [];

    logger.info('ML worker service shutdown complete');
  }

  // Health check
  async healthCheck() {
    const stats = this.getWorkerStats();
    
    return {
      status: stats.activeWorkers > 0 ? 'healthy' : 'unhealthy',
      workers: stats,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = MLWorkerService;
