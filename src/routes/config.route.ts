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

/**
 * @swagger
 * /api/v1/config/teams-display:
 *   get:
 *     summary: Get teams display configuration
 *     description: Retrieve configured teams for display in filter panel with icons and colors
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Teams display configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     teams:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Notion team ID
 *                             example: "notion-team-123"
 *                           name:
 *                             type: string
 *                             description: Team name from Notion
 *                             example: "Dev Team"
 *                           icon:
 *                             type: string
 *                             description: Lucide icon name
 *                             example: "Users"
 *                           color:
 *                             type: string
 *                             description: Hex color code
 *                             example: "#3B82F6"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/teams-display', authenticate, configController.getTeamsDisplayConfig);

/**
 * @swagger
 * /api/v1/config/teams-display:
 *   put:
 *     summary: Update teams display configuration
 *     tags: [Config]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teams:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     icon:
 *                       type: string
 *                     color:
 *                       type: string
 *                     order:
 *                       type: number
 *     responses:
 *       200:
 *         description: Teams display configuration updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/teams-display', authenticate, configController.updateTeamsDisplayConfig);

export default router;