const http = require('http');
const WebSocket = require('ws');
const request = require('supertest');
const createApp = require('../src/app');
const ExecutionLog = require('../src/models/ExecutionLog');
const { 
  initWebSocketServer, 
  broadcastEvent, 
  closeWebSocketServer 
} = require('../src/websocket/wsServer');

describe('Module 6: Real-Time Observability & WebSockets', () => {
  let server;
  let serverPort;
  let wsUrl;
  const app = createApp();

  beforeAll((done) => {
    server = http.createServer(app);
    initWebSocketServer(server);
    server.listen(0, () => {
      serverPort = server.address().port;
      wsUrl = `ws://localhost:${serverPort}/ws`;
      done();
    });
  });

  afterAll((done) => {
    closeWebSocketServer();
    server.close(done);
  });

  describe('WebSocket Handshake & Protocol', () => {
    it('should connect to /ws and receive initial CONNECTED handshake message', (done) => {
      const ws = new WebSocket(wsUrl);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'CONNECTED') {
          expect(message).toHaveProperty('timestamp');
          expect(message.message).toContain('FlowForge Real-Time WebSocket Telemetry');
          ws.close();
          done();
        }
      });
    });

    it('should respond with PONG when client sends PING heartbeat frame', (done) => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'PING' }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'PONG') {
          expect(message).toHaveProperty('timestamp');
          ws.close();
          done();
        }
      });
    });

    it('should handle malformed non-JSON messages with ERROR payload', (done) => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        ws.send('invalid non-json text');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'ERROR') {
          expect(message.error).toContain('Invalid JSON');
          ws.close();
          done();
        }
      });
    });
  });

  describe('Run Subscriptions & Targeted Broadcasting', () => {
    it('should confirm subscription when client subscribes to a runId', (done) => {
      const ws = new WebSocket(wsUrl);
      const targetRunId = '507f1f77bcf86cd799439099';

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE', runId: targetRunId }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'SUBSCRIBED') {
          expect(message.runId).toBe(targetRunId);
          ws.close();
          done();
        }
      });
    });

    it('should broadcast events to clients subscribed to target runId and isolate others', (done) => {
      const targetRunId = '507f1f77bcf86cd799439001';
      const otherRunId = '507f1f77bcf86cd799439002';

      const wsSubscribed = new WebSocket(wsUrl);
      const wsUnsubscribed = new WebSocket(wsUrl);

      let subscribedReady = false;
      let unsubscribedReady = false;
      let unexpectedMessageReceived = false;

      const checkReadyAndBroadcast = () => {
        if (subscribedReady && unsubscribedReady) {
          // Trigger broadcast targeted to targetRunId
          broadcastEvent('TASK_STATE_CHANGED', {
            runId: targetRunId,
            taskId: 'step_alpha',
            status: 'RUNNING'
          });
        }
      };

      wsSubscribed.on('open', () => {
        wsSubscribed.send(JSON.stringify({ type: 'SUBSCRIBE', runId: targetRunId }));
      });

      wsSubscribed.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SUBSCRIBED') {
          subscribedReady = true;
          checkReadyAndBroadcast();
        } else if (msg.type === 'TASK_STATE_CHANGED') {
          expect(msg.payload.runId).toBe(targetRunId);
          expect(msg.payload.taskId).toBe('step_alpha');
          expect(msg.payload.status).toBe('RUNNING');

          // Ensure unsubscribed socket did not receive it
          setTimeout(() => {
            expect(unexpectedMessageReceived).toBe(false);
            wsSubscribed.close();
            wsUnsubscribed.close();
            done();
          }, 100);
        }
      });

      wsUnsubscribed.on('open', () => {
        wsUnsubscribed.send(JSON.stringify({ type: 'SUBSCRIBE', runId: otherRunId }));
      });

      wsUnsubscribed.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SUBSCRIBED') {
          unsubscribedReady = true;
          checkReadyAndBroadcast();
        } else if (msg.type === 'TASK_STATE_CHANGED') {
          unexpectedMessageReceived = true;
        }
      });
    });
  });

  describe('GET /api/runs/:runId/logs Endpoint', () => {
    const mockRunId = '507f1f77bcf86cd799439011';

    it('should return 400 for invalid runId format', async () => {
      const response = await request(app).get('/api/runs/invalid-run-id/logs');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ID');
    });

    it('should return 200 with chronological execution logs for a valid runId', async () => {
      const mockLogs = [
        {
          _id: '607f1f77bcf86cd799439001',
          runId: mockRunId,
          taskId: 'workflow',
          level: 'info',
          message: 'Workflow started.',
          timestamp: new Date('2026-10-13T10:00:00.000Z')
        },
        {
          _id: '607f1f77bcf86cd799439002',
          runId: mockRunId,
          taskId: 'task_1',
          level: 'info',
          message: 'Task claimed by worker.',
          timestamp: new Date('2026-10-13T10:00:01.000Z')
        }
      ];

      jest.spyOn(ExecutionLog, 'find').mockReturnValueOnce({
        sort: () => ({
          lean: () => Promise.resolve(mockLogs)
        })
      });

      const response = await request(app).get(`/api/runs/${mockRunId}/logs`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].message).toBe('Workflow started.');
      expect(response.body.data[1].taskId).toBe('task_1');

      ExecutionLog.find.mockRestore();
    });
  });
});

