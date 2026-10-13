const mongoose = require('mongoose');

const executionLogSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkflowRun',
      required: true,
      index: true
    },
    taskId: {
      type: String,
      required: true,
      index: true
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug'],
      default: 'info'
    },
    message: {
      type: String,
      required: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

executionLogSchema.index({ runId: 1, timestamp: 1 });

const ExecutionLog = mongoose.model('ExecutionLog', executionLogSchema);

module.exports = ExecutionLog;

