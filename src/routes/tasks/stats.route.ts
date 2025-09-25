import { Router } from "express";
import { tasksStatsController } from "../../controllers/tasks/tasks-stats.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

/**
 * Statistics Routes for Tasks
 */

/**
 * @swagger
 * /api/v1/tasks/stats/today:
 *   get:
 *     summary: Get today's tasks statistics
 *     description: Retrieve statistics for all tasks scheduled for today, including status breakdown and task types
 *     tags: [Tasks - Statistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
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
 *                     total:
 *                       type: number
 *                       description: Total number of tasks for today
 *                       example: 12
 *                     completed:
 *                       type: number
 *                       description: Number of completed tasks
 *                       example: 5
 *                     inProgress:
 *                       type: number
 *                       description: Number of tasks in progress
 *                       example: 4
 *                     notStarted:
 *                       type: number
 *                       description: Number of tasks not started
 *                       example: 3
 *                     byType:
 *                       type: object
 *                       description: Breakdown by task type
 *                       properties:
 *                         task:
 *                           type: number
 *                           example: 8
 *                         holiday:
 *                           type: number
 *                           example: 1
 *                         school:
 *                           type: number
 *                           example: 2
 *                         remote:
 *                           type: number
 *                           example: 1
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp when statistics were calculated
 *                   example: "2025-01-25T14:30:00Z"
 *       500:
 *         description: Failed to fetch today's statistics
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
 *                   example: "Failed to fetch today's statistics"
 */
router.get(
  "/today",
  authenticate,
  tasksStatsController.getTodayStats
);

export { router as tasksStatsRouter };