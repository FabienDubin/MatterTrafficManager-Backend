import { Request, Response } from 'express';
import { notionSyncService } from '../services/notionSync.service';
import notionMappingService from '../services/notionMapping.service';
import { SyncLogModel } from '../models/SyncLog.model';
import logger from '../config/logger.config';

/**
 * Controller for Notion synchronization operations
 */
class NotionSyncController {
  /**
   * Trigger manual sync for an entity type
   */
  async triggerSync(req: Request, res: Response): Promise<Response> {
    try {
      const { entityType, syncMethod = 'manual' } = req.body;

      if (!entityType) {
        return res.status(400).json({
          success: false,
          error: 'entityType is required'
        });
      }

      const validEntityTypes = ['Task', 'Project', 'Member', 'Team', 'Client'];
      if (!validEntityTypes.includes(entityType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid entityType. Must be one of: ${validEntityTypes.join(', ')}`
        });
      }

      logger.info(`Manual sync triggered for ${entityType}`);

      // Start async sync
      notionSyncService.syncDatabase(entityType, syncMethod as any).catch((error: any) => {
        logger.error(`Async sync failed for ${entityType}:`, error);
      });

      return res.json({
        success: true,
        message: `Sync started for ${entityType}`,
        entityType,
        syncMethod
      });
    } catch (error: any) {
      logger.error('Failed to trigger sync:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Sync a specific page by ID
   */
  async syncPage(req: Request, res: Response): Promise<Response> {
    try {
      const { entityType, pageId } = req.params;
      const { syncMethod = 'manual' } = req.body;

      if (!entityType || !pageId) {
        return res.status(400).json({
          success: false,
          error: 'entityType and pageId are required'
        });
      }

      logger.info(`Manual page sync triggered for ${entityType}:${pageId}`);

      await notionSyncService.syncPage(entityType, pageId, syncMethod as any);

      return res.json({
        success: true,
        message: `Page ${pageId} synced successfully`,
        entityType,
        pageId,
        syncMethod
      });
    } catch (error: any) {
      logger.error('Failed to sync page:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Map a specific entity to MongoDB
   */
  async mapEntity(req: Request, res: Response): Promise<Response> {
    try {
      const { entityType, pageId } = req.params;

      if (!entityType || !pageId) {
        return res.status(400).json({
          success: false,
          error: 'entityType and pageId are required'
        });
      }

      let result;
      switch (entityType) {
        case 'Task':
          result = await notionMappingService.mapTaskToMongoDB(pageId);
          break;
        case 'Project':
          result = await notionMappingService.mapProjectToMongoDB(pageId);
          break;
        case 'Member':
          result = await notionMappingService.mapMemberToMongoDB(pageId);
          break;
        case 'Team':
          result = await notionMappingService.mapTeamToMongoDB(pageId);
          break;
        case 'Client':
          result = await notionMappingService.mapClientToMongoDB(pageId);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Invalid entityType: ${entityType}`
          });
      }

      if (result.success) {
        return res.json({
          success: true,
          message: `Entity ${pageId} mapped successfully`,
          entity: result.entity
        });
      } else {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error: any) {
      logger.error('Failed to map entity:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Bulk map multiple entities
   */
  async bulkMapEntities(req: Request, res: Response): Promise<Response> {
    try {
      const { entityType, pageIds } = req.body;

      if (!entityType || !pageIds || !Array.isArray(pageIds)) {
        return res.status(400).json({
          success: false,
          error: 'entityType and pageIds array are required'
        });
      }

      const result = await notionMappingService.bulkMapEntities(entityType, pageIds);

      return res.json({
        success: result.failed === 0,
        result
      });
    } catch (error: any) {
      logger.error('Failed to bulk map entities:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get sync status and statistics
   */
  async getSyncStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { entityType } = req.query;
      
      const filter: any = {};
      if (entityType) {
        filter.entityType = entityType;
      }

      const [
        recentLogs,
        stats,
        mappingStats
      ] = await Promise.all([
        SyncLogModel.find(filter)
          .sort({ startTime: -1 })
          .limit(10)
          .lean(),
        SyncLogModel.getStats(entityType as string),
        notionMappingService.getMappingStats()
      ]);

      return res.json({
        success: true,
        recentLogs,
        stats,
        mappingStats
      });
    } catch (error: any) {
      logger.error('Failed to get sync status:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get sync health check
   */
  async getHealth(req: Request, res: Response): Promise<Response> {
    try {
      // Get recent sync logs to determine health
      const recentLogs = await SyncLogModel.find()
        .sort({ startTime: -1 })
        .limit(10)
        .lean();
      
      const failedCount = recentLogs.filter(log => log.syncStatus === 'failed').length;
      const isHealthy = failedCount < 5; // Consider unhealthy if more than 50% failed
      
      return res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        health: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          recentLogs,
          failedCount,
          totalChecked: recentLogs.length
        }
      });
    } catch (error: any) {
      logger.error('Failed to get sync health:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new NotionSyncController();