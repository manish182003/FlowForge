const express = require('express');
const {
  listWorkers,
  expireWorkerLease,
  triggerReaperSweep
} = require('../controllers/chaos.controller');

const router = express.Router();

router.get('/workers', listWorkers);
router.post('/chaos/expire-lease', expireWorkerLease);
router.post('/chaos/trigger-reaper', triggerReaperSweep);

module.exports = router;

