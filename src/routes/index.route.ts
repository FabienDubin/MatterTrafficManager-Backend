import { Router } from 'express';
import healthRouter from './health.route';
import authRouter from './auth.route';
import notionRouter from './notion.route';
import notionConfigRouter from './notion-config.route';
import notionMappingRouter from './notion-mapping.route';
import notionDiscoveryRouter from './notion-discovery.route';
import webhookRouter from './webhook.route';

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
      admin: {
        notionConfig: '/api/v1/admin/notion-config',
        notionMapping: '/api/v1/admin/notion-mapping',
        notionDiscovery: '/api/v1/admin/notion-discovery'
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

// Admin routes - Notion configuration
router.use('/admin/notion-config', notionConfigRouter);

// Admin routes - Notion mapping
router.use('/admin/notion-mapping', notionMappingRouter);

// Admin routes - Notion discovery
router.use('/admin/notion-discovery', notionDiscoveryRouter);

// Sync routes
import notionSyncRouter from './notionSync.route';
router.use('/sync', notionSyncRouter);

// Monitoring routes
import monitoringRouter from './monitoring.route';
router.use('/monitoring', monitoringRouter);

// Webhook routes (no auth middleware here - handled internally)
router.use('/', webhookRouter);

export default router;