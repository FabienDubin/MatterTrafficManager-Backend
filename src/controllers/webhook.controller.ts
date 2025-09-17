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
   * Unified handler for Notion webhook events
   * Handles both capture mode (initial setup) and normal mode (with HMAC validation)
   */
  handleNotionWebhook = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    try {
      console.log('📮 Webhook endpoint hit!');
      
      // Get configuration
      const config = await NotionConfigModel.findOne({ isActive: true });
      
      if (!config) {
        console.error('❌ No active configuration found');
        res.status(500).json({ 
          error: 'No active configuration',
          code: 'NO_CONFIG' 
        });
        return;
      }

      // Check if we're in capture mode
      if (config.webhookCaptureMode?.enabled) {
        console.log('🎯 CAPTURE MODE - Recording webhook data');
        
        // Look for the webhook secret in various locations
        const possibleSecret = 
          req.headers['x-hook-secret'] as string ||
          req.headers['x-webhook-secret'] as string ||
          req.headers['webhook-secret'] as string ||
          req.body?.secret ||
          req.body?.webhook_secret ||
          req.body?.verification_token;
        
        // Save the complete captured request
        const capturedRequest = {
          headers: req.headers,
          body: req.body,
          method: req.method,
          url: req.url,
          timestamp: new Date(),
          signature: req.headers['x-notion-signature'] as string,
          detectedSecret: possibleSecret,
          secretLocation: possibleSecret ? 
            (req.headers['x-hook-secret'] ? 'header: x-hook-secret' :
             req.headers['x-webhook-secret'] ? 'header: x-webhook-secret' :
             req.headers['webhook-secret'] ? 'header: webhook-secret' :
             req.body?.secret ? 'body: secret' :
             req.body?.webhook_secret ? 'body: webhook_secret' :
             req.body?.verification_token ? 'body: verification_token' : 'unknown') 
            : null
        };
        
        console.log('📦 Captured request details:');
        console.log('  - Headers count:', Object.keys(req.headers).length);
        console.log('  - Body keys:', Object.keys(req.body || {}));
        console.log('  - Secret found:', !!possibleSecret);
        console.log('  - Secret location:', capturedRequest.secretLocation);
        
        // Save captured data to config
        config.webhookCaptureMode = {
          enabled: false, // Auto-disable after capture
          enabledAt: config.webhookCaptureMode.enabledAt,
          capturedRequest: capturedRequest as any
        };
        
        // If we found a secret, save it as the verification token
        if (possibleSecret && !config.webhookVerificationToken) {
          console.log('🎉 Found webhook secret! Encrypting and saving...');
          config.webhookVerificationToken = (config as any).encryptToken(possibleSecret);
        }
        
        await config.save();
        
        console.log('✅ Webhook data captured and saved');
        
        res.status(200).json({ 
          success: true,
          message: possibleSecret ? 
            'Webhook captured with secret! Check admin panel for details.' :
            'Webhook captured! Check admin panel for details.',
          secretFound: !!possibleSecret,
          timestamp: capturedRequest.timestamp
        });
        
        return;
      }
      
      // NORMAL MODE - Process webhook with HMAC validation
      console.log('🔐 Normal mode - Processing webhook');
      console.log('🔐 Signature:', req.headers['x-notion-signature'] ? 'Present' : 'Missing');
      
      // Respond immediately to meet 3-second timeout requirement
      res.status(200).json({ received: true });

      // Extract webhook event data
      const { type, data } = req.body;
      const webhookEventId = crypto.randomUUID();

      console.log(`📨 Webhook processed: ${type} - Event ID: ${webhookEventId}`);
      console.log('📊 Event data:', JSON.stringify({ type, databaseId: data?.parent?.database_id }, null, 2));

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
      console.log('🔍 Webhook capture endpoint hit!');
      console.log('📦 Headers:', JSON.stringify(req.headers, null, 2));
      console.log('📦 Body:', JSON.stringify(req.body, null, 2));
      
      const config = await NotionConfigModel.findOne({ isActive: true });
      
      if (!config) {
        console.error('❌ No active configuration found');
        res.status(500).json({ 
          error: 'No active configuration found',
          code: 'NO_CONFIG' 
        });
        return;
      }

      // Check if capture mode is enabled
      if (!config.webhookCaptureMode?.enabled) {
        console.warn('⚠️ Capture mode not enabled, but webhook received');
      }

      // Log all possible places where the secret might be
      console.log('🔐 Looking for webhook secret...');
      
      // Check different possible locations for the webhook secret
      const possibleSecret = 
        req.headers['x-hook-secret'] as string ||
        req.headers['x-webhook-secret'] as string ||
        req.headers['webhook-secret'] as string ||
        req.body?.secret ||
        req.body?.webhook_secret ||
        req.body?.verification_token;
      
      const signature = req.headers['x-notion-signature'] as string;
      const { type, data } = req.body;

      console.log('🎯 Webhook capture received:', {
        type,
        hasSignature: !!signature,
        signatureValue: signature ? signature.substring(0, 20) + '...' : 'none',
        possibleSecret: possibleSecret ? 'Found!' : 'Not found',
        secretLocation: possibleSecret ? 
          (req.headers['x-hook-secret'] ? 'x-hook-secret header' :
           req.headers['x-webhook-secret'] ? 'x-webhook-secret header' :
           req.headers['webhook-secret'] ? 'webhook-secret header' :
           req.body?.secret ? 'body.secret' :
           req.body?.webhook_secret ? 'body.webhook_secret' :
           req.body?.verification_token ? 'body.verification_token' : 'unknown') 
          : 'none',
        databaseId: data?.parent?.database_id,
        captureMode: config.webhookCaptureMode,
      });

      // If we found a secret, save it as the verification token
      if (possibleSecret && !config.webhookVerificationToken) {
        console.log('🎉 Found webhook secret! Saving it...');
        
        // Encrypt and save the webhook verification token
        config.webhookVerificationToken = (config as any).encryptToken(possibleSecret);
        
        // Store webhook event details
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

        console.log('✅ Webhook secret saved successfully');
        
        res.status(200).json({ 
          success: true,
          message: 'Webhook secret captured and saved!',
          eventType: type,
          databaseId: data?.parent?.database_id,
        });
      } else if (signature && !config.webhookVerificationToken) {
        // We have a signature but no secret found - old behavior
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

        console.log('⚠️ Webhook event captured but no secret found');
        
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
   * Get webhook capture status and captured data
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
        capturedRequest: captureMode?.capturedRequest, // Full captured request data
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
   * Clear captured webhook data
   */
  clearCapturedData = async (_req: Request, res: Response): Promise<void> => {
    try {
      const config = await NotionConfigModel.findOne({ isActive: true });
      
      if (!config) {
        res.status(404).json({ 
          error: 'No configuration found',
          code: 'NO_CONFIG' 
        });
        return;
      }

      // Clear captured request data but keep other settings
      if (config.webhookCaptureMode) {
        delete config.webhookCaptureMode.capturedRequest;
        delete config.webhookCaptureMode.capturedEvent; // Clean old format too
      }

      await config.save();

      console.log('🧹 Captured webhook data cleared');
      
      res.json({
        success: true,
        message: 'Captured data cleared successfully'
      });
    } catch (error) {
      console.error('❌ Error clearing captured data:', error);
      res.status(500).json({ 
        error: 'Failed to clear captured data',
        code: 'CLEAR_ERROR' 
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
   * Enable capture mode for webhook setup
   */
  enableCaptureMode = async (req: Request, res: Response): Promise<void> => {
    try {
      const environment = process.env.NODE_ENV || 'development';
      const config = await NotionConfigModel.findOne({ environment });
      
      if (!config) {
        res.status(404).json({ 
          error: 'No configuration found',
          code: 'NO_CONFIG' 
        });
        return;
      }

      // Enable capture mode and clear any previous captured event
      if (!config.webhookCaptureMode) {
        config.webhookCaptureMode = {
          enabled: true,
          enabledAt: new Date()
        };
      } else {
        config.webhookCaptureMode.enabled = true;
        config.webhookCaptureMode.enabledAt = new Date();
        // Always clear previous captured event when enabling capture mode
        delete config.webhookCaptureMode.capturedEvent;
      }

      await config.save();

      console.log('✅ Webhook capture mode enabled');
      
      res.json({
        success: true,
        message: 'Capture mode enabled. Send a test webhook from Notion.',
        captureMode: config.webhookCaptureMode
      });
    } catch (error) {
      console.error('❌ Error enabling capture mode:', error);
      res.status(500).json({ 
        error: 'Failed to enable capture mode',
        code: 'ENABLE_ERROR' 
      });
    }
  };

  /**
   * Disable capture mode for webhook setup
   */
  disableCaptureMode = async (req: Request, res: Response): Promise<void> => {
    try {
      const environment = process.env.NODE_ENV || 'development';
      const config = await NotionConfigModel.findOne({ environment });
      
      if (!config) {
        res.status(404).json({ 
          error: 'No configuration found',
          code: 'NO_CONFIG' 
        });
        return;
      }

      // Disable capture mode
      if (config.webhookCaptureMode) {
        config.webhookCaptureMode.enabled = false;
      }

      await config.save();

      console.log('✅ Webhook capture mode disabled');
      
      res.json({
        success: true,
        message: 'Capture mode disabled',
        captureMode: config.webhookCaptureMode
      });
    } catch (error) {
      console.error('❌ Error disabling capture mode:', error);
      res.status(500).json({ 
        error: 'Failed to disable capture mode',
        code: 'DISABLE_ERROR' 
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