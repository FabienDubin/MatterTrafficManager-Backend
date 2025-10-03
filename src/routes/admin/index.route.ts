import { Router } from 'express';
import cacheRouter from './cache.route';
import metricsRouter from './metrics.route';
import conflictsRouter from './conflicts.route';
import syncRouter from './sync.route';
import configRouter from './config.route';

const router = Router();

/**
 * Admin & Monitoring Routes
 * Base path: /api/v1
 */

// Cache management routes
router.use('/admin/cache', cacheRouter);

// Metrics routes
router.use('/admin/metrics', metricsRouter);

// Conflicts management routes
router.use('/admin/conflicts', conflictsRouter);

// Sync status routes
router.use('/sync', syncRouter);

// Config management routes
router.use('/config', configRouter);

export default router;
