import { Client } from '@notionhq/client';
import { throttledNotionCall, batchNotionCalls } from './rateLimiter.service';
import { SyncLogModel } from '../models/SyncLog.model';
import { SyncSettingsModel } from '../models/SyncSettings.model';
import { TaskModel } from '../models/Task.model';
import { ProjectModel } from '../models/Project.model';
import { MemberModel } from '../models/Member.model';
import { TeamModel } from '../models/Team.model';
import { ClientModel } from '../models/Client.model';
import { NotionConfigModel } from '../models/NotionConfig.model';
import { queueService } from './queue.service';
import logger from '../config/logger.config';

/**
 * Service for syncing data from Notion to MongoDB
 */
export class NotionSyncService {
  private notionClient: Client | null = null;

  /**
   * Initialize Notion client with config
   */
  async initialize(): Promise<void> {
    try {
      const config = await NotionConfigModel.findOne({ isActive: true }).select('+integrationToken');
      
      if (!config) {
        throw new Error('No active Notion configuration found');
      }

      this.notionClient = new Client({
        auth: config.integrationToken,
      });

      logger.info('✅ Notion client initialized');
    } catch (error) {
      logger.error('Failed to initialize Notion client:', error);
      throw error;
    }
  }

  /**
   * Get Notion client (initialize if needed)
   */
  private async getClient(): Promise<Client> {
    if (!this.notionClient) {
      await this.initialize();
    }
    
    if (!this.notionClient) {
      throw new Error('Notion client not initialized');
    }

    return this.notionClient;
  }

  /**
   * Sync a page from Notion
   */
  async syncPage(
    entityType: string,
    pageId: string,
    syncMethod: 'webhook' | 'polling' | 'manual' | 'initial' = 'manual'
  ): Promise<void> {
    const startTime = Date.now();
    let syncLog;

    try {
      // Check circuit breaker
      const isOpen = await SyncSettingsModel.isCircuitBreakerOpen(entityType);
      if (isOpen) {
        logger.warn(`Circuit breaker is open for ${entityType}, skipping sync`);
        return;
      }

      // Get Notion config to find database mapping
      const config = await NotionConfigModel.findOne({ isActive: true });
      if (!config) {
        throw new Error('No active Notion configuration');
      }

      const mapping = config.databaseMappings.find((m: any) => m.entityType === entityType);
      if (!mapping) {
        throw new Error(`No database mapping found for ${entityType}`);
      }

      // Create sync log entry
      syncLog = await SyncLogModel.create({
        entityType,
        databaseId: mapping.notionDatabaseId,
        syncMethod,
        syncStatus: 'success',
        itemsProcessed: 0,
        itemsFailed: 0,
        startTime: new Date(startTime),
        endTime: new Date(),
        phase: 'import',
      });

      // Fetch page from Notion with rate limiting
      const client = await this.getClient();
      const page = await throttledNotionCall(
        () => client.pages.retrieve({ page_id: pageId }),
        `retrieve-page-${pageId}`
      );

      // Map and save to MongoDB based on entity type
      await this.savePageToMongoDB(entityType, page);

      // Update sync log
      syncLog.itemsProcessed = 1;
      syncLog.endTime = new Date();
      syncLog.duration = Date.now() - startTime;
      syncLog.syncStatus = 'success';
      await syncLog.save();

      // Reset circuit breaker on success
      await SyncSettingsModel.resetCircuitBreaker(entityType);

      logger.info(`✅ Synced ${entityType} ${pageId} in ${syncLog.duration}ms`);
    } catch (error) {
      logger.error(`Failed to sync ${entityType} ${pageId}:`, error);

      // Trip circuit breaker on failure
      await SyncSettingsModel.tripCircuitBreaker(entityType);

      // Update sync log
      if (syncLog) {
        syncLog.syncStatus = 'failed';
        syncLog.itemsFailed = 1;
        syncLog.syncErrors = [(error as Error).message];
        syncLog.endTime = new Date();
        syncLog.duration = Date.now() - startTime;
        await syncLog.save();
      }

      throw error;
    }
  }

