import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { cacheController } from '../controllers/cache.controller';

const router = Router();

// All cache routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * @swagger
 * /api/v1/admin/cache/clear:
 *   post:
 *     summary: Clear all cache entries
 *     description: Removes all cached data from Redis
 *     tags: [Cache Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Cache cleared successfully
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/clear', cacheController.clearCache.bind(cacheController));

/**
 * @swagger
 * /api/v1/admin/cache/warmup:
 *   post:
 *     summary: Force cache warmup
 *     description: Initiates cache preloading for frequently accessed data
 *     tags: [Cache Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache warmup initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Cache warmup initiated
 *                 note:
 *                   type: string
 *                   example: Warmup is running in background and may take a few minutes
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/warmup', cacheController.warmupCache.bind(cacheController));

/**
 * @swagger
 * /api/v1/admin/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Returns detailed statistics about cache usage
 *     tags: [Cache Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalKeys:
 *                       type: number
 *                       example: 150
 *                     keysByPrefix:
 *                       type: object
 *                       additionalProperties:
 *                         type: number
 *                       example:
 *                         tasks: 50
 *                         members: 25
 *                         projects: 15
 *                     sampleTTL:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: string
 *                           ttl:
 *                             type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/stats', cacheController.getCacheStats.bind(cacheController));

/**
 * @swagger
 * /api/v1/admin/cache/metrics:
 *   get:
 *     summary: Get cache performance metrics
 *     description: Returns hit/miss rates and response time metrics
 *     tags: [Cache Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 cache:
 *                   type: object
 *                   properties:
 *                     hits:
 *                       type: number
 *                       example: 1250
 *                     misses:
 *                       type: number
 *                       example: 150
 *                     totalRequests:
 *                       type: number
 *                       example: 1400
 *                     avgResponseTime:
 *                       type: number
 *                       example: 42.5
 *                     minResponseTime:
 *                       type: number
 *                       example: 5
 *                     maxResponseTime:
 *                       type: number
 *                       example: 250
 *                     responseTimePercentiles:
 *                       type: object
 *                       properties:
 *                         p50:
 *                           type: number
 *                           example: 35
 *                         p95:
 *                           type: number
 *                           example: 120
 *                         p99:
 *                           type: number
 *                           example: 200
 *                     entityMetrics:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           hits:
 *                             type: number
 *                           misses:
 *                             type: number
 *                           requests:
 *                             type: number
 *                           avgResponseTime:
 *                             type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/metrics', cacheController.getCacheMetrics.bind(cacheController));

/**
 * @swagger
 * /api/v1/admin/cache/memory:
 *   get:
 *     summary: Get memory usage information
 *     description: Returns Redis/Upstash memory usage statistics
 *     tags: [Cache Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Memory usage retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 memory:
 *                   type: object
 *                   properties:
 *                     usedMemory:
 *                       type: number
 *                       example: 5242880
 *                     usedMemoryHuman:
 *                       type: string
 *                       example: 5.00M
 *                     usedMemoryPeak:
 *                       type: number
 *                       example: 6291456
 *                     usedMemoryPeakHuman:
 *                       type: string
 *                       example: 6.00M
 *                     maxMemory:
 *                       type: number
 *                       example: 104857600
 *                     maxMemoryHuman:
 *                       type: string
 *                       example: 100.00M
 *                     usedMemoryPercent:
 *                       type: number
 *                       example: 5.0
 *                     totalKeys:
 *                       type: number
 *                       example: 150
 *                     expiredKeys:
 *                       type: number
 *                       example: 25
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/memory', cacheController.getMemoryUsage.bind(cacheController));

/**
 * @swagger
 * /api/v1/admin/cache/invalidate:
 *   post:
 *     summary: Invalidate specific cache entries
 *     description: Remove specific cache entries by pattern, entity type, or entity ID
 *     tags: [Cache Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pattern:
 *                 type: string
 *                 description: Redis key pattern to match (e.g., "tasks:*")
 *                 example: tasks:*
 *               entityType:
 *                 type: string
 *                 description: Entity type to invalidate
 *                 example: tasks
 *               entityId:
 *                 type: string
 *                 description: Specific entity ID to invalidate (requires entityType)
 *                 example: abc123
 *     responses:
 *       200:
 *         description: Cache entries invalidated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invalidated 10 cache entries
 *                 deletedCount:
 *                   type: number
 *                   example: 10
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/invalidate', cacheController.invalidateCache.bind(cacheController));

export default router;