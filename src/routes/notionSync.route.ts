import { Router } from 'express';
import notionSyncController from '../controllers/notionSync.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

/**
 * @route   POST /api/v1/sync/trigger
 * @desc    Trigger manual sync for an entity type
 * @access  Admin
 */
router.post('/trigger', authenticate, requireAdmin, notionSyncController.triggerSync);

/**
 * @route   POST /api/v1/sync/page/:entityType/:pageId
 * @desc    Sync a specific page by ID
 * @access  Admin
 */
router.post('/page/:entityType/:pageId', authenticate, requireAdmin, notionSyncController.syncPage);

/**
 * @route   POST /api/v1/sync/map/:entityType/:pageId
 * @desc    Map a specific entity to MongoDB
 * @access  Admin
 */
router.post('/map/:entityType/:pageId', authenticate, requireAdmin, notionSyncController.mapEntity);

/**
 * @route   POST /api/v1/sync/bulk-map
 * @desc    Bulk map multiple entities
 * @access  Admin
 */
router.post('/bulk-map', authenticate, requireAdmin, notionSyncController.bulkMapEntities);

/**
 * @route   GET /api/v1/sync/status
 * @desc    Get sync status and statistics
 * @access  Admin
 */
router.get('/status', authenticate, requireAdmin, notionSyncController.getSyncStatus);

/**
 * @route   GET /api/v1/sync/health
 * @desc    Get sync health check
 * @access  Public (for monitoring tools)
 */
router.get('/health', notionSyncController.getHealth);

export default router;