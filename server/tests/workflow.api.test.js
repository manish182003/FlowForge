const request = require('supertest');
const createApp = require('../src/app');
const Workflow = require('../src/models/Workflow');

describe('Module 2: Workflow REST API Endpoints', () => {
  const app = createApp();

  describe('POST /api/workflows Validation', () => {
    it('should return 400 Bad Request when required name is missing', async () => {
      const response = await request(app)
        .post('/api/workflows')
        .send({
          tasks: []
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 400 Bad Request when task dependencies are invalid', async () => {
      const response = await request(app)
        .post('/api/workflows')
        .send({
          name: 'Invalid Deps Workflow',
          tasks: [
            {
              taskId: 'step_a',
              name: 'Step A',
              type: 'simulated',
              dependencies: ['missing_step']
            }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.details[0].message).toContain('does not exist');
    });

    it('should return 400 CYCLE_DETECTED when workflow contains a circular dependency', async () => {
      const response = await request(app)
        .post('/api/workflows')
        .send({
          name: 'Deadlocked Cyclic Workflow',
          tasks: [
            { taskId: 'node_1', name: 'Node 1', type: 'simulated', dependencies: ['node_2'] },
            { taskId: 'node_2', name: 'Node 2', type: 'simulated', dependencies: ['node_1'] }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CYCLE_DETECTED');
      expect(response.body.error.cycleNodes.sort()).toEqual(['node_1', 'node_2']);
    });
  });

  describe('GET /api/workflows/:id Parameter Validation', () => {
    it('should return 400 when an invalid MongoDB ObjectId string is supplied', async () => {
      const response = await request(app).get('/api/workflows/not-a-valid-id');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ID');
    });
  });

  describe('Mocked Persistence Operations (CRUD)', () => {
    const mockId = '507f1f77bcf86cd799439011';

    it('should return 201 Created when a valid workflow is submitted', async () => {
      const mockSaved = {
        _id: mockId,
        name: 'Valid Workflow',
        tasks: [{ taskId: 't1', name: 'Task 1', type: 'simulated', dependencies: [] }],
        createdAt: new Date().toISOString()
      };

      // Mock save implementation
      jest.spyOn(Workflow.prototype, 'save').mockResolvedValueOnce(mockSaved);

      const response = await request(app)
        .post('/api/workflows')
        .send({
          name: 'Valid Workflow',
          tasks: [{ taskId: 't1', name: 'Task 1', type: 'simulated' }]
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Valid Workflow');

      Workflow.prototype.save.mockRestore();
    });

    it('should return 200 with pagination on GET /api/workflows', async () => {
      const mockList = [
        { _id: mockId, name: 'Workflow A', tasks: [] }
      ];

      jest.spyOn(Workflow, 'find').mockReturnValueOnce({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => Promise.resolve(mockList)
            })
          })
        })
      });
      jest.spyOn(Workflow, 'countDocuments').mockResolvedValueOnce(1);

      const response = await request(app).get('/api/workflows?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.pagination.total).toBe(1);

      Workflow.find.mockRestore();
      Workflow.countDocuments.mockRestore();
    });

    it('should return 404 when workflow ID is not found in database', async () => {
      jest.spyOn(Workflow, 'findById').mockReturnValueOnce({
        lean: () => Promise.resolve(null)
      });

      const response = await request(app).get(`/api/workflows/${mockId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');

      Workflow.findById.mockRestore();
    });

    it('should return 200 on DELETE /api/workflows/:id when deleted', async () => {
      jest.spyOn(Workflow, 'findByIdAndDelete').mockReturnValueOnce({
        lean: () => Promise.resolve({ _id: mockId })
      });

      const response = await request(app).delete(`/api/workflows/${mockId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      Workflow.findByIdAndDelete.mockRestore();
    });
  });
});

