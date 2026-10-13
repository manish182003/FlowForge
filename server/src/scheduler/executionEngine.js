const Workflow = require('../models/Workflow');
const WorkflowRun = require('../models/WorkflowRun');
const TaskRun = require('../models/TaskRun');
const ExecutionLog = require('../models/ExecutionLog');
const { 
  TaskState, 
  WorkflowRunState, 
  assertValidTaskTransition, 
  calculateBackoffWithJitter 
} = require('./stateMachine');
const { detectCycle, findReadyTasks } = require('../algorithms/graph');
const { enqueueTaskJob } = require('../queue/queueManager');
const { broadcastEvent } = require('../websocket/wsServer');

/**
 * Persists an execution log to MongoDB and immediately streams it via WebSockets.
 */
async function recordLog(runId, taskId, level, message, details = null) {
  try {
    const logDoc = new ExecutionLog({
      runId,
      taskId,
      level,
      message,
      details,
      timestamp: new Date()
    });
    await logDoc.save();

    broadcastEvent('LOG_MESSAGE', {
      runId: runId.toString(),
      taskId,
      level,
      message,
      details,
      timestamp: logDoc.timestamp
    });
  } catch (_) {
    // Non-fatal if logging storage has a transient error
  }
}

/**
 * Initializes and starts a new Workflow Run.
 * 
 * 1. Loads and validates workflow graph.
 * 2. Creates durable WorkflowRun and TaskRun records in MongoDB.
 * 3. Enqueues initial ready tasks (in-degree == 0).
 * 
 * @param {string} workflowId - MongoDB ObjectId of the workflow
 * @param {Object} [options]
 * @returns {Promise<{ workflowRun: Object, taskRuns: Object[] }>}
 */
async function startWorkflowRun(workflowId, options = {}) {
  const workflow = await Workflow.findById(workflowId).lean();
  if (!workflow) {
    throw new Error(`Workflow not found with ID: ${workflowId}`);
  }

  const tasks = workflow.tasks || [];
  if (tasks.length === 0) {
    throw new Error('Cannot execute an empty workflow with no tasks.');
  }

  // 1. Graph Cycle Pre-flight Check
  const cycleCheck = detectCycle(tasks);
  if (cycleCheck.hasCycle) {
    throw new Error(`Cannot execute cyclic workflow! Trapped nodes: ${cycleCheck.cycleNodes.join(', ')}`);
  }

  // 2. Create durable WorkflowRun aggregate record
  const workflowRun = new WorkflowRun({
    workflowId: workflow._id,
    workflowName: workflow.name,
    status: WorkflowRunState.PENDING,
    totalTasks: tasks.length,
    triggeredBy: options.triggeredBy || 'manual',
    startedAt: new Date()
  });
  await workflowRun.save();

  // 3. Create durable TaskRun records
  // Tasks with 0 prerequisites start in QUEUED; others start in BLOCKED
  const taskRunDocs = tasks.map(task => {
    const isRoot = !task.dependencies || task.dependencies.length === 0;
    return {
      runId: workflowRun._id,
      workflowId: workflow._id,
      taskId: task.taskId,
      name: task.name,
      type: task.type,
      status: isRoot ? TaskState.QUEUED : TaskState.BLOCKED,
      priority: task.priority || 5,
      maxRetries: task.retryPolicy?.maxRetries ?? 3,
      backoffMs: task.retryPolicy?.backoffMs ?? 1000,
      dependencies: task.dependencies || [],
      input: task.input || {}
    };
  });

  const createdTaskRuns = await TaskRun.insertMany(taskRunDocs);

  // 4. Transition WorkflowRun to RUNNING
  workflowRun.status = WorkflowRunState.RUNNING;
  await workflowRun.save();

  broadcastEvent('WORKFLOW_STATE_CHANGED', {
    runId: workflowRun._id.toString(),
    status: WorkflowRunState.RUNNING,
    workflowName: workflowRun.workflowName,
    totalTasks: workflowRun.totalTasks
  });
  await recordLog(workflowRun._id, 'workflow', 'info', `Workflow "${workflowRun.workflowName}" execution started.`);

  // 5. Enqueue all initial QUEUED root tasks
  const initialQueuedTasks = createdTaskRuns.filter(tr => tr.status === TaskState.QUEUED);
  for (const taskRun of initialQueuedTasks) {
    await enqueueTaskJob({
      taskRunId: taskRun._id.toString(),
      runId: workflowRun._id.toString(),
      taskId: taskRun.taskId,
      name: taskRun.name,
      type: taskRun.type,
      input: taskRun.input,
      priority: taskRun.priority,
      attempt: taskRun.attempt,
      maxRetries: taskRun.maxRetries
    });

    broadcastEvent('TASK_STATE_CHANGED', {
      runId: workflowRun._id.toString(),
      taskRunId: taskRun._id.toString(),
      taskId: taskRun.taskId,
      name: taskRun.name,
      status: TaskState.QUEUED,
      priority: taskRun.priority
    });
    await recordLog(workflowRun._id, taskRun.taskId, 'info', `Root task "${taskRun.name}" queued for execution.`);
  }

  return {
    workflowRun,
    taskRuns: createdTaskRuns
  };
}

