import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
// import { webhookAuthMiddleware } from '../middleware/webhookAuth.middleware';

const router = Router();
const webhookController = new WebhookController();

/**
 * Webhook routes for Notion synchronization
 */

// Main webhook endpoint for Notion events
// MIDDLEWARE TEMPORAIREMENT DESACTIVE POUR DEBUG
router.post(
  '/webhooks/notion',
  webhookController.handleNotionWebhook
);

// Enable capture mode
router.post(
  '/webhooks/notion/capture/enable',
  webhookController.enableCaptureMode
);

// Disable capture mode
router.post(
  '/webhooks/notion/capture/disable',
  webhookController.disableCaptureMode
);

// Get capture status and captured data
router.get(
  '/webhooks/notion/capture/status',
  webhookController.getCaptureStatus
);

// Clear captured data
router.delete(
  '/webhooks/notion/capture/data',
  webhookController.clearCapturedData
);

// Test webhook configuration
router.post(
  '/webhooks/notion/test',
  webhookController.testWebhook
);

export default router;