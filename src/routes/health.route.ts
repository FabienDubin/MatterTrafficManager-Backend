import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

const router = Router();
const healthController = new HealthController();

/**
 * @swagger  
 * /api/v1/health/ping:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 *     description: Simple endpoint for load balancer health checks
 *     responses:
 *       200:
 *         description: Service is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 */
router.get('/ping', (req, res) => {
  res.json({ status: 'ok' });
});

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
// Sécurisé : nécessite authentification admin
router.get('/metrics', authenticate, requireAdmin, healthController.getMetrics);

/**
 * @swagger
 * /api/v1/health/memory:
 *   get:
 *     tags: [Health]
 *     summary: Get Redis memory usage details
 *     description: Returns detailed memory usage statistics from Upstash Redis
 *     responses:
 *       200:
 *         description: Memory statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                       properties:
 *                         usedMemoryMB:
 *                           type: number
 *                         maxMemoryMB:
 *                           type: number
 *                         usagePercentage:
 *                           type: number
 *                         warningLevel:
 *                           type: string
 *                           enum: [ok, warning, critical]
 *                         keyCount:
 *                           type: number
 *                     distribution:
 *                       type: object
 *                       additionalProperties:
 *                         type: number
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *       500:
 *         description: Failed to retrieve memory statistics
 */
// Sécurisé : nécessite authentification admin
router.get('/memory', authenticate, requireAdmin, healthController.getMemory);

/**
 * @swagger
 * /api/v1/health/memory/evict:
 *   post:
 *     tags: [Health]
 *     summary: Force memory eviction
 *     description: Manually trigger cache eviction to free up memory
 *     responses:
 *       200:
 *         description: Eviction performed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     evictedKeys:
 *                       type: number
 *       500:
 *         description: Failed to perform eviction
 */
// Sécurisé : nécessite authentification admin
router.post('/memory/evict', authenticate, requireAdmin, healthController.forceEviction);

export default router;