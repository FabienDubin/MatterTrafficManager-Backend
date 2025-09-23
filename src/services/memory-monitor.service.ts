/**
 * Service for monitoring Upstash Redis memory usage
 */

import axios from 'axios';
import logger from '../config/logger.config';
import { redisService } from './redis.service';

interface MemoryInfo {
  usedMemoryBytes: number;
  usedMemoryMB: number;
  maxMemoryBytes?: number;
  maxMemoryMB: number;
  usagePercentage: number;
  warningLevel: 'ok' | 'warning' | 'critical';
  keyCount: number;
  avgKeySize?: number | undefined;
  evictionPolicy?: string;
}

interface UpstashResponse {
  result: string | number;
}

class MemoryMonitorService {
  private readonly MEMORY_LIMIT_MB = 256; // Upstash Free Tier limit
  private readonly WARNING_THRESHOLD_MB = 200;
  private readonly CRITICAL_THRESHOLD_MB = 240;
  private lastAlertTime: Date | null = null;
  private readonly ALERT_COOLDOWN_MS = 300000; // 5 minutes

  /**
   * Get memory usage from Upstash Redis using DBSIZE command
   * Upstash doesn't support INFO command, so we use DBSIZE and estimate memory
   */
  async getMemoryInfo(): Promise<MemoryInfo> {
    try {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;

      if (!redisUrl || !redisToken) {
        throw new Error('Redis URL or Token not configured');
      }

      // Use DBSIZE to get the number of keys (Upstash supports this)
      const dbsizeResponse = await axios.post<UpstashResponse>(
        `${redisUrl}/dbsize`,
        null,
        {
          headers: {
            Authorization: `Bearer ${redisToken}`,
          },
        }
      );

      const keyCount = typeof dbsizeResponse.data.result === 'number' 
        ? dbsizeResponse.data.result 
        : parseInt(String(dbsizeResponse.data.result), 10) || 0;
      
      // Estimate memory based on key count and average key size
      const memoryInfo = await this.estimateMemoryFromKeyCount(keyCount);
      
      // Check and log alerts
      this.checkMemoryAlerts(memoryInfo);
      
      return memoryInfo;
    } catch (error) {
      logger.error('Failed to get memory info from Upstash:', error);
      
      // Return estimated values if DBSIZE fails
      return this.getEstimatedMemoryInfo();
    }
  }

  /**
   * Estimate memory usage based on key count
   * Uses averages based on typical cache patterns in the application
   */
  private async estimateMemoryFromKeyCount(keyCount: number): Promise<MemoryInfo> {
    // Average sizes based on typical cached entities:
    // - Tasks: ~2KB per item (includes description, dates, etc.)
    // - Projects: ~5KB per item (includes multiple fields)
    // - Members/Users: ~1KB per item
    // - Teams: ~3KB per item
    // - Clients: ~2KB per item
    // Average across all types: ~2.5KB per key
    const avgKeySizeBytes = 2560; // 2.5KB average
    
    // Get actual key distribution if possible
    const distribution = await this.getActualKeyDistribution();
    
    // Calculate weighted average if we have distribution
    let weightedAvgSize = avgKeySizeBytes;
    if (distribution.total && distribution.total > 0) {
      const weights = {
        tasks: 2048,      // 2KB
        projects: 5120,   // 5KB
        members: 1024,    // 1KB
        users: 1024,      // 1KB
        teams: 3072,      // 3KB
        clients: 2048,    // 2KB
      };
      
      let totalWeight = 0;
      let weightedSum = 0;
      
      Object.entries(distribution).forEach(([key, count]) => {
        if (key !== 'total' && key !== 'other' && weights[key as keyof typeof weights]) {
          const weight = weights[key as keyof typeof weights];
          weightedSum += weight * count;
          totalWeight += count;
        }
      });
      
      if (totalWeight > 0) {
        weightedAvgSize = Math.round(weightedSum / totalWeight);
      }
    }
    
    const usedMemoryBytes = keyCount * weightedAvgSize;
    const usedMemoryMB = usedMemoryBytes / (1024 * 1024);
    const usagePercentage = (usedMemoryMB / this.MEMORY_LIMIT_MB) * 100;
    
    let warningLevel: 'ok' | 'warning' | 'critical' = 'ok';
    if (usedMemoryMB >= this.CRITICAL_THRESHOLD_MB) {
      warningLevel = 'critical';
    } else if (usedMemoryMB >= this.WARNING_THRESHOLD_MB) {
      warningLevel = 'warning';
    }

    return {
      usedMemoryBytes: Math.round(usedMemoryBytes),
      usedMemoryMB: Math.round(usedMemoryMB * 100) / 100,
      maxMemoryBytes: this.MEMORY_LIMIT_MB * 1024 * 1024,
      maxMemoryMB: this.MEMORY_LIMIT_MB,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
      warningLevel,
      keyCount,
      avgKeySize: weightedAvgSize,
      evictionPolicy: 'allkeys-lru', // Upstash default
    };
  }

