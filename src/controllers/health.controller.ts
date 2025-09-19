import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { redisService } from '../services/redis.service';
import { SyncLogModel } from '../models/SyncLog.model';

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
}