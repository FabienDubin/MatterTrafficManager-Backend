import { Redis } from '@upstash/redis';
import logger from '../config/logger.config';
import { cacheMetricsService } from './cache-metrics.service';

interface RedisConfig {
  url: string;
  token: string;
  ttl: {
    tasks: number;
    projects: number;
    members: number;
    teams: number;
    clients: number;
  };
}

export class RedisService {
  private redis: Redis;
  private config: RedisConfig;
  private isConnected: boolean = false;

  constructor() {
    this.config = {
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
      ttl: {
        tasks: parseInt(process.env.REDIS_TTL_TASKS || '3600'),
        projects: parseInt(process.env.REDIS_TTL_PROJECTS || '86400'),
        members: parseInt(process.env.REDIS_TTL_MEMBERS || '604800'),
        teams: parseInt(process.env.REDIS_TTL_TEAMS || '604800'),
        clients: parseInt(process.env.REDIS_TTL_CLIENTS || '43200'),
      },
    };

    if (!this.config.url || !this.config.token) {
      logger.warn('Redis configuration missing, cache will be disabled');
      this.redis = {} as Redis;
    } else {
      this.redis = new Redis({
        url: this.config.url,
        token: this.config.token,
      });
      this.isConnected = true;
      logger.info('Redis service initialized with Upstash');
    }
  }

  /**
   * Get data from cache with automatic Notion fallback
   */
  async get<T>(key: string, fallbackFn?: () => Promise<T>): Promise<T | null> {
    const startTime = performance.now();
    const entityType = key.split(':')[0] || 'unknown';
    
    try {
      if (!this.isConnected) {
        logger.debug(`Redis not connected, falling back for key: ${key}`);
        return fallbackFn ? await fallbackFn() : null;
      }

      const cached = await this.redis.get(key);
      
      if (cached) {
        const responseTime = performance.now() - startTime;
        logger.debug(`Cache hit for key: ${key} (${responseTime.toFixed(2)}ms)`);
        cacheMetricsService.recordHit(entityType, responseTime);
        return cached as T;
      }

      logger.debug(`Cache miss for key: ${key}`);
      
      if (fallbackFn) {
        const data = await fallbackFn();
        const responseTime = performance.now() - startTime;
        cacheMetricsService.recordMiss(entityType, responseTime);
        
        if (data) {
          await this.set(key, data, entityType);
        }
        return data;
      }

      const responseTime = performance.now() - startTime;
      cacheMetricsService.recordMiss(entityType, responseTime);
      return null;
    } catch (error) {
      logger.error('Redis get error:', error);
      const responseTime = performance.now() - startTime;
      cacheMetricsService.recordMiss(entityType, responseTime);
      return fallbackFn ? await fallbackFn() : null;
    }
  }

  /**
   * Set data in cache with TTL based on entity type
   */
  async set(key: string, value: any, entityType?: string): Promise<void> {
    try {
      if (!this.isConnected) {
        return;
      }

      const entityTypeResolved = entityType || key.split(':')[0] || 'default';
      const ttl = this.getTTLForEntity(entityTypeResolved);
      
      await this.redis.setex(key, ttl, JSON.stringify(value));
      logger.debug(`Cache set for key: ${key} with TTL: ${ttl}s`);
    } catch (error) {
      logger.error('Redis set error:', error);
    }
  }

