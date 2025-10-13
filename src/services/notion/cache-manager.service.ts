import { NotionBaseService } from './notion-base.service';
import { redisService } from '../redis.service';
import { conflictService } from '../conflict.service';
import logger from '../../config/logger.config';

/**
 * Manages caching strategy for Notion data
 * Handles cache retrieval, conflicts, and invalidation
 */
export class CacheManagerService extends NotionBaseService {
  /**
   * Universal method for cached data retrieval with conflict detection
   * Handles cache retrieval, validation, conflict detection, and fallback to Notion
   */
  async getCachedOrFetch<T>(
    cacheKey: string,
    entityType: string,
    fetchFn: () => Promise<T>,
    options: {
      entityId?: string;
      skipCache?: boolean;
      forceRefresh?: boolean;
      conflictStrategy?: 'notion_wins' | 'local_wins' | 'merged';
    } = {}
  ): Promise<T> {
    const { 
      entityId, 
      skipCache = false, 
      forceRefresh = false,
      conflictStrategy = 'notion_wins' 
    } = options;

    // Skip cache entirely if requested
    if (skipCache) {
      logger.debug(`Skipping cache for ${cacheKey}, fetching directly from Notion`);
      return await fetchFn();
    }

    // Force refresh - fetch new data and update cache
    if (forceRefresh) {
      logger.debug(`Force refresh for ${cacheKey}, fetching from Notion`);
      const freshData = await fetchFn();
      await redisService.set(cacheKey, freshData, entityType);
      return freshData;
    }

    try {
      // Try to get from cache first
      const cacheStart = performance.now();
      const cachedData = await redisService.get<T>(cacheKey);
      const cacheDuration = performance.now() - cacheStart;
      
      if (cachedData) {
        console.log(`🎯 [CACHE-HIT] ${new Date().toISOString()} Found in cache: ${cacheKey} (${cacheDuration.toFixed(0)}ms)`);
        logger.debug(`Cache HIT for ${cacheKey}`);
        
        // Optionally validate cached data is still fresh (async, non-blocking)
        if (entityId) {
          this.validateCacheInBackground(cacheKey, entityType, entityId, cachedData, fetchFn, conflictStrategy);
        }
        
        return cachedData;
      }

      // Cache miss - fetch from Notion
      console.log(`❌ [CACHE-MISS] ${new Date().toISOString()} Not in cache: ${cacheKey} - fetching from Notion`);
      logger.debug(`Cache MISS for ${cacheKey}, fetching from Notion`);
      const freshData = await fetchFn();
      
      // Store in cache for next time
      const setCacheStart = performance.now();
      await redisService.set(cacheKey, freshData, entityType);
      const setCacheDuration = performance.now() - setCacheStart;
      console.log(`💾 [CACHE-SET] ${new Date().toISOString()} Stored in cache: ${cacheKey} (${setCacheDuration.toFixed(0)}ms)`);
      
      return freshData;
      
    } catch (error) {
      logger.error(`Cache operation failed for ${cacheKey}, falling back to Notion`, error);
      // Fallback to direct fetch if cache fails
      return await fetchFn();
    }
  }

  /**
   * Validate cached data in background (non-blocking)
   */
  private async validateCacheInBackground<T>(
    cacheKey: string,
    entityType: string,
    entityId: string,
    cachedData: T,
    fetchFn: () => Promise<T>,
    conflictStrategy: 'notion_wins' | 'local_wins' | 'merged'
  ): Promise<void> {
    // Run validation in background without blocking the response
    setImmediate(async () => {
      try {
        const freshData = await fetchFn();
        
        // Detect conflicts
        const conflict = await conflictService.detectConflict(
          entityType,
          entityId,
          cachedData,
          freshData
        );
        
        if (conflict) {
          logger.warn(`Conflict detected for ${entityType}:${entityId}`);
          
          // Resolve conflict based on strategy
          const resolvedData = await conflictService.resolveConflict(conflict, conflictStrategy);
          
          // Update cache with resolved data
          await redisService.set(cacheKey, resolvedData, entityType);
        }
      } catch (error) {
        logger.error(`Background cache validation failed for ${cacheKey}`, error);
      }
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    try {
      const healthCheck = await redisService.healthCheck();
      const conflictStats = await conflictService.getConflictStats();
      
      return {
        status: healthCheck.status,
        conflicts: conflictStats,
        cacheHealth: healthCheck
      };
    } catch (error: any) {
      logger.error('Failed to get cache stats', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Clear all cache
   */
  async clearAllCache(): Promise<void> {
    try {
      await redisService.invalidatePattern('*');
      logger.info('All cache cleared successfully');
    } catch (error) {
      logger.error('Failed to clear cache', error);
      throw error;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateCachePattern(pattern: string): Promise<void> {
    await redisService.invalidatePattern(pattern);
  }

  /**
   * Delete specific cache key
   */
  async deleteCacheKey(key: string): Promise<void> {
    await redisService.del(key);
  }

  /**
   * Set cache with custom TTL
   */
  async setCache<T>(key: string, data: T, entityType: string): Promise<void> {
    await redisService.set(key, data, entityType);
  }
}

// Export singleton instance
export const cacheManagerService = new CacheManagerService();