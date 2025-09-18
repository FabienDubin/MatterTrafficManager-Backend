import { Request, Response } from 'express';
import { NotionConfigModel } from '../models/NotionConfig.model';
import { SyncLogModel } from '../models/SyncLog.model';
import { QueueService } from '../services/queue.service';
import crypto from 'crypto';

export class WebhookController {
  private queueService: QueueService;

  constructor() {
    this.queueService = new QueueService();
  }

  /**
   * Handle incoming Notion webhook events
   */
  handleNotionWebhook = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    try {
      // Respond immediately to meet 3-second timeout requirement
      res.status(200).json({ received: true });

      // Extract webhook event data
      const { type, data } = req.body;
      const webhookEventId = crypto.randomUUID();

      console.log(`📨 Webhook received: ${type} - Event ID: ${webhookEventId}`);

      // Identify the source database
      const databaseId = data?.parent?.database_id || data?.parent?.data_source_id;
      
      if (!databaseId) {
        console.error('❌ No database ID found in webhook event');
        return;
      }

      // Map database ID to entity type
      const entityType = await this.mapDatabaseIdToEntityType(databaseId);
      
      if (!entityType) {
        console.error(`❌ Unknown database ID: ${databaseId}`);
        return;
      }

      // Add to queue for async processing
      await this.queueService.addSyncJob({
        entityType,
        databaseId,
        webhookEventId,
        eventType: type,
        eventData: data,
        receivedAt: new Date(),
      });

      // Log webhook reception
      await SyncLogModel.create({
        entityType,
        databaseId,
        syncMethod: 'webhook',
        syncStatus: 'success',
        webhookEventId,
        itemsProcessed: 1,
        itemsFailed: 0,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
      });

      console.log(`✅ Webhook event queued for ${entityType}`);
    } catch (error) {
      console.error('❌ Error handling webhook:', error);
      
      // Log failed webhook
      await SyncLogModel.create({
        entityType: 'Task', // Default fallback
        databaseId: 'unknown',
        syncMethod: 'webhook',
        syncStatus: 'failed',
        itemsProcessed: 0,
        itemsFailed: 1,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    }
  };

  /**
   * Handle webhook capture for initial setup
   */
  handleWebhookCapture = async (req: Request, res: Response): Promise<void> => {
    try {
      const config = await NotionConfigModel.findOne({ isActive: true });
      
      if (!config) {
        res.status(500).json({ 
          error: 'No active configuration found',
          code: 'NO_CONFIG' 
        });
        return;
      }

      // Extract verification token from the first webhook event
      const signature = req.headers['x-notion-signature'] as string;
      const { type, data } = req.body;

      console.log('🎯 Webhook capture received:', {
        type,
        hasSignature: !!signature,
        databaseId: data?.parent?.database_id,
      });

      // If we have a signature, extract and save the verification token
      if (signature && !config.webhookVerificationToken) {
        // The signature format is: sha256=<hash>
        // We can't reverse-engineer the token, but we can save the event details
        
        // Store webhook event details for debugging
        config.webhookCaptureMode = {
          enabled: false,
          enabledAt: new Date(),
          capturedEvent: {
            type,
            databaseId: data?.parent?.database_id,
            timestamp: new Date(),
            hasSignature: true,
          },
        };

        await config.save();

        console.log('✅ Webhook event captured successfully');
        
        res.status(200).json({ 
          success: true,
          message: 'Webhook event captured. Please configure the verification token manually.',
          eventType: type,
          databaseId: data?.parent?.database_id,
        });
      } else {
        res.status(200).json({ 
          success: true,
          message: 'Webhook received',
          eventType: type,
        });
      }
    } catch (error) {
      console.error('❌ Error in webhook capture:', error);
      res.status(500).json({ 
        error: 'Failed to capture webhook',
        code: 'CAPTURE_ERROR' 
      });
    }
  };

  /**
   * Get webhook capture status
   */
  getCaptureStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      const config = await NotionConfigModel.findOne({ isActive: true });
      
      if (!config) {
        res.status(404).json({ 
          error: 'No configuration found',
          code: 'NO_CONFIG' 
        });
        return;
      }

      const captureMode = config.webhookCaptureMode;
      const hasToken = !!config.webhookVerificationToken;

      res.json({
        captureEnabled: captureMode?.enabled || false,
        enabledAt: captureMode?.enabledAt,
        capturedEvent: captureMode?.capturedEvent,
        webhookConfigured: hasToken,
        status: hasToken ? 'configured' : 
                captureMode?.enabled ? 'listening' : 'not_configured',
      });
    } catch (error) {
      console.error('❌ Error getting capture status:', error);
      res.status(500).json({ 
        error: 'Failed to get capture status',
        code: 'STATUS_ERROR' 
      });
    }
  };

  /**
   * Test webhook configuration
   */
  testWebhook = async (_req: Request, res: Response): Promise<void> => {
    try {
      const config = await NotionConfigModel.findOne({ isActive: true });
      
      if (!config) {
        res.status(404).json({ 
          error: 'No configuration found',
          code: 'NO_CONFIG' 
        });
        return;
      }

      const hasToken = !!config.webhookVerificationToken;
      
      // Try to decrypt token to verify it's valid
      let tokenValid = false;
      if (hasToken) {
        try {
          const decrypted = config.decryptWebhookToken();
          tokenValid = !!decrypted && decrypted.length > 0;
        } catch {
          tokenValid = false;
        }
      }

      // Check recent webhook activity
      const recentWebhook = await SyncLogModel.findOne({
        syncMethod: 'webhook',
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      }).sort({ createdAt: -1 });

      res.json({
        configured: hasToken,
        tokenValid,
        recentActivity: !!recentWebhook,
        lastWebhookAt: recentWebhook?.createdAt,
        status: tokenValid && recentWebhook ? 'healthy' :
                tokenValid ? 'configured_no_activity' :
                hasToken ? 'invalid_token' : 'not_configured',
      });
    } catch (error) {
      console.error('❌ Error testing webhook:', error);
      res.status(500).json({ 
        error: 'Failed to test webhook',
        code: 'TEST_ERROR' 
      });
    }
  };

  /**
   * Map database ID to entity type
   */
  private async mapDatabaseIdToEntityType(databaseId: string): Promise<string | null> {
    try {
      const config = await NotionConfigModel.findOne({ isActive: true });
      
      if (!config) {
        return null;
      }

      // Check each database type
      const databases = config.databases;
      
      if (databases.teams?.id === databaseId) return 'Team';
      if (databases.users?.id === databaseId) return 'Member';
      if (databases.clients?.id === databaseId) return 'Client';
      if (databases.projects?.id === databaseId) return 'Project';
      if (databases.traffic?.id === databaseId) return 'Task';

      return null;
    } catch (error) {
      console.error('Error mapping database ID:', error);
      return null;
    }
  }
}