  /**
   * Sync all pages from a database
   */
  async syncDatabase(
    entityType: string,
    syncMethod: 'webhook' | 'polling' | 'manual' | 'initial' = 'manual'
  ): Promise<void> {
    const startTime = Date.now();
    let syncLog;
    let itemsProcessed = 0;
    let itemsFailed = 0;
    const errors: string[] = [];

    try {
      // Check circuit breaker
      const isOpen = await SyncSettingsModel.isCircuitBreakerOpen(entityType);
      if (isOpen) {
        logger.warn(`Circuit breaker is open for ${entityType}, skipping database sync`);
        return;
      }

      // Get Notion config
      const config = await NotionConfigModel.findOne({ isActive: true });
      if (!config) {
        throw new Error('No active Notion configuration');
      }

      const mapping = config.databaseMappings.find((m: any) => m.entityType === entityType);
      if (!mapping) {
        throw new Error(`No database mapping found for ${entityType}`);
      }

      // Create sync log
      syncLog = await SyncLogModel.create({
        entityType,
        databaseId: mapping.notionDatabaseId,
        syncMethod,
        syncStatus: 'success',
        itemsProcessed: 0,
        itemsFailed: 0,
        startTime: new Date(startTime),
        endTime: new Date(),
        phase: 'import',
      });

      // Fetch all pages from database with rate limiting
      const client = await this.getClient();
      let hasMore = true;
      let cursor: string | undefined;
      const allPages: any[] = [];

      while (hasMore) {
        const queryParams: any = {
          database_id: mapping.notionDatabaseId,
          page_size: 100,
        };
        
        if (cursor) {
          queryParams.start_cursor = cursor;
        }
        
        const response = await throttledNotionCall(
          () => client.databases.query(queryParams),
          `query-database-${mapping.notionDatabaseId}`
        );

        allPages.push(...response.results);
        hasMore = response.has_more;
        cursor = response.next_cursor || undefined;

        // Update progress
        syncLog.progress = {
          current: allPages.length,
          total: allPages.length + (hasMore ? 100 : 0), // Estimate
        };
        await syncLog.save();
      }

      logger.info(`📥 Fetched ${allPages.length} ${entityType} pages from Notion`);

      // Process pages in batches
      const batchSize = 10;
      for (let i = 0; i < allPages.length; i += batchSize) {
        const batch = allPages.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (page) => {
          try {
            await this.savePageToMongoDB(entityType, page);
            itemsProcessed++;
          } catch (error) {
            logger.error(`Failed to save ${entityType} ${page.id}:`, error);
            itemsFailed++;
            errors.push(`${page.id}: ${(error as Error).message}`);
          }
        });

        await Promise.all(batchPromises);

        // Update progress
        syncLog.progress = {
          current: i + batch.length,
          total: allPages.length,
        };
        await syncLog.save();
      }

      // Phase 2: Denormalization
      syncLog.phase = 'denormalization';
      await syncLog.save();
      
      await this.runDenormalization(entityType);

      // Final update
      syncLog.itemsProcessed = itemsProcessed;
      syncLog.itemsFailed = itemsFailed;
      syncLog.syncErrors = errors.slice(0, 10); // Keep first 10 errors
      syncLog.syncStatus = itemsFailed > 0 ? 'partial' : 'success';
      syncLog.endTime = new Date();
      syncLog.duration = Date.now() - startTime;
      await syncLog.save();

      // Update sync settings
      await SyncSettingsModel.findOneAndUpdate(
        { entityType },
        {
          lastPollingSync: new Date(),
          nextScheduledSync: new Date(Date.now() + 60 * 60 * 1000), // Next in 1 hour
        }
      );

      // Reset circuit breaker on success
      if (itemsFailed === 0) {
        await SyncSettingsModel.resetCircuitBreaker(entityType);
      }

      logger.info(`✅ Database sync completed for ${entityType}: ${itemsProcessed} processed, ${itemsFailed} failed`);
    } catch (error) {
      logger.error(`Database sync failed for ${entityType}:`, error);

      // Trip circuit breaker
      await SyncSettingsModel.tripCircuitBreaker(entityType);

      // Update sync log
      if (syncLog) {
        syncLog.syncStatus = 'failed';
        syncLog.syncErrors = [(error as Error).message];
        syncLog.endTime = new Date();
        syncLog.duration = Date.now() - startTime;
        await syncLog.save();
      }

      throw error;
    }
  }

  /**
   * Save page to MongoDB based on entity type
   */
  private async savePageToMongoDB(entityType: string, page: any): Promise<void> {
    const updateData = {
      notionId: page.id,
      lastNotionSync: new Date(),
      lastWebhookUpdate: new Date(),
      _ttl: this.calculateTTL(entityType),
      // Raw Notion properties will be mapped in Task 4
      notionProperties: page.properties,
    };

    const options = {
      upsert: true,
      new: true,
      runValidators: true,
    };

    switch (entityType) {
      case 'Task':
        await TaskModel.findOneAndUpdate({ notionId: page.id }, updateData, options);
        break;
      case 'Project':
        await ProjectModel.findOneAndUpdate({ notionId: page.id }, updateData, options);
        break;
      case 'Member':
        await MemberModel.findOneAndUpdate({ notionId: page.id }, updateData, options);
        break;
      case 'Team':
        await TeamModel.findOneAndUpdate({ notionId: page.id }, updateData, options);
        break;
      case 'Client':
        await ClientModel.findOneAndUpdate({ notionId: page.id }, updateData, options);
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Calculate TTL based on entity type settings
   */
  private calculateTTL(entityType: string): Date {
    const ttlMap: Record<string, number> = {
      'Task': 3600,        // 1 hour
      'Project': 86400,    // 24 hours
      'Member': 604800,    // 7 days
      'Team': 604800,      // 7 days
      'Client': 604800,    // 7 days
    };

    const ttlSeconds = ttlMap[entityType] || 86400; // Default 24 hours
    return new Date(Date.now() + ttlSeconds * 1000);
  }

  /**
   * Run denormalization phase
   */
  private async runDenormalization(entityType: string): Promise<void> {
    // TODO: Implement in Task 4
    logger.info(`🔄 Running denormalization for ${entityType}`);
    
    // For now, just queue a denormalization job
    await queueService.addJob('denormalization', {
      entityType,
      timestamp: new Date(),
    }, {
      priority: entityType === 'Task' ? 1 : 2,
      delay: 1000, // Delay 1 second
    });
  }

  /**
   * Handle webhook event
   */
  async handleWebhookEvent(event: any): Promise<void> {
    const { type, data } = event;

    logger.info(`📨 Processing webhook event: ${type}`);

    switch (type) {
      case 'page.updated':
      case 'page.created':
        // Determine entity type from database ID
        const config = await NotionConfigModel.findOne({ isActive: true });
        if (!config) {
          logger.error('No active Notion configuration');
          return;
        }

        const mapping = config.databaseMappings.find(
          (m: any) => m.notionDatabaseId === data.parent?.database_id
        );

        if (mapping) {
          await this.syncPage(mapping.entityType, data.id, 'webhook');
        } else {
          logger.warn(`No mapping found for database ${data.parent?.database_id}`);
        }
        break;

      case 'page.deleted':
        // Handle deletion
        await this.handlePageDeletion(data.id);
        break;

      default:
        logger.warn(`Unknown webhook event type: ${type}`);
    }
  }

  /**
   * Handle page deletion
   */
  private async handlePageDeletion(pageId: string): Promise<void> {
    // Try to delete from all collections
    const models = [TaskModel, ProjectModel, MemberModel, TeamModel, ClientModel];
    
    for (const model of models) {
      const result = await (model as any).deleteOne({ notionId: pageId });
      if (result.deletedCount > 0) {
        logger.info(`✅ Deleted page ${pageId} from ${model.collection.name}`);
        break;
      }
    }
  }

  /**
   * Get sync statistics
   */
  async getStats(entityType?: string, days: number = 7): Promise<any> {
    return SyncLogModel.getStats(entityType, days);
  }

  /**
   * Check webhook health
   */
  async isWebhookHealthy(entityType: string): Promise<boolean> {
    return SyncLogModel.isWebhookHealthy(entityType);
  }
}

// Export singleton instance
export const notionSyncService = new NotionSyncService();