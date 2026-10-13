const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const env = require('../config/env');

const QUEUE_NAME = 'flowforge-tasks';

/**
 * In-Memory Queue Adapter
 * Provides the exact same interface as BullMQ for testing and local environments
 * when a physical Redis instance is not connected.
 */
class InMemoryQueueAdapter {
  constructor() {
    this.jobs = [];
    this.mode = 'in-memory';
  }

  async add(name, data, opts = {}) {
    const job = {
      id: `mem_job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      data,
      opts,
      timestamp: Date.now()
    };
    // Higher priority first
    const priority = opts.priority || 5;
    this.jobs.push({ job, priority });
    this.jobs.sort((a, b) => b.priority - a.priority);
    return job;
  }

  async getWaitingCount() {
    return this.jobs.length;
  }

  async getActiveCount() {
    return 0;
  }

  async getJobCounts() {
    return {
      waiting: this.jobs.length,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    };
  }

  async close() {
    this.jobs = [];
  }
}

let activeQueueInstance = null;
let redisConnection = null;

/**
 * Initializes and returns the Queue instance (BullMQ with Redis or In-Memory fallback).
 */
function getQueue() {
  if (activeQueueInstance) {
    return activeQueueInstance;
  }

  // If in test environment or Redis not requested, default to in-memory
  if (env.NODE_ENV === 'test') {
    activeQueueInstance = new InMemoryQueueAdapter();
    return activeQueueInstance;
  }

  try {
    redisConnection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => null // Don't hang indefinitely if Redis is down
    });

    activeQueueInstance = new Queue(QUEUE_NAME, {
      connection: redisConnection
    });
    activeQueueInstance.mode = 'bullmq';
  } catch (err) {
    console.warn('[QueueManager] Redis unavailable, falling back to In-Memory Queue Adapter.');
    activeQueueInstance = new InMemoryQueueAdapter();
  }

  return activeQueueInstance;
}

/**
 * Enqueues an eligible task job.
 * 
 * @param {Object} jobData
 * @param {string} jobData.taskRunId
 * @param {string} jobData.runId
 * @param {string} jobData.taskId
 * @param {string} jobData.type
 * @param {number} jobData.priority
 * @param {Object} [options]
 */
async function enqueueTaskJob(jobData, options = {}) {
  const queue = getQueue();
  const priority = jobData.priority || 5;

  return queue.add('execute-task', jobData, {
    priority: 11 - priority, // BullMQ: lower number = higher priority (1 is highest)
    attempts: 1, // We control retries explicitly in our own state machine rather than blindly relying on BullMQ
    ...options
  });
}

/**
 * Retrieves current queue metrics.
 */
async function getQueueMetrics() {
  const queue = getQueue();
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
  return {
    mode: queue.mode || 'bullmq',
    queueName: QUEUE_NAME,
    counts
  };
}

/**
 * Cleanly closes queue and Redis connections.
 */
async function closeQueue() {
  if (activeQueueInstance) {
    await activeQueueInstance.close();
    activeQueueInstance = null;
  }
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}

module.exports = {
  getQueue,
  enqueueTaskJob,
  getQueueMetrics,
  closeQueue,
  InMemoryQueueAdapter
};

