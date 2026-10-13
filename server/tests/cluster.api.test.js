const request = require('supertest');
const createApp = require('../src/app');

describe('Module 9: Cluster & Consistent Hashing REST API', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it('GET /api/cluster/ring - returns current ring state and distribution', async () => {
    const res = await request(app).get('/api/cluster/ring');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('vnodesPerWorker');
    expect(res.body.data).toHaveProperty('workers');
    expect(res.body.data.workers).toContain('worker-alpha');
    expect(res.body.data).toHaveProperty('distribution');
    expect(Array.isArray(res.body.data.distribution)).toBe(true);
    expect(res.body.data).toHaveProperty('vnodePoints');
  });

  it('POST /api/cluster/ring/route - routes a key and returns deterministic metadata', async () => {
    const res = await request(app)
      .post('/api/cluster/ring/route')
      .send({ key: 'workflow-task-883' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('key', 'workflow-task-883');
    expect(res.body.data).toHaveProperty('keyHash');
    expect(res.body.data).toHaveProperty('assignedWorker');
    expect(res.body.data).toHaveProperty('ringPositionDegrees');
  });

  it('POST /api/cluster/ring/route - rejects missing key', async () => {
    const res = await request(app)
      .post('/api/cluster/ring/route')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/cluster/ring/workers - registers a new worker node', async () => {
    const res = await request(app)
      .post('/api/cluster/ring/workers')
      .send({ workerId: 'worker-delta', weight: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.workers).toContain('worker-delta');
  });

  it('DELETE /api/cluster/ring/workers/:workerId - removes a worker node', async () => {
    const res = await request(app).delete('/api/cluster/ring/workers/worker-delta');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.workers).not.toContain('worker-delta');

    // Deleting again returns 404
    const res404 = await request(app).delete('/api/cluster/ring/workers/worker-delta');
    expect(res404.status).toBe(404);
  });

  it('POST /api/cluster/ring/simulate - runs migration comparison simulation', async () => {
    const res = await request(app)
      .post('/api/cluster/ring/simulate')
      .send({ sampleSize: 200, targetWorkerId: 'worker-omega', action: 'add' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('consistentHashing');
    expect(res.body.data).toHaveProperty('moduloHashing');
    expect(res.body.data.consistentHashing.reassignedPercent).toBeLessThan(
      res.body.data.moduloHashing.reassignedPercent
    );
  });
});
