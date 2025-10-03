import { Router } from 'express';
import { WebhookController } from '../../controllers/webhook.controller';
import { webhookAuthMiddleware } from '../../middleware/webhookAuth.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/auth.middleware';

const router = Router();
const webhookController = new WebhookController();

/**
 * Webhook routes for Notion synchronization
 */

// Main webhook endpoint for Notion events (with HMAC validation)
router.post(
  '/webhooks/notion',
  webhookAuthMiddleware,
  webhookController.handleNotionWebhook
);

// Capture mode endpoint for initial webhook setup (no HMAC validation)
router.post(
  '/webhooks/notion/capture',
  webhookController.handleWebhookCapture
);

// Get capture status
router.get(
  '/webhooks/notion/capture/status',
  webhookController.getCaptureStatus
);

// Test webhook configuration
router.post(
  '/webhooks/notion/test',
  webhookController.testWebhook
);

/**
 * @swagger
 * /api/v1/webhooks/logs:
 *   get:
 *     summary: Get webhook logs with pagination and filters (Admin only)
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [Task, Project, Member, Team, Client]
 *         description: Filter by entity type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failed, partial]
 *         description: Filter by sync status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter logs from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter logs until this date
 *     responses:
 *       200:
 *         description: Webhook logs retrieved successfully
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
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entityType:
 *                             type: string
 *                           databaseId:
 *                             type: string
 *                           syncMethod:
 *                             type: string
 *                           syncStatus:
 *                             type: string
 *                           itemsProcessed:
 *                             type: integer
 *                           itemsFailed:
 *                             type: integer
 *                           duration:
 *                             type: number
 *                           webhookEventId:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                     stats:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         byStatus:
 *                           type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 *       500:
 *         description: Internal server error
 */
// Get webhook logs (Admin only)
router.get(
  '/webhooks/logs',
  authenticate,
  requireAdmin,
  webhookController.getWebhookLogs
);

export default router;