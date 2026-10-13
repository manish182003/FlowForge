# FlowForge — Distributed Workflow Scheduler

> A portfolio-grade distributed workflow scheduling and execution platform built to demonstrate advanced software engineering, distributed systems principles, graph algorithms (DAGs), and real-time observability.

---

## Visual Identity
FlowForge adheres to a strict **monochrome design language**:
- Colors: Deep charcoal (`#0a0a0a`), dark surface (`#171717`), borders (`#2e2e2e`), crisp typography (`#f5f5f5`).
- No decorative purple/blue gradients or glassmorphism.
- Functional, clean, engineering-first aesthetic.

---

## Tech Stack

- **Frontend**: React (JavaScript only, no TypeScript), Vite, Native Fetch, Pure CSS Tokens (no Tailwind/Bootstrap).
- **Backend**: Node.js, Express (CommonJS), Mongoose (MongoDB Atlas / local), Redis, BullMQ.
- **Testing**: Jest, Supertest.
- **Infrastructure**: Docker Compose (`mongodb`, `redis`), Git.

---

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Docker & Docker Compose (optional for local DB/Redis, or MongoDB Atlas / Cloud Redis)

### 2. Environment Setup
Copy the environment template:
```bash
cp .env.example .env
```

### 3. Start Local Infrastructure (Optional)
If running Docker locally:
```bash
docker compose up -d
```

### 4. Run Server
```bash
cd server
npm install
npm test      # Run integration test suite
npm run dev   # Start development server on port 5000
```

### 5. Run Client
```bash
cd client
npm install
npm run dev   # Start Vite dev server on http://localhost:5173
```

---

## Phased Architecture Roadmap

See [docs/development-roadmap.md](file:///d:/AI_ML/flowforge/docs/development-roadmap.md) and [docs/architecture.md](file:///d:/AI_ML/flowforge/docs/architecture.md) for complete architecture notes and Module-by-Module guides.

