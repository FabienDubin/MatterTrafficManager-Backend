import { Router } from 'express';
import syncController from '../../controllers/sync.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/sync/status:
 *   get:
 *     summary: Get global synchronization status
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [idle, syncing, error, conflict]
 *                       description: Global sync status
 *                     pending:
 *                       type: integer
 *                       description: Number of items pending in queue
 *                     failed:
 *                       type: integer
 *                       description: Number of failed sync attempts
 *                     conflicts:
 *                       type: integer
 *                       description: Number of pending conflicts
 *                     lastSync:
 *                       type: string
 *                       format: date-time
 *                       description: Last successful sync timestamp
 *                     nextRetry:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Next retry attempt time if applicable
 *                     queueDetails:
 *                       type: object
 *                       properties:
 *                         processing:
 *                           type: boolean
 *                         avgProcessingTime:
 *                           type: number
 *                         processed:
 *                           type: integer
 *                         itemsInQueue:
 *                           type: array
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/status', authenticate, syncController.getSyncStatus.bind(syncController));

/**
 * @swagger
 * /api/v1/sync/clear-queue:
 *   post:
 *     summary: Clear the synchronization queue (Admin only)
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue cleared successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 *       500:
 *         description: Internal server error
 */
router.post(
  '/clear-queue',
  authenticate,
  requireAdmin,
  syncController.clearQueue.bind(syncController)
);

/**
 * @swagger
 * /api/v1/sync/retry-failed:
 *   post:
 *     summary: Retry failed synchronization items (Admin only)
 *     tags: [Sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Failed items queued for retry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     retried:
 *                       type: integer
 *                       description: Number of items queued for retry
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 *       500:
 *         description: Internal server error
 */
router.post(
  '/retry-failed',
  authenticate,
  requireAdmin,
  syncController.retryFailed.bind(syncController)
);

export default router;