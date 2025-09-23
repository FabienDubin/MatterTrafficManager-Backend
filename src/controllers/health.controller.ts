import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { redisService } from '../services/redis.service';
import { SyncLogModel } from '../models/SyncLog.model';
import { cacheMetricsService } from '../services/cache-metrics.service';
import { memoryMonitorService } from '../services/memory-monitor.service';

export class HealthController {
  /**
   * Basic health check endpoint
   */
  check = async (_req: Request, res: Response): Promise<void> => {
    try {
      const checks = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          mongodb: await this.checkMongoDB(),
          redis: await this.checkRedis(),
          webhooks: await this.checkWebhooks(),
        },
      };

      const allHealthy = Object.values(checks.services).every(
        service => service.status === 'healthy'
      );

      res.status(allHealthy ? 200 : 503).json(checks);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Check MongoDB connection
   */
  private async checkMongoDB(): Promise<{ status: string; message?: string }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { status: 'unhealthy', message: 'Not connected' };
      }
      
      // Ping the database
      await mongoose.connection.db?.admin().ping();
      return { status: 'healthy' };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Check Redis connection
   */
  private async checkRedis(): Promise<{ status: string; message?: string }> {
    return await redisService.healthCheck();
  }

  /**
   * Check webhook status (last webhook received)
   */
  private async checkWebhooks(): Promise<{ status: string; lastReceived?: string }> {
    try {
      const lastWebhook = await SyncLogModel.findOne({
        syncMethod: 'webhook',
        syncStatus: 'success',
      })
        .sort({ createdAt: -1 })
        .select('createdAt');

      if (!lastWebhook) {
        return { status: 'waiting', lastReceived: 'never' };
      }

      const hoursSinceLastWebhook = 
        (Date.now() - lastWebhook.createdAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastWebhook > 24) {
        return { 
          status: 'stale', 
          lastReceived: lastWebhook.createdAt.toISOString() 
        };
      }

      return { 
        status: 'healthy', 
        lastReceived: lastWebhook.createdAt.toISOString() 
      };
    } catch (error) {
      return { status: 'error', lastReceived: 'unknown' };
    }
  }

  /**
   * Get cache performance metrics
   */
  getMetrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const metrics = cacheMetricsService.getMetrics();
      const memoryEstimate = cacheMetricsService.getMemoryEstimate();
      
      // Format for frontend consumption
      const formattedResponse = {
        success: true,
        data: {
          summary: {
            status: this.getHealthStatus(metrics.overall.hitRate, memoryEstimate.warningLevel),
            hitRateDisplay: `${metrics.overall.hitRate.toFixed(1)}%`,
            totalRequests: metrics.overall.totalRequests,
            avgResponseDisplay: `${metrics.overall.avgResponseTime.toFixed(1)}ms`,
            memoryUsage: `${memoryEstimate.estimatedSizeMB}MB / 256MB`,
            memoryWarning: memoryEstimate.warningLevel,
          },
          charts: {
            entityBreakdown: Object.entries(metrics.byEntity).map(([entity, data]: [string, any]) => ({
              entity,
              hits: data.hits,
              misses: data.misses,
              hitRate: data.hitRate.toFixed(1),
            })),
            performanceMetrics: [
              { label: 'P50', value: metrics.performance.p50ResponseTimeMs },
              { label: 'P95', value: metrics.performance.p95ResponseTimeMs },
              { label: 'P99', value: metrics.performance.p99ResponseTimeMs },
            ],
          },
          alerts: this.generateAlerts(metrics, memoryEstimate),
          raw: metrics, // Keep raw data for advanced users
          timestamp: new Date().toISOString(),
        },
      };
      
      res.json(formattedResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve metrics',
      });
    }
  };

  private getHealthStatus(hitRate: number, memoryWarning: string): string {
    if (memoryWarning === 'critical' || hitRate < 50) return 'critical';
    if (memoryWarning === 'warning' || hitRate < 70) return 'warning';
    return 'healthy';
  }

  private generateAlerts(metrics: any, memoryEstimate: any): string[] {
    const alerts: string[] = [];
    
    if (metrics.overall.hitRate < 50) {
      alerts.push(`Low cache hit rate: ${metrics.overall.hitRate.toFixed(1)}%`);
    }
    
    if (memoryEstimate.warningLevel === 'critical') {
      alerts.push(`Critical memory usage: ${memoryEstimate.estimatedSizeMB}MB`);
    } else if (memoryEstimate.warningLevel === 'warning') {
      alerts.push(`High memory usage: ${memoryEstimate.estimatedSizeMB}MB`);
    }
    
    if (metrics.performance.p95ResponseTimeMs > 100) {
      alerts.push(`Slow response times: P95 = ${metrics.performance.p95ResponseTimeMs}ms`);
    }
    
    return alerts;
  }

  /**
   * Get Redis memory usage details
   */
  getMemory = async (_req: Request, res: Response): Promise<void> => {
    try {
      const memoryStats = await memoryMonitorService.getDetailedStats();
      
      res.json({
        success: true,
        data: memoryStats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve memory stats',
      });
    }
  };

  /**
   * Force memory eviction if needed
   */
  forceEviction = async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await memoryMonitorService.performEviction();
      
      res.json({
        success: true,
        message: `Evicted ${result.evictedKeys} cache entries`,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to perform eviction',
      });
    }
  };
}