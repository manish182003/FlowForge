# FlowForge Phased Development Roadmap

This roadmap governs the incremental implementation of FlowForge. Each phase must be built, tested, taught, and documented before moving to the next.

| Phase | Module | Key Capabilities | Status |
| :--- | :--- | :--- | :--- |
| **01** | **Application Foundation** | Express API, Mongoose DB connection, Zod env validation, centralized error handling, React monochrome design tokens, health endpoint. | **COMPLETED** |
| **02** | **Workflow Modeling & Canvas** | Workflow & Task Mongoose schemas, SVG/CSS graph editor, task dependency configuration, CRUD endpoints. | **COMPLETED** |
| **03** | **Graph Algorithms & DSA Core** | Adjacency list representation, Kahn's topological sort (O(V+E)), cycle detection, binary heap priority scheduling, critical-path DP. | **COMPLETED** |
| **04** | **Execution Engine & State Machine**| Explicit task state transitions (BLOCKED, QUEUED, RUNNING, SUCCEEDED, FAILED, RETRY_WAIT), BullMQ queue, Redis leases, idempotency. | *PENDING* |
| **05** | **Distributed Workers** | Multi-process worker pool, simulation handlers, real allowlisted handlers (SSRF-protected HTTP, CSV/JSON parser), heartbeats, liveness. | *PENDING* |
| **06** | **Real-Time Observability** | Native WebSocket server (`ws`), live task execution board, real-time log streaming, queue metrics. | *PENDING* |
| **07** | **Failure Injection & Recovery** | Worker crash tests, Redis network partition recovery, reconciliation outbox for pending jobs, lease expiration tests. | *PENDING* |
| **08** | **AI Workflow Generator (Optional)** | LLM natural-language workflow generation with strict server-side AST schema validation and manual user approval. | *PENDING* |
| **09** | **Benchmarking & Performance** | Repeatable load test script measuring throughput, task latency, queue depth under load, and recovery metrics. | *PENDING* |