  /**
   * Delete specific key
   */
  async del(key: string): Promise<void> {
    try {
      if (!this.isConnected) {
        return;
      }

      await this.redis.del(key);
      logger.debug(`Cache deleted for key: ${key}`);
    } catch (error) {
      logger.error('Redis del error:', error);
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (!this.isConnected) {
        return;
      }

      // Upstash doesn't support KEYS command, so we need to be smart about invalidation
      const parts = pattern.split(':');
      const entityType = parts[0]?.replace('*', '') || '';
      
      if (!entityType) {
        logger.warn('Invalid pattern for invalidation:', pattern);
        return;
      }
      
      // Use SCAN to find matching keys (Upstash supports SCAN)
      let cursor = 0;
      let keysToDelete: string[] = [];
      
      try {
        // Scan for keys matching the pattern
        const scanResult = await this.redis.scan(cursor, { 
          match: pattern,
          count: 100 
        });
        
        cursor = Number(scanResult[0]);
        const keys = scanResult[1];
        
        if (keys && keys.length > 0) {
          keysToDelete = keysToDelete.concat(keys);
          
          // Continue scanning if there are more keys
          while (cursor !== 0) {
            const nextScan = await this.redis.scan(cursor, { 
              match: pattern,
              count: 100 
            });
            cursor = Number(nextScan[0]);
            if (nextScan[1] && nextScan[1].length > 0) {
              keysToDelete = keysToDelete.concat(nextScan[1]);
            }
          }
          
          // Delete all found keys
          if (keysToDelete.length > 0) {
            await this.redis.del(...keysToDelete);
            logger.info(`Invalidated ${keysToDelete.length} keys matching pattern: ${pattern}`);
          }
        } else {
          logger.debug(`No keys found matching pattern: ${pattern}`);
        }
      } catch (scanError) {
        // Fallback to known patterns if SCAN fails
        logger.debug('SCAN not supported or failed, using fallback invalidation');
        
        // Delete known common keys for this entity type
        const commonKeys = [
          `${entityType}:list`,
          `${entityType}:list:all:page:1`,
          `${entityType}:list:active:page:1`,
        ];
        
        for (const key of commonKeys) {
          await this.del(key);
        }
        
        logger.info(`Cache invalidation completed for entity type: ${entityType}`);
      }
    } catch (error) {
      logger.error('Redis pattern invalidation error:', error);
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{ status: string; message?: string }> {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', message: 'Redis not configured' };
      }

      await this.redis.ping();
      return { status: 'healthy' };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return { 
        status: 'unhealthy', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get TTL for entity type
   */
  private getTTLForEntity(entityType: string): number {
    const ttlMap: Record<string, number> = {
      task: this.config.ttl.tasks,
      tasks: this.config.ttl.tasks,
      project: this.config.ttl.projects,
      projects: this.config.ttl.projects,
      member: this.config.ttl.members,
      members: this.config.ttl.members,
      user: this.config.ttl.members,
      users: this.config.ttl.members,
      team: this.config.ttl.teams,
      teams: this.config.ttl.teams,
      client: this.config.ttl.clients,
      clients: this.config.ttl.clients,
    };

    return ttlMap[entityType.toLowerCase()] || 3600; // Default 1 hour
  }

  /**
   * Cache Notion data with specific keys
   */
  async cacheNotionData(type: string, id: string, data: any): Promise<void> {
    const key = `${type}:${id}`;
    await this.set(key, data, type);
  }

  /**
   * Get Notion data with cache
   */
  async getNotionData<T>(type: string, id: string, fetchFn: () => Promise<T>): Promise<T | null> {
    const key = `${type}:${id}`;
    return await this.get(key, fetchFn);
  }

  /**
   * Cache list data with pagination support
   */
  async cacheList(type: string, identifier: string, data: any[], page: number = 1): Promise<void> {
    const key = `${type}:list:${identifier}:page:${page}`;
    await this.set(key, data, type);
  }

  /**
   * Get cached list
   */
  async getCachedList<T>(type: string, identifier: string, page: number = 1): Promise<T[] | null> {
    const key = `${type}:list:${identifier}:page:${page}`;
    return await this.get(key);
  }

  /**
   * Clear all cache for a specific entity type
   */
  async clearEntityCache(entityType: string): Promise<void> {
    await this.invalidatePattern(`${entityType}:*`);
  }
}

// Export singleton instance
export const redisService = new RedisService();