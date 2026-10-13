# Module 10: Production Readiness, Multi-Container Orchestration & CI/CD

## 1. Production Container Architecture

FlowForge is designed to scale horizontally across independent containerized processes. The entire platform can be booted locally or in production using Docker Compose.

```
                         [ USER BROWSER ]
                                |
                                v (Port 3000)
                     +---------------------+
                     |    client (Nginx)   |
                     |  - Serves React SPA |
                     |  - Reverse Proxies  |
                     +---------------------+
                       /                 \
        /api/* requests                   /ws WebSocket stream
             v                                     v
       +---------------------------------------------+
       |             api-server (Node.js)            |
       |  - Express REST API & Health Endpoints      |
       |  - WebSocket Telemetry Broadcast Engine     |
       |  - Graph Validation & DAG Algorithms        |
       +---------------------------------------------+
               |                             |
               v                             v
        +--------------+              +--------------+
        |   mongodb    |              |    redis     |
        | (State Store)|              | (Job Queue & |
        +--------------+              |  Worker Ring)|
               ^                             ^
               |                             |
        +--------------------------------------------+
        |             worker (Node.js)               |
        |  - Distributed Task Execution Engine       |
        |  - Worker Heartbeat Publisher (every 3s)   |
        |  - Sandboxed Task Handlers & Watchdogs     |
        +--------------------------------------------+
```

---

## 2. Container Responsibilities & Multi-Stage Builds

### A. API Server & Background Worker (`server/Dockerfile`)
Both the API server and worker process share the same container image but execute different commands:
- **API Server**: `CMD ["node", "src/server.js"]` (Port 5000)
- **Worker Process**: `command: ["node", "src/workers/worker.js"]` (Daemon)

#### PID 1 and Signal Forwarding with `dumb-init`:
In Docker, containers execute processes as PID 1. Standard Node.js does not handle signal forwarding or orphan reaping properly when running as PID 1.
We install `dumb-init` as the container `ENTRYPOINT`:
```dockerfile
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
```
When Docker issues `SIGTERM` during a deploy or scale-down, `dumb-init` ensures the signal reaches Node.js, triggering our graceful shutdown hooks:
1. Closes HTTP and WebSocket listeners so no new connections arrive.
2. Worker finishes in-flight jobs or releases locks.
3. MongoDB and Redis connection pools are cleanly drained.

### B. High-Performance Client (`client/Dockerfile` & `client/nginx.conf`)
The frontend uses a **multi-stage build**:
1. **Stage 1 (Node 20 Alpine)**: Runs `npm ci` and `npm run build` to generate the minified production assets.
2. **Stage 2 (Nginx Alpine)**: Discards Node.js and source files completely, serving only static HTML/JS/CSS through Nginx.
3. **Reverse Proxying**: Nginx routes `/api/` and `/ws` (with HTTP/1.1 `Upgrade: websocket` headers) directly to `api-server:5000`, eliminating cross-origin browser issues in production.

---

## 3. Automated CI/CD Pipeline (`.github/workflows/ci.yml`)

The GitHub Actions workflow guarantees zero regressions on every commit and pull request:

1. **`test-backend`**:
   - Boots real containerized MongoDB 7.0 and Redis 7.2 services in GitHub's Ubuntu runner.
   - Executes the full 100-test Jest suite across all 12 test suites.
   - Validates Graph Algorithms, Distributed State Machine transitions, Reaper recovery, and Consistent Hashing.
2. **`build-frontend`**:
   - Compiles the React Vite bundle to catch missing dependencies or syntax errors.
3. **`docker-lint-and-build`**:
   - Executes `docker build` on both server and client images to guarantee Dockerfiles remain valid and production-ready.

---

## 4. Running the Complete System Locally

### Option 1: Docker Compose (Zero Local Setup)
```bash
# Start all 5 services (mongo, redis, api, worker, client)
docker compose up --build -d

# View live cluster logs
docker compose logs -f

# Access the UI
http://localhost:3000
```

### Option 2: Native Local Development
```bash
# 1. Start database dependencies
docker compose up mongodb redis -d

# 2. Start API Server (Terminal 1)
cd server
npm install
npm run dev

# 3. Start Distributed Worker (Terminal 2)
cd server
npm run worker

# 4. Start React Frontend (Terminal 3)
cd client
npm install
npm run dev
```
