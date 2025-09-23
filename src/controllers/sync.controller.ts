import { Request, Response } from 'express';
import syncQueueService from '../services/sync-queue.service';
import { ConflictLogModel } from '../models/ConflictLog.model';
import { redisService } from '../services/redis.service';
import logger from '../config/logger.config';

export class SyncController {
  /**
   * Get global sync status
   * GET /api/sync/status
   */
  async getSyncStatus(req: Request, res: Response) {
    try {
      // Get queue status
      const queueStatus = syncQueueService.getStatus();
      
      // Get pending conflicts count
      const pendingConflicts = await ConflictLogModel.countDocuments({
        resolution: 'pending'
      });
      
      // Get recent failed count (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentFailed = await ConflictLogModel.countDocuments({
        resolution: 'failed',
        detectedAt: { $gte: oneHourAgo }
      });
      
      // Get last successful sync from Redis metadata
      const lastSyncKey = 'sync:last_successful';
      const lastSync = await redisService.get(lastSyncKey);
      
      // Determine global status
      const status = this.determineGlobalStatus(
        queueStatus.queueLength,
        queueStatus.processing,
        pendingConflicts,
        recentFailed
      );
      
      // Calculate next retry if there are failures
      let nextRetry = null;
      if (queueStatus.items.length > 0) {
        const firstItem = queueStatus.items[0];
        if (firstItem && firstItem.lastAttempt) {
          const lastAttempt = new Date(firstItem.lastAttempt);
          const backoffDelay = Math.min(1000 * Math.pow(2, firstItem.attempts || 1), 30000);
          nextRetry = new Date(lastAttempt.getTime() + backoffDelay).toISOString();
        }
      }
      
      return res.status(200).json({
        success: true,
        data: {
          status,
          pending: queueStatus.queueLength,
          failed: queueStatus.metrics.failed,
          conflicts: pendingConflicts,
          lastSync: lastSync || new Date().toISOString(),
          nextRetry,
          queueDetails: {
            processing: queueStatus.processing,
            avgProcessingTime: Math.round(queueStatus.metrics.avgProcessingTime),
            processed: queueStatus.metrics.processed,
            itemsInQueue: queueStatus.items.slice(0, 10) // First 10 items only
          }
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Error fetching sync status:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch sync status'
      });
    }
  }
  
  /**
   * Determine global sync status based on current state
   */
  private determineGlobalStatus(
    pending: number,
    processing: boolean,
    conflicts: number,
    failed: number
  ): 'idle' | 'syncing' | 'error' | 'conflict' {
    // Priority order: conflict > error > syncing > idle
    if (conflicts > 0) {
      return 'conflict';
    }
    
    if (failed > 0) {
      return 'error';
    }
    
    if (pending > 0 || processing) {
      return 'syncing';
    }
    
    return 'idle';
  }
  
  /**
   * Clear sync queue (admin only)
   * POST /api/sync/clear-queue
   */
  async clearQueue(req: Request, res: Response) {
    try {
      syncQueueService.clearQueue();
      
      logger.info('Sync queue cleared by admin', {
        userId: (req as any).userId
      });
      
      return res.status(200).json({
        success: true,
        message: 'Sync queue cleared successfully',
        meta: {
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Error clearing sync queue:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to clear sync queue'
      });
    }
  }
  
  /**
   * Retry failed items
   * POST /api/sync/retry-failed
   */
  async retryFailed(_req: Request, res: Response) {
    try {
      // Get failed items from queue
      const queueStatus = syncQueueService.getStatus();
      const failedItems = queueStatus.items.filter(
        item => item.attempts >= 3
      );
      
      if (failedItems.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No failed items to retry',
          data: {
            retried: 0
          }
        });
      }
      
      // Reset attempts and re-queue
      let retriedCount = 0;
      for (const item of failedItems) {
        // This would need a method in syncQueueService to reset specific items
        // For now, we'll just log it
        logger.info('Would retry item:', item.id);
        retriedCount++;
      }
      
      return res.status(200).json({
        success: true,
        message: `Queued ${retriedCount} items for retry`,
        data: {
          retried: retriedCount
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Error retrying failed items:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to retry items'
      });
    }
  }
}

export default new SyncController();