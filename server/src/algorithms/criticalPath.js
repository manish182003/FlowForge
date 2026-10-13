const { topologicalSort, buildGraphRepresentation } = require('./graph');

/**
 * Calculates the Critical Path and theoretical minimum workflow completion time (Makespan)
 * using Dynamic Programming over a Directed Acyclic Graph (DAG).
 * 
 * Concept:
 * - Sum of all durations = Execution time if tasks run purely sequentially on 1 worker.
 * - Critical Path = The longest dependency chain of tasks from start to finish.
 *   Even if you have infinite parallel workers, the workflow CANNOT finish faster than
 *   the critical path duration because prerequisites must wait for each other.
 * 
 * Time Complexity: O(V + E)
 * Space Complexity: O(V)
 * 
 * @param {Array<{taskId: string, dependencies: string[]}>} tasks
 * @param {Object.<string, number>} [durationMap={}] - Estimated task durations (in seconds or ms)
 * @param {number} [defaultDuration=10] - Default duration if not specified in durationMap
 * @returns {{
 *   criticalPath: string[],
 *   minimumMakespan: number,
 *   sequentialDuration: number,
 *   parallelSpeedup: number,
 *   scheduleTable: Object.<string, {
 *     duration: number,
 *     earliestStart: number,
 *     earliestFinish: number,
 *     criticalPredecessor: string|null
 *   }>
 * }}
 */
function calculateCriticalPath(tasks, durationMap = {}, defaultDuration = 10) {
  if (!tasks || tasks.length === 0) {
    return {
      criticalPath: [],
      minimumMakespan: 0,
      sequentialDuration: 0,
      parallelSpeedup: 1,
      scheduleTable: {}
    };
  }

  // 1. Get topological ordering. Throws if graph has a cycle.
  const topoOrder = topologicalSort(tasks);
  const taskMap = new Map();
  tasks.forEach(t => taskMap.set(t.taskId, t));

  // Schedule table storing DP states for each node
  const scheduleTable = {};
  let sequentialDuration = 0;

  // 2. Forward Dynamic Programming Pass in topological order
  for (const taskId of topoOrder) {
    const task = taskMap.get(taskId);
    const duration = durationMap[taskId] !== undefined ? durationMap[taskId] : defaultDuration;
    sequentialDuration += duration;

    let maxPrereqFinish = 0;
    let criticalPredecessor = null;

    for (const prereqId of (task.dependencies || [])) {
      const prereqState = scheduleTable[prereqId];
      if (prereqState && prereqState.earliestFinish > maxPrereqFinish) {
        maxPrereqFinish = prereqState.earliestFinish;
        criticalPredecessor = prereqId;
      }
    }

    const earliestStart = maxPrereqFinish;
    const earliestFinish = earliestStart + duration;

    scheduleTable[taskId] = {
      duration,
      earliestStart,
      earliestFinish,
      criticalPredecessor
    };
  }

  // 3. Find end node with maximum earliestFinish (The Makespan)
  let minimumMakespan = 0;
  let endNode = null;

  for (const taskId of topoOrder) {
    if (scheduleTable[taskId].earliestFinish > minimumMakespan) {
      minimumMakespan = scheduleTable[taskId].earliestFinish;
      endNode = taskId;
    }
  }

  // 4. Trace backwards to reconstruct the critical path sequence
  const criticalPath = [];
  let curr = endNode;
  while (curr) {
    criticalPath.push(curr);
    curr = scheduleTable[curr].criticalPredecessor;
  }
  criticalPath.reverse();

  const parallelSpeedup = minimumMakespan > 0
    ? Number((sequentialDuration / minimumMakespan).toFixed(2))
    : 1;

  return {
    criticalPath,
    minimumMakespan,
    sequentialDuration,
    parallelSpeedup,
    scheduleTable
  };
}

module.exports = { calculateCriticalPath };

