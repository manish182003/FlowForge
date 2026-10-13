# Module 07: Failure Injection, Worker Recovery & Resilience

## 1. System Design: Why Worker Crashes Cause "Zombie" Tasks

In a distributed job queue, when a worker claims a task, its status transitions:
$$\text{QUEUED} \longrightarrow \text{RUNNING}$$

If the worker process abruptly terminates (kernel `SIGKILL`, out-of-memory `OOMKilled`, hardware power loss, or network partition):
1. The worker is dead and will never send a completion or failure response.
2. The task remains permanently stuck in `RUNNING` in the database.
3. All downstream vertices in the DAG that depend on this task remain in `BLOCKED` indefinitely.
4. **The entire workflow execution deadlocks silently.**

---

## 2. The Architectural Solution: Distributed Leases & The Reaper

FlowForge implements the industry-standard **Distributed Heartbeat Lease & Reaper Pattern** (employed by systems like Kubernetes, Google Borg, and AWS Temporal):

```
+---------------------------------------------------------------------------------+
|                                 Worker Process                                  |
|  - Sends heartbeat every 5s: WorkerHeartbeat.lastHeartbeat = NOW                |
|  - Holds a renewable 15-second lease on in-flight tasks                         |
+---------------------------------------------------------------------------------+
                                       |
                                  (CRASHES!)
                                       v
+---------------------------------------------------------------------------------+
|                        Scheduler Reaper Service (Watchdog)                      |
|                                                                                 |
|  Periodic Sweep (Every 10s):                                                    |
|  1. Find workers where lastHeartbeat < (NOW - 15000ms).                         |
|  2. Mark worker status = 'DEAD'.                                                |
|  3. Find all TaskRuns with status: 'RUNNING' assigned to dead worker.           |
|  4. Atomic Compare-And-Swap (CAS):                                              |
|     - If attempt < maxRetries:                                                  |
|         status = 'RETRY_WAIT', increment attempt, calculate backoff with jitter |
|         Re-enqueue to BullMQ / In-Memory Queue.                                 |
|     - If attempt >= maxRetries:                                                 |
|         status = 'FAILED', record fatal crash error,                            |
|         cancel downstream BLOCKED tasks, fail the WorkflowRun.                  |
+---------------------------------------------------------------------------------+
```

---

## 3. Key Components Implemented in Module 07

### A. Execution Deadline Watchdog (`registry.js`)
Prevents rogue handlers from hanging forever by wrapping handler dispatch in an asynchronous deadline race:

```javascript
const timeoutMs = input.timeoutMs || context.timeoutMs || 30000;

const timeoutPromise = new Promise((_, reject) => {
  timerId = setTimeout(() => {
    const err = new Error(`Task execution timed out after ${timeoutMs}ms`);
    err.code = 'TASK_TIMEOUT';
    reject(err);
  }, timeoutMs);
});

const result = await Promise.race([
  handler(input, context),
  timeoutPromise
]);
```

### B. The Reaper Service (`reaper.js`)
- Runs autonomously in the background of the scheduler.
- Uses conditional atomic updates (`findOneAndUpdate({ _id, status: 'RUNNING' }, ...)`) so that if a revived worker tries to complete a task concurrently, no race condition or double-execution occurs.

### C. Chaos Engineering Endpoints (`chaos.controller.js`)
- `GET /api/workers`: Inspects cluster worker status and heartbeats.
- `POST /api/chaos/expire-lease`: Artificially back-dates a worker's heartbeat by 60 seconds to simulate an ungraceful crash.
- `POST /api/chaos/trigger-reaper`: Triggers an immediate Reaper sweep on demand.

### D. Frontend Chaos & Recovery UI (`ChaosPanel.jsx`)
- One-click modal accessible from the DAG canvas toolbar to inspect workers, trigger artificial lease expiry, and observe the live recovery stream in the telemetry log viewer.

---

## 4. DSA / Systems Programming: C++ vs JavaScript Comparison

### Distributed Leases & Heartbeats:

| Feature | JavaScript (Node.js + MongoDB) | C++ (Distributed Systems / Raft) |
| :--- | :--- | :--- |
| **Worker Lease** | `WorkerHeartbeat` record updated via Mongoose every $5\text{s}$ | Ephemeral znode in ZooKeeper, lease TTL in etcd, or Raft keepalive RPC |
| **Atomic Reclaim** | `findOneAndUpdate({ _id, status: 'RUNNING' }, { $set: { status: 'RETRY_WAIT' } })` | Compare-And-Swap (CAS) on atomic state machine or Raft log commitment |
| **Timeout Watchdog** | `Promise.race([handler(), timeoutPromise])` | `std::future::wait_for(std::chrono::milliseconds(timeoutMs))` or `boost::asio::steady_timer` |
| **Thread Model** | Single event loop with non-blocking timer callbacks (`timer.unref()`) | Background `std::jthread` running periodic health-checking loop |

### Side-by-Side: Execution Deadline Watchdog

#### C++ (`std::future::wait_for`):
```cpp
#include <future>
#include <chrono>
#include <stdexcept>

template <typename Func>
auto executeWithTimeout(Func task, std::chrono::milliseconds timeout) {
    auto future = std::async(std::launch::async, task);
    
    if (future.wait_for(timeout) == std::future_status::timeout) {
        throw std::runtime_error("Task execution timed out");
    }
    return future.get();
}
```

#### JavaScript (`Promise.race`):
```javascript
async function executeWithTimeout(taskFn, timeoutMs) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('Task execution timed out')), timeoutMs);
  });

  try {
    return await Promise.race([taskFn(), timeoutPromise]);
  } finally {
    clearTimeout(timerId);
  }
}
```

---

## 5. Verification & Test Suite
The entire test suite covers:
- Execution deadline timeout abortion with `TASK_TIMEOUT`.
- Expired worker lease discovery.
- Orphaned task recovery with retry attempts remaining (`RUNNING -> RETRY_WAIT -> QUEUED`).
- Orphaned task terminal failure when retries are exhausted (`RUNNING -> FAILED`), with downstream task cancellation.
- Chaos REST endpoints (`/api/workers`, `/api/chaos/expire-lease`, `/api/chaos/trigger-reaper`).

All **75 tests across 9 test suites** pass cleanly.
