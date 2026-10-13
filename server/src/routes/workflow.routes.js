const express = require('express');
const {
  createWorkflow,
  listWorkflows,
  getWorkflowById,
  updateWorkflow,
  deleteWorkflow
} = require('../controllers/workflow.controller');

const router = express.Router();

router.route('/workflows')
  .post(createWorkflow)
  .get(listWorkflows);

router.route('/workflows/:id')
  .get(getWorkflowById)
  .put(updateWorkflow)
  .delete(deleteWorkflow);

module.exports = router;
