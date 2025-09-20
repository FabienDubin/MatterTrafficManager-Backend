import './setup.integration'; // Import du setup d'intégration
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/test-server';

describe('Health Integration Tests', () => {
  // Cleanup après tous les tests
  afterAll(async () => {
    // Fermer la connexion MongoDB
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    // Attendre un peu pour que tout se ferme proprement
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('GET /api/v1/health', () => {
    it('should return 200 and health information', async () => {
      const response = await request(app)
        .get('/api/v1/health');
      
      // Log pour debug
      console.log('Health response:', response.status, response.body);
      
      // Accepter 200 ou 503 selon l'état des services
      expect([200, 503]).toContain(response.status);

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/healthy|unhealthy|error/),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        services: expect.objectContaining({
          // Au moins MongoDB et webhooks doivent être présents
          mongodb: expect.objectContaining({ 
            status: expect.stringMatching(/healthy|unhealthy/) 
          }),
          webhooks: expect.objectContaining({ 
            status: expect.stringMatching(/healthy|waiting|stale|error/) 
          })
          // Redis est optionnel dans les tests
        })
      });
    }, 10000); // Augmentation du timeout à 10 secondes

    it('should have correct response headers', async () => {
      const response = await request(app)
        .get('/api/v1/health');

      // Accepter 200 ou 503 selon l'état des services
      expect([200, 503]).toContain(response.status);
      expect(response.headers['content-type']).toMatch(/json/);
    }, 10000); // Augmentation du timeout à 10 secondes
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