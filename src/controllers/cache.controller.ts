import { Request, Response } from 'express';
import { redisService } from '../services/redis.service';
import notionService from '../services/notion.service';
import { cacheMetricsService } from '../services/cache-metrics.service';
import { memoryMonitorService } from '../services/memory-monitor.service';
import logger from '../config/logger.config';

class CacheController {

  /**
   * Clear all cache entries
   */
  async clearCache(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Admin requested cache clear', { 
        admin: (req as any).user?.email 
      });

      // Clear all Redis cache
      await redisService.clear();
      
      // Reset metrics
      cacheMetricsService.resetMetrics();

      res.json({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString(),
      });

      logger.info('Cache cleared successfully');
    } catch (error) {
      logger.error('Error clearing cache:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clear cache',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Force cache warmup
   */
  async warmupCache(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Admin requested cache warmup', { 
        admin: (req as any).user?.email 
      });

      // Start warmup in background
      notionService.warmupCache().catch((error: any) => {
        logger.error('Background warmup error:', error);
      });
      
      res.json({
        success: true,
        message: 'Cache warmup initiated',
        timestamp: new Date().toISOString(),
        note: 'Warmup is running in background and may take a few minutes',
      });

      logger.info('Cache warmup initiated');
    } catch (error) {
      logger.error('Error initiating cache warmup:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate cache warmup',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(req: Request, res: Response): Promise<void> {
    try {
      // Get cache keys count
      const keys = await redisService.keys('*');
      const keysByPrefix: Record<string, number> = {};
      
      // Group keys by prefix
      for (const key of keys) {
        const prefix = key.split(':')[0];
        if (prefix) {
          keysByPrefix[prefix] = (keysByPrefix[prefix] || 0) + 1;
        }
      }

      // Get TTL info for a sample of keys
      const sampleKeys = keys.slice(0, 10);
      const ttlInfo = await Promise.all(
        sampleKeys.map(async (key) => {
          const ttl = await redisService.ttl(key);
          return { key, ttl };
        })
      );

      res.json({
        success: true,
        stats: {
          totalKeys: keys.length,
          keysByPrefix,
          sampleTTL: ttlInfo,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cache statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get cache metrics (hit/miss rates)
   */
  async getCacheMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = cacheMetricsService.getMetrics();
      
      res.json({
        success: true,
        cache: metrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting cache metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cache metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get memory usage information
   */
  async getMemoryUsage(req: Request, res: Response): Promise<void> {
    try {
      const memoryInfo = await memoryMonitorService.getMemoryInfo();
      
      res.json({
        success: true,
        memory: memoryInfo,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error getting memory usage:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get memory usage',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Invalidate specific cache entries
   */
  async invalidateCache(req: Request, res: Response): Promise<void> {
    try {
      const { pattern, entityType, entityId } = req.body;

      let deletedCount = 0;

      if (pattern) {
        // Delete by pattern
        const keys = await redisService.keys(pattern);
        for (const key of keys) {
          await redisService.delete(key);
          deletedCount++;
        }
      } else if (entityType && entityId) {
        // Delete specific entity
        const key = `${entityType}:${entityId}`;
        const deleted = await redisService.delete(key);
        if (deleted) deletedCount = 1;
      } else if (entityType) {
        // Delete all entries of a type
        const keys = await redisService.keys(`${entityType}:*`);
        for (const key of keys) {
          await redisService.delete(key);
          deletedCount++;
        }
      }

      res.json({
        success: true,
        message: `Invalidated ${deletedCount} cache entries`,
        deletedCount,
        timestamp: new Date().toISOString(),
      });

      logger.info('Cache invalidated', { 
        pattern, 
        entityType, 
        entityId, 
        deletedCount,
        admin: (req as any).user?.email 
      });
    } catch (error) {
      logger.error('Error invalidating cache:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to invalidate cache',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const cacheController = new CacheController();