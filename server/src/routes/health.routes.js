const express = require('express');
const { getDatabaseState } = require('../config/db');
const env = require('../config/env');

const router = express.Router();

/**
 * GET /api/health
 * Returns service status, database state, uptime, and environment diagnostics.
 */
router.get('/health', (req, res) => {
  const dbState = getDatabaseState();
  const isDbConnected = dbState.code === 1;

  res.status(200).json({
    status: 'ok',
    service: 'flowforge-api',
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    pid: process.pid,
    timestamp: new Date().toISOString(),
    database: {
      connected: isDbConnected,
      state: dbState.state,
      name: dbState.name
    }
  });
});

module.exports = router;

