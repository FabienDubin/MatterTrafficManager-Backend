import { TaskModel } from '../models/Task.model';
import { ProjectModel } from '../models/Project.model';
import { MemberModel } from '../models/Member.model';
import { TeamModel } from '../models/Team.model';
import { ClientModel } from '../models/Client.model';
import { SyncLogModel } from '../models/SyncLog.model';
import { SyncSettingsModel } from '../models/SyncSettings.model';
import { notionSyncService } from './notionSync.service';
import { queueService } from './queue.service';

/**
 * Service for synchronizing data between Notion and MongoDB
 */
export class SyncService {
  /**
   * Sync a page from webhook event
   */
  async syncPageFromWebhook(
    entityType: string,
    pageData: any,
    webhookEventId?: string
  ): Promise<void> {
    try {
      console.log(`🔄 Syncing ${entityType} from webhook`);
      
      // Queue the sync job for async processing
      await queueService.addJob('sync', {
        entityType,
        pageId: pageData.id,
        syncMethod: 'webhook',
        webhookEventId,
      }, {
        priority: entityType === 'Task' ? 1 : 2,
      });

      // Update lastWebhookUpdate timestamp
      await SyncSettingsModel.findOneAndUpdate(
        { entityType },
        { 
          lastWebhookSync: new Date(),
          $inc: { 'circuitBreaker.failureCount': -1 } // Reset on success
        }
      );

      console.log(`✅ ${entityType} sync queued from webhook`);
    } catch (error) {
      console.error(`❌ Failed to queue ${entityType} sync from webhook:`, error);
      
      // Trip circuit breaker on failure
      await SyncSettingsModel.tripCircuitBreaker(entityType);
      
      throw error;
    }
  }

  /**
   * Delete a page from webhook event
   */
  async deletePageFromWebhook(
    entityType: string,
    pageId: string,
    webhookEventId?: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`🗑️ Deleting ${entityType} ${pageId} from webhook`);
      
      // Get the appropriate model
      const model = this.getModelForEntityType(entityType);
      
      if (model) {
        await model.deleteOne({ notionId: pageId });
      }

      await SyncLogModel.create({
        entityType,
        databaseId: 'unknown',
        syncMethod: 'webhook',
        syncStatus: 'success',
        webhookEventId,
        itemsProcessed: 1,
        itemsFailed: 0,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
      });

      console.log(`✅ ${entityType} deleted from webhook`);
    } catch (error) {
      console.error(`❌ Failed to delete ${entityType} from webhook:`, error);
      throw error;
    }
  }

  /**
   * Sync from polling (backup method)
   */
  async syncFromPolling(entityType: string): Promise<void> {
    try {
      console.log(`🔄 Polling sync for ${entityType}`);
      
      // Check circuit breaker
      const isOpen = await SyncSettingsModel.isCircuitBreakerOpen(entityType);
      if (isOpen) {
        console.warn(`⚠️ Circuit breaker is open for ${entityType}, skipping polling`);
        return;
      }

      // Use NotionSyncService to sync the entire database
      await notionSyncService.syncDatabase(entityType, 'polling');

      console.log(`✅ Polling sync completed for ${entityType}`);
    } catch (error) {
      console.error(`❌ Polling sync failed for ${entityType}:`, error);
      
      // Trip circuit breaker on failure
      await SyncSettingsModel.tripCircuitBreaker(entityType);
      
      throw error;
    }
  }

  /**
   * Get model for entity type
   */
  private getModelForEntityType(entityType: string): any {
    const models: Record<string, any> = {
      'Task': TaskModel,
      'Project': ProjectModel,
      'Member': MemberModel,
      'Team': TeamModel,
      'Client': ClientModel,
    };

    return models[entityType];
  }

  /**
   * Get sync progress (for UI monitoring)
   */
  async getProgress(): Promise<{
    phase1: { current: number; total: number };
    phase2: { current: number; total: number };
  }> {
    // TODO: Implement in Task 8
    return {
      phase1: { current: 0, total: 0 },
      phase2: { current: 0, total: 0 },
    };
  }

  /**
   * Reset collection and resync
   */
  async resetCollection(collection: string): Promise<void> {
    // TODO: Implement in Task 8
    console.log(`Resetting collection ${collection}`);
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<any> {
    const entityTypes = ['Task', 'Project', 'Member', 'Team', 'Client'];
    const status: any[] = [];

    for (const entityType of entityTypes) {
      const settings = await SyncSettingsModel.findOne({ entityType });
      const lastLog = await SyncLogModel.getLatestSync(entityType);
      
      status.push({
        entityType,
        webhookEnabled: settings?.isWebhookEnabled || false,
        lastWebhookSync: settings?.lastWebhookSync,
        lastPollingSync: settings?.lastPollingSync,
        nextScheduledSync: settings?.nextScheduledSync,
        circuitBreakerOpen: settings?.circuitBreaker?.isOpen || false,
        lastSyncStatus: lastLog?.syncStatus,
        lastSyncMethod: lastLog?.syncMethod,
      });
    }

    return status;
  }
}