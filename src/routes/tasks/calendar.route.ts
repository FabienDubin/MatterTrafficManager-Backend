import { Router } from "express";
import { tasksCalendarController } from "../../controllers/tasks/tasks-calendar.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

/**
 * Calendar Routes for Tasks
 */

/**
 * @swagger
 * /api/v1/tasks/calendar:
 *   get:
 *     summary: Get tasks for calendar view
 *     description: Retrieve tasks within a date range formatted for calendar display with enriched data
 *     tags: [Tasks - Calendar]
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
 *                           status:
 *                             type: string
 *                             enum: [not_started, in_progress, completed]
 *                           taskType:
 *                             type: string
 *                             enum: [task, holiday, school, remote]
 *                           syncStatus:
 *                             type: object
 *                             properties:
 *                               synced:
 *                                 type: boolean
 *                               lastSync:
 *                                 type: string
 *                                 format: date-time
 *                               conflicts:
 *                                 type: object
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
 *                     syncStatus:
 *                       type: object
 *                       properties:
 *                         synced:
 *                           type: boolean
 *                         lastSync:
 *                           type: string
 *                           format: date-time
 *                         hasConflicts:
 *                           type: boolean
 *                         conflictCount:
 *                           type: number
 *                 meta:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                       example: 25
 *                     cached:
 *                       type: boolean
 *                       example: true
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid query parameters or date range
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
 *                   example: "startDate must be before endDate"
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Notion service temporarily unavailable
 *       500:
 *         description: Server error
 */
router.get(
  "/",
  authenticate,
  tasksCalendarController.getCalendarTasks
);

export { router as tasksCalendarRouter };