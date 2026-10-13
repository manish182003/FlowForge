# Module 02: Workflow Modeling, Schema Validation & Directed Graph Canvas

## 1. Responsibilities & Goals
Module 02 enables users to create, view, edit, and persist workflow Directed Acyclic Graphs (DAGs). It provides:
1. **Durable Data Models**: Mongoose schema modeling Workflows as aggregate roots containing tasks, dependency arrays, priorities, and retry policies.
2. **Referential Integrity Validation**: Zod schemas ensuring unique task IDs, no self-loops, and valid dependency references.
3. **RESTful Workflow Endpoints**: `POST`, `GET`, `PUT`, `DELETE` operations on `/api/workflows`.
4. **Native SVG Directed Graph Canvas**: A pure React + SVG visualizer and editor adhering strictly to monochrome design rules.

---

## 2. Engineering Concepts Taught

### MongoDB & Aggregate Root Pattern
- In Domain-Driven Design (DDD), an **Aggregate Root** is an entity that binds child entities together under a single root.
- A Workflow contains an array of Tasks. In MongoDB, tasks are modeled as **embedded subdocuments** rather than separate collections because:
  1. A task cannot logically exist outside of its parent workflow.
  2. Loading a workflow graph requires fetching all tasks and their dependencies in a single atomic read operation, avoiding costly multi-collection `$lookup` joins.
  3. Saving updates to a workflow graph is atomic at the document level.

### Referential Integrity in Application Code
Because MongoDB is a non-relational document store, foreign keys between array elements are not enforced by the database engine.
We enforce this in application code via Zod's `.superRefine(...)`:
1. **Uniqueness Check**: A `Set` tracks encountered task IDs. If a duplicate is found, validation fails.
2. **Dependency Existence**: Every ID in `task.dependencies` must exist in the workflow's task set.
3. **Self-Loop Prevention**: A task is rejected if `depId === task.taskId`.

### Declarative SVG Graph Visualization
- Instead of pulling in a heavy external canvas library, we use native SVG:
  - Directed edges are computed dynamically by mapping `taskMap.get(depId) -> task`.
  - SVG cubic Bézier curves (`<path d="M ... C ...">`) connect the output port of prerequisite nodes to the input port of dependent nodes.
  - `<marker id="arrow">` automatically renders arrowhead directions.
- Drag-and-drop interactivity updates node positions (`uiPosition: { x, y }`) without disturbing graph topology.

---

## 3. Files Created or Modified

| File | Type | Responsibility |
| :--- | :--- | :--- |
| `server/src/schemas/workflow.schema.js` | Backend | Zod validation for tasks, allowlisted types, and graph reference integrity |
| `server/src/models/Workflow.js` | Backend | Mongoose schema with embedded tasks, priority bounds, and indexes |
| `server/src/controllers/workflow.controller.js` | Backend | CRUD controller with pagination and ObjectId validation |
| `server/src/routes/workflow.routes.js` | Backend | Express route definitions for `/api/workflows` |
| `server/tests/workflow.schema.test.js` | Tests | Unit tests for graph validation rules |
| `server/tests/workflow.api.test.js` | Tests | Integration tests for workflow REST API |
| `client/src/services/workflowApi.js` | Frontend | Fetch API utility for workflow CRUD |
| `client/src/components/GraphCanvas.jsx` | Frontend | Native SVG directed graph visualizer with drag-and-drop nodes |
| `client/src/components/TaskModal.jsx` | Frontend | Modal dialog for creating and editing tasks and dependencies |
| `client/src/App.jsx` | Frontend | Integrated tabbed interface connecting canvas, sidebar, and status |
| `client/src/styles/app.css` | Styling | Strict monochrome styles for canvas, nodes, modal, and tabs |

---

## 4. Test Verification
All 16 tests passing across 3 test suites:
```bash
PASS tests/workflow.api.test.js
PASS tests/workflow.schema.test.js
PASS tests/health.test.js

Test Suites: 3 passed, 3 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        1.069 s
```
Client Vite bundle successfully generated:
```bash
vite build -> dist/assets/index-B-WmRq7q.js (163.48 kB) in 929ms
```

---

## 5. Next Steps
Module 03 will implement the plain JavaScript **Graph Algorithms** (Adjacency Lists, Kahn's Topological Sort, Cycle Detection, Binary Min/Max Heap for Priority Scheduling, and Critical-Path Dynamic Programming).

