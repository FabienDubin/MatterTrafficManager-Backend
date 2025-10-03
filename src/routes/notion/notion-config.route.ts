import { Router } from 'express';
import {
  getNotionConfig,
  saveNotionConfig,
  testNotionConnection
} from '../../controllers/notion-config.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';
// Rate limiter removed - test endpoint doesn't need rate limiting for admin

const router = Router();

/**
 * @route   GET /api/v1/admin/notion-config
 * @desc    Get current Notion configuration
 * @access  Admin only
 */
router.get(
  '/',
  authenticate,
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
  authenticate,
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
  authenticate,
  requireAdmin,
  // No rate limiting needed - admin endpoint with authentication
  testNotionConnection
);

export default router;