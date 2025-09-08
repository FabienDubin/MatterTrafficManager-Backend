import { Router } from 'express';
import healthRouter from './health.route';
import authRouter from './auth.route';
import notionRouter from './notion.route';

const router = Router();

/**
 * API Routes
 * Base path: /api/v1
 */

// Root endpoint for /api/v1
router.get('/', (_, res) => {
  res.json({
    success: true,
    message: 'Matter Traffic API v1',
    endpoints: {
      health: '/api/v1/health',
      auth: '/api/v1/auth',
      notion: '/api/v1/notion'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check routes
router.use('/health', healthRouter);

// Authentication routes
router.use('/auth', authRouter);

// Notion API routes
router.use('/notion', notionRouter);

export default router;