import { Router } from 'express';
import {
  autoDetectMapping,
  getMapping,
  saveMapping,
  previewMapping
} from '../controllers/notion-mapping.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

/**
 * @route   POST /api/v1/admin/notion-mapping/auto-detect
 * @desc    Auto-detect Notion database schema and properties
 * @access  Admin only
 */
router.post(
  '/auto-detect',
  authenticateToken,
  requireAdmin,
  autoDetectMapping
);

/**
 * @route   GET /api/v1/admin/notion-mapping
 * @desc    Get current mapping configuration
 * @access  Admin only
 */
router.get(
  '/',
  authenticateToken,
  requireAdmin,
  getMapping
);

/**
 * @route   POST /api/v1/admin/notion-mapping
 * @desc    Save custom mapping configuration
 * @access  Admin only
 */
router.post(
  '/',
  authenticateToken,
  requireAdmin,
  saveMapping
);

/**
 * @route   POST /api/v1/admin/notion-mapping/preview
 * @desc    Preview mapped data
 * @access  Admin only
 */
router.post(
  '/preview',
  authenticateToken,
  requireAdmin,
  previewMapping
);

export default router;