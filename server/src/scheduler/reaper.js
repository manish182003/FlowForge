const WorkerHeartbeat = require('../models/WorkerHeartbeat');
const TaskRun = require('../models/TaskRun');
const WorkflowRun = require('../models/WorkflowRun');
const ExecutionLog = require('../models/ExecutionLog');
const { TaskState, WorkflowRunState, calculateBackoffWithJitter } = require('./stateMachine');
const { enqueueTaskJob } = require('../queue/queueManager');
const { broadcastEvent } = require('../websocket/wsServer');

let reaperInterval = null;

/**
 * Persists an execution log and immediately streams it via WebSockets.
 */
async function recordReaperLog(runId, taskId, level, message, details = null) {
  try {
    const logDoc = new ExecutionLog({
      runId,
      taskId: taskId || 'reaper',
      level,
      message,
      details,
      timestamp: new Date()
    });
    await logDoc.save();

    broadcastEvent('LOG_MESSAGE', {
      runId: runId ? runId.toString() : null,
      taskId: taskId || 'reaper',
      level,
      message,
      details,
      timestamp: logDoc.timestamp
    });
  } catch (_) {}
}

/**
 * Scans for dead workers and reclaims their orphaned in-flight tasks.
 * 
 * An orphaned task is a task whose status is RUNNING, but whose assigned worker
 * has not sent a heartbeat within leaseTimeoutMs.
 * 
 * @param {number} [leaseTimeoutMs=15000] - Threshold after which a worker is considered dead
 * @returns {Promise<{ deadWorkersCount: number, reclaimedTasksCount: number }>}
 */
async function reapOrphanedTasks(leaseTimeoutMs = 15000) {
  const cutoffTime = new Date(Date.now() - leaseTimeoutMs);

  // 1. Identify workers whose heartbeat has expired
  const deadWorkers = await WorkerHeartbeat.find({
    lastHeartbeat: { $lt: cutoffTime },
    status: { $ne: 'DEAD' }
  });

  let reclaimedTasksCount = 0;

  for (const worker of deadWorkers) {
    worker.status = 'DEAD';
    await worker.save();

    console.warn(`[Reaper] Worker "${worker.workerId}" has died (no heartbeat since ${worker.lastHeartbeat.toISOString()}).`);

    // 2. Find all tasks still marked RUNNING assigned to this dead worker
    const orphanedTasks = await TaskRun.find({
      workerId: worker.workerId,
      status: TaskState.RUNNING
    });

    for (const taskRun of orphanedTasks) {
      reclaimedTasksCount += 1;
      await reclaimSingleOrphanedTask(taskRun, worker.workerId);
    }
  }

  return {
    deadWorkersCount: deadWorkers.length,
    reclaimedTasksCount
  };
}

/**
 * Atomically reclaims a single orphaned task.
 * 
 * - If retries remain: transitions task to RETRY_WAIT and schedules re-enqueue.
 * - If retries exhausted: transitions task to FAILED, cancels downstream tasks, and fails WorkflowRun.
 * 
 * @param {Object} taskRun - Mongoose TaskRun document
 * @param {string} deadWorkerId - ID of the crashed worker
 */
