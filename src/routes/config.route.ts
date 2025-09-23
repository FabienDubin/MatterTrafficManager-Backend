import { Router } from 'express';
import configController from '../controllers/config.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/config:
 *   get:
 *     summary: Get all editable configurations
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [sync, cache, notification, general]
 *         description: Filter by category
 *     responses:
 *       200:
 *         description: Configurations retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, requireAdmin, configController.getConfigs);

/**
 * @swagger
 * /api/v1/config/{key}:
 *   get:
 *     summary: Get a single configuration value
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Configuration key
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Configuration not found
 *       500:
 *         description: Internal server error
 */
router.get('/:key', authenticate, requireAdmin, configController.getConfig);

/**
 * @swagger
 * /api/v1/config:
 *   put:
 *     summary: Update configuration values (Admin only)
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *             example:
 *               ASYNC_MODE_CREATE: true
 *               ASYNC_MODE_UPDATE: false
 *               SYNC_INTERVAL_MINUTES: 30
 *     responses:
 *       200:
 *         description: Configurations updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 *       500:
 *         description: Internal server error
 */
router.put('/', authenticate, requireAdmin, configController.updateConfigs);

/**
 * @swagger
 * /api/v1/config/init:
 *   post:
 *     summary: Initialize default configurations (Admin only)
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default configurations initialized
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 *       500:
 *         description: Internal server error
 */
router.post('/init', authenticate, requireAdmin, configController.initDefaults);

export default router;