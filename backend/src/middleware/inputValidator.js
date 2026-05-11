const { body, validationResult } = require('express-validator');

// Common validation schemas
const schemas = {
  register: {
    firstName: {
      notEmpty: { errorMessage: 'First name is required' },
      isLength: { options: { min: 2, max: 50 }, errorMessage: 'First name must be 2-50 characters' },
      matches: { options: [/^[a-zA-Z\s'-]+$/], errorMessage: 'First name can only contain letters, spaces, hyphens, and apostrophes' }
    },
    lastName: {
      notEmpty: { errorMessage: 'Last name is required' },
      isLength: { options: { min: 2, max: 50 }, errorMessage: 'Last name must be 2-50 characters' },
      matches: { options: [/^[a-zA-Z\s'-]+$/], errorMessage: 'Last name can only contain letters, spaces, hyphens, and apostrophes' }
    },
    email: {
      notEmpty: { errorMessage: 'Email is required' },
      isEmail: { errorMessage: 'Please provide a valid email address' },
      normalizeEmail: true
    },
    password: {
      notEmpty: { errorMessage: 'Password is required' },
      isLength: { options: { min: 8 }, errorMessage: 'Password must be at least 8 characters long' },
      matches: { 
        options: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/],
        errorMessage: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' 
      }
    }
  },
  
  login: {
    email: {
      notEmpty: { errorMessage: 'Email is required' },
      isEmail: { errorMessage: 'Please provide a valid email address' }
    },
    password: {
      notEmpty: { errorMessage: 'Password is required' }
    }
  },
  
  election: {
    title: {
      notEmpty: { errorMessage: 'Election title is required' },
      isLength: { options: { min: 3, max: 100 }, errorMessage: 'Title must be 3-100 characters' }
    },
    description: {
      notEmpty: { errorMessage: 'Description is required' },
      isLength: { options: { max: 1000 }, errorMessage: 'Description must be less than 1000 characters' }
    },
    startDate: {
      notEmpty: { errorMessage: 'Start date is required' },
      isISO8601: { errorMessage: 'Please provide a valid date' }
    },
    endDate: {
      notEmpty: { errorMessage: 'End date is required' },
      isISO8601: { errorMessage: 'Please provide a valid date' },
      custom: {
        options: {
          value: (value, { req }) => {
            if (!req.body.startDate) return true;
            return new Date(value) > new Date(req.body.startDate);
          },
          errorMessage: 'End date must be after start date'
        }
      }
    }
  },
  
  vote: {
    electionId: {
      notEmpty: { errorMessage: 'Election ID is required' },
      isMongoId: { errorMessage: 'Please provide a valid election ID' }
    },
    candidateId: {
      notEmpty: { errorMessage: 'Candidate ID is required' },
      isMongoId: { errorMessage: 'Please provide a valid candidate ID' }
    }
  }
};

// Validation middleware factory
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const validationRules = schemas[schema];
    if (!validationRules) {
      return res.status(400).json({
        success: false,
        message: 'Validation schema not found',
        error: 'VALIDATION_SCHEMA_NOT_FOUND'
      });
    }

    const validations = Object.keys(validationRules).map(field => ({
      field,
      chain: validationRules[field]
    }));

    // Run validations
    validations.forEach(validation => {
      req.check(validation.field, validation.chain);
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next();
    }

    // Format validation errors
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: formattedErrors,
      error: 'VALIDATION_FAILED'
    });
  };
};

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Remove potentially dangerous characters
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*<\/script>)>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*<\/iframe>)>/gi, '')
          .trim();
      }
    });
  }

  // Clean query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*<\/script>)>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*<\/iframe>)>/gi, '')
          .trim();
      }
    });
  }

  next();
};

module.exports = {
  validate,
  sanitizeInput,
  schemas
};
