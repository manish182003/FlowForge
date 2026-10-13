# Module 06: Real-Time Observability & WebSockets

## 1. Architectural Motivation: Why WebSockets Over HTTP Polling?

In workflow orchestration systems (like Airflow, Temporal, or FlowForge), users need to watch tasks progress through states:
`BLOCKED -> QUEUED -> RUNNING -> SUCCEEDED / FAILED / RETRY_WAIT`.

### The Problem with HTTP Short Polling:
1. **Network Overhead**: If the frontend polls `GET /api/runs/:id` every 1,000ms, each request incurs TCP/TLS connection handshake overhead, HTTP headers (~500-1,000 bytes per request), and database queries, even when **no task state has changed** (95%+ of polling requests return identical data).
2. **Artificial Latency**: If a task completes at $t = 100\text{ms}$ and the next poll is at $t = 1,000\text{ms}$, the UI lags behind reality by up to 900ms.
3. **Thundering Herd**: If 500 users watch a running workflow, short polling imposes 500 requests per second directly onto the database.

### The WebSocket Solution:
A single bidirectional TCP socket is established via an HTTP Upgrade handshake (`GET /ws` with `Upgrade: websocket`).
- **Framing Overhead**: Only 2 to 6 bytes per frame (compared to ~800 bytes per HTTP header).
- **Sub-millisecond Latency**: The moment a worker finishes a task, the server pushes an event directly down the open socket.
- **Selective Subscription (Room Model)**: Sockets subscribe only to the `runId` they care about, filtering out irrelevant traffic.

---

## 2. Key Architecture Components in FlowForge

```
+-------------------------------------------------------------+
|                      React Frontend                         |
|  - useWebSocket hook (auto-reconnect with exp backoff)     |
|  - LogViewer terminal component (monochrome, filterable)     |
+------------------------------+------------------------------+
                               | WS: /ws (Sub: runId)
                               v
+-------------------------------------------------------------+
|               Node.js WebSocket Server (ws)                 |
|  - initWebSocketServer: mounts on HTTP server               |
|  - Heartbeat ping/pong (detects dead half-open TCP sockets) |
|  - runSubscriptions Map<runId, Set<WebSocket>>              |
+------------------------------+------------------------------+
                               ^ broadcastEvent(type, payload)
+------------------------------+------------------------------+
|             FlowForge Execution Engine Scheduler            |
|  1. Persist state change to MongoDB (TaskRun / WorkflowRun) |
|  2. Persist log to MongoDB (ExecutionLog)                   |
|  3. Call broadcastEvent('TASK_STATE_CHANGED', payload)      |
+-------------------------------------------------------------+
```

---

## 3. Critical System Design Decisions

### A. The Persistence-First Rule (Preventing Phantom States)
> **Rule**: Always `await` the database persistence write (`taskRun.save()`) **before** calling `broadcastEvent()`.

If the server broadcasts before persisting:
1. The WebSocket sends `SUCCEEDED` to the browser.
2. The database write crashes or experiences a network partition.
3. The UI shows a green/succeeded node, but refreshing the page loads `FAILED` or `RUNNING` from the database.
4. Persistence-first guarantees that what the user sees in real time matches the single source of truth in storage.

### B. Heartbeat Ping/Pong & Half-Open TCP Sockets
In TCP, when a client loses internet connectivity (e.g., laptop lid closed, cable pulled), the server's OS socket may remain in the `ESTABLISHED` state indefinitely until a write timeout occurs hours later.
To prevent leaking memory and socket handles:
1. The server runs an interval every 30 seconds marking `ws.isAlive = false` and issuing `ws.ping()`.
2. Compliant clients (and browsers) immediately reply with `pong`, resetting `ws.isAlive = true`.
3. If on the next tick `ws.isAlive` is still `false`, the server terminates the socket and frees resources.

### C. Self-Healing State on Reconnection (Snapshot Reconciliation)
Network drops are inevitable. If a WebSocket disconnects while 3 tasks succeed:
1. The client's `useWebSocket` hook catches `onclose` and initiates exponential backoff reconnects.
2. Upon successful reconnection, the hook fires `onReconnect(runId)`.
3. The client immediately fetches `/api/runs/:runId` and `/api/runs/:runId/logs` to heal any lost intermediate frames.

---

## 4. DSA / Systems Programming: C++ vs JavaScript Comparison

### How Event-Driven WebSockets Work:

| Concept | JavaScript (Node.js + `ws`) | C++ (`Boost.Beast` / `uWebSockets`) |
| :--- | :--- | :--- |
| **I/O Multiplexing** | `libuv` event loop (`epoll` on Linux, `IOCP` on Windows) | Explicit `epoll_wait` / `io_context.run()` with `Boost.Asio` |
| **Concurrency** | Single-threaded event loop, asynchronous callbacks | Multi-threaded worker pool or thread-per-core reactor pattern |
| **Room Map** | `Map<string, Set<WebSocket>>` with garbage-collected references | `std::unordered_map<std::string, std::unordered_set<std::shared_ptr<WebSocket>>>` |
| **Memory Safety** | Automatic GC; closed sockets must be removed from Set | `std::weak_ptr` to avoid circular references and dangling pointers |

### Side-by-Side: Room Broadcasting

#### C++ (`Boost.Beast` / Modern C++20):
```cpp
#include <unordered_map>
#include <unordered_set>
#include <memory>
#include <string>
#include <mutex>

class WebSocketSession; // Forward declaration

class RoomManager {
private:
    std::unordered_map<std::string, std::unordered_set<std::shared_ptr<WebSocketSession>>> rooms;
    std::mutex mtx;

public:
    void subscribe(const std::string& runId, std::shared_ptr<WebSocketSession> session) {
        std::lock_guard<std::mutex> lock(mtx);
        rooms[runId].insert(session);
    }

    void broadcast(const std::string& runId, const std::string& message) {
        std::lock_guard<std::mutex> lock(mtx);
        auto it = rooms.find(runId);
        if (it != rooms.end()) {
            for (const auto& session : it->second) {
                session->send(message); // Asynchronous write queue
            }
        }
    }
};
```

#### JavaScript (FlowForge `wsServer.js`):
```javascript
const runSubscriptions = new Map(); // runId -> Set<WebSocket>

function broadcastEvent(eventType, payload = {}) {
  if (!wss) return;
  const message = JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() });
  const targetRunId = payload.runId;

  if (targetRunId && runSubscriptions.has(targetRunId)) {
    for (const client of runSubscriptions.get(targetRunId)) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
```

---

## 5. Verification & Test Coverage
- **`server/tests/websocket.test.js`**:
  - Tests WS connection handshake (`CONNECTED`).
  - Tests heartbeat ping/pong (`PING` -> `PONG`).
  - Tests room isolation: confirms subscribers to `run-1` receive events while subscribers to `run-2` do not.
  - Tests error handling on malformed non-JSON payloads.
  - Tests `GET /api/runs/:runId/logs` REST endpoint with chronological ordering.
