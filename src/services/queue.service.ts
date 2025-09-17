// Queue service with in-memory queue (no Redis dependency)
import { SyncService } from './sync.service';
import logger from '../config/logger.config';

interface QueueJob {
  id: string;
  type: string;
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Queue service for async webhook processing
 * Uses in-memory queue instead of Redis
 */
export class QueueService {
  private syncService: SyncService;
  private jobs: Map<string, QueueJob> = new Map();
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.syncService = new SyncService();
    this.setupProcessing();
    logger.info('✅ Queue service initialized (in-memory)');
  }

  /**
   * Add sync job to queue
   */
  async addSyncJob(data: {
    entityType: string;
    databaseId: string;
    webhookEventId?: string;
    eventType: string;
    eventData: any;
    receivedAt: Date;
  }): Promise<void> {
    const jobId = this.generateJobId();
    const job: QueueJob = {
      id: jobId,
      type: 'process-webhook',
      data,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);
    logger.info(`📋 Job ${jobId} added to queue for ${data.entityType}`);
  }

  /**
   * Add generic job to queue
   */
  async addJob(
    jobType: string,
    data: any,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    }
  ): Promise<any> {
    const jobId = this.generateJobId();
    const job: QueueJob = {
      id: jobId,
      type: jobType,
      data,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);
    logger.info(`📋 Job ${jobId} of type '${jobType}' added to queue`);
    return job;
  }

  /**
   * Setup processing interval
   */
  private setupProcessing(): void {
    // Process jobs every second
    this.processingInterval = setInterval(() => {
      this.processNextJob();
    }, 1000);
  }

  /**
   * Process next pending job
   */
  private async processNextJob(): Promise<void> {
    if (this.isProcessing) return;

    const pendingJob = Array.from(this.jobs.values())
      .find(job => job.status === 'pending');

    if (!pendingJob) return;

    this.isProcessing = true;
    pendingJob.status = 'processing';
    pendingJob.processedAt = new Date();
    pendingJob.attempts++;

    try {
      await this.processJob(pendingJob);
      pendingJob.status = 'completed';
      pendingJob.completedAt = new Date();
      logger.info(`✅ Job ${pendingJob.id} completed`);
    } catch (error) {
      logger.error(`❌ Job ${pendingJob.id} failed:`, error);
      pendingJob.error = (error as Error).message;
      
      if (pendingJob.attempts < 3) {
        pendingJob.status = 'pending';
        logger.info(`🔄 Retrying job ${pendingJob.id} (attempt ${pendingJob.attempts}/3)`);
      } else {
        pendingJob.status = 'failed';
        await this.logSyncFailure(pendingJob);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a specific job
   */
  private async processJob(job: QueueJob): Promise<void> {
    const { type, data } = job;

    logger.info(`🔄 Processing ${type} job ${job.id}`);

    switch (type) {
      case 'sync': {
        const { entityType, pageId, syncMethod } = data;
        const { notionSyncService } = await import('./notionSync.service');
        await notionSyncService.syncPage(entityType, pageId, syncMethod);
        break;
      }

      case 'process-webhook': {
        const { entityType, eventType, eventData, webhookEventId } = data;
        
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
            await this.syncService.syncFromPolling(entityType);
            break;
          
          default:
            logger.warn(`⚠️ Unknown event type: ${eventType}`);
        }
        break;
      }

      case 'denormalization': {
        const { entityType } = data;
        logger.info(`🔄 Processing denormalization for ${entityType}`);
        // TODO: Implement denormalization logic
        break;
      }

      default:
        logger.warn(`⚠️ Unknown job type: ${type}`);
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get priority based on entity type
   */
  private getPriority(entityType: string): number {
    const priorities: Record<string, number> = {
      'Task': 10,
      'Project': 8,
      'Client': 6,
      'Member': 4,
      'Team': 2,
    };
    return priorities[entityType] || 5;
  }

  /**
   * Log sync failure
   */
  private async logSyncFailure(job: QueueJob): Promise<void> {
    try {
      const { SyncLogModel } = await import('../models/SyncLog.model');
      const { entityType, databaseId, webhookEventId } = job.data;
      
      await SyncLogModel.create({
        entityType,
        databaseId,
        syncMethod: 'webhook',
        syncStatus: 'failed',
        webhookEventId,
        itemsProcessed: 0,
        itemsFailed: 1,
        startTime: job.processedAt,
        endTime: new Date(),
        duration: Date.now() - (job.processedAt?.getTime() || 0),
        syncErrors: [job.error || 'Unknown error'],
      });
    } catch (logError) {
      logger.error('Failed to log sync failure:', logError);
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
    const jobs = Array.from(this.jobs.values());
    
    return {
      waiting: jobs.filter(j => j.status === 'pending').length,
      active: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      delayed: 0,
      paused: false,
    };
  }

  /**
   * Pause queue processing
   */
  async pauseQueue(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    logger.info('⏸️ Queue paused');
  }

  /**
   * Resume queue processing
   */
  async resumeQueue(): Promise<void> {
    if (!this.processingInterval) {
      this.setupProcessing();
    }
    logger.info('▶️ Queue resumed');
  }

  /**
   * Clean old jobs
   */
  async cleanQueue(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 3600000);
    let cleaned = 0;

    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        if (job.completedAt && job.completedAt < oneHourAgo) {
          this.jobs.delete(id);
          cleaned++;
        }
      }
    }

    logger.info(`🧹 Queue cleaned: ${cleaned} jobs removed`);
  }

  /**
   * Get queue status (for monitoring)
   */
  async getStatus(): Promise<any> {
    return this.getQueueStats();
  }
}

// Export singleton instance
export const queueService = new QueueService();