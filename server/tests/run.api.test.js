const request = require('supertest');
const createApp = require('../src/app');
const WorkflowRun = require('../src/models/WorkflowRun');
const TaskRun = require('../src/models/TaskRun');

describe('Module 4: Execution Engine API Routes', () => {
  const app = createApp();
  const mockId = '507f1f77bcf86cd799439011';

  describe('GET /api/queue/metrics', () => {
    it('should return queue depth metrics and current engine mode', async () => {
      const response = await request(app).get('/api/queue/metrics');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('counts');
      expect(response.body.data).toHaveProperty('mode');
    });
  });

  describe('GET /api/workflows/:id/runs Parameter Validation', () => {
    it('should return 400 for invalid workflow ID format', async () => {
      const response = await request(app).get('/api/workflows/invalid-id/runs');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ID');
    });

    it('should return 200 with list of runs for valid workflow ID', async () => {
      jest.spyOn(WorkflowRun, 'find').mockReturnValueOnce({
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve([
              { _id: mockId, workflowId: mockId, status: 'RUNNING' }
            ])
          })
        })
      });

      const response = await request(app).get(`/api/workflows/${mockId}/runs`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);

      WorkflowRun.find.mockRestore();
    });
  });

  describe('GET /api/runs/:runId', () => {
    it('should return 404 if WorkflowRun is not found', async () => {
      jest.spyOn(WorkflowRun, 'findById').mockReturnValueOnce({
        lean: () => Promise.resolve(null)
      });
      jest.spyOn(TaskRun, 'find').mockReturnValueOnce({
        sort: () => ({
          lean: () => Promise.resolve([])
        })
      });

      const response = await request(app).get(`/api/runs/${mockId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);

      WorkflowRun.findById.mockRestore();
      TaskRun.find.mockRestore();
    });
  });
});

