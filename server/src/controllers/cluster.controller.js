const { clusterRing } = require('../scheduler/clusterRing');

/**
 * Controller for Cluster Consistent Hashing & Sharding endpoints.
 */

// GET /api/cluster/ring
async function getRingState(req, res, next) {
  try {
    const state = clusterRing.getState();
    res.json({
      success: true,
      data: state
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/cluster/ring/sync
async function syncWorkers(req, res, next) {
  try {
    await clusterRing.syncWithDatabaseWorkers();
    const state = clusterRing.getState();
    res.json({
      success: true,
      message: 'Synchronized hash ring with active database workers',
      data: state
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/cluster/ring/workers
async function addWorker(req, res, next) {
  try {
    const { workerId, weight = 1 } = req.body;
    if (!workerId || typeof workerId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'workerId must be a non-empty string'
      });
    }

    const state = clusterRing.addWorker(workerId.trim(), Number(weight) || 1);
    res.json({
      success: true,
      message: `Worker ${workerId} registered to hash ring`,
      data: state
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/cluster/ring/workers/:workerId
async function removeWorker(req, res, next) {
  try {
    const { workerId } = req.params;
    const result = clusterRing.removeWorker(workerId);
    if (!result.removed) {
      return res.status(404).json({
        success: false,
        error: `Worker ${workerId} not found on ring`
      });
    }

    res.json({
      success: true,
      message: `Worker ${workerId} removed from hash ring`,
      data: result.state
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/cluster/ring/route
async function routeKey(req, res, next) {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key string is required for routing'
      });
    }

    const routing = clusterRing.routeKey(String(key));
    if (!routing) {
      return res.status(400).json({
        success: false,
        error: 'Cannot route key: hash ring contains no active workers'
      });
    }

    res.json({
      success: true,
      data: routing
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/cluster/ring/simulate
async function simulateMigration(req, res, next) {
  try {
    const { sampleSize = 500, targetWorkerId = 'worker-delta', action = 'add' } = req.body;
    
    const simulation = clusterRing.simulateMigration(
      Math.min(5000, Math.max(50, Number(sampleSize) || 500)),
      targetWorkerId,
      action
    );

    res.json({
      success: true,
      data: simulation
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/cluster/ring/reset
async function resetCluster(req, res, next) {
  try {
    const state = clusterRing.resetDefaultCluster();
    res.json({
      success: true,
      message: 'Reset cluster hash ring to default demonstration nodes',
      data: state
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRingState,
  syncWorkers,
  addWorker,
  removeWorker,
  routeKey,
  simulateMigration,
  resetCluster
};
