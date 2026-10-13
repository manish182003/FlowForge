const request = require('supertest');
const createApp = require('../src/app');

describe('Module 1: Foundation Endpoints & Middleware', () => {
  const app = createApp();

  describe('GET /api/health', () => {
    it('should return 200 OK with system diagnostics', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'flowforge-api');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body).toHaveProperty('pid');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('database');
      expect(response.body.database).toHaveProperty('connected');
      expect(response.body.database).toHaveProperty('state');
    });
  });

  describe('404 Not Found Middleware', () => {
    it('should return 404 JSON for unknown endpoints', async () => {
      const response = await request(app).get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(response.body.error.message).toContain('Resource not found: GET /api/does-not-exist');
    });
  });

  describe('Centralized Error Handling Middleware', () => {
    it('should catch unhandled errors and return structured 500 JSON', async () => {
      // Create a test app instance with a route that throws an intentional error
      const express = require('express');
      const testApp = express();
      const errorHandler = require('../src/middleware/errorHandler');

      testApp.get('/test-error', (req, res, next) => {
        next(new Error('Simulated internal failure'));
      });
      testApp.use(errorHandler);

      const response = await request(testApp).get('/test-error');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('message', 'Simulated internal failure');
      expect(response.body.error).toHaveProperty('statusCode', 500);
    });
  });
});

