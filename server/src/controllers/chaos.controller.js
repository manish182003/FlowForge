const WorkerHeartbeat = require('../models/WorkerHeartbeat');
const { reapOrphanedTasks } = require('../scheduler/reaper');

/**
 * GET /api/workers
 * Lists all registered workers, their status, and heartbeat timestamps.
 */
async function listWorkers(req, res, next) {
  try {
    const workers = await WorkerHeartbeat.find()
      .sort({ lastHeartbeat: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: workers
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/chaos/expire-lease
 * Chaos Engineering: Artificially sets a worker's lastHeartbeat to the past (e.g. 60s ago)
 * to simulate an ungraceful crash / network partition without killing the process.
 */
async function expireWorkerLease(req, res, next) {
  try {
    const { workerId, pastMs = 60000 } = req.body;
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: { message: 'workerId is required', code: 'MISSING_PARAM' }
      });
    }

    const pastDate = new Date(Date.now() - pastMs);
    const worker = await WorkerHeartbeat.findOneAndUpdate(
      { workerId },
      { $set: { lastHeartbeat: pastDate } },
      { new: true }
    );

    if (!worker) {
      return res.status(404).json({
        success: false,
        error: { message: `Worker not found: ${workerId}`, code: 'NOT_FOUND' }
      });
    }

    res.status(200).json({
      success: true,
      message: `Worker lease expired. lastHeartbeat set to ${pastDate.toISOString()}`,
      data: worker
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/chaos/trigger-reaper
 * Chaos Engineering: Immediately triggers an on-demand Reaper sweep.
 */
async function triggerReaperSweep(req, res, next) {
  try {
    const leaseTimeoutMs = req.body.leaseTimeoutMs || 15000;
    const result = await reapOrphanedTasks(leaseTimeoutMs);

    res.status(200).json({
      success: true,
      message: `Reaper sweep executed. Dead workers: ${result.deadWorkersCount}, Reclaimed tasks: ${result.reclaimedTasksCount}`,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listWorkers,
  expireWorkerLease,
  triggerReaperSweep
};