/**
 * Claims a QUEUED task for a worker.
 * Uses atomic conditional update to guarantee that only one worker process
 * can claim the task (prevents race conditions and duplicate executions).
 * 
 * @param {string} taskRunId
 * @param {string} workerId
 * @returns {Promise<Object|null>} Updated TaskRun or null if already claimed
 */
async function claimTaskForExecution(taskRunId, workerId) {
  const updated = await TaskRun.findOneAndUpdate(
    { 
      _id: taskRunId, 
      status: TaskState.QUEUED 
    },
    {
      $set: {
        status: TaskState.RUNNING,
        workerId: workerId || 'worker-default',
        startedAt: new Date()
      }
    },
    { new: true }
  ).lean();

  if (updated) {
    broadcastEvent('TASK_STATE_CHANGED', {
      runId: updated.runId.toString(),
      taskRunId: updated._id.toString(),
      taskId: updated.taskId,
      status: TaskState.RUNNING,
      workerId: updated.workerId
    });
    await recordLog(updated.runId, updated.taskId, 'info', `Task claimed by worker "${updated.workerId}".`);
  }

  return updated;
}

/**
 * Handles successful completion of a task.
 * 
 * 1. Transitions task to SUCCEEDED.
 * 2. Evaluates downstream dependent tasks.
 * 3. Promotes newly eligible tasks from BLOCKED -> QUEUED and enqueues them.
 * 4. Completes WorkflowRun if all tasks are SUCCEEDED.
 * 
 * @param {string} taskRunId
 * @param {Object} [output]
 */
async function handleTaskCompletion(taskRunId, output = {}) {
  const taskRun = await TaskRun.findById(taskRunId);
  if (!taskRun) {
    throw new Error(`TaskRun not found: ${taskRunId}`);
  }

  assertValidTaskTransition(taskRun.status, TaskState.SUCCEEDED, taskRun.taskId);

  const now = new Date();
  const started = taskRun.startedAt || now;
  const durationMs = now.getTime() - started.getTime();

  taskRun.status = TaskState.SUCCEEDED;
  taskRun.output = output;
  taskRun.completedAt = now;
  taskRun.durationMs = durationMs;
  await taskRun.save();

  broadcastEvent('TASK_STATE_CHANGED', {
    runId: taskRun.runId.toString(),
    taskRunId: taskRun._id.toString(),
    taskId: taskRun.taskId,
    name: taskRun.name,
    status: TaskState.SUCCEEDED,
    durationMs,
    output
  });
  await recordLog(taskRun.runId, taskRun.taskId, 'info', `Task "${taskRun.name}" completed successfully in ${durationMs}ms.`, { output });

  // Load all tasks for this run to evaluate dependencies
  const allRunTasks = await TaskRun.find({ runId: taskRun.runId });
  const completedTaskIds = new Set(
    allRunTasks
      .filter(t => t.status === TaskState.SUCCEEDED)
      .map(t => t.taskId)
  );
  const activeOrQueuedTaskIds = new Set(
    allRunTasks
      .filter(t => [TaskState.QUEUED, TaskState.RUNNING, TaskState.RETRY_WAIT].includes(t.status))
      .map(t => t.taskId)
  );

  // Identify newly ready tasks using Module 3 algorithm
  const taskSpecs = allRunTasks.map(t => ({
    taskId: t.taskId,
    dependencies: t.dependencies
  }));
  const readyTaskIds = findReadyTasks(taskSpecs, completedTaskIds, activeOrQueuedTaskIds);

  // Transition and enqueue newly eligible tasks
  for (const readyId of readyTaskIds) {
    const targetTask = allRunTasks.find(t => t.taskId === readyId);
    if (targetTask && targetTask.status === TaskState.BLOCKED) {
      assertValidTaskTransition(targetTask.status, TaskState.QUEUED, targetTask.taskId);
      targetTask.status = TaskState.QUEUED;
      await targetTask.save();

      await enqueueTaskJob({
        taskRunId: targetTask._id.toString(),
        runId: taskRun.runId.toString(),
        taskId: targetTask.taskId,
        name: targetTask.name,
        type: targetTask.type,
        input: targetTask.input,
        priority: targetTask.priority,
        attempt: targetTask.attempt,
        maxRetries: targetTask.maxRetries
      });

      broadcastEvent('TASK_STATE_CHANGED', {
        runId: taskRun.runId.toString(),
        taskRunId: targetTask._id.toString(),
        taskId: targetTask.taskId,
        name: targetTask.name,
        status: TaskState.QUEUED,
        priority: targetTask.priority
      });
      await recordLog(taskRun.runId, targetTask.taskId, 'info', `Prerequisites satisfied. Task "${targetTask.name}" queued.`);
    }
  }

  // Check if all tasks in the workflow have succeeded
  const allSucceeded = allRunTasks.every(t => 
    t._id.equals(taskRun._id) ? true : t.status === TaskState.SUCCEEDED
  );

  if (allSucceeded) {
    const workflowRun = await WorkflowRun.findById(taskRun.runId);
    if (workflowRun && workflowRun.status === WorkflowRunState.RUNNING) {
      workflowRun.status = WorkflowRunState.SUCCEEDED;
      workflowRun.completedAt = now;
      workflowRun.durationMs = now.getTime() - workflowRun.startedAt.getTime();
      workflowRun.succeededTasks = allRunTasks.length;
      await workflowRun.save();

      broadcastEvent('WORKFLOW_STATE_CHANGED', {
        runId: workflowRun._id.toString(),
        status: WorkflowRunState.SUCCEEDED,
        durationMs: workflowRun.durationMs,
        succeededTasks: workflowRun.succeededTasks
      });
      await recordLog(workflowRun._id, 'workflow', 'info', `Workflow "${workflowRun.workflowName}" completed successfully in ${workflowRun.durationMs}ms.`);
    }
  }

  return taskRun;
}

