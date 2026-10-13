const mongoose = require('mongoose');

const workerHeartbeatSchema = new mongoose.Schema(
  {
    workerId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    hostname: {
      type: String,
      default: 'localhost'
    },
    pid: {
      type: Number,
      required: true
    },
    concurrency: {
      type: Number,
      default: 2
    },
    activeJobs: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['healthy', 'busy', 'shutting_down', 'dead'],
      default: 'healthy',
      index: true
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now,
      index: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

const WorkerHeartbeat = mongoose.model('WorkerHeartbeat', workerHeartbeatSchema);

module.exports = WorkerHeartbeat;

