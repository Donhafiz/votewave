const { authenticate, authorize, optionalAuth } = require('./auth');
const { authLimiter, apiLimiter, voteLimiter, aiLimiter } = require('./rateLimit');
const { errorHandler, notFound } = require('./errorHandler');
const { upload, handleUploadError } = require('./upload');
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
