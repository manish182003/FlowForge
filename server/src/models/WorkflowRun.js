const mongoose = require('mongoose');
const { WorkflowRunState } = require('../scheduler/stateMachine');

const workflowRunSchema = new mongoose.Schema(
  {
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true,
      index: true
    },
    workflowName: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(WorkflowRunState),
      default: WorkflowRunState.PENDING,
      index: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date,
      default: null
    },
    durationMs: {
      type: Number,
      default: null
    },
    totalTasks: {
      type: Number,
      default: 0
    },
    succeededTasks: {
      type: Number,
      default: 0
    },
    failedTasks: {
      type: Number,
      default: 0
    },
    triggeredBy: {
      type: String,
      default: 'manual'
    },
    error: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

workflowRunSchema.index({ workflowId: 1, createdAt: -1 });

const WorkflowRun = mongoose.model('WorkflowRun', workflowRunSchema);

module.exports = WorkflowRun;
