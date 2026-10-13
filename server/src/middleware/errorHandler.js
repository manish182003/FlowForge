const env = require('../config/env');

/**
 * Centralized Error-Handling Middleware
 * Express identifies this as an error handler because it has exactly 4 parameters (err, req, res, next).
 */
function errorHandler(err, req, res, next) {
  // If headers were already sent to client, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProduction = env.NODE_ENV === 'production';

  // Log error with context for debugging
  console.error(`[Error] ${req.method} ${req.originalUrl} - ${err.message}`);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR',
      statusCode: statusCode,
      // Never leak stack traces to client in production
      ...(isProduction ? {} : { stack: err.stack })
    }
  });
}

module.exports = errorHandler;

