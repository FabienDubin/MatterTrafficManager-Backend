import { Router } from 'express';
import healthRouter from './health.route';
import webhookRouter from './webhook.route';
import holidaysRouter from './holidays.route';

const router = Router();

/**
 * System Routes
 * Base path: /api/v1
 */

// Health check routes
router.use('/health', healthRouter);

// Holidays routes
router.use('/', holidaysRouter);

// Webhook routes (no auth middleware - handled internally)
router.use('/', webhookRouter);

export default router;
