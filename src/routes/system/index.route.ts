import { Router } from 'express';
import healthRouter from './health.route';
import webhookRouter from './webhook.route';

const router = Router();

/**
 * System Routes
 * Base path: /api/v1
 */

// Health check routes
router.use('/health', healthRouter);

// Webhook routes (no auth middleware - handled internally)
router.use('/', webhookRouter);

export default router;
