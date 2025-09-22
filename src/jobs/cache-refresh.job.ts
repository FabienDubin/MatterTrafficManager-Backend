/**
 * Cron job for cache refresh and maintenance
 */

import * as cron from 'node-cron';
import logger from '../config/logger.config';
import { preloadService } from '../services/preload.service';
import notionService from '../services/notion.service';
import { cacheMetricsService } from '../services/cache-metrics.service';

class CacheRefreshJob {
  private refreshTask: cron.ScheduledTask | null = null;
  private warmupTask: cron.ScheduledTask | null = null;
  
  /**
   * Start all cache-related cron jobs
   */
  start(): void {
    // Refresh expiring data every 30 minutes
    this.refreshTask = cron.schedule('*/30 * * * *', async () => {
      logger.info('[CRON] Starting cache refresh job...');
      const startTime = performance.now();
      
      try {
        await preloadService.refreshExpiringData();
        
        const duration = performance.now() - startTime;
        logger.info(`[CRON] Cache refresh completed in ${duration.toFixed(2)}ms`);
        
        // Record metrics
        cacheMetricsService.recordHit('cron-refresh', duration);
      } catch (error) {
        logger.error('[CRON] Cache refresh error:', error);
        const duration = performance.now() - startTime;
        cacheMetricsService.recordMiss('cron-refresh', duration);
      }
    });
    
    // Full cache warmup every morning at 6 AM
    this.warmupTask = cron.schedule('0 6 * * *', async () => {
      logger.info('[CRON] Starting daily cache warmup...');
      const startTime = performance.now();
      
      try {
        await notionService.warmupCache();
        await preloadService.preloadOnStartup();
        
        const duration = performance.now() - startTime;
        logger.info(`[CRON] Daily warmup completed in ${duration.toFixed(2)}ms`);
      } catch (error) {
        logger.error('[CRON] Daily warmup error:', error);
      }
    });
    
    logger.info('Cache refresh cron jobs started');
    logger.info('- Refresh job: every 30 minutes');
    logger.info('- Warmup job: daily at 6 AM');
  }
  
  /**
   * Stop all cron jobs
   */
  stop(): void {
    if (this.refreshTask) {
      this.refreshTask.stop();
      this.refreshTask = null;
    }
    
    if (this.warmupTask) {
      this.warmupTask.stop();
      this.warmupTask = null;
    }
    
    logger.info('Cache refresh cron jobs stopped');
  }
  
  /**
   * Manual trigger for testing
   */
  async triggerRefresh(): Promise<void> {
    logger.info('Manually triggering cache refresh...');
    await preloadService.refreshExpiringData();
  }
  
  /**
   * Manual trigger for warmup
   */
  async triggerWarmup(): Promise<void> {
    logger.info('Manually triggering cache warmup...');
    await notionService.warmupCache();
    await preloadService.preloadOnStartup();
  }
}

export const cacheRefreshJob = new CacheRefreshJob();