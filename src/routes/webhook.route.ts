import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { webhookAuthMiddleware } from '../middleware/webhookAuth.middleware';

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

export default router;