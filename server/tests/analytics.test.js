const request = require('supertest');
const createApp = require('../src/app');
const WorkflowRun = require('../src/models/WorkflowRun');
const TaskRun = require('../src/models/TaskRun');
const { 
  computeActualCriticalPath, 
  computeRunAnalytics 
} = require('../src/scheduler/analyticsEngine');

describe('Module 8: Execution Analytics & Critical Path Analysis', () => {
  const app = createApp();

  describe('Pure Algorithm: computeActualCriticalPath (Dynamic Programming)', () => {
    it('should correctly identify the critical bottleneck chain and theoretical makespan in a diamond DAG', () => {
      // Diamond DAG:
      //         -> B (300ms) -
      //       /               \
      // A (100ms)              -> D (100ms)
      //       \               /
      //         -> C (150ms) -
      const tasks = [
        { taskId: 'A', durationMs: 100, dependencies: [] },
        { taskId: 'B', durationMs: 300, dependencies: ['A'] },
        { taskId: 'C', durationMs: 150, dependencies: ['A'] },
        { taskId: 'D', durationMs: 100, dependencies: ['B', 'C'] }
      ];
      const topoOrder = ['A', 'B', 'C', 'D'];

      const result = computeActualCriticalPath(tasks, topoOrder);

      // Path A -> B -> D: 100 + 300 + 100 = 500ms (Critical Path)
      // Path A -> C -> D: 100 + 150 + 100 = 350ms
      expect(result.criticalMakespanMs).toBe(500);
      expect(result.criticalPath).toEqual(['A', 'B', 'D']);
    });

    it('should handle single-node workflow trivially', () => {
      const tasks = [
        { taskId: 'single_task', durationMs: 250, dependencies: [] }
      ];
      const topoOrder = ['single_task'];

      const result = computeActualCriticalPath(tasks, topoOrder);

      expect(result.criticalMakespanMs).toBe(250);
      expect(result.criticalPath).toEqual(['single_task']);
    });

    it('should compute the bottleneck among disconnected parallel roots', () => {
      const tasks = [
        { taskId: 'root_short', durationMs: 120, dependencies: [] },
        { taskId: 'root_long', durationMs: 450, dependencies: [] }
      ];
      const topoOrder = ['root_short', 'root_long'];

      const result = computeActualCriticalPath(tasks, topoOrder);

      expect(result.criticalMakespanMs).toBe(450);
      expect(result.criticalPath).toEqual(['root_long']);
    });
  });

  describe('computeRunAnalytics Service', () => {
    const mockRunId = '507f1f77bcf86cd799439011';
    const mockWorkflowId = '507f1f77bcf86cd799439022';

    it('should compute sequential work, makespan, speedup factor, and flag critical tasks', async () => {
      const startTime = new Date('2026-10-13T10:00:00.000Z');
      const endTime = new Date('2026-10-13T10:00:00.500Z'); // 500ms wall-clock duration

      const mockWorkflowRun = {
        _id: mockRunId,
        workflowId: mockWorkflowId,
        workflowName: 'ETL Pipeline',
        status: 'SUCCEEDED',
        startedAt: startTime,
        completedAt: endTime
      };

      const mockTasks = [
        {
          _id: '607f1f77bcf86cd799439001',
          taskId: 'step_1',
          name: 'Extract',
          type: 'http_request',
          status: 'SUCCEEDED',
          durationMs: 200,
          dependencies: [],
          createdAt: startTime,
          startedAt: startTime,
          completedAt: new Date(startTime.getTime() + 200)
        },
        {
          _id: '607f1f77bcf86cd799439002',
          taskId: 'step_2',
          name: 'Transform',
          type: 'data_transformation',
          status: 'SUCCEEDED',
          durationMs: 300,
          dependencies: ['step_1'],
          createdAt: startTime,
          startedAt: new Date(startTime.getTime() + 200),
          completedAt: endTime
        },
        {
          _id: '607f1f77bcf86cd799439003',
          taskId: 'step_parallel',
          name: 'Audit Log',
          type: 'simulated',
          status: 'SUCCEEDED',
          durationMs: 150,
          dependencies: ['step_1'],
          createdAt: startTime,
          startedAt: new Date(startTime.getTime() + 200),
          completedAt: new Date(startTime.getTime() + 350)
        }
      ];

      jest.spyOn(WorkflowRun, 'findById').mockReturnValueOnce({
        lean: () => Promise.resolve(mockWorkflowRun)
      });
      jest.spyOn(TaskRun, 'find').mockReturnValueOnce({
        sort: () => ({
          lean: () => Promise.resolve(mockTasks)
        })
      });

      const analytics = await computeRunAnalytics(mockRunId);

      // Sequential work = 200 + 300 + 150 = 650ms
      expect(analytics.totalSequentialMs).toBe(650);
      // Actual wall-clock makespan = 500ms
      expect(analytics.actualMakespanMs).toBe(500);
      // Theoretical critical path: step_1 (200) -> step_2 (300) = 500ms
      expect(analytics.criticalMakespanMs).toBe(500);
      expect(analytics.criticalPath).toEqual(['step_1', 'step_2']);

      // Speedup factor = 650 / 500 = 1.30
      expect(analytics.speedupFactor).toBe(1.3);

      // Enriched tasks must flag critical items
      const step1 = analytics.tasks.find(t => t.taskId === 'step_1');
      const step2 = analytics.tasks.find(t => t.taskId === 'step_2');
      const stepParallel = analytics.tasks.find(t => t.taskId === 'step_parallel');

      expect(step1.isCritical).toBe(true);
      expect(step2.isCritical).toBe(true);
      expect(stepParallel.isCritical).toBe(false);

      WorkflowRun.findById.mockRestore();
      TaskRun.find.mockRestore();
    });
  });

  describe('GET /api/runs/:runId/analytics Endpoint', () => {
    const mockRunId = '507f1f77bcf86cd799439011';

    it('should return 400 for invalid runId parameter', async () => {
      const response = await request(app).get('/api/runs/invalid-id/analytics');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 when WorkflowRun is not found', async () => {
      jest.spyOn(WorkflowRun, 'findById').mockReturnValueOnce({
        lean: () => Promise.resolve(null)
      });
      jest.spyOn(TaskRun, 'find').mockReturnValueOnce({
        sort: () => ({
          lean: () => Promise.resolve([])
        })
      });

      const response = await request(app).get(`/api/runs/${mockRunId}/analytics`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');

      WorkflowRun.findById.mockRestore();
      TaskRun.find.mockRestore();
    });

    it('should return 200 with complete analytics payload on valid run', async () => {
      jest.spyOn(WorkflowRun, 'findById').mockReturnValueOnce({
        lean: () => Promise.resolve({
          _id: mockRunId,
          workflowId: '507f1f77bcf86cd799439022',
          workflowName: 'Demo Pipeline',
          status: 'SUCCEEDED'
        })
      });
      jest.spyOn(TaskRun, 'find').mockReturnValueOnce({
        sort: () => ({
          lean: () => Promise.resolve([])
        })
      });

      const response = await request(app).get(`/api/runs/${mockRunId}/analytics`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('speedupFactor');
      expect(response.body.data).toHaveProperty('criticalPath');

      WorkflowRun.findById.mockRestore();
      TaskRun.find.mockRestore();
    });
  });
});
