const {
  buildGraphRepresentation,
  detectCycle,
  topologicalSort,
  findReadyTasks
} = require('../src/algorithms/graph');
const { PriorityQueue } = require('../src/algorithms/heap');
const { calculateCriticalPath } = require('../src/algorithms/criticalPath');

describe('Module 3: Graph Algorithms (DSA Engine)', () => {
  describe('Adjacency List & In-Degree Calculation', () => {
    it('should correctly build adjacency list and in-degree counts for a diamond DAG', () => {
      // Diamond Graph:
      //      A (root)
      //     / \
      //    B   C
      //     \ /
      //      D (sink)
      const tasks = [
        { taskId: 'A', dependencies: [] },
        { taskId: 'B', dependencies: ['A'] },
        { taskId: 'C', dependencies: ['A'] },
        { taskId: 'D', dependencies: ['B', 'C'] }
      ];

      const { adj, inDegree } = buildGraphRepresentation(tasks);

      expect(inDegree.get('A')).toBe(0);
      expect(inDegree.get('B')).toBe(1);
      expect(inDegree.get('C')).toBe(1);
      expect(inDegree.get('D')).toBe(2);

      expect(adj.get('A').sort()).toEqual(['B', 'C']);
      expect(adj.get('B')).toEqual(['D']);
      expect(adj.get('C')).toEqual(['D']);
      expect(adj.get('D')).toEqual([]);
    });
  });

  describe('Cycle Detection (Kahn\'s Algorithm)', () => {
    it('should confirm hasCycle=false for valid DAGs', () => {
      const validDAG = [
        { taskId: '1', dependencies: [] },
        { taskId: '2', dependencies: ['1'] },
        { taskId: '3', dependencies: ['2'] }
      ];

      const result = detectCycle(validDAG);
      expect(result.hasCycle).toBe(false);
      expect(result.cycleNodes).toEqual([]);
    });

    it('should detect 2-node cycle (A -> B -> A)', () => {
      const cyclicTasks = [
        { taskId: 'A', dependencies: ['B'] },
        { taskId: 'B', dependencies: ['A'] }
      ];

      const result = detectCycle(cyclicTasks);
      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes.sort()).toEqual(['A', 'B']);
    });

    it('should detect 3-node cycle (A -> B -> C -> A)', () => {
      const cyclicTasks = [
        { taskId: 'A', dependencies: ['C'] },
        { taskId: 'B', dependencies: ['A'] },
        { taskId: 'C', dependencies: ['B'] },
        { taskId: 'D', dependencies: [] } // Independent valid node
      ];

      const result = detectCycle(cyclicTasks);
      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes.sort()).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Topological Sort (Kahn\'s Algorithm)', () => {
    it('should produce a valid linear sequence where prerequisites precede dependents', () => {
      const tasks = [
        { taskId: 'T4', dependencies: ['T2', 'T3'] },
        { taskId: 'T1', dependencies: [] },
        { taskId: 'T2', dependencies: ['T1'] },
        { taskId: 'T3', dependencies: ['T1'] }
      ];

      const order = topologicalSort(tasks);

      expect(order.length).toBe(4);
      // T1 must be first (inDegree 0)
      expect(order[0]).toBe('T1');
      // T4 must be last (depends on T2 and T3)
      expect(order[3]).toBe('T4');
      // T2 and T3 must be before T4
      expect(order.indexOf('T2')).toBeLessThan(order.indexOf('T4'));
      expect(order.indexOf('T3')).toBeLessThan(order.indexOf('T4'));
    });

    it('should throw an explicit descriptive error when given a cyclic graph', () => {
      const cyclicTasks = [
        { taskId: 'X', dependencies: ['Y'] },
        { taskId: 'Y', dependencies: ['X'] }
      ];

      expect(() => topologicalSort(cyclicTasks)).toThrow(/Cycle detected in workflow graph/);
    });
  });

  describe('Dynamic Ready-Task Detection', () => {
    const workflow = [
      { taskId: 'extract', dependencies: [] },
      { taskId: 'clean', dependencies: ['extract'] },
      { taskId: 'validate', dependencies: ['extract'] },
      { taskId: 'load', dependencies: ['clean', 'validate'] }
    ];

    it('should identify root tasks when no tasks have completed yet', () => {
      const ready = findReadyTasks(workflow, new Set(), new Set());
      expect(ready).toEqual(['extract']);
    });

    it('should identify clean and validate as ready once extract has succeeded', () => {
      const completed = new Set(['extract']);
      const ready = findReadyTasks(workflow, completed, new Set());
      expect(ready.sort()).toEqual(['clean', 'validate']);
    });

    it('should not mark load as ready if only one of its two prerequisites succeeded', () => {
      const completed = new Set(['extract', 'clean']);
      const ready = findReadyTasks(workflow, completed, new Set());
      // validate is ready, but load is NOT ready yet (still waiting on validate)
      expect(ready).toEqual(['validate']);
    });

    it('should mark load as ready once all prerequisites have succeeded', () => {
      const completed = new Set(['extract', 'clean', 'validate']);
      const ready = findReadyTasks(workflow, completed, new Set());
      expect(ready).toEqual(['load']);
    });

    it('should exclude currently active or queued tasks from ready results', () => {
      const completed = new Set(['extract']);
      const active = new Set(['clean']); // clean is already running in a worker
      const ready = findReadyTasks(workflow, completed, active);
      expect(ready).toEqual(['validate']);
    });
  });

  describe('Binary Max-Heap (Priority Queue)', () => {
    it('should extract tasks in descending order of priority', () => {
      const pq = new PriorityQueue();
      pq.push({ taskId: 'low', priority: 2 });
      pq.push({ taskId: 'urgent', priority: 10 });
      pq.push({ taskId: 'medium', priority: 5 });
      pq.push({ taskId: 'high', priority: 8 });

      expect(pq.pop().taskId).toBe('urgent');
      expect(pq.pop().taskId).toBe('high');
      expect(pq.pop().taskId).toBe('medium');
      expect(pq.pop().taskId).toBe('low');
      expect(pq.pop()).toBeNull();
    });

    it('should break ties deterministically by earlier arrival timestamp', () => {
      const pq = new PriorityQueue();
      const t1 = 1000;
      const t2 = 2000;

      pq.push({ taskId: 'second_arrival', priority: 5, enqueuedAt: t2 });
      pq.push({ taskId: 'first_arrival', priority: 5, enqueuedAt: t1 });

      expect(pq.pop().taskId).toBe('first_arrival');
      expect(pq.pop().taskId).toBe('second_arrival');
    });

    it('should prevent starvation via priority aging', () => {
      // 1000ms aging interval
      const pq = new PriorityQueue({ agingIntervalMs: 1000 });
      const now = 5000;

      // taskA arrived 4000ms ago with base priority 4 -> effective priority: 4 + 4 = 8
      pq.push({ taskId: 'aged_task', priority: 4, enqueuedAt: 1000 });
      // taskB just arrived with base priority 7 -> effective priority: 7 + 0 = 7
      pq.push({ taskId: 'new_task', priority: 7, enqueuedAt: now });

      // Aged task should win despite lower base priority!
      expect(pq.pop().taskId).toBe('aged_task');
    });
  });

  describe('Critical-Path Dynamic Programming Analysis', () => {
    it('should compute exact critical path and bottleneck makespan for parallel branches', () => {
      // Graph structure:
      //   init (10s)
      //    ├── slow_branch (50s) ──┐
      //    └── fast_branch (10s) ──┴──> finish (5s)
      const tasks = [
        { taskId: 'init', dependencies: [] },
        { taskId: 'slow_branch', dependencies: ['init'] },
        { taskId: 'fast_branch', dependencies: ['init'] },
        { taskId: 'finish', dependencies: ['slow_branch', 'fast_branch'] }
      ];

      const durationMap = {
        init: 10,
        slow_branch: 50,
        fast_branch: 10,
        finish: 5
      };

      const result = calculateCriticalPath(tasks, durationMap);

      // Sequential sum: 10 + 50 + 10 + 5 = 75 seconds
      expect(result.sequentialDuration).toBe(75);

      // Parallel makespan: init(10) + slow_branch(50) + finish(5) = 65 seconds
      expect(result.minimumMakespan).toBe(65);

      // Critical path sequence: ['init', 'slow_branch', 'finish']
      expect(result.criticalPath).toEqual(['init', 'slow_branch', 'finish']);

      // Earliest start/finish schedule verification
      expect(result.scheduleTable['init'].earliestStart).toBe(0);
      expect(result.scheduleTable['init'].earliestFinish).toBe(10);

      expect(result.scheduleTable['slow_branch'].earliestStart).toBe(10);
      expect(result.scheduleTable['slow_branch'].earliestFinish).toBe(60);

      expect(result.scheduleTable['fast_branch'].earliestStart).toBe(10);
      expect(result.scheduleTable['fast_branch'].earliestFinish).toBe(20);

      // Finish must wait until max(60, 20) = 60
      expect(result.scheduleTable['finish'].earliestStart).toBe(60);
      expect(result.scheduleTable['finish'].earliestFinish).toBe(65);
    });
  });
});
