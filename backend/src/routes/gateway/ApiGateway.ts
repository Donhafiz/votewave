/**
 * API Gateway - Central API management and routing
 * Provides unified API interface with authentication, rate limiting, and request routing
 */

import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '../../utils/logger';

export interface ApiGatewayOptions {
  cors?: {
    origin: string | string[];
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
  };
  rateLimit?: {
    windowMs: number;
    max: number;
    message?: string;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
  };
  security?: {
    enableHelmet?: boolean;
    enableCORS?: boolean;
    enableRateLimit?: boolean;
  };
  routes?: {
    commands?: string[];
    queries?: string[];
    health?: string[];
    admin?: string[];
  };
}

export interface RouteConfig {
  path: string;
  handler: Router;
  middleware?: Array<(req: Request, res: Response, next: NextFunction) => void>;
  permissions?: string[];
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export interface RequestContext {
  requestId: string;
  timestamp: number;
  userId?: string;
  userRole?: string;
  permissions: string[] | undefined;
  ip: string;
  userAgent: string;
  path: string;
  method: string;
}

export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string | undefined;
  message?: string | undefined;
  requestId: string;
  timestamp: number;
  metadata?: {
    duration?: number;
    version?: string;
    [key: string]: any;
  } | undefined;
}

export class ApiGateway {
  private router: Router;
  private options: Required<ApiGatewayOptions>;
  private routes: Map<string, RouteConfig> = new Map();
  private middleware: Array<(req: Request, res: Response, next: NextFunction) => void> = [];
  private requestCounter: number = 0;

  constructor(options: ApiGatewayOptions = {}) {
    this.router = Router();
    this.options = {
      cors: options.cors || {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Role', 'X-Correlation-Id']
      },
      rateLimit: options.rateLimit || {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false
      },
      security: {
        enableHelmet: options.security?.enableHelmet !== false,
        enableCORS: options.security?.enableCORS !== false,
        enableRateLimit: options.security?.enableRateLimit !== false
      },
      routes: {
        commands: options.routes?.commands || ['/api/commands'],
        queries: options.routes?.queries || ['/api/queries'],
        health: options.routes?.health || ['/api/health'],
        admin: options.routes?.admin || ['/api/admin']
      }
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    logger.info('API Gateway initialized', {
      corsEnabled: this.options.security.enableCORS,
      rateLimitEnabled: this.options.security.enableRateLimit,
      helmetEnabled: this.options.security.enableHelmet
    });
  }

  /**
   * Get the main router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Add custom middleware
   */
  use(middleware: (req: Request, res: Response, next: NextFunction) => void): void {
    this.middleware.push(middleware);
    this.router.use(middleware);
  }

  /**
   * Add route configuration
   */
  addRoute(config: RouteConfig): void {
    this.routes.set(config.path, config);
    
    let routeHandler = config.handler;
    
    // Apply route-specific middleware
    if (config.middleware && config.middleware.length > 0) {
      for (const mw of config.middleware) {
        routeHandler.use(mw);
      }
    }

    // Apply route-specific rate limiting
    if (config.rateLimit) {
      const limiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        message: 'Rate limit exceeded for this endpoint'
      });
      routeHandler.use(limiter);
    }

    this.router.use(config.path, routeHandler);

