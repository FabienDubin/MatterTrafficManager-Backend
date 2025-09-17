import { Router } from 'express';
import {
  getNotionConfig,
  saveNotionConfig,
  testNotionConnection,
  updateWebhookToken,
  removeWebhookToken
} from '../controllers/notion-config.controller';
import { authenticate } from '../middleware/auth.middleware';
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
  rateLimiter({ windowMs: 60000, max: 10, message: 'Too many test requests, please try again later.' }),
  testNotionConnection
);

/**
 * @route   POST /api/v1/admin/notion-config/webhook-token
 * @desc    Update webhook verification token
 * @access  Admin only
 */
router.post(
  '/webhook-token',
  authenticate,
  requireAdmin,
  updateWebhookToken
);

/**
 * @route   DELETE /api/v1/admin/notion-config/webhook-token
 * @desc    Remove webhook verification token
 * @access  Admin only
 */
router.delete(
  '/webhook-token',
  authenticate,
  requireAdmin,
  removeWebhookToken
);

export default router;