const express = require('express');
const path = require('path');
const { logger } = require('../utils/logger');
const PerformanceTestRunner = require('./performanceTest');
const SustainedThroughputTest = require('./sustainedThroughputTest');
const FailoverRecoveryTest = require('./failoverRecoveryTest');
const FraudDetectionLatencyTest = require('./fraudDetectionLatencyTest');
const WebSocketScalabilityTest = require('./webSocketScalabilityTest');

class PerformanceDashboard {
  constructor() {
    this.app = express();
    this.port = process.env.DASHBOARD_PORT || 3001;
    this.testResults = new Map();
    this.benchmarks = new Map();
    this.alerts = [];
    this.testRunners = {};
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  // Setup middleware
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });
  }

  // Setup routes
  setupRoutes() {
    // Dashboard main page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Get all test results
    this.app.get('/api/results', (req, res) => {
      res.json({
        success: true,
        data: {
          results: Array.from(this.testResults.values()),
          benchmarks: Array.from(this.benchmarks.values()),
          alerts: this.alerts,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Get specific test result
    this.app.get('/api/results/:testId', (req, res) => {
      const testId = req.params.testId;
      const result = this.testResults.get(testId);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Test result not found'
        });
      }

      res.json({
        success: true,
        data: result
      });
    });

    // Run specific test
    this.app.post('/api/tests/:testType', async (req, res) => {
      const testType = req.params.testType;
      const options = req.body.options || {};
      
      try {
        const testId = this.generateTestId(testType);
        const result = await this.runTest(testType, options);
        
        this.testResults.set(testId, {
          id: testId,
          type: testType,
          result,
          timestamp: new Date().toISOString(),
          options
        });

        res.json({
          success: true,
          testId,
          result
        });

      } catch (error) {
        logger.error(`Failed to run test ${testType}`, { error: error.message });
        
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Run all tests
    this.app.post('/api/tests/run-all', async (req, res) => {
      try {
        const testId = this.generateTestId('comprehensive');
        const result = await this.runAllTests();
        
        this.testResults.set(testId, {
          id: testId,
          type: 'comprehensive',
          result,
          timestamp: new Date().toISOString()
        });

        res.json({
          success: true,
          testId,
          result
        });

      } catch (error) {
        logger.error('Failed to run all tests', { error: error.message });
        
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get benchmarks
    this.app.get('/api/benchmarks', (req, res) => {
      res.json({
        success: true,
        data: {
          benchmarks: Array.from(this.benchmarks.values()),
          timestamp: new Date().toISOString()
        }
      });
    });

    // Set benchmarks
    this.app.post('/api/benchmarks', (req, res) => {
      const { name, value, category } = req.body;
      
      if (!name || value === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Name and value are required'
        });
      }

      const benchmark = {
        name,
        value,
        category: category || 'performance',
        timestamp: new Date().toISOString()
      };

      this.benchmarks.set(name, benchmark);

      res.json({
        success: true,
        benchmark
      });
    });

    // Get alerts
    this.app.get('/api/alerts', (req, res) => {
      res.json({
        success: true,
        data: {
          alerts: this.alerts,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Clear alerts
    this.app.delete('/api/alerts', (req, res) => {
      this.alerts = [];
      
      res.json({
        success: true,
        message: 'Alerts cleared'
      });
    });

    // Get system health
    this.app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          timestamp: new Date().toISOString()
        }
      });
    });
  }

  // Setup WebSocket for real-time updates
  setupWebSocket() {
    const server = require('http').createServer(this.app);
    const io = require('socket.io')(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    io.on('connection', (socket) => {
      logger.info('Dashboard client connected', { socketId: socket.id });

      // Send initial data
      socket.emit('initial-data', {
        results: Array.from(this.testResults.values()),
        benchmarks: Array.from(this.benchmarks.values()),
        alerts: this.alerts
      });

      // Handle test start
      socket.on('start-test', async (data) => {
        try {
          const { testType, options } = data;
          const testId = this.generateTestId(testType);
          
          // Notify all clients
          io.emit('test-started', { testId, testType });
          
          // Run test
          const result = await this.runTest(testType, options);
          
          // Store result
          this.testResults.set(testId, {
            id: testId,
            type: testType,
            result,
            timestamp: new Date().toISOString(),
            options
          });

          // Notify all clients
          io.emit('test-completed', { testId, testType, result });

        } catch (error) {
          logger.error('Test execution failed', { error: error.message });
          
          socket.emit('test-error', {
            testType: data.testType,
            error: error.message
          });
        }
      });

      // Handle benchmark updates
      socket.on('update-benchmark', (data) => {
        const { name, value, category } = data;
        
        const benchmark = {
          name,
          value,
          category: category || 'performance',
          timestamp: new Date().toISOString()
        };

        this.benchmarks.set(name, benchmark);
        
        // Notify all clients
        io.emit('benchmark-updated', benchmark);
      });

      // Handle alert creation
      socket.on('create-alert', (data) => {
        const alert = {
          id: this.generateAlertId(),
          ...data,
          timestamp: new Date().toISOString()
        };

        this.alerts.push(alert);
        
        // Notify all clients
        io.emit('alert-created', alert);
      });

      socket.on('disconnect', () => {
        logger.info('Dashboard client disconnected', { socketId: socket.id });
      });
    });

    this.server = server;
  }

  // Run specific test
  async runTest(testType, options = {}) {
    logger.info(`Running test: ${testType}`, { options });

    switch (testType) {
      case '10k-concurrent-voters':
        const voterTest = new PerformanceTestRunner();
        return await voterTest.run10kConcurrentVotersTest();

      case 'sustained-throughput':
        const throughputTest = new SustainedThroughputTest();
        return await throughputTest.runSustainedThroughputTest();

      case 'failover-recovery':
        const failoverTest = new FailoverRecoveryTest();
        return await failoverTest.runFailoverRecoveryTest();

      case 'fraud-detection-latency':
        const fraudTest = new FraudDetectionLatencyTest();
        return await fraudTest.runFraudDetectionLatencyTests();

      case 'websocket-scalability':
        const wsTest = new WebSocketScalabilityTest();
        return await wsTest.runWebSocketScalabilityTests();

      default:
        throw new Error(`Unknown test type: ${testType}`);
    }
  }

  // Run all tests
  async runAllTests() {
    logger.info('Running comprehensive performance tests');

    const testRunner = new PerformanceTestRunner();
    return await testRunner.runAllPerformanceTests();
  }

  // Generate test ID
  generateTestId(testType) {
    return `${testType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Generate alert ID
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Start dashboard server
  start() {
    this.server.listen(this.port, () => {
      logger.info(`Performance dashboard started on port ${this.port}`);
      logger.info(`Access dashboard at http://localhost:${this.port}`);
    });

    return this.server;
  }

  // Stop dashboard server
  stop() {
    if (this.server) {
      this.server.close(() => {
        logger.info('Performance dashboard stopped');
      });
    }
  }
}

// Create dashboard instance and start server
const dashboard = new PerformanceDashboard();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down dashboard');
  dashboard.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down dashboard');
  dashboard.stop();
  process.exit(0);
});

// Start dashboard if this file is run directly
if (require.main === module) {
  dashboard.start();
}

module.exports = PerformanceDashboard;