/**
 * Handles failure of a task during execution.
 * 
 * 1. Checks retry policy (exponential backoff + jitter).
 * 2. If retries remain: transitions to RETRY_WAIT and schedules re-enqueue.
 * 3. If retries exhausted: transitions to FAILED, cancels downstream tasks, and fails WorkflowRun.
 * 
 * @param {string} taskRunId
 * @param {Error|Object|string} error
 * @param {boolean} [isRetryable=true]
 */
async function handleTaskFailure(taskRunId, error, isRetryable = true) {
  const taskRun = await TaskRun.findById(taskRunId);
  if (!taskRun) {
    throw new Error(`TaskRun not found: ${taskRunId}`);
  }

  const errPayload = {
    message: error?.message || String(error),
    stack: error?.stack || null,
    timestamp: new Date().toISOString()
  };

  const nextAttempt = (taskRun.attempt || 0) + 1;
  const canRetry = isRetryable && nextAttempt <= taskRun.maxRetries;

  if (canRetry) {
    assertValidTaskTransition(taskRun.status, TaskState.RETRY_WAIT, taskRun.taskId);
    taskRun.status = TaskState.RETRY_WAIT;
    taskRun.attempt = nextAttempt;
    taskRun.error = errPayload;
    await taskRun.save();

    const delayMs = calculateBackoffWithJitter(nextAttempt - 1, taskRun.backoffMs);

    broadcastEvent('TASK_STATE_CHANGED', {
      runId: taskRun.runId.toString(),
      taskRunId: taskRun._id.toString(),
      taskId: taskRun.taskId,
      name: taskRun.name,
      status: TaskState.RETRY_WAIT,
      attempt: nextAttempt,
      maxRetries: taskRun.maxRetries,
      delayMs,
      error: errPayload.message
    });
    await recordLog(taskRun.runId, taskRun.taskId, 'warn', `Task "${taskRun.name}" failed (attempt ${nextAttempt}/${taskRun.maxRetries}). Retrying in ${delayMs}ms: ${errPayload.message}`);

    // Schedule re-enqueue after backoff
    setTimeout(async () => {
      try {
        const refreshed = await TaskRun.findById(taskRunId);
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
          await recordLog(refreshed.runId, refreshed.taskId, 'info', `Retry wait elapsed. Task "${refreshed.name}" re-queued.`);
        }
      } catch (scheduleErr) {
        console.error('[ExecutionEngine] Failed to re-enqueue retried task:', scheduleErr.message);
      }
    }, delayMs);

    return taskRun;
  }

  // Retries exhausted or non-retryable error -> Terminal FAILED state
  assertValidTaskTransition(taskRun.status, TaskState.FAILED, taskRun.taskId);
  const now = new Date();
  taskRun.status = TaskState.FAILED;
  taskRun.error = errPayload;
  taskRun.completedAt = now;
  if (taskRun.startedAt) {
    taskRun.durationMs = now.getTime() - taskRun.startedAt.getTime();
  }
  await taskRun.save();

  broadcastEvent('TASK_STATE_CHANGED', {
    runId: taskRun.runId.toString(),
    taskRunId: taskRun._id.toString(),
    taskId: taskRun.taskId,
    name: taskRun.name,
    status: TaskState.FAILED,
    error: errPayload.message
  });
  await recordLog(taskRun.runId, taskRun.taskId, 'error', `Task "${taskRun.name}" permanently failed after exhausting retries: ${errPayload.message}`);

  // Cancel downstream tasks that depended on this failed task
  const allRunTasks = await TaskRun.find({ runId: taskRun.runId });
  const failedTaskId = taskRun.taskId;

  for (const otherTask of allRunTasks) {
    if (otherTask.status === TaskState.BLOCKED && (otherTask.dependencies || []).includes(failedTaskId)) {
      otherTask.status = TaskState.CANCELLED;
      otherTask.error = { message: `Cancelled due to upstream prerequisite failure in: ${failedTaskId}` };
      await otherTask.save();

      broadcastEvent('TASK_STATE_CHANGED', {
        runId: otherTask.runId.toString(),
        taskRunId: otherTask._id.toString(),
        taskId: otherTask.taskId,
        name: otherTask.name,
        status: TaskState.CANCELLED,
        error: otherTask.error.message
      });
      await recordLog(otherTask.runId, otherTask.taskId, 'warn', otherTask.error.message);
    }
  }

  // Mark WorkflowRun as FAILED
  const workflowRun = await WorkflowRun.findById(taskRun.runId);
  if (workflowRun && workflowRun.status === WorkflowRunState.RUNNING) {
    workflowRun.status = WorkflowRunState.FAILED;
    workflowRun.completedAt = now;
    workflowRun.durationMs = now.getTime() - workflowRun.startedAt.getTime();
    workflowRun.error = `Task "${failedTaskId}" failed: ${errPayload.message}`;
    await workflowRun.save();

    broadcastEvent('WORKFLOW_STATE_CHANGED', {
      runId: workflowRun._id.toString(),
      status: WorkflowRunState.FAILED,
      durationMs: workflowRun.durationMs,
      error: workflowRun.error
    });
    await recordLog(workflowRun._id, 'workflow', 'error', `Workflow run failed: ${workflowRun.error}`);
  }

  return taskRun;
}

