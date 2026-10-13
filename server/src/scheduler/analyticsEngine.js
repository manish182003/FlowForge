const TaskRun = require('../models/TaskRun');
const WorkflowRun = require('../models/WorkflowRun');
const { topologicalSort } = require('../algorithms/graph');

/**
 * Calculates comprehensive execution analytics for a WorkflowRun.
 * 
 * Computes:
 * 1. Total Sequential Work (sum of all task durations).
 * 2. Actual Makespan (elapsed wall-clock time from run startedAt to completedAt).
 * 3. Theoretical Critical-Path Makespan & Bottleneck Task Chain.
 * 4. Parallel Speedup Factor (Sequential Work / Actual Makespan).
 * 5. Per-task Queue Scheduling Latency (startedAt - createdAt).
 * 6. Task Timeline Offsets for Gantt chart visualization.
 * 
 * @param {string} runId - MongoDB ObjectId of WorkflowRun
 * @returns {Promise<Object>} Execution Analytics
 */
async function computeRunAnalytics(runId) {
  const [workflowRun, taskRuns] = await Promise.all([
    WorkflowRun.findById(runId).lean(),
    TaskRun.find({ runId }).sort({ createdAt: 1 }).lean()
  ]);

  if (!workflowRun) {
    throw new Error(`WorkflowRun not found: ${runId}`);
  }

  if (taskRuns.length === 0) {
    return {
      runId,
      status: workflowRun.status,
      totalTasks: 0,
      totalSequentialMs: 0,
      actualMakespanMs: 0,
      criticalMakespanMs: 0,
      speedupFactor: 1.0,
      criticalPath: [],
      tasks: []
    };
  }

  // 1. Calculate Sequential Work & Queue Delays
  let totalSequentialMs = 0;
  const runStartTime = workflowRun.startedAt ? new Date(workflowRun.startedAt).getTime() : 0;
  const runEndTime = workflowRun.completedAt 
    ? new Date(workflowRun.completedAt).getTime() 
    : Date.now();
  const actualMakespanMs = runStartTime > 0 ? Math.max(0, runEndTime - runStartTime) : 0;

  const taskMetrics = taskRuns.map(t => {
    const durationMs = t.durationMs || 0;
    totalSequentialMs += durationMs;

    const taskCreated = t.createdAt ? new Date(t.createdAt).getTime() : runStartTime;
    const taskStarted = t.startedAt ? new Date(t.startedAt).getTime() : taskCreated;
    const taskCompleted = t.completedAt ? new Date(t.completedAt).getTime() : taskStarted + durationMs;

    const queueLatencyMs = Math.max(0, taskStarted - taskCreated);
    const startOffsetMs = runStartTime > 0 ? Math.max(0, taskStarted - runStartTime) : 0;

    return {
      taskRunId: t._id.toString(),
      taskId: t.taskId,
      name: t.name,
      type: t.type,
      status: t.status,
      priority: t.priority,
      attempt: t.attempt,
      durationMs,
      queueLatencyMs,
      startOffsetMs,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      dependencies: t.dependencies || []
    };
  });

  // 2. Compute Actual Critical Path via Dynamic Programming
  const taskSpecs = taskRuns.map(t => ({
    taskId: t.taskId,
    dependencies: t.dependencies || []
  }));

  let topoOrder = [];
  try {
    const topoResult = topologicalSort(taskSpecs);
    topoOrder = Array.isArray(topoResult) ? topoResult : (topoResult?.order || []);
  } catch (_) {
    // Fallback order if graph had an edge anomaly
    topoOrder = taskRuns.map(t => t.taskId);
  }

  const { criticalMakespanMs, criticalPath } = computeActualCriticalPath(taskMetrics, topoOrder);

  // 3. Parallel Speedup Factor (Sequential Work / Actual Makespan)
  const speedupFactor = actualMakespanMs > 0 && totalSequentialMs > 0
    ? Number((totalSequentialMs / actualMakespanMs).toFixed(2))
    : 1.0;

  // 4. Mark tasks on the critical path
  const criticalPathSet = new Set(criticalPath);
  const enrichedTasks = taskMetrics.map(t => ({
    ...t,
    isCritical: criticalPathSet.has(t.taskId)
  }));

  return {
    runId: workflowRun._id.toString(),
    workflowId: workflowRun.workflowId.toString(),
    workflowName: workflowRun.workflowName,
    status: workflowRun.status,
    startedAt: workflowRun.startedAt,
    completedAt: workflowRun.completedAt,
    totalTasks: taskRuns.length,
    totalSequentialMs,
    actualMakespanMs,
    criticalMakespanMs,
    speedupFactor,
    criticalPath,
    tasks: enrichedTasks
  };
}

/**
 * Solves the longest path in a Directed Acyclic Graph (DAG) using Dynamic Programming.
 * 
 * DP State: earliestFinish[v] = maximum time to complete task v including all prerequisites.
 * Transition: earliestFinish[v] = max_{(u in dependencies)} (earliestFinish[u]) + durationMs[v]
 * 
 * Time Complexity: O(V + E)
 * 
 * @param {Array} tasks - Enriched task metrics with durationMs and dependencies
 * @param {Array<string>} topoOrder - Topologically sorted taskIds
 * @returns {{ criticalMakespanMs: number, criticalPath: string[] }}
 */
function computeActualCriticalPath(tasks, topoOrder) {
  const earliestFinish = {};
  const predecessor = {};
  const taskMap = new Map(tasks.map(t => [t.taskId, t]));

  // Base initialization: zero prerequisites finish at own duration
  for (const t of tasks) {
    earliestFinish[t.taskId] = t.durationMs || 0;
  }

  let bottleneckTaskId = null;
  let maxMakespan = 0;

  for (const uId of topoOrder) {
    const uFinish = earliestFinish[uId] || 0;
    if (uFinish > maxMakespan) {
      maxMakespan = uFinish;
      bottleneckTaskId = uId;
    }

    // Relax all downstream tasks that depend on uId
    for (const t of tasks) {
      if ((t.dependencies || []).includes(uId)) {
        const candidateFinish = uFinish + (t.durationMs || 0);
        if (candidateFinish > (earliestFinish[t.taskId] || 0)) {
          earliestFinish[t.taskId] = candidateFinish;
          predecessor[t.taskId] = uId;

          if (candidateFinish > maxMakespan) {
            maxMakespan = candidateFinish;
            bottleneckTaskId = t.taskId;
          }
        }
      }
    }
  }

  // Backtrack to extract critical path chain
  const criticalPath = [];
  let curr = bottleneckTaskId;
  const visited = new Set();

  while (curr && !visited.has(curr)) {
    visited.add(curr);
    criticalPath.unshift(curr);
    curr = predecessor[curr];
  }

  return {
    criticalMakespanMs: maxMakespan,
    criticalPath
  };
}

module.exports = {
  computeRunAnalytics,
  computeActualCriticalPath
};
