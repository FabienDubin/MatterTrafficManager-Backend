/**
 * Service for tracking cache performance metrics
 */

import logger from '../config/logger.config';

interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  avgResponseTime: number;
  lastResetAt: Date;
  entityMetrics: Map<string, EntityMetric>;
}

interface EntityMetric {
  hits: number;
  misses: number;
  avgResponseTime: number;
  responseTimes: number[];
}

class CacheMetricsService {
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalRequests: 0,
    avgResponseTime: 0,
    lastResetAt: new Date(),
    entityMetrics: new Map(),
  };

  private responseTimes: number[] = [];
  private readonly maxResponseTimeSamples = 1000;

  /**
   * Record a cache hit
   */
  recordHit(entityType: string, responseTime: number): void {
    this.metrics.hits++;
    this.metrics.totalRequests++;
    this.recordResponseTime(responseTime);
    this.updateEntityMetric(entityType, true, responseTime);
    this.updateHitRate();
  }

  /**
   * Record a cache miss
   */
  recordMiss(entityType: string, responseTime: number): void {
    this.metrics.misses++;
    this.metrics.totalRequests++;
    this.recordResponseTime(responseTime);
    this.updateEntityMetric(entityType, false, responseTime);
    this.updateHitRate();
  }

  /**
   * Record response time
   */
  private recordResponseTime(time: number): void {
    this.responseTimes.push(time);
    
    // Keep only last N samples to avoid memory issues
    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes = this.responseTimes.slice(-this.maxResponseTimeSamples);
    }
    
    // Update average
    this.metrics.avgResponseTime = 
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  /**
   * Update metrics for specific entity type
   */
  private updateEntityMetric(entityType: string, isHit: boolean, responseTime: number): void {
    if (!this.metrics.entityMetrics.has(entityType)) {
      this.metrics.entityMetrics.set(entityType, {
        hits: 0,
        misses: 0,
        avgResponseTime: 0,
        responseTimes: [],
      });
    }

    const entityMetric = this.metrics.entityMetrics.get(entityType)!;
    
    if (isHit) {
      entityMetric.hits++;
    } else {
      entityMetric.misses++;
    }
    
    entityMetric.responseTimes.push(responseTime);
    
    // Keep only last 100 samples per entity
    if (entityMetric.responseTimes.length > 100) {
      entityMetric.responseTimes = entityMetric.responseTimes.slice(-100);
    }
    
    entityMetric.avgResponseTime = 
      entityMetric.responseTimes.reduce((a, b) => a + b, 0) / entityMetric.responseTimes.length;
  }

  /**
   * Update hit rate percentage
   */
  private updateHitRate(): void {
    if (this.metrics.totalRequests > 0) {
      this.metrics.hitRate = (this.metrics.hits / this.metrics.totalRequests) * 100;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): any {
    const entityMetricsObj: Record<string, any> = {};
    
    this.metrics.entityMetrics.forEach((value, key) => {
      entityMetricsObj[key] = {
        hits: value.hits,
        misses: value.misses,
        hitRate: value.hits + value.misses > 0 
          ? (value.hits / (value.hits + value.misses)) * 100 
          : 0,
        avgResponseTime: Math.round(value.avgResponseTime * 100) / 100,
      };
    });

    return {
      overall: {
        hits: this.metrics.hits,
        misses: this.metrics.misses,
        hitRate: Math.round(this.metrics.hitRate * 100) / 100,
        totalRequests: this.metrics.totalRequests,
        avgResponseTime: Math.round(this.metrics.avgResponseTime * 100) / 100,
        lastResetAt: this.metrics.lastResetAt,
      },
      byEntity: entityMetricsObj,
      performance: {
        avgResponseTimeMs: Math.round(this.metrics.avgResponseTime * 100) / 100,
        p50ResponseTimeMs: this.getPercentile(50),
        p95ResponseTimeMs: this.getPercentile(95),
        p99ResponseTimeMs: this.getPercentile(99),
      },
    };
  }

  /**
   * Get percentile response time
   */
  private getPercentile(percentile: number): number {
    if (this.responseTimes.length === 0) return 0;
    
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    const value = sorted[Math.max(0, index)];
    return value ? Math.round(value * 100) / 100 : 0;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    logger.info('Resetting cache metrics');
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      lastResetAt: new Date(),
      entityMetrics: new Map(),
    };
    this.responseTimes = [];
  }

  /**
   * Get memory usage estimate (for Upstash monitoring)
   */
  getMemoryEstimate(): { estimatedSizeMB: number; warningLevel: string } {
    // Rough estimate based on number of cached items
    const estimatedItems = this.metrics.totalRequests * 0.3; // Assume 30% are unique items
    const avgItemSize = 5; // KB per item (rough estimate)
    const estimatedSizeMB = (estimatedItems * avgItemSize) / 1024;
    
    let warningLevel = 'ok';
    if (estimatedSizeMB > 200) warningLevel = 'critical';
    else if (estimatedSizeMB > 150) warningLevel = 'warning';
    
    return {
      estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      warningLevel,
    };
  }
}

export const cacheMetricsService = new CacheMetricsService();