async function reclaimSingleOrphanedTask(taskRun, deadWorkerId) {
  const nextAttempt = (taskRun.attempt || 0) + 1;
  const canRetry = nextAttempt <= taskRun.maxRetries;
  const now = new Date();

  const orphanError = {
    message: `Worker "${deadWorkerId}" crashed or lost heartbeat lease while executing task`,
    code: 'WORKER_CRASHED',
    timestamp: now.toISOString()
  };

  if (canRetry) {
    // Atomically transition from RUNNING -> RETRY_WAIT
    const updated = await TaskRun.findOneAndUpdate(
      { _id: taskRun._id, status: TaskState.RUNNING },
      {
        $set: {
          status: TaskState.RETRY_WAIT,
          attempt: nextAttempt,
          error: orphanError
        }
      },
      { new: true }
    );

    if (!updated) return; // Already claimed or transitioned

    const delayMs = calculateBackoffWithJitter(nextAttempt - 1, taskRun.backoffMs || 1000);

    broadcastEvent('TASK_STATE_CHANGED', {
      runId: taskRun.runId.toString(),
      taskRunId: taskRun._id.toString(),
      taskId: taskRun.taskId,
      name: taskRun.name,
      status: TaskState.RETRY_WAIT,
      attempt: nextAttempt,
      maxRetries: taskRun.maxRetries,
      delayMs,
      error: orphanError.message
    });
    await recordReaperLog(
      taskRun.runId,
      taskRun.taskId,
      'warn',
      `[Reaper] Reclaimed orphaned task "${taskRun.name}" from dead worker "${deadWorkerId}". Retrying in ${delayMs}ms (attempt ${nextAttempt}/${taskRun.maxRetries}).`
    );

    // Schedule re-enqueue after backoff
    const retryTimer = setTimeout(async () => {
      try {
        const refreshed = await TaskRun.findById(taskRun._id);
        if (refreshed && refreshed.status === TaskState.RETRY_WAIT) {
          refreshed.status = TaskState.QUEUED;
          await refreshed.save();

          await enqueueTaskJob({
            taskRunId: refreshed._id.toString(),
            runId: refreshed.runId.toString(),
            taskId: refreshed.taskId,
            name: refreshed.name,
            type: refreshed.type,
            input: refreshed.input,
            priority: refreshed.priority,
            attempt: refreshed.attempt,
            maxRetries: refreshed.maxRetries
          });

          broadcastEvent('TASK_STATE_CHANGED', {
            runId: refreshed.runId.toString(),
            taskRunId: refreshed._id.toString(),
            taskId: refreshed.taskId,
            name: refreshed.name,
            status: TaskState.QUEUED,
            attempt: refreshed.attempt
          });
          await recordReaperLog(refreshed.runId, refreshed.taskId, 'info', `[Reaper] Re-queued orphaned task "${refreshed.name}".`);
        }
      } catch (scheduleErr) {
        console.error('[Reaper] Failed to re-enqueue orphaned task:', scheduleErr.message);
      }
    }, delayMs);

    if (retryTimer && retryTimer.unref) {
      retryTimer.unref();
    }

    return updated;
  }

  // Retries exhausted -> Terminally mark FAILED
  const failedTask = await TaskRun.findOneAndUpdate(
    { _id: taskRun._id, status: TaskState.RUNNING },
    {
      $set: {
        status: TaskState.FAILED,
        error: orphanError,
        completedAt: now,
        durationMs: taskRun.startedAt ? now.getTime() - taskRun.startedAt.getTime() : 0
      }
    },
    { new: true }
  );

  if (!failedTask) return;

  broadcastEvent('TASK_STATE_CHANGED', {
    runId: taskRun.runId.toString(),
    taskRunId: taskRun._id.toString(),
    taskId: taskRun.taskId,
    name: taskRun.name,
    status: TaskState.FAILED,
    error: orphanError.message
  });
  await recordReaperLog(
    taskRun.runId,
    taskRun.taskId,
    'error',
    `[Reaper] Task "${taskRun.name}" failed permanently after worker "${deadWorkerId}" crash (retries exhausted).`
  );

  // Cancel downstream tasks that depended on this failed task
  const allRunTasks = await TaskRun.find({ runId: taskRun.runId });
  const failedTaskId = taskRun.taskId;

  for (const otherTask of allRunTasks) {
    if (otherTask.status === TaskState.BLOCKED && (otherTask.dependencies || []).includes(failedTaskId)) {
      otherTask.status = TaskState.CANCELLED;
      otherTask.error = { message: `Cancelled due to upstream worker crash failure in: ${failedTaskId}` };
      await otherTask.save();

      broadcastEvent('TASK_STATE_CHANGED', {
        runId: otherTask.runId.toString(),
        taskRunId: otherTask._id.toString(),
        taskId: otherTask.taskId,
        name: otherTask.name,
        status: TaskState.CANCELLED,
        error: otherTask.error.message
      });
      await recordReaperLog(otherTask.runId, otherTask.taskId, 'warn', otherTask.error.message);
    }
  }

  // Terminate WorkflowRun as FAILED
  const workflowRun = await WorkflowRun.findById(taskRun.runId);
  if (workflowRun && workflowRun.status === WorkflowRunState.RUNNING) {
    workflowRun.status = WorkflowRunState.FAILED;
    workflowRun.completedAt = now;
    workflowRun.durationMs = workflowRun.startedAt ? now.getTime() - workflowRun.startedAt.getTime() : 0;
    workflowRun.error = `Workflow failed due to dead worker "${deadWorkerId}" on task "${taskRun.taskId}"`;
    await workflowRun.save();

    broadcastEvent('WORKFLOW_STATE_CHANGED', {
      runId: workflowRun._id.toString(),
      status: WorkflowRunState.FAILED,
      durationMs: workflowRun.durationMs,
      error: workflowRun.error
    });
    await recordReaperLog(workflowRun._id, 'workflow', 'error', workflowRun.error);
  }
}

/**
 * Starts the background reaper watchdog loop.
 * 
 * @param {number} [intervalMs=10000] - How frequently to sweep for dead workers
 * @param {number} [leaseTimeoutMs=15000] - Lease timeout threshold
 */
function startReaper(intervalMs = 10000, leaseTimeoutMs = 15000) {
  if (reaperInterval) return;

  console.log(`[Reaper] Watchdog service started (interval: ${intervalMs}ms, lease timeout: ${leaseTimeoutMs}ms).`);
  reaperInterval = setInterval(async () => {
    try {
      await reapOrphanedTasks(leaseTimeoutMs);
    } catch (err) {
      console.error('[Reaper] Error during orphan reclamation cycle:', err.message);
    }
  }, intervalMs);
}

/**
 * Stops the background reaper watchdog loop.
 */
function stopReaper() {
  if (reaperInterval) {
    clearInterval(reaperInterval);
    reaperInterval = null;
    console.log('[Reaper] Watchdog service stopped.');
  }
}

module.exports = {
  reapOrphanedTasks,
  reclaimSingleOrphanedTask,
  startReaper,
  stopReaper
};

