import { Router } from 'express';
import healthRouter from './health.route';
import authRouter from './auth.route';
import notionRouter from './notion.route';

const router = Router();

/**
 * API Routes
 * Base path: /api/v1
 */

// Health check routes
router.use('/health', healthRouter);

// Authentication routes
router.use('/auth', authRouter);

// Notion API routes
router.use('/notion', notionRouter);

export default router;