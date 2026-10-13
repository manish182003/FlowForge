const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const workflowRoutes = require('./routes/workflow.routes');
const runRoutes = require('./routes/run.routes');
const chaosRoutes = require('./routes/chaos.routes');
const notFoundHandler = require('./middleware/notFoundHandler');
const errorHandler = require('./middleware/errorHandler');

/**
 * Creates and configures the Express application instance.
 */
function createApp() {
  const app = express();

  // Security and cross-origin configuration
  app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true
  }));

  // JSON request body parser
  app.use(express.json());

  // Mount API routes
  app.use('/api', healthRoutes);
  app.use('/api', workflowRoutes);
  app.use('/api', runRoutes);
  app.use('/api', chaosRoutes);

  // 404 Handler for unmatched routes
  app.use(notFoundHandler);

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}

module.exports = createApp;

