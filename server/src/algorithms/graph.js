/**
 * FlowForge Graph Algorithms Engine
 * Implements Graph Representation, Kahn's Topological Sort, Cycle Detection,
 * and Dynamic Ready-Task Eligibility Detection in O(V + E) time.
 */

/**
 * Builds forward adjacency list and in-degree table from a task list.
 * In a workflow DAG:
 *   If Task B has dependency [Task A], there is a directed edge: A -> B.
 *   - A is the prerequisite (source).
 *   - B is the dependent (target).
 *   - B's in-degree increases by 1.
 *
 * @param {Array<{taskId: string, dependencies: string[]}>} tasks
 * @returns {{
 *   adj: Map<string, string[]>,       // u -> [v1, v2, ...]
 *   inDegree: Map<string, number>,    // u -> number of unmet prerequisites
 *   taskIds: string[]
 * }}
 */
function buildGraphRepresentation(tasks) {
  const adj = new Map();
  const inDegree = new Map();
  const taskIds = [];

  // Initialize data structures for all vertices V
  for (const task of tasks) {
    taskIds.push(task.taskId);
    adj.set(task.taskId, []);
    inDegree.set(task.taskId, 0);
  }

  // Populate directed edges E: prerequisite -> dependent
  for (const task of tasks) {
    const dependentId = task.taskId;
    for (const prereqId of (task.dependencies || [])) {
      if (adj.has(prereqId)) {
        adj.get(prereqId).push(dependentId);
        inDegree.set(dependentId, (inDegree.get(dependentId) || 0) + 1);
      }
    }
  }

  return { adj, inDegree, taskIds };
}

/**
 * Kahn's Algorithm for Cycle Detection.
 * 
 * Theorem: A directed graph G contains at least one directed cycle if and only if
 * Kahn's algorithm terminates with processed_count < total_vertices.
 * 
 * Time Complexity: O(V + E)
 * Space Complexity: O(V + E)
 * 
 * @param {Array<{taskId: string, dependencies: string[]}>} tasks
 * @returns {{ hasCycle: boolean, cycleNodes: string[] }}
 */
function detectCycle(tasks) {
  if (!tasks || tasks.length === 0) {
    return { hasCycle: false, cycleNodes: [] };
  }

  const { adj, inDegree, taskIds } = buildGraphRepresentation(tasks);

  // Clone inDegree so we don't mutate input
  const inDegreeCopy = new Map(inDegree);
  const queue = [];

  // 1. Enqueue all vertices with in-degree 0 (no prerequisites)
  for (const taskId of taskIds) {
    if (inDegreeCopy.get(taskId) === 0) {
      queue.push(taskId);
    }
  }

  let processedCount = 0;
  let head = 0; // O(1) queue pointer instead of O(N) Array.shift()

  while (head < queue.length) {
    const u = queue[head++];
    processedCount++;

    for (const v of adj.get(u) || []) {
      const remainingDegree = inDegreeCopy.get(v) - 1;
      inDegreeCopy.set(v, remainingDegree);
      if (remainingDegree === 0) {
        queue.push(v);
      }
    }
  }

  // If processedCount < total tasks, the unprocessed tasks are trapped in a cycle
  const hasCycle = processedCount < taskIds.length;
  const cycleNodes = hasCycle
    ? taskIds.filter(id => (inDegreeCopy.get(id) || 0) > 0)
    : [];

  return { hasCycle, cycleNodes };
}

/**
 * Kahn's Algorithm for Topological Sorting.
 * Returns a valid linear ordering of tasks such that for every directed edge u -> v,
 * u appears before v in the order.
 * 
 * Throws an Error if a cycle is detected.
 * 
 * Time Complexity: O(V + E)
 * Space Complexity: O(V + E)
 * 
 * @param {Array<{taskId: string, dependencies: string[]}>} tasks
 * @returns {string[]} Ordered list of taskIds
 */
function topologicalSort(tasks) {
  if (!tasks || tasks.length === 0) return [];

  const { adj, inDegree, taskIds } = buildGraphRepresentation(tasks);
  const inDegreeCopy = new Map(inDegree);
  const queue = [];

  for (const taskId of taskIds) {
    if (inDegreeCopy.get(taskId) === 0) {
      queue.push(taskId);
    }
  }

  const order = [];
  let head = 0;

  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);

    for (const v of adj.get(u) || []) {
      const remaining = inDegreeCopy.get(v) - 1;
      inDegreeCopy.set(v, remaining);
      if (remaining === 0) {
        queue.push(v);
      }
    }
  }

  if (order.length < taskIds.length) {
    const trapped = taskIds.filter(id => (inDegreeCopy.get(id) || 0) > 0);
    throw new Error(`Cycle detected in workflow graph! Tasks involved in deadlock: ${trapped.join(', ')}`);
  }

  return order;
}

/**
 * Dynamic Ready-Task Detection.
 * Determines which tasks can execute right now, given the set of already succeeded tasks.
 * 
 * Crucial Engineering Rule:
 * Topological sort is a static graph ordering.
 * Ready-task detection is a runtime dynamic decision:
 * A task T is ELIGIBLE if and only if:
 * 1. T has NOT yet run or succeeded.
 * 2. EVERY prerequisite in T.dependencies has ALREADY completed successfully.
 * 
 * Time Complexity: O(V + E)
 * 
 * @param {Array<{taskId: string, dependencies: string[]}>} tasks
 * @param {Set<string>|string[]} completedTaskIds - Set or array of tasks that have SUCCEEDED
 * @param {Set<string>|string[]} activeOrQueuedTaskIds - Set of tasks currently RUNNING or QUEUED
 * @returns {string[]} List of taskIds ready for immediate scheduling
 */
function findReadyTasks(tasks, completedTaskIds = new Set(), activeOrQueuedTaskIds = new Set()) {
  const completedSet = completedTaskIds instanceof Set 
    ? completedTaskIds 
    : new Set(completedTaskIds);
    
  const activeSet = activeOrQueuedTaskIds instanceof Set 
    ? activeOrQueuedTaskIds 
    : new Set(activeOrQueuedTaskIds);

  const ready = [];

  for (const task of tasks) {
    const id = task.taskId;

    // If already finished or currently in flight, it is not eligible
    if (completedSet.has(id) || activeSet.has(id)) {
      continue;
    }

    // Check if ALL dependencies have succeeded
    const prerequisites = task.dependencies || [];
    const allPrerequisitesMet = prerequisites.every(prereqId => completedSet.has(prereqId));

    if (allPrerequisitesMet) {
      ready.push(id);
    }
  }

  return ready;
}

module.exports = {
  buildGraphRepresentation,
  detectCycle,
  topologicalSort,
  findReadyTasks
};
