import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { redisService } from '../services/redis.service';
import { SyncLogModel } from '../models/SyncLog.model';
import { cacheMetricsService } from '../services/cache-metrics.service';
import { memoryMonitorService } from '../services/memory-monitor.service';
import * as packageJson from '../../package.json';

export class HealthController {
  /**
   * Basic health check endpoint
   */
  check = async (_req: Request, res: Response): Promise<void> => {
    try {
      const mongoStatus = await this.checkMongoDB();
      const redisStatus = await this.checkRedis();
      const webhookStatus = await this.checkWebhooks();

      // Critical services: MongoDB and Redis must be healthy
      const criticalServicesHealthy =
        mongoStatus.status === 'healthy' &&
        redisStatus.status === 'healthy';

      // Webhooks are non-critical: stale/waiting is acceptable (polling fallback exists)
      const webhooksAcceptable = ['healthy', 'waiting', 'stale'].includes(webhookStatus.status);

      const overallStatus = criticalServicesHealthy && webhooksAcceptable ? 'healthy' : 'degraded';
      const httpStatus = criticalServicesHealthy ? 200 : 503;

      const checks = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: packageJson.version || '1.0.0',
        services: {
          mongodb: mongoStatus,
          redis: redisStatus,
          webhooks: {
            ...webhookStatus,
            critical: false, // Webhooks are optional, polling fallback available
          },
        },
        message: !criticalServicesHealthy
          ? 'Critical services unavailable'
          : !webhooksAcceptable
          ? 'Webhook system has issues but polling is active'
          : 'All systems operational',
      };

      res.status(httpStatus).json(checks);
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
      const memoryInfo = await memoryMonitorService.getMemoryInfo();
      
      // Format for frontend consumption - matches CacheMetrics interface
      const formattedResponse = {
        success: true,
        cache: {
          hits: metrics.overall.hits,
          misses: metrics.overall.misses,
          totalRequests: metrics.overall.totalRequests,
          avgResponseTime: metrics.overall.avgResponseTime,
          minResponseTime: metrics.performance.minResponseTimeMs || 0,
          maxResponseTime: metrics.performance.maxResponseTimeMs || 100,
          responseTimePercentiles: {
            p50: metrics.performance.p50ResponseTimeMs || 0,
            p95: metrics.performance.p95ResponseTimeMs || 0,
            p99: metrics.performance.p99ResponseTimeMs || 0,
          },
          entityMetrics: Object.entries(metrics.byEntity).reduce((acc, [key, value]: [string, any]) => {
            acc[key] = {
              hits: value.hits,
              misses: value.misses,
              requests: value.hits + value.misses,
              avgResponseTime: value.avgResponseTime,
            };
            return acc;
          }, {} as Record<string, any>),
          timestamp: new Date().toISOString(),
        },
        memory: memoryInfo,
        timestamp: new Date().toISOString(),
      };
      
      res.json(formattedResponse);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve metrics',
      });
    }
  };


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