/**
 * Service for tracking latency metrics between Redis and Notion
 * Subtask 2.4: Add latency metrics for Redis vs Notion
 */

import logger from '../config/logger.config';
import { redisService } from './redis.service';

interface LatencyMetrics {
  redis: {
    count: number;
    totalTime: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    p95Time: number;
    p99Time: number;
    samples: number[];
  };
  notion: {
    count: number;
    totalTime: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    p95Time: number;
    p99Time: number;
    samples: number[];
  };
  comparison: {
    avgSpeedup: number;
    notionSlowerThanThreshold: number; // Count of Notion calls > 100ms
    redisSlowerThanThreshold: number;  // Count of Redis calls > 10ms
  };
  lastUpdated: Date;
}

class LatencyMetricsService {
  private metrics: LatencyMetrics = this.initMetrics();
  private readonly REDIS_THRESHOLD_MS = 10;
  private readonly NOTION_THRESHOLD_MS = 100;
  private readonly MAX_SAMPLES = 1000;
  private readonly METRICS_TTL = 3600; // 1 hour in Redis

  private initMetrics(): LatencyMetrics {
    return {
      redis: {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p95Time: 0,
        p99Time: 0,
        samples: []
      },
      notion: {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p95Time: 0,
        p99Time: 0,
        samples: []
      },
      comparison: {
        avgSpeedup: 0,
        notionSlowerThanThreshold: 0,
        redisSlowerThanThreshold: 0
      },
      lastUpdated: new Date()
    };
  }

  /**
   * Record Redis operation latency
   */
  recordRedisLatency(operationTime: number, operation: string = 'unknown'): void {
    this.updateMetrics('redis', operationTime);

    // Log warning if Redis is slow
    if (operationTime > this.REDIS_THRESHOLD_MS) {
      logger.warn(`⚠️ Slow Redis operation detected`, {
        operation,
        latency: `${operationTime}ms`,
        threshold: `${this.REDIS_THRESHOLD_MS}ms`,
        severity: operationTime > 50 ? 'high' : 'medium'
      });
      this.metrics.comparison.redisSlowerThanThreshold++;
    }

    // Update in Redis for dashboard
    this.persistMetrics();
  }

  /**
   * Record Notion API latency
   */
  recordNotionLatency(operationTime: number, operation: string = 'unknown'): void {
    this.updateMetrics('notion', operationTime);

    // Log warning if Notion is slow
    if (operationTime > this.NOTION_THRESHOLD_MS) {
      logger.warn(`⚠️ Slow Notion operation detected`, {
        operation,
        latency: `${operationTime}ms`,
        threshold: `${this.NOTION_THRESHOLD_MS}ms`,
        severity: operationTime > 1000 ? 'high' : 'medium',
        recommendation: 'Consider using async mode for better performance'
      });
      this.metrics.comparison.notionSlowerThanThreshold++;
    }

    // Update speedup comparison
    this.updateComparison();

    // Update in Redis for dashboard
    this.persistMetrics();
  }

  /**
   * Record sync queue processing latency
   */
  recordQueueLatency(queueTime: number, syncTime: number, operation: string): void {
    const totalTime = queueTime + syncTime;
    
    logger.info(`📊 Queue operation metrics`, {
      operation,
      queueTime: `${queueTime}ms`,
      syncTime: `${syncTime}ms`,
      totalTime: `${totalTime}ms`,
      mode: totalTime < 100 ? '✅ FAST' : '⚠️ SLOW'
    });

    // Track both individually
    this.recordRedisLatency(queueTime, `queue-${operation}`);
    
    if (syncTime > 0) {
      this.recordNotionLatency(syncTime, `sync-${operation}`);
    }
  }

