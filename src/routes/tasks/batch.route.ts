import { Router } from "express";
import { tasksBatchController } from "../../controllers/tasks/tasks-batch.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

/**
 * Batch Operations Routes for Tasks
 */

/**
 * @swagger
 * /api/v1/tasks/batch:
 *   post:
 *     summary: Batch update multiple tasks
 *     description: Update multiple tasks in a single transaction with individual success/failure tracking
 *     tags: [Tasks - Batch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 description: Array of task updates to perform
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - data
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Task ID to update
 *                       example: "task-123"
 *                     data:
 *                       type: object
 *                       description: Update data for the task
 *                       properties:
 *                         title:
 *                           type: string
 *                         workPeriod:
 *                           type: object
 *                           properties:
 *                             startDate:
 *                               type: string
 *                               format: date
 *                             endDate:
 *                               type: string
 *                               format: date
 *                         assignedMembers:
 *                           type: array
 *                           items:
 *                             type: string
 *                         projectId:
 *                           type: string
 *                         taskType:
 *                           type: string
 *                           enum: [task, holiday, school, remote]
 *                         status:
 *                           type: string
 *                           enum: [not_started, in_progress, completed]
 *                         notes:
 *                           type: string
 *                         billedHours:
 *                           type: number
 *                         actualHours:
 *                           type: number
 *                         addToCalendar:
 *                           type: boolean
 *                         clientPlanning:
 *                           type: boolean
 *                 example:
 *                   - id: "task-123"
 *                     data:
 *                       status: "completed"
 *                       actualHours: 42
 *                   - id: "task-456"
 *                     data:
 *                       title: "Titre mis à jour"
 *                       status: "in_progress"
 *                   - id: "task-789"
 *                     data:
 *                       workPeriod:
 *                         startDate: "2025-02-01"
 *                         endDate: "2025-02-05"
 *     responses:
 *       200:
 *         description: All tasks updated successfully
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
 *                     successful:
 *                       type: array
 *                       description: Successfully updated tasks
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           data:
 *                             type: object
 *                     failed:
 *                       type: array
 *                       description: Failed task updates
 *                       items:
 *                         type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 3
 *                         succeeded:
 *                           type: number
 *                           example: 3
 *                         failed:
 *                           type: number
 *                           example: 0
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       207:
 *         description: Partial success (some tasks updated, some failed)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 data:
 *                   type: object
 *                   properties:
 *                     successful:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           data:
 *                             type: object
 *                     failed:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           error:
 *                             type: string
 *                             example: "Task not found"
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 3
 *                         succeeded:
 *                           type: number
 *                           example: 2
 *                         failed:
 *                           type: number
 *                           example: 1
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Failed to process batch update
 */
router.post(
  "/",
  authenticate,
  tasksBatchController.batchUpdateTasks
);

export { router as tasksBatchRouter };