import { CronJob } from 'cron';
import { notionSyncService } from '../services/notionSync.service';
import { SyncSettingsModel } from '../models/SyncSettings.model';
import logger from '../config/logger.config';

class SyncPollingJob {
  private jobs: Map<string, CronJob> = new Map();
  private readonly entityTypes = ['Task', 'Project', 'Member', 'Team', 'Client'];

  /**
   * Initialize all polling jobs based on sync settings
   */
  async initialize(): Promise<void> {
    logger.info('🚀 Initializing sync polling jobs');

    for (const entityType of this.entityTypes) {
      try {
        const settings = await SyncSettingsModel.findOne({ entityType });
        
        if (!settings || !(settings as any).enabled) {
          logger.info(`⏸️  Polling disabled for ${entityType}`);
          continue;
        }

        const cronPattern = this.getCronPattern((settings as any).pollingInterval);
        this.startJob(entityType, cronPattern);
      } catch (error) {
        logger.error(`Failed to initialize polling job for ${entityType}:`, error);
      }
    }
  }

  /**
   * Start a polling job for an entity type
   */
  private startJob(entityType: string, cronPattern: string): void {
    if (this.jobs.has(entityType)) {
      this.stopJob(entityType);
    }

    const job = new CronJob(
      cronPattern,
      async () => {
        await this.runSync(entityType);
      },
      null,
      true,
      'Europe/Paris'
    );

    this.jobs.set(entityType, job);
    logger.info(`✅ Started polling job for ${entityType} with pattern: ${cronPattern}`);
  }

  /**
   * Stop a polling job
   */
  stopJob(entityType: string): void {
    const job = this.jobs.get(entityType);
    if (job) {
      job.stop();
      this.jobs.delete(entityType);
      logger.info(`⏹️  Stopped polling job for ${entityType}`);
    }
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const [entityType, job] of this.jobs) {
      job.stop();
      logger.info(`⏹️  Stopped polling job for ${entityType}`);
    }
    this.jobs.clear();
  }

  /**
   * Run sync for an entity type
   */
  private async runSync(entityType: string): Promise<void> {
    try {
      logger.info(`🔄 Starting scheduled sync for ${entityType}`);

      // Check if circuit breaker is open
      const settings = await SyncSettingsModel.findOne({ entityType });
      if (settings?.circuitBreaker?.isOpen) {
        if (settings.circuitBreaker.reopenAt && new Date() < settings.circuitBreaker.reopenAt) {
          logger.warn(`⚠️  Circuit breaker is open for ${entityType}, skipping sync`);
          return;
        }
        // Try to reopen
        await SyncSettingsModel.resetCircuitBreaker(entityType);
      }

      await notionSyncService.syncDatabase(entityType, 'polling');
      logger.info(`✅ Completed scheduled sync for ${entityType}`);
    } catch (error) {
      logger.error(`❌ Failed scheduled sync for ${entityType}:`, error);
    }
  }

  /**
   * Convert polling interval to cron pattern
   */
  private getCronPattern(interval: number): string {
    // Interval is in seconds
    if (interval < 60) {
      // Every X seconds
      return `*/${interval} * * * * *`;
    } else if (interval < 3600) {
      // Every X minutes
      const minutes = Math.floor(interval / 60);
      return `0 */${minutes} * * * *`;
    } else if (interval < 86400) {
      // Every X hours
      const hours = Math.floor(interval / 3600);
      return `0 0 */${hours} * * *`;
    } else {
      // Daily at 2 AM
      return `0 0 2 * * *`;
    }
  }

  /**
   * Update job schedule for an entity type
   */
  async updateSchedule(entityType: string, interval: number): Promise<void> {
    const cronPattern = this.getCronPattern(interval);
    this.startJob(entityType, cronPattern);
    logger.info(`📅 Updated schedule for ${entityType}: ${cronPattern}`);
  }

  /**
   * Get job status
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [entityType, job] of this.jobs) {
      status[entityType] = {
        running: (job as any).running || false,
        nextDate: job.nextDate()?.toISO() || null
      };
    }

    return status;
  }
}

export const syncPollingJob = new SyncPollingJob();