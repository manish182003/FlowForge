# Module 04: Execution Engine, State Machine & Queue Coordination

## 1. Goal and Responsibilities
Module 04 turns static workflow definitions into dynamic, durable execution runs. It provides:
1. **Explicit Finite State Machine (FSM)**: Strict legal state transitions for tasks (`BLOCKED`, `QUEUED`, `RUNNING`, `SUCCEEDED`, `RETRY_WAIT`, `FAILED`, `CANCELLED`) with rejection of invalid transitions.
2. **Durable Execution Models**: `WorkflowRun` and `TaskRun` Mongoose schemas to persist execution history, attempts, logs, and outputs.
3. **Queue Coordination Layer**: Production queue integration with **BullMQ / Redis**, paired with a lightweight in-memory queue adapter for development and testing without Redis.
4. **Retry Engine with Exponential Backoff and Jitter**: Mathematically proven retry backoff calculation to prevent the "thundering herd" problem.
5. **Dynamic Dependency State Propagation**: When a task completes, the engine evaluates downstream dependents using our Module 3 `findReadyTasks` algorithm, automatically promoting newly unblocked tasks from `BLOCKED` $\to$ `QUEUED`.
6. **Execution API Endpoints**: Triggering runs (`POST /api/workflows/:id/run`) and inspecting live run states (`GET /api/runs/:runId`).

---

## 2. Engineering Concepts Taught

### Finite State Machine (FSM)
- An explicit state machine prevents edge cases where tasks transition to impossible states.
- Attempting an illegal transition (e.g. `BLOCKED` $\to$ `RUNNING`, bypassing `QUEUED`, or `SUCCEEDED` $\to$ `RUNNING`) throws an immediate state violation error.
- Idempotent self-transitions (`QUEUED` $\to$ `QUEUED`) are treated as no-ops.

### Exponential Backoff with Full Jitter
- Formula:
  $$\text{Delay} = \min(\text{MaxBackoff}, \text{BaseBackoff} \times 2^{\text{attempt}}) + \text{random}(0, 0.25 \times \text{BaseDelay})$$
- **Why Jitter?**
  Without jitter, if an external database or API blips, 50 failing tasks would all wake up and retry at the exact same millisecond, crashing the recovering service (thundering herd). Jitter desynchronizes retry attempts across workers.

### Race Condition Prevention via Atomic Conditional Updates
- When a worker claims a job from the queue:
  ```javascript
  TaskRun.findOneAndUpdate(
    { _id: taskRunId, status: TaskState.QUEUED },
    { $set: { status: TaskState.RUNNING, workerId, startedAt: new Date() } },
    { new: true }
  );
  ```
  If another worker already claimed the task, the query returns `null`, ensuring only one worker can execute the job.

---

## 3. Files Created or Modified

| File | Type | Responsibility |
| :--- | :--- | :--- |
| `server/src/scheduler/stateMachine.js` | Backend | TaskState & WorkflowRunState matrices, transition assertions, jitter backoff |
| `server/src/models/WorkflowRun.js` | Backend | Mongoose schema for workflow execution instances |
| `server/src/models/TaskRun.js` | Backend | Mongoose schema for individual task runs with attempt tracking |
| `server/src/queue/queueManager.js` | Backend | BullMQ / Redis queue manager with in-memory fallback adapter |
| `server/src/scheduler/executionEngine.js` | Backend | Core scheduler engine: startWorkflowRun, claimTask, handleTaskCompletion, handleTaskFailure |
| `server/src/controllers/run.controller.js` | Backend | Controller for triggering runs, listing runs, and queue metrics |
| `server/src/routes/run.routes.js` | Backend | Express routes mounting `/api/workflows/:id/run` and `/api/runs/:runId` |
| `server/tests/executionEngine.test.js` | Tests | Unit tests for FSM transitions, jitter math, queue metrics, and state progression |
| `server/tests/run.api.test.js` | Tests | Integration tests for run execution API routes |
| `client/src/services/workflowApi.js` | Frontend | Fetch API utility for triggering runs and polling snapshots |
| `client/src/components/GraphCanvas.jsx` | Frontend | Updated to render live task execution badges and borders on canvas nodes |
| `client/src/App.jsx` | Frontend | Added "▶ Run Workflow" button, execution polling, and Run Monitor panel |

---

## 4. Test Verification
All 44 tests passing across 6 test suites:
```bash
PASS tests/executionEngine.test.js
PASS tests/run.api.test.js
PASS tests/workflow.api.test.js
PASS tests/algorithms.test.js
PASS tests/workflow.schema.test.js
PASS tests/health.test.js

Test Suites: 6 passed, 6 total
Tests:       44 passed, 44 total
Snapshots:   0 total
Time:        7.998 s
```
Client Vite bundle successfully generated:
```bash
vite build -> dist/assets/index-D2avfCus.js (167.80 kB) in 868ms
```

