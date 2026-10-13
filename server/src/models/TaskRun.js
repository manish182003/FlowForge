const mongoose = require('mongoose');
const { TaskState } = require('../scheduler/stateMachine');

const taskRunSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowRun',
      required: true,
      index: true
    },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true
    },
    taskId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(TaskState),
      default: TaskState.BLOCKED,
      index: true
    },
    attempt: {
      type: Number,
      default: 0
    },
    maxRetries: {
      type: Number,
      default: 3
    },
    backoffMs: {
      type: Number,
      default: 1000
    },
    priority: {
      type: Number,
      default: 5
    },
    dependencies: {
      type: [String],
      default: []
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    output: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    workerId: {
      type: String,
      default: null
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    durationMs: {
      type: Number,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for fast lookup of a task within a specific run
taskRunSchema.index({ runId: 1, taskId: 1 }, { unique: true });
taskRunSchema.index({ runId: 1, status: 1 });

const TaskRun = mongoose.model('TaskRun', taskRunSchema);

module.exports = TaskRun;

