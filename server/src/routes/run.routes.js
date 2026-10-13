const express = require('express');
const {
  triggerWorkflowRun,
  listWorkflowRuns,
  getRunSnapshot,
  cancelRun,
  getMetrics
} = require('../controllers/run.controller');

const router = express.Router();

router.post('/workflows/:id/run', triggerWorkflowRun);
router.get('/workflows/:id/runs', listWorkflowRuns);
router.get('/runs/:runId', getRunSnapshot);
router.post('/runs/:runId/cancel', cancelRun);
router.get('/queue/metrics', getMetrics);

module.exports = router;

