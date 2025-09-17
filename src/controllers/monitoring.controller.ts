import { Request, Response } from 'express';
import { SyncLogModel } from '../models/SyncLog.model';
import { SyncSettingsModel } from '../models/SyncSettings.model';
import { TaskModel } from '../models/Task.model';
import { ProjectModel } from '../models/Project.model';
import { MemberModel } from '../models/Member.model';
import { TeamModel } from '../models/Team.model';
import { ClientModel } from '../models/Client.model';
import { syncPollingJob } from '../jobs/syncPollingJob';
import { reconciliationJob } from '../jobs/reconciliationJob';
import logger from '../config/logger.config';
import mongoose from 'mongoose';

class MonitoringController {
  /**
   * Get overall system health
   */
  async getSystemHealth(req: Request, res: Response): Promise<Response> {
    try {
      const [
        mongoHealth,
        syncHealth,
        jobsHealth,
        cacheHealth
      ] = await Promise.all([
        this.checkMongoDBHealth(),
        this.checkSyncHealth(),
        this.checkJobsHealth(),
        this.checkCacheHealth()
      ]);

      const overallHealth = {
        status: this.calculateOverallStatus([mongoHealth, syncHealth, jobsHealth, cacheHealth]),
        timestamp: new Date().toISOString(),
        components: {
          mongodb: mongoHealth,
          synchronization: syncHealth,
          jobs: jobsHealth,
          cache: cacheHealth
        }
      };

      const statusCode = overallHealth.status === 'healthy' ? 200 : 
                        overallHealth.status === 'degraded' ? 206 : 503;

      return res.status(statusCode).json(overallHealth);
    } catch (error: any) {
      logger.error('Failed to get system health:', error);
      return res.status(503).json({
        status: 'error',
        error: error.message
      });
    }
  }

