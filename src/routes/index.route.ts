import { Router } from 'express';
import authRouter from './auth/index.route';
import systemRouter from './system/index.route';
import notionRouter from './notion/index.route';
import { tasksRouter } from './tasks/index.route';
import entitiesRouter from './entities/index.route';
import adminRouter from './admin/index.route';

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
      members: '/api/v1/members',
      projects: '/api/v1/projects',
      teams: '/api/v1/teams',
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

// System routes (health, webhooks)
router.use('/', systemRouter);

// Authentication routes
router.use('/auth', authRouter);

// Notion integration routes
router.use('/', notionRouter);

// Tasks routes
router.use('/tasks', tasksRouter);

// Entity routes (clients, members, projects, teams)
router.use('/', entitiesRouter);

// Admin routes (cache, metrics, conflicts, sync, config)
router.use('/', adminRouter);

export default router;
