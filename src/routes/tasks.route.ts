import { Router } from "express";
import { tasksController } from "../controllers/tasks.controller";
import { authenticate } from "../middleware/auth.middleware";

/**
 * Tasks routes
 */
const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/v1/tasks/calendar:
 *   get:
 *     summary: Get tasks for calendar view
 *     description: Retrieve tasks within a date range formatted for calendar display
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the period (YYYY-MM-DD)
 *         example: "2025-01-01"
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the period (YYYY-MM-DD)
 *         example: "2025-01-31"
 *     responses:
 *       200:
 *         description: Tasks retrieved successfully
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
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "task-123"
 *                           title:
 *                             type: string
 *                             example: "Développement feature X"
 *                           workPeriod:
 *                             type: object
 *                             properties:
 *                               startDate:
 *                                 type: string
 *                                 format: date-time
 *                               endDate:
 *                                 type: string
 *                                 format: date-time
 *                           assignedMembers:
 *                             type: array
 *                             items:
 *                               type: string
 *                           projectId:
 *                             type: string
 *                           clientId:
 *                             type: string
 *                           taskType:
 *                             type: string
 *                             enum: [task, holiday, remote]
 *                           status:
 *                             type: string
 *                             enum: [not_started, in_progress, completed]
 *                           notes:
 *                             type: string
 *                           billedHours:
 *                             type: number
 *                           actualHours:
 *                             type: number
 *                     cacheHit:
 *                       type: boolean
 *                       example: true
 *                     period:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date
 *                         end:
 *                           type: string
 *                           format: date
 *                 meta:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                       example: 15
 *                     cached:
 *                       type: boolean
 *                       example: true
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid query parameters"
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       429:
 *         description: Rate limit exceeded (Notion API)
 *       500:
 *         description: Internal server error
 *       503:
 *         description: Notion service temporarily unavailable
 */
router.get("/calendar", tasksController.getCalendarTasks);

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   get:
 *     summary: Get a single task by ID
 *     description: Retrieve detailed information about a specific task (Not implemented yet)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *         example: "task-123"
 *     responses:
 *       501:
 *         description: Not implemented yet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Not implemented yet"
 */
router.get("/:id", tasksController.getTaskById);

export default router;