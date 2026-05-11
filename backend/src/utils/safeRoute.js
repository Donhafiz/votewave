const { logger } = require('./logger');

/**
 * Safe route wrapper to prevent undefined controller crashes
 * @param {Function} fn - Controller function to wrap
 * @param {string} name - Name of the handler for logging
 * @returns {Function} Wrapped middleware function
 */
function safeRoute(fn, name = "handler") {
  return (req, res, next) => {
    // Check if function is defined
    if (typeof fn !== "function") {
      logger.error(`Route handler is not a function`, {
        handlerName: name,
        route: req.path,
        method: req.method,
        stack: new Error().stack
      });

      return res.status(500).json({
        success: false,
        message: `${name} handler is not defined`,
        error: 'HANDLER_NOT_DEFINED',
        handlerName: name,
        route: req.path,
        method: req.method
      });
    }

    try {
      // Execute the handler with error catching
      return fn(req, res, next);
    } catch (error) {
      logger.error(`Route handler execution error`, {
        handlerName: name,
        route: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: `Internal server error in ${name}`,
        error: 'HANDLER_EXECUTION_ERROR',
        handlerName: name,
        route: req.path,
        method: req.method
      });
    }
  };
}

/**
 * Async safe route wrapper with promise handling
 * @param {Function} fn - Async controller function to wrap
 * @param {string} name - Name of the handler for logging
 * @returns {Function} Wrapped middleware function
 */
function safeAsyncRoute(fn, name = "async_handler") {
  return (req, res, next) => {
    // Check if function is defined
    if (typeof fn !== "function") {
      logger.error(`Async route handler is not a function`, {
        handlerName: name,
        route: req.path,
        method: req.method,
        stack: new Error().stack
      });

      return res.status(500).json({
        success: false,
        message: `${name} handler is not defined`,
        error: 'ASYNC_HANDLER_NOT_DEFINED',
        handlerName: name,
        route: req.path,
        method: req.method
      });
    }

    // Execute async function with promise handling
    Promise.resolve(fn(req, res, next)).catch(error => {
      logger.error(`Async route handler execution error`, {
        handlerName: name,
        route: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: `Internal server error in ${name}`,
        error: 'ASYNC_HANDLER_EXECUTION_ERROR',
        handlerName: name,
        route: req.path,
        method: req.method
      });
    });
  };
}

/**
 * Safe middleware wrapper
 * @param {Function} fn - Middleware function to wrap
 * @param {string} name - Name of the middleware for logging
 * @returns {Function} Wrapped middleware function
 */
function safeMiddleware(fn, name = "middleware") {
  return (req, res, next) => {
    // Check if function is defined
    if (typeof fn !== "function") {
      logger.error(`Middleware is not a function`, {
        middlewareName: name,
        route: req.path,
        method: req.method,
        stack: new Error().stack
      });

      return res.status(500).json({
        success: false,
        message: `${name} middleware is not defined`,
        error: 'MIDDLEWARE_NOT_DEFINED',
        middlewareName: name,
        route: req.path,
        method: req.method
      });
    }

    try {
      return fn(req, res, next);
    } catch (error) {
      logger.error(`Middleware execution error`, {
        middlewareName: name,
        route: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: `Internal server error in ${name}`,
        error: 'MIDDLEWARE_EXECUTION_ERROR',
        middlewareName: name,
        route: req.path,
        method: req.method
      });
    }
  };
}

/**
 * Safe route loader for dynamic route loading
 * @param {string} controllerPath - Path to controller file
 * @param {string} methodName - Name of the method to load
 * @param {string} routeName - Name of the route for logging
 * @returns {Function} Safe route handler
 */
function loadSafeRoute(controllerPath, methodName, routeName) {
  return (req, res, next) => {
    try {
      // Dynamic import of controller
      const controller = require(controllerPath);
      
      if (!controller) {
        logger.error(`Controller not found`, {
          controllerPath,
          routeName,
          methodName,
          route: req.path,
          method: req.method
        });

        return res.status(500).json({
          success: false,
          message: `Controller not found for ${routeName}`,
          error: 'CONTROLLER_NOT_FOUND',
          controllerPath,
          routeName,
          methodName
        });
      }

      const handler = controller[methodName];
      
      if (typeof handler !== "function") {
        logger.error(`Controller method not found`, {
          controllerPath,
          methodName,
          routeName,
          route: req.path,
          method: req.method,
          availableMethods: Object.keys(controller)
        });

        return res.status(500).json({
          success: false,
          message: `${methodName} method not found in controller for ${routeName}`,
          error: 'CONTROLLER_METHOD_NOT_FOUND',
          controllerPath,
          methodName,
          routeName,
          availableMethods: Object.keys(controller)
        });
      }

      // Execute the handler safely
      return safeAsyncRoute(handler, `${routeName}.${methodName}`)(req, res, next);

    } catch (error) {
      logger.error(`Route loading error`, {
        controllerPath,
        methodName,
        routeName,
        route: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: `Failed to load route handler for ${routeName}`,
        error: 'ROUTE_LOADING_ERROR',
        controllerPath,
        methodName,
        routeName
      });
    }
  };
}

module.exports = {
  safeRoute,
  safeAsyncRoute,
  safeMiddleware,
  loadSafeRoute
};
