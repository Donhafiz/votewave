const { authenticate, authorize, optionalAuth } = require('./auth');
const { authLimiter, apiLimiter, voteLimiter, uploadLimiter } = require('./rateLimit');
const { errorHandler, notFound } = require('./errorHandler');
const { upload, handleUploadError } = require('./upload');
const { validate, sanitizeInput, schemas } = require('./inputValidator');
const { errorHandler: enhancedErrorHandler, recoveryMiddleware, executeWithRetry, executeWithFallback } = require('./enhancedErrorHandler');
const {
  handleValidationErrors,
  registerValidation,
  loginValidation,
  electionValidation,
  candidateValidation,
  voteValidation,
  profileValidation,
  passwordChangeValidation,
} = require('./validation');

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  authLimiter,
  apiLimiter,
  voteLimiter,
  aiLimiter,
  errorHandler,
  notFound,
  upload,
  handleUploadError,
  handleValidationErrors,
  registerValidation,
  loginValidation,
  electionValidation,
  candidateValidation,
  voteValidation,
  profileValidation,
  passwordChangeValidation,
};
