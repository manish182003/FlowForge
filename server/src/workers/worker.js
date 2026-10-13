const os = require('os');
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const WorkerHeartbeat = require('../models/WorkerHeartbeat');
const { executeTaskHandler } = require('../task-handlers/registry');
const { 
  claimTaskForExecution, 
  handleTaskCompletion, 
  handleTaskFailure 
} = require('../scheduler/executionEngine');
const { getQueue } = require('../queue/queueManager');

const QUEUE_NAME = 'flowforge-tasks';

class WorkerService {
  constructor(options = {}) {
    this.concurrency = options.concurrency || parseInt(process.env.WORKER_CONCURRENCY, 10) || 2;
    this.workerId = options.workerId || `worker-${os.hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
    this.activeJobs = 0;
    this.status = 'healthy';
    this.heartbeatTimer = null;
    this.bullWorker = null;
    this.inMemoryPollTimer = null;
    this.isShuttingDown = false;
  }

  async start() {
    console.log(`[Worker] Starting worker process "${this.workerId}" (concurrency: ${this.concurrency})...`);

    // Ensure database connection
    try {
      await connectDB(env.MONGODB_URI);
    } catch (_) {
      console.warn('[Worker] Running with degraded or mocked database connection.');
    }

    // Start periodic heartbeat
    await this._sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this._sendHeartbeat(), 10000);

    const queue = getQueue();

    if (queue.mode === 'in-memory') {
      console.log(`[Worker] Connected to In-Memory Queue Adapter. Starting polling loop...`);
      this._startInMemoryPolling(queue);
    } else {
      console.log(`[Worker] Connected to BullMQ Redis Queue "${QUEUE_NAME}".`);
      const connection = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false
      });

      this.bullWorker = new Worker(
        QUEUE_NAME,
        async (job) => this.processJob(job.data),
        {
          connection,
          concurrency: this.concurrency
        }
      );

      this.bullWorker.on('error', (err) => {
        console.error('[Worker] BullMQ worker error:', err.message);
      });
    }

    console.log(`[Worker] Worker "${this.workerId}" ready and waiting for jobs.`);
  }

  /**
   * Processes an individual task job payload.
   * 
   * @param {Object} jobData
   */
  async processJob(jobData) {
    const { taskRunId, runId, taskId, type, input, attempt } = jobData;
    this.activeJobs++;

    try {
      // Step 1: Claim task atomically in MongoDB
      const claimed = await claimTaskForExecution(taskRunId, this.workerId);
      if (!claimed) {
        console.log(`[Worker] Task "${taskId}" already claimed or cancelled. Skipping.`);
        return { skipped: true };
      }

      console.log(`[Worker] Executing task "${taskId}" [${type}] for run "${runId}"...`);

      // Step 2: Execute task handler
      const result = await executeTaskHandler(type, input, {
        taskRunId,
        runId,
        taskId,
        attempt: attempt || 0,
        workerId: this.workerId
      });

      // Step 3: Handle completion & downstream propagation
      await handleTaskCompletion(taskRunId, result);
      console.log(`[Worker] Task "${taskId}" completed successfully.`);
      return result;
    } catch (error) {
      console.error(`[Worker] Task "${taskId}" execution failed:`, error.message);
      // Step 4: Handle failure & retry backoff
      await handleTaskFailure(taskRunId, error, true);
      throw error;
    } finally {
      this.activeJobs = Math.max(0, this.activeJobs - 1);
    }
  }

  /**
   * In-Memory Polling loop for local/test environments without Redis.
   */
  _startInMemoryPolling(inMemoryQueue) {
    const poll = async () => {
      if (this.isShuttingDown) return;

      if (this.activeJobs < this.concurrency && inMemoryQueue.jobs.length > 0) {
        const item = inMemoryQueue.jobs.shift();
        if (item && item.job) {
          // Process in background without blocking polling loop
          this.processJob(item.job.data).catch(() => {});
        }
      }

      this.inMemoryPollTimer = setTimeout(poll, 150);
    };

    poll();
  }

  async _sendHeartbeat() {
    try {
      await WorkerHeartbeat.findOneAndUpdate(
        { workerId: this.workerId },
        {
          $set: {
            hostname: os.hostname(),
            pid: process.pid,
            concurrency: this.concurrency,
            activeJobs: this.activeJobs,
            status: this.status,
            lastHeartbeat: new Date()
          },
          $setOnInsert: {
            startedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
    } catch (_) {
      // Non-fatal if DB is degraded
    }
  }

  async stop() {
    console.log(`[Worker] Shutting down worker "${this.workerId}"...`);
    this.isShuttingDown = true;
    this.status = 'shutting_down';

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.inMemoryPollTimer) clearTimeout(this.inMemoryPollTimer);

    if (this.bullWorker) {
      await this.bullWorker.close();
    }

    try {
      await WorkerHeartbeat.deleteOne({ workerId: this.workerId });
    } catch (_) {}

    console.log(`[Worker] Worker "${this.workerId}" stopped cleanly.`);
  }
}

// Standalone CLI Entrypoint
if (require.main === module) {
  const workerService = new WorkerService();
  workerService.start();

  const shutdown = async (signal) => {
    console.log(`\n[Worker] Received ${signal}. Starting graceful shutdown...`);
    await workerService.stop();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { WorkerService };