  /**
   * Get detailed sync statistics
   */
  async getSyncStatistics(req: Request, res: Response): Promise<Response> {
    try {
      const { period = '24h' } = req.query;
      const since = this.getPeriodDate(period as string);

      const [
        syncLogs,
        entityStats,
        errorStats,
        performanceStats
      ] = await Promise.all([
        SyncLogModel.find({ startTime: { $gte: since } })
          .sort({ startTime: -1 })
          .limit(100)
          .lean(),
        this.getEntityStatistics(),
        this.getErrorStatistics(since),
        this.getPerformanceStatistics(since as Date)
      ]);

      return res.json({
        success: true,
        period,
        totalSyncs: syncLogs.length,
        successRate: this.calculateSuccessRate(syncLogs),
        entityStats,
        errorStats,
        performanceStats,
        recentSyncs: syncLogs.slice(0, 10)
      });
    } catch (error: any) {
      logger.error('Failed to get sync statistics:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStatistics(req: Request, res: Response): Promise<Response> {
    try {
      const stats = await Promise.all([
        TaskModel.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              cached: { $sum: { $cond: [{ $ne: ['$lastSyncedAt', null] }, 1, 0] } },
              expired: {
                $sum: {
                  $cond: [
                    { $lt: ['$_ttl', new Date()] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ]),
        ProjectModel.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              cached: { $sum: { $cond: [{ $ne: ['$lastSyncedAt', null] }, 1, 0] } }
            }
          }
        ]),
        MemberModel.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              cached: { $sum: { $cond: [{ $ne: ['$lastSyncedAt', null] }, 1, 0] } }
            }
          }
        ])
      ]);

      const [taskStats, projectStats, memberStats] = stats;

      return res.json({
        success: true,
        cache: {
          tasks: taskStats[0] || { total: 0, cached: 0, expired: 0 },
          projects: projectStats[0] || { total: 0, cached: 0 },
          members: memberStats[0] || { total: 0, cached: 0 },
          hitRate: this.calculateCacheHitRate(stats)
        }
      });
    } catch (error: any) {
      logger.error('Failed to get cache statistics:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get job statuses
   */
  async getJobStatuses(req: Request, res: Response): Promise<Response> {
    try {
      const pollingStatus = syncPollingJob.getStatus();
      const reconciliationStatus = reconciliationJob.getStatus();

      return res.json({
        success: true,
        jobs: {
          polling: pollingStatus,
          reconciliation: reconciliationStatus
        }
      });
    } catch (error: any) {
      logger.error('Failed to get job statuses:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get circuit breaker status
   */
  async getCircuitBreakerStatus(req: Request, res: Response): Promise<Response> {
    try {
      const settings = await SyncSettingsModel.find().lean();
      
      const circuitBreakers = settings.map(s => ({
        entityType: s.entityType,
        status: s.circuitBreaker?.isOpen ? 'open' : 'closed',
        failureCount: s.circuitBreaker?.failureCount || 0,
        reopenAt: s.circuitBreaker?.reopenAt,
        threshold: (s as any).circuitBreakerThreshold || 5
      }));

      return res.json({
        success: true,
        circuitBreakers
      });
    } catch (error: any) {
      logger.error('Failed to get circuit breaker status:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Trigger manual reconciliation
   */
  async triggerReconciliation(req: Request, res: Response): Promise<Response> {
    try {
      // Start reconciliation in background
      reconciliationJob.triggerManual().catch(error => {
        logger.error('Reconciliation job failed:', error);
      });

      return res.json({
        success: true,
        message: 'Reconciliation started in background'
      });
    } catch (error: any) {
      logger.error('Failed to trigger reconciliation:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Helper methods

  private async checkMongoDBHealth(): Promise<any> {
    try {
      const state = mongoose.connection.readyState;
      const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
      
      return {
        status: state === 1 ? 'healthy' : 'unhealthy',
        state: states[state],
        latency: await this.measureMongoLatency()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: (error as Error).message
      };
    }
  }

  private async checkSyncHealth(): Promise<any> {
    const recentLogs = await SyncLogModel.find()
      .sort({ startTime: -1 })
      .limit(10)
      .lean();

    const failedCount = recentLogs.filter(log => log.syncStatus === 'failed').length;
    
    return {
      status: failedCount === 0 ? 'healthy' : failedCount < 3 ? 'degraded' : 'unhealthy',
      recentFailures: failedCount,
      lastSync: recentLogs[0]?.startTime || null
    };
  }

  private async checkJobsHealth(): Promise<any> {
    const pollingStatus = syncPollingJob.getStatus();
    const reconciliationStatus = reconciliationJob.getStatus();
    
    const hasRunningJobs = Object.values(pollingStatus).some((job: any) => job.running) ||
                          reconciliationStatus.running;

    return {
      status: hasRunningJobs ? 'healthy' : 'degraded',
      polling: pollingStatus,
      reconciliation: reconciliationStatus
    };
  }

  private async checkCacheHealth(): Promise<any> {
    const expiredCount = await TaskModel.countDocuments({
      _ttl: { $lt: new Date() }
    });

    return {
      status: expiredCount > 100 ? 'degraded' : 'healthy',
      expiredEntries: expiredCount
    };
  }

  private calculateOverallStatus(components: any[]): string {
    const hasUnhealthy = components.some(c => c.status === 'unhealthy');
    const hasDegraded = components.some(c => c.status === 'degraded');
    
    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }

  private async measureMongoLatency(): Promise<number> {
    const start = Date.now();
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }
    return Date.now() - start;
  }

  private getPeriodDate(period: string): Date {
    const now = new Date();
    const match = period.match(/^(\d+)([hdw])$/);
    
    if (!match) {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default 24h
    }

    const [, amountStr, unit] = match;
    const amount = amountStr || '24'; // Default to 24 if undefined
    const value = parseInt(amount, 10);
    
    switch (unit) {
      case 'h':
        return new Date(now.getTime() - value * 60 * 60 * 1000);
      case 'd':
        return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
      case 'w':
        return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  private async getEntityStatistics(): Promise<any> {
    const [tasks, projects, members, teams, clients] = await Promise.all([
      TaskModel.countDocuments(),
      ProjectModel.countDocuments(),
      MemberModel.countDocuments(),
      TeamModel.countDocuments(),
      ClientModel.countDocuments()
    ]);

    return { tasks, projects, members, teams, clients };
  }

  private async getErrorStatistics(since: Date): Promise<any> {
    const logs = await SyncLogModel.find({
      startTime: { $gte: since },
      syncStatus: 'failed'
    }).lean();

    const errorsByType: Record<string, number> = {};
    
    logs.forEach(log => {
      errorsByType[log.entityType] = (errorsByType[log.entityType] || 0) + 1;
    });

    return {
      total: logs.length,
      byEntityType: errorsByType
    };
  }

  private async getPerformanceStatistics(since: Date): Promise<any> {
    const stats = await SyncLogModel.aggregate([
      {
        $match: {
          startTime: { $gte: since },
          duration: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$entityType',
          avgDuration: { $avg: '$duration' },
          minDuration: { $min: '$duration' },
          maxDuration: { $max: '$duration' },
          count: { $sum: 1 }
        }
      }
    ]);

    return stats;
  }

  private calculateSuccessRate(logs: any[]): number {
    if (logs.length === 0) return 100;
    const successful = logs.filter(l => l.syncStatus === 'success').length;
    return Math.round((successful / logs.length) * 100);
  }

  private calculateCacheHitRate(stats: any[]): number {
    let totalCached = 0;
    let totalEntries = 0;
    
    stats.forEach(statArray => {
      if (statArray[0]) {
        totalCached += statArray[0].cached || 0;
        totalEntries += statArray[0].total || 0;
      }
    });

    if (totalEntries === 0) return 0;
    return Math.round((totalCached / totalEntries) * 100);
  }
}

export default new MonitoringController();