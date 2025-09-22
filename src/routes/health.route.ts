import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

const router = Router();
const healthController = new HealthController();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags: [Health]
 *     summary: Check application health
 *     description: Returns the health status of the application and its services
 *     responses:
 *       200:
 *         description: Application is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy, error]
 *                   description: Overall health status
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp of the health check
 *                 uptime:
 *                   type: number
 *                   description: Application uptime in seconds
 *                 services:
 *                   type: object
 *                   properties:
 *                     mongodb:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [healthy, unhealthy]
 *                         message:
 *                           type: string
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [healthy, unhealthy]
 *                         message:
 *                           type: string
 *                     webhooks:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [healthy, waiting, stale, error]
 *                         lastReceived:
 *                           type: string
 *       503:
 *         description: One or more services are unhealthy
 */
router.get('/', healthController.check);

/**
 * @swagger
 * /api/v1/health/metrics:
 *   get:
 *     tags: [Health]
 *     summary: Get cache performance metrics
 *     description: Returns detailed cache performance metrics including hit rate, response times, and memory usage
 *     responses:
 *       200:
 *         description: Cache metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overall:
 *                   type: object
 *                   properties:
 *                     hits:
 *                       type: number
 *                     misses:
 *                       type: number
 *                     hitRate:
 *                       type: number
 *                     avgResponseTime:
 *                       type: number
 *                 byEntity:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                 performance:
 *                   type: object
 *                   properties:
 *                     p50ResponseTimeMs:
 *                       type: number
 *                     p95ResponseTimeMs:
 *                       type: number
 *                     p99ResponseTimeMs:
 *                       type: number
 *                 memory:
 *                   type: object
 *                   properties:
 *                     estimatedSizeMB:
 *                       type: number
 *                     warningLevel:
 *                       type: string
 */
router.get('/metrics', healthController.getMetrics);

export default router;