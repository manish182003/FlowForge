const createApp = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

async function startServer() {
  const app = createApp();

  // Attempt database connection
  try {
    await connectDB(env.MONGODB_URI);
  } catch (err) {
    if (env.NODE_ENV === 'production') {
      console.error('[Server] Critical: Database connection failed in production. Exiting.');
      process.exit(1);
    } else {
      console.warn('[Server] Notice: Database connection unavailable. Starting server in degraded mode.');
      console.warn('[Server] Set MONGODB_URI in .env (or run docker compose up -d) to connect database.');
    }
  }

  // Start HTTP Listener
  const server = app.listen(env.PORT, () => {
    console.log(`====================================================`);
    console.log(`FlowForge API Server running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Health check: http://localhost:${env.PORT}/api/health`);
    console.log(`====================================================`);
  });

  // Graceful Shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
    
    server.close(async () => {
      console.log('[Server] HTTP server closed to new connections.');
      try {
        await disconnectDB();
        console.log('[Server] Database connections closed.');
        process.exit(0);
      } catch (err) {
        console.error('[Server] Error during database shutdown:', err.message);
        process.exit(1);
      }
    });

    // Force exit if shutdown hangs beyond 10s
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };

