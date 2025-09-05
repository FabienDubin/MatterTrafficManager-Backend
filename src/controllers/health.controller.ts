import { Request, Response, NextFunction } from 'express';
import { healthService } from '../services/health.service';
import logger from '../config/logger.config';

/**
 * Health check controller
 * Handles /api/v1/health endpoint according to layered architecture
 */
export class HealthController {
  /**
   * Get system health status
   * @route GET /api/v1/health
   */
  static async getHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const healthData = await healthService.getSystemHealth();
      
      logger.info('Health check requested', {
        timestamp: healthData.timestamp,
        status: healthData.status
      });

      res.status(200).json(healthData);
    } catch (error) {
      logger.error('Health check failed', { error });
      next(error);
    }
  }

  /**
   * Check if service is ready (all dependencies accessible)
   * @route GET /api/v1/health/ready
   */
  static async getReady(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const readyData = await healthService.getReadyStatus();
      const statusCode = readyData.ready ? 200 : 503;
      
      logger.info('Ready check requested', {
        timestamp: readyData.timestamp,
        ready: readyData.ready
      });

      res.status(statusCode).json(readyData);
    } catch (error) {
      logger.error('Ready check failed', { error });
      next(error);
    }
  }

  /**
   * Get version information
   * @route GET /api/v1/health/version
   */
  static async getVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const versionData = healthService.getVersionInfo();
      
      logger.info('Version info requested');

      res.status(200).json(versionData);
    } catch (error) {
      logger.error('Version info failed', { error });
      next(error);
    }
  }
}