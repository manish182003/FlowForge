const request = require('supertest');
const createApp = require('../src/app');
const WorkerHeartbeat = require('../src/models/WorkerHeartbeat');
const TaskRun = require('../src/models/TaskRun');
const WorkflowRun = require('../src/models/WorkflowRun');
const ExecutionLog = require('../src/models/ExecutionLog');
const { executeTaskHandler } = require('../src/task-handlers/registry');
const { reapOrphanedTasks, reclaimSingleOrphanedTask } = require('../src/scheduler/reaper');
const { TaskState, WorkflowRunState } = require('../src/scheduler/stateMachine');

describe('Module 7: Failure Injection, Worker Recovery & Reaper Watchdog', () => {
  const app = createApp();

  describe('Task Execution Timeout Watchdog', () => {
    it('should abort task and throw TASK_TIMEOUT error when execution exceeds timeoutMs', async () => {
      const input = {
        delayMs: 500,
        timeoutMs: 50
      };

      await expect(executeTaskHandler('simulated', input, { attempt: 0 }))
        .rejects.toThrow(/Task execution timed out after 50ms/);
    });

    it('should complete normally when execution finishes well within timeoutMs', async () => {
      const input = {
        delayMs: 10,
        timeoutMs: 200,
        sampleData: { success: true }
      };

      const result = await executeTaskHandler('simulated', input, { attempt: 0 });
      expect(result.simulated).toBe(true);
      expect(result.data.success).toBe(true);
    });
  });

  describe('Reaper: Worker Heartbeat Lease Expiry & Orphan Reclamation', () => {
    const mockWorkerId = 'worker-crashed-test-99';
    const mockRunId = '507f1f77bcf86cd799439088';
    const mockWorkflowId = '507f1f77bcf86cd799439077';

    it('should detect dead workers whose heartbeat is older than leaseTimeoutMs', async () => {
      const expiredTime = new Date(Date.now() - 30000); // 30s ago
      const mockDeadWorker = {
        workerId: mockWorkerId,
        status: 'ACTIVE',
        lastHeartbeat: expiredTime,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(WorkerHeartbeat, 'find').mockResolvedValueOnce([mockDeadWorker]);
      jest.spyOn(TaskRun, 'find').mockResolvedValueOnce([]); // No orphaned tasks

      const result = await reapOrphanedTasks(15000);

      expect(result.deadWorkersCount).toBe(1);
      expect(mockDeadWorker.status).toBe('DEAD');
      expect(mockDeadWorker.save).toHaveBeenCalled();

      WorkerHeartbeat.find.mockRestore();
      TaskRun.find.mockRestore();
    });

    it('should reclaim orphaned task with retries left: transition RUNNING -> RETRY_WAIT', async () => {
      const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
        return { unref: () => {} };
      });

      const mockTask = {
        _id: '607f1f77bcf86cd799439011',
        runId: mockRunId,
        taskId: 'step_etl',
        name: 'Transform Data',
        status: TaskState.RUNNING,
        attempt: 1,
        maxRetries: 3,
        backoffMs: 100,
        dependencies: []
      };

      jest.spyOn(TaskRun, 'findOneAndUpdate').mockResolvedValueOnce({
        ...mockTask,
        status: TaskState.RETRY_WAIT,
        attempt: 2
      });
      jest.spyOn(ExecutionLog.prototype, 'save').mockResolvedValueOnce(true);

      await reclaimSingleOrphanedTask(mockTask, mockWorkerId);

      expect(TaskRun.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockTask._id, status: TaskState.RUNNING },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: TaskState.RETRY_WAIT,
            attempt: 2
          })
        }),
        { new: true }
      );

      timeoutSpy.mockRestore();
      TaskRun.findOneAndUpdate.mockRestore();
      ExecutionLog.prototype.save.mockRestore();
    });

    it('should fail orphaned task terminally when retries exhausted and cancel downstream tasks', async () => {
      const mockExhaustedTask = {
        _id: '607f1f77bcf86cd799439022',
        runId: mockRunId,
        taskId: 'step_fatal',
        name: 'Fatal Step',
        status: TaskState.RUNNING,
        attempt: 3,
        maxRetries: 3,
        dependencies: []
      };

      const mockDownstreamTask = {
        _id: '607f1f77bcf86cd799439033',
        runId: mockRunId,
        taskId: 'step_dependent',
        status: TaskState.BLOCKED,
        dependencies: ['step_fatal'],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockWorkflowRun = {
        _id: mockRunId,
        status: WorkflowRunState.RUNNING,
        startedAt: new Date(Date.now() - 5000),
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(TaskRun, 'findOneAndUpdate').mockResolvedValueOnce({
        ...mockExhaustedTask,
        status: TaskState.FAILED
      });
      jest.spyOn(TaskRun, 'find').mockResolvedValueOnce([mockDownstreamTask]);
      jest.spyOn(WorkflowRun, 'findById').mockResolvedValueOnce(mockWorkflowRun);
      jest.spyOn(ExecutionLog.prototype, 'save').mockResolvedValue(true);

      await reclaimSingleOrphanedTask(mockExhaustedTask, mockWorkerId);

      // Downstream task must be CANCELLED
      expect(mockDownstreamTask.status).toBe(TaskState.CANCELLED);
      expect(mockDownstreamTask.save).toHaveBeenCalled();

      // WorkflowRun must be marked FAILED
      expect(mockWorkflowRun.status).toBe(WorkflowRunState.FAILED);
      expect(mockWorkflowRun.save).toHaveBeenCalled();

      TaskRun.findOneAndUpdate.mockRestore();
      TaskRun.find.mockRestore();
      WorkflowRun.findById.mockRestore();
      ExecutionLog.prototype.save.mockRestore();
    });
  });

  describe('Chaos Engineering REST Endpoints', () => {
    it('GET /api/workers should return list of cluster workers', async () => {
      jest.spyOn(WorkerHeartbeat, 'find').mockReturnValueOnce({
        sort: () => ({
          lean: () => Promise.resolve([
            { workerId: 'worker-1', status: 'ACTIVE', lastHeartbeat: new Date() }
          ])
        })
      });

      const response = await request(app).get('/api/workers');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);

      WorkerHeartbeat.find.mockRestore();
    });

    it('POST /api/chaos/expire-lease should validate workerId and artificially expire lease', async () => {
      const responseMissing = await request(app)
        .post('/api/chaos/expire-lease')
        .send({});

      expect(responseMissing.status).toBe(400);
      expect(responseMissing.body.error.code).toBe('MISSING_PARAM');

      jest.spyOn(WorkerHeartbeat, 'findOneAndUpdate').mockResolvedValueOnce({
        workerId: 'worker-target',
        lastHeartbeat: new Date(Date.now() - 60000)
      });

      const responseOk = await request(app)
        .post('/api/chaos/expire-lease')
        .send({ workerId: 'worker-target', pastMs: 60000 });

      expect(responseOk.status).toBe(200);
      expect(responseOk.body.success).toBe(true);
      expect(responseOk.body.message).toContain('lease expired');

      WorkerHeartbeat.findOneAndUpdate.mockRestore();
    });

    it('POST /api/chaos/trigger-reaper should run on-demand sweep and return counts', async () => {
      jest.spyOn(WorkerHeartbeat, 'find').mockResolvedValueOnce([]);

      const response = await request(app)
        .post('/api/chaos/trigger-reaper')
        .send({ leaseTimeoutMs: 15000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('deadWorkersCount');
      expect(response.body.data).toHaveProperty('reclaimedTasksCount');

      WorkerHeartbeat.find.mockRestore();
    });
  });
});

