import { Router } from 'express';
import healthRouter from './health.route';
import authRouter from './auth.route';
import notionRouter from './notion.route';
import notionConfigRouter from './notion-config.route';
import notionMappingRouter from './notion-mapping.route';
import notionDiscoveryRouter from './notion-discovery.route';
import webhookRouter from './webhook.route';
import tasksRouter from './tasks.route';
import cacheRouter from './cache.route';

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
      notion: '/api/v1/notion',
      tasks: '/api/v1/tasks',
      admin: {
        notionConfig: '/api/v1/admin/notion-config',
        notionMapping: '/api/v1/admin/notion-mapping',
        notionDiscovery: '/api/v1/admin/notion-discovery',
        cache: '/api/v1/admin/cache'
      }
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

// Tasks routes
router.use('/tasks', tasksRouter);

// Admin routes - Notion configuration
router.use('/admin/notion-config', notionConfigRouter);

// Admin routes - Notion mapping
router.use('/admin/notion-mapping', notionMappingRouter);

// Admin routes - Notion discovery
router.use('/admin/notion-discovery', notionDiscoveryRouter);

// Admin routes - Cache management
router.use('/admin/cache', cacheRouter);

// Webhook routes (no auth middleware here - handled internally)
router.use('/', webhookRouter);

export default router;