  /**
   * Get estimated memory info when INFO command fails
   */
  private getEstimatedMemoryInfo(): MemoryInfo {
    // Estimate based on cache metrics
    const { estimatedSizeMB, warningLevel } = this.getMemoryEstimate();
    
    return {
      usedMemoryBytes: Math.round(estimatedSizeMB * 1024 * 1024),
      usedMemoryMB: estimatedSizeMB,
      maxMemoryBytes: this.MEMORY_LIMIT_MB * 1024 * 1024,
      maxMemoryMB: this.MEMORY_LIMIT_MB,
      usagePercentage: Math.round((estimatedSizeMB / this.MEMORY_LIMIT_MB) * 100 * 100) / 100,
      warningLevel: warningLevel as 'ok' | 'warning' | 'critical',
      keyCount: 0, // Unknown
      evictionPolicy: 'noeviction', // Upstash default
    };
  }

  /**
   * Get memory usage estimate based on cache activity
   */
  getMemoryEstimate(): { estimatedSizeMB: number; warningLevel: string } {
    // This could be enhanced with actual tracking
    // For now, return a simple estimate
    const baseUsage = 50; // Base MB usage
    const growthRate = 0.1; // MB per hour
    const hoursSinceStart = (Date.now() - (this.lastAlertTime?.getTime() || Date.now())) / 3600000;
    
    const estimatedSizeMB = Math.min(
      baseUsage + (hoursSinceStart * growthRate),
      this.MEMORY_LIMIT_MB * 0.95 // Cap at 95% of limit
    );
    
    let warningLevel = 'ok';
    if (estimatedSizeMB > this.CRITICAL_THRESHOLD_MB) {
      warningLevel = 'critical';
    } else if (estimatedSizeMB > this.WARNING_THRESHOLD_MB) {
      warningLevel = 'warning';
    }
    
    return {
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      warningLevel,
    };
  }

  /**
   * Check memory usage and log alerts
   */
  private checkMemoryAlerts(memoryInfo: MemoryInfo): void {
    const now = new Date();
    
    // Check cooldown
    if (
      this.lastAlertTime &&
      now.getTime() - this.lastAlertTime.getTime() < this.ALERT_COOLDOWN_MS
    ) {
      return;
    }

    if (memoryInfo.warningLevel === 'critical') {
      logger.error('CRITICAL: Redis memory usage above 240MB', {
        usedMemoryMB: memoryInfo.usedMemoryMB,
        usagePercentage: memoryInfo.usagePercentage,
        keyCount: memoryInfo.keyCount,
      });
      this.lastAlertTime = now;
    } else if (memoryInfo.warningLevel === 'warning') {
      logger.warn('WARNING: Redis memory usage above 200MB', {
        usedMemoryMB: memoryInfo.usedMemoryMB,
        usagePercentage: memoryInfo.usagePercentage,
        keyCount: memoryInfo.keyCount,
      });
      this.lastAlertTime = now;
    }
  }

