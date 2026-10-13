const express = require('express');
const router = express.Router();
const clusterController = require('../controllers/cluster.controller');

/**
 * Cluster Sharding & Consistent Hashing Routes
 */

// Ring state and inspection
router.get('/cluster/ring', clusterController.getRingState);
router.post('/cluster/ring/sync', clusterController.syncWorkers);
router.post('/cluster/ring/reset', clusterController.resetCluster);

// Worker node management on the ring
router.post('/cluster/ring/workers', clusterController.addWorker);
router.delete('/cluster/ring/workers/:workerId', clusterController.removeWorker);

// Key routing & migration simulation
router.post('/cluster/ring/route', clusterController.routeKey);
router.post('/cluster/ring/simulate', clusterController.simulateMigration);

module.exports = router;
