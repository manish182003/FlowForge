# Module 01: Application Foundation & Architectural Groundwork

## 1. Goal and Responsibilities
Module 01 establishes the production-grade foundation of the FlowForge platform. It wires together the backend Express application, configuration validation, database resilience, centralized error handling, the React frontend shell with a monochrome design system, and integration tests.

---

## 2. Concepts Introduced

### Node.js & System Design
- **Fail-Fast Configuration**:
  Using `Zod` to strictly parse and validate all environment variables at startup. If any critical variable is missing or malformed, the process exits immediately with a fatal diagnostic instead of failing midway during request handling.
- **App & Server Decoupling**:
  `app.js` configures routes, middleware, and parsers without binding to a network port. `server.js` binds to the port and handles process lifecycle signals. This enables integration test suites (Supertest) to execute requests against `app` in-memory.
- **Express Middleware Lifecycle**:
  Middleware executes in the order it is mounted:
  `CORS -> express.json() -> Routes -> 404 Handler -> 4-argument Error Handler`.
- **Graceful Shutdown**:
  Catching `SIGINT` (Ctrl+C) and `SIGTERM` to close the HTTP server and database connections cleanly before exiting.

### Frontend & Styling
- **Monochrome Design Tokens (`design-tokens.css`)**:
  Reusable CSS custom properties (`--bg-primary`, `--border-primary`, `--text-primary`) restricted to black, white, charcoal, and neutral grayscale tones.
- **Component Lifecycle (`useState` & `useEffect`)**:
  - `useState` manages local reactive state (`healthData`, `loading`, `error`).
  - `useEffect` triggers the initial API ping on mount and registers a polling cleanup function.

---

## 3. Files Created in Module 01

| File | Responsibility |
| :--- | :--- |
| `server/src/config/env.js` | Zod schema validation for environment variables |
| `server/src/config/db.js` | Mongoose connection helper with event listeners & state reporting |
| `server/src/middleware/notFoundHandler.js` | Standardized 404 JSON response for unmatched routes |
| `server/src/middleware/errorHandler.js` | Centralized 4-argument Express error handler with stack sanitation |
| `server/src/routes/health.routes.js` | `/api/health` diagnostic endpoint reporting uptime and DB state |
| `server/src/app.js` | Express app creation and middleware composition |
| `server/src/server.js` | Entrypoint with server listener and graceful shutdown signals |
| `server/tests/health.test.js` | Supertest integration tests verifying health, 404, and error handling |
| `client/src/styles/design-tokens.css` | Monochrome design system tokens and resets |
| `client/src/styles/app.css` | Component styles (header, badges, tables, panels, buttons) |
| `client/src/services/api.js` | Native Fetch wrapper with structured error parsing |
| `client/src/components/Header.jsx` | Top header with live API status badge |
| `client/src/components/StatusBadge.jsx` | Reusable monochrome status pill |
| `client/src/App.jsx` | Main dashboard displaying system diagnostics and roadmap |
| `docker-compose.yml` | Local Docker services for MongoDB and Redis |
| `.env.example` | Template for environment configuration |

---

## 4. Test Verification
The Jest integration suite was executed with `--runInBand`:
```bash
PASS tests/health.test.js
  Module 1: Foundation Endpoints & Middleware
    GET /api/health
      √ should return 200 OK with system diagnostics (62 ms)
    404 Not Found Middleware
      √ should return 404 JSON for unknown endpoints (6 ms)
    Centralized Error Handling Middleware
      √ should catch unhandled errors and return structured 500 JSON (45 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

---

## 5. Known Limitations & Next Steps
- Database is currently checked via Mongoose readyState; workflow collections will be introduced in Module 02.
- Redis and BullMQ connection wiring will be introduced alongside task execution queues in Module 04.