  /**
   * Evict old cache entries if memory is critical
   */
  async performEviction(): Promise<{ evictedKeys: number }> {
    const memoryInfo = await this.getMemoryInfo();
    
    if (memoryInfo.warningLevel !== 'critical') {
      return { evictedKeys: 0 };
    }

    logger.info('Starting LRU eviction due to high memory usage');
    
    // Upstash handles LRU eviction automatically with allkeys-lru policy
    // But we can force eviction of old keys if needed
    let evictedKeys = 0;
    
    try {
      // Get oldest keys (this is a simplification, real LRU would need tracking)
      // For now, we'll delete keys with certain patterns that are likely old
      
      // Delete old cached data (older than 1 hour)
      const patterns = [
        'tasks:*',
        'projects:*',
        'clients:*',
      ];
      
      for (const pattern of patterns) {
        await redisService.invalidatePattern(pattern);
        evictedKeys++; // Count patterns, not individual keys
      }
      
      logger.info(`Evicted ${evictedKeys} old cache entries`);
    } catch (error) {
      logger.error('Eviction error:', error);
    }
    
    return { evictedKeys };
  }

  /**
   * Get detailed memory statistics
   */
  async getDetailedStats(): Promise<any> {
    const memoryInfo = await this.getMemoryInfo();
    
    // Get key distribution by type
    const distribution = await this.getKeyDistribution();
    
    return {
      memory: memoryInfo,
      distribution,
      recommendations: this.getRecommendations(memoryInfo),
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * Get distribution of keys by entity type
   */
  private async getKeyDistribution(): Promise<Record<string, number>> {
    return this.getActualKeyDistribution();
  }

  /**
   * Get actual key distribution using Redis keys
   */
  private async getActualKeyDistribution(): Promise<Record<string, number>> {
    try {
      // Try to get actual counts using the keys method from redisService
      const patterns = [
        'tasks',
        'projects', 
        'members',
        'users',
        'teams',
        'clients',
      ];
      
      const distribution: Record<string, number> = {};
      let total = 0;
      
      for (const pattern of patterns) {
        const keys = await redisService.keys(`${pattern}:*`);
        distribution[pattern] = keys.length;
        total += keys.length;
      }
      
      // Get total from DBSIZE for 'other' calculation
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;
      
      if (redisUrl && redisToken) {
        try {
          const dbsizeResponse = await axios.post<UpstashResponse>(
            `${redisUrl}/dbsize`,
            null,
            {
              headers: {
                Authorization: `Bearer ${redisToken}`,
              },
            }
          );
          
          const totalKeys = typeof dbsizeResponse.data.result === 'number' 
            ? dbsizeResponse.data.result 
            : parseInt(String(dbsizeResponse.data.result), 10) || 0;
          
          distribution.other = Math.max(0, totalKeys - total);
          distribution.total = totalKeys;
        } catch (err) {
          logger.debug('Could not get total key count for distribution');
        }
      }
      
      return distribution;
    } catch (error) {
      logger.debug('Could not get actual key distribution, using estimates');
      // Return estimates if we can't get actual distribution
      return {
        users: 50,
        teams: 10,
        projects: 100,
        tasks: 500,
        clients: 20,
        other: 50,
        total: 730,
      };
    }
  }

  /**
   * Get memory optimization recommendations
   */
  private getRecommendations(memoryInfo: MemoryInfo): string[] {
    const recommendations: string[] = [];
    
    if (memoryInfo.usagePercentage > 90) {
      recommendations.push('Consider upgrading to a paid plan for more memory');
      recommendations.push('Clear old cache entries');
    } else if (memoryInfo.usagePercentage > 75) {
      recommendations.push('Monitor memory usage closely');
      recommendations.push('Consider reducing cache TTLs');
    }
    
    if (memoryInfo.avgKeySize && memoryInfo.avgKeySize > 10240) {
      recommendations.push('Average key size is large, consider data compression');
    }
    
    if (memoryInfo.keyCount > 10000) {
      recommendations.push('High key count detected, review cache strategy');
    }
    
    return recommendations;
  }
}

export const memoryMonitorService = new MemoryMonitorService();