const express = require('express');
const {
  createWorkflow,
  listWorkflows,
  getWorkflowById,
  updateWorkflow,
  deleteWorkflow,
  analyzeWorkflow
} = require('../controllers/workflow.controller');

const router = express.Router();

router.route('/workflows')
  .post(createWorkflow)
  .get(listWorkflows);

router.route('/workflows/:id')
  .get(getWorkflowById)
  .put(updateWorkflow)
  .delete(deleteWorkflow);

router.get('/workflows/:id/analysis', analyzeWorkflow);

module.exports = router;

