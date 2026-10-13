# System Design: API and Worker Process Separation

## 1. Why Separate API Servers and Worker Processes?

In building FlowForge, we enforce a strict boundary between the **API Server** and **Distributed Workers**.

```
[Web Client] ───HTTP───> [API Server (Express)] ───Enqueues───> [Redis Queue]
                                                                     │
                                             ┌───────────────────────┴───────────────────────┐
                                             ▼                                               ▼
                                  [Worker Process 1]                              [Worker Process 2]
```

### The Single-Threaded Event Loop Constraint
Node.js executes application JavaScript on a single thread via the **libuv event loop**.
- If a data transformation task hashes 500,000 CSV rows or an HTTP handler blocks waiting for a 15-second response, the main thread's event loop stalls.
- While the event loop is stalled:
  - Incoming HTTP requests from other users are queued at the kernel socket buffer.
  - Health checks (`GET /api/health`) time out, causing load balancers to falsely mark the server as dead and restart it.
  - WebSockets cannot send heartbeat ping/pong frames, causing connections to drop.

---

## 2. Horizontal Scaling & Resource Allocation

### Different Resource Profiles
- **API Servers**:
  - Bound by network I/O, JSON serialization, and request concurrency.
  - Require minimal CPU and moderate memory.
  - Scale based on requests per second (RPS) or incoming HTTP connections.
- **Worker Processes**:
  - Bound by task complexity (CPU-heavy data parsing, disk I/O, external network latency).
  - Require high CPU cores and larger RAM allocations.
  - Scale based on **Queue Depth** (the number of `waiting` jobs in Redis).

### Independent Deployments & Fault Isolation
If a task handler throws an uncaught exception, leaks memory, or exhausts available RAM:
- Only that worker process crashes.
- The operating system or container manager restarts the worker.
- **The API server remains 100% online**, serving requests to end users without interruption.

---

## 3. Worker Liveness: Leases and Heartbeats

In a distributed cluster, how do we know if a worker died midway through executing a task?
1. **Periodic Heartbeats**: Every 10 seconds, each worker updates its record in `WorkerHeartbeat` with `lastHeartbeat: new Date()`.
2. **Lease Expiration / Reaper**: A scheduler supervisor scans `TaskRun` records in `RUNNING` state. If a task's assigned worker has not posted a heartbeat in 30 seconds, the worker is presumed dead (`OOMKilled` or crashed).
3. **Re-Enqueueing**: The scheduler transitions the orphaned task back to `QUEUED` so a surviving worker can pick it up.