/**
 * Manually cancels an in-flight WorkflowRun.
 * 
 * @param {string} runId
 * @param {string} [reason]
 */
async function cancelWorkflowRun(runId, reason = 'Manually cancelled by user') {
  const workflowRun = await WorkflowRun.findById(runId);
  if (!workflowRun) {
    throw new Error(`WorkflowRun not found: ${runId}`);
  }

  if ([WorkflowRunState.SUCCEEDED, WorkflowRunState.FAILED, WorkflowRunState.CANCELLED].includes(workflowRun.status)) {
    return workflowRun; // Already terminal
  }

  const now = new Date();
  workflowRun.status = WorkflowRunState.CANCELLED;
  workflowRun.completedAt = now;
  workflowRun.error = reason;
  await workflowRun.save();

  broadcastEvent('WORKFLOW_STATE_CHANGED', {
    runId: workflowRun._id.toString(),
    status: WorkflowRunState.CANCELLED,
    error: reason
  });
  await recordLog(workflowRun._id, 'workflow', 'warn', `Workflow run cancelled: ${reason}`);

  // Cancel all non-terminal tasks
  const cancelableTasks = await TaskRun.find({
    runId,
    status: { $in: [TaskState.BLOCKED, TaskState.QUEUED, TaskState.RETRY_WAIT] }
  });

  for (const t of cancelableTasks) {
    t.status = TaskState.CANCELLED;
    t.completedAt = now;
    t.error = { message: reason };
    await t.save();

    broadcastEvent('TASK_STATE_CHANGED', {
      runId: t.runId.toString(),
      taskRunId: t._id.toString(),
      taskId: t.taskId,
      name: t.name,
      status: TaskState.CANCELLED,
      error: reason
    });
    await recordLog(t.runId, t.taskId, 'warn', `Task cancelled due to workflow cancellation: ${reason}`);
  }

  return workflowRun;
}

module.exports = {
  startWorkflowRun,
  claimTaskForExecution,
  handleTaskCompletion,
  handleTaskFailure,
  cancelWorkflowRun
};

