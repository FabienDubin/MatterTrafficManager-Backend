import { Router } from "express";
import { tasksConflictController } from "../../controllers/tasks/tasks-conflict.controller";
import { authenticate } from "../../middleware/auth.middleware";

/**
 * Task conflicts routes
 */
const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/v1/tasks/{id}/conflicts:
 *   get:
 *     summary: Check conflicts for a specific task
 *     description: Get all scheduling conflicts for a task (overlaps, holidays, overload)
 *     tags: [Tasks - Conflicts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Conflicts checked successfully
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
 *                     taskId:
 *                       type: string
 *                     conflicts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [overlap, holiday, school, overload]
 *                           message:
 *                             type: string
 *                           memberId:
 *                             type: string
 *                           memberName:
 *                             type: string
 *                           conflictingTaskId:
 *                             type: string
 *                           conflictingTaskTitle:
 *                             type: string
 *                           severity:
 *                             type: string
 *                             enum: [low, medium, high]
 *                     hasConflicts:
 *                       type: boolean
 *       404:
 *         description: Task not found
 *       500:
 *         description: Failed to check conflicts
 */
router.get("/:id/conflicts", tasksConflictController.checkTaskConflicts);

/**
 * @swagger
 * /api/v1/tasks/conflicts/preview:
 *   post:
 *     summary: Preview conflicts before saving a task
 *     description: Check what conflicts would occur with the provided task data
 *     tags: [Tasks - Conflicts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assignedMembers
 *               - workPeriod
 *             properties:
 *               assignedMembers:
 *                 type: array
 *                 items:
 *                   type: string
 *               workPeriod:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date-time
 *                   endDate:
 *                     type: string
 *                     format: date-time
 *               taskType:
 *                 type: string
 *                 enum: [task, holiday, school, remote]
 *     responses:
 *       200:
 *         description: Conflict preview generated
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
 *                     conflicts:
 *                       type: array
 *                     hasConflicts:
 *                       type: boolean
 *                     severity:
 *                       type: string
 *                       enum: [low, medium, high]
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Failed to preview conflicts
 */
router.post("/conflicts/preview", tasksConflictController.previewConflicts);

/**
 * @swagger
 * /api/v1/tasks/conflicts/batch:
 *   post:
 *     summary: Check conflicts for multiple tasks
 *     description: Batch check scheduling conflicts for multiple tasks
 *     tags: [Tasks - Conflicts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskIds
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of task IDs to check
 *     responses:
 *       200:
 *         description: Batch conflict check completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: object
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Failed to batch check conflicts
 */
router.post("/conflicts/batch", tasksConflictController.batchCheckConflicts);

/**
 * @swagger
 * /api/v1/tasks/conflicts/stats:
 *   get:
 *     summary: Get conflict statistics
 *     description: Get statistics about conflicts for a date range
 *     tags: [Tasks - Conflicts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Conflict statistics retrieved
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
 *                     totalConflicts:
 *                       type: number
 *                     conflictsByType:
 *                       type: object
 *                       properties:
 *                         overlap:
 *                           type: number
 *                         holiday:
 *                           type: number
 *                         school:
 *                           type: number
 *                         overload:
 *                           type: number
 *                     membersWithConflictsCount:
 *                       type: number
 *                     dateRange:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                         endDate:
 *                           type: string
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Failed to get conflict statistics
 */
router.get("/conflicts/stats", tasksConflictController.getConflictStats);

export default router;