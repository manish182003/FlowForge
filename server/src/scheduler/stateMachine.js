/**
 * FlowForge Finite State Machine (FSM)
 * Defines canonical states, legal transition matrices, and transition validators
 * for Workflow Runs and Task Runs.
 */

// Canonical Task States
const TaskState = Object.freeze({
  BLOCKED: 'BLOCKED',         // Waiting for prerequisites to finish
  QUEUED: 'QUEUED',           // All prerequisites met; waiting in dispatch queue
  RUNNING: 'RUNNING',         // Worker has claimed and is executing the task
  SUCCEEDED: 'SUCCEEDED',     // Finished execution successfully (Terminal)
  RETRY_WAIT: 'RETRY_WAIT',   // Transient failure; waiting for backoff before re-queueing
  FAILED: 'FAILED',           // Unrecoverable failure or retries exhausted (Terminal)
  CANCELLED: 'CANCELLED'      // Cancelled by user or skipped due to upstream failure (Terminal)
});

// Canonical Workflow Run States
const WorkflowRunState = Object.freeze({
  PENDING: 'PENDING',         // Initializing run and task records
  RUNNING: 'RUNNING',         // One or more tasks currently in flight
  SUCCEEDED: 'SUCCEEDED',     // All tasks in workflow reached SUCCEEDED (Terminal)
  FAILED: 'FAILED',           // One or more tasks reached FAILED (Terminal)
  CANCELLED: 'CANCELLED'      // Manually halted by user (Terminal)
});

// Legal Task State Transition Matrix
const LEGAL_TASK_TRANSITIONS = {
  [TaskState.BLOCKED]: [TaskState.QUEUED, TaskState.CANCELLED],
  [TaskState.QUEUED]: [TaskState.RUNNING, TaskState.CANCELLED],
  [TaskState.RUNNING]: [TaskState.SUCCEEDED, TaskState.RETRY_WAIT, TaskState.FAILED, TaskState.CANCELLED],
  [TaskState.RETRY_WAIT]: [TaskState.QUEUED, TaskState.CANCELLED],
  [TaskState.SUCCEEDED]: [], // Terminal state
  [TaskState.FAILED]: [],    // Terminal state
  [TaskState.CANCELLED]: []  // Terminal state
};

// Legal Workflow Run Transition Matrix
const LEGAL_WORKFLOW_TRANSITIONS = {
  [WorkflowRunState.PENDING]: [WorkflowRunState.RUNNING, WorkflowRunState.CANCELLED],
  [WorkflowRunState.RUNNING]: [WorkflowRunState.SUCCEEDED, WorkflowRunState.FAILED, WorkflowRunState.CANCELLED],
  [WorkflowRunState.SUCCEEDED]: [],
  [WorkflowRunState.FAILED]: [],
  [WorkflowRunState.CANCELLED]: []
};

/**
 * Validates whether a task state transition is legal.
 * Throws an Error if the transition violates the state machine rules.
 * 
 * @param {string} fromState
 * @param {string} toState
 * @param {string} taskId
 */
function assertValidTaskTransition(fromState, toState, taskId = 'unknown') {
  if (fromState === toState) return true; // No-op idempotent transition

  const legalTargets = LEGAL_TASK_TRANSITIONS[fromState];
  if (!legalTargets) {
    throw new Error(`Invalid current task state: "${fromState}"`);
  }

  if (!legalTargets.includes(toState)) {
    throw new Error(
      `Illegal task state transition for task "${taskId}": cannot transition from "${fromState}" to "${toState}". ` +
      `Legal transitions from "${fromState}" are: [${legalTargets.join(', ')}]`
    );
  }

  return true;
}

/**
 * Computes exponential backoff with full jitter.
 * 
 * Formula:
 *   exponentialDelay = Math.min(maxBackoffMs, baseBackoffMs * (2 ** attempt))
 *   jitter = Math.random() * (exponentialDelay * 0.25)
 *   totalDelay = Math.floor(exponentialDelay + jitter)
 * 
 * Why Jitter?
 * Without jitter, if 50 tasks fail at 12:00:00 because a database was restarting,
 * all 50 tasks would retry at the exact same millisecond (e.g. 12:00:02), creating
 * a secondary outage (thundering herd). Jitter desynchronizes retries.
 * 
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @param {number} [baseBackoffMs=1000] - Base delay in milliseconds
 * @param {number} [maxBackoffMs=60000] - Maximum delay ceiling in milliseconds
 * @returns {number} Backoff delay in milliseconds
 */
function calculateBackoffWithJitter(attempt, baseBackoffMs = 1000, maxBackoffMs = 60000) {
  const safeAttempt = Math.max(0, attempt);
  const exponentialDelay = Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, safeAttempt));
  // Full jitter: Add up to 25% random spread
  const jitter = Math.random() * (exponentialDelay * 0.25);
  return Math.floor(exponentialDelay + jitter);
}

module.exports = {
  TaskState,
  WorkflowRunState,
  LEGAL_TASK_TRANSITIONS,
  LEGAL_WORKFLOW_TRANSITIONS,
  assertValidTaskTransition,
  calculateBackoffWithJitter
};