  /**
   * Update metrics for a service
   */
  private updateMetrics(service: 'redis' | 'notion', time: number): void {
    const metric = this.metrics[service];
    
    metric.count++;
    metric.totalTime += time;
    metric.avgTime = metric.totalTime / metric.count;
    metric.minTime = Math.min(metric.minTime, time);
    metric.maxTime = Math.max(metric.maxTime, time);
    
    // Add to samples
    metric.samples.push(time);
    if (metric.samples.length > this.MAX_SAMPLES) {
      metric.samples = metric.samples.slice(-this.MAX_SAMPLES);
    }
    
    // Calculate percentiles
    metric.p95Time = this.getPercentile(metric.samples, 95);
    metric.p99Time = this.getPercentile(metric.samples, 99);
    
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Update comparison metrics
   */
  private updateComparison(): void {
    if (this.metrics.redis.avgTime > 0 && this.metrics.notion.avgTime > 0) {
      this.metrics.comparison.avgSpeedup = 
        Math.round(this.metrics.notion.avgTime / this.metrics.redis.avgTime);
    }
  }

  /**
   * Calculate percentile from samples
   */
  private getPercentile(samples: number[], percentile: number): number {
    if (samples.length === 0) return 0;
    
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  /**
   * Get current metrics
   */
  getMetrics(): any {
    return {
      redis: {
        count: this.metrics.redis.count,
        avgLatency: Math.round(this.metrics.redis.avgTime * 100) / 100,
        minLatency: this.metrics.redis.minTime === Infinity ? 0 : Math.round(this.metrics.redis.minTime * 100) / 100,
        maxLatency: Math.round(this.metrics.redis.maxTime * 100) / 100,
        p95Latency: Math.round(this.metrics.redis.p95Time * 100) / 100,
        p99Latency: Math.round(this.metrics.redis.p99Time * 100) / 100,
        slowOperations: this.metrics.comparison.redisSlowerThanThreshold,
        threshold: this.REDIS_THRESHOLD_MS
      },
      notion: {
        count: this.metrics.notion.count,
        avgLatency: Math.round(this.metrics.notion.avgTime * 100) / 100,
        minLatency: this.metrics.notion.minTime === Infinity ? 0 : Math.round(this.metrics.notion.minTime * 100) / 100,
        maxLatency: Math.round(this.metrics.notion.maxTime * 100) / 100,
        p95Latency: Math.round(this.metrics.notion.p95Time * 100) / 100,
        p99Latency: Math.round(this.metrics.notion.p99Time * 100) / 100,
        slowOperations: this.metrics.comparison.notionSlowerThanThreshold,
        threshold: this.NOTION_THRESHOLD_MS
      },
      comparison: {
        avgSpeedup: `${this.metrics.comparison.avgSpeedup}x`,
        redisVsNotion: this.metrics.redis.avgTime > 0 && this.metrics.notion.avgTime > 0
          ? `Redis is ${Math.round(this.metrics.notion.avgTime / this.metrics.redis.avgTime)}x faster`
          : 'Insufficient data',
        recommendation: this.getRecommendation()
      },
      lastUpdated: this.metrics.lastUpdated.toISOString()
    };
  }

  /**
   * Get performance recommendation based on metrics
   */
  private getRecommendation(): string {
    const notionSlowRate = this.metrics.notion.count > 0 
      ? (this.metrics.comparison.notionSlowerThanThreshold / this.metrics.notion.count) * 100
      : 0;

    if (notionSlowRate > 80) {
      return '🔴 Critical: Enable async mode for all operations';
    } else if (notionSlowRate > 50) {
      return '🟡 Warning: Consider using async mode for write operations';
    } else if (this.metrics.redis.avgTime > 5) {
      return '🟡 Warning: Redis latency is higher than expected';
    }
    return '🟢 Performance is optimal';
  }

  /**
   * Persist metrics to Redis for dashboard
   */
  private async persistMetrics(): Promise<void> {
    try {
      await redisService.set(
        'metrics:latency:latest',
        this.getMetrics(),
        'metrics'
      );

      // Also store hourly snapshot
      const hourKey = `metrics:latency:${new Date().toISOString().slice(0, 13)}`;
      await redisService.set(
        hourKey,
        this.getMetrics(),
        'metrics'
      );
    } catch (error) {
      logger.error('Failed to persist latency metrics', error);
    }
  }

  /**
   * Get historical metrics from Redis
   */
  async getHistoricalMetrics(hours: number = 24): Promise<any[]> {
    const metrics = [];
    const now = new Date();

    for (let i = 0; i < hours; i++) {
      const hourDate = new Date(now.getTime() - i * 3600000);
      const hourKey = `metrics:latency:${hourDate.toISOString().slice(0, 13)}`;
      
      try {
        const data = await redisService.get(hourKey);
        if (data) {
          metrics.push({
            hour: hourDate.toISOString(),
            ...data
          });
        }
      } catch (error) {
        // Skip missing hours
      }
    }

    return metrics;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    logger.info('Resetting latency metrics');
    this.metrics = this.initMetrics();
  }
}

// Singleton
export const latencyMetricsService = new LatencyMetricsService();
export default latencyMetricsService;