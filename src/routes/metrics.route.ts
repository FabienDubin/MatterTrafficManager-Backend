/**
 * Routes for metrics endpoints
 * Subtask 2.4: Expose latency metrics
 */

import { Router } from "express";
import { metricsController } from "../controllers/metrics.controller";
import { cacheController } from "../controllers/cache.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = Router();

// All metrics endpoints require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * @swagger
 * /api/v1/admin/metrics/cache:
 *   get:
 *     summary: Get cache performance metrics (hit/miss rates)
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache metrics retrieved successfully
 */
router.get("/cache", cacheController.getCacheMetrics.bind(cacheController));

/**
 * @swagger
 * /api/v1/admin/metrics/latency:
 *   get:
 *     summary: Get latency comparison metrics (Redis vs Notion)
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Latency metrics retrieved successfully
 */
router.get("/latency", metricsController.getLatencyMetrics.bind(metricsController));

/**
 * @swagger
 * /api/v1/admin/metrics/latency/history:
 *   get:
 *     summary: Get historical latency metrics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: number
 *           default: 24
 *         description: Number of hours of history to retrieve
 *     responses:
 *       200:
 *         description: Historical metrics retrieved successfully
 */
router.get("/latency/history", metricsController.getLatencyHistory.bind(metricsController));

/**
 * @swagger
 * /api/v1/admin/metrics/queue:
 *   get:
 *     summary: Get sync queue metrics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue metrics retrieved successfully
 */
router.get("/queue", metricsController.getQueueMetrics.bind(metricsController));

/**
 * @swagger
 * /api/v1/admin/metrics/dashboard:
 *   get:
 *     summary: Get combined performance dashboard data
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 */
router.get("/dashboard", metricsController.getDashboard.bind(metricsController));

/**
 * @swagger
 * /api/v1/admin/metrics/reset:
 *   post:
 *     summary: Reset metrics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [cache, latency, queue, all]
 *         description: Type of metrics to reset (defaults to 'all')
 *     responses:
 *       200:
 *         description: Metrics reset successfully
 */
router.post("/reset", metricsController.resetMetrics.bind(metricsController));

export default router;