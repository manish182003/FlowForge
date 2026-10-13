const mongoose = require('mongoose');

const taskSubSchema = new mongoose.Schema(
  {
    taskId: {
      type: String,
      required: [true, 'taskId is required'],
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Task name is required'],
      trim: true
    },
    type: {
      type: String,
      required: [true, 'Task type is required'],
      enum: [
        'simulated',
        'http_request',
        'file_validation',
        'data_transformation',
        'report_generation'
      ]
    },
    dependencies: {
      type: [String],
      default: []
    },
    priority: {
      type: Number,
      default: 5,
      min: 1,
      max: 10
    },
    retryPolicy: {
      maxRetries: { type: Number, default: 3, min: 0, max: 10 },
      backoffMs: { type: Number, default: 1000, min: 100 }
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    uiPosition: {
      x: { type: Number, default: 100 },
      y: { type: Number, default: 100 }
    }
  },
  { _id: false } // Subdocuments don't need their own MongoDB ObjectId since taskId is the logical identifier
);

const workflowSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Workflow name is required'],
      trim: true,
      maxlength: 128
    },
    description: {
      type: String,
      default: '',
      maxlength: 512,
      trim: true
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft'
    },
    tasks: {
      type: [taskSubSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// Indexes for query performance
workflowSchema.index({ name: 1 });
workflowSchema.index({ createdAt: -1 });

const Workflow = mongoose.model('Workflow', workflowSchema);

module.exports = Workflow;
