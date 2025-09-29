import { Router } from 'express';
import healthRouter from './health.route';
import authRouter from './auth.route';
import notionRouter from './notion.route';
import notionConfigRouter from './notion-config.route';
import notionMappingRouter from './notion-mapping.route';
import notionDiscoveryRouter from './notion-discovery.route';
import webhookRouter from './webhook.route';
import tasksRouter from './tasks.route';
import clientsRouter from './clients.route';
import cacheRouter from './cache.route';
import metricsRouter from './metrics.route';
import conflictsRouter from './conflicts.route';
import syncRouter from './sync.route';
import configRouter from './config.route';

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
      clients: '/api/v1/clients',
      sync: '/api/v1/sync',
      config: '/api/v1/config',
      admin: {
        notionConfig: '/api/v1/admin/notion-config',
        notionMapping: '/api/v1/admin/notion-mapping',
        notionDiscovery: '/api/v1/admin/notion-discovery',
        cache: '/api/v1/admin/cache',
        metrics: '/api/v1/admin/metrics',
        conflicts: '/api/v1/admin/conflicts'
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

// Clients routes
router.use('/clients', clientsRouter);

// Sync status routes
router.use('/sync', syncRouter);

// Config management routes
router.use('/config', configRouter);

// Admin routes - Notion configuration
router.use('/admin/notion-config', notionConfigRouter);

// Admin routes - Notion mapping
router.use('/admin/notion-mapping', notionMappingRouter);

// Admin routes - Notion discovery
router.use('/admin/notion-discovery', notionDiscoveryRouter);

// Admin routes - Cache management
router.use('/admin/cache', cacheRouter);

// Admin routes - Metrics
router.use('/admin/metrics', metricsRouter);

// Admin routes - Conflicts management
router.use('/admin/conflicts', conflictsRouter);

// Webhook routes (no auth middleware here - handled internally)
router.use('/', webhookRouter);

export default router;