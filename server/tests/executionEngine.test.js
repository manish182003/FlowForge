const {
  TaskState,
  WorkflowRunState,
  assertValidTaskTransition,
  calculateBackoffWithJitter
} = require('../src/scheduler/stateMachine');
const {
  InMemoryQueueAdapter,
  enqueueTaskJob,
  getQueueMetrics
} = require('../src/queue/queueManager');

describe('Module 4: Execution Engine & State Machine', () => {
  describe('Task State Machine Validations', () => {
    it('should permit legal state transitions', () => {
      expect(() => assertValidTaskTransition(TaskState.BLOCKED, TaskState.QUEUED, 't1')).not.toThrow();
      expect(() => assertValidTaskTransition(TaskState.QUEUED, TaskState.RUNNING, 't1')).not.toThrow();
      expect(() => assertValidTaskTransition(TaskState.RUNNING, TaskState.SUCCEEDED, 't1')).not.toThrow();
      expect(() => assertValidTaskTransition(TaskState.RUNNING, TaskState.RETRY_WAIT, 't1')).not.toThrow();
      expect(() => assertValidTaskTransition(TaskState.RETRY_WAIT, TaskState.QUEUED, 't1')).not.toThrow();
      expect(() => assertValidTaskTransition(TaskState.RUNNING, TaskState.FAILED, 't1')).not.toThrow();
      expect(() => assertValidTaskTransition(TaskState.BLOCKED, TaskState.CANCELLED, 't1')).not.toThrow();
    });

    it('should reject illegal state transitions with an explicit error', () => {
      // Cannot jump from BLOCKED straight to RUNNING (must be QUEUED first)
      expect(() => assertValidTaskTransition(TaskState.BLOCKED, TaskState.RUNNING, 't1'))
        .toThrow(/Illegal task state transition/);

      // Terminal SUCCEEDED state cannot transition anywhere
      expect(() => assertValidTaskTransition(TaskState.SUCCEEDED, TaskState.RUNNING, 't1'))
        .toThrow(/Illegal task state transition/);

      // Terminal FAILED state cannot transition to SUCCEEDED
      expect(() => assertValidTaskTransition(TaskState.FAILED, TaskState.SUCCEEDED, 't1'))
        .toThrow(/Illegal task state transition/);
    });

    it('should allow idempotent self-transitions as no-ops', () => {
      expect(() => assertValidTaskTransition(TaskState.QUEUED, TaskState.QUEUED, 't1')).not.toThrow();
      expect(() => assertValidTaskTransition(TaskState.RUNNING, TaskState.RUNNING, 't1')).not.toThrow();
    });
  });

  describe('Exponential Backoff with Full Jitter Calculation', () => {
    it('should calculate exponential increases with attempt count', () => {
      const delay0 = calculateBackoffWithJitter(0, 1000, 60000); // 1000 + jitter
      const delay1 = calculateBackoffWithJitter(1, 1000, 60000); // 2000 + jitter
      const delay2 = calculateBackoffWithJitter(2, 1000, 60000); // 4000 + jitter

      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1250);

      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2500);

      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(5000);
    });

    it('should respect maxBackoffMs ceiling', () => {
      const ceiling = 10000;
      const delay = calculateBackoffWithJitter(10, 1000, ceiling);
      // Base delay is capped at 10,000 + 25% jitter max
      expect(delay).toBeLessThanOrEqual(12500);
    });
  });

  describe('Queue Manager Operations (In-Memory Adapter)', () => {
    it('should enqueue task job with proper priority and retrieval', async () => {
      const jobData = {
        taskRunId: 'tr_123',
        runId: 'run_456',
        taskId: 'download_file',
        name: 'Download File',
        type: 'http_request',
        priority: 8
      };

      const job = await enqueueTaskJob(jobData);
      expect(job).toBeDefined();
      expect(job.data.taskId).toBe('download_file');

      const metrics = await getQueueMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.counts.waiting).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Downstream Dependency State Propagation Logic', () => {
    it('should correctly determine when a downstream task becomes QUEUED after its prerequisite SUCCEEDS', () => {
      const { findReadyTasks } = require('../src/algorithms/graph');

      const workflowTasks = [
        { taskId: 'step_1', dependencies: [] },
        { taskId: 'step_2', dependencies: ['step_1'] },
        { taskId: 'step_3', dependencies: ['step_2'] }
      ];

      // Initial state: No tasks completed
      const initialReady = findReadyTasks(workflowTasks, new Set(), new Set());
      expect(initialReady).toEqual(['step_1']);

      // Step 1 completes
      const completedAfterStep1 = new Set(['step_1']);
      const readyAfterStep1 = findReadyTasks(workflowTasks, completedAfterStep1, new Set());
      expect(readyAfterStep1).toEqual(['step_2']);

      // Step 2 completes
      const completedAfterStep2 = new Set(['step_1', 'step_2']);
      const readyAfterStep2 = findReadyTasks(workflowTasks, completedAfterStep2, new Set());
      expect(readyAfterStep2).toEqual(['step_3']);
    });

    it('should prevent multi-parent downstream task from becoming ready until ALL prerequisites succeed', () => {
      const { findReadyTasks } = require('../src/algorithms/graph');

      // Diamond graph:
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      const diamond = [
        { taskId: 'A', dependencies: [] },
        { taskId: 'B', dependencies: ['A'] },
        { taskId: 'C', dependencies: ['A'] },
        { taskId: 'D', dependencies: ['B', 'C'] }
      ];

      // Only B succeeds, C is still pending
      const completed = new Set(['A', 'B']);
      const ready = findReadyTasks(diamond, completed, new Set());
      // C is ready, but D is NOT ready yet
      expect(ready).toEqual(['C']);

      // Both B and C succeed
      const allCompleted = new Set(['A', 'B', 'C']);
      const readyFinal = findReadyTasks(diamond, allCompleted, new Set());
      expect(readyFinal).toEqual(['D']);
    });
  });
});

