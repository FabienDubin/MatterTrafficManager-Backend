import { Router } from 'express';
import {
  getNotionConfig,
  saveNotionConfig,
  testNotionConnection
} from '../controllers/notion-config.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { rateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/admin/notion-config
 * @desc    Get current Notion configuration
 * @access  Admin only
 */
router.get(
  '/',
  authenticateToken,
  requireAdmin,
  getNotionConfig
);

/**
 * @route   POST /api/v1/admin/notion-config
 * @desc    Save/Update Notion configuration
 * @access  Admin only
 */
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  saveNotionConfig
);

/**
 * @route   POST /api/v1/admin/notion-config/test
 * @desc    Test connection to a specific Notion database
 * @access  Admin only
 * @rateLimit 10 requests per minute
 */
router.post(
  '/test',
  authenticateToken,
  requireAdmin,
  rateLimiter({ windowMs: 60000, max: 10, message: 'Too many test requests, please try again later.' }),
  testNotionConnection
);

export default router;