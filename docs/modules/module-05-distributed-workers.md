# Module 05: Distributed Workers & Secure Task Handlers

## 1. Goal and Responsibilities
Module 05 introduces the autonomous **Worker Pool** and pluggable **Task Handlers**:
1. **Standalone Worker Process (`server/src/workers/worker.js`)**: An autonomous Node.js service that runs independently from the API server, pulls jobs from the queue, and claims tasks atomically.
2. **Worker Liveness & Heartbeats (`WorkerHeartbeat`)**: Tracks worker identity (`workerId`), PID, active jobs, and liveness timestamps in MongoDB.
3. **Pluggable Task Handlers**:
   - **Simulation Handler**: Configurable execution delays, intentional failures, fail-$N$-times-then-succeed, and timeouts.
   - **SSRF-Protected HTTP Handler**: Blocks loopback (`127.0.0.1`, `localhost`), link-local/cloud metadata (`169.254.169.254`), and private RFC 1918 subnets.
   - **File Validation Handler**: Structural verification of CSV and JSON datasets against schemas and record limits.
   - **Data Transformation Handler**: Data operations (`clean_nulls`, `filter`, `aggregate`, `sort`).
   - **Report Generation Handler**: Generates JSON and Markdown execution audit summaries.
4. **Graceful Shutdown**: Traps `SIGINT` / `SIGTERM` to complete active jobs before terminating.

---

## 2. Engineering Concepts Taught

### Worker Process Separation
- In production architectures, CPU-intensive data transformations or slow HTTP calls must **never** run inside the web server's event loop.
- Doing so monopolizes the single JavaScript thread, preventing the API from answering user HTTP requests or health probes.
- Running workers as separate processes allows horizontal scaling across multiple CPU cores or separate virtual machines.

### Server-Side Request Forgery (SSRF) Defense
- **The Threat**: If a user submits an HTTP task with `url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/"`, a naive worker would fetch AWS/GCP cloud credentials and return them in the task output.
- **The Defense**:
  1. We parse the URL with the WHATWG `URL` parser.
  2. Protocol must be strictly `http:` or `https:`.
  3. Hostnames are sanitized to strip IPv6 bracket notation (`[::1]`).
  4. IP addresses are checked against restricted CIDR ranges: loopback (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and link-local (`169.254.0.0/16`).
  5. Redirects are inspected to prevent DNS rebinding or redirect-based bypassing.

---

## 3. Files Created or Modified

| File | Type | Responsibility |
| :--- | :--- | :--- |
| `server/src/models/WorkerHeartbeat.js` | Backend | Mongoose schema for worker identity, PID, concurrency, and heartbeats |
| `server/src/task-handlers/simulation.handler.js` | Backend | Handler for delays, intentional failures, and retry simulations |
| `server/src/task-handlers/http.handler.js` | Backend | SSRF-protected HTTP request execution handler |
| `server/src/task-handlers/fileValidation.handler.js` | Backend | CSV and JSON structure validation handler |
| `server/src/task-handlers/dataTransform.handler.js` | Backend | Data operations (clean, filter, group by aggregate, sort) |
| `server/src/task-handlers/reportGeneration.handler.js` | Backend | Markdown and JSON summary report compiler |
| `server/src/task-handlers/registry.js` | Backend | Central dispatcher mapping allowlisted task types to handlers |
| `server/src/workers/worker.js` | Backend | Standalone worker process runner with concurrency and graceful shutdown |
| `server/tests/workers.test.js` | Tests | Unit tests verifying all task handlers and SSRF defenses |

---

## 4. Test Verification
All 60 tests passing across 7 test suites:
```bash
PASS tests/workers.test.js
PASS tests/run.api.test.js
PASS tests/executionEngine.test.js
PASS tests/workflow.api.test.js
PASS tests/health.test.js
PASS tests/algorithms.test.js
PASS tests/workflow.schema.test.js

Test Suites: 7 passed, 7 total
Tests:       60 passed, 60 total
Snapshots:   0 total
Time:        2.767 s
```

