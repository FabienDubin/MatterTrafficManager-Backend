import request from 'supertest';
import app from '../../src/test-server';

describe('Health Integration Tests', () => {

  describe('GET /api/v1/health', () => {
    it('should return 200 and health information', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'OK',
        message: 'Matter Traffic Backend is operational',
        timestamp: expect.any(String),
        systemInfo: {
          uptime: expect.any(String),
          memory: {
            used: expect.any(String),
            total: expect.any(String),
          },
          nodeVersion: expect.any(String),
        },
        database: {
          status: expect.any(String),
          connected: expect.any(Boolean),
        },
      });
    });

    it('should have correct response headers', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET / (root endpoint)', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Matter Traffic Backend API',
        version: '1.0.0',
        status: 'operational',
        documentation: expect.any(String),
        timestamp: expect.any(String),
      });
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-route')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('not found'),
        },
        timestamp: expect.any(String),
      });
    });
  });
});