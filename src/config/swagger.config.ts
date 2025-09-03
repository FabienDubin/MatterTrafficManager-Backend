import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

/**
 * Swagger configuration for OpenAPI 3.0 documentation
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Matter Traffic Manager API',
      version: '1.0.0',
      description: 'API REST backend pour Matter Traffic Manager - Système de gestion de trafic basé sur Notion',
      license: {
        name: 'MIT',
        url: 'https://spdx.org/licenses/MIT.html',
      },
      contact: {
        name: 'FabLab Team',
        email: 'contact@fablab.com',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/validators/*.ts',
  ],
};

// Generate OpenAPI specification
const specs = swaggerJsdoc(swaggerOptions);

/**
 * Setup Swagger UI middleware
 */
export const setupSwagger = (app: Express): void => {
  // Swagger UI setup (development only)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
      explorer: true,
      customSiteTitle: 'Matter Traffic API Documentation',
      customfavIcon: '/favicon.ico',
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerOptions: {
        persistAuthorization: true,
      },
    }));

    console.log(`📚 Swagger documentation available at: http://localhost:${process.env.PORT || 3000}/api-docs`);
  }

  // OpenAPI spec export endpoint
  app.get('/api/v1/docs/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};

export { specs as swaggerSpecs };