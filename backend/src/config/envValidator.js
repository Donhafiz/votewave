// Environment validation on startup
const requiredEnvVars = [
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'SESSION_SECRET'
];

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'FRONTEND_URL',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER'
];

const validateEnvironment = () => {
  const missing = [];
  const warnings = [];
  
  // Check required variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });
  
  // Check optional variables with defaults
  optionalEnvVars.forEach(varName => {
    if (process.env[varName]) {
      // Validate format if present
      if (varName === 'PORT' && isNaN(process.env[varName])) {
        warnings.push(`${varName} must be a valid number`);
      }
      
      if (varName === 'NODE_ENV' && !['development', 'production', 'test'].includes(process.env[varName])) {
        warnings.push(`${varName} must be development, production, or test`);
      }
      
      if (varName.includes('EMAIL_') && process.env[varName] && !process.env[varName].includes('@')) {
        warnings.push(`${varName} should be a valid email address`);
      }
    }
  });
  
  // Report results
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`  - ${varName}`));
    console.error('\nPlease set these variables and restart the server.');
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️ Environment warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
  
  // Log successful validation
  console.log('✅ Environment validation passed');
  
  return {
    isValid: missing.length === 0,
    missing,
    warnings,
    config: {
      database: process.env.MONGODB_URI,
      redis: process.env.REDIS_URL,
      port: process.env.PORT || 5000,
      environment: process.env.NODE_ENV || 'development',
      frontend: process.env.FRONTEND_URL || 'http://localhost:3000'
    }
  };
};

module.exports = {
  validateEnvironment
};
