const mongoose = require('mongoose');
const WorkflowRun = require('../models/WorkflowRun');
const TaskRun = require('../models/TaskRun');
const { startWorkflowRun, cancelWorkflowRun } = require('../scheduler/executionEngine');
const { getQueueMetrics } = require('../queue/queueManager');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * POST /api/workflows/:id/run
 * Triggers a new execution run of a workflow.
 */
async function triggerWorkflowRun(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid workflow ID: ${id}`, code: 'INVALID_ID' }
      });
    }

    const result = await startWorkflowRun(id, { triggeredBy: 'api' });
    res.status(201).json({
      success: true,
      data: {
        workflowRun: result.workflowRun,
        taskRuns: result.taskRuns
      }
    });
  } catch (error) {
    if (error.message.includes('Cyclic') || error.message.includes('Cycle')) {
      return res.status(400).json({
        success: false,
        error: { message: error.message, code: 'CYCLE_DETECTED' }
      });
    }
    next(error);
  }
}

/**
 * GET /api/workflows/:id/runs
 * Retrieves historical execution runs for a workflow.
 */
async function listWorkflowRuns(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid workflow ID: ${id}`, code: 'INVALID_ID' }
      });
    }

    const runs = await WorkflowRun.find({ workflowId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      data: runs
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/runs/:runId
 * Retrieves full snapshot of a run and all task runs.
 */
async function getRunSnapshot(req, res, next) {
  try {
    const { runId } = req.params;
    if (!isValidObjectId(runId)) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid run ID: ${runId}`, code: 'INVALID_ID' }
      });
    }

    const [workflowRun, taskRuns] = await Promise.all([
      WorkflowRun.findById(runId).lean(),
      TaskRun.find({ runId }).sort({ priority: -1 }).lean()
    ]);

    if (!workflowRun) {
      return res.status(404).json({
        success: false,
        error: { message: `WorkflowRun not found: ${runId}`, code: 'NOT_FOUND' }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        workflowRun,
        taskRuns
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/runs/:runId/cancel
 * Manually halts an active workflow run.
 */
async function cancelRun(req, res, next) {
  try {
    const { runId } = req.params;
    if (!isValidObjectId(runId)) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid run ID: ${runId}`, code: 'INVALID_ID' }
      });
    }

    const cancelledRun = await cancelWorkflowRun(runId, req.body.reason);
    res.status(200).json({
      success: true,
      data: cancelledRun
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/queue/metrics
 * Inspects queue depth and mode.
 */
async function getMetrics(req, res, next) {
  try {
    const metrics = await getQueueMetrics();
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  triggerWorkflowRun,
  listWorkflowRuns,
  getRunSnapshot,
  cancelRun,
  getMetrics
};
