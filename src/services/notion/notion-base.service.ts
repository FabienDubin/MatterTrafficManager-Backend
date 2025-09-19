import { notion } from '../../config/notion.config';
import logger from '../../config/logger.config';

/**
 * Base class for all Notion-related services
 * Provides common functionality like rate limiting and throttling
 */
export abstract class NotionBaseService {
  private lastCallTime = 0;
  private minTimeBetweenCalls = 334; // ~3 requests per second (1000ms / 3)

  /**
   * Simple throttle to ensure we don't exceed Notion's rate limit
   * Guarantees minimum 334ms between calls (3 req/sec)
   */
  protected async throttledNotionCall<T>(
    fn: () => Promise<T>,
    operation?: string
  ): Promise<T> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.minTimeBetweenCalls) {
      const waitTime = this.minTimeBetweenCalls - timeSinceLastCall;
      logger.debug(`Throttling Notion API call by ${waitTime}ms${operation ? ` for ${operation}` : ''}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCallTime = Date.now();
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      if (duration > 1000) {
        logger.warn(`Slow Notion API call${operation ? ` for ${operation}` : ''}: ${duration}ms`);
      }
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`Notion API call failed${operation ? ` for ${operation}` : ''} after ${duration}ms`, {
        error: error.message,
        code: error.code,
        status: error.status
      });
      throw error;
    }
  }

  /**
   * Batch multiple Notion calls with throttling
   */
  protected async batchNotionCalls<T>(
    calls: Array<() => Promise<T>>,
    batchSize = 3
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < calls.length; i += batchSize) {
      const batch = calls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(call => this.throttledNotionCall(call))
      );
      results.push(...batchResults);
      
      // Wait 1 second between batches if there are more
      if (i + batchSize < calls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Generate a consistent cache key based on parameters
   */
  protected generateCacheKey(
    entityType: string,
    operation: string,
    params: Record<string, any> = {}
  ): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join(':');
    
    return sortedParams 
      ? `${entityType}:${operation}:${sortedParams}`
      : `${entityType}:${operation}`;
  }
}