    logger.debug('Route added to gateway', {
      path: config.path,
      middlewareCount: config.middleware?.length || 0,
      hasRateLimit: !!config.rateLimit
    });
  }

  /**
   * Setup global middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    if (this.options.security.enableHelmet) {
      this.router.use(helmet());
    }

    // CORS middleware
    if (this.options.security.enableCORS) {
      this.router.use(cors(this.options.cors));
    }

    // Rate limiting middleware
    if (this.options.security.enableRateLimit) {
      const limiter = rateLimit(this.options.rateLimit);
      this.router.use(limiter);
    }

    // Request logging middleware
    this.router.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = this.generateRequestId();
      const context: RequestContext = {
        requestId,
        timestamp: Date.now(),
        ip: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        path: req.path,
        method: req.method,
        permissions: []
      };

      // Add context to request
      (req as any).context = context;

      // Log request
      logger.info('API Request', {
        requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Add response timing
      const startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('API Response', {
          requestId,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length')
        });
      });

      next();
    });

    // Authentication middleware (simplified)
    this.router.use((req: Request, _res: Response, next: NextFunction) => {
      const context = (req as any).context as RequestContext;
      
      // Extract user info from headers (in production, this would validate JWT)
      const userId = req.get('X-User-Id');
      const userRole = req.get('X-User-Role');
      
      if (userId) {
        context.userId = userId;
        if (userRole) {
          context.userRole = userRole;
        }
        context.permissions = this.getPermissionsForRole(userRole);
      }

      next();
    });

    // System initialization check
    this.router.use(async (_req: Request, res: Response, next: NextFunction) => {
      try {
        // System is ready, proceed to next middleware
        next();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('System initialization failed', { error: errorMessage });
        res.status(503).json({
          success: false,
          message: 'System not initialized',
          timestamp: Date.now()
        });
      }
    });

    // Apply custom middleware
    for (const mw of this.middleware) {
      this.router.use(mw);
    }
  }

  /**
   * Setup basic routes
   */
  private setupRoutes(): void {
    // Health check routes
    const healthRouter = Router();
    
    healthRouter.get('/', async (req: Request, res: Response) => {
      try {
        const context = (req as any).context as RequestContext;
        
        // Get system health
        const systemHealth = await require('../../core').getSystemHealth();
        
        const response: ApiResponse = {
          success: true,
          data: {
            status: 'healthy',
            gateway: {
              uptime: process.uptime() * 1000,
              version: process.env['npm_package_version'] || '1.0.0',
              environment: process.env['NODE_ENV'] || 'development'
            },
            system: systemHealth
          },
          requestId: context.requestId,
          timestamp: Date.now()
        };

        res.json(response);
      } catch (error) {
        const context = (req as any).context as RequestContext;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        res.status(500).json({
          success: false,
          error: 'Health check failed',
          message: errorMessage,
          requestId: context.requestId,
          timestamp: Date.now()
        });
      }
    });

    healthRouter.get('/detailed', async (req: Request, res: Response) => {
      try {
        const context = (req as any).context as RequestContext;
        
        // Get detailed system statistics
        const systemStats = await require('../../core').getSystemStatistics();
        
        const response: ApiResponse = {
          success: true,
          data: {
            gateway: {
              uptime: process.uptime() * 1000,
              version: process.env['npm_package_version'] || '1.0.0',
              environment: process.env['NODE_ENV'] || 'development',
              memory: process.memoryUsage(),
              requests: this.requestCounter
            },
            system: systemStats
          },
          requestId: context.requestId,
          timestamp: Date.now()
        };

        res.json(response);
      } catch (error) {
        const context = (req as any).context as RequestContext;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        res.status(500).json({
          success: false,
          error: 'Detailed health check failed',
          message: errorMessage,
          requestId: context.requestId,
          timestamp: Date.now()
        });
      }
    });

    this.addRoute({
      path: '/api/health',
      handler: healthRouter
    });

    // API documentation route
    this.router.get('/api', (req: Request, res: Response) => {
      const context = (req as any).context as RequestContext;
      
      const response: ApiResponse = {
        success: true,
        data: {
          name: 'VoteWave API',
          version: process.env['npm_package_version'] || '1.0.0',
          description: 'Event-driven voting system API',
          endpoints: {
            commands: this.options.routes.commands,
            queries: this.options.routes.queries,
            health: this.options.routes.health,
            admin: this.options.routes.admin
          },
          documentation: '/api/docs',
          timestamp: Date.now()
        },
        requestId: context.requestId,
        timestamp: Date.now()
      };

      res.json(response);
    });

    // Request counter middleware
    this.router.use((_req: Request, _res: Response, next: NextFunction) => {
      this.requestCounter++;
      next();
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.router.use((req: Request, res: Response) => {
      const context = (req as any).context as RequestContext;
      
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.path} not found`,
        requestId: context.requestId,
        timestamp: Date.now()
      });
    });

    // Global error handler
    this.router.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
      const context = (req as any).context as RequestContext;
      
      logger.error('Unhandled API error', {
        requestId: context.requestId,
        method: req.method,
        path: req.path,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env['NODE_ENV'] === 'development' ? error.message : 'An unexpected error occurred',
        requestId: context.requestId,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Get permissions for user role
   */
  private getPermissionsForRole(role?: string): string[] {
    const rolePermissions: Record<string, string[]> = {
      admin: ['read', 'write', 'delete', 'manage_users', 'manage_elections', 'view_analytics'],
      moderator: ['read', 'write', 'manage_elections', 'view_analytics'],
      election_official: ['read', 'write', 'manage_assigned_elections'],
      observer: ['read', 'view_analytics'],
      voter: ['read', 'vote']
    };

    return rolePermissions[role || 'voter'] || rolePermissions['voter'] || [];
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create standardized API response
   */
  static createResponse(
    success: boolean,
    data?: any,
    error?: string,
    message?: string,
    context?: RequestContext,
    metadata?: any
  ): ApiResponse {
    return {
      success,
      data,
      error: error || undefined,
      message: message || undefined,
      requestId: context?.requestId || 'unknown',
      timestamp: Date.now(),
      metadata: metadata || undefined
    };
  }

  /**
   * Create success response
   */
  static success(data: any, context?: RequestContext, metadata?: any): ApiResponse {
    return ApiGateway.createResponse(true, data, undefined, undefined, context, metadata);
  }

  /**
   * Create error response
   */
  static error(error: string, context?: RequestContext, statusCode: number = 500): ApiResponse {
    return ApiGateway.createResponse(false, undefined, error, undefined, context, { statusCode });
  }

  /**
   * Create error response with message
   */
  static errorWithMessage(error: string, message: string, context?: RequestContext, statusCode: number = 500): ApiResponse {
    return ApiGateway.createResponse(false, undefined, error, message, context, { statusCode });
  }

  /**
   * Get gateway statistics
   */
  getStatistics(): {
    totalRequests: number;
    routesCount: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    return {
      totalRequests: this.requestCounter,
      routesCount: this.routes.size,
      uptime: process.uptime() * 1000,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.requestCounter = 0;
    logger.info('API Gateway statistics reset');
  }
}

export default ApiGateway;
