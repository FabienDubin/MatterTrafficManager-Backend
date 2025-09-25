import { Request, Response } from 'express';
import { NotionConfigModel } from '../models/NotionConfig.model';
import { SyncLogModel } from '../models/SyncLog.model';
import { redisService } from '../services/redis.service';
import crypto from 'crypto';

export class WebhookController {
  constructor() {
    // WebhookController uses RedisService for cache invalidation
  }

  /**
   * Handle incoming Notion webhook events
   */
  handleNotionWebhook = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    try {
      // Check if this is the initial verification request
      if (req.body.verification_token) {
        console.log('\n' + '🎉'.repeat(30));
        console.log('✅ NOTION WEBHOOK VERIFICATION TOKEN RECEIVED!');
        console.log('='.repeat(60));
        console.log('📝 Token:', req.body.verification_token);
        console.log('='.repeat(60));
        console.log('⚠️ IMPORTANT STEPS:');
        console.log('1. Copy the token above');
        console.log('2. Add it to Azure App Service Configuration:');
        console.log('   - Name: WEBHOOK_VERIFICATION_TOKEN');
        console.log('   - Value: [paste the token]');
        console.log('3. Restart the App Service');
        console.log('4. The webhook will be ready to receive events');
        console.log('🎉'.repeat(30) + '\n');
        
        // Respond with success for verification
        res.status(200).json({ 
          received: true,
          verification: true,
          message: 'Token captured. Please add it to environment variables.'
        });
        return;
      }

      // Respond immediately to meet 3-second timeout requirement
      res.status(200).json({ received: true });

      // Extract webhook event data
      const { type, data } = req.body;
      const webhookEventId = crypto.randomUUID();

      console.log(`\n${'='.repeat(50)}`);
      console.log(`📨 WEBHOOK RECEIVED: ${type}`);
      console.log(`🆔 Event ID: ${webhookEventId}`);
      console.log(`📅 Time: ${new Date().toISOString()}`);
      console.log(`📦 Full Payload:`, JSON.stringify(req.body, null, 2));
      console.log(`📄 Data Object:`, JSON.stringify(data, null, 2));

      // Identify the source database - prioritize parent.id over data_source_id
      const databaseId = data?.parent?.id || data?.parent?.database_id || data?.parent?.data_source_id;
      
      if (!databaseId) {
        console.error('❌ No database ID found in webhook event');
        return;
      }

      console.log(`🔍 Looking up database ID: ${databaseId}`);
      
      // Map database ID to entity type
      const entityType = await this.mapDatabaseIdToEntityType(databaseId);
      
      if (!entityType) {
        console.error(`❌ Unknown database ID: ${databaseId}`);
        return;
      }

      // Invalidate Redis cache for the affected entity type
      await this.invalidateCacheForEntity(entityType, data?.id);
      
      console.log(`🗑️ Cache invalidated for ${entityType}`);
      console.log(`${'='.repeat(50)}\n`);

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

      console.log(`✅ Webhook processed and cache invalidated for ${entityType}`);
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
        syncErrors: [error instanceof Error ? error.message : 'Unknown error'],
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

      // Check for webhook token in environment variable OR in config
      const envToken = process.env.WEBHOOK_VERIFICATION_TOKEN || process.env.NOTION_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
      const hasConfigToken = !!config.webhookVerificationToken;
      const hasEnvToken = !!envToken;
      const hasToken = hasConfigToken || hasEnvToken;
      
      // Try to decrypt token to verify it's valid
      let tokenValid = false;
      if (hasConfigToken) {
        try {
          const decrypted = config.decryptWebhookToken();
          tokenValid = !!decrypted && decrypted.length > 0;
        } catch {
          tokenValid = false;
        }
      } else if (hasEnvToken) {
        // If using env variable, consider it valid if it exists
        tokenValid = envToken.length > 0;
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
        configSource: hasEnvToken ? 'environment' : hasConfigToken ? 'database' : 'none',
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
   * Invalidate Redis cache for specific entity
   */
  private async invalidateCacheForEntity(entityType: string, entityId?: string): Promise<void> {
    try {
      const patterns: string[] = [];
      
      switch (entityType) {
        case 'Task':
          patterns.push('tasks:*');
          patterns.push('tasks:calendar:*'); // Invalidate calendar cache specifically
          if (entityId) patterns.push(`task:${entityId}`);
          break;
        case 'Project':
          patterns.push('projects:*');
          if (entityId) patterns.push(`project:${entityId}`);
          // Also invalidate tasks as they're related to projects
          patterns.push('tasks:*');
          break;
        case 'Member':
          patterns.push('members:*');
          if (entityId) patterns.push(`member:${entityId}`);
          break;
        case 'Team':
          patterns.push('teams:*');
          if (entityId) patterns.push(`team:${entityId}`);
          break;
        case 'Client':
          patterns.push('clients:*');
          if (entityId) patterns.push(`client:${entityId}`);
          break;
      }

      // Invalidate cache patterns
      for (const pattern of patterns) {
        await redisService.invalidatePattern(pattern);
        console.log(`🗑️ Invalidated cache pattern: ${pattern}`);
      }
    } catch (error) {
      console.error(`❌ Error invalidating cache for ${entityType}:`, error);
      // Don't throw error, webhook processing should continue
    }
  }

  /**
   * Get webhook logs with pagination and filters
   */
  getWebhookLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        page = 1,
        limit = 20,
        entityType,
        status,
        startDate,
        endDate,
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build query filter
      const filter: any = { syncMethod: 'webhook' };
      
      if (entityType) {
        filter.entityType = entityType;
      }
      
      if (status) {
        filter.syncStatus = status;
      }
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          filter.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          filter.createdAt.$lte = new Date(endDate as string);
        }
      }

      // Get total count
      const total = await SyncLogModel.countDocuments(filter);

      // Get paginated logs
      const logs = await SyncLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Get statistics
      const stats = await SyncLogModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$syncStatus',
            count: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
          stats: {
            total,
            byStatus: stats.reduce((acc, s) => {
              acc[s._id] = {
                count: s.count,
                avgDuration: Math.round(s.avgDuration || 0),
              };
              return acc;
            }, {} as any),
          }
        }
      });
    } catch (error) {
      console.error('❌ Error fetching webhook logs:', error);
      res.status(500).json({
        error: 'Failed to fetch webhook logs',
        code: 'LOGS_ERROR',
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

      // Normalize database ID (remove hyphens)
      const normalizedId = databaseId.replace(/-/g, '');
      console.log(`🔄 Normalized ID: ${normalizedId}`);

      // Check each database type
      const databases = config.databases;
      
      // Also normalize the stored IDs for comparison
      const normalizeStoredId = (id: string | undefined) => id?.replace(/-/g, '');
      
      if (normalizeStoredId(databases.teams?.id) === normalizedId) return 'Team';
      if (normalizeStoredId(databases.users?.id) === normalizedId) return 'Member';
      if (normalizeStoredId(databases.clients?.id) === normalizedId) return 'Client';
      if (normalizeStoredId(databases.projects?.id) === normalizedId) return 'Project';
      if (normalizeStoredId(databases.traffic?.id) === normalizedId) return 'Task';

      // Log available databases for debugging
      console.log('📋 Available databases:', {
        teams: normalizeStoredId(databases.teams?.id),
        users: normalizeStoredId(databases.users?.id),
        clients: normalizeStoredId(databases.clients?.id),
        projects: normalizeStoredId(databases.projects?.id),
        traffic: normalizeStoredId(databases.traffic?.id),
      });

      return null;
    } catch (error) {
      console.error('Error mapping database ID:', error);
      return null;
    }
  }
}