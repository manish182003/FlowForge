/**
 * 404 Not Found Middleware
 * Intercepts requests that do not match any defined routes and returns a structured JSON response.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      message: `Resource not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
      statusCode: 404
    }
  });
}

module.exports = notFoundHandler;

