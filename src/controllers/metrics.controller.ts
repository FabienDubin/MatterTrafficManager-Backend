/**
 * Controller for metrics endpoints
 * Subtask 2.4: Expose latency metrics
 */

import { Request, Response } from "express";
import { cacheMetricsService } from "../services/cache-metrics.service";
import { latencyMetricsService } from "../services/latency-metrics.service";
import syncQueueService from "../services/sync-queue.service";
import { activityTracker } from "../services/activity-tracker.service";

export class MetricsController {
  /**
   * Get cache performance metrics
   * GET /api/metrics/cache
   */
  async getCacheMetrics(_req: Request, res: Response) {
    try {
      const metrics = cacheMetricsService.getMetrics();
      
      return res.status(200).json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching cache metrics:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch cache metrics"
      });
    }
  }

  /**
   * Get latency comparison metrics (Redis vs Notion)
   * GET /api/metrics/latency
   */
  async getLatencyMetrics(_req: Request, res: Response) {
    try {
      const metrics = latencyMetricsService.getMetrics();
      
      return res.status(200).json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching latency metrics:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch latency metrics"
      });
    }
  }

  /**
   * Get historical latency metrics
   * GET /api/metrics/latency/history?hours=24
   */
  async getLatencyHistory(req: Request, res: Response) {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const history = await latencyMetricsService.getHistoricalMetrics(hours);
      
      return res.status(200).json({
        success: true,
        data: {
          hours,
          metrics: history
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching latency history:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch latency history"
      });
    }
  }

  /**
   * Get sync queue metrics
   * GET /api/metrics/queue
   */
  async getQueueMetrics(_req: Request, res: Response) {
    try {
      const status = syncQueueService.getStatus();
      
      return res.status(200).json({
        success: true,
        data: {
          queue: {
            length: status.queueLength,
            processing: status.processing
          },
          performance: {
            processed: status.metrics.processed,
            failed: status.metrics.failed,
            retries: status.metrics.retries,
            avgProcessingTime: Math.round(status.metrics.avgProcessingTime * 100) / 100
          },
          items: status.items
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching queue metrics:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch queue metrics"
      });
    }
  }

  /**
   * Get combined performance dashboard data
   * GET /api/metrics/dashboard
   */
  async getDashboard(_req: Request, res: Response) {
    try {
      const cache = cacheMetricsService.getMetrics();
      const latency = latencyMetricsService.getMetrics();
      const queue = syncQueueService.getStatus();
      
      return res.status(200).json({
        success: true,
        data: {
          cache: {
            hitRate: cache.overall.hitRate,
            avgResponseTime: cache.overall.avgResponseTime,
            totalRequests: cache.overall.totalRequests
          },
          latency: {
            redis: latency.redis,
            notion: latency.notion,
            comparison: latency.comparison
          },
          queue: {
            length: queue.queueLength,
            processed: queue.metrics.processed,
            failed: queue.metrics.failed,
            avgProcessingTime: Math.round(queue.metrics.avgProcessingTime * 100) / 100
          },
          memory: cacheMetricsService.getMemoryEstimate()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard data"
      });
    }
  }

  /**
   * Reset all metrics
   * POST /api/metrics/reset
   */
  async resetMetrics(req: Request, res: Response) {
    try {
      // Reset based on type parameter
      const type = req.query.type as string;
      
      if (!type || type === 'all') {
        cacheMetricsService.resetMetrics();
        latencyMetricsService.reset();
        syncQueueService.clearQueue();
        
        return res.status(200).json({
          success: true,
          message: "All metrics have been reset"
        });
      }
      
      switch (type) {
        case 'cache':
          cacheMetricsService.resetMetrics();
          break;
        case 'latency':
          latencyMetricsService.reset();
          break;
        case 'queue':
          syncQueueService.clearQueue();
          break;
        default:
          return res.status(400).json({
            success: false,
            error: `Invalid metric type: ${type}. Use 'cache', 'latency', 'queue', or 'all'`
          });
      }
      
      return res.status(200).json({
        success: true,
        message: `${type} metrics have been reset`
      });
    } catch (error) {
      console.error("Error resetting metrics:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to reset metrics"
      });
    }
  }

  /**
   * Get active users
   * GET /api/metrics/active-users
   */
  async getActiveUsers(_req: Request, res: Response) {
    try {
      const activeUsers = activityTracker.getActiveUsers();
      
      return res.status(200).json({
        success: true,
        data: activeUsers,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching active users:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch active users"
      });
    }
  }

  /**
   * Get request rate metrics
   * GET /api/metrics/request-rate
   */
  async getRequestRate(_req: Request, res: Response) {
    try {
      const requestRate = activityTracker.getRequestRate();
      
      return res.status(200).json({
        success: true,
        data: requestRate,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching request rate:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch request rate"
      });
    }
  }

  /**
   * Get recent errors
   * GET /api/metrics/errors
   */
  async getRecentErrors(_req: Request, res: Response) {
    try {
      const errors = activityTracker.getRecentErrors();
      
      return res.status(200).json({
        success: true,
        data: errors,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching recent errors:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch recent errors"
      });
    }
  }
}

export const metricsController = new MetricsController();