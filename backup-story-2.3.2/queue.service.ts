// import Queue from 'bull'; // Désactivé temporairement - nécessite Redis
import { SyncService } from './sync.service';

/**
 * Queue service for async webhook processing
 * TEMPORARILY DISABLED - Requires Redis installation
 */
export class QueueService {
  private syncService: SyncService;

  constructor() {
    console.log('⏸️ Queue service is disabled (Redis not available)');
    this.syncService = new SyncService();
  }

  /**
   * Add sync job to queue - DISABLED
   */
  async addSyncJob(data: {
    entityType: string;
    databaseId: string;
    webhookEventId?: string;
    eventType: string;
    eventData: any;
    receivedAt: Date;
  }): Promise<void> {
    // Queue disabled - process synchronously instead
    console.log(`⏸️ Queue disabled - would process ${data.entityType} sync`);
    // You could call syncService directly here if needed
    // await this.syncService.syncPageFromWebhook(data.entityType, data.eventData, data.webhookEventId);
  }

  /**
   * Setup queue processors
   */
  private setupQueueProcessors(): void {
    // Process webhook events
    this.syncQueue.process('process-webhook', async (job) => {
      const { entityType, eventType, eventData, webhookEventId } = job.data;

      console.log(`🔄 Processing webhook job ${job.id} for ${entityType}`);

      try {
        // Process based on event type
        switch (eventType) {
          case 'page.created':
          case 'page.updated':
            await this.syncService.syncPageFromWebhook(entityType, eventData, webhookEventId);
            break;
          
          case 'page.deleted':
            await this.syncService.deletePageFromWebhook(entityType, eventData.id, webhookEventId);
            break;
          
          case 'data_source.content_updated':
          case 'data_source.schema_updated':
            // Trigger a full sync for the affected database
            await this.syncService.syncFromPolling(entityType);
            break;
          
          default:
            console.warn(`⚠️ Unknown event type: ${eventType}`);
        }

        console.log(`✅ Job ${job.id} completed successfully`);
        return { success: true, entityType, eventType };
      } catch (error) {
        console.error(`❌ Job ${job.id} failed:`, error);
        throw error;
      }
    });
  }

  /**
   * Setup queue event listeners
   */
  private setupQueueEvents(): void {
    this.syncQueue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed:`, result);
    });

    this.syncQueue.on('failed', (job, err) => {
      console.error(`❌ Job ${job.id} failed:`, err);
      
      // Log failure
      const { entityType, databaseId, webhookEventId } = job.data;
      this.logSyncFailure(entityType, databaseId, webhookEventId, err);
    });

    this.syncQueue.on('stalled', (job) => {
      console.warn(`⚠️ Job ${job.id} stalled`);
    });

    this.syncQueue.on('error', (error) => {
      console.error('❌ Queue error:', error);
    });

    console.log('✅ Queue service initialized');
  }

  /**
   * Get priority based on entity type
   */
  private getPriority(entityType: string): number {
    // Higher priority = processed first
    const priorities: Record<string, number> = {
      'Task': 10,     // Highest priority (most dynamic)
      'Project': 8,
      'Client': 6,
      'Member': 4,
      'Team': 2,      // Lowest priority (most static)
    };

    return priorities[entityType] || 5;
  }

  /**
   * Log sync failure
   */
  private async logSyncFailure(
    entityType: string,
    databaseId: string,
    webhookEventId: string | undefined,
    error: Error
  ): Promise<void> {
    try {
      const { SyncLogModel } = await import('../models/SyncLog.model');
      
      await SyncLogModel.create({
        entityType,
        databaseId,
        syncMethod: 'webhook',
        syncStatus: 'failed',
        webhookEventId,
        itemsProcessed: 0,
        itemsFailed: 1,
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
        errors: [error.message],
      });
    } catch (logError) {
      console.error('Failed to log sync failure:', logError);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    ] = await Promise.all([
      this.syncQueue.getWaitingCount(),
      this.syncQueue.getActiveCount(),
      this.syncQueue.getCompletedCount(),
      this.syncQueue.getFailedCount(),
      this.syncQueue.getDelayedCount(),
      this.syncQueue.isPaused(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    };
  }

  /**
   * Pause queue processing
   */
  async pauseQueue(): Promise<void> {
    await this.syncQueue.pause();
    console.log('⏸️ Queue paused');
  }

  /**
   * Resume queue processing
   */
  async resumeQueue(): Promise<void> {
    await this.syncQueue.resume();
    console.log('▶️ Queue resumed');
  }

  /**
   * Clean old jobs
   */
  async cleanQueue(): Promise<void> {
    const grace = 1000; // Keep last 1000 jobs
    await this.syncQueue.clean(grace);
    console.log('🧹 Queue cleaned');
  }
}