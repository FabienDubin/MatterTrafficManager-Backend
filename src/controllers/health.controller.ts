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
}