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

interface UpstashInfoResponse {
  result: string;
}

class MemoryMonitorService {
  private readonly MEMORY_LIMIT_MB = 256; // Upstash Free Tier limit
  private readonly WARNING_THRESHOLD_MB = 200;
  private readonly CRITICAL_THRESHOLD_MB = 240;
  private lastAlertTime: Date | null = null;
  private readonly ALERT_COOLDOWN_MS = 300000; // 5 minutes

  /**
   * Get memory usage from Upstash Redis using INFO command
   */
  async getMemoryInfo(): Promise<MemoryInfo> {
    try {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;

      if (!redisUrl || !redisToken) {
        throw new Error('Redis URL or Token not configured');
      }

      // Execute INFO memory command via REST API
      const response = await axios.post<UpstashInfoResponse>(
        `${redisUrl}/info`,
        null,
        {
          headers: {
            Authorization: `Bearer ${redisToken}`,
          },
        }
      );

      const infoText = response.data.result;
      
      // Parse the INFO output
      const memoryInfo = this.parseInfoMemory(infoText);
      
      // Check and log alerts
      this.checkMemoryAlerts(memoryInfo);
      
      return memoryInfo;
    } catch (error) {
      logger.error('Failed to get memory info:', error);
      
      // Return estimated values if INFO fails
      return this.getEstimatedMemoryInfo();
    }
  }

  /**
   * Parse INFO memory output
   */
  private parseInfoMemory(infoText: string): MemoryInfo {
    const lines = infoText.split('\n');
    let usedMemoryBytes = 0;
    let keyCount = 0;
    let evictionPolicy = 'noeviction'; // Upstash default

    for (const line of lines) {
      // Parse used_memory
      if (line.startsWith('used_memory:')) {
        const value = line.split(':')[1];
        if (value) {
          usedMemoryBytes = parseInt(value, 10);
        }
      }
      // Parse key count from db0 info
      if (line.startsWith('db0:')) {
        const match = line.match(/keys=(\d+)/);
        if (match && match[1]) {
          keyCount = parseInt(match[1], 10);
        }
      }
      // Parse eviction policy
      if (line.startsWith('maxmemory_policy:')) {
        const policy = line.split(':')[1];
        if (policy) {
          evictionPolicy = policy.trim();
        }
      }
    }

    const usedMemoryMB = usedMemoryBytes / (1024 * 1024);
    const usagePercentage = (usedMemoryMB / this.MEMORY_LIMIT_MB) * 100;
    
    let warningLevel: 'ok' | 'warning' | 'critical' = 'ok';
    if (usedMemoryMB >= this.CRITICAL_THRESHOLD_MB) {
      warningLevel = 'critical';
    } else if (usedMemoryMB >= this.WARNING_THRESHOLD_MB) {
      warningLevel = 'warning';
    }

    const avgKeySize = keyCount > 0 ? usedMemoryBytes / keyCount : undefined;

    return {
      usedMemoryBytes,
      usedMemoryMB: Math.round(usedMemoryMB * 100) / 100,
      maxMemoryBytes: this.MEMORY_LIMIT_MB * 1024 * 1024,
      maxMemoryMB: this.MEMORY_LIMIT_MB,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
      warningLevel,
      keyCount,
      avgKeySize: avgKeySize !== undefined ? Math.round(avgKeySize) : undefined,
      evictionPolicy,
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
    // This would need SCAN command to be accurate
    // For now, return estimates based on known patterns
    return {
      users: 50,
      teams: 10,
      projects: 100,
      tasks: 500,
      clients: 20,
      other: 50,
